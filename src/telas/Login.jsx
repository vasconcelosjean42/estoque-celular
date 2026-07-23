import React, { useEffect, useState } from "react";

const btn = { padding: "12px 32px", fontSize: 18, fontWeight: "bold", border: "none", borderRadius: 8, cursor: "pointer" };

export default function Login({ aoEntrar }) {
  const [usuarios, setUsuarios] = useState([]);
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState("");

  useEffect(() => {
    window.api.query("SELECT * FROM usuarios ORDER BY papel DESC, nome").then(setUsuarios);
  }, []);

  const entrar = () => {
    if (pin === sel.pin) return aoEntrar(sel);
    alert("PIN incorreto.");
    setPin("");
  };

  return (
    <div style={{ fontFamily: "sans-serif", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, background: "#1e293b" }}>
      <h1 style={{ color: "white", margin: 0 }}>Quem está usando?</h1>
      {!sel ? (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", maxWidth: 700 }}>
          {usuarios.map((u) => (
            <button key={u.id} onClick={() => { setSel(u); setPin(""); }}
              style={{ padding: "24px 40px", fontSize: 22, fontWeight: "bold", border: "none", borderRadius: 12, cursor: "pointer", background: "#38bdf8", color: "#0f172a" }}>
              {u.nome}
              <div style={{ fontSize: 14, fontWeight: "normal", marginTop: 4 }}>{u.papel === "dono" ? "administrador" : "colaborador"}</div>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div style={{ color: "#e2e8f0", fontSize: 18 }}>{sel.nome} — digite o PIN</div>
          <input autoFocus type="password" inputMode="numeric" maxLength={4} value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && entrar()}
            style={{ padding: 12, fontSize: 26, borderRadius: 8, border: "none", width: 160, textAlign: "center", letterSpacing: 10 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...btn, background: "#22c55e", color: "white" }} onClick={entrar}>Entrar</button>
            <button style={{ ...btn, background: "#334155", color: "#e2e8f0" }} onClick={() => setSel(null)}>Voltar</button>
          </div>
        </>
      )}
    </div>
  );
}
