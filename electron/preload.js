const { contextBridge, ipcRenderer } = require("electron");

// O IPC embrulha o erro em "Error invoking remote method 'db': Error: ...".
// A mensagem cai num diálogo na frente do cliente da loja (src/main.jsx), então
// chega limpa: vale pro erro de SQL e pros avisos de rede do passo 27.
const limpo = (p) =>
  p.catch((e) => {
    throw new Error(String(e.message).replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, ""));
  });

contextBridge.exposeInMainWorld("api", {
  query: (sql, params) => limpo(ipcRenderer.invoke("db", sql, params)),
  tx: (comandos) => limpo(ipcRenderer.invoke("db-tx", comandos)),
  redeInfo: () => ipcRenderer.invoke("rede-info"),
  redeSalvar: (cfg) => ipcRenderer.invoke("rede-salvar", cfg),
  redeTestar: (url, token) => ipcRenderer.invoke("rede-testar", { url, token }),
  redeFirewall: () => ipcRenderer.invoke("rede-firewall"),
  redeDesconectar: () => ipcRenderer.invoke("rede-desconectar"),
  abrirPlanilha: () => ipcRenderer.invoke("abrir-planilha"),
  salvarPlanilha: (sugestao, linhas) => ipcRenderer.invoke("salvar-planilha", { sugestao, linhas }),
  escolherPasta: () => ipcRenderer.invoke("escolher-pasta"),
  escolherLogo: () => ipcRenderer.invoke("escolher-logo"),
  backupAgora: () => ipcRenderer.invoke("backup-agora"),
  alerta: (msg) => { ipcRenderer.sendSync("dialogo", { tipo: "alert", msg: String(msg) }); },
  confirmar: (msg) => ipcRenderer.sendSync("dialogo", { tipo: "confirm", msg: String(msg) }) === 0,
  gerarNotaPdf: (html, numero) => ipcRenderer.invoke("nota-pdf", { html, numero }),
  autoStart: (ligado) => ipcRenderer.invoke("auto-start", ligado),
  appInfo: () => ipcRenderer.invoke("app-info"),
  checkUpdate: () => ipcRenderer.invoke("check-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdateStatus: (cb) => ipcRenderer.on("update-status", (_e, d) => cb(d)),
});
