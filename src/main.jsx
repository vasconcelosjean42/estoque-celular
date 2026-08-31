import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// alert/confirm nativos travam o input da janela no Electron/Windows;
// troca pelos diálogos do sistema (as telas continuam chamando alert/confirm).
if (window.api?.alerta) {
  window.alert = (msg) => window.api.alerta(msg);
  window.confirm = (msg) => window.api.confirmar(msg);
}

// Nenhuma tela trata erro de SQL. Sem isto a operação falhava calada e o usuário
// achava que tinha dado certo. Rede de segurança única para todas as telas.
let ultimoAviso = { msg: null, t: 0 };
window.addEventListener("unhandledrejection", (e) => {
  e.preventDefault();
  console.error("operação falhou:", e.reason); // fica no log p/ diagnóstico e p/ os testes
  const msg = String(e.reason?.message || e.reason);
  // Uma tela dispara várias queries de uma vez; com o PC principal desligado
  // todas falham juntas e viravam uma pilha de diálogos. Um aviso por vez.
  if (msg === ultimoAviso.msg && Date.now() - ultimoAviso.t < 5000) return;
  window.alert(`Não foi possível concluir a operação.\n\n${msg}`);
  ultimoAviso = { msg, t: Date.now() }; // marcado DEPOIS: o diálogo trava o renderer
});

createRoot(document.getElementById("root")).render(<App />);
