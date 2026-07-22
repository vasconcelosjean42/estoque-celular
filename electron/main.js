const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

let db;

function backupDiario() {
  // Copia o .db para a pasta de backup (aponte para a pasta do Google Drive
  // desktop nas configurações e o Drive sobe sozinho quando tiver internet).
  const row = db.prepare("SELECT valor FROM config WHERE chave = 'pasta_backup'").get();
  if (!row) return;
  const destino = path.join(row.valor, `estoque-${new Date().toISOString().slice(0, 10)}.db`);
  try {
    db.backup(destino);
  } catch (e) {
    console.error("backup falhou:", e.message);
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

  backupDiario();
  createWindow();
});

app.on("window-all-closed", () => app.quit());
