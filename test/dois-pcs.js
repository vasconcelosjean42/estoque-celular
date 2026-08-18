// Passo 27 — os dois PCs de verdade: dois apps abertos ao mesmo tempo, um banco
// só. O terminal não tem estoque.db nenhum; tudo que ele lê e grava passa pelo
// PC principal. É o que não dá pra conferir sem estar na loja.
//
// Rodar: node test/dois-pcs.js (depois de um vite build)
const { _electron } = require("playwright-core");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORTA = 5401;
const TOKEN = "TESTE123";

(async () => {
  const dir = (nome, rede) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), `estoque-${nome}-`));
    fs.writeFileSync(path.join(d, "rede.json"), JSON.stringify(rede));
    return d;
  };
  const principal = dir("principal", { modo: "servidor", porta: PORTA, token: TOKEN });
  const terminal = dir("terminal", { modo: "cliente", url: `http://127.0.0.1:${PORTA}`, token: TOKEN });

  const abrir = async (ESTOQUE_DB_DIR) => {
    const app = await _electron.launch({
      args: ["."], cwd: path.join(__dirname, ".."),
      env: { ...process.env, SMOKE: "1", ESTOQUE_DB_DIR },
    });
    const win = await app.firstWindow();
    const erros = [];
    win.on("pageerror", (e) => erros.push(e.message));
    return {
      app, erros,
      sql: (q, p = []) => win.evaluate(([q, p]) => window.api.query(q, p), [q, p]),
      tx: (c) => win.evaluate((c) => window.api.tx(c), c),
    };
  };

  const A = await abrir(principal);
  const B = await abrir(terminal);
  try {
    assert.ok(fs.existsSync(path.join(principal, "estoque.db")), "o principal é quem guarda o banco");
    assert.ok(!fs.existsSync(path.join(terminal, "estoque.db")), "o terminal não pode criar banco nenhum");

    // 1. O que o principal cadastra, o terminal enxerga.
    const { lastInsertRowid: id } = await A.sql(
      "INSERT INTO pecas (nome, modelo, codigo, quantidade, preco_compra, preco_venda) VALUES ('Tela A54','',?,3,5000,12000)",
      [`R${Date.now() % 100000}`]);
    const [noTerminal] = await B.sql("SELECT nome, quantidade FROM pecas WHERE id = ?", [id]);
    assert.strictEqual(noTerminal.nome, "Tela A54", "o terminal lê o cadastro do principal");
    assert.strictEqual(noTerminal.quantidade, 3);

    // 2. O que o terminal vende cai no banco do principal — numa transação só.
    await B.tx([
      ["UPDATE pecas SET quantidade = quantidade - 2 WHERE id = ?", [id]],
      ["INSERT INTO vendas (peca_id, quantidade, preco_venda, preco_compra, pedido_id) VALUES (?,2,12000,5000,9901)", [id]],
    ]);
    assert.strictEqual((await A.sql("SELECT quantidade FROM pecas WHERE id = ?", [id]))[0].quantidade, 1,
      "a venda do balcão baixa o estoque do principal");
    assert.strictEqual((await A.sql("SELECT COUNT(*) n FROM vendas WHERE pedido_id = 9901"))[0].n, 1);

    // 3. A trava de estoque vale pelo terminal também: o pedido inteiro é recusado.
    await assert.rejects(
      () => B.tx([
        ["UPDATE pecas SET quantidade = quantidade - 5 WHERE id = ?", [id]],
        ["INSERT INTO vendas (peca_id, quantidade, preco_venda, preco_compra, pedido_id) VALUES (?,5,12000,5000,9902)", [id]],
      ]),
      /estoque desta peça acabou/, "vender mais do que existe tem que falhar do outro lado da rede");
    assert.strictEqual((await A.sql("SELECT quantidade FROM pecas WHERE id = ?", [id]))[0].quantidade, 1,
      "a recusa não pode deixar o estoque negativo nem pela metade");
    assert.strictEqual((await A.sql("SELECT COUNT(*) n FROM vendas WHERE pedido_id = 9902"))[0].n, 0,
      "transação recusada não grava a venda");

    // 4. A config é compartilhada: mudou no escritório, mudou no balcão.
    await A.sql("INSERT OR REPLACE INTO config (chave, valor) VALUES ('titulo','Loja do Zé')");
    assert.strictEqual((await B.sql("SELECT valor FROM config WHERE chave = 'titulo'"))[0].valor, "Loja do Zé");

    assert.deepStrictEqual([...A.erros, ...B.erros], [], "nenhuma tela pode ter quebrado");
    console.log("dois PCs OK — banco único, venda pela rede, trava de estoque e config compartilhada");
  } catch (e) {
    console.error("FALHA:", e.message);
    process.exitCode = 1;
  } finally {
    await A.app.close().catch(() => {});
    await B.app.close().catch(() => {});
    for (const d of [principal, terminal]) fs.rmSync(d, { recursive: true, force: true });
  }
})();
