const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

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
  if (app.isPackaged) win.loadFile(path.join(__dirname, "../dist/index.html"));
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

  backupDiario();
  setInterval(backupDiario, 3600 * 1000); // loja fica aberta o dia todo
  createWindow();
});

app.on("window-all-closed", () => app.quit());
