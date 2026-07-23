const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  query: (sql, params) => ipcRenderer.invoke("db", sql, params),
  tx: (comandos) => ipcRenderer.invoke("db-tx", comandos),
  escolherPasta: () => ipcRenderer.invoke("escolher-pasta"),
  escolherLogo: () => ipcRenderer.invoke("escolher-logo"),
  backupAgora: () => ipcRenderer.invoke("backup-agora"),
  alerta: (msg) => { ipcRenderer.sendSync("dialogo", { tipo: "alert", msg: String(msg) }); },
  confirmar: (msg) => ipcRenderer.sendSync("dialogo", { tipo: "confirm", msg: String(msg) }) === 0,
  gerarNotaPdf: (html, numero) => ipcRenderer.invoke("nota-pdf", { html, numero }),
});
