import React, { useEffect, useState } from "react";

export const lerConfig = async () => {
  const linhas = await window.api.query("SELECT chave, valor FROM config");
  return Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
};

export const salvarConfig = (chave, valor) =>
  window.api.query("INSERT OR REPLACE INTO config (chave, valor) VALUES (?,?)", [chave, valor]);

const bloco = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, marginBottom: 16 };
const btn = { padding: "10px 18px", fontSize: 15, fontWeight: "bold", border: "none", borderRadius: 8, cursor: "pointer", background: "#38bdf8", color: "#0f172a" };

export default function Config({ aoMudar }) {
  const [cfg, setCfg] = useState(null);
  const [msgBackup, setMsgBackup] = useState("");

  useEffect(() => {
    lerConfig().then(setCfg);
  }, []);

  if (!cfg) return null;

  const gravar = async (chave, valor) => {
    await salvarConfig(chave, valor);
    setCfg({ ...cfg, [chave]: valor });
    aoMudar();
  };

  const backupAgora = async () => {
    setMsgBackup("Fazendo backup…");
    const r = await window.api.backupAgora();
    setMsgBackup(r.ok ? `✔ Backup salvo em ${r.destino}` : `✖ ${r.erro}`);
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={bloco}>
        <h3 style={{ marginTop: 0 }}>Título do sistema</h3>
        <input
          style={{ padding: 10, fontSize: 16, borderRadius: 6, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box" }}
          value={cfg.titulo ?? "Estoque Celular"}
          onChange={(e) => gravar("titulo", e.target.value)}
        />
      </div>

      <div style={bloco}>
        <h3 style={{ marginTop: 0 }}>Logo</h3>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {cfg.logo && <img src={cfg.logo} alt="logo" style={{ height: 48 }} />}
          <button style={btn} onClick={async () => {
            const logo = await window.api.escolherLogo();
            if (logo) gravar("logo", logo);
          }}>
            Escolher logo…
          </button>
          {cfg.logo && (
            <button style={{ ...btn, background: "#fee2e2", color: "#dc2626" }} onClick={() => gravar("logo", "")}>
              Remover
            </button>
          )}
        </div>
      </div>

      <div style={bloco}>
        <h3 style={{ marginTop: 0 }}>Mão de obra na venda</h3>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 16, cursor: "pointer" }}>
          <input
            type="checkbox"
            style={{ width: 22, height: 22 }}
            checked={cfg.mao_de_obra !== "0"}
            onChange={(e) => gravar("mao_de_obra", e.target.checked ? "1" : "0")}
          />
          Mostrar campo "Mão de obra" ao vender
        </label>
      </div>

      <div style={bloco}>
        <h3 style={{ marginTop: 0 }}>Backup</h3>
        <div style={{ marginBottom: 8, fontSize: 15 }}>
          Pasta: <strong>{cfg.pasta_backup || "nenhuma (backup desligado)"}</strong>
        </div>
        <div style={{ fontSize: 14, color: "#64748b", marginBottom: 12 }}>
          Dica: escolha a pasta do Google Drive do computador — o backup sobe pra nuvem sozinho.
          Backup roda ao abrir o app e a cada 1 hora (1 arquivo por dia).
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn} onClick={async () => {
            const pasta = await window.api.escolherPasta();
            if (pasta) gravar("pasta_backup", pasta);
          }}>
            Escolher pasta…
          </button>
          <button style={{ ...btn, background: "#22c55e", color: "white" }} onClick={backupAgora}>
            Fazer backup agora
          </button>
        </div>
        {msgBackup && <div style={{ marginTop: 8, fontSize: 15 }}>{msgBackup}</div>}
      </div>
    </div>
  );
}
