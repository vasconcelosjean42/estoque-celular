import React, { useEffect, useState } from "react";
import Estoque from "./telas/Estoque.jsx";
import Venda from "./telas/Venda.jsx";
import Dashboard from "./telas/Dashboard.jsx";
import Config, { lerConfig } from "./telas/Config.jsx";
import Trocas from "./telas/Trocas.jsx";
import Login from "./telas/Login.jsx";

const TELAS = ["Estoque", "Venda", "Dashboard", "Trocas", "Config"];

export default function App() {
  const [tela, setTela] = useState("Estoque");
  const [cfg, setCfg] = useState({});
  const [trocaDe, setTrocaDe] = useState(null); // venda levada da aba Venda pra Trocas
  const [usuario, setUsuario] = useState(null);

  const carregarCfg = () => lerConfig().then(setCfg);

  useEffect(() => {
    carregarCfg();
  }, []);

  const titulo = cfg.titulo || "Estoque Celular";
  useEffect(() => {
    document.title = titulo;
  }, [titulo]);

  if (!usuario) return <Login aoEntrar={(u) => { setUsuario(u); setTela("Estoque"); }} />;
  const dono = usuario.papel === "dono";
  const telas = dono ? TELAS : ["Estoque", "Venda"];

  return (
    <div style={{ fontFamily: "sans-serif", height: "100vh", display: "flex", flexDirection: "column" }}>
      <nav style={{ display: "flex", gap: 8, padding: 12, background: "#1e293b", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", color: "white", fontWeight: "bold", fontSize: 18, marginRight: 8 }}>
          {cfg.logo && <img src={cfg.logo} alt="" style={{ height: 36 }} />}
          {titulo}
        </div>
        {telas.map((t) => (
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
        <div style={{ color: "#94a3b8", fontSize: 14, marginLeft: 8, display: "flex", gap: 8, alignItems: "center", whiteSpace: "nowrap" }}>
          {usuario.nome}
          <button onClick={() => setUsuario(null)}
            style={{ padding: "8px 14px", fontSize: 14, fontWeight: "bold", border: "none", borderRadius: 6, cursor: "pointer", background: "#334155", color: "#e2e8f0" }}>
            Sair
          </button>
        </div>
      </nav>
      <main style={{ flex: 1, padding: 24, overflow: "auto" }}>
        {tela === "Estoque" ? <Estoque dono={dono} />
          : tela === "Venda" ? <Venda maoDeObraOn={cfg.mao_de_obra !== "0"} dono={dono} aoTrocar={(v) => { setTrocaDe(v); setTela("Trocas"); }} />
          : tela === "Dashboard" ? <Dashboard />
          : tela === "Trocas" ? <Trocas vendaTroca={trocaDe} aoConsumir={() => setTrocaDe(null)} />
          : tela === "Config" ? <Config aoMudar={carregarCfg} />
          : <h1>{tela}</h1>}
      </main>
    </div>
  );
}
