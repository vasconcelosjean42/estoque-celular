const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");

// Smoke test (test/smoke.js): banco isolado num diretório temporário.
if (process.env.ESTOQUE_DB_DIR) app.setPath("userData", process.env.ESTOQUE_DB_DIR);

let db;

async function backupDiario() {
  // Copia o .db para a pasta de backup (aponte para a pasta do Google Drive
  // desktop nas configurações e o Drive sobe sozinho quando tiver internet).
  const row = db.prepare("SELECT valor FROM config WHERE chave = 'pasta_backup'").get();
  if (!row || !row.valor) return { ok: false, erro: "Nenhuma pasta de backup escolhida." };
  const destino = path.join(row.valor, `estoque-${new Date().toISOString().slice(0, 10)}.db`);
  try {
    await db.backup(destino);
    return { ok: true, destino };
  } catch (e) {
    console.error("backup falhou:", e.message);
    return { ok: false, erro: e.message };
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  win.maximize(); // maximizada (com barra de título), não quiosque — leigo precisa minimizar
  if (app.isPackaged || process.env.SMOKE) win.loadFile(path.join(__dirname, "../dist/index.html"));
  else win.loadURL("http://localhost:5173");
}

app.whenReady().then(() => {
  db = require("./db");

  // ponytail: renderer manda SQL direto — app local, único usuário, sem
  // conteúdo remoto. Se um dia virar multiusuário/rede, trocar por handlers nomeados.
  ipcMain.handle("db", (_e, sql, params = []) => {
    const stmt = db.prepare(sql);
    return stmt.reader ? stmt.all(...(params || [])) : stmt.run(...(params || []));
  });

  // Vários comandos numa transação única (venda = baixa estoque + registro).
  ipcMain.handle("db-tx", (_e, comandos) =>
    db.transaction(() => comandos.map(([sql, params = []]) => db.prepare(sql).run(...params)))()
  );

  ipcMain.handle("escolher-pasta", async () => {
    const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle("escolher-logo", async () => {
    const r = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Imagens", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
    });
    if (r.canceled) return null;
    const arquivo = r.filePaths[0];
    const mime = arquivo.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${fs.readFileSync(arquivo).toString("base64")}`;
  });

  ipcMain.handle("backup-agora", () => backupDiario());

  // Gera o recibo em PDF (janela oculta -> printToPDF) e abre no visualizador
  // padrão. window.print() do renderer abre diálogo sem preview no Windows;
  // isto espelha o original (gera PDF e abre) e ainda arquiva o arquivo.
  ipcMain.handle("nota-pdf", async (_e, { html, numero }) => {
    const dir = path.join(app.getPath("userData"), "notas");
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `nota-${String(numero).padStart(4, "0")}.pdf`);
    const tmpHtml = path.join(app.getPath("temp"), `nota-${Date.now()}.html`);
    fs.writeFileSync(tmpHtml, html, "utf-8");
    const win = new BrowserWindow({ show: false, width: 400, height: 800 });
    try {
      await win.loadFile(tmpHtml);
      const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
      fs.writeFileSync(dest, pdf);
      if (!process.env.SMOKE) shell.openPath(dest);
      return { ok: true, dest };
    } catch (e) {
      return { ok: false, erro: e.message };
    } finally {
      win.destroy();
      try { fs.unlinkSync(tmpHtml); } catch {}
    }
  });

  // alert/confirm do Chromium travam mouse/teclado no Windows até a janela
  // perder o foco (bug do Electron) — diálogo do sistema no lugar.
  ipcMain.on("dialogo", (e, { tipo, msg }) => {
    if (process.env.SMOKE) return (e.returnValue = 0); // teste: sempre "OK"
    const win = BrowserWindow.fromWebContents(e.sender);
    e.returnValue = dialog.showMessageBoxSync(win, {
      type: tipo === "confirm" ? "question" : "info",
      message: msg,
      buttons: tipo === "confirm" ? ["OK", "Cancelar"] : ["OK"],
      cancelId: 1,
    });
  });

  // Abrir junto com o Windows (só faz sentido no app instalado; checkbox na Config).
  ipcMain.handle("auto-start", (_e, ligado) => {
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: ligado });
  });
  if (app.isPackaged) {
    const row = db.prepare("SELECT valor FROM config WHERE chave = 'abrir_com_windows'").get();
    app.setLoginItemSettings({ openAtLogin: !row || row.valor !== "0" }); // ligado por padrão
  }

  ipcMain.handle("app-info", () => ({ versao: app.getVersion(), empacotado: app.isPackaged }));

  // Auto-update via GitHub Releases: banco fica em userData, o update não toca nos dados.
  let autoUpdater;
  try { autoUpdater = require("electron-updater").autoUpdater; } catch (e) { console.error("updater indisponível:", e.message); }

  if (autoUpdater) {
    const envia = (estado, extra = {}) =>
      BrowserWindow.getAllWindows()[0]?.webContents.send("update-status", { estado, ...extra });
    autoUpdater.on("checking-for-update", () => envia("checando"));
    autoUpdater.on("update-available", (i) => envia("baixando", { versao: i.version }));
    autoUpdater.on("update-not-available", () => envia("atual"));
    autoUpdater.on("download-progress", (p) => envia("baixando", { pct: Math.round(p.percent) }));
    autoUpdater.on("update-downloaded", (i) => envia("pronto", { versao: i.version }));
    autoUpdater.on("error", (e) => envia("erro", { msg: e.message }));

    ipcMain.handle("check-update", async () => {
      if (!app.isPackaged) return { erro: "Atualização só funciona no app instalado." };
      try { await autoUpdater.checkForUpdates(); return {}; }
      catch (e) { return { erro: e.message }; }
    });
    ipcMain.handle("install-update", () => { if (app.isPackaged) autoUpdater.quitAndInstall(); });

    if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify().catch((e) => console.error("update:", e.message));
  }

  backupDiario();
  setInterval(backupDiario, 3600 * 1000); // loja fica aberta o dia todo
  createWindow();
});

app.on("window-all-closed", () => app.quit());
