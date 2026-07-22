import React, { useEffect, useState } from "react";

export const fmtReais = (centavos) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const parseReais = (texto) => Math.round(parseFloat(String(texto).replace(",", ".")) * 100);

const VAZIA = { nome: "", modelo: "", quantidade: 0, preco_compra: "", preco_venda: "", estoque_minimo: 1 };

const inp = { padding: 10, fontSize: 16, borderRadius: 6, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box" };
const btn = { padding: "12px 20px", fontSize: 16, fontWeight: "bold", border: "none", borderRadius: 8, cursor: "pointer" };

export default function Estoque() {
  const [pecas, setPecas] = useState([]);
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState(null); // null = lista; objeto = formulário

  const carregar = () =>
    window.api.query("SELECT * FROM pecas ORDER BY nome, modelo").then(setPecas);

  useEffect(() => {
    carregar();
  }, []);

  const salvar = async () => {
    const compra = parseReais(form.preco_compra);
    const venda = parseReais(form.preco_venda);
    if (!form.nome.trim() || isNaN(compra) || isNaN(venda)) {
      alert("Preencha nome, preço de compra e preço de venda.");
      return;
    }
    const params = [form.nome.trim(), form.modelo.trim(), Number(form.quantidade) || 0, compra, venda, Number(form.estoque_minimo) || 0];
    if (form.id) {
      await window.api.query(
        "UPDATE pecas SET nome=?, modelo=?, quantidade=?, preco_compra=?, preco_venda=?, estoque_minimo=? WHERE id=?",
        [...params, form.id]
      );
    } else {
      await window.api.query(
        "INSERT INTO pecas (nome, modelo, quantidade, preco_compra, preco_venda, estoque_minimo) VALUES (?,?,?,?,?,?)",
        params
      );
    }
    setForm(null);
    carregar();
  };

  const excluir = async (p) => {
    if (!confirm(`Excluir "${p.nome} ${p.modelo}"?`)) return;
    await window.api.query("DELETE FROM pecas WHERE id=?", [p.id]);
    carregar();
  };

  if (form) {
    const campo = (label, chave, type = "text") => (
      <label style={{ display: "block", marginBottom: 12 }}>
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>{label}</div>
        <input
          style={inp}
          type={type}
          value={form[chave]}
          onChange={(e) => setForm({ ...form, [chave]: e.target.value })}
        />
      </label>
    );
    return (
      <div style={{ maxWidth: 480 }}>
        <h2>{form.id ? "Editar peça" : "Nova peça"}</h2>
        {campo("Nome", "nome")}
        {campo("Modelo", "modelo")}
        {campo("Quantidade", "quantidade", "number")}
        {campo("Preço de compra (R$)", "preco_compra")}
        {campo("Preço de venda (R$)", "preco_venda")}
        {campo("Estoque mínimo", "estoque_minimo", "number")}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button style={{ ...btn, background: "#22c55e", color: "white", flex: 1 }} onClick={salvar}>
            Salvar
          </button>
          <button style={{ ...btn, background: "#e2e8f0" }} onClick={() => setForm(null)}>
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
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <input
          style={{ ...inp, flex: 1 }}
          placeholder="Buscar peça por nome ou modelo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button style={{ ...btn, background: "#38bdf8", color: "#0f172a" }} onClick={() => setForm(VAZIA)}>
          + Nova peça
        </button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 16 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #cbd5e1" }}>
            {["Peça", "Modelo", "Qtd", "Compra", "Venda", "Margem", ""].map((h) => (
              <th key={h} style={{ padding: 8 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visiveis.map((p) => {
            const margem = p.preco_venda - p.preco_compra;
            const baixo = p.quantidade <= p.estoque_minimo;
            return (
              <tr
                key={p.id}
                onClick={() => setForm({ ...p, preco_compra: (p.preco_compra / 100).toFixed(2).replace(".", ","), preco_venda: (p.preco_venda / 100).toFixed(2).replace(".", ",") })}
                style={{ borderBottom: "1px solid #e2e8f0", cursor: "pointer", background: baixo ? "#fef2f2" : undefined }}
              >
                <td style={{ padding: 8, fontWeight: "bold" }}>
                  {p.nome} {baixo && <span style={{ color: "#dc2626" }} title="Estoque baixo">⚠</span>}
                </td>
                <td style={{ padding: 8 }}>{p.modelo}</td>
                <td style={{ padding: 8, color: baixo ? "#dc2626" : undefined, fontWeight: baixo ? "bold" : undefined }}>{p.quantidade}</td>
                <td style={{ padding: 8 }}>{fmtReais(p.preco_compra)}</td>
                <td style={{ padding: 8 }}>{fmtReais(p.preco_venda)}</td>
                <td style={{ padding: 8 }}>
                  {fmtReais(margem)}{p.preco_compra > 0 && ` (${Math.round((margem / p.preco_compra) * 100)}%)`}
                </td>
                <td style={{ padding: 8 }}>
                  <button
                    style={{ ...btn, padding: "6px 12px", fontSize: 14, background: "#fee2e2", color: "#dc2626" }}
                    onClick={(e) => { e.stopPropagation(); excluir(p); }}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            );
          })}
          {visiveis.length === 0 && (
            <tr><td colSpan={7} style={{ padding: 24, color: "#64748b" }}>Nenhuma peça {filtro ? "encontrada" : "cadastrada"}.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
