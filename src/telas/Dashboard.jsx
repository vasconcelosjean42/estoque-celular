import React, { useEffect, useState } from "react";
import { fmtReais } from "./Estoque.jsx";
import { FORMAS } from "./Venda.jsx";

const FAT = "SUM(preco_venda * quantidade + mao_de_obra)";
const LUCRO = "SUM((preco_venda - preco_compra) * quantidade + mao_de_obra)";

const PERIODOS = [
  ["Hoje", "date(criado_em) = date('now','localtime')"],
  ["Últimos 7 dias", "date(criado_em) >= date('now','localtime','-6 days')"],
  ["Este mês", "strftime('%Y-%m', criado_em) = strftime('%Y-%m', 'now', 'localtime')"],
  ["Este ano", "strftime('%Y', criado_em) = strftime('%Y', 'now', 'localtime')"],
];

const isoDia = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function Dashboard() {
  const [cards, setCards] = useState([]);
  const [fechamento, setFechamento] = useState([]);
  const [porDia, setPorDia] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [hoverDia, setHoverDia] = useState(null);
  const [pagina, setPagina] = useState(0);
  const [diaSel, setDiaSel] = useState(null); // { chave, rotulo, formas: [{forma_pagamento, total}] }
  const [grafMode, setGrafMode] = useState("14d"); // 14d | mes | ano

  useEffect(() => {
    Promise.all(
      PERIODOS.map(([rotulo, where]) =>
        window.api
          .query(`SELECT ${FAT} AS fat, ${LUCRO} AS lucro FROM vendas WHERE ${where}`)
          .then(([r]) => ({ rotulo, fat: r.fat || 0, lucro: r.lucro || 0 }))
      )
    ).then(setCards);
    window.api
      .query(
        `SELECT forma_pagamento, ${FAT} AS total FROM vendas
         WHERE date(criado_em) = date('now','localtime') GROUP BY forma_pagamento`
      )
      .then(setFechamento);
  }, []);

  useEffect(() => {
    const sql = {
      "14d": `SELECT date(criado_em) AS chave, ${FAT} AS total, ${LUCRO} AS lucro FROM vendas
              WHERE date(criado_em) >= date('now','localtime','-13 days') GROUP BY chave`,
      mes: `SELECT date(criado_em) AS chave, ${FAT} AS total, ${LUCRO} AS lucro FROM vendas
            WHERE strftime('%Y-%m', criado_em) = strftime('%Y-%m','now','localtime') GROUP BY chave`,
      ano: `SELECT strftime('%Y-%m', criado_em) AS chave, ${FAT} AS total, ${LUCRO} AS lucro FROM vendas
            WHERE strftime('%Y', criado_em) = strftime('%Y','now','localtime') GROUP BY chave`,
    }[grafMode];
    window.api.query(sql).then(setPorDia);
    setDiaSel(null);
  }, [grafMode]);

  useEffect(() => {
    const condicoes = [];
    const params = [];
    if (de) { condicoes.push("date(v.criado_em) >= ?"); params.push(de); }
    if (ate) { condicoes.push("date(v.criado_em) <= ?"); params.push(ate); }
    const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
    window.api
      .query(
        `SELECT v.*, p.nome, p.modelo FROM vendas v JOIN pecas p ON p.id = v.peca_id
         ${where} ORDER BY v.id DESC`,
        params
      )
      .then(setHistorico);
    setPagina(0);
  }, [de, ate]);

  const hoje = new Date();
  const atalhos = [
    ["Hoje", () => [isoDia(hoje), isoDia(hoje)]],
    ["Ontem", () => { const d = isoDia(hoje.getTime() - 86400000); return [d, d]; }],
    ["Esta semana", () => [isoDia(hoje.getTime() - ((hoje.getDay() + 6) % 7) * 86400000), isoDia(hoje)]],
    ["Este mês", () => [`${isoDia(hoje).slice(0, 8)}01`, isoDia(hoje)]],
    ["Tudo", () => ["", ""]],
  ];

  const totalFiltro = historico.reduce((s, v) => s + v.preco_venda * v.quantidade + v.mao_de_obra, 0);
  const lucroFiltro = historico.reduce((s, v) => s + (v.preco_venda - v.preco_compra) * v.quantidade + v.mao_de_obra, 0);

  const exportarExcel = () => {
    const num = (centavos) => (centavos / 100).toFixed(2).replace(".", ",");
    const linhas = [
      ["Data", "Hora", "Peça", "Modelo", "Qtd", "Preço unit.", "Mão de obra", "Total", "Forma de pagamento", "Custo unit.", "Lucro"],
      ...historico.map((v) => [
        `${v.criado_em.slice(8, 10)}/${v.criado_em.slice(5, 7)}/${v.criado_em.slice(0, 4)}`,
        v.criado_em.slice(11, 16), v.nome, v.modelo, v.quantidade,
        num(v.preco_venda), num(v.mao_de_obra), num(v.preco_venda * v.quantidade + v.mao_de_obra),
        FORMAS[v.forma_pagamento] || v.forma_pagamento, num(v.preco_compra),
        num((v.preco_venda - v.preco_compra) * v.quantidade + v.mao_de_obra),
      ]),
    ];
    // CSV pt-BR: separador ; e BOM p/ o Excel abrir com acento certo.
    const csv = "\uFEFF" + linhas
      .map((l) => l.map((c) => (/[;"\n]/.test(String(c)) ? `"${String(c).replaceAll('"', '""')}"` : c)).join(";"))
      .join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `historico-vendas${de ? `-${de}` : ""}${ate ? `-a-${ate}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const ddmm = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

  // A query só devolve períodos com venda; gerar todas as velas e preencher vazios com 0.
  const agora = new Date();
  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  let barras;
  if (grafMode === "ano") {
    barras = MESES.map((rotulo, m) => {
      const chave = `${agora.getFullYear()}-${String(m + 1).padStart(2, "0")}`;
      const a = porDia.find((d) => d.chave === chave);
      return { chave, rotulo, de: `${chave}-01`, ate: `${chave}-31`, total: a?.total || 0, lucro: a?.lucro || 0 };
    });
  } else {
    const qtdDias = grafMode === "14d" ? 14 : agora.getDate();
    barras = Array.from({ length: qtdDias }, (_, i) => {
      const chave = grafMode === "14d"
        ? isoDia(Date.now() - (13 - i) * 86400000)
        : `${isoDia(agora).slice(0, 8)}${String(i + 1).padStart(2, "0")}`;
      const a = porDia.find((d) => d.chave === chave);
      return { chave, rotulo: ddmm(chave), de: chave, ate: chave, total: a?.total || 0, lucro: a?.lucro || 0 };
    });
  }
  const maxDia = Math.max(...barras.map((d) => d.total), 1);

  const abrirDia = async (b) => {
    if (diaSel?.chave === b.chave) return setDiaSel(null); // clicar de novo na mesma vela fecha
    const formas = await window.api.query(
      `SELECT forma_pagamento, ${FAT} AS total FROM vendas
       WHERE date(criado_em) BETWEEN ? AND ? GROUP BY forma_pagamento`,
      [b.de, b.ate]
    );
    setDiaSel({ chave: b.chave, rotulo: b.rotulo, formas });
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {cards.map((c) => (
          <div key={c.rotulo} style={{ background: "#f1f5f9", borderRadius: 10, padding: 16 }}>
            <div style={{ color: "#64748b", fontWeight: "bold" }}>{c.rotulo}</div>
            <div style={{ fontSize: 22, fontWeight: "bold", marginTop: 4 }}>{fmtReais(c.fat)}</div>
            <div style={{ color: "#16a34a", fontWeight: "bold" }}>lucro {fmtReais(c.lucro)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
        <div>
          <h3 style={{ marginTop: 0 }}>Fechamento de hoje</h3>
          {Object.entries(FORMAS).map(([valor, rotulo]) => {
            const linha = fechamento.find((f) => f.forma_pagamento === valor);
            return (
              <div key={valor} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #e2e8f0", fontSize: 16 }}>
                <span>{rotulo}</span>
                <strong>{fmtReais(linha ? linha.total : 0)}</strong>
              </div>
            );
          })}
        </div>

        <div>
          <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
            Faturamento
            {[["14d", "14 dias"], ["mes", "Este mês"], ["ano", "Este ano"]].map(([modo, rotulo]) => (
              <button key={modo} onClick={() => setGrafMode(modo)}
                style={{ padding: "6px 12px", fontSize: 13, fontWeight: "bold", border: "none", borderRadius: 6, cursor: "pointer",
                  background: grafMode === modo ? "#38bdf8" : "#e2e8f0", color: grafMode === modo ? "#0f172a" : "#334155" }}>
                {rotulo}
              </button>
            ))}
            <span style={{ fontWeight: "normal", fontSize: 13, color: "#64748b" }}>(clique na vela p/ ver por forma de pagamento)</span>
          </h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: grafMode === "mes" ? 2 : 4, height: 120 }}>
            {barras.map((d, i) => (
              <div key={d.chave}
                onMouseEnter={() => setHoverDia(d.chave)}
                onMouseLeave={() => setHoverDia(null)}
                onClick={() => abrirDia(d)}
                style={{ flex: 1, position: "relative", display: "flex", alignItems: "flex-end", height: "100%", cursor: "pointer" }}>
                {hoverDia === d.chave && (
                  <div style={{
                    position: "absolute", bottom: "100%",
                    // pontas ancoram pro lado de dentro pra não estourar a tela
                    ...(i < 2 ? { left: 0 } : i > barras.length - 3 ? { right: 0 } : { left: "50%", transform: "translateX(-50%)" }),
                    background: "#0f172a", color: "white", padding: "6px 10px", borderRadius: 6,
                    fontSize: 13, whiteSpace: "nowrap", zIndex: 10, marginBottom: 4, pointerEvents: "none", lineHeight: 1.5,
                  }}>
                    <strong>{d.rotulo}</strong>
                    <div>venda {fmtReais(d.total)}</div>
                    <div style={{ color: "#4ade80" }}>lucro {fmtReais(d.lucro)}</div>
                  </div>
                )}
                <div style={{
                  width: "100%", borderRadius: "4px 4px 0 0",
                  background: d.total ? (hoverDia === d.chave ? "#0ea5e9" : "#38bdf8") : "#e2e8f0",
                  height: `${Math.max((d.total / maxDia) * 100, 2)}%`,
                  transition: "height .15s, background .15s, transform .15s",
                  transformOrigin: "bottom",
                  transform: hoverDia === d.chave ? "scaleY(1.08)" : "none",
                }} />
              </div>
            ))}
          </div>

          {diaSel && (
            <div style={{ marginTop: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <strong>{grafMode === "ano" ? diaSel.rotulo : `Dia ${diaSel.rotulo}`} por forma de pagamento</strong>
                <button onClick={() => setDiaSel(null)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 100 }}>
                {Object.entries(FORMAS).map(([valor, rotulo]) => {
                  const total = diaSel.formas.find((f) => f.forma_pagamento === valor)?.total || 0;
                  const maxForma = Math.max(...diaSel.formas.map((f) => f.total), 1);
                  return (
                    <div key={valor} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", height: "100%" }}>
                      <div style={{ fontSize: 12, fontWeight: "bold", marginBottom: 2 }}>{total ? fmtReais(total) : ""}</div>
                      <div style={{ width: "100%", borderRadius: "4px 4px 0 0", background: total ? "#a78bfa" : "#e2e8f0", height: `${Math.max((total / maxForma) * 70, 2)}%`, transition: "height .2s" }} />
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, textAlign: "center" }}>{rotulo}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <h3>Histórico de vendas</h3>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <input type="date" value={de} onChange={(e) => setDe(e.target.value)}
          style={{ padding: 8, fontSize: 15, borderRadius: 6, border: "1px solid #cbd5e1" }} />
        <span>até</span>
        <input type="date" value={ate} onChange={(e) => setAte(e.target.value)}
          style={{ padding: 8, fontSize: 15, borderRadius: 6, border: "1px solid #cbd5e1" }} />
        {atalhos.map(([rotulo, calc]) => (
          <button key={rotulo}
            onClick={() => { const [d, a] = calc(); setDe(d); setAte(a); }}
            style={{ padding: "8px 14px", fontSize: 14, fontWeight: "bold", border: "none", borderRadius: 6, cursor: "pointer", background: "#e2e8f0", color: "#334155" }}>
            {rotulo}
          </button>
        ))}
        <button onClick={exportarExcel} disabled={!historico.length}
          style={{ padding: "8px 14px", fontSize: 14, fontWeight: "bold", border: "none", borderRadius: 6, cursor: "pointer", background: "#16a34a", color: "white", marginLeft: "auto" }}>
          ⬇ Exportar Excel
        </button>
      </div>
      <div style={{ marginBottom: 8, fontSize: 15, color: "#475569" }}>
        {historico.length} venda{historico.length === 1 ? "" : "s"} no período — total{" "}
        <strong>{fmtReais(totalFiltro)}</strong> — lucro <strong style={{ color: "#16a34a" }}>{fmtReais(lucroFiltro)}</strong>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #cbd5e1" }}>
            {["Data", "Peça", "Qtd", "Total", "Forma", "Lucro"].map((h) => (
              <th key={h} style={{ padding: 8 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {historico.slice(pagina * 50, pagina * 50 + 50).map((v) => (
            <tr key={v.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: 8, color: "#64748b" }}>{v.criado_em.slice(8, 10)}/{v.criado_em.slice(5, 7)} {v.criado_em.slice(11, 16)}</td>
              <td style={{ padding: 8 }}>{v.quantidade}x {v.nome} {v.modelo}</td>
              <td style={{ padding: 8 }}>{v.quantidade}</td>
              <td style={{ padding: 8, fontWeight: "bold" }}>{fmtReais(v.preco_venda * v.quantidade + v.mao_de_obra)}</td>
              <td style={{ padding: 8 }}>{FORMAS[v.forma_pagamento] || v.forma_pagamento}</td>
              <td style={{ padding: 8, color: "#16a34a", fontWeight: "bold" }}>
                {fmtReais((v.preco_venda - v.preco_compra) * v.quantidade + v.mao_de_obra)}
              </td>
            </tr>
          ))}
          {historico.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 16, color: "#64748b" }}>Nenhuma venda registrada.</td></tr>
          )}
        </tbody>
      </table>
      {historico.length > 50 && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "center", padding: 12 }}>
          <button disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}
            style={{ padding: "8px 14px", fontSize: 14, fontWeight: "bold", border: "none", borderRadius: 6, cursor: "pointer", background: "#e2e8f0" }}>
            ‹ Anterior
          </button>
          <span style={{ fontSize: 15, color: "#475569" }}>
            página {pagina + 1} de {Math.ceil(historico.length / 50)}
          </span>
          <button disabled={(pagina + 1) * 50 >= historico.length} onClick={() => setPagina(pagina + 1)}
            style={{ padding: "8px 14px", fontSize: 14, fontWeight: "bold", border: "none", borderRadius: 6, cursor: "pointer", background: "#e2e8f0" }}>
            Próxima ›
          </button>
        </div>
      )}
    </div>
  );
}
