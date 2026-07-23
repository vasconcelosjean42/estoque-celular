// Smoke E2E: abre o app de verdade (banco isolado, diálogos auto-OK) e percorre
// o fluxo crítico: abas → cadastro → venda → troca → desfazer. Falha em tela
// branca, erro de console ou passo que não renderiza. Rodar: npm test
const { _electron } = require("playwright-core");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "estoque-smoke-"));
  const app = await _electron.launch({
    args: ["."],
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, SMOKE: "1", ESTOQUE_DB_DIR: tmp },
  });
  const erros = [];
  try {
    const win = await app.firstWindow();
    win.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
    win.on("console", (m) => m.type() === "error" && erros.push(`console: ${m.text()}`));

    const aba = (nome) => win.click(`nav button:text-is("${nome}")`);
    const espera = (texto) => win.waitForSelector(`text=${texto}`, { timeout: 8000 });

    // 1. todas as abas abrem com conteúdo
    for (const [nome, marca] of [
      ["Estoque", "+ Novo produto"],
      ["Venda", "Vendas de hoje"],
      ["Dashboard", "Fechamento de hoje"],
      ["Trocas", "+ Registrar defeituosa"],
      ["Config", "Backup"],
    ]) {
      await aba(nome);
      await espera(marca);
    }

    // 2. cadastra produto
    await aba("Estoque");
    await win.click('button:text("+ Novo produto")');
    await win.fill('label:has-text("Nome") input', "PecaSmoke");
    await win.fill('label:has-text("Quantidade") input', "5");
    await win.fill('label:has-text("Preço de compra") input', "10,00");
    await win.fill('label:has-text("Preço de venda") input', "20,00");
    await win.click('button:text-is("Salvar")');
    await espera("PecaSmoke");

    // 3. vende
    await aba("Venda");
    await win.click('tr:has-text("PecaSmoke") button:text-is("Vender")');
    await win.click('button:text("Confirmar venda")');
    await espera("Desfazer");

    // 4. troca (leva pra aba Trocas com o form travado)
    await win.click('button:text-is("Trocar")');
    await espera("Trocar peça");
    await win.fill('label:has-text("Defeito") input', "defeito smoke");
    await win.click('button:text-is("Salvar")');
    await espera("Prateleira (1)");

    // 5. volta pra Venda: agrupamento renderiza (regressão da tela branca)
    await aba("Venda");
    await espera("trocado por");
    await espera("trocada ↓");

    // 6. desfaz a troca: some o agrupamento, item some da prateleira
    await win.click('tr:has-text("trocado por") button:text-is("Desfazer")');
    await win.waitForSelector("text=trocado por", { state: "detached", timeout: 8000 });
    await aba("Trocas");
    await espera("Nenhuma peça na prateleira");

    // 7. dashboard renderiza com a venda
    await aba("Dashboard");
    await espera("Histórico de vendas");

    const corpo = (await win.locator("#root").innerText()).trim();
    assert(corpo.length > 0, "tela em branco no fim do fluxo");
    assert.strictEqual(erros.length, 0, `erros no renderer:\n${erros.join("\n")}`);
    console.log("SMOKE OK");
  } catch (e) {
    if (erros.length) console.error(`erros no renderer:\n${erros.join("\n")}`);
    console.error(e);
    process.exitCode = 1;
  } finally {
    await app.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
