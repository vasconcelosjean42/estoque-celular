import React, { useState } from "react";
import { fmtReais } from "./Estoque.jsx";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const agora = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Recibo térmico 80mm como HTML autocontido (imprime na térmica ou salva PDF).
function reciboHTML(d, cfg) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: 80mm auto; margin: 3mm; }
    body { width: 74mm; margin: 0; color: #000; font-family: monospace; font-size: 11px; line-height: 1.35; }
    .c { text-align: center; } .b { font-weight: bold; }
    img.logo { display: block; margin: 0 auto 4px; max-width: 40mm; max-height: 28mm; }
    hr { border: none; border-top: 1px dashed #000; margin: 5px 0; }
    .tot { font-size: 14px; font-weight: bold; margin-top: 4px; }
  </style></head><body>
    ${cfg.logo ? `<img class="logo" src="${cfg.logo}">` : ""}
    <div class="c b">${esc(cfg.nota_loja_nome || cfg.titulo || "")}</div>
    ${cfg.nota_loja_endereco ? `<div class="c">${esc(cfg.nota_loja_endereco)}</div>` : ""}
    ${cfg.nota_loja_telefone ? `<div class="c">${esc(cfg.nota_loja_telefone)}</div>` : ""}
    ${cfg.nota_loja_email ? `<div class="c">${esc(cfg.nota_loja_email)}</div>` : ""}
    <hr><div class="c b">RECIBO</div><hr>
    <div>Nº ${String(d.numero).padStart(4, "0")}</div>
    <div>Data: ${d.data}</div>
    ${d.cliente_nome ? `<div>Cliente: ${esc(d.cliente_nome)}</div>` : ""}
    ${d.cliente_contato ? `<div>Contato: ${esc(d.cliente_contato)}</div>` : ""}
    <hr>
    <div>${esc(d.descricao)}</div>
    <div class="tot">TOTAL: ${esc(fmtReais(d.valor_total))}</div>
    <hr>
    <div class="c">${esc(cfg.nota_rodape || "Obrigado pela preferência!")}</div>
  </body></html>`;
}

// Gera o PDF no main (printToPDF) e abre — window.print() do renderer abre
// diálogo sem preview no Windows.
async function imprimirRecibo(html, numero) {
  const r = await window.api.gerarNotaPdf(html, numero);
  if (r && !r.ok) alert(`Não foi possível gerar o PDF da nota: ${r.erro}`);
}

export function reimprimirNota(nota, cfg) {
  const c = nota.criado_em;
  imprimirRecibo(reciboHTML({
    numero: nota.numero,
    data: `${c.slice(8, 10)}/${c.slice(5, 7)}/${c.slice(0, 4)} ${c.slice(11, 16)}`,
    cliente_nome: nota.cliente_nome, cliente_contato: nota.cliente_contato,
    descricao: nota.descricao, valor_total: nota.valor_total,
  }, cfg), nota.numero);
}

const inp = { padding: 10, fontSize: 16, borderRadius: 6, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box" };
const btn = { padding: "12px 20px", fontSize: 16, fontWeight: "bold", border: "none", borderRadius: 8, cursor: "pointer" };

// venda = { id, cliente, descricao, valor_total (centavos) }
export function NotaModal({ venda, cfg, aoFechar }) {
  const [contato, setContato] = useState("");

  const gerar = async () => {
    const [{ n }] = await window.api.query("SELECT COALESCE(MAX(numero),0)+1 AS n FROM notas");
    await window.api.query(
      "INSERT INTO notas (venda_id, numero, cliente_nome, cliente_contato, descricao, valor_total) VALUES (?,?,?,?,?,?)",
      [venda.id, n, venda.cliente || "", contato.trim(), venda.descricao, venda.valor_total]
    );
    imprimirRecibo(reciboHTML({
      numero: n, data: agora(), cliente_nome: venda.cliente, cliente_contato: contato.trim(),
      descricao: venda.descricao, valor_total: venda.valor_total,
    }, cfg), n);
    aoFechar();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
      onClick={aoFechar}>
      <div style={{ background: "white", borderRadius: 12, padding: 24, minWidth: 360, maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Gerar nota</h3>
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 15 }}>
          <div>{venda.descricao}</div>
          {venda.cliente && <div style={{ color: "#64748b" }}>Cliente: {venda.cliente}</div>}
          <div style={{ fontWeight: "bold", fontSize: 18, marginTop: 4 }}>Total: {fmtReais(venda.valor_total)}</div>
        </div>
        <label style={{ display: "block", marginBottom: 16 }}>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Contato do cliente (opcional)</div>
          <input style={inp} autoFocus placeholder="email ou telefone" value={contato}
            onChange={(e) => setContato(e.target.value)} />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...btn, background: "#22c55e", color: "white", flex: 1 }} onClick={gerar}>
            Gerar nota (PDF)
          </button>
          <button style={{ ...btn, background: "#e2e8f0" }} onClick={aoFechar}>Pular</button>
        </div>
      </div>
    </div>
  );
}
