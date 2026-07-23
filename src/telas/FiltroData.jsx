import React from "react";

export const isoDia = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// [chave, rótulo do botão, sufixo do título, calcula [de, até] ('' = sem limite)]
export const ATALHOS = [
  ["hoje", "Hoje", "de hoje", () => { const h = isoDia(Date.now()); return [h, h]; }],
  ["ontem", "Ontem", "de ontem", () => { const d = isoDia(Date.now() - 86400000); return [d, d]; }],
  ["semana", "Esta semana", "da semana", () => { const h = new Date(); return [isoDia(h.getTime() - ((h.getDay() + 6) % 7) * 86400000), isoDia(h)]; }],
  ["mes", "Este mês", "do mês", () => { const h = isoDia(Date.now()); return [`${h.slice(0, 8)}01`, h]; }],
  ["tudo", "Tudo", "", () => ["", ""]],
];

export const calcAtalho = (chave) => ATALHOS.find(([c]) => c === chave)[3]();

// sel = null quando o período veio dos campos de data manuais
export const sufixoTitulo = (sel) => (sel ? ATALHOS.find(([c]) => c === sel)[2] : "do período");

export default function FiltroData({ sel, aoEscolher }) {
  return ATALHOS.map(([chave, rotulo, , calc]) => (
    <button key={chave} onClick={() => aoEscolher(chave, ...calc())}
      style={{ padding: "8px 14px", fontSize: 14, fontWeight: "bold", border: "none", borderRadius: 6, cursor: "pointer",
        background: sel === chave ? "#38bdf8" : "#e2e8f0", color: sel === chave ? "#0f172a" : "#334155" }}>
      {rotulo}
    </button>
  ));
}
