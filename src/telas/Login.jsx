import React, { useEffect, useState } from "react";

const btn = { padding: "12px 32px", fontSize: 18, fontWeight: "bold", border: "none", borderRadius: 8, cursor: "pointer" };

export default function Login({ aoEntrar }) {
  const [usuarios, setUsuarios] = useState([]);
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState("");
  const [semPrincipal, setSemPrincipal] = useState(null); // { url } — balcão sem o PC principal
  const [desfeito, setDesfeito] = useState(false);

  useEffect(() => {
    window.api.query("SELECT * FROM usuarios ORDER BY papel DESC, nome")
      .then(setUsuarios)
      .catch(async (e) => {
        // O balcão só existe enquanto o principal está ligado. Se ele estiver
        // desligado, ou tiver saído da loja, esta lista não vem e o sistema
        // inteiro fica atrás dela — inclusive a Config, que é onde se desfaz a
        // conexão. Então a saída tem que estar aqui, antes do login.
        const cfg = await window.api.redeInfo?.().catch(() => null);
        if (cfg?.modo !== "cliente") throw e; // erro de banco local: segue pro aviso de sempre
        setSemPrincipal({ url: cfg.url });
      });
  }, []);

  const desconectar = async () => {
    if (!window.confirm(
      "Este computador vai parar de usar o banco do PC principal e voltar a usar o banco guardado aqui.\n\n" +
      "As vendas que estão no PC principal continuam lá — elas voltam a aparecer quando você conectar nele de novo, em Config → Rede.\n\n" +
      "Desconectar agora?"
    )) return;
    await window.api.redeDesconectar();
    setDesfeito(true); // o app reabre sozinho; se não reabrir, o aviso fica na tela
  };

  const entrar = () => {
    if (pin === sel.pin) return aoEntrar(sel);
    alert("PIN incorreto.");
    setPin("");
  };

  return (
    <div style={{ fontFamily: "sans-serif", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, background: "#1e293b" }}>
      <h1 style={{ color: "white", margin: 0 }}>{semPrincipal ? "Sem conexão com o PC principal" : "Quem está usando?"}</h1>
      {semPrincipal ? (
        <div style={{ background: "white", borderRadius: 12, padding: 24, maxWidth: 640, fontSize: 16, color: "#334155" }}>
          <p style={{ marginTop: 0 }}>
            Este computador está configurado como <strong>PC do balcão</strong>: ele não guarda os dados,
            lê tudo do PC principal (<strong>{semPrincipal.url || "endereço não informado"}</strong>) — e
            não conseguiu falar com ele agora.
          </p>
          <p>Se o PC principal está na loja, ligue ele e abra o sistema lá; depois reabra este aqui.</p>
          {desfeito ? (
            <div style={{ fontSize: 17, fontWeight: "bold", color: "#166534" }}>
              ✔ Pronto, desconectado. Se a tela não voltar sozinha em alguns segundos, feche e abra o sistema.
            </div>
          ) : (
            <>
              <p style={{ marginBottom: 12 }}>
                Se ele não vai voltar (levaram o computador, trocou de máquina), use o botão abaixo para
                soltar este PC e trabalhar sozinho com o banco que está guardado aqui:
              </p>
              <button style={{ ...btn, background: "#22c55e", color: "white" }} onClick={desconectar}>
                Usar o banco deste computador
              </button>
            </>
          )}
        </div>
      ) : !sel ? (
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
