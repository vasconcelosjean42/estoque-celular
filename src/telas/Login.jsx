import React, { useEffect, useState } from "react";

const btn = { padding: "12px 32px", fontSize: 18, fontWeight: "bold", border: "none", borderRadius: 8, cursor: "pointer" };

// Símbolo de Wi-Fi cortado. SVG na mão: é o único ícone do app.
const IconeWifi = ({ cor }) => (
  <svg width="140" height="140" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 8.8a15 15 0 0 1 20 0" />
    <path d="M5 12.5a10 10 0 0 1 14 0" />
    <path d="M8.5 16.2a5 5 0 0 1 7 0" />
    <circle cx="12" cy="19.8" r="0.9" fill={cor} />
    <path d="M3 3l18 18" stroke="#ef4444" strokeWidth="2.4" />
  </svg>
);

const IconePc = ({ cor }) => (
  <svg width="140" height="140" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="13" rx="2" />
    <path d="M8 21h8M12 16v5" />
    <path d="M9 7.5l6 5M15 7.5l-6 5" stroke="#ef4444" strokeWidth="2.4" />
  </svg>
);

// Quanto tempo esperando antes de oferecer "usar o banco deste computador".
// Na loja, a saída de emergência foi clicada 8s depois da rede voltar: o Wi-Fi
// do notebook leva ~2 min pra pegar IP depois de acordar.
const ESPERA_SAIDA_MS = 2 * 60 * 1000;

export default function Login({ aoEntrar, aoConectar }) {
  const [usuarios, setUsuarios] = useState([]);
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState("");
  const [semPrincipal, setSemPrincipal] = useState(null); // { url, desde } — balcão sem o PC principal
  const [situacao, setSituacao] = useState(null); // sem-rede | outra-rede | principal | resposta
  const [recusa, setRecusa] = useState(""); // o que o principal respondeu quando a porta abre mas o login não vem
  const [agora, setAgora] = useState(Date.now());
  const [desfeito, setDesfeito] = useState(false);

  const carregar = () =>
    window.api.query("SELECT * FROM usuarios ORDER BY papel DESC, nome").then((u) => {
      setUsuarios(u);
      setSemPrincipal(null);
    });

  useEffect(() => {
    carregar().catch(async (e) => {
      // O balcão só existe enquanto o principal está ligado. Se ele estiver
      // desligado, ou tiver saído da loja, esta lista não vem e o sistema
      // inteiro fica atrás dela — inclusive a Config, que é onde se desfaz a
      // conexão. Então a saída tem que estar aqui, antes do login.
      const cfg = await window.api.redeInfo?.().catch(() => null);
      if (cfg?.modo !== "cliente") throw e; // erro de banco local: segue pro aviso de sempre
      setSemPrincipal({ url: cfg.url, desde: Date.now() });
    });
  }, []);

  // Enquanto está sem o principal, tenta de novo sozinho: quase sempre é o
  // Wi-Fi do notebook que ainda não voltou, e ele volta em 1 ou 2 minutos.
  useEffect(() => {
    if (!semPrincipal || desfeito) return;
    let vivo = true;
    const tentar = async () => {
      const s = await window.api.redeSondar().catch(() => ({ situacao: "principal" }));
      if (!vivo) return;
      setAgora(Date.now());
      if (s.situacao !== "ok") return setSituacao(s.situacao);
      // A porta abriu mas a lista não veio: é o principal recusando (versão
      // diferente no meio da atualização, token). Dizer "Wi-Fi errado" aqui
      // mandaria a pessoa mexer na coisa errada.
      await carregar().then(aoConectar).catch((e) => { setSituacao("resposta"); setRecusa(e.message); });
    };
    tentar();
    const t = setInterval(tentar, 3000);
    return () => { vivo = false; clearInterval(t); };
  }, [semPrincipal, desfeito]);

  const desconectar = async () => {
    if (!window.confirm(
      "Este computador vai parar de usar o banco do PC principal e voltar a usar o banco guardado aqui.\n\n" +
      "As vendas que estão no PC principal continuam lá — elas voltam a aparecer quando você conectar nele de novo, em Config → Rede.\n\n" +
      "Desconectar agora?"
    )) return;
    await window.api.redeDesconectar("tela de login, sem conexão com o principal");
    setDesfeito(true); // o app reabre sozinho; se não reabrir, o aviso fica na tela
  };

  const entrar = () => {
    if (pin === sel.pin) return aoEntrar(sel);
    alert("PIN incorreto.");
    setPin("");
  };

  if (semPrincipal) {
    const wifi = !["principal", "resposta"].includes(situacao); // antes da 1ª sondagem, o provável é o Wi-Fi
    // Com versões diferentes, desconectar é o pior movimento: vira dois estoques.
    const mostrarSaida = situacao !== "resposta" && agora - semPrincipal.desde >= ESPERA_SAIDA_MS;
    return (
      <div style={{ fontFamily: "sans-serif", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, background: "#1e293b", padding: 24, boxSizing: "border-box", textAlign: "center" }}>
        {desfeito ? (
          <div style={{ fontSize: 22, fontWeight: "bold", color: "#86efac" }}>
            ✔ Pronto, desconectado. Se a tela não voltar sozinha em alguns segundos, feche e abra o sistema.
          </div>
        ) : (
          <>
            {wifi ? <IconeWifi cor="#fbbf24" /> : <IconePc cor="#fbbf24" />}
            <h1 style={{ color: "#fbbf24", margin: 0, fontSize: 44, lineHeight: 1.2, maxWidth: 900 }}>
              {wifi
                ? "O notebook não está conectado na rede, ou está conectado no Wi-Fi errado"
                : situacao === "resposta" ? "O PC principal respondeu, mas não deixou entrar"
                : "O PC principal não está respondendo"}
            </h1>
            <div style={{ color: "white", fontSize: 26, maxWidth: 820, lineHeight: 1.4 }}>
              {wifi
                ? "Conecte o notebook no Wi-Fi da loja."
                : situacao === "resposta" ? recusa
                : "Confira se o PC principal está ligado e com o sistema aberto."}
            </div>
            <div style={{ color: "#94a3b8", fontSize: 20 }}>
              ⟳ Tentando de novo sozinho… assim que conectar, o sistema abre. Não precisa fechar.
            </div>
            {mostrarSaida && (
              <button onClick={desconectar}
                style={{ marginTop: 40, background: "none", border: "none", color: "#64748b", fontSize: 14, textDecoration: "underline", cursor: "pointer" }}>
                O PC principal não vai voltar (levaram, queimou)? Usar o banco deste computador
              </button>
            )}
          </>
        )}
      </div>
    );
  }

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
