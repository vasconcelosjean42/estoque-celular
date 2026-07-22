import React, { useEffect, useState } from "react";
import { fmtReais, parseReais } from "./Estoque.jsx";

export const FORMAS = {
  especie: "Espécie",
  pix: "Pix",
  credito_avista: "Crédito à vista",
  credito_parcelado: "Crédito parcelado",
};

const inp = { padding: 10, fontSize: 16, borderRadius: 6, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box" };
const btn = { padding: "12px 20px", fontSize: 16, fontWeight: "bold", border: "none", borderRadius: 8, cursor: "pointer" };

export default function Venda() {
  const [pecas, setPecas] = useState([]);
  const [vendasHoje, setVendasHoje] = useState([]);
  const [busca, setBusca] = useState("");
  const [venda, setVenda] = useState(null); // { peca, qtd, preco, maoDeObra, forma }

  const carregar = () => {
    window.api.query("SELECT * FROM pecas ORDER BY nome, modelo").then(setPecas);
    window.api
      .query(
        `SELECT v.*, p.nome, p.modelo FROM vendas v JOIN pecas p ON p.id = v.peca_id
         WHERE date(v.criado_em) = date('now','localtime') ORDER BY v.id DESC`
      )
      .then(setVendasHoje);
  };

  useEffect(() => {
    carregar();
  }, []);

  const confirmar = async () => {
    const qtd = Number(venda.qtd);
    const preco = parseReais(venda.preco);
    const maoDeObra = venda.maoDeObra.trim() === "" ? 0 : parseReais(venda.maoDeObra);
    if (!qtd || qtd < 1 || qtd > venda.peca.quantidade) {
      alert(`Quantidade inválida (disponível: ${venda.peca.quantidade}).`);
      return;
    }
    if (isNaN(preco) || isNaN(maoDeObra)) {
      alert("Preço inválido.");
      return;
    }
    await window.api.tx([
      ["UPDATE pecas SET quantidade = quantidade - ? WHERE id = ?", [qtd, venda.peca.id]],
      [
        "INSERT INTO vendas (peca_id, quantidade, preco_venda, preco_compra, mao_de_obra, forma_pagamento) VALUES (?,?,?,?,?,?)",
        [venda.peca.id, qtd, preco, venda.peca.preco_compra, maoDeObra, venda.forma],
      ],
    ]);
    setVenda(null);
    setBusca("");
    carregar();
  };

  const desfazer = async (v) => {
    if (!confirm(`Desfazer a venda de ${v.quantidade}x ${v.nome} ${v.modelo}?`)) return;
    await window.api.tx([
      ["DELETE FROM vendas WHERE id = ?", [v.id]],
      ["UPDATE pecas SET quantidade = quantidade + ? WHERE id = ?", [v.quantidade, v.peca_id]],
    ]);
    carregar();
  };

  if (venda) {
    const total = (parseReais(venda.preco) || 0) * (Number(venda.qtd) || 0) + (parseReais(venda.maoDeObra) || 0);
    return (
      <div style={{ maxWidth: 480 }}>
        <h2>
          Vender: {venda.peca.nome} {venda.peca.modelo}
        </h2>
        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Quantidade (disponível: {venda.peca.quantidade})</div>
          <input style={inp} type="number" min={1} max={venda.peca.quantidade} value={venda.qtd}
            onChange={(e) => setVenda({ ...venda, qtd: e.target.value })} />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Preço unitário (R$) — edite p/ dar desconto</div>
          <input style={inp} value={venda.preco} onChange={(e) => setVenda({ ...venda, preco: e.target.value })} />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Mão de obra (R$, opcional)</div>
          <input style={inp} placeholder="0,00" value={venda.maoDeObra}
            onChange={(e) => setVenda({ ...venda, maoDeObra: e.target.value })} />
        </label>
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>Forma de pagamento</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {Object.entries(FORMAS).map(([valor, rotulo]) => (
            <button key={valor} onClick={() => setVenda({ ...venda, forma: valor })}
              style={{ ...btn, background: venda.forma === valor ? "#38bdf8" : "#e2e8f0", color: venda.forma === valor ? "#0f172a" : "#334155" }}>
              {rotulo}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 22, fontWeight: "bold", marginBottom: 16 }}>Total: {fmtReais(total)}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...btn, background: "#22c55e", color: "white", flex: 1, fontSize: 20 }} onClick={confirmar}>
            Confirmar venda
          </button>
          <button style={{ ...btn, background: "#e2e8f0" }} onClick={() => setVenda(null)}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  const filtro = busca.trim().toLowerCase();
  const visiveis = filtro
    ? pecas.filter((p) => `${p.nome} ${p.modelo}`.toLowerCase().includes(filtro))
    : pecas;

  return (
    <div>
      <input style={{ ...inp, marginBottom: 16 }} autoFocus placeholder="Buscar peça para vender…"
        value={busca} onChange={(e) => setBusca(e.target.value)} />

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 16, marginBottom: 32 }}>
        <tbody>
          {visiveis.map((p) => (
            <tr key={p.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: 8, fontWeight: "bold" }}>{p.nome} {p.modelo}</td>
              <td style={{ padding: 8 }}>qtd: {p.quantidade}</td>
              <td style={{ padding: 8 }}>{fmtReais(p.preco_venda)}</td>
              <td style={{ padding: 8, textAlign: "right" }}>
                <button
                  disabled={p.quantidade < 1}
                  onClick={() => setVenda({
                    peca: p, qtd: 1,
                    preco: (p.preco_venda / 100).toFixed(2).replace(".", ","),
                    maoDeObra: "", forma: "especie",
                  })}
                  style={{ ...btn, background: p.quantidade < 1 ? "#e2e8f0" : "#22c55e", color: p.quantidade < 1 ? "#94a3b8" : "white", cursor: p.quantidade < 1 ? "not-allowed" : "pointer" }}>
                  Vender
                </button>
              </td>
            </tr>
          ))}
          {visiveis.length === 0 && (
            <tr><td style={{ padding: 24, color: "#64748b" }}>Nenhuma peça {filtro ? "encontrada" : "cadastrada"}.</td></tr>
          )}
        </tbody>
      </table>

      <h3>Vendas de hoje</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
        <tbody>
          {vendasHoje.map((v) => (
            <tr key={v.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: 8, color: "#64748b" }}>{v.criado_em.slice(11, 16)}</td>
              <td style={{ padding: 8 }}>{v.quantidade}x {v.nome} {v.modelo}</td>
              <td style={{ padding: 8, fontWeight: "bold" }}>{fmtReais(v.preco_venda * v.quantidade + v.mao_de_obra)}</td>
              <td style={{ padding: 8 }}>{FORMAS[v.forma_pagamento] || v.forma_pagamento}</td>
              <td style={{ padding: 8, textAlign: "right" }}>
                <button style={{ ...btn, padding: "6px 12px", fontSize: 14, background: "#fee2e2", color: "#dc2626" }} onClick={() => desfazer(v)}>
                  Desfazer
                </button>
              </td>
            </tr>
          ))}
          {vendasHoje.length === 0 && (
            <tr><td style={{ padding: 16, color: "#64748b" }}>Nenhuma venda hoje ainda.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
