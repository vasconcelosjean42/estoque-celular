import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// alert/confirm nativos travam o input da janela no Electron/Windows;
// troca pelos diálogos do sistema (as telas continuam chamando alert/confirm).
if (window.api?.alerta) {
  window.alert = (msg) => window.api.alerta(msg);
  window.confirm = (msg) => window.api.confirmar(msg);
}

createRoot(document.getElementById("root")).render(<App />);
