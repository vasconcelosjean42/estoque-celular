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
  const codigoDe = async (nome, modelo) =>
    (await um("SELECT codigo FROM pecas WHERE nome = ? AND modelo = ?", [nome, modelo]))?.codigo;
  const peca = (id) => um("SELECT * FROM pecas WHERE id = ?", [id]);
  const vendasDe = (id) => sql("SELECT * FROM vendas WHERE peca_id = ? ORDER BY id", [id]);

  // Abre o form de venda da peça e preenche o que foi passado.
  const abrirVenda = async (nome, campos = {}) => {
    await recarregar("Venda");
    await win.click(`tr:has-text("${nome}") button:text-is("Vender")`);
    if (campos.qtd !== undefined) await win.fill('label:has-text("Quantidade") input', String(campos.qtd));
    if (campos.preco !== undefined) await win.fill('label:has-text("Preço unitário") input', campos.preco);
    if (campos.mao !== undefined) await win.fill('label:has-text("Mão de obra") input', campos.mao);
    if (campos.forma) await win.click(`button:text-is("${campos.forma}")`);
  };
  const confirmarVenda = async () => {
    await win.click('button:text("Confirmar venda")');
    await win.waitForSelector('button:text("Confirmar venda")', { state: "detached", timeout: 8000 });
  };
  // Confirma esperando que seja RECUSADO: o form continua na tela.
  const confirmarRecusado = async () => {
    await win.click('button:text("Confirmar venda")');
    await win.waitForTimeout(300);
    assert(await win.locator('button:text("Confirmar venda")').count(), "o form deveria continuar aberto");
    await win.click('button:text-is("Cancelar")');
  };
  const vender = async (nome, campos) => { await abrirVenda(nome, campos); await confirmarVenda(); };

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
      assert(await win.locator('tr:has-text("P05") button:text-is("Vender")').isDisabled());
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

    await caso("25. colaborador só enxerga as abas Estoque e Venda", async () => {
      for (const t of ["Dashboard", "Config", "Trocas"]) {
        assert.strictEqual(await win.locator(`nav button:text-is("${t}")`).count(), 0, `viu a aba ${t}`);
      }
      for (const t of ["Estoque", "Venda"]) {
        assert.strictEqual(await win.locator(`nav button:text-is("${t}")`).count(), 1);
      }
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
      await win.click('tr:has-text("P01") button:text-is("Vender")');
      const preco = win.locator('label:has-text("Preço unitário") input');
      assert.strictEqual(await preco.evaluate((el) => el.readOnly), true, "preço tinha que estar travado");
      await win.click('button:text-is("Cancelar")');
    });

    await caso("29. colaborador não vê o botão Trocar nas vendas", async () => {
      assert.strictEqual(await win.locator('button:text-is("Trocar")').count(), 0);
    });

    // Toda falha de SQL passa pelo handler global (src/main.jsx) e vira console.error:
    // se sobrou erro aqui, alguma operação da bateria falhou por baixo dos panos.
    await caso("33. nenhuma operação falhou por baixo dos panos", async () => {
      assert.strictEqual(erros.length, 0, `erros no renderer:\n${erros.join("\n")}`);
    });

    console.log(falhas ? `\nP0: ${falhas} caso(s) com falha` : "\nP0 OK — todos os casos passaram");
    if (falhas) process.exitCode = 1;
  } catch (e) {
    console.error("\nquebrou fora dos casos:", e);
    if (erros.length) console.error(`erros no renderer:\n${erros.join("\n")}`);
    process.exitCode = 1;
  } finally {
    await app.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
