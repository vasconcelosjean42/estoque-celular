import React, { useState } from "react";

const TELAS = ["Estoque", "Venda", "Dashboard", "Trocas", "Config"];

export default function App() {
  const [tela, setTela] = useState("Estoque");

  return (
    <div style={{ fontFamily: "sans-serif", height: "100vh", display: "flex", flexDirection: "column" }}>
      <nav style={{ display: "flex", gap: 8, padding: 12, background: "#1e293b" }}>
        {TELAS.map((t) => (
          <button
            key={t}
            onClick={() => setTela(t)}
            style={{
              flex: 1,
              padding: "16px 0",
              fontSize: 20,
              fontWeight: "bold",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              background: t === tela ? "#38bdf8" : "#334155",
              color: t === tela ? "#0f172a" : "#e2e8f0",
            }}
          >
            {t}
          </button>
        ))}
      </nav>
      <main style={{ flex: 1, padding: 24 }}>
        <h1>{tela}</h1>
      </main>
    </div>
  );
}
