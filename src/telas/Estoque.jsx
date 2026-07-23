import React, { useEffect, useState } from "react";
import FiltroData, { sufixoTitulo } from "./FiltroData.jsx";

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
  const [entrada, setEntrada] = useState(null); // { peca, quantidade, preco, observacao }
  const [entradas, setEntradas] = useState([]);
  const [ordem, setOrdem] = useState(null); // { col, dir: 1 asc | -1 desc } | null = padrão
  const [[fSel, fDe, fAte], setFiltroData] = useState(["tudo", "", ""]);

  const carregar = () => {
    window.api.query("SELECT * FROM pecas ORDER BY nome, modelo").then(setPecas);
    const conds = [];
    const params = [];
    if (fDe) { conds.push("date(e.criado_em) >= ?"); params.push(fDe); }
    if (fAte) { conds.push("date(e.criado_em) <= ?"); params.push(fAte); }
    window.api
      .query(
        `SELECT e.*, p.nome, p.modelo FROM entradas e JOIN pecas p ON p.id = e.peca_id
         ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""} ORDER BY e.id DESC
         ${conds.length ? "" : "LIMIT 20"}`,
        params
      )
      .then(setEntradas);
  };

  useEffect(() => {
    carregar();
  }, [fDe, fAte]);

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
      const comandos = [
        ["INSERT INTO pecas (nome, modelo, quantidade, preco_compra, preco_venda, estoque_minimo) VALUES (?,?,?,?,?,?)", params],
      ];
      const qtdInicial = Number(form.quantidade) || 0;
      if (qtdInicial > 0) {
        comandos.push([
          "INSERT INTO entradas (peca_id, quantidade, preco_compra, observacao) VALUES (last_insert_rowid(), ?, ?, 'cadastro inicial')",
          [qtdInicial, compra],
        ]);
      }
      await window.api.tx(comandos);
    }
    setForm(null);
    carregar();
  };

  const confirmarEntrada = async () => {
    const qtd = Number(entrada.quantidade);
    const preco = parseReais(entrada.preco);
    if (!qtd || qtd < 1 || isNaN(preco)) return alert("Preencha quantidade e preço de compra.");
    // Custo médio ponderado móvel (padrão dos ERPs): média do estoque atual com a leva.
    const qtdAtual = Math.max(entrada.peca.quantidade, 0);
    const custoMedio = Math.round((qtdAtual * entrada.peca.preco_compra + qtd * preco) / (qtdAtual + qtd));
    await window.api.tx([
      ["UPDATE pecas SET quantidade = quantidade + ?, preco_compra = ? WHERE id = ?", [qtd, custoMedio, entrada.peca.id]],
      ["INSERT INTO entradas (peca_id, quantidade, preco_compra, observacao) VALUES (?,?,?,?)",
        [entrada.peca.id, qtd, preco, entrada.observacao.trim()]],
    ]);
    setEntrada(null);
    carregar();
  };

  const excluir = async (p) => {
    if (!confirm(`Excluir "${p.nome} ${p.modelo}"?`)) return;
    await window.api.query("DELETE FROM pecas WHERE id=?", [p.id]);
    carregar();
  };

  if (entrada) {
    return (
      <div style={{ maxWidth: 480 }}>
        <h2>Entrada: {entrada.peca.nome} {entrada.peca.modelo}</h2>
        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Quantidade recebida</div>
          <input style={inp} type="number" min={1} autoFocus value={entrada.quantidade}
            onChange={(e) => setEntrada({ ...entrada, quantidade: e.target.value })} />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Preço de compra desta leva (R$) — o custo da peça vira a média ponderada</div>
          <input style={inp} value={entrada.preco}
            onChange={(e) => setEntrada({ ...entrada, preco: e.target.value })} />
        </label>
        <label style={{ display: "block", marginBottom: 16 }}>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Observação (opcional — fornecedor, crédito usado…)</div>
          <input style={inp} value={entrada.observacao}
            onChange={(e) => setEntrada({ ...entrada, observacao: e.target.value })} />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...btn, background: "#22c55e", color: "white", flex: 1 }} onClick={confirmarEntrada}>
            Confirmar entrada
          </button>
          <button style={{ ...btn, background: "#e2e8f0" }} onClick={() => setEntrada(null)}>Cancelar</button>
        </div>
      </div>
    );
  }

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
        <h2>{form.id ? "Editar produto" : "Novo produto"}</h2>
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
  let visiveis = filtro
    ? pecas.filter((p) => `${p.nome} ${p.modelo}`.toLowerCase().includes(filtro))
    : pecas;

  if (ordem) {
    const val = (p) => (ordem.col === "margem" ? p.preco_venda - p.preco_compra : p[ordem.col]);
    visiveis = [...visiveis].sort((a, b) => {
      const x = val(a), y = val(b);
      return (typeof x === "string" ? x.localeCompare(y, "pt-BR") : x - y) * ordem.dir;
    });
  }

  const clicarColuna = (col) => {
    if (!ordem || ordem.col !== col) setOrdem({ col, dir: 1 }); // 1º clique: crescente
    else if (ordem.dir === 1) setOrdem({ col, dir: -1 });       // 2º: decrescente
    else setOrdem(null);                                         // 3º: padrão
  };

  const COLUNAS = [["Produto", "nome"], ["Modelo", "modelo"], ["Qtd", "quantidade"],
    ["Compra", "preco_compra"], ["Venda", "preco_venda"], ["Margem", "margem"], ["", null]];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <input
          style={{ ...inp, flex: 1 }}
          placeholder="Buscar peça por nome ou modelo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button style={{ ...btn, background: "#38bdf8", color: "#0f172a" }} onClick={() => setForm(VAZIA)}>
          + Novo produto
        </button>
      </div>

      {/* 60% produtos / 40% últimas entradas, cada um com rolagem própria */}
      <div style={{ flex: "6 1 0", overflow: "auto", minHeight: 0 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 16 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #cbd5e1" }}>
            {COLUNAS.map(([h, col]) => (
              <th key={h} onClick={() => col && clicarColuna(col)}
                style={{ padding: 8, cursor: col ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap" }}>
                {h}{ordem?.col === col && (ordem.dir === 1 ? " ▲" : " ▼")}
              </th>
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
                <td style={{ padding: 8, whiteSpace: "nowrap" }}>
                  <button
                    style={{ ...btn, padding: "6px 12px", fontSize: 14, background: "#dcfce7", color: "#16a34a", marginRight: 6 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEntrada({ peca: p, quantidade: 1, preco: (p.preco_compra / 100).toFixed(2).replace(".", ","), observacao: "" });
                    }}
                  >
                    + Entrada
                  </button>
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

      <div style={{ flex: "4 1 0", overflow: "auto", minHeight: 0, borderTop: "2px solid #cbd5e1", marginTop: 12 }}>
      <h3 style={{ margin: "12px 0 8px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {fSel === "tudo" ? "Últimas entradas" : `Entradas ${sufixoTitulo(fSel)}`}
        <FiltroData sel={fSel} aoEscolher={(chave, d, a) => setFiltroData([chave, d, a])} />
      </h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
        <tbody>
          {entradas.map((e) => (
            <tr key={e.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: 8, color: "#64748b" }}>{e.criado_em.slice(8, 10)}/{e.criado_em.slice(5, 7)} {e.criado_em.slice(11, 16)}</td>
              <td style={{ padding: 8, fontWeight: "bold" }}>+{e.quantidade}x {e.nome} {e.modelo}</td>
              <td style={{ padding: 8 }}>compra {fmtReais(e.preco_compra)}</td>
              <td style={{ padding: 8, color: "#64748b" }}>{e.observacao}</td>
            </tr>
          ))}
          {entradas.length === 0 && (
            <tr><td style={{ padding: 16, color: "#64748b" }}>Nenhuma entrada registrada.</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
