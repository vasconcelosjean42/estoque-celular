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
window.addEventListener("unhandledrejection", (e) => {
  e.preventDefault();
  console.error("operação falhou:", e.reason); // fica no log p/ diagnóstico e p/ os testes
  window.alert(`Não foi possível concluir a operação.\n\n${e.reason?.message || e.reason}`);
});

createRoot(document.getElementById("root")).render(<App />);
