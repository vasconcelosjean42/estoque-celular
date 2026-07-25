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
  const app = await _electron.launch({
    args: ["."],
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, SMOKE: "1", ESTOQUE_DB_DIR: tmp },
  });
  const win = await app.firstWindow();
  const erros = [];
  win.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  win.on("console", (m) => m.type() === "error" && erros.push(`console: ${m.text()}`));

  // --- helpers ---------------------------------------------------------------
  const sql = (q, p = []) => win.evaluate(([q, p]) => window.api.query(q, p), [q, p]);
  const um = async (q, p) => (await sql(q, p))[0];
  const aba = (n) => win.click(`nav button:text-is("${n}")`);
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
    if (extras.codigo !== undefined) await win.fill('label:has-text("Código") input', extras.codigo);
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
      const reais = (c) => (c / 100).toFixed(2).replace(".", ",");
      assert(cabecalho.includes(reais(total)), `total do mês devia ser ${reais(total)}, veio "${cabecalho}"`);
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
      assert((await total()).includes((mes / 100).toFixed(2).replace(".", ",")), "total do mês");

      await win.click('h3:has-text("Perdas") button:text-is("Tudo")');
      await win.waitForTimeout(400);
      assert(await bloco.locator('tr:has-text("perda antiga C85")').count(),
        "em Tudo o histórico continua lá: nada é apagado na virada do mês");
      const [{ tudo }] = await sql("SELECT COALESCE(SUM(valor),0) AS tudo FROM perdas");
      assert((await total()).includes((tudo / 100).toFixed(2).replace(".", ",")), "total de tudo");
      assert(tudo > mes, "o teste só vale se existir perda fora do mês");
      await sql("DELETE FROM perdas WHERE motivo = 'perda antiga C85'");
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
      await win.fill('input[placeholder*="Buscar peça por código"]', "TE002");
      await win.waitForTimeout(300);
      assert.strictEqual(await win.locator('tbody tr:has-text("TE002")').count(), 1);
      assert.strictEqual(await win.locator('tbody tr:has-text("TE001")').count(), 0, "busca exata não traz a outra tela");
      await win.fill('input[placeholder*="Buscar peça por código"]', "TE0");
      await win.waitForTimeout(300);
      // "tbody tr" pegaria a tabela de entradas também — filtrar pelo código.
      assert.strictEqual(await win.locator('tbody tr:has-text("TE0")').count(), 2, "prefixo traz as duas telas");
      assert.strictEqual(await win.locator('tbody tr:has-text("CA001")').count(), 0, "e só as telas");
      await recarregar("Venda");
      await win.fill('input[placeholder*="Buscar peça por código"]', "CAM001");
      await win.waitForTimeout(300);
      assert.strictEqual(await win.locator('tr:has-text("Câmera traseira")').count(), 1);
    });

    await caso("37. código repetido é recusado", async () => {
      const antes = (await um("SELECT COUNT(*) AS n FROM pecas")).n;
      await cadastrar("Bateria", { modelo: "Moto G52", codigo: "TE001" });
      await win.waitForTimeout(400);
      assert.strictEqual((await um("SELECT COUNT(*) AS n FROM pecas")).n, antes, "não podia ter gravado");
      assert(await win.locator('button:text-is("Salvar")').count(), "o form continua aberto");
      await win.fill('label:has-text("Código") input', "BA001");
      await win.click('button:text-is("Salvar")');
      await concluir();
      assert.strictEqual(await codigoDe("Bateria", "Moto G52"), "BA001", "com código livre, salva");
    });

    await caso("37b. código editado na mão para de ser regerado ao mexer no tipo", async () => {
      await recarregar("Estoque");
      await win.click('button:text("+ Novo produto")');
      const campoCodigo = win.locator('label:has-text("Código") input');
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

    await caso("29. colaborador não vê o botão Trocar nas vendas", async () => {
      assert.strictEqual(await win.locator('button:text-is("Trocar")').count(), 0);
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
