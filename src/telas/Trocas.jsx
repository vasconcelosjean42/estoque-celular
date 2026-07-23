import React, { useEffect, useState } from "react";
import { fmtReais, parseReais } from "./Estoque.jsx";

const inp = { padding: 10, fontSize: 16, borderRadius: 6, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box" };
const btn = { padding: "12px 20px", fontSize: 16, fontWeight: "bold", border: "none", borderRadius: 8, cursor: "pointer" };
const bloco = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, marginBottom: 20 };

const FORM_VAZIO = { peca_id: "", modelo: "", defeito: "", observacao: "", valor: "", entregueiNova: false };

export default function Trocas({ vendaTroca, aoConsumir }) {
  const [pecas, setPecas] = useState([]);
  const [prateleira, setPrateleira] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [creditos, setCreditos] = useState([]);
  const [form, setForm] = useState(null);
  const [marcadas, setMarcadas] = useState(new Set());
  const [abate, setAbate] = useState(null); // { valor, descricao } — prompt() não existe no Electron

  const carregar = () => {
    window.api.query("SELECT * FROM pecas ORDER BY nome, modelo").then(setPecas);
    window.api
      .query(`SELECT *, CAST(julianday('now','localtime') - julianday(recebido_em) AS INTEGER) AS dias
              FROM trocas WHERE lote_id IS NULL ORDER BY recebido_em`)
      .then(setPrateleira);
    window.api
      .query(`SELECT l.*, COUNT(t.id) AS qtd, SUM(t.valor_compra) AS valor
              FROM lotes l JOIN trocas t ON t.lote_id = l.id
              GROUP BY l.id ORDER BY l.id DESC`)
      .then(setLotes);
    window.api.query("SELECT * FROM creditos ORDER BY id DESC").then(setCreditos);
    setMarcadas(new Set());
  };

  useEffect(() => {
    carregar();
  }, []);

  // Chegou da aba Venda pelo botão "Trocar": abre o form travado na peça vendida.
  useEffect(() => {
    if (!vendaTroca) return;
    setForm({
      ...FORM_VAZIO,
      peca_id: String(vendaTroca.peca_id),
      modelo: `${vendaTroca.nome} ${vendaTroca.modelo}`.trim(),
      valor: (vendaTroca.preco_compra / 100).toFixed(2).replace(".", ","),
      travada: true,
      venda_id: vendaTroca.venda_id,
      trocarPor: String(vendaTroca.peca_id),
      precoPago: vendaTroca.preco_venda, // unitário, já com desconto se teve
    });
    aoConsumir();
  }, [vendaTroca]);

  const salvar = async () => {
    const valor = parseReais(form.valor);
    if (!form.modelo.trim() || !form.defeito.trim() || isNaN(valor)) {
      alert("Preencha modelo, defeito e valor de compra.");
      return;
    }
    const comandos = [];
    if (form.travada) {
      const nova = pecas.find((p) => p.id === Number(form.trocarPor));
      if (!nova || nova.quantidade < 1) {
        alert("Escolha a peça de reposição (precisa ter estoque).");
        return;
      }
      comandos.push(
        ["INSERT INTO trocas (modelo, defeito, observacao, valor_compra, peca_id, venda_id, nova_peca_id) VALUES (?,?,?,?,?,?,?)",
          [form.modelo.trim(), form.defeito.trim(), form.observacao.trim(), valor, form.peca_id || null, form.venda_id, nova.id]],
        ["UPDATE pecas SET quantidade = quantidade - 1 WHERE id = ?", [nova.id]]
      );
    } else {
      comandos.push(["INSERT INTO trocas (modelo, defeito, observacao, valor_compra, peca_id) VALUES (?,?,?,?,?)",
        [form.modelo.trim(), form.defeito.trim(), form.observacao.trim(), valor, form.peca_id || null]]);
      if (form.entregueiNova && form.peca_id) {
        comandos.push(["UPDATE pecas SET quantidade = quantidade - 1 WHERE id = ?", [form.peca_id]]);
      }
    }
    await window.api.tx(comandos);
    setForm(null);
    carregar();
  };

  const excluir = async (t) => {
    if (!confirm(`Excluir "${t.modelo} — ${t.defeito}" da prateleira?`)) return;
    await window.api.query("DELETE FROM trocas WHERE id = ?", [t.id]);
    carregar();
  };

  const fecharLote = async () => {
    if (!marcadas.size) return;
    if (!confirm(`Fechar lote com ${marcadas.size} peça(s) e marcar como enviado ao fornecedor?`)) return;
    const { lastInsertRowid } = await window.api.query(
      "INSERT INTO lotes (status, enviado_em) VALUES ('enviado', datetime('now','localtime'))"
    );
    await window.api.tx(
      [...marcadas].map((id) => ["UPDATE trocas SET lote_id = ? WHERE id = ?", [lastInsertRowid, id]])
    );
    carregar();
  };

  const loteRetornou = async (l) => {
    if (!confirm(`Lote #${l.id} retornou? Gera crédito de ${fmtReais(l.valor)} com o fornecedor.`)) return;
    await window.api.tx([
      ["UPDATE lotes SET status = 'resolvido', resolvido_em = datetime('now','localtime') WHERE id = ?", [l.id]],
      ["INSERT INTO creditos (valor, descricao) VALUES (?,?)", [l.valor, `Retorno do lote #${l.id}`]],
    ]);
    carregar();
  };

  const confirmarAbate = async () => {
    const valor = parseReais(abate.valor);
    if (isNaN(valor) || valor <= 0) return alert("Valor inválido.");
    await window.api.query("INSERT INTO creditos (valor, descricao) VALUES (?,?)",
      [-valor, abate.descricao.trim() || "Abate"]);
    setAbate(null);
    carregar();
  };

  const saldo = creditos.reduce((s, c) => s + c.valor, 0);

  const aoEscolherPeca = (peca_id) => {
    const p = pecas.find((x) => x.id === Number(peca_id));
    setForm({
      ...form, peca_id,
      modelo: p ? `${p.nome} ${p.modelo}`.trim() : form.modelo,
      valor: p ? (p.preco_compra / 100).toFixed(2).replace(".", ",") : form.valor,
    });
  };

  if (form) {
    const novaPeca = form.travada ? pecas.find((p) => p.id === Number(form.trocarPor)) : null;
    const dif = novaPeca ? novaPeca.preco_venda - form.precoPago : 0;
    return (
      <div style={{ maxWidth: 520 }}>
        <h2>{form.travada ? "Trocar peça" : "Registrar peça defeituosa"}</h2>
        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>
            {form.travada ? "Peça devolvida (da venda)" : "Peça do estoque (opcional — preenche modelo e valor)"}
          </div>
          <select style={inp} value={form.peca_id} disabled={form.travada} onChange={(e) => aoEscolherPeca(e.target.value)}>
            <option value="">— nenhuma —</option>
            {pecas.map((p) => (
              <option key={p.id} value={p.id}>{p.nome} {p.modelo} (qtd {p.quantidade})</option>
            ))}
          </select>
        </label>
        {[...(form.peca_id ? [] : [["Modelo", "modelo"]]),
          ["Defeito", "defeito"], ["Observação (opcional)", "observacao"], ["Valor de compra (R$)", "valor"]].map(([rotulo, chave]) => (
          <label key={chave} style={{ display: "block", marginBottom: 12 }}>
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>{rotulo}</div>
            <input style={inp} value={form[chave]} onChange={(e) => setForm({ ...form, [chave]: e.target.value })} />
          </label>
        ))}
        {form.travada && (
          <label style={{ display: "block", marginBottom: 12 }}>
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>Trocar por (sai 1 do estoque)</div>
            <select style={inp} value={form.trocarPor} onChange={(e) => setForm({ ...form, trocarPor: e.target.value })}>
              <option value="">— escolha a peça —</option>
              {pecas.map((p) => (
                <option key={p.id} value={p.id} disabled={p.quantidade < 1}>
                  {p.nome} {p.modelo} (qtd {p.quantidade}) — {fmtReais(p.preco_venda)}
                </option>
              ))}
            </select>
          </label>
        )}
        {form.travada && novaPeca && dif !== 0 && (
          <div style={{ fontSize: 17, fontWeight: "bold", marginBottom: 16, color: dif > 0 ? "#16a34a" : "#dc2626" }}>
            Diferença: {dif > 0 ? `você recebe +${fmtReais(dif)}` : `você paga ${fmtReais(dif)}`}
          </div>
        )}
        {form.peca_id && !form.travada && (
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 16, marginBottom: 16, cursor: "pointer" }}>
            <input type="checkbox" style={{ width: 20, height: 20 }} checked={form.entregueiNova}
              onChange={(e) => setForm({ ...form, entregueiNova: e.target.checked })} />
            Entreguei peça nova ao cliente agora (baixa 1 do estoque)
          </label>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...btn, background: "#22c55e", color: "white", flex: 1 }} onClick={salvar}>Salvar</button>
          <button style={{ ...btn, background: "#e2e8f0" }} onClick={() => setForm(null)}>Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
        <button style={{ ...btn, background: "#38bdf8", color: "#0f172a" }} onClick={() => setForm(FORM_VAZIO)}>
          + Registrar defeituosa
        </button>
        <div style={{ marginLeft: "auto", fontSize: 18 }}>
          Crédito com fornecedor: <strong style={{ color: saldo >= 0 ? "#16a34a" : "#dc2626" }}>{fmtReais(saldo)}</strong>
        </div>
        <button style={{ ...btn, background: "#e2e8f0" }} onClick={() => setAbate(abate ? null : { valor: "", descricao: "" })}>
          Abater crédito
        </button>
      </div>

      {abate && (
        <div style={{ ...bloco, display: "flex", gap: 8, alignItems: "center", background: "#fffbeb" }}>
          <input style={{ ...inp, width: 140 }} placeholder="Valor (R$)" autoFocus value={abate.valor}
            onChange={(e) => setAbate({ ...abate, valor: e.target.value })} />
          <input style={{ ...inp, flex: 1 }} placeholder="Descrição (ex.: abatido na compra de telas)" value={abate.descricao}
            onChange={(e) => setAbate({ ...abate, descricao: e.target.value })} />
          <button style={{ ...btn, background: "#22c55e", color: "white" }} onClick={confirmarAbate}>Confirmar abate</button>
          <button style={{ ...btn, background: "#e2e8f0" }} onClick={() => setAbate(null)}>Cancelar</button>
        </div>
      )}

      <div style={bloco}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Prateleira ({prateleira.length})</h3>
          {prateleira.length > 0 && (
            <label style={{ marginLeft: 16, display: "flex", gap: 6, alignItems: "center", fontSize: 15, cursor: "pointer" }}>
              <input type="checkbox" style={{ width: 18, height: 18 }}
                checked={marcadas.size === prateleira.length}
                onChange={(e) => setMarcadas(e.target.checked ? new Set(prateleira.map((t) => t.id)) : new Set())} />
              Selecionar todas
            </label>
          )}
          {marcadas.size > 0 && (
            <button style={{ ...btn, marginLeft: "auto", background: "#f59e0b", color: "white" }} onClick={fecharLote}>
              Fechar lote e enviar ({marcadas.size})
            </button>
          )}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
          <tbody>
            {prateleira.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid #e2e8f0", background: t.dias >= 40 ? "#fef2f2" : t.dias >= 30 ? "#fffbeb" : undefined }}>
                <td style={{ padding: 8 }}>
                  <input type="checkbox" style={{ width: 18, height: 18 }} checked={marcadas.has(t.id)}
                    onChange={(e) => {
                      const s = new Set(marcadas);
                      e.target.checked ? s.add(t.id) : s.delete(t.id);
                      setMarcadas(s);
                    }} />
                </td>
                <td style={{ padding: 8, fontWeight: "bold" }}>{t.modelo}</td>
                <td style={{ padding: 8 }}>{t.defeito}{t.observacao && ` — ${t.observacao}`}</td>
                <td style={{ padding: 8 }}>{fmtReais(t.valor_compra)}</td>
                <td style={{ padding: 8, fontWeight: t.dias >= 30 ? "bold" : undefined, color: t.dias >= 40 ? "#dc2626" : t.dias >= 30 ? "#d97706" : "#64748b" }}>
                  {t.dias} dia{t.dias === 1 ? "" : "s"}{t.dias >= 40 && " ⚠ prazo!"}
                </td>
                <td style={{ padding: 8, textAlign: "right" }}>
                  <button style={{ ...btn, padding: "6px 12px", fontSize: 14, background: "#fee2e2", color: "#dc2626" }} onClick={() => excluir(t)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {prateleira.length === 0 && (
              <tr><td style={{ padding: 16, color: "#64748b" }}>Nenhuma peça na prateleira.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={bloco}>
        <h3 style={{ marginTop: 0 }}>Lotes</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
          <tbody>
            {lotes.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: 8, fontWeight: "bold" }}>Lote #{l.id}</td>
                <td style={{ padding: 8 }}>{l.qtd} peça{l.qtd === 1 ? "" : "s"} — {fmtReais(l.valor)}</td>
                <td style={{ padding: 8, color: "#64748b" }}>enviado {l.enviado_em?.slice(8, 10)}/{l.enviado_em?.slice(5, 7)}</td>
                <td style={{ padding: 8, textAlign: "right" }}>
                  {l.status === "resolvido" ? (
                    <span style={{ color: "#16a34a", fontWeight: "bold" }}>
                      ✔ crédito gerado {l.resolvido_em?.slice(8, 10)}/{l.resolvido_em?.slice(5, 7)}
                    </span>
                  ) : (
                    <button style={{ ...btn, padding: "8px 14px", fontSize: 14, background: "#22c55e", color: "white" }} onClick={() => loteRetornou(l)}>
                      Lote retornou → gerar crédito
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {lotes.length === 0 && (
              <tr><td style={{ padding: 16, color: "#64748b" }}>Nenhum lote fechado ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={bloco}>
        <h3 style={{ marginTop: 0 }}>Histórico de crédito</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
          <tbody>
            {creditos.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: 8, color: "#64748b" }}>{c.criado_em.slice(8, 10)}/{c.criado_em.slice(5, 7)}</td>
                <td style={{ padding: 8 }}>{c.descricao}</td>
                <td style={{ padding: 8, fontWeight: "bold", color: c.valor >= 0 ? "#16a34a" : "#dc2626", textAlign: "right" }}>
                  {c.valor >= 0 ? "+" : ""}{fmtReais(c.valor)}
                </td>
              </tr>
            ))}
            {creditos.length === 0 && (
              <tr><td style={{ padding: 16, color: "#64748b" }}>Nenhum crédito ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
