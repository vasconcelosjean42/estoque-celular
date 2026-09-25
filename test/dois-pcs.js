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
      app, win, erros,
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

  // 5. O balcão órfão: o principal saiu da loja e não volta. Sem saída na tela o
  // sistema fica inacessível pra sempre — o Login pede a lista de usuários pela
  // rede, ela não vem, e a Config (que desfaz a conexão) está atrás do login.
  // Aconteceu de verdade; este teste é a garantia de que dá pra sair sem mexer
  // no rede.json na mão.
  const orfao = dir("orfao", { modo: "cliente", url: "http://127.0.0.1:5402", token: TOKEN });
  let C, D;
  try {
    C = await abrir(orfao);
    await C.win.locator("text=Tentando de novo sozinho").waitFor({ timeout: 20000 }); // aparece quando a query falha
    // 127.0.0.1 fica fora da faixa desta máquina: a tela lê como "Wi-Fi errado".
    assert.match(await C.win.locator("h1").innerText(), /Wi-Fi errado|PC principal não está respondendo/,
      "a tela tem que dizer o que houve, não ficar em branco");
    // A saída só aparece depois de 2 min: na loja ela foi clicada 8s depois do
    // Wi-Fi voltar. O teste adianta o relógio da tela em vez de esperar.
    const sair = C.win.locator('button:has-text("Usar o banco deste computador")');
    assert.ok(!(await sair.isVisible()), "a saída de emergência não pode aparecer logo de cara");
    await C.win.evaluate(() => { const real = Date.now; Date.now = () => real() + 3 * 60 * 1000; });
    await sair.waitFor({ timeout: 10000 });
    await sair.click();
    await C.win.locator("text=Pronto, desconectado").waitFor({ timeout: 10000 });

    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(orfao, "rede.json"), "utf-8")).modo, "sozinho",
      "o botão precisa gravar a volta pro banco local, senão reabrir cai na mesma tela");
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(orfao, "rede.json"), "utf-8")).url,
      "http://127.0.0.1:5402", "o endereço fica gravado: reconectar não pode exigir digitar tudo de novo");

    await C.app.close().catch(() => {});
    C = null;

    // Reabrir é o que o app faz sozinho (fora do teste, com app.relaunch): agora
    // ele tem que subir como instalação de um PC só, com banco e login próprios.
    D = await abrir(orfao);
    assert.ok(fs.existsSync(path.join(orfao, "estoque.db")), "desconectado, este PC volta a ter banco próprio");
    const usuarios = await D.sql("SELECT nome FROM usuarios");
    assert.ok(usuarios.some((u) => u.nome === "Administrador"), "e dá pra entrar de novo");

    console.log("balcão órfão OK — desconecta pela tela de login e volta a abrir sozinho");
  } catch (e) {
    console.error("FALHA:", e.message);
    process.exitCode = 1;
  } finally {
    await C?.app.close().catch(() => {});
    await D?.app.close().catch(() => {});
    fs.rmSync(orfao, { recursive: true, force: true });
  }

  // 6. A manhã da loja (25/09): o notebook acorda, o sistema abre antes do Wi-Fi
  // pegar endereço e cai na tela de espera. Quando a rede volta, ele tem que
  // entrar sozinho — ninguém pode precisar clicar em nada.
  const PORTA2 = 5403;
  const cedo = dir("cedo", { modo: "cliente", url: `http://127.0.0.1:${PORTA2}`, token: TOKEN });
  const tarde = dir("tarde", { modo: "servidor", porta: PORTA2, token: TOKEN });
  let E, F;
  try {
    E = await abrir(cedo);
    await E.win.locator("text=Tentando de novo sozinho").waitFor({ timeout: 20000 });
    F = await abrir(tarde);
    await E.win.locator("button:has-text('Administrador')").waitFor({ timeout: 15000 });
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(cedo, "rede.json"), "utf-8")).modo, "cliente",
      "esperar o principal não pode mexer na configuração");
    assert.deepStrictEqual(E.erros, [], "nenhuma tela pode ter quebrado");
    console.log("balcão adiantado OK — espera o principal e entra sozinho quando ele responde");

    // Principal no ar, mas recusando (token trocado; na vida real, versões
    // diferentes no meio da atualização). A tela não pode culpar o Wi-Fi.
    await E.app.close();
    fs.writeFileSync(path.join(cedo, "rede.json"), JSON.stringify({ modo: "cliente", url: `http://127.0.0.1:${PORTA2}`, token: "ERRADO" }));
    E = await abrir(cedo);
    await E.win.locator("text=O PC principal respondeu, mas não deixou entrar").waitFor({ timeout: 20000 });
    assert.ok(await E.win.locator("text=token").first().isVisible(), "tem que mostrar o motivo que o principal deu");
    console.log("principal recusando OK — mostra o motivo, não o aviso de Wi-Fi");
  } catch (e) {
    console.error("FALHA:", e.message);
    process.exitCode = 1;
  } finally {
    await E?.app.close().catch(() => {});
    await F?.app.close().catch(() => {});
    for (const d of [cedo, tarde]) fs.rmSync(d, { recursive: true, force: true });
  }
})();
