import React, { useEffect, useState } from "react";
import { fmtReais, parseReais } from "./Estoque.jsx";
import FiltroData, { calcAtalho, sufixoTitulo } from "./FiltroData.jsx";
import { NotaModal, reimprimirNota } from "./Nota.jsx";

export const FORMAS = {
  especie: "Espécie",
  pix: "Pix",
  debito: "Débito",
  credito_avista: "Crédito à vista",
  credito_parcelado: "Crédito parcelado",
};

const inp = { padding: 10, fontSize: 16, borderRadius: 6, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box" };
const btn = { padding: "12px 20px", fontSize: 16, fontWeight: "bold", border: "none", borderRadius: 8, cursor: "pointer" };

export default function Venda({ maoDeObraOn = true, dono = true, cfg = {}, aoTrocar }) {
  const notaOn = cfg.nota_ativa === "1";
  const [pecas, setPecas] = useState([]);
  const [vendasHoje, setVendasHoje] = useState([]);
  const [trocasVenda, setTrocasVenda] = useState([]); // trocas vinculadas a vendas (cadeia A → B → C)
  const [notasPorVenda, setNotasPorVenda] = useState({}); // venda_id → nota (p/ reimprimir)
  const [notaVenda, setNotaVenda] = useState(null); // venda recém-confirmada aguardando nota
  const [busca, setBusca] = useState("");
  const [venda, setVenda] = useState(null); // { peca, qtd, preco, maoDeObra, forma }
  const [[fSel, fDe, fAte], setFiltroData] = useState(() => ["hoje", ...calcAtalho("hoje")]);

  const carregar = () => {
    window.api.query("SELECT * FROM pecas ORDER BY nome, modelo").then(setPecas);
    const conds = [];
    const params = [];
    if (fDe) { conds.push("date(v.criado_em) >= ?"); params.push(fDe); }
    if (fAte) { conds.push("date(v.criado_em) <= ?"); params.push(fAte); }
    window.api
      .query(
        `SELECT v.*, p.nome, p.modelo FROM vendas v JOIN pecas p ON p.id = v.peca_id
         ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""} ORDER BY v.id DESC`,
        params
      )
      .then(setVendasHoje);
    window.api
      .query(
        `SELECT t.*, p.nome AS nova_nome, p.modelo AS nova_modelo,
                p.preco_compra AS nova_compra, p.preco_venda AS nova_preco
         FROM trocas t JOIN pecas p ON p.id = t.nova_peca_id
         WHERE t.venda_id IS NOT NULL ORDER BY t.id`
      )
      .then(setTrocasVenda);
    // ponytail: varre notas inteiro (tabela pequena numa loja); filtrar por venda se crescer.
    if (notaOn) {
      window.api.query("SELECT * FROM notas").then((rows) => {
        const m = {};
        rows.forEach((n) => { m[n.venda_id] = n; });
        setNotasPorVenda(m);
      });
    }
  };

  useEffect(() => {
    carregar();
  }, [fDe, fAte]);

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
    const res = await window.api.tx([
      ["UPDATE pecas SET quantidade = quantidade - ? WHERE id = ?", [qtd, venda.peca.id]],
      [
        "INSERT INTO vendas (peca_id, quantidade, preco_venda, preco_compra, mao_de_obra, forma_pagamento, cliente) VALUES (?,?,?,?,?,?,?)",
        [venda.peca.id, qtd, preco, venda.peca.preco_compra, maoDeObra, venda.forma, venda.cliente.trim()],
      ],
    ]);
    if (notaOn) {
      setNotaVenda({
        id: res[1].lastInsertRowid,
        cliente: venda.cliente.trim(),
        descricao: `${qtd}x ${venda.peca.nome} ${venda.peca.modelo}`.trim(),
        valor_total: preco * qtd + maoDeObra,
      });
    }
    setVenda(null);
    setBusca("");
    carregar();
  };

  const notaClick = (v) => {
    const existente = notasPorVenda[v.id];
    if (existente) return reimprimirNota(existente, cfg);
    setNotaVenda({
      id: v.id, cliente: v.cliente || "",
      descricao: `${v.quantidade}x ${v.nome} ${v.modelo}`.trim(),
      valor_total: v.preco_venda * v.quantidade + v.mao_de_obra,
    });
  };

  const desfazerTroca = async (t) => {
    if (!confirm(`Desfazer a troca? ${t.nova_nome} ${t.nova_modelo} volta ao estoque e a peça sai da aba Trocas.`)) return;
    await window.api.tx([
      ["DELETE FROM trocas WHERE id = ?", [t.id]],
      ["UPDATE pecas SET quantidade = quantidade + 1 WHERE id = ?", [t.nova_peca_id]],
    ]);
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
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Preço unitário (R$){dono && " — edite p/ dar desconto"}</div>
          <input style={{ ...inp, ...(dono ? {} : { background: "#f1f5f9", color: "#64748b" }) }} readOnly={!dono}
            value={venda.preco} onChange={(e) => setVenda({ ...venda, preco: e.target.value })} />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Cliente (opcional)</div>
          <input style={inp} placeholder="Nome do cliente" value={venda.cliente}
            onChange={(e) => setVenda({ ...venda, cliente: e.target.value })} />
        </label>
        {maoDeObraOn && (
          <label style={{ display: "block", marginBottom: 12 }}>
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>Mão de obra (R$, opcional)</div>
            <input style={inp} placeholder="0,00" value={venda.maoDeObra}
              onChange={(e) => setVenda({ ...venda, maoDeObra: e.target.value })} />
          </label>
        )}
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

  const trocasPorVenda = {};
  trocasVenda.forEach((t) => (trocasPorVenda[t.venda_id] ||= []).push(t));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <input style={{ ...inp, marginBottom: 16 }} autoFocus placeholder="Buscar peça para vender…"
        value={busca} onChange={(e) => setBusca(e.target.value)} />

      {/* 60% produtos / 40% vendas de hoje, cada um com rolagem própria */}
      <div style={{ flex: "6 1 0", overflow: "auto", minHeight: 0 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 16 }}>
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
                    maoDeObra: "", forma: "especie", cliente: "",
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
      </div>

      <div style={{ flex: "4 1 0", overflow: "auto", minHeight: 0, borderTop: "2px solid #cbd5e1", marginTop: 12 }}>
      <h3 style={{ margin: "12px 0 8px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {fSel === "tudo" ? "Todas as vendas" : `Vendas ${sufixoTitulo(fSel)}`}
        <FiltroData sel={fSel} aoEscolher={(chave, d, a) => setFiltroData([chave, d, a])} />
      </h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
        <tbody>
          {vendasHoje.map((v) => {
            const cadeia = trocasPorVenda[v.id] || [];
            const trocada = cadeia.length > 0;
            return (
              <React.Fragment key={v.id}>
                <tr style={{ borderBottom: trocada ? "none" : "1px solid #e2e8f0", background: trocada ? "#fffbeb" : undefined }}>
                  <td style={{ padding: 8, color: "#64748b" }}>{v.criado_em.slice(11, 16)}</td>
                  <td style={{ padding: 8 }}>
                    {v.quantidade}x {v.nome} {v.modelo}
                    {v.cliente && <span style={{ color: "#64748b" }}> — {v.cliente}</span>}
                  </td>
                  <td style={{ padding: 8, fontWeight: "bold" }}>{fmtReais(v.preco_venda * v.quantidade + v.mao_de_obra)}</td>
                  <td style={{ padding: 8 }}>{FORMAS[v.forma_pagamento] || v.forma_pagamento}</td>
                  <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
                    {notaOn && (
                      <button style={{ ...btn, padding: "6px 12px", fontSize: 14, background: "#e0f2fe", color: "#0369a1", marginRight: 6 }}
                        onClick={() => notaClick(v)}>
                        🧾 {notasPorVenda[v.id] ? "Reimprimir" : "Nota"}
                      </button>
                    )}
                    {trocada ? (
                      <span style={{ color: "#b45309", fontSize: 14, fontWeight: "bold" }}>trocada ↓</span>
                    ) : (
                      <>
                        {dono && (
                          <button style={{ ...btn, padding: "6px 12px", fontSize: 14, background: "#fef3c7", color: "#b45309", marginRight: 6 }}
                            onClick={() => aoTrocar({ venda_id: v.id, peca_id: v.peca_id, nome: v.nome, modelo: v.modelo, preco_compra: v.preco_compra, preco_venda: v.preco_venda })}>
                            Trocar
                          </button>
                        )}
                        <button style={{ ...btn, padding: "6px 12px", fontSize: 14, background: "#fee2e2", color: "#dc2626" }} onClick={() => desfazer(v)}>
                          Desfazer
                        </button>
                      </>
                    )}
                  </td>
                </tr>
                {cadeia.map((t, i) => {
                  const ultima = i === cadeia.length - 1;
                  return (
                    <tr key={`t${t.id}`} style={{ borderBottom: ultima ? "1px solid #e2e8f0" : "none", background: "#fffbeb" }}>
                      <td style={{ padding: 8, color: "#64748b" }}>{t.recebido_em.slice(11, 16)}</td>
                      <td style={{ padding: 8 }} colSpan={2}>
                        ↳ trocado por 1x <strong>{t.nova_nome} {t.nova_modelo}</strong>
                      </td>
                      <td style={{ padding: 8, color: "#b45309" }}>troca</td>
                      <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
                        {t.lote_id ? (
                          <span style={{ color: "#64748b", fontSize: 14 }}>no lote #{t.lote_id}</span>
                        ) : ultima && dono ? (
                          <>
                            <button style={{ ...btn, padding: "6px 12px", fontSize: 14, background: "#fef3c7", color: "#b45309", marginRight: 6 }}
                              onClick={() => aoTrocar({ venda_id: t.venda_id, peca_id: t.nova_peca_id, nome: t.nova_nome, modelo: t.nova_modelo, preco_compra: t.nova_compra, preco_venda: t.nova_preco })}>
                              Trocar
                            </button>
                            <button style={{ ...btn, padding: "6px 12px", fontSize: 14, background: "#fee2e2", color: "#dc2626" }} onClick={() => desfazerTroca(t)}>
                              Desfazer
                            </button>
                          </>
                        ) : (
                          <span style={{ color: "#b45309", fontSize: 14, fontWeight: "bold" }}>trocada ↓</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            );
          })}
          {vendasHoje.length === 0 && (
            <tr><td style={{ padding: 16, color: "#64748b" }}>Nenhuma venda no período.</td></tr>
          )}
        </tbody>
      </table>
      </div>

      {notaVenda && <NotaModal venda={notaVenda} cfg={cfg} aoFechar={() => { setNotaVenda(null); carregar(); }} />}
    </div>
  );
}
