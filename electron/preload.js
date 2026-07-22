const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  query: (sql, params) => ipcRenderer.invoke("db", sql, params),
  tx: (comandos) => ipcRenderer.invoke("db-tx", comandos),
});
