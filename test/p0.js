// Bateria P0 (specs/testes.md): dinheiro, estoque e permissões — o que não pode
// errar. Roda o app de verdade, mexe pela UI e confere o resultado no banco.
//
// Cada caso é isolado: uma falha não esconde as outras. Sai com código 1 se algo falhar.
//
// Rodar: npm test (ou node test/p0.js depois de um vite build)
const { _electron } = require("playwright-core");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "estoque-p0-"));
  // Passo 22: o diálogo de arquivo não dá pra clicar daqui. O app lê/escreve
  // nestes caminhos fixos quando as env estão setadas; o teste troca o conteúdo.
  const planilhaEntrada = path.join(tmp, "importar.xlsx");
  const planilhaSaida = path.join(tmp, "exportado.xlsx");
  const app = await _electron.launch({
    args: ["."],
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env, SMOKE: "1", ESTOQUE_DB_DIR: tmp,
      ESTOQUE_PLANILHA: planilhaEntrada, ESTOQUE_PLANILHA_SAIDA: planilhaSaida,
    },
  });
  const win = await app.firstWindow();
  const erros = [];
  win.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  win.on("console", (m) => m.type() === "error" && erros.push(`console: ${m.text()}`));

  // --- helpers ---------------------------------------------------------------
  const sql = (q, p = []) => win.evaluate(([q, p]) => window.api.query(q, p), [q, p]);
  const um = async (q, p) => (await sql(q, p))[0];
  const aba = (n) => win.click(`nav button:text-is("${n}")`);
  // A busca da Venda também é onde se bipa (passo 25); a do Estoque só filtra.
  const BUSCA_VENDA = 'input[placeholder*="Bipe o código"]';
  const BUSCA_ESTOQUE = 'input[placeholder*="Buscar peça por código"]';
  // As telas só recarregam ao montar; trocar de aba e voltar força o carregar().
  const recarregar = async (alvo) => {
    await aba(alvo === "Estoque" ? "Venda" : "Estoque");
    await aba(alvo);
  };
  const login = async (nome, pin) => {
    await win.waitForSelector("text=Quem está usando?");
    await win.click(`button:has-text("${nome}")`);
    await win.fill('input[type="password"]', pin);
    await win.press('input[type="password"]', "Enter");
  };
  // codigo = o próprio nome: único e previsível, sem depender do gerador.
  const novaPeca = async (nome, qtd, compra, venda) =>
    (await sql("INSERT INTO pecas (nome, modelo, codigo, quantidade, preco_compra, preco_venda) VALUES (?,'',?,?,?,?)",
      [nome, nome, qtd, compra, venda])).lastInsertRowid;

  // Cadastro pela UI. Não clica em Concluir: o chamador decide (pode ter sido recusado).
  const cadastrar = async (nome, extras = {}) => {
    await recarregar("Estoque");
    await win.click('button:text("+ Novo produto")');
    await win.fill('label:has-text("Produto") input', nome);
    if (extras.modelo) await win.fill('label:has-text("Modelo") input', extras.modelo);
    if (extras.codigo !== undefined) await win.fill('label:has-text("Código (gerado") input', extras.codigo);
    if (extras.barras !== undefined) await win.fill('label:has-text("Código de barras") input', extras.barras);
    await win.fill('label:has-text("Quantidade") input', String(extras.qtd ?? 1));
    await win.fill('label:has-text("Preço de compra") input', extras.compra ?? "10,00");
    await win.fill('label:has-text("Preço de venda") input', extras.venda ?? "20,00");
    await win.click('button:text-is("Salvar")');
  };
  const concluir = async () => {
    await win.waitForSelector("text=adicionado", { timeout: 8000 });
    await win.click('button:text-is("Concluir")');
  };
  // Botão invisível no canto inferior direito da Config -> PIN de dev.
  const abrirDev = async () => {
    await aba("Config");
    await win.click('button[aria-hidden="true"]');
    await win.fill('input[placeholder="Senha (4 dígitos)"]', "4242");
    await win.click('button:text-is("Entrar")');
    await win.waitForSelector("text=Config de desenvolvedor", { timeout: 8000 });
  };
  const codigoDe = async (nome, modelo) =>
    (await um("SELECT codigo FROM pecas WHERE nome = ? AND modelo = ?", [nome, modelo]))?.codigo;
  const peca = (id) => um("SELECT * FROM pecas WHERE id = ?", [id]);
  const vendasDe = (id) => sql("SELECT * FROM vendas WHERE peca_id = ? ORDER BY id", [id]);

  // Passo 12: adiciona ao carrinho, ajusta a linha e vai pro fechamento do pedido.
  const aoCarrinho = async (nome, campos = {}) => {
    await win.click(`tr:has-text("${nome}") button:text-is("+ Adicionar")`);
    if (campos.qtd !== undefined) await win.fill(`input[aria-label="Quantidade de ${nome}"]`, String(campos.qtd));
    if (campos.preco !== undefined) await win.fill(`input[aria-label="Preço de ${nome}"]`, campos.preco);
  };
  const abrirVenda = async (nome, campos = {}) => {
    await recarregar("Venda");
    await aoCarrinho(nome, campos);
    await win.click('button:text("Finalizar venda")');
    if (campos.mao !== undefined) await win.fill('label:has-text("Mão de obra") input', campos.mao);
    if (campos.forma) await win.click(`button:text-is("${campos.forma}")`);
  };
  const confirmarVenda = async () => {
    await win.click('button:text("Confirmar venda")');
    await win.waitForSelector('button:text("Confirmar venda")', { state: "detached", timeout: 8000 });
  };
  // Confirma esperando que seja RECUSADO: a tela de fechamento continua aberta.
  const confirmarRecusado = async () => {
    await win.click('button:text("Confirmar venda")');
    await win.waitForTimeout(300);
    assert(await win.locator('button:text("Confirmar venda")').count(), "o fechamento deveria continuar aberto");
    await win.click('button:text-is("Cancelar venda")'); // limpa o carrinho p/ não vazar no próximo caso
  };
  const vender = async (nome, campos) => { await abrirVenda(nome, campos); await confirmarVenda(); };
  // Mesmo formato da tela, com separador de milhar: acima de R$ 1.000 um
  // toFixed() cru deixa de casar com o texto exibido.
  const reaisBR = (centavos) =>
    (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const trocarUsuario = async (nome, pin) => {
    await win.click('nav button:text-is("Sair")');
    await login(nome, pin);
    await win.waitForTimeout(300);
  };
  // Passo 13: abre o painel de desconto, escolhe o modo e aplica. pin só p/ colaborador.
  const descontar = async ({ pct, final, pin }, abrir = true) => {
    if (abrir) await win.click('button:text("Aplicar desconto")');
    if (final !== undefined) await win.click('button:text-is("Valor final")');
    await win.fill(`input[aria-label="${pct !== undefined ? "Porcentagem de desconto" : "Valor final do pedido"}"]`,
      pct !== undefined ? pct : final);
    if (pin !== undefined) await win.fill('input[aria-label="PIN de permissão"]', pin);
    await win.click('button:text-is("Aplicar")');
    await win.waitForTimeout(300);
  };
  // O cfg só chega na Venda pelo App, que relê ao gravar: tem que passar pelo checkbox.
  const ligarNota = async (on) => {
    await aba("Config");
    const cb = win.locator('label:has-text("Gerar nota após a venda") input[type="checkbox"]');
    if ((await cb.isChecked()) !== on) await cb.click();
    await win.waitForTimeout(200);
  };

  let falhas = 0;
  const caso = async (nome, fn) => {
    try {
      await fn();
      console.log(`  ok    ${nome}`);
    } catch (e) {
      falhas++;
      console.log(`  FALHA ${nome}\n        ${String(e.message).split("\n")[0]}`);
    }
  };

  try {
    await login("Administrador", "1234");
    await win.waitForSelector("text=+ Novo produto");

    console.log("\nVenda");

    await caso("1. venda simples baixa estoque e grava custo congelado", async () => {
      const id = await novaPeca("P01", 5, 10000, 20000);
      await vender("P01");
      assert.strictEqual((await peca(id)).quantidade, 4, "estoque deveria cair para 4");
      const [v] = await vendasDe(id);
      assert.strictEqual(v.quantidade, 1);
      assert.strictEqual(v.preco_venda, 20000);
      assert.strictEqual(v.preco_compra, 10000, "custo tem que ser copiado da peça");
      assert.strictEqual(v.mao_de_obra, 0);
    });

    await caso("2. venda de 3 unidades baixa 3 do estoque", async () => {
      const id = await novaPeca("P02", 5, 10000, 20000);
      await vender("P02", { qtd: 3 });
      assert.strictEqual((await peca(id)).quantidade, 2);
      const [v] = await vendasDe(id);
      assert.strictEqual(v.quantidade, 3);
      assert.strictEqual(v.preco_venda * v.quantidade + v.mao_de_obra, 60000, "total deveria ser R$ 600,00");
    });

    await caso("3. quantidade maior que o estoque é recusada", async () => {
      const id = await novaPeca("P03", 2, 10000, 20000);
      await abrirVenda("P03", { qtd: 5 });
      await confirmarRecusado();
      assert.strictEqual((await vendasDe(id)).length, 0, "não podia ter gravado venda");
      assert.strictEqual((await peca(id)).quantidade, 2, "estoque não podia ter mudado");
    });

    await caso("4. quantidade vazia e zero são recusadas", async () => {
      const id = await novaPeca("P04", 5, 10000, 20000);
      for (const qtd of ["", "0"]) {
        await abrirVenda("P04", { qtd });
        await confirmarRecusado();
      }
      assert.strictEqual((await vendasDe(id)).length, 0);
      assert.strictEqual((await peca(id)).quantidade, 5);
    });

    await caso("5. peça sem estoque tem o botão Vender desabilitado", async () => {
      await novaPeca("P05", 0, 10000, 20000);
      await recarregar("Venda");
      assert(await win.locator('tr:has-text("P05") button:text-is("+ Adicionar")').isDisabled());
    });

    await caso("6. preço editado na hora (desconto) é o que grava", async () => {
      const id = await novaPeca("P06", 5, 10000, 20000);
      await vender("P06", { preco: "150,00" });
      const [v] = await vendasDe(id);
      assert.strictEqual(v.preco_venda, 15000, "deveria gravar o preço com desconto");
      assert.strictEqual(v.preco_compra, 10000, "custo não muda com desconto");
    });

    await caso("7. preço com separador de milhar (1.500,00) grava R$ 1.500,00", async () => {
      const id = await novaPeca("P07", 5, 10000, 20000);
      await vender("P07", { preco: "1.500,00" });
      assert.strictEqual((await vendasDe(id))[0].preco_venda, 150000);
    });

    await caso("8. preço com uma casa decimal (10,5) vira 10,50", async () => {
      const id = await novaPeca("P08", 5, 10000, 20000);
      await vender("P08", { preco: "10,5" });
      assert.strictEqual((await vendasDe(id))[0].preco_venda, 1050);
    });

    await caso("8b. ponto do teclado numérico (10.50) também vale como decimal", async () => {
      const id = await novaPeca("P8B", 5, 10000, 20000);
      await vender("P8B", { preco: "10.50" });
      assert.strictEqual((await vendasDe(id))[0].preco_venda, 1050);
    });

    await caso("9. mão de obra soma uma vez só, mesmo com quantidade 3", async () => {
      const id = await novaPeca("P09", 5, 10000, 20000);
      await vender("P09", { qtd: 3, preco: "200,00", mao: "50,00" });
      const [v] = await vendasDe(id);
      assert.strictEqual(v.mao_de_obra, 5000);
      assert.strictEqual(v.preco_venda * v.quantidade + v.mao_de_obra, 65000, "total = 3×200,00 + 50,00");
      assert.strictEqual((v.preco_venda - v.preco_compra) * v.quantidade + v.mao_de_obra, 35000,
        "lucro = (200,00−100,00)×3 + 50,00");
    });

    await caso("10. mão de obra vazia grava 0 (nunca NaN/null)", async () => {
      const id = await novaPeca("P10", 5, 10000, 20000);
      await vender("P10", { mao: "" });
      const [v] = await vendasDe(id);
      assert.strictEqual(v.mao_de_obra, 0);
      assert.strictEqual(v.preco_venda, 20000);
    });

    await caso("12. desfazer venda devolve exatamente a quantidade vendida", async () => {
      const id = await novaPeca("P12", 5, 10000, 20000);
      await vender("P12", { qtd: 2 });
      assert.strictEqual((await peca(id)).quantidade, 3);
      await win.click('tr:has-text("2x P12") button:text-is("Desfazer")');
      await win.waitForSelector('tr:has-text("2x P12")', { state: "detached", timeout: 8000 });
      assert.strictEqual((await peca(id)).quantidade, 5, "estoque tem que voltar a 5");
      assert.strictEqual((await vendasDe(id)).length, 0, "venda tem que sumir do histórico");
    });

    await caso("13. custo congelado: mudar o preço de compra não altera venda antiga", async () => {
      const id = await novaPeca("P13", 5, 10000, 20000);
      await vender("P13");
      await sql("UPDATE pecas SET preco_compra = 50000 WHERE id = ?", [id]);
      const [v] = await vendasDe(id);
      assert.strictEqual(v.preco_compra, 10000, "lucro histórico não pode mudar depois");
    });

    await caso("14. as 5 formas de pagamento gravam certo", async () => {
      const id = await novaPeca("P14", 5, 10000, 20000);
      const formas = [["Espécie", "especie"], ["Pix", "pix"], ["Débito", "debito"],
        ["Crédito à vista", "credito_avista"], ["Crédito parcelado", "credito_parcelado"]];
      for (const [rotulo] of formas) await vender("P14", { forma: rotulo });
      const gravadas = (await vendasDe(id)).map((v) => v.forma_pagamento);
      assert.deepStrictEqual(gravadas, formas.map(([, v]) => v));
    });

    console.log("\nPagamento dividido (passo 26)");

    // Abre o painel de divisão e preenche as partes: [[valor da opção, "50,00"], …].
    const dividir = async (partes) => {
      await win.click('button:text("Dividir em mais de uma forma")');
      for (let i = 0; i < partes.length; i++) {
        if (i > 1) await win.click('button:text("+ outra forma")');
        await win.selectOption(`select[aria-label="Forma de pagamento ${i + 1}"]`, partes[i][0]);
        await win.fill(`input[aria-label="Valor da forma ${i + 1}"]`, partes[i][1]);
      }
    };
    const caixaHoje = async (forma) =>
      (await um(`SELECT COALESCE(SUM(valor),0) AS t FROM movimentos
                 WHERE date(criado_em) = date('now','localtime') AND forma_pagamento = ?`, [forma])).t;

    await caso("146. entrada em dinheiro e resto no cartão: cada forma entra no fechamento", async () => {
      const id = await novaPeca("P146", 5, 4000, 10000); // 100,00
      const especie = await caixaHoje("especie");
      const credito = await caixaHoje("credito_avista");
      await abrirVenda("P146");
      await dividir([["especie", "50,00"], ["credito_avista", "50,00"]]);
      assert(await win.locator("text=confere").count(), "com as partes fechando o total, avisa que confere");
      await confirmarVenda();

      const [v] = await vendasDe(id);
      assert.strictEqual(v.forma_pagamento, "dividido", "a venda não é de uma forma só");
      const pagos = await sql("SELECT * FROM pagamentos WHERE pedido_id = ? ORDER BY id", [v.pedido_id]);
      assert.deepStrictEqual(pagos.map((p) => [p.forma, p.valor]), [["especie", 5000], ["credito_avista", 5000]]);
      assert.strictEqual((await caixaHoje("especie")) - especie, 5000, "50,00 em espécie");
      assert.strictEqual((await caixaHoje("credito_avista")) - credito, 5000, "50,00 no crédito");
    });

    await caso("147. o dinheiro do pedido dividido não é contado duas vezes", async () => {
      const totalDia = async () =>
        (await um(`SELECT COALESCE(SUM(valor),0) AS v, COALESCE(SUM(lucro),0) AS l FROM movimentos
                   WHERE date(criado_em) = date('now','localtime')`));
      await novaPeca("P147", 5, 4000, 10000);
      const antes = await totalDia();
      await abrirVenda("P147");
      await dividir([["pix", "30,00"], ["debito", "70,00"]]);
      await confirmarVenda();
      const depois = await totalDia();
      assert.strictEqual(depois.v - antes.v, 10000, "o dia sobe 100,00, não 200,00");
      assert.strictEqual(depois.l - antes.l, 6000, "e o lucro sai uma vez só");
    });

    await caso("148. divisão que não fecha o total é recusada", async () => {
      await novaPeca("P148", 5, 4000, 10000);
      await abrirVenda("P148");
      await dividir([["especie", "50,00"], ["credito_avista", "30,00"]]);
      assert(await win.locator("text=falta R$ 20,00").count(), "mostra quanto falta");
      await confirmarRecusado();
      assert.strictEqual((await sql("SELECT v.id FROM vendas v JOIN pecas p ON p.id = v.peca_id WHERE p.nome = 'P148'")).length, 0,
        "nada pode ter sido gravado");
    });

    await caso("149. três formas, com desconto: as partes fecham o total já com desconto", async () => {
      const id = await novaPeca("P149", 5, 4000, 10000);
      await abrirVenda("P149");
      await descontar({ pct: "10" }); // 100,00 → 90,00
      await dividir([["especie", "30,00"], ["pix", "30,00"], ["debito", "30,00"]]);
      await confirmarVenda();
      const [v] = await vendasDe(id);
      const pagos = await sql("SELECT * FROM pagamentos WHERE pedido_id = ?", [v.pedido_id]);
      assert.strictEqual(pagos.length, 3);
      assert.strictEqual(pagos.reduce((s, p) => s + p.valor, 0), 9000, "as partes somam o total com desconto");
    });

    await caso("150. desfazer o pedido dividido tira o dinheiro do caixa junto", async () => {
      const id = await novaPeca("P150", 5, 4000, 10000);
      const antes = await caixaHoje("pix");
      await abrirVenda("P150");
      await dividir([["pix", "40,00"], ["especie", "60,00"]]);
      await confirmarVenda();
      const [v] = await vendasDe(id);
      await win.click('tr:has-text("1x P150") button:text-is("Desfazer")');
      await win.waitForSelector('tr:has-text("1x P150")', { state: "detached", timeout: 8000 });
      assert.strictEqual((await sql("SELECT id FROM pagamentos WHERE pedido_id = ?", [v.pedido_id])).length, 0,
        "as formas do pedido têm que sumir com ele");
      assert.strictEqual(await caixaHoje("pix"), antes, "o Pix do dia volta ao que era");
      assert.strictEqual((await peca(id)).quantidade, 5);
    });

    console.log("\nCarrinho (passo 12)");

    await caso("44. pedido com 3 itens grava tudo junto e baixa cada estoque", async () => {
      const a = await novaPeca("C44A", 5, 10000, 20000);
      const b = await novaPeca("C44B", 5, 3000, 8000);
      const c = await novaPeca("C44C", 5, 1000, 2500);
      await recarregar("Venda");
      await aoCarrinho("C44A", { qtd: 2 });
      await aoCarrinho("C44B");
      await aoCarrinho("C44C", { qtd: 3 });
      await win.click('button:text("Finalizar venda")');
      await win.click('button:text-is("Pix")');
      await confirmarVenda();
      assert.strictEqual((await peca(a)).quantidade, 3);
      assert.strictEqual((await peca(b)).quantidade, 4);
      assert.strictEqual((await peca(c)).quantidade, 2);
      const itens = await sql("SELECT * FROM vendas WHERE peca_id IN (?,?,?)", [a, b, c]);
      assert.strictEqual(itens.length, 3, "3 linhas de venda");
      assert.strictEqual(new Set(itens.map((v) => v.pedido_id)).size, 1, "todas no mesmo pedido");
      assert(itens.every((v) => v.forma_pagamento === "pix"), "forma de pagamento vale pro pedido");
      const total = itens.reduce((s, v) => s + v.preco_venda * v.quantidade + v.mao_de_obra, 0);
      assert.strictEqual(total, 2 * 20000 + 8000 + 3 * 2500, "total do pedido");
    });

    await caso("45. clicar duas vezes no mesmo produto soma quantidade", async () => {
      const id = await novaPeca("C45", 5, 10000, 20000);
      await recarregar("Venda");
      await aoCarrinho("C45");
      await aoCarrinho("C45");
      assert.strictEqual(await win.locator('input[aria-label="Quantidade de C45"]').inputValue(), "2");
      await win.click('button:text("Finalizar venda")');
      await confirmarVenda();
      assert.strictEqual((await peca(id)).quantidade, 3);
      assert.strictEqual((await vendasDe(id)).length, 1, "vira um item só com quantidade 2");
    });

    await caso("46. mão de obra do pedido soma uma vez, não por item", async () => {
      const a = await novaPeca("C46A", 5, 10000, 20000);
      const b = await novaPeca("C46B", 5, 10000, 20000);
      await recarregar("Venda");
      await aoCarrinho("C46A");
      await aoCarrinho("C46B");
      await win.click('button:text("Finalizar venda")');
      await win.fill('label:has-text("Mão de obra") input', "50,00");
      await confirmarVenda();
      const itens = await sql("SELECT * FROM vendas WHERE peca_id IN (?,?)", [a, b]);
      assert.strictEqual(itens.reduce((s, v) => s + v.mao_de_obra, 0), 5000, "50,00 uma vez só no pedido");
      assert.strictEqual(itens.reduce((s, v) => s + v.preco_venda * v.quantidade + v.mao_de_obra, 0), 45000);
    });

    await caso("47. item sem estoque suficiente recusa o pedido inteiro", async () => {
      const a = await novaPeca("C47A", 5, 10000, 20000);
      const b = await novaPeca("C47B", 1, 10000, 20000);
      await recarregar("Venda");
      await aoCarrinho("C47A");
      await aoCarrinho("C47B", { qtd: 4 }); // só tem 1
      await win.click('button:text("Finalizar venda")');
      await confirmarRecusado();
      assert.strictEqual((await peca(a)).quantidade, 5, "nenhum item pode ter baixado");
      assert.strictEqual((await peca(b)).quantidade, 1);
      assert.strictEqual((await vendasDe(a)).length, 0);
    });

    await caso("48. remover item do carrinho não leva os outros", async () => {
      const a = await novaPeca("C48A", 5, 10000, 20000);
      const b = await novaPeca("C48B", 5, 10000, 20000);
      await recarregar("Venda");
      await aoCarrinho("C48A");
      await aoCarrinho("C48B");
      await win.click('button[aria-label="Remover C48A"]');
      await win.waitForTimeout(200);
      await win.click('button:text("Finalizar venda")');
      await confirmarVenda();
      assert.strictEqual((await vendasDe(a)).length, 0, "o removido não é vendido");
      assert.strictEqual((await vendasDe(b)).length, 1);
      assert.strictEqual((await peca(a)).quantidade, 5);
    });

    await caso("49. desfazer devolve o pedido inteiro", async () => {
      const a = await novaPeca("C49A", 5, 10000, 20000);
      const b = await novaPeca("C49B", 5, 10000, 20000);
      await recarregar("Venda");
      await aoCarrinho("C49A", { qtd: 2 });
      await aoCarrinho("C49B");
      await win.click('button:text("Finalizar venda")');
      await confirmarVenda();
      // Pelo id do pedido: "Pedido com 2 itens" casaria com o pedido de outro caso.
      const pid = (await vendasDe(a))[0].pedido_id;
      await win.click(`#pedido-${pid} button:text-is("Desfazer")`);
      await win.waitForSelector(`#pedido-${pid}`, { state: "detached", timeout: 8000 });
      assert.strictEqual((await peca(a)).quantidade, 5, "os dois itens voltam ao estoque");
      assert.strictEqual((await peca(b)).quantidade, 5);
      assert.strictEqual((await vendasDe(a)).length, 0);
      assert.strictEqual((await vendasDe(b)).length, 0);
    });

    await caso("50. venda antiga (1 item) continua numa linha só", async () => {
      const id = await novaPeca("C50", 5, 10000, 20000);
      await vender("C50");
      const [v] = await vendasDe(id);
      assert(v.pedido_id, "mesmo com 1 item o pedido_id é preenchido");
      const linha = await win.locator(`#pedido-${v.pedido_id}`).innerText();
      assert(linha.includes("1x C50"), "a linha mostra o item direto");
      assert(!linha.includes("Pedido com"), "pedido de 1 item não vira cabeçalho + item");
      assert.strictEqual(await win.locator(`#pedido-${v.pedido_id} button:text-is("Desfazer")`).count(), 1);
    });

    await caso("51. Dashboard agrupa o histórico por pedido, com os totais do pedido", async () => {
      const a = await novaPeca("C51A", 5, 10000, 20000);
      const b = await novaPeca("C51B", 5, 3000, 8000);
      await recarregar("Venda");
      await aoCarrinho("C51A", { qtd: 2 });
      await aoCarrinho("C51B");
      await win.click('button:text("Finalizar venda")');
      await win.fill('label:has-text("Mão de obra") input', "30,00");
      await confirmarVenda();
      const pid = (await vendasDe(a))[0].pedido_id;

      await aba("Dashboard");
      await win.waitForSelector("text=Histórico de vendas", { timeout: 8000 });
      const cabecalho = await win.locator(`#pedido-${pid}`).innerText();
      assert(cabecalho.includes("Pedido com 2 itens"), "o pedido tem que virar um cabeçalho");
      // total do pedido = 2×200,00 + 80,00 + 30,00 de mão de obra
      assert(cabecalho.includes("510,00"), "o cabeçalho mostra o total do pedido");
      // lucro = (200,00−100,00)×2 + (80,00−30,00) + 30,00 de mão de obra = 280,00
      assert(cabecalho.includes("280,00"), "e o lucro do pedido");
      const resumo = await win.locator("text=/no período/").first().innerText();
      assert(resumo.includes("itens"), `o resumo separa pedidos de itens: ${resumo}`);
    });

    await caso("52. pedido expande e recolhe no Dashboard e na Venda", async () => {
      const a = await novaPeca("C52A", 5, 10000, 20000);
      await novaPeca("C52B", 5, 3000, 8000);
      await recarregar("Venda");
      await aoCarrinho("C52A");
      await aoCarrinho("C52B");
      await win.click('button:text("Finalizar venda")');
      await confirmarVenda();
      const pid = (await vendasDe(a))[0].pedido_id;

      for (const tela of ["Venda", "Dashboard"]) {
        await recarregar(tela);
        await win.waitForSelector(`#pedido-${pid}`, { timeout: 8000 });
        const itemVisivel = () => win.locator(`text=↳ 1x C52A`).count();
        assert.strictEqual(await itemVisivel(), 0, `${tela}: pedido começa recolhido`);
        assert((await win.locator(`#pedido-${pid}`).innerText()).includes("▶"), `${tela}: seta de recolhido`);

        await win.click(`#pedido-${pid}`);
        await win.waitForTimeout(250);
        assert.strictEqual(await itemVisivel(), 1, `${tela}: clicar expande e mostra os itens`);
        assert((await win.locator(`#pedido-${pid}`).innerText()).includes("▼"), `${tela}: seta de expandido`);

        await win.click(`#pedido-${pid}`);
        await win.waitForTimeout(250);
        assert.strictEqual(await itemVisivel(), 0, `${tela}: clicar de novo recolhe`);
      }
    });

    await caso("53. clicar em Desfazer não expande o pedido", async () => {
      const a = await novaPeca("C53A", 5, 10000, 20000);
      const b = await novaPeca("C53B", 5, 3000, 8000);
      await recarregar("Venda");
      await aoCarrinho("C53A");
      await aoCarrinho("C53B");
      await win.click('button:text("Finalizar venda")');
      await confirmarVenda();
      const pid = (await vendasDe(a))[0].pedido_id;
      await win.click(`#pedido-${pid} button:text-is("Desfazer")`);
      await win.waitForSelector(`#pedido-${pid}`, { state: "detached", timeout: 8000 });
      assert.strictEqual((await peca(a)).quantidade, 5, "o botão desfaz de verdade");
      assert.strictEqual((await peca(b)).quantidade, 5);
    });

    await caso("54. nota do pedido: uma só, com todos os itens, e reimprimir não duplica", async () => {
      const a = await novaPeca("C54A", 5, 10000, 20000);
      const b = await novaPeca("C54B", 5, 3000, 8000);
      await ligarNota(true);
      try {
        await recarregar("Venda");
        await aoCarrinho("C54A", { qtd: 2 });
        await aoCarrinho("C54B");
        await win.click('button:text("Finalizar venda")');
        await win.fill('label:has-text("Mão de obra") input', "30,00");
        await confirmarVenda();
        await win.waitForSelector("text=Gerar nota", { timeout: 8000 });
        await win.click('button:text("Gerar nota (PDF)")');
        await win.waitForSelector("text=Gerar nota", { state: "detached", timeout: 8000 });

        const pid = (await vendasDe(a))[0].pedido_id;
        const notas = await sql("SELECT * FROM notas WHERE pedido_id = ?", [pid]);
        assert.strictEqual(notas.length, 1, "um pedido gera uma nota, não uma por item");
        assert(notas[0].descricao.includes("2x C54A"), "item com quantidade na descrição");
        assert(notas[0].descricao.includes("1x C54B"), "o segundo item também entra");
        // 2×200,00 + 80,00 + 30,00 de mão de obra: a nota cobra o pedido inteiro.
        assert.strictEqual(notas[0].valor_total, 2 * 20000 + 8000 + 3000, "total da nota = total do pedido");

        // Segundo clique reimprime a existente; nota nova aqui significaria numeração furada.
        await recarregar("Venda");
        await win.click(`#pedido-${pid} button:has-text("Reimprimir")`);
        await win.waitForTimeout(400);
        assert.strictEqual((await sql("SELECT * FROM notas WHERE pedido_id = ?", [pid])).length, 1);
      } finally {
        await ligarNota(false); // os casos seguintes contam com a venda sem nota
      }
    });

    console.log("\nDesconto (passo 13)");

    await caso("55. administrador aplica 10% direto e o desconto grava numa linha só", async () => {
      const a = await novaPeca("C55A", 5, 10000, 20000);
      const b = await novaPeca("C55B", 5, 3000, 8000);
      await recarregar("Venda");
      await aoCarrinho("C55A");
      await aoCarrinho("C55B");
      await win.click('button:text("Finalizar venda")');
      await descontar({ pct: "10" });
      // 200,00 + 80,00 = 280,00 → 10% = 28,00
      assert((await win.locator("text=Desconto: −R$ 28,00").count()) > 0, "mostra o desconto aplicado");
      assert((await win.locator("text=Total: R$ 252,00").count()) > 0, "total já vem descontado");
      await confirmarVenda();

      const itens = await sql("SELECT * FROM vendas WHERE peca_id IN (?,?) ORDER BY id", [a, b]);
      assert.strictEqual(itens.reduce((s, v) => s + v.desconto, 0), 2800, "28,00 uma vez só no pedido");
      assert.strictEqual(itens.filter((v) => v.desconto > 0).length, 1, "grava numa linha só, como a mão de obra");
      const admin = await um("SELECT id FROM usuarios WHERE papel = 'dono'");
      assert.strictEqual(itens[0].desconto_por, admin.id, "administrador autoriza o próprio desconto");
    });

    await caso("56. valor final chega no mesmo desconto que a porcentagem", async () => {
      const id = await novaPeca("C56", 5, 10000, 20000);
      await recarregar("Venda");
      await aoCarrinho("C56");
      await win.click('button:text("Finalizar venda")');
      await descontar({ final: "180,00" }); // 200,00 → 180,00 = 20,00 de desconto
      await confirmarVenda();
      assert.strictEqual((await vendasDe(id))[0].desconto, 2000);
    });

    await caso("57. desconto acompanha a mão de obra digitada depois", async () => {
      const id = await novaPeca("C57", 5, 10000, 20000);
      await recarregar("Venda");
      await aoCarrinho("C57");
      await win.click('button:text("Finalizar venda")');
      await descontar({ pct: "10" }); // 10% de 200,00 = 20,00
      await win.fill('label:has-text("Mão de obra") input', "50,00");
      await win.waitForTimeout(200);
      await confirmarVenda();
      // Base virou 250,00: o desconto tem que ser 25,00, não os 20,00 de antes.
      assert.strictEqual((await vendasDe(id))[0].desconto, 2500, "10% recalcula sobre o total novo");
    });

    await caso("58. porcentagem fora da faixa e valor final acima do total são recusados", async () => {
      const id = await novaPeca("C58", 5, 10000, 20000);
      await recarregar("Venda");
      await aoCarrinho("C58");
      await win.click('button:text("Finalizar venda")');
      for (const campos of [{ pct: "150" }, { pct: "0" }, { final: "300,00" }]) {
        await descontar(campos);
        assert.strictEqual(await win.locator("text=Remover desconto").count(), 0,
          `${JSON.stringify(campos)} não podia ser aceito`);
        await win.click('button:text-is("Cancelar")');
      }
      await confirmarVenda();
      assert.strictEqual((await vendasDe(id))[0].desconto, 0);
    });

    await caso("59. remover desconto volta o total cheio", async () => {
      const id = await novaPeca("C59", 5, 10000, 20000);
      await recarregar("Venda");
      await aoCarrinho("C59");
      await win.click('button:text("Finalizar venda")');
      await descontar({ pct: "10" });
      await win.click('button:text("Remover desconto")');
      assert((await win.locator("text=Total: R$ 200,00").count()) > 0);
      await confirmarVenda();
      const [v] = await vendasDe(id);
      assert.strictEqual(v.desconto, 0);
      assert.strictEqual(v.desconto_por, null, "sem desconto não fica autorizador pendurado");
    });

    await caso("60. faturamento, lucro e fechamento do dia descontam", async () => {
      const id = await novaPeca("C60", 5, 10000, 20000);
      const antes = await um(`SELECT SUM(preco_venda * quantidade + mao_de_obra - desconto) AS fat,
                                     SUM((preco_venda - preco_compra) * quantidade + mao_de_obra - desconto) AS lucro
                              FROM vendas WHERE date(criado_em) = date('now','localtime')`);
      await recarregar("Venda");
      await aoCarrinho("C60");
      await win.click('button:text("Finalizar venda")');
      await win.click('button:text-is("Pix")');
      await descontar({ pct: "25" }); // 200,00 → desconto 50,00
      await confirmarVenda();
      const depois = await um(`SELECT SUM(preco_venda * quantidade + mao_de_obra - desconto) AS fat,
                                      SUM((preco_venda - preco_compra) * quantidade + mao_de_obra - desconto) AS lucro
                               FROM vendas WHERE date(criado_em) = date('now','localtime')`);
      assert.strictEqual(depois.fat - antes.fat, 15000, "faturou 150,00, não 200,00");
      assert.strictEqual(depois.lucro - antes.lucro, 5000, "lucrou 50,00 (100,00 de margem − 50,00)");
      // O que entrou na gaveta é o valor descontado: a tela tem que mostrar o mesmo.
      await recarregar("Dashboard");
      assert.strictEqual((await vendasDe(id))[0].desconto, 5000);
    });

    await caso("61. Dashboard marca o pedido, mostra quem autorizou e filtra só com desconto", async () => {
      const comDesc = await novaPeca("C61A", 5, 10000, 20000);
      const semDesc = await novaPeca("C61B", 5, 10000, 20000);
      await recarregar("Venda");
      await aoCarrinho("C61A");
      await win.click('button:text("Finalizar venda")');
      await descontar({ pct: "10" });
      await confirmarVenda();
      await vender("C61B");
      const pidCom = (await vendasDe(comDesc))[0].pedido_id;
      const pidSem = (await vendasDe(semDesc))[0].pedido_id;

      await recarregar("Dashboard");
      // :has-text normaliza o espaço do "R$ " (toLocaleString usa NBSP); includes não.
      assert(await win.locator('tr:has-text("C61A"):has-text("desconto R$ 20,00")').count(), "etiqueta com o valor");
      assert(await win.locator('tr:has-text("C61A"):has-text("Administrador")').count(), "mostra quem autorizou");
      assert(await win.locator('tr:has-text("C61B")').count(), "a venda sem desconto aparece antes do filtro");

      await win.click('label:has-text("Só com desconto") input');
      await win.waitForTimeout(300);
      assert(await win.locator('tr:has-text("C61A")').count(), "o pedido com desconto fica");
      assert.strictEqual(await win.locator('tr:has-text("C61B")').count(), 0, "o sem desconto sai da lista");
      await win.click('label:has-text("Só com desconto") input'); // desliga p/ os próximos casos
      assert(pidCom !== pidSem);
    });

    await caso("62. PIN de permissão repetido é recusado, e colaborador não tem esse campo", async () => {
      const novoUsuario = async (nome, papel) => {
        await win.click('button:text("+ Novo usuário")');
        await win.fill('input[placeholder="Nome"]', nome);
        await win.fill('input[placeholder="PIN (4 dígitos)"]', "5678");
        await win.selectOption("select", papel);
        await win.click('button:text-is("Adicionar")');
        await win.waitForSelector(`text=${nome}`, { timeout: 8000 });
      };
      await aba("Config");
      await novoUsuario("Admin62", "dono");
      await novoUsuario("Colab62", "funcionario");
      try {
        await win.fill('input[aria-label="PIN de permissão de Administrador"]', "9999");
        await win.waitForTimeout(300);
        await win.fill('input[aria-label="PIN de permissão de Admin62"]', "9999"); // repetido
        await win.waitForTimeout(400);
        const pins = await sql("SELECT nome, pin_permissao FROM usuarios WHERE papel = 'dono'");
        assert.strictEqual(pins.filter((u) => u.pin_permissao === "9999").length, 1, "só um admin fica com o PIN");
        assert.strictEqual(pins.find((u) => u.nome === "Admin62").pin_permissao, "", "o repetido não é gravado");
        // Só administrador libera desconto: colaborador nem exibe o campo.
        assert.strictEqual(await win.locator('input[aria-label="PIN de permissão de Colab62"]').count(), 0);
      } finally {
        await sql("DELETE FROM usuarios WHERE nome IN ('Admin62','Colab62')");
        await sql("UPDATE usuarios SET pin_permissao = '' WHERE papel = 'dono'");
      }
    });

    await caso("63. colaborador só consegue desconto com o PIN de um administrador", async () => {
      const id = await novaPeca("C63", 5, 10000, 20000);
      await sql("UPDATE usuarios SET pin_permissao = '4321' WHERE papel = 'dono'");
      const admin = await um("SELECT id FROM usuarios WHERE papel = 'dono'");
      await sql("INSERT INTO usuarios (nome, pin, papel) VALUES ('Colab63','7777','funcionario')");
      await trocarUsuario("Colab63", "7777");
      try {
        await aba("Venda");
        await aoCarrinho("C63");
        await win.click('button:text("Finalizar venda")');

        await descontar({ pct: "10", pin: "0000" }); // PIN errado
        assert.strictEqual(await win.locator("text=Remover desconto").count(), 0, "PIN errado não pode aplicar");
        await descontar({ pct: "10", pin: "4321" }, false); // painel já está aberto
        assert((await win.locator("text=Desconto: −R$ 20,00").count()) > 0, "PIN certo aplica");
        await confirmarVenda();

        const [v] = await vendasDe(id);
        assert.strictEqual(v.desconto, 2000);
        assert.strictEqual(v.desconto_por, admin.id, "grava o administrador do PIN, não o colaborador");
        assert.notStrictEqual(v.usuario_id, admin.id, "quem vendeu continua sendo o colaborador");
      } finally {
        await trocarUsuario("Administrador", "1234");
        await sql("UPDATE vendas SET usuario_id = NULL WHERE usuario_id = (SELECT id FROM usuarios WHERE nome = 'Colab63')");
        await sql("DELETE FROM usuarios WHERE nome = 'Colab63'");
        await sql("UPDATE usuarios SET pin_permissao = '' WHERE papel = 'dono'");
      }
    });

    console.log("\nClientes (passo 14)");

    await caso("64. cliente novo na venda vira cadastro com código sequencial", async () => {
      await novaPeca("C64", 5, 10000, 20000);
      await recarregar("Venda");
      await aoCarrinho("C64");
      await win.click('button:text("Finalizar venda")');
      await win.fill('input[list="clientes-cadastrados"]', "João Teste");
      await confirmarVenda();
      const c = await um("SELECT * FROM clientes WHERE nome = 'João Teste'");
      assert(c, "o cliente tinha que ser criado na hora da venda");
      assert(/^C\d{3}$/.test(c.codigo), `código fora do formato C001: ${c.codigo}`);
      const [v] = await sql("SELECT * FROM vendas WHERE cliente = 'João Teste'");
      assert.strictEqual(v.cliente_id, c.id, "a venda fica vinculada ao cadastro");
    });

    await caso("65. vender de novo pelo nome ou pelo código não duplica o cadastro", async () => {
      const c = await um("SELECT * FROM clientes WHERE nome = 'João Teste'");
      await novaPeca("C65A", 5, 10000, 20000);
      await novaPeca("C65B", 5, 10000, 20000);
      for (const digitado of ["João Teste", c.codigo]) {
        await recarregar("Venda");
        await aoCarrinho(digitado === c.codigo ? "C65B" : "C65A");
        await win.click('button:text("Finalizar venda")');
        await win.fill('input[list="clientes-cadastrados"]', digitado);
        await confirmarVenda();
      }
      assert.strictEqual((await sql("SELECT id FROM clientes WHERE nome = 'João Teste'")).length, 1,
        "não pode nascer um segundo João");
      const vs = await sql("SELECT * FROM vendas WHERE cliente_id = ?", [c.id]);
      assert.strictEqual(vs.length, 3, "as três vendas apontam pro mesmo cadastro");
      // Digitou o código: o nome gravado tem que ser o do cadastro, não "C00x".
      assert(vs.every((v) => v.cliente === "João Teste"), "o nome vem do cadastro");
    });

    await caso("66. venda sem cliente não cria cadastro nenhum", async () => {
      const antes = (await sql("SELECT id FROM clientes")).length;
      const id = await novaPeca("C66", 5, 10000, 20000);
      await vender("C66");
      assert.strictEqual((await sql("SELECT id FROM clientes")).length, antes, "ninguém novo no cadastro");
      const [v] = await vendasDe(id);
      assert.strictEqual(v.cliente_id, null);
      assert.strictEqual(v.cliente, "");
    });

    await caso("67. Config lista o cliente com total, nº de compras e última compra", async () => {
      await aba("Config");
      await win.waitForSelector('button[aria-label="Editar João Teste"]', { timeout: 8000 });
      const linha = win.locator('tr:has(button[aria-label="Editar João Teste"])');
      const texto = await linha.innerText();
      // 3 vendas de 200,00 = 600,00, e são 3 pedidos distintos (1 item cada).
      assert(await linha.locator(':text("R$ 600,00")').count(), `total errado: ${texto}`);
      assert(/\b3\b/.test(texto), `deveria contar 3 compras: ${texto}`);
    });

    await caso("68. clicar no cliente abre o histórico de compras dele", async () => {
      await aba("Config");
      await win.click('button:text-is("João Teste")');
      await win.waitForSelector("text=3 compras", { timeout: 8000 });
      for (const peca of ["C64", "C65A", "C65B"]) {
        assert(await win.locator(`tr:has-text("${peca}")`).count(), `faltou ${peca} no histórico`);
      }
      await win.click('button:text("‹ Voltar")');
    });

    await caso("69. compras do dia mostram o cliente de cada venda", async () => {
      await aba("Config");
      const doDia = win.locator('h4:text("Compras de hoje") + div table');
      assert(await doDia.locator('tr:has-text("João Teste")').count(), "venda com cliente aparece nomeada");
      assert(await doDia.locator('tr:has-text("sem cliente")').count(), "venda de balcão aparece sem nome");
    });

    await caso("70. excluir cliente solta as vendas mas não apaga o histórico", async () => {
      const c = await um("SELECT * FROM clientes WHERE nome = 'João Teste'");
      const antes = (await sql("SELECT id FROM vendas WHERE cliente_id = ?", [c.id])).length;
      assert.strictEqual(antes, 3);
      await aba("Config");
      await win.click('button[aria-label="Excluir João Teste"]');
      await win.waitForSelector('button[aria-label="Excluir João Teste"]', { state: "detached", timeout: 8000 });
      assert.strictEqual(await um("SELECT id FROM clientes WHERE nome = 'João Teste'"), undefined, "sai do cadastro");
      const vs = await sql("SELECT * FROM vendas WHERE cliente = 'João Teste'");
      assert.strictEqual(vs.length, 3, "as vendas continuam no histórico");
      assert(vs.every((v) => v.cliente_id === null), "só perdem o vínculo");
    });

    await caso("71. código de cliente repetido é recusado na edição", async () => {
      await sql("INSERT INTO clientes (codigo, nome) VALUES ('C900','Ana71'), ('C901','Bia71')");
      await recarregar("Config"); // a lista só relê ao montar; ficar na aba não traz os novos
      await win.click('button[aria-label="Editar Bia71"]');
      await win.fill('input[aria-label="Código do cliente"]', "C900"); // já é da Ana
      await win.click('button:text-is("Salvar")');
      await win.waitForTimeout(400);
      assert.strictEqual((await um("SELECT codigo FROM clientes WHERE nome = 'Bia71'")).codigo, "C901",
        "o código repetido não pode ser gravado");
      await sql("DELETE FROM clientes WHERE nome IN ('Ana71','Bia71')");
    });

    await caso("74. campos da edição de cliente não invadem a coluna vizinha", async () => {
      await sql("INSERT INTO clientes (codigo, nome, contato) VALUES ('C990','Maria Aparecida da Silva','(11) 98765-4321')");
      await recarregar("Config");
      await win.click('button[aria-label="Editar Maria Aparecida da Silva"]');
      await win.waitForSelector('input[aria-label="Contato do cliente"]', { timeout: 8000 });
      try {
        // Sem boxSizing o input estourava a célula e cobria o campo da esquerda.
        const caixas = [];
        for (const rotulo of ["Código do cliente", "Nome do cliente", "Contato do cliente"]) {
          caixas.push(await win.locator(`input[aria-label="${rotulo}"]`).boundingBox());
        }
        caixas.push(await win.locator('button:text-is("Salvar")').boundingBox());
        for (let i = 1; i < caixas.length; i++) {
          assert(caixas[i].x >= caixas[i - 1].x + caixas[i - 1].width,
            `campo ${i} começa em ${caixas[i].x} e o anterior termina em ${caixas[i - 1].x + caixas[i - 1].width}`);
        }
      } finally {
        await win.click('button:text-is("Cancelar")');
        await sql("DELETE FROM clientes WHERE codigo = 'C990'");
      }
    });

    console.log("\nTroca de peça funcionando (passo 15)");

    // Vende A, clica em Trocar na venda e repõe com a peça idB. estado: "Funcionando" |
    // "Com defeito". opts.perda = motivo → marca descarte em vez de mandar pro fornecedor.
    const trocarVenda = async (nomeA, idB, estado, opts = {}) => {
      await recarregar("Venda");
      await aoCarrinho(nomeA);
      await win.click('button:text("Finalizar venda")');
      // A venda em si vai pra outra forma quando o caso mede a da diferença,
      // senão o valor da venda entra na mesma conta e mascara o resultado.
      if (opts.formaVenda) await win.click(`button:text-is("${opts.formaVenda}")`);
      await confirmarVenda();
      const pid = (await um("SELECT pedido_id FROM vendas WHERE peca_id = (SELECT id FROM pecas WHERE nome = ?) ORDER BY id DESC", [nomeA])).pedido_id;
      await win.click(`#pedido-${pid} button:text-is("Trocar")`);
      await win.waitForSelector("text=Estado da peça devolvida", { timeout: 8000 });
      await win.click(`button:text-is("${estado}")`);
      if (estado === "Com defeito") await win.fill('label:has-text("Defeito") input', "não liga");
      if (opts.perda) {
        await win.click('button:text-is("Descarte → perda")');
        await win.fill('label:has-text("Motivo da perda") input', opts.perda);
      }
      await win.selectOption('label:has-text("Trocar por") select', String(idB));
      // A forma de pagamento da diferença só aparece depois de escolher a reposição.
      if (opts.formaDif) {
        await win.waitForSelector("text=Por onde o dinheiro", { timeout: 8000 });
        await win.click(`div:has-text("Por onde o dinheiro") > div > button:text-is("${opts.formaDif}")`);
      }
      await win.click('button:text-is("Salvar")');
      await win.waitForSelector("text=Prateleira", { timeout: 8000 });
      return pid;
    };

    await caso("75. peça devolvida funcionando volta ao estoque e a reposição sai", async () => {
      const a = await novaPeca("C75A", 5, 10000, 20000);
      const b = await novaPeca("C75B", 5, 10000, 20000);
      await trocarVenda("C75A", b, "Funcionando");
      // A: 5 −1 da venda +1 da devolução = 5. B: 5 −1 da reposição = 4.
      assert.strictEqual((await peca(a)).quantidade, 5, "a devolvida boa volta pro estoque");
      assert.strictEqual((await peca(b)).quantidade, 4, "a reposição sai do estoque");
      const t = await um("SELECT * FROM trocas WHERE peca_id = ?", [a]);
      assert.strictEqual(t.defeituosa, 0);
      assert.strictEqual(t.fornecedor, "", "peça boa não tem fornecedor");
    });

    await caso("76. peça funcionando não aparece na prateleira nem entra em lote", async () => {
      await aba("Trocas");
      assert.strictEqual(await win.locator('tr:has-text("C75A")').count(), 0, "não pode sujar a prateleira");
      const naPrateleira = await sql("SELECT id FROM trocas WHERE lote_id IS NULL AND defeituosa = 1 AND modelo LIKE 'C75A%'");
      assert.strictEqual(naPrateleira.length, 0, "não pode ser fechada em lote");
    });

    await caso("77. desfazer a troca reverte os dois movimentos de estoque", async () => {
      const a = await novaPeca("C77A", 5, 10000, 20000);
      const b = await novaPeca("C77B", 5, 10000, 20000);
      const pid = await trocarVenda("C77A", b, "Funcionando");
      assert.strictEqual((await peca(a)).quantidade, 5);
      assert.strictEqual((await peca(b)).quantidade, 4);
      await recarregar("Venda");
      // O pedido trocado perde o Desfazer dele; quem desfaz a troca é a linha da troca.
      await win.click('tr:has-text("trocado por 1x C77B") button:text-is("Desfazer")');
      await win.waitForTimeout(500);
      // Volta ao estado logo depois da venda: A vendida (4), B intacta (5).
      assert.strictEqual((await peca(a)).quantidade, 4, "a devolvida boa sai do estoque de novo");
      assert.strictEqual((await peca(b)).quantidade, 5, "a reposição volta");
      assert.strictEqual(await um("SELECT id FROM trocas WHERE peca_id = ?", [a]), undefined);
    });

    await caso("78. com defeito continua indo pra prateleira, como antes", async () => {
      const a = await novaPeca("C78A", 5, 10000, 20000);
      const b = await novaPeca("C78B", 5, 10000, 20000);
      await trocarVenda("C78A", b, "Com defeito");
      // A não volta: ficou na prateleira. 5 −1 da venda = 4.
      assert.strictEqual((await peca(a)).quantidade, 4, "defeituosa não volta pro estoque");
      assert.strictEqual((await peca(b)).quantidade, 4);
      const t = await um("SELECT * FROM trocas WHERE peca_id = ?", [a]);
      assert.strictEqual(t.defeituosa, 1);
      assert.strictEqual(t.defeito, "não liga");
      await aba("Trocas");
      assert(await win.locator('tr:has-text("C78A")').count(), "tem que estar na prateleira");
    });

    await caso("79. registro avulso funcionando: devolvida entra e a entregue sai, saldo zero", async () => {
      const id = await novaPeca("C79", 5, 1200, 3000);
      await recarregar("Trocas");
      await win.click('button:text("+ Registrar defeituosa")');
      await win.waitForSelector("text=Estado da peça devolvida", { timeout: 8000 });
      await win.click('button:text-is("Funcionando")');
      await win.selectOption('label:has-text("Peça do estoque") select', String(id));
      await win.click('label:has-text("Entreguei peça nova") input');
      await win.click('button:text-is("Salvar")');
      await win.waitForSelector("text=Prateleira", { timeout: 8000 });
      // Voltou uma boa (+1) e saiu uma do estoque pro cliente (−1): fica igual.
      assert.strictEqual((await peca(id)).quantidade, 5, "devolveu boa e entregou outra: saldo zero");
      const t = await um("SELECT * FROM trocas WHERE peca_id = ?", [id]);
      assert.strictEqual(t.defeituosa, 0);
      assert.strictEqual(await win.locator('tr:has-text("C79")').count(), 0, "não vai pra prateleira");
    });

    console.log("\nPerda (passo 16)");

    await caso("80. descarte vira perda a preço de compra e não vai pra prateleira", async () => {
      const a = await novaPeca("C80A", 5, 1200, 3000);
      const b = await novaPeca("C80B", 5, 1200, 3000);
      await trocarVenda("C80A", b, "Com defeito", { perda: "cabo sem troca com fornecedor" });
      const t = await um("SELECT * FROM trocas WHERE peca_id = ?", [a]);
      const p = await um("SELECT * FROM perdas WHERE troca_id = ?", [t.id]);
      assert(p, "tinha que registrar a perda");
      assert.strictEqual(p.valor, 1200, "perda é o preço de COMPRA, não o de venda");
      assert.strictEqual(p.peca_id, a);
      assert.strictEqual(p.motivo, "cabo sem troca com fornecedor");
      assert.strictEqual(t.fornecedor, "", "descarte não tem fornecedor");
      await aba("Trocas");
      const prateleira = win.locator('table[aria-label="Prateleira"]');
      assert.strictEqual(await prateleira.locator('tr:has-text("C80A")').count(), 0, "não pode sujar a prateleira");
    });

    await caso("81. bloco Perdas mostra a perda e soma o total do mês", async () => {
      await recarregar("Trocas");
      const bloco = win.locator('table[aria-label="Perdas"]');
      assert(await bloco.locator('tr:has-text("C80A")').count(), "a perda tem que aparecer na lista");
      assert(await bloco.locator('tr:has-text("cabo sem troca com fornecedor")').count(), "com o motivo");
      // O total do mês tem que bater com a soma do banco, não com um número solto.
      const [{ total }] = await sql(`SELECT COALESCE(SUM(valor),0) AS total FROM perdas
                                     WHERE strftime('%Y-%m', criado_em) = strftime('%Y-%m','now','localtime')`);
      const cabecalho = await win.locator('h3:has-text("Perdas")').innerText();
      assert(cabecalho.includes(reaisBR(total)), `total do mês devia ser ${reaisBR(total)}, veio "${cabecalho}"`);
    });

    await caso("82. desfazer a troca apaga a perda junto e devolve o estoque", async () => {
      const a = await novaPeca("C82A", 5, 1200, 3000);
      const b = await novaPeca("C82B", 5, 1200, 3000);
      await trocarVenda("C82A", b, "Com defeito", { perda: "descartado" });
      const t = await um("SELECT * FROM trocas WHERE peca_id = ?", [a]);
      assert(await um("SELECT id FROM perdas WHERE troca_id = ?", [t.id]), "perda criada");
      assert.strictEqual((await peca(b)).quantidade, 4);

      await recarregar("Venda");
      await win.click('tr:has-text("trocado por 1x C82B") button:text-is("Desfazer")');
      await win.waitForTimeout(500);
      assert.strictEqual(await um("SELECT id FROM perdas WHERE troca_id = ?", [t.id]), undefined,
        "a perda some junto com a troca");
      assert.strictEqual((await peca(b)).quantidade, 5, "a reposição volta pro estoque");
    });

    await caso("83. troca normal com fornecedor continua sem gerar perda", async () => {
      const a = await novaPeca("C83A", 5, 1200, 3000);
      const b = await novaPeca("C83B", 5, 1200, 3000);
      await trocarVenda("C83A", b, "Com defeito");
      const t = await um("SELECT * FROM trocas WHERE peca_id = ?", [a]);
      assert.strictEqual(await um("SELECT id FROM perdas WHERE troca_id = ?", [t.id]), undefined,
        "fornecedor não é perda: o dinheiro volta como crédito");
      await aba("Trocas");
      assert(await win.locator('table[aria-label="Prateleira"] tr:has-text("C83A")').count(),
        "continua indo pra prateleira");
    });

    await caso("84. peça funcionando não pode virar perda", async () => {
      const a = await novaPeca("C84A", 5, 1200, 3000);
      const b = await novaPeca("C84B", 5, 1200, 3000);
      await recarregar("Venda");
      await aoCarrinho("C84A");
      await win.click('button:text("Finalizar venda")');
      await confirmarVenda();
      const pid = (await vendasDe(a))[0].pedido_id;
      await win.click(`#pedido-${pid} button:text-is("Trocar")`);
      await win.waitForSelector("text=Estado da peça devolvida", { timeout: 8000 });
      // Marca descarte e DEPOIS troca pra Funcionando: o destino não pode sobrar.
      await win.click('button:text-is("Descarte → perda")');
      await win.click('button:text-is("Funcionando")');
      assert.strictEqual(await win.locator('button:text-is("Descarte → perda")').count(), 0,
        "peça boa não escolhe destino: ela volta pro estoque");
      await win.selectOption('label:has-text("Trocar por") select', String(b));
      await win.click('button:text-is("Salvar")');
      await win.waitForSelector("text=Prateleira", { timeout: 8000 });
      const t = await um("SELECT * FROM trocas WHERE peca_id = ?", [a]);
      assert.strictEqual(await um("SELECT id FROM perdas WHERE troca_id = ?", [t.id]), undefined,
        "voltou boa pro estoque: não houve prejuízo");
      assert.strictEqual((await peca(a)).quantidade, 5);
    });

    await caso("85. perda de mês fechado sai do total do mês mas continua em Tudo", async () => {
      const id = await novaPeca("C85", 5, 4000, 9000);
      // Perda de 45 dias atrás: cai fora de "Este mês" em qualquer dia do mês.
      await sql(`INSERT INTO perdas (peca_id, valor, motivo, criado_em)
                 VALUES (?, 4000, 'perda antiga C85', datetime('now','localtime','-45 days'))`, [id]);
      await recarregar("Trocas");
      const bloco = win.locator('table[aria-label="Perdas"]');
      const total = () => win.locator('h3:has-text("Perdas")').innerText();

      // Padrão é "Este mês": a antiga não pode aparecer nem contar.
      assert.strictEqual(await bloco.locator('tr:has-text("perda antiga C85")').count(), 0,
        "perda de mês fechado não entra no mês corrente");
      const [{ mes }] = await sql(`SELECT COALESCE(SUM(valor),0) AS mes FROM perdas
                                   WHERE strftime('%Y-%m', criado_em) = strftime('%Y-%m','now','localtime')`);
      assert((await total()).includes(reaisBR(mes)), "total do mês");

      await win.click('h3:has-text("Perdas") button:text-is("Tudo")');
      await win.waitForTimeout(400);
      assert(await bloco.locator('tr:has-text("perda antiga C85")').count(),
        "em Tudo o histórico continua lá: nada é apagado na virada do mês");
      const [{ tudo }] = await sql("SELECT COALESCE(SUM(valor),0) AS tudo FROM perdas");
      assert((await total()).includes(reaisBR(tudo)), "total de tudo");
      assert(tudo > mes, "o teste só vale se existir perda fora do mês");
      await sql("DELETE FROM perdas WHERE motivo = 'perda antiga C85'");
    });

    console.log("\nDiferença da troca no caixa (passo 17)");

    // Fechamento do dia por forma, do jeito que as telas leem.
    const caixaDoDia = async (forma) =>
      (await um(`SELECT COALESCE(SUM(valor),0) AS t FROM movimentos
                 WHERE date(criado_em) = date('now','localtime') AND forma_pagamento = ?`, [forma])).t;

    await caso("86. troca por peça mais cara: diferença entra no fechamento na forma escolhida", async () => {
      const a = await novaPeca("C86A", 5, 10000, 20000);
      const b = await novaPeca("C86B", 5, 15000, 24000); // 40,00 mais cara
      const antes = await caixaDoDia("pix");
      await trocarVenda("C86A", b, "Com defeito", { formaDif: "Pix" });
      const t = await um("SELECT * FROM trocas WHERE peca_id = ?", [a]);
      assert.strictEqual(t.diferenca, 4000, "24.000 − 20.000 = 40,00 a receber");
      assert.strictEqual(t.forma_pagamento, "pix");
      assert.strictEqual((await caixaDoDia("pix")) - antes, 4000, "o Pix do dia sobe 40,00");
    });

    await caso("87. troca por peça mais barata: diferença devolvida reduz a forma", async () => {
      const a = await novaPeca("C87A", 5, 10000, 20000);
      const b = await novaPeca("C87B", 5, 8000, 18500); // 15,00 mais barata
      const antes = await caixaDoDia("especie");
      await trocarVenda("C87A", b, "Com defeito", { formaVenda: "Pix", formaDif: "Espécie" });
      const t = await um("SELECT * FROM trocas WHERE peca_id = ?", [a]);
      assert.strictEqual(t.diferenca, -1500, "18.500 − 20.000 = 15,00 devolvidos");
      assert.strictEqual((await caixaDoDia("especie")) - antes, -1500, "a espécie do dia CAI 15,00");
    });

    await caso("88. troca sem diferença não mexe no caixa e nem pede forma", async () => {
      const a = await novaPeca("C88A", 5, 10000, 20000);
      const b = await novaPeca("C88B", 5, 9000, 20000); // mesmo preço de venda
      const antes = await um(`SELECT COALESCE(SUM(valor),0) AS t FROM movimentos
                              WHERE date(criado_em) = date('now','localtime')`);
      await recarregar("Venda");
      await aoCarrinho("C88A");
      await win.click('button:text("Finalizar venda")');
      await confirmarVenda();
      const pid = (await vendasDe(a))[0].pedido_id;
      await win.click(`#pedido-${pid} button:text-is("Trocar")`);
      await win.waitForSelector("text=Estado da peça devolvida", { timeout: 8000 });
      await win.fill('label:has-text("Defeito") input', "não liga");
      await win.selectOption('label:has-text("Trocar por") select', String(b));
      await win.waitForTimeout(300);
      assert.strictEqual(await win.locator("text=Por onde o dinheiro").count(), 0,
        "sem diferença não pergunta forma de pagamento");
      await win.click('button:text-is("Salvar")');
      await win.waitForSelector("text=Prateleira", { timeout: 8000 });
      const t = await um("SELECT * FROM trocas WHERE peca_id = ?", [a]);
      assert.strictEqual(t.diferenca, 0);
      assert.strictEqual(t.forma_pagamento, null);
      const depois = await um(`SELECT COALESCE(SUM(valor),0) AS t FROM movimentos
                               WHERE date(criado_em) = date('now','localtime')`);
      // Só a venda entrou no caixa; a troca em si não mexeu em nada.
      assert.strictEqual(depois.t - antes.t, 20000);
    });

    await caso("89. diferença sem forma de pagamento é recusada", async () => {
      const a = await novaPeca("C89A", 5, 10000, 20000);
      const b = await novaPeca("C89B", 5, 15000, 24000);
      await recarregar("Venda");
      await aoCarrinho("C89A");
      await win.click('button:text("Finalizar venda")');
      await confirmarVenda();
      const pid = (await vendasDe(a))[0].pedido_id;
      await win.click(`#pedido-${pid} button:text-is("Trocar")`);
      await win.waitForSelector("text=Estado da peça devolvida", { timeout: 8000 });
      await win.fill('label:has-text("Defeito") input', "não liga");
      await win.selectOption('label:has-text("Trocar por") select', String(b));
      await win.click('button:text-is("Salvar")'); // sem escolher forma
      await win.waitForTimeout(400);
      assert(await win.locator("text=Por onde o dinheiro").count(),
        "tem que continuar no formulário, sem gravar");
      assert.strictEqual(await um("SELECT id FROM trocas WHERE peca_id = ?", [a]), undefined);
      assert.strictEqual((await peca(b)).quantidade, 5, "nada de estoque pode ter mexido");
      await win.click('button:text-is("Cancelar")');
    });

    await caso("90. fechamento do dia = vendas + diferenças; lucro = margem − perdas", async () => {
      // O que as telas mostram tem que bater com a soma das duas tabelas.
      const [{ vendas }] = await sql(`SELECT COALESCE(SUM(preco_venda*quantidade + mao_de_obra - desconto),0) AS vendas
                                      FROM vendas WHERE date(criado_em) = date('now','localtime')`);
      const [{ difs }] = await sql(`SELECT COALESCE(SUM(diferenca),0) AS difs FROM trocas
                                    WHERE date(recebido_em) = date('now','localtime') AND forma_pagamento IS NOT NULL`);
      const [{ caixa }] = await sql(`SELECT COALESCE(SUM(valor),0) AS caixa FROM movimentos
                                     WHERE date(criado_em) = date('now','localtime')`);
      assert.strictEqual(caixa, vendas + difs, "o caixa do dia é venda + diferença de troca");
      assert(difs !== 0, "o teste só vale se houve diferença hoje");

      // Lucro = margem das vendas + margem real da troca − perdas. A margem da
      // troca é a diferença cobrada menos o custo a mais da peça entregue, e não
      // a diferença inteira: specs/passo-17b-lucro-exato-da-troca.md.
      const [{ lucroCaixa }] = await sql(`SELECT COALESCE(SUM(lucro),0) AS lucroCaixa FROM movimentos
                                          WHERE date(criado_em) = date('now','localtime')`);
      const [{ lucroVendas }] = await sql(`SELECT COALESCE(SUM((preco_venda-preco_compra)*quantidade + mao_de_obra - desconto),0) AS lucroVendas
                                           FROM vendas WHERE date(criado_em) = date('now','localtime')`);
      const [{ margemTroca }] = await sql(`SELECT COALESCE(SUM(diferenca - (nova_preco_compra - valor_compra)),0) AS margemTroca
                                           FROM trocas WHERE date(recebido_em) = date('now','localtime')
                                             AND nova_preco_compra IS NOT NULL`);
      const [{ perdas }] = await sql(`SELECT COALESCE(SUM(valor),0) AS perdas FROM perdas
                                      WHERE date(criado_em) = date('now','localtime')`);
      assert.strictEqual(lucroCaixa, lucroVendas + margemTroca - perdas, "lucro do dia bate com as três parcelas");
      assert(perdas !== 0, "o teste só vale se houve perda hoje");

      // E o bloco na tela tem que mostrar o mesmo número do banco.
      await recarregar("Dashboard");
      const bloco = await win.locator('h3:text("Fechamento de hoje")').locator("..").innerText();
      assert(bloco.includes(reaisBR(caixa)), `Fechamento devia mostrar ${reaisBR(caixa)}:\n${bloco}`);
    });

    await caso("91. desfazer a troca tira a diferença do caixa junto", async () => {
      const a = await novaPeca("C91A", 5, 10000, 20000);
      const b = await novaPeca("C91B", 5, 15000, 24000);
      const antes = await caixaDoDia("debito");
      await trocarVenda("C91A", b, "Com defeito", { formaDif: "Débito" });
      assert.strictEqual((await caixaDoDia("debito")) - antes, 4000);
      await recarregar("Venda");
      await win.click('tr:has-text("trocado por 1x C91B") button:text-is("Desfazer")');
      await win.waitForTimeout(500);
      assert.strictEqual(await caixaDoDia("debito"), antes, "desfez a troca, o dinheiro sai do caixa");
    });

    await caso("92. troca antiga (sem diferença) não mexe em total nenhum", async () => {
      const id = await novaPeca("C92", 5, 10000, 20000);
      const antes = await um(`SELECT COALESCE(SUM(valor),0) AS t FROM movimentos
                              WHERE date(criado_em) = date('now','localtime')`);
      // Como as que já estavam no banco antes da atualização: diferenca 0, forma NULL.
      await sql("INSERT INTO trocas (modelo, defeito, valor_compra, peca_id) VALUES ('C92 antiga','não liga',10000,?)", [id]);
      const depois = await um(`SELECT COALESCE(SUM(valor),0) AS t FROM movimentos
                               WHERE date(criado_em) = date('now','localtime')`);
      assert.strictEqual(depois.t, antes.t, "troca sem diferença fica fora do caixa");
    });

    await caso("93. troca com peça de reposição sumida ainda bloqueia o Desfazer da venda", async () => {
      const a = await novaPeca("C93A", 5, 10000, 20000);
      const b = await novaPeca("C93B", 5, 10000, 20000);
      await trocarVenda("C93A", b, "Com defeito");
      const pid = (await vendasDe(a))[0].pedido_id;
      // É o que o "desativar demo" faz quando a reposição era peça fictícia.
      await sql("UPDATE trocas SET nova_peca_id = NULL WHERE peca_id = ?", [a]);
      await recarregar("Venda");
      // Com JOIN interno a troca sumia da tela, o Desfazer voltava e o DELETE
      // batia na FK de trocas.venda_id — a venda parecia livre e não era.
      assert.strictEqual(await win.locator(`#pedido-${pid} button:text-is("Desfazer")`).count(), 0,
        "venda com troca não pode oferecer Desfazer");
      assert(await win.locator(`#pedido-${pid}`).innerText().then((t) => t.includes("trocada")),
        "e tem que continuar marcada como trocada");
    });

    await caso("94. peça com perda não pode ser excluída", async () => {
      const id = await novaPeca("C94", 5, 4000, 9000);
      // Perda sem troca do lado: é a forma que a perda de lote vai ter (passo 19).
      await sql("INSERT INTO perdas (peca_id, valor, motivo) VALUES (?, 4000, 'perda solta')", [id]);
      await recarregar("Estoque");
      const errosAntes = erros.length;
      await win.click('tr:has-text("C94") button:text-is("Excluir")');
      await win.waitForTimeout(500);
      assert(await peca(id), "a peça tinha que continuar no estoque");
      // Sobreviver não basta: sem o aviso o DELETE ia até o banco e morria na FK,
      // o que também deixa a peça viva — mas com erro na cara do usuário.
      assert.strictEqual(erros.length, errosAntes, "tinha que ser recusado no aviso, não estourar no SQL");
      await sql("DELETE FROM perdas WHERE motivo = 'perda solta'");
    });

    console.log("\nLucro exato da troca e perdas no lucro (passo 17b)");

    const lucroHoje = async () =>
      (await um(`SELECT COALESCE(SUM(lucro),0) AS l FROM movimentos WHERE date(criado_em) = date('now','localtime')`)).l;

    await caso("95. reposição do mesmo custo: a diferença inteira é margem", async () => {
      // A custa 1000 e vende 2000; B custa o MESMO 1000 e vende 2500.
      const a = await novaPeca("C95A", 5, 100000, 200000);
      const b = await novaPeca("C95B", 5, 100000, 250000);
      const antes = await lucroHoje();
      await trocarVenda("C95A", b, "Com defeito", { formaVenda: "Pix", formaDif: "Pix" });
      // Venda 1000 de margem + diferença 500 que não cobre custo nenhum = 1500.
      assert.strictEqual((await lucroHoje()) - antes, 150000, "diferença sem custo a mais é margem limpa");
      const t = await um("SELECT * FROM trocas WHERE peca_id = ?", [a]);
      assert.strictEqual(t.nova_preco_compra, 100000, "custo da reposição fica congelado na troca");
    });

    await caso("96. reposição mais cara: a diferença só cobre o custo, margem zero", async () => {
      // A custa 1000/vende 2000; B custa 1500/vende 2500 — os 500 cobrem os 500.
      const a = await novaPeca("C96A", 5, 100000, 200000);
      const b = await novaPeca("C96B", 5, 150000, 250000);
      const antes = await lucroHoje();
      await trocarVenda("C96A", b, "Com defeito", { formaVenda: "Pix", formaDif: "Pix" });
      assert.strictEqual((await lucroHoje()) - antes, 100000, "só a margem da venda; a troca não acrescenta nada");
      const t = await um("SELECT * FROM trocas WHERE peca_id = ?", [a]);
      assert.strictEqual(t.diferenca, 50000);
    });

    await caso("97. troca sem diferença por peça mais cara é prejuízo", async () => {
      // Mesmo preço de venda, custo maior: nada é cobrado e a loja come o custo a mais.
      const a = await novaPeca("C97A", 5, 100000, 200000);
      const b = await novaPeca("C97B", 5, 130000, 200000);
      const antes = await lucroHoje();
      await trocarVenda("C97A", b, "Com defeito", { formaVenda: "Pix" });
      const t = await um("SELECT * FROM trocas WHERE peca_id = ?", [a]);
      assert.strictEqual(t.diferenca, 0, "sem diferença a cobrar");
      // Venda 1000 de margem − 300 do custo a mais entregue de graça = 700.
      assert.strictEqual((await lucroHoje()) - antes, 70000, "entregar peça mais cara de graça custa a diferença");
    });

    await caso("98. perda desconta do lucro sem mexer no faturamento", async () => {
      const a = await novaPeca("C98A", 5, 40000, 90000);
      const b = await novaPeca("C98B", 5, 40000, 90000);
      const fat = async () =>
        (await um(`SELECT COALESCE(SUM(valor),0) AS v FROM movimentos WHERE date(criado_em) = date('now','localtime')`)).v;
      const [fatAntes, lucroAntes] = [await fat(), await lucroHoje()];
      await trocarVenda("C98A", b, "Com defeito", { formaVenda: "Pix", perda: "descartada" });
      assert.strictEqual((await fat()) - fatAntes, 90000, "faturamento é só a venda: perda não passa pela gaveta");
      // Margem da venda 500 − perda 400 (o custo da peça que virou lixo) = 100.
      assert.strictEqual((await lucroHoje()) - lucroAntes, 10000, "a perda sai do lucro");
    });

    await caso("99. troca anterior à coluna continua sem lucro e sem quebrar", async () => {
      const id = await novaPeca("C99", 5, 100000, 200000);
      const antes = await lucroHoje();
      // Como as que já estavam no banco: diferença cobrada, custo da reposição desconhecido.
      await sql(`INSERT INTO trocas (modelo, defeito, peca_id, valor_compra, diferenca, forma_pagamento)
                 VALUES ('C99 antiga','não liga',?,100000,50000,'pix')`, [id]);
      assert.strictEqual((await lucroHoje()) - antes, 0,
        "sem o custo da reposição não dá pra saber a margem: fica 0, como era");
      const [{ v }] = await sql(`SELECT COALESCE(SUM(valor),0) AS v FROM movimentos
                                 WHERE date(criado_em) = date('now','localtime') AND tipo = 'troca'`);
      assert(v >= 50000, "mas o dinheiro dela continua no faturamento");
    });

    await caso("100. reposição mais barata: devolve pouco e sobra margem", async () => {
      // A custa 1000/vende 2000; B custa 600/vende 1800 — a loja devolve 200 e
      // fica com uma peça 400 mais barata. Os dois sinais invertidos de uma vez.
      const a = await novaPeca("C100A", 5, 100000, 200000);
      const b = await novaPeca("C100B", 5, 60000, 180000);
      const antes = await lucroHoje();
      await trocarVenda("C100A", b, "Com defeito", { formaVenda: "Pix", formaDif: "Pix" });
      const t = await um("SELECT * FROM trocas WHERE peca_id = ?", [a]);
      assert.strictEqual(t.diferenca, -20000, "1.800 − 2.000 = 200 devolvidos");
      // Venda 1000 de margem + (−200 devolvidos + 400 de custo economizado) = 1200.
      assert.strictEqual((await lucroHoje()) - antes, 120000,
        "devolver 200 e entregar peça 400 mais barata sobra 200 de margem");
    });

    await caso("101. desfazer a troca tira a margem dela do lucro", async () => {
      const a = await novaPeca("C101A", 5, 100000, 200000);
      const b = await novaPeca("C101B", 5, 100000, 250000);
      const soVenda = await lucroHoje();
      await trocarVenda("C101A", b, "Com defeito", { formaVenda: "Pix", formaDif: "Pix" });
      const comTroca = await lucroHoje();
      assert.strictEqual(comTroca - soVenda, 150000, "venda 1.000 + margem da troca 500");
      await recarregar("Venda");
      await win.click('tr:has-text("trocado por 1x C101B") button:text-is("Desfazer")');
      await win.waitForTimeout(500);
      // Volta a ser só a venda: os 500 da troca somem junto com ela.
      assert.strictEqual((await lucroHoje()) - soVenda, 100000, "sem a troca, sobra só a margem da venda");
    });

    console.log("\nEstorno (passo 18)");

    // Vende A e, na troca, devolve o dinheiro em vez de repor peça.
    const estornar = async (nomeA, opts = {}) => {
      await recarregar("Venda");
      await aoCarrinho(nomeA);
      await win.click('button:text("Finalizar venda")');
      if (opts.formaVenda) await win.click(`button:text-is("${opts.formaVenda}")`);
      await confirmarVenda();
      const pid = (await um("SELECT pedido_id FROM vendas WHERE peca_id = (SELECT id FROM pecas WHERE nome = ?) ORDER BY id DESC", [nomeA])).pedido_id;
      await win.click(`#pedido-${pid} button:text-is("Trocar")`);
      await win.waitForSelector("text=Estado da peça devolvida", { timeout: 8000 });
      if (opts.funcionando) await win.click('button:text-is("Funcionando")');
      else await win.fill('label:has-text("Defeito") input', "não liga");
      if (opts.perda) {
        await win.click('button:text-is("Descarte → perda")');
        await win.fill('label:has-text("Motivo da perda") input', opts.perda);
      }
      await win.click('button:text-is("Estornar o valor")');
      await win.waitForSelector("text=Valor a devolver", { timeout: 8000 });
      if (opts.valor !== undefined) await win.fill('input[aria-label="Valor do estorno"]', opts.valor);
      if (opts.forma) await win.click(`div:has-text("Por onde o dinheiro saiu") > div > button:text-is("${opts.forma}")`);
      await win.click('button:text-is("Salvar")');
      if (!opts.esperaRecusa) await win.waitForSelector("text=Prateleira", { timeout: 8000 });
      return pid;
    };

    await caso("102. estorno sai do caixa na forma escolhida e não repõe peça", async () => {
      const a = await novaPeca("C102", 5, 100000, 200000);
      const antes = await caixaDoDia("pix");
      await estornar("C102", { formaVenda: "Pix", forma: "Pix" });
      const t = await um("SELECT * FROM trocas WHERE peca_id = ?", [a]);
      assert.strictEqual(t.estorno, 200000, "devolveu o valor pago");
      assert.strictEqual(t.nova_peca_id, null, "estorno não tem peça de reposição");
      // Entrou 2.000 da venda e saiu 2.000 do estorno: o Pix do dia fica igual.
      assert.strictEqual(await caixaDoDia("pix"), antes, "venda e estorno se anulam no caixa");
    });

    await caso("103. estorno com a peça voltando boa zera o lucro da venda", async () => {
      const a = await novaPeca("C103", 5, 100000, 200000);
      const antes = await lucroHoje();
      await estornar("C103", { formaVenda: "Pix", forma: "Pix", funcionando: true });
      // Vendeu (+1.000 de margem), devolveu 2.000 e recuperou a peça de 1.000.
      assert.strictEqual((await lucroHoje()) - antes, 0, "a operação inteira se anula");
      assert.strictEqual((await peca(a)).quantidade, 5, "a peça boa volta pro estoque");
    });

    await caso("104. estorno com a peça descartada deixa o prejuízo do custo", async () => {
      const a = await novaPeca("C104", 5, 100000, 200000);
      const antes = await lucroHoje();
      await estornar("C104", { formaVenda: "Pix", forma: "Pix", perda: "quebrada" });
      // Devolveu o dinheiro e ainda perdeu a peça: sobra o custo dela no negativo.
      assert.strictEqual((await lucroHoje()) - antes, -100000, "prejuízo = custo da peça que virou lixo");
      assert.strictEqual((await peca(a)).quantidade, 4, "a peça descartada não volta pro estoque");
    });

    await caso("105. estorno parcial devolve exatamente o valor digitado", async () => {
      const a = await novaPeca("C105", 5, 100000, 200000);
      const antes = await caixaDoDia("debito");
      await estornar("C105", { formaVenda: "Débito", forma: "Débito", valor: "180,00" });
      assert.strictEqual((await um("SELECT estorno FROM trocas WHERE peca_id = ?", [a])).estorno, 18000);
      // Entrou 2.000, saiu 180: sobra 1.820 no débito do dia.
      assert.strictEqual((await caixaDoDia("debito")) - antes, 182000);
    });

    await caso("106. estorno sem forma de pagamento é recusado", async () => {
      const a = await novaPeca("C106", 5, 100000, 200000);
      await estornar("C106", { formaVenda: "Pix", esperaRecusa: true }); // sem escolher forma
      await win.waitForTimeout(400);
      assert(await win.locator("text=Valor a devolver").count(), "tinha que continuar no formulário");
      assert.strictEqual(await um("SELECT id FROM trocas WHERE peca_id = ?", [a]), undefined, "nada gravado");
      await win.click('button:text-is("Cancelar")');
    });

    await caso("107. a venda estornada continua no histórico, marcada", async () => {
      const a = await novaPeca("C107", 5, 100000, 200000);
      const pid = await estornar("C107", { formaVenda: "Pix", forma: "Pix" });
      // O faturamento do dia da venda não pode encolher por causa da devolução.
      const [v] = await vendasDe(a);
      assert(v, "a venda não pode sumir do histórico");
      assert.strictEqual(v.preco_venda, 200000, "nem ser reescrita");
      await recarregar("Dashboard");
      assert(await win.locator(`tr:has-text("C107"):has-text("estornada R$ 2.000,00")`).count(),
        "o histórico marca a venda como estornada, com o valor");
    });

    await caso("108. estorno de venda de ontem sai do caixa de hoje, e ontem não muda", async () => {
      const id = await novaPeca("C108", 5, 100000, 200000);
      const ontem = async () =>
        (await um(`SELECT COALESCE(SUM(valor),0) AS v FROM movimentos
                   WHERE date(criado_em) = date('now','localtime','-1 day')`)).v;
      await sql(`INSERT INTO vendas (peca_id, quantidade, preco_venda, preco_compra, pedido_id, forma_pagamento, criado_em)
                 VALUES (?,1,200000,100000,1080,'pix', datetime('now','localtime','-1 day'))`, [id]);
      const [ontemAntes, hojeAntes] = [await ontem(), await caixaDoDia("pix")];

      await recarregar("Venda");
      await win.click('button:text-is("Ontem")'); // a venda de ontem não aparece no filtro padrão
      await win.waitForSelector("#pedido-1080", { timeout: 8000 });
      await win.click('#pedido-1080 button:text-is("Trocar")');
      await win.waitForSelector("text=Estado da peça devolvida", { timeout: 8000 });
      await win.fill('label:has-text("Defeito") input', "não liga");
      await win.click('button:text-is("Estornar o valor")');
      await win.waitForSelector("text=Valor a devolver", { timeout: 8000 });
      await win.click('div:has-text("Por onde o dinheiro saiu") > div > button:text-is("Pix")');
      await win.click('button:text-is("Salvar")');
      await win.waitForSelector("text=Prateleira", { timeout: 8000 });

      assert.strictEqual(await ontem(), ontemAntes, "o faturamento de ontem não pode encolher");
      assert.strictEqual((await caixaDoDia("pix")) - hojeAntes, -200000, "o dinheiro sai do caixa de hoje");
    });

    await caso("109. desfazer o estorno devolve o dinheiro pro caixa", async () => {
      const id = await novaPeca("C109", 5, 100000, 200000);
      const antes = await caixaDoDia("pix");
      await estornar("C109", { formaVenda: "Pix", forma: "Pix" });
      assert.strictEqual(await caixaDoDia("pix"), antes, "venda e estorno se anulam");
      await recarregar("Venda");
      await win.click('tr:has-text("estornado") button:text-is("Desfazer")');
      await win.waitForTimeout(500);
      // Sem o estorno sobra só a venda: o Pix do dia sobe os 2.000 dela.
      assert.strictEqual((await caixaDoDia("pix")) - antes, 200000, "desfez o estorno, o dinheiro volta");
      assert.strictEqual(await um("SELECT id FROM trocas WHERE peca_id = ?", [id]), undefined);
    });

    console.log("\nCrédito parcial do lote (passo 19)");

    // Põe N peças na prateleira, fecha o lote e abre a tela de fechamento dele.
    const loteDe = async (prefixo, custos) => {
      for (const [i, c] of custos.entries()) {
        await sql("INSERT INTO trocas (modelo, defeito, valor_compra, defeituosa) VALUES (?,?,?,1)",
          [`${prefixo}${i}`, "não liga", c]);
      }
      await recarregar("Trocas");
      for (const [i] of custos.entries()) {
        await win.click(`tr:has-text("${prefixo}${i}") input[type="checkbox"]`);
      }
      await win.click('button:text("Fechar lote e enviar")');
      await win.waitForTimeout(600);
      const l = await um("SELECT * FROM lotes ORDER BY id DESC");
      await win.click(`tr:has-text("Lote #${l.id}") button:text("Lote retornou")`);
      await win.waitForSelector("text=Confirmar fechamento", { timeout: 8000 });
      return l;
    };

    await caso("110. valor total: o que o fornecedor não creditou vira perda", async () => {
      const l = await loteDe("C110-", [20000, 15000, 10000, 5000]); // 500,00 no total
      await win.fill('input[aria-label="Valor creditado"]', "320,00");
      await win.waitForTimeout(300);
      assert(await win.locator("text=perda R$ 180,00").count(), "o rodapé mostra a perda antes de confirmar");
      await win.click('button:text("Confirmar fechamento")');
      await win.waitForTimeout(600);

      const lote = await um("SELECT * FROM lotes WHERE id = ?", [l.id]);
      assert.strictEqual(lote.status, "resolvido");
      assert.strictEqual(lote.credito, 32000);
      assert.strictEqual(lote.perda, 18000);
      assert.strictEqual((await um("SELECT valor FROM creditos ORDER BY id DESC")).valor, 32000, "crédito só do valor aceito");
      const p = await um("SELECT * FROM perdas ORDER BY id DESC");
      assert.strictEqual(p.valor, 18000, "a diferença vira perda");
      assert.strictEqual(p.troca_id, null, "no valor total não dá pra dizer qual peça foi recusada");
    });

    await caso("111. item a item: crédito das aceitas, uma perda por recusada", async () => {
      const l = await loteDe("C111-", [20000, 15000, 10000, 5000]);
      await win.click('button:text-is("Item a item")');
      await win.click('input[aria-label="Aceita C111-3"]'); // desmarca a de 50,00
      await win.waitForTimeout(300);
      assert(await win.locator("text=crédito R$ 450,00").count(), "crédito das 3 aceitas");
      assert(await win.locator("text=perda R$ 50,00").count(), "perda da recusada");
      await win.click('button:text("Confirmar fechamento")');
      await win.waitForTimeout(600);

      const lote = await um("SELECT * FROM lotes WHERE id = ?", [l.id]);
      assert.strictEqual(lote.credito, 45000);
      assert.strictEqual(lote.perda, 5000);
      const aceitas = await sql("SELECT COUNT(*) AS n FROM trocas WHERE lote_id = ? AND creditada = 1", [l.id]);
      assert.strictEqual(aceitas[0].n, 3, "as 3 aceitas ficam marcadas");
      const perdas = await sql("SELECT * FROM perdas WHERE motivo LIKE ?", [`Lote #${l.id}%`]);
      assert.strictEqual(perdas.length, 1, "uma perda por peça recusada");
      assert.strictEqual(perdas[0].valor, 5000);
      assert(perdas[0].troca_id, "aqui dá pra dizer qual peça foi: a perda aponta pra troca");
    });

    await caso("112. lote sem nenhum item aceito: crédito zero, tudo em perda", async () => {
      const l = await loteDe("C112-", [30000, 20000]);
      await win.click('button:text-is("Item a item")');
      for (const i of [0, 1]) await win.click(`input[aria-label="Aceita C112-${i}"]`);
      await win.waitForTimeout(300);
      const creditosAntes = (await sql("SELECT id FROM creditos")).length;
      await win.click('button:text("Confirmar fechamento")');
      await win.waitForTimeout(600);

      const lote = await um("SELECT * FROM lotes WHERE id = ?", [l.id]);
      assert.strictEqual(lote.credito, 0);
      assert.strictEqual(lote.perda, 50000, "o lote inteiro virou prejuízo");
      assert.strictEqual((await sql("SELECT id FROM creditos")).length, creditosAntes,
        "crédito zero não gera linha no histórico de crédito");
    });

    await caso("113. crédito maior que o valor do lote é recusado", async () => {
      const l = await loteDe("C113-", [10000]);
      await win.fill('input[aria-label="Valor creditado"]', "500,00"); // lote é 100,00
      await win.click('button:text("Confirmar fechamento")');
      await win.waitForTimeout(400);
      assert(await win.locator("text=Confirmar fechamento").count(), "tem que continuar aberto");
      assert.strictEqual((await um("SELECT status FROM lotes WHERE id = ?", [l.id])).status, "enviado",
        "o lote não pode ter sido fechado");
      await win.click('button:text-is("Cancelar")');
    });

    await caso("114. perda do lote entra no lucro pela data em que o lote foi resolvido", async () => {
      const antes = await lucroHoje();
      const l = await loteDe("C114-", [25000, 25000]);
      await win.fill('input[aria-label="Valor creditado"]', "300,00"); // de 500,00 → perda 200,00
      await win.click('button:text("Confirmar fechamento")');
      await win.waitForTimeout(600);
      assert.strictEqual((await lucroHoje()) - antes, -20000, "a perda do lote abate o lucro de hoje");
      const p = await um("SELECT * FROM perdas WHERE motivo LIKE ?", [`Lote #${l.id}%`]);
      assert.strictEqual(p.criado_em.slice(0, 10), (await um("SELECT date('now','localtime') AS d")).d,
        "conta no dia em que o lote foi fechado, não no da troca");
    });

    await caso("115. fornecedor aceitou tudo: crédito cheio e nenhuma perda", async () => {
      const l = await loteDe("C115-", [12000, 8000]); // 200,00
      const perdasAntes = (await sql("SELECT id FROM perdas")).length;
      const saldoAntes = (await um("SELECT COALESCE(SUM(valor),0) AS s FROM creditos")).s;
      await win.click('button:text("Confirmar fechamento")'); // valor já vem cheio
      await win.waitForTimeout(600);
      const lote = await um("SELECT * FROM lotes WHERE id = ?", [l.id]);
      assert.strictEqual(lote.credito, 20000, "creditou o lote inteiro");
      assert.strictEqual(lote.perda, 0);
      assert.strictEqual((await sql("SELECT id FROM perdas")).length, perdasAntes,
        "aceitar tudo não pode inventar perda");
      assert.strictEqual((await um("SELECT COALESCE(SUM(valor),0) AS s FROM creditos")).s - saldoAntes, 20000,
        "o saldo com o fornecedor sobe o valor creditado");
    });

    console.log("\nDetalhe do lote item a item (passo 20)");

    await caso("116. lote item a item expande mostrando aceitas e recusadas", async () => {
      const l = await loteDe("C116-", [30000, 20000, 10000]); // 600,00
      await win.click('button:text-is("Item a item")');
      await win.click('input[aria-label="Aceita C116-2"]'); // recusa a de 100,00
      await win.click('button:text("Confirmar fechamento")');
      await win.waitForTimeout(600);

      const linha = win.locator(`tr:has-text("Lote #${l.id}")`).first();
      assert.strictEqual(await win.locator('text=✔ C116-0').count(), 0, "começa recolhido");
      await linha.click();
      await win.waitForTimeout(300);
      assert(await win.locator("text=2 itens creditados (R$ 500,00)").count(), "cabeçalho com as aceitas");
      assert(await win.locator("text=1 perdido (R$ 100,00)").count(), "e com as perdidas");
      assert(await win.locator("text=✔ C116-0").count(), "aceita marcada");
      assert(await win.locator("text=✖ C116-2").count(), "recusada marcada");
      // O valor ao lado da recusada vem da tabela perdas, não da coluna do lote —
      // o cabeçalho acima estaria certo mesmo se esse número viesse errado.
      const [perda] = await sql("SELECT valor FROM perdas WHERE motivo LIKE ?", [`Lote #${l.id}%`]);
      assert(await win.locator(`text=perda ${reaisBR(perda.valor).replace(/^/, "R$ ")}`).count(),
        "a linha da recusada mostra a perda registrada pra ela");
      await linha.click();
      await win.waitForTimeout(300);
      assert.strictEqual(await win.locator("text=✔ C116-0").count(), 0, "clicar de novo recolhe");
    });

    await caso("117. lote por valor total expande sem dizer quais peças foram recusadas", async () => {
      const l = await loteDe("C117-", [20000, 20000]); // 400,00
      await win.fill('input[aria-label="Valor creditado"]', "250,00");
      await win.click('button:text("Confirmar fechamento")');
      await win.waitForTimeout(600);

      await win.locator(`tr:has-text("Lote #${l.id}")`).first().click();
      await win.waitForTimeout(300);
      // Nos dois modos aparece crédito E perda; aqui sem marcar item, porque
      // fechado pelo total ninguém sabe qual peça o fornecedor recusou.
      assert(await win.locator("text=crédito R$ 250,00").count(), "crédito do lote");
      assert(await win.locator("text=perda R$ 150,00").count(), "e a perda, nunca só o crédito");
      assert(await win.locator("text=não dá pra saber quais peças").count(), "avisa a limitação do modo");
      assert.strictEqual(await win.locator("text=✔ C117-0").count(), 0, "nenhum item marcado como aceito");
      assert(await win.locator('text=C117-0').count(), "mas os itens aparecem listados");
    });

    await caso("118. lote sem crédito nenhum também abre, com tudo em perda", async () => {
      // É o caso que não aparece no histórico de crédito: sem crédito, sem linha lá.
      const l = await loteDe("C118-", [15000, 15000]);
      await win.click('button:text-is("Item a item")');
      for (const i of [0, 1]) await win.click(`input[aria-label="Aceita C118-${i}"]`);
      await win.click('button:text("Confirmar fechamento")');
      await win.waitForTimeout(600);

      await win.locator(`tr:has-text("Lote #${l.id}")`).first().click();
      await win.waitForTimeout(300);
      assert(await win.locator("text=0 itens creditados (R$ 0,00)").count(), "nenhuma aceita");
      assert(await win.locator("text=2 perdidos (R$ 300,00)").count(), "lote inteiro perdido");
    });

    await caso("119. lote ainda enviado não expande", async () => {
      const l = await loteDe("C119-", [10000]);
      await win.click('button:text-is("Cancelar")'); // deixa o lote em aberto
      await win.waitForTimeout(300);
      await win.locator(`tr:has-text("Lote #${l.id}")`).first().click();
      await win.waitForTimeout(300);
      assert.strictEqual(await win.locator("text=itens creditados").count(), 0,
        "lote que ainda não voltou não tem o que detalhar");
    });

    console.log("\nArquivar produto (passo 21)");

    const totais = async () =>
      await um(`SELECT (SELECT COALESCE(SUM(valor),0) FROM movimentos) AS fat,
                       (SELECT COALESCE(SUM(lucro),0) FROM movimentos) AS lucro,
                       (SELECT COALESCE(SUM(valor),0) FROM perdas) AS perdas,
                       (SELECT COALESCE(SUM(quantidade),0) FROM pecas) AS estoque`);

    await caso("121. arquivar tira da lista do Estoque e da busca da Venda", async () => {
      const id = await novaPeca("C121", 5, 10000, 20000);
      await vender("C121"); // com venda, não pode mais ser excluída
      await recarregar("Estoque");
      await win.click('tr:has-text("C121") button:text-is("Arquivar")');
      await win.waitForTimeout(500);
      assert.strictEqual((await peca(id)).arquivado, 1);
      assert.strictEqual(await win.locator('tr:has-text("C121")').count(), 0, "sai da lista do Estoque");
      await recarregar("Venda");
      await win.fill(BUSCA_VENDA, "C121");
      await win.waitForTimeout(300);
      assert.strictEqual(await win.locator('tr:has-text("C121") button:text("+ Adicionar")').count(), 0,
        "não aparece mais pra vender");
    });

    await caso("122. arquivar não mexe em nenhum total nem no estoque", async () => {
      const id = await novaPeca("C122", 7, 10000, 20000);
      await vender("C122");
      const antes = await totais();
      await recarregar("Estoque");
      await win.click('tr:has-text("C122") button:text-is("Arquivar")');
      await win.waitForTimeout(500);
      const depois = await totais();
      // Arquivar é organização de tela: não é baixa de mercadoria nem perda.
      assert.deepStrictEqual(depois, antes, "faturamento, lucro, perdas e estoque têm que ficar iguais");
      assert.strictEqual((await peca(id)).quantidade, 6, "a peça que sobrou continua no estoque");
    });

    await caso("123. o histórico do produto arquivado continua no Dashboard", async () => {
      const id = await novaPeca("C123", 5, 10000, 20000);
      await vender("C123");
      await recarregar("Estoque");
      await win.click('tr:has-text("C123") button:text-is("Arquivar")');
      await win.waitForTimeout(500);
      await recarregar("Dashboard");
      const linha = win.locator('tr:has-text("C123")').first();
      assert(await linha.count(), "a venda do produto arquivado não pode sumir do histórico");
      assert(await linha.locator(':text("R$ 200,00")').count(), "com o total certo");
      assert.strictEqual((await vendasDe(id)).length, 1);
    });

    await caso("124. mostrar arquivados lista de volta, e desarquivar reverte", async () => {
      const id = await novaPeca("C124", 5, 10000, 20000);
      await vender("C124");
      await recarregar("Estoque");
      await win.click('tr:has-text("C124") button:text-is("Arquivar")');
      await win.waitForTimeout(500);
      assert.strictEqual(await win.locator('tr:has-text("C124")').count(), 0);

      await win.click('label:has-text("mostrar arquivados") input');
      await win.waitForTimeout(300);
      assert(await win.locator('tr:has-text("C124") button:text-is("Desarquivar")').count(),
        "aparece com o botão de desarquivar");
      await win.click('tr:has-text("C124") button:text-is("Desarquivar")');
      await win.waitForTimeout(500);
      assert.strictEqual((await peca(id)).arquivado, 0);
      await recarregar("Venda");
      await win.fill(BUSCA_VENDA, "C124");
      await win.waitForTimeout(300);
      assert(await win.locator('tr:has-text("C124") button:text("+ Adicionar")').count(),
        "volta a poder ser vendida");
    });

    await caso("125. produto sem movimento nenhum continua sendo excluído de verdade", async () => {
      const id = await novaPeca("C125", 5, 10000, 20000);
      await recarregar("Estoque");
      await win.click('tr:has-text("C125") button:text-is("Excluir")');
      await win.waitForTimeout(500);
      assert.strictEqual(await peca(id), undefined, "arquivar não substituiu o excluir");
    });

    console.log("\nImportação de produtos (passo 22)");

    const planilha = require("../electron/planilha.js");
    // Escreve a planilha que o app vai ler e abre a tela de importação.
    const importar = async (linhas) => {
      fs.writeFileSync(planilhaEntrada, planilha.escrever("Produtos", linhas));
      await recarregar("Config");
      await win.click('button:text("Importar planilha…")');
      await win.click('button:text("Escolher planilha…")');
      await win.waitForSelector("text=nada é gravado até você confirmar", { timeout: 8000 });
    };
    const confirmar = async () => {
      await win.click('button[aria-label="Confirmar importação"]');
      await win.waitForSelector("text=nada é gravado até você confirmar", { state: "detached", timeout: 8000 });
    };
    const CAB = ["Tipo", "Modelo", "Qtd", "Preço de compra", "Preço de venda"];
    // A leva mais recente é a primeira linha da lista de entradas do Estoque.
    const desfazerUltimaImportacao = async () => {
      await win.locator('button:text-is("Desfazer importação")').first().click();
      await win.waitForTimeout(700);
    };

    await caso("126. importa produtos novos com código gerado e grava a entrada", async () => {
      await importar([CAB,
        ["Zcabo", "C126 UM", 10, 12, 30],
        ["Zcabo", "C126 DOIS", 5, 15, 35],
      ]);
      assert(await win.locator("text=Produtos novos (2)").count(), "os dois entram como novos");
      await confirmar();

      const a = await um("SELECT * FROM pecas WHERE modelo = 'C126 UM'");
      assert.strictEqual(a.nome, "Zcabo");
      assert.strictEqual(a.quantidade, 10);
      assert.strictEqual(a.preco_compra, 1200, "preço em centavos");
      assert.strictEqual(a.preco_venda, 3000);
      assert(/^ZC\d{3}$/.test(a.codigo), `código devia sair do tipo: ${a.codigo}`);
      const e = await um("SELECT * FROM entradas WHERE peca_id = ?", [a.id]);
      assert(e, "importação tem que gravar entrada");
      assert.strictEqual(e.quantidade, 10);
      assert(e.observacao.startsWith("importação"), e.observacao);
    });

    await caso("127. importar de novo soma estoque e recalcula o custo médio", async () => {
      const antes = await um("SELECT * FROM pecas WHERE modelo = 'C126 UM'"); // 10 un a 12,00
      await importar([CAB, ["Zcabo", "C126 UM", 10, 20, 30]]); // mais 10 a 20,00
      assert(await win.locator("text=Só somam estoque (1)").count(), "casou pelo nome");
      await confirmar();
      const p = await um("SELECT * FROM pecas WHERE modelo = 'C126 UM'");
      assert.strictEqual(p.id, antes.id, "não pode criar produto novo");
      assert.strictEqual(p.quantidade, 20);
      assert.strictEqual(p.preco_compra, 1600, "média de 10 a 12,00 com 10 a 20,00");
    });

    await caso("128. C/A e COM ARO casam como o mesmo produto", async () => {
      await importar([CAB, ["Ztela", "C128 C/A DIAMONDS", 3, 50, 90]]);
      await confirmar();
      // O fornecedor escreve das duas formas no mesmo arquivo: não pode duplicar.
      await importar([CAB, ["Ztela", "C128 COM ARO DIAMONDS", 2, 50, 90]]);
      assert(await win.locator("text=Só somam estoque (1)").count(), "tem que reconhecer como o mesmo");
      await confirmar();
      const iguais = await sql("SELECT * FROM pecas WHERE modelo LIKE 'C128%'");
      assert.strictEqual(iguais.length, 1, "não pode ter criado um segundo");
      assert.strictEqual(iguais[0].quantidade, 5);
    });

    await caso("129. preço divergente vem primeiro e só muda se mandar atualizar", async () => {
      await importar([CAB, ["Zcabo", "C129", 4, 10, 40]]);
      await confirmar();
      await importar([CAB, ["Zcabo", "C129", 4, 10, 55]]); // preço de venda diferente
      const cabecalhos = await win.locator('td[colspan="5"]').allInnerTexts();
      assert(cabecalhos[0].includes("Preço diferente"), `divergente devia vir primeiro: ${cabecalhos[0]}`);
      assert(await win.locator("text=R$ 40,00 → R$ 55,00").count(), "mostra de → para");
      await confirmar(); // padrão é "manter"
      assert.strictEqual((await um("SELECT preco_venda FROM pecas WHERE modelo = 'C129'")).preco_venda, 4000,
        "manter não pode mexer no preço");

      await importar([CAB, ["Zcabo", "C129", 4, 10, 55]]);
      await win.click('button:text("atualizar todos")');
      await confirmar();
      assert.strictEqual((await um("SELECT preco_venda FROM pecas WHERE modelo = 'C129'")).preco_venda, 5500,
        "atualizar tem que gravar o preço novo");
    });

    await caso("130. linha CANCELADA é ignorada e produto novo sem preço fica de fora", async () => {
      await importar([
        ["Tipo", "Modelo", "Qtd", "Preço de compra", "Preço de venda", "Status"],
        ["Zcabo", "C130 OK", 5, 10, 25, "OK"],
        ["Zcabo", "C130 CANCELADO", 5, 10, 25, "CANCELADO"],
        ["Zcabo", "C130 SEM PRECO", 5, 10, "", "OK"],
      ]);
      assert(await win.locator("text=1 cancelados").count(), "conta o cancelado");
      assert(await win.locator("text=produto novo sem preço de venda").count(), "acusa a pendência");
      await confirmar();
      assert(await um("SELECT id FROM pecas WHERE modelo = 'C130 OK'"));
      assert.strictEqual(await um("SELECT id FROM pecas WHERE modelo = 'C130 CANCELADO'"), undefined);
      assert.strictEqual(await um("SELECT id FROM pecas WHERE modelo = 'C130 SEM PRECO'"), undefined);
    });

    await caso("131. com a coluna Código casa mesmo depois de renomear o produto", async () => {
      await importar([CAB, ["Ztela", "C131 ORIGINAL", 6, 40, 80]]);
      await confirmar();
      const p = await um("SELECT * FROM pecas WHERE modelo = 'C131 ORIGINAL'");
      await sql("UPDATE pecas SET modelo = 'C131 renomeada na mão' WHERE id = ?", [p.id]);
      // É esse o motivo de existir a coluna Código: nome mudou, o vínculo não.
      await importar([["Código", ...CAB], [p.codigo, "Ztela", "C131 ORIGINAL", 4, 40, 80]]);
      assert(await win.locator("text=Só somam estoque (1)").count(), "casou pelo código");
      await confirmar();
      const depois = await um("SELECT * FROM pecas WHERE id = ?", [p.id]);
      assert.strictEqual(depois.quantidade, 10, "somou no produto certo");
      assert.strictEqual(depois.modelo, "C131 renomeada na mão", "importação não renomeia o cadastro");
      assert.strictEqual((await sql("SELECT id FROM pecas WHERE modelo = 'C131 ORIGINAL'")).length, 0,
        "e não criou duplicata");
    });

    await caso("132. desfazer a importação reverte quantidade e custo médio", async () => {
      await importar([CAB, ["Zcabo", "C132", 8, 10, 30]]);
      await confirmar();
      const p = await um("SELECT * FROM pecas WHERE modelo = 'C132'");
      await importar([CAB, ["Zcabo", "C132", 8, 30, 30]]); // custo bem diferente
      await confirmar();
      const meio = await um("SELECT * FROM pecas WHERE id = ?", [p.id]);
      assert.strictEqual(meio.quantidade, 16);
      assert.strictEqual(meio.preco_compra, 2000, "média de 8 a 10,00 com 8 a 30,00");

      await recarregar("Estoque");
      await desfazerUltimaImportacao();
      const volta = await um("SELECT * FROM pecas WHERE id = ?", [p.id]);
      assert.strictEqual(volta.quantidade, 8, "quantidade volta");
      assert.strictEqual(volta.preco_compra, 1000, "e o custo também");
    });

    await caso("151. desfazer a importação tira a leva inteira de uma vez", async () => {
      await importar([CAB,
        ["Zcabo", "C151 UM", 10, 12, 30],
        ["Zcabo", "C151 DOIS", 4, 15, 35],
        ["Zcabo", "C151 TRES", 7, 20, 45],
      ]);
      await confirmar();
      assert.strictEqual((await sql("SELECT id FROM pecas WHERE modelo LIKE 'C151%'")).length, 3);
      const { leva } = await um("SELECT MAX(importacao_id) AS leva FROM entradas");

      await recarregar("Estoque");
      assert(await win.locator('tr:has-text("3 produtos")').count(), "a leva aparece agrupada numa linha só");
      await desfazerUltimaImportacao();
      assert.strictEqual((await sql("SELECT id FROM pecas WHERE modelo LIKE 'C151%'")).length, 0,
        "produto criado pela importação some junto");
      assert.strictEqual((await sql("SELECT id FROM entradas WHERE importacao_id = ?", [leva])).length, 0,
        "e as entradas dela também");
    });

    await caso("152. desfazer não mexe em produto que já existia antes da importação", async () => {
      const id = await novaPeca("C152", 6, 5000, 9000);
      await importar([["Código", ...CAB], [(await peca(id)).codigo, "Zcabo", "C152", 4, 80, 90]]);
      await confirmar();
      const meio = await peca(id);
      assert.strictEqual(meio.quantidade, 10);
      assert.strictEqual(meio.preco_compra, 6200, "média de 6 a 50,00 com 4 a 80,00");

      await recarregar("Estoque");
      await desfazerUltimaImportacao();
      const volta = await peca(id);
      assert(volta, "produto que já existia não pode ser excluído");
      assert.strictEqual(volta.quantidade, 6, "volta ao estoque de antes");
      assert.strictEqual(volta.preco_compra, 5000, "e ao custo de antes");
    });

    await caso("153. importação com produto já vendido é recusada inteira", async () => {
      await importar([CAB, ["Zcabo", "C153 UM", 5, 10, 30], ["Zcabo", "C153 DOIS", 5, 10, 30]]);
      await confirmar();
      const um1 = await um("SELECT * FROM pecas WHERE modelo = 'C153 UM'");
      await vender("C153 UM");

      await recarregar("Estoque");
      await desfazerUltimaImportacao();
      assert.strictEqual((await peca(um1.id)).quantidade, 4, "nada pode ter sido revertido");
      assert.strictEqual((await sql("SELECT id FROM pecas WHERE modelo = 'C153 DOIS'")).length, 1,
        "desfazer pela metade deixaria o estoque num meio-termo: ou vai tudo, ou nada");
    });

    await caso("133. planilha do estoque sai com Código e reimporta casando por ele", async () => {
      await recarregar("Config");
      await win.click('button:text("Baixar planilha do estoque")');
      await win.waitForTimeout(800);
      const linhas = planilha.ler(planilhaSaida, fs.readFileSync(planilhaSaida));
      assert.deepStrictEqual(linhas[0], ["Código", "Tipo", "Modelo", "Qtd", "Preço de compra", "Preço de venda"]);
      const c132 = linhas.find((l) => l[2] === "C132");
      assert(c132, "o estoque exportado tem que trazer os produtos");
      assert.strictEqual(c132[3], "8");
      assert.strictEqual(c132[4], "10", "preço sai em reais, não em centavos");
    });

    console.log("\nEstoque e entradas");

    await caso("15. cadastro com quantidade cria a entrada 'cadastro inicial'", async () => {
      await recarregar("Estoque");
      await win.click('button:text("+ Novo produto")');
      await win.fill('label:has-text("Produto") input', "P15");
      await win.fill('label:has-text("Quantidade") input', "5");
      await win.fill('label:has-text("Preço de compra") input', "10,00");
      await win.fill('label:has-text("Preço de venda") input', "20,00");
      await win.click('button:text-is("Salvar")');
      await win.waitForSelector("text=adicionado", { timeout: 8000 });
      await win.click('button:text-is("Concluir")');
      const p = await um("SELECT * FROM pecas WHERE nome = 'P15'");
      assert.strictEqual(p.quantidade, 5);
      assert.strictEqual(p.preco_compra, 1000);
      const e = await um("SELECT * FROM entradas WHERE peca_id = ?", [p.id]);
      assert(e, "deveria ter criado a entrada do cadastro");
      assert.strictEqual(e.observacao, "cadastro inicial");
      assert.strictEqual(e.quantidade, 5);
    });

    await caso("17. entrada recalcula o custo pela média ponderada", async () => {
      const id = await novaPeca("P17", 5, 1000, 2000);
      await recarregar("Estoque");
      await win.click('tr:has-text("P17") button:text("+ Entrada")');
      await win.fill('label:has-text("Quantidade recebida") input', "7");
      await win.fill('label:has-text("Preço de compra desta leva") input', "20,00");
      await win.click('button:text("Confirmar entrada")');
      await win.waitForSelector("text=+7x P17", { timeout: 8000 });
      const p = await peca(id);
      assert.strictEqual(p.quantidade, 12);
      assert.strictEqual(p.preco_compra, 1583, "média de (5×10,00 + 7×20,00) / 12");
    });

    await caso("18. desfazer entrada restaura quantidade e custo originais", async () => {
      const id = await um("SELECT id FROM pecas WHERE nome = 'P17'");
      await win.click('tr:has-text("+7x P17") button:text-is("Desfazer")');
      await win.waitForSelector("text=+7x P17", { state: "detached", timeout: 8000 });
      const p = await peca(id.id);
      assert.strictEqual(p.quantidade, 5);
      assert.strictEqual(p.preco_compra, 1000, "custo tem que voltar ao original");
    });

    await caso("19. desfazer entrada já vendida é recusado (não deixa estoque negativo)", async () => {
      const id = await novaPeca("P19", 0, 1000, 2000);
      await recarregar("Estoque");
      await win.click('tr:has-text("P19") button:text("+ Entrada")');
      await win.fill('label:has-text("Quantidade recebida") input', "5");
      await win.fill('label:has-text("Preço de compra desta leva") input', "10,00");
      await win.click('button:text("Confirmar entrada")');
      await win.waitForSelector("text=+5x P19", { timeout: 8000 });
      await vender("P19", { qtd: 5 });
      assert.strictEqual((await peca(id)).quantidade, 0);
      await recarregar("Estoque");
      await win.click('tr:has-text("+5x P19") button:text-is("Desfazer")');
      await win.waitForTimeout(500);
      assert.strictEqual((await peca(id)).quantidade, 0, "estoque não pode ficar negativo");
      assert(await win.locator("text=+5x P19").count(), "a entrada continua registrada");
    });

    await caso("20. excluir produto sem movimento remove do banco", async () => {
      const id = await novaPeca("P20", 3, 1000, 2000);
      await recarregar("Estoque");
      await win.click('tr:has-text("P20") button:text-is("Excluir")');
      await win.waitForSelector('tr:has-text("P20")', { state: "detached", timeout: 8000 });
      assert.strictEqual(await peca(id), undefined);
    });

    await caso("20b. excluir produto que só tem entrada leva a entrada junto", async () => {
      await recarregar("Estoque");
      await win.click('button:text("+ Novo produto")');
      await win.fill('label:has-text("Produto") input', "P20B");
      await win.fill('label:has-text("Quantidade") input', "4");
      await win.fill('label:has-text("Preço de compra") input', "10,00");
      await win.fill('label:has-text("Preço de venda") input', "20,00");
      await win.click('button:text-is("Salvar")');
      await win.waitForSelector("text=adicionado", { timeout: 8000 });
      await win.click('button:text-is("Concluir")');
      const p = await um("SELECT * FROM pecas WHERE nome = 'P20B'");
      assert(await um("SELECT * FROM entradas WHERE peca_id = ?", [p.id]), "cadastro gera entrada");
      await win.click('tr:has-text("P20B") button:text-is("Excluir")');
      await win.waitForSelector('tr:has-text("P20B")', { state: "detached", timeout: 8000 });
      assert.strictEqual(await peca(p.id), undefined, "peça tinha que sair");
      assert.strictEqual(await um("SELECT * FROM entradas WHERE peca_id = ?", [p.id]), undefined,
        "a entrada tinha que sair junto");
    });

    await caso("21. excluir produto com venda é recusado com aviso (histórico protegido)", async () => {
      const id = await novaPeca("P21", 3, 1000, 2000);
      await vender("P21");
      await recarregar("Estoque");
      await win.click('tr:has-text("P21") button:text-is("Excluir")');
      await win.waitForTimeout(500);
      assert(await peca(id), "a peça tem que continuar no banco");
      assert(await win.locator('tr:has-text("P21")').count(), "e continuar na tela");
      assert.strictEqual((await vendasDe(id)).length, 1, "a venda não pode ser tocada");
    });

    await caso("22. editar produto não mexe nas vendas antigas", async () => {
      const id = await novaPeca("P22", 5, 10000, 20000);
      await vender("P22");
      await recarregar("Estoque");
      await win.click('tr:has-text("P22") td:text-is("P22")');
      await win.fill('label:has-text("Preço de venda") input', "300,00");
      await win.click('button:text-is("Salvar")');
      await win.waitForSelector('button:text-is("Salvar")', { state: "detached", timeout: 8000 });
      assert.strictEqual((await peca(id)).preco_venda, 30000, "produto tem que atualizar");
      const [v] = await vendasDe(id);
      assert.strictEqual(v.preco_venda, 20000, "a venda antiga tem que manter o preço praticado");
    });

    console.log("\nTotais do estoque (passo 23)");

    // Um prefixo só destes casos: o banco da bateria já tem dezenas de produtos,
    // então o filtro é o que torna os totais previsíveis.
    const totaisEstoque = async (filtro) => {
      await win.fill(BUSCA_ESTOQUE, filtro);
      await win.waitForTimeout(300);
      return win.locator('tr[aria-label="Totais do estoque"]').innerText();
    };

    await caso("134. linha de totais soma quantidade, compra, venda e margem do que está na tela", async () => {
      await novaPeca("T23A", 3, 1000, 2500);
      await novaPeca("T23B", 2, 5000, 8000);
      await recarregar("Estoque");
      const linha = await totaisEstoque("T23");
      assert(linha.includes("2 produtos"), `contagem de produtos: ${linha}`);
      assert(/\b5\b/.test(linha), `itens = 3 + 2: ${linha}`);
      assert(linha.includes("130,00"), `compra = 3×10,00 + 2×50,00: ${linha}`);
      assert(linha.includes("235,00"), `venda = 3×25,00 + 2×80,00: ${linha}`);
      assert(linha.includes("105,00"), `margem = 235,00 − 130,00: ${linha}`);
      assert(linha.includes("81%"), `margem sobre o total de compra: ${linha}`);
    });

    await caso("135. os totais acompanham o filtro da busca", async () => {
      const linha = await totaisEstoque("T23B");
      assert(linha.includes("1 produto"), `só um produto no filtro: ${linha}`);
      assert(linha.includes("100,00"), `compra = 2×50,00: ${linha}`);
      assert(linha.includes("160,00"), `venda = 2×80,00: ${linha}`);
      assert(linha.includes("60,00"), `margem = 160,00 − 100,00: ${linha}`);
    });

    await caso("136. produto arquivado sai dos totais e volta com 'mostrar arquivados'", async () => {
      await sql("UPDATE pecas SET arquivado = 1 WHERE nome = 'T23A'");
      await recarregar("Estoque");
      try {
        let linha = await totaisEstoque("T23");
        assert(linha.includes("1 produto"), `o arquivado não pode entrar: ${linha}`);
        assert(linha.includes("100,00"), `só a compra do T23B: ${linha}`);
        await win.click('label:has-text("mostrar arquivados") input');
        await win.waitForTimeout(300);
        linha = await win.locator('tr[aria-label="Totais do estoque"]').innerText();
        assert(linha.includes("2 produtos"), `com arquivados à mostra os dois contam: ${linha}`);
        assert(linha.includes("130,00"), `e os valores voltam ao total cheio: ${linha}`);
      } finally {
        await sql("UPDATE pecas SET arquivado = 0 WHERE nome = 'T23A'");
        await win.fill(BUSCA_ESTOQUE, "");
      }
    });

    console.log("\nCódigo do produto (passo 10)");

    await caso("34. cadastro gera código sequencial por tipo (TE001, TE002)", async () => {
      await cadastrar("Tela", { modelo: "iPhone 13" });
      await concluir();
      assert.strictEqual(await codigoDe("Tela", "iPhone 13"), "TE001");
      await cadastrar("Tela", { modelo: "iPhone 11" });
      await concluir();
      assert.strictEqual(await codigoDe("Tela", "iPhone 11"), "TE002", "mesmo tipo continua a numeração");
    });

    await caso("35. prefixo tomado por outro tipo estende para 3 letras (CA -> CAM)", async () => {
      await cadastrar("Capinha", { modelo: "iPhone 13" });
      await concluir();
      assert.strictEqual(await codigoDe("Capinha", "iPhone 13"), "CA001");
      await cadastrar("Câmera traseira", { modelo: "Galaxy A32" });
      await concluir();
      assert.strictEqual(await codigoDe("Câmera traseira", "Galaxy A32"), "CAM001",
        "acento ignorado e prefixo estendido porque CA já é da Capinha");
    });

    await caso("36. busca por código funciona no Estoque e na Venda", async () => {
      await recarregar("Estoque");
      await win.fill(BUSCA_ESTOQUE, "TE002");
      await win.waitForTimeout(300);
      assert.strictEqual(await win.locator('tbody tr:has-text("TE002")').count(), 1);
      assert.strictEqual(await win.locator('tbody tr:has-text("TE001")').count(), 0, "busca exata não traz a outra tela");
      await win.fill(BUSCA_ESTOQUE, "TE0");
      await win.waitForTimeout(300);
      // "tbody tr" pegaria a tabela de entradas também — filtrar pelo código.
      assert.strictEqual(await win.locator('tbody tr:has-text("TE0")').count(), 2, "prefixo traz as duas telas");
      assert.strictEqual(await win.locator('tbody tr:has-text("CA001")').count(), 0, "e só as telas");
      await recarregar("Venda");
      await win.fill(BUSCA_VENDA, "CAM001");
      await win.waitForTimeout(300);
      assert.strictEqual(await win.locator('tr:has-text("Câmera traseira")').count(), 1);
    });

    await caso("37. código repetido é recusado", async () => {
      const antes = (await um("SELECT COUNT(*) AS n FROM pecas")).n;
      await cadastrar("Bateria", { modelo: "Moto G52", codigo: "TE001" });
      await win.waitForTimeout(400);
      assert.strictEqual((await um("SELECT COUNT(*) AS n FROM pecas")).n, antes, "não podia ter gravado");
      assert(await win.locator('button:text-is("Salvar")').count(), "o form continua aberto");
      await win.fill('label:has-text("Código (gerado") input', "BA001");
      await win.click('button:text-is("Salvar")');
      await concluir();
      assert.strictEqual(await codigoDe("Bateria", "Moto G52"), "BA001", "com código livre, salva");
    });

    await caso("37b. código editado na mão para de ser regerado ao mexer no tipo", async () => {
      await recarregar("Estoque");
      await win.click('button:text("+ Novo produto")');
      const campoCodigo = win.locator('label:has-text("Código (gerado") input');
      await win.fill('label:has-text("Produto") input', "Tela");
      assert.strictEqual(await campoCodigo.inputValue(), "TE003", "antes de editar, acompanha o tipo");
      await campoCodigo.fill("MEUCOD1");
      await win.fill('label:has-text("Produto") input', "Bateria"); // troca o tipo depois de editar
      await win.waitForTimeout(300);
      assert.strictEqual(await campoCodigo.inputValue(), "MEUCOD1", "o que o dono digitou tem que ficar");
      await win.fill('label:has-text("Quantidade") input', "1");
      await win.fill('label:has-text("Preço de compra") input', "10,00");
      await win.fill('label:has-text("Preço de venda") input', "20,00");
      await win.click('button:text-is("Salvar")');
      await concluir();
      assert.strictEqual(await codigoDe("Bateria", ""), "MEUCOD1");
    });

    await caso("38. produto sem código ganha código ao abrir o app (migração)", async () => {
      await sql("INSERT INTO pecas (nome, modelo, codigo, quantidade, preco_compra, preco_venda) VALUES ('Tela','Legado','',3,1000,2000)");
      await win.evaluate(() => location.reload());
      await login("Administrador", "1234");
      await win.waitForSelector("text=+ Novo produto", { timeout: 8000 });
      await win.waitForTimeout(500);
      assert.strictEqual(await codigoDe("Tela", "Legado"), "TE003", "segue a numeração das telas que já existiam");
      assert.strictEqual((await um("SELECT COUNT(*) AS n FROM pecas WHERE codigo = ''")).n, 0,
        "nenhum produto pode ficar sem código");
    });

    console.log("\nCódigo de barras (passo 25)");

    // A pistola é um teclado: digita o código no campo focado e manda Enter.
    // fill + press("Enter") é exatamente isso.
    const bipar = async (codigo) => {
      await win.fill(BUSCA_VENDA, codigo);
      await win.press(BUSCA_VENDA, "Enter");
      await win.waitForTimeout(300);
    };

    await caso("138. cadastro grava o código de barras bipado, e produto sem ele também salva", async () => {
      await cadastrar("Pelicula", { modelo: "B25A", barras: "7891234567895" });
      await concluir();
      const p = await um("SELECT * FROM pecas WHERE modelo = 'B25A'");
      assert.strictEqual(p.codigo_barras, "7891234567895");
      await cadastrar("Pelicula", { modelo: "B25B" });
      await concluir();
      const sem = await um("SELECT * FROM pecas WHERE modelo = 'B25B'");
      assert.strictEqual(sem.codigo_barras, "", "produto sem código de barras tem que salvar igual");
    });

    await caso("139. código de barras repetido é recusado", async () => {
      const antes = (await um("SELECT COUNT(*) AS n FROM pecas")).n;
      await cadastrar("Pelicula", { modelo: "B25C", barras: "7891234567895" }); // já é do B25A
      await win.waitForTimeout(400);
      assert.strictEqual((await um("SELECT COUNT(*) AS n FROM pecas")).n, antes, "não podia ter gravado");
      assert(await win.locator('button:text-is("Salvar")').count(), "o form continua aberto");
      await win.fill('label:has-text("Código de barras") input', "7891234567901");
      await win.click('button:text-is("Salvar")');
      await concluir();
      assert.strictEqual((await um("SELECT codigo_barras FROM pecas WHERE modelo = 'B25C'")).codigo_barras,
        "7891234567901", "com código livre, salva");
    });

    await caso("140. o código de barras pode ser adicionado depois, editando o produto", async () => {
      await recarregar("Estoque");
      await win.fill(BUSCA_ESTOQUE, "B25B");
      await win.waitForTimeout(300);
      await win.click('tr:has-text("B25B") td:text-is("B25B")'); // célula do modelo: a do nome tem o ⚠ de estoque baixo
      await win.fill('label:has-text("Código de barras") input', "7899999999994");
      await win.click('button:text-is("Salvar")');
      await win.waitForSelector('button:text-is("Salvar")', { state: "detached", timeout: 8000 });
      assert.strictEqual((await um("SELECT codigo_barras FROM pecas WHERE modelo = 'B25B'")).codigo_barras,
        "7899999999994");
    });

    await caso("141. busca do Estoque acha pelo código de barras", async () => {
      await win.fill(BUSCA_ESTOQUE, "7891234567895");
      await win.waitForTimeout(300);
      // Só a tabela de produtos: a de entradas embaixo não é filtrada pela busca.
      const produtos = win.locator('table[aria-label="Produtos"] tbody');
      assert.strictEqual(await produtos.locator('tr:has-text("B25A")').count(), 1);
      assert.strictEqual(await produtos.locator('tr:has-text("B25B")').count(), 0, "só o dono do código");
      await win.fill(BUSCA_ESTOQUE, "");
    });

    await caso("142. bipar na Venda joga direto no carrinho e limpa a busca", async () => {
      await sql("UPDATE pecas SET quantidade = 5 WHERE modelo IN ('B25A','B25B')");
      await recarregar("Venda");
      await bipar("7891234567895");
      assert.strictEqual(await win.locator('input[aria-label="Quantidade de Pelicula B25A"]').inputValue(), "1",
        "o produto bipado tem que entrar no carrinho sem clique nenhum");
      assert.strictEqual(await win.locator(BUSCA_VENDA).inputValue(), "", "a busca fica limpa pro próximo bipe");
      assert(await win.locator('tr:has-text("B25B")').count(), "e a lista volta a mostrar tudo");
    });

    await caso("143. bipar o mesmo código de novo soma quantidade", async () => {
      await bipar("7891234567895");
      assert.strictEqual(await win.locator('input[aria-label="Quantidade de Pelicula B25A"]').inputValue(), "2");
      await win.click('button:text-is("Limpar carrinho")');
    });

    await caso("144. código não cadastrado não faz nada; produto sem estoque não entra", async () => {
      await bipar("0000000000000");
      assert.strictEqual(await win.locator('h3:has-text("Carrinho")').count(), 0, "código desconhecido não pode adicionar nada");
      assert(await win.locator("text=Nenhuma peça encontrada").count(), "e a lista mostra que não achou");
      await sql("UPDATE pecas SET quantidade = 0 WHERE modelo = 'B25A'");
      await recarregar("Venda");
      await bipar("7891234567895");
      assert.strictEqual(await win.locator('h3:has-text("Carrinho")').count(), 0, "sem estoque não entra no carrinho");
      await sql("UPDATE pecas SET quantidade = 5 WHERE modelo = 'B25A'");
    });

    await caso("145. Config mostra o board só da última versão, e fechar guarda que ele viu", async () => {
      const versao = require("../package.json").version;
      // novidades.js é ESM (o Vite importa): lê como texto pra conferir a regra do
      // AGENTS.md — a versão do package.json é sempre a primeira da lista.
      const fonte = fs.readFileSync(path.join(__dirname, "../src/novidades.js"), "utf8");
      const versoes = [...fonte.matchAll(/versao:\s*"([^"]+)"/g)].map((m) => m[1]);
      assert.strictEqual(versoes[0], versao, "a versão do package.json tem que estar no topo de src/novidades.js");

      await sql("DELETE FROM config WHERE chave = 'novidades_vistas'");
      await recarregar("Config");
      const board = win.locator('[aria-label="Novidades da versão"]');
      await board.waitFor({ timeout: 8000 });
      const texto = await board.innerText();
      assert(texto.includes(`Novidades da versão ${versao}`), `board da versão atual: ${texto.slice(0, 120)}`);
      assert((await board.locator("li").count()) > 0, "tem que listar o que mudou");
      // Versão antiga não pode aparecer junto: o board é sempre um só.
      assert(!texto.includes(versoes[1]), `só a última versão no board: ${texto.slice(0, 200)}`);

      await win.click('button[aria-label="Fechar novidades"]');
      await win.waitForTimeout(400);
      assert.strictEqual(await board.count(), 0, "fechar tem que sumir com o board");
      assert.strictEqual((await um("SELECT valor FROM config WHERE chave = 'novidades_vistas'")).valor, versao,
        "a versão vista fica gravada, senão o board volta a cada abertura");
      await recarregar("Config");
      assert.strictEqual(await board.count(), 0, "e continua fechado depois de sair e voltar da tela");
    });

    console.log("\nPainel de desenvolvedor");

    await caso("39. desativar demo apaga o fictício e preserva o real por cima dele", async () => {
      const conta = async () =>
        await um(`SELECT (SELECT COUNT(*) FROM pecas) AS pecas, (SELECT COUNT(*) FROM vendas) AS vendas,
                         (SELECT COUNT(*) FROM trocas) AS trocas, (SELECT COUNT(*) FROM notas) AS notas`);
      const antes = await conta();

      await abrirDev();
      await win.click('button:text("Ativar dados de demonstração")');
      await win.waitForSelector("text=Quem está usando?", { timeout: 60000 });
      await login("Administrador", "1234");
      await win.waitForSelector("text=+ Novo produto", { timeout: 8000 });

      // O que quebrou de verdade: troca e nota do dono em cima de produto/venda
      // fictícios — trocas.venda_id, trocas.nova_peca_id e notas.venda_id.
      const demo = JSON.parse((await um("SELECT valor FROM config WHERE chave = 'demo_ids'")).valor);
      assert(demo.pecas.length === 40, "a demo deveria ter criado 40 produtos");
      await sql(
        "INSERT INTO trocas (modelo, defeito, valor_compra, peca_id, venda_id, nova_peca_id) VALUES ('Real sobre demo','defeito',1000,?,?,?)",
        [demo.pecas[0], demo.vendas[0], demo.pecas[1]]
      );
      await sql("INSERT INTO notas (venda_id, numero, descricao, valor_total) VALUES (?, 9999, '1x demo', 1000)",
        [demo.vendas[0]]);

      await abrirDev();
      await win.click('button:text("Desativar e apagar dados fictícios")');
      await win
        .waitForSelector("text=Quem está usando?", { timeout: 60000 })
        .catch(() => { throw new Error("desativar falhou — o app não recarregou (FK esquecida?)"); });
      await login("Administrador", "1234");
      await win.waitForSelector("text=+ Novo produto", { timeout: 8000 });

      const depois = await conta();
      assert.strictEqual(depois.pecas, antes.pecas, "todo produto fictício tem que sair");
      assert.strictEqual(depois.vendas, antes.vendas, "toda venda fictícia tem que sair");
      assert.strictEqual((await um("SELECT COUNT(*) AS n FROM config WHERE chave = 'demo_ids'")).n, 0);

      const t = await um("SELECT * FROM trocas WHERE modelo = 'Real sobre demo'");
      assert(t, "a troca real não podia ser apagada junto");
      assert.strictEqual(t.venda_id, null, "só a referência à venda fictícia sai");
      assert.strictEqual(t.peca_id, null);
      assert.strictEqual(t.nova_peca_id, null);
      const n = await um("SELECT * FROM notas WHERE numero = 9999");
      assert(n, "a nota real não podia ser apagada junto");
      assert.strictEqual(n.venda_id, null);
    });

    console.log("\nFechamento e vendedor (passo 11)");

    await caso("40. venda grava quem estava logado", async () => {
      const admin = await um("SELECT id FROM usuarios WHERE nome = 'Administrador'");
      const id = await novaPeca("P40", 5, 10000, 20000);
      await vender("P40");
      assert.strictEqual((await vendasDe(id))[0].usuario_id, admin.id);
    });

    await caso("41. Dashboard filtra o histórico por vendedor", async () => {
      const u = (await sql("INSERT INTO usuarios (nome, pin, papel) VALUES ('Vendedor2','2222','funcionario')")).lastInsertRowid;
      const id = await novaPeca("P41", 5, 10000, 20000);
      await sql("INSERT INTO vendas (peca_id, quantidade, preco_venda, preco_compra, usuario_id) VALUES (?,1,20000,10000,?)", [id, u]);
      await aba("Dashboard");
      await win.click('button:text-is("Tudo")');
      await win.waitForTimeout(400);
      const todos = await win.locator("tbody tr").count();
      assert(todos > 1, "o histórico deveria ter várias vendas");
      await win.selectOption("select", { label: "Vendedor2" });
      await win.waitForTimeout(400);
      assert.strictEqual(await win.locator('tbody tr:has-text("P41")').count(), 1, "a venda dele aparece");
      assert.strictEqual(await win.locator("tbody tr").count(), 1, "e só a dele");
      await win.selectOption("select", { label: "Todos os vendedores" });
      await win.waitForTimeout(400);
      assert.strictEqual(await win.locator("tbody tr").count(), todos, "voltar para todos restaura a lista");
    });

    await caso("42. excluir usuário que já vendeu preserva a venda", async () => {
      const u = (await sql("INSERT INTO usuarios (nome, pin, papel) VALUES ('Temp','9999','funcionario')")).lastInsertRowid;
      const id = await novaPeca("P42", 5, 10000, 20000);
      // usuario_id e desconto_por: as duas FKs apontam pra usuarios e barram o DELETE.
      await sql(`INSERT INTO vendas (peca_id, quantidade, preco_venda, preco_compra, usuario_id, desconto, desconto_por)
                 VALUES (?,1,20000,10000,?,1000,?)`, [id, u, u]);
      await aba("Config");
      await win.click('button[aria-label="Remover Temp"]');
      await win.waitForSelector('button[aria-label="Remover Temp"]', { state: "detached", timeout: 8000 });
      assert.strictEqual(await um("SELECT id FROM usuarios WHERE nome = 'Temp'"), undefined, "usuário sai");
      const [v] = await vendasDe(id);
      assert(v, "a venda dele não pode sumir junto");
      assert.strictEqual(v.usuario_id, null, "só perde o nome do vendedor");
      assert.strictEqual(v.desconto_por, null, "e o rastro de quem autorizou o desconto");
      assert.strictEqual(v.desconto, 1000, "o valor do desconto continua no histórico");
    });

    await caso("43. Dashboard mostra o mesmo fechamento e marca venda sem vendedor", async () => {
      // Venda como as anteriores ao passo 11: sem usuario_id.
      const id = await novaPeca("P43", 5, 10000, 20000);
      await sql("INSERT INTO vendas (peca_id, quantidade, preco_venda, preco_compra) VALUES (?,1,20000,10000)", [id]);
      await aba("Dashboard");
      await win.waitForSelector("text=Fechamento de hoje", { timeout: 8000 });
      const texto = await win.locator("#root").innerText();
      const { n } = await um("SELECT COUNT(*) AS n FROM vendas WHERE date(criado_em) = date('now','localtime')");
      // O caso 30 confere o mesmo número na aba do colaborador: os dois têm que bater.
      assert(texto.includes(`${n} venda`), `o fechamento do Dashboard tem que contar as mesmas ${n} vendas`);
      const linha = await win.locator('tbody tr:has-text("P43")').first().innerText();
      assert(linha.includes("não informado"), "venda sem vendedor aparece como 'não informado'");
    });

    console.log("\nUsuários e permissões");

    await caso("32. PIN só é salvo com 4 dígitos; incompleto não fica na tela", async () => {
      await aba("Config");
      const campo = win.locator('input[aria-label="PIN de Administrador"]');
      await campo.fill("12");
      await campo.blur();
      await win.waitForTimeout(400);
      assert.strictEqual((await um("SELECT pin FROM usuarios WHERE nome = 'Administrador'")).pin, "1234",
        "PIN incompleto não pode ser salvo");
      assert.strictEqual(await campo.inputValue(), "1234", "o campo tem que voltar ao PIN real do banco");
      await campo.fill("5678");
      await campo.blur();
      await win.waitForTimeout(400);
      assert.strictEqual((await um("SELECT pin FROM usuarios WHERE nome = 'Administrador'")).pin, "5678",
        "PIN completo tem que salvar");
      await campo.fill("1234");
      await campo.blur();
      await win.waitForTimeout(400);
    });

    await sql("INSERT INTO usuarios (nome, pin, papel) VALUES ('Colab', '1111', 'funcionario')");
    await win.click('nav button:text-is("Sair")');
    await login("Colab", "1111");
    await win.waitForSelector("text=P01");

    await caso("25. colaborador só enxerga Estoque, Venda e Fechamento", async () => {
      for (const t of ["Dashboard", "Config", "Trocas"]) {
        assert.strictEqual(await win.locator(`nav button:text-is("${t}")`).count(), 0, `viu a aba ${t}`);
      }
      for (const t of ["Estoque", "Venda", "Fechamento"]) {
        assert.strictEqual(await win.locator(`nav button:text-is("${t}")`).count(), 1, `faltou a aba ${t}`);
      }
    });

    await caso("30. fechamento do colaborador: total do dia, sem custo nem lucro", async () => {
      await aba("Fechamento");
      await win.waitForSelector("text=Fechamento de hoje", { timeout: 8000 });
      const texto = await win.locator("#root").innerText();
      assert(texto.includes("Total do dia"), "tem que mostrar o total do dia");
      assert(!/lucro/i.test(texto), "colaborador não pode ver lucro");
      assert(!/margem/i.test(texto), "colaborador não pode ver margem");
      assert(!/compra/i.test(texto), "colaborador não pode ver custo");
      const { n } = await um("SELECT COUNT(*) AS n FROM vendas WHERE date(criado_em) = date('now','localtime')");
      assert(texto.includes(`${n} venda`), `deveria contar as ${n} vendas de hoje`);
    });

    await caso("31. venda do colaborador fica no nome dele", async () => {
      const colab = await um("SELECT id FROM usuarios WHERE nome = 'Colab'");
      const antes = await um("SELECT COUNT(*) AS n FROM vendas WHERE usuario_id = ?", [colab.id]);
      await vender("P01");
      const depois = await um("SELECT COUNT(*) AS n FROM vendas WHERE usuario_id = ?", [colab.id]);
      assert.strictEqual(depois.n, antes.n + 1, "a venda tem que sair no nome do colaborador");
    });

    await caso("26. colaborador não vê Compra, Margem nem as entradas", async () => {
      await aba("Estoque");
      assert.strictEqual(await win.locator('th:text-is("Compra")').count(), 0);
      assert.strictEqual(await win.locator('th:text-is("Margem")').count(), 0);
      assert.strictEqual(await win.locator("text=Últimas entradas").count(), 0);
    });

    await caso("137. colaborador não vê a linha de totais (é custo e margem)", async () => {
      await aba("Estoque");
      assert.strictEqual(await win.locator('tr[aria-label="Totais do estoque"]').count(), 0);
    });

    await caso("27. colaborador não cadastra, não dá entrada e não exclui", async () => {
      assert.strictEqual(await win.locator('button:text("+ Novo produto")').count(), 0);
      assert.strictEqual(await win.locator('button:text("+ Entrada")').count(), 0);
      assert.strictEqual(await win.locator('button:text-is("Excluir")').count(), 0);
      await win.click('tr:has-text("P01") td:text-is("P01")');
      await win.waitForTimeout(300);
      assert.strictEqual(await win.locator('button:text-is("Salvar")').count(), 0, "clicar na linha não pode abrir o form");
    });

    await caso("28. colaborador não edita o preço ao vender", async () => {
      await aba("Venda");
      await win.click('tr:has-text("P01") button:text-is("+ Adicionar")');
      const preco = win.locator('input[aria-label="Preço de P01"]');
      assert.strictEqual(await preco.evaluate((el) => el.readOnly), true, "preço tinha que estar travado");
      await win.click('button:text-is("Limpar carrinho")');
    });

    // Passo 24: o que antes era proibido pro colaborador virou rotina dele.
    await caso("29. colaborador troca pela Venda, sem PIN, e volta pra Venda ao salvar", async () => {
      const a = await novaPeca("T24A", 5, 10000, 20000);
      const b = await novaPeca("T24B", 5, 10000, 20000);
      await recarregar("Venda");
      await aoCarrinho("T24A");
      await win.click('button:text("Finalizar venda")');
      await confirmarVenda();
      const pid = (await vendasDe(a))[0].pedido_id;

      await win.click(`#pedido-${pid} button:text-is("Trocar")`);
      await win.waitForSelector("text=Estado da peça devolvida", { timeout: 8000 });
      assert.strictEqual(await win.locator('input[type="password"]').count(), 0, "troca não pede PIN");
      assert.strictEqual(await win.locator('label:has-text("Valor de compra") input').count(), 0,
        "colaborador não pode ver o custo da peça");
      await win.click('button:text-is("Funcionando")');
      await win.selectOption('label:has-text("Trocar por") select', String(b));
      await win.click('button:text-is("Salvar")');

      // Salvou → volta pra Venda. A prateleira/lotes continuam sendo só do dono.
      await win.waitForSelector(BUSCA_VENDA, { timeout: 8000 });
      assert.strictEqual(await win.locator("text=Prateleira").count(), 0, "colaborador não pode cair na tela de Trocas");
      // A: 5 −1 da venda +1 da devolução boa = 5. B: 5 −1 da reposição = 4.
      assert.strictEqual((await peca(a)).quantidade, 5, "a devolvida volta ao estoque");
      assert.strictEqual((await peca(b)).quantidade, 4, "a reposição sai do estoque");
      assert(await um("SELECT id FROM trocas WHERE peca_id = ?", [a]), "a troca tem que ter sido gravada");
    });

    await caso("29b. colaborador desfaz a troca que fez", async () => {
      const a = await um("SELECT * FROM pecas WHERE nome = 'T24A'");
      const b = await um("SELECT * FROM pecas WHERE nome = 'T24B'");
      await recarregar("Venda");
      await win.click('tr:has-text("trocado por 1x T24B") button:text-is("Desfazer")');
      await win.waitForTimeout(500);
      assert.strictEqual((await peca(a.id)).quantidade, 4, "volta ao estado logo depois da venda");
      assert.strictEqual((await peca(b.id)).quantidade, 5, "a reposição volta pro estoque");
      assert.strictEqual(await um("SELECT id FROM trocas WHERE peca_id = ?", [a.id]), undefined);
    });

    // Toda falha de SQL passa pelo handler global (src/main.jsx) e vira console.error:
    // se sobrou erro aqui, alguma operação da bateria falhou por baixo dos panos.
    await caso("33. nenhuma operação falhou por baixo dos panos", async () => {
      assert.strictEqual(erros.length, 0, `erros no renderer:\n${erros.join("\n")}`);
    });

    // Por último: a migração do passo 14 roda no boot, então precisa de um app
    // novo. É a que mexe no banco de quem já usa o sistema — sem teste, o erro
    // só aparece na loja do cliente.
    // Deixa o banco no estado de quem está atualizando: nomes soltos em
    // vendas.cliente e nenhum cadastro. Duas vendas do mesmo nome (uma com
    // espaço sobrando) e uma de balcão.
    const p72 = await novaPeca("C72", 5, 10000, 20000);
    await sql("DELETE FROM clientes");
    await sql("UPDATE vendas SET cliente_id = NULL");
    await sql("DELETE FROM config WHERE chave = 'migrou_clientes'");
    for (const [nome, pedido] of [[" Maria Antiga ", 9001], ["Maria Antiga", 9002], ["", 9003]]) {
      await sql("INSERT INTO vendas (peca_id, quantidade, preco_venda, preco_compra, cliente, pedido_id) VALUES (?,1,20000,10000,?,?)",
        [p72, nome, pedido]);
    }
    // O app tem lock de instância única: o segundo só sobe com o primeiro fechado.
    await app.close();

    // Uma sessão nova do app, só pra ver o que a migração do boot fez.
    const boot = async (fn) => {
      const outro = await _electron.launch({
        args: ["."], cwd: path.join(__dirname, ".."),
        env: { ...process.env, SMOKE: "1", ESTOQUE_DB_DIR: tmp },
      });
      try {
        const w = await outro.firstWindow();
        return await fn((q) => w.evaluate((q) => window.api.query(q), q));
      } finally {
        await outro.close();
      }
    };

    await caso("72. banco antigo: nomes soltos em vendas.cliente viram cadastro no próximo boot", async () => {
      await boot(async (q) => {
        const marias = await q("SELECT * FROM clientes WHERE nome = 'Maria Antiga'");
        assert.strictEqual(marias.length, 1, "o nome repetido vira um cadastro só, com o espaço aparado");
        assert(/^C\d{3}$/.test(marias[0].codigo), `migrado sem código: ${marias[0].codigo}`);
        assert.strictEqual((await q(`SELECT pedido_id FROM vendas WHERE cliente_id = ${marias[0].id}`)).length, 2,
          "as duas vendas antigas dela ficam vinculadas");
        assert.strictEqual((await q("SELECT cliente_id FROM vendas WHERE pedido_id = 9003"))[0].cliente_id, null,
          "venda sem nome não inventa cliente");
      });
    });

    await caso("73. migração não roda duas vezes: cliente excluído não volta no boot seguinte", async () => {
      await boot(async (q) => {
        const [maria] = await q("SELECT id FROM clientes WHERE nome = 'Maria Antiga'");
        await q(`UPDATE vendas SET cliente_id = NULL WHERE cliente_id = ${maria.id}`);
        await q(`DELETE FROM clientes WHERE id = ${maria.id}`);
      });
      await boot(async (q) => {
        assert.strictEqual((await q("SELECT id FROM clientes WHERE nome = 'Maria Antiga'")).length, 0,
          "o histórico de venda não pode ressuscitar quem o dono excluiu");
      });
    });

    console.log(falhas ? `\nP0: ${falhas} caso(s) com falha` : "\nP0 OK — todos os casos passaram");
    if (falhas) process.exitCode = 1;
  } catch (e) {
    console.error("\nquebrou fora dos casos:", e);
    if (erros.length) console.error(`erros no renderer:\n${erros.join("\n")}`);
    process.exitCode = 1;
  } finally {
    await app.close().catch(() => {}); // os casos 72/73 já fecham pra liberar o lock
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
