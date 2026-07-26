import React, { useEffect, useState } from "react";
import { fmtReais, parseReais } from "./Estoque.jsx";
import FiltroData, { calcAtalho, sufixoTitulo } from "./FiltroData.jsx";
import { FORMAS, setaPedido } from "./Venda.jsx";

const inp = { padding: 10, fontSize: 16, borderRadius: 6, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box" };
const btn = { padding: "12px 20px", fontSize: 16, fontWeight: "bold", border: "none", borderRadius: 8, cursor: "pointer" };
const bloco = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, marginBottom: 20 };

const FORM_VAZIO = { peca_id: "", modelo: "", defeito: "", observacao: "", valor: "", fornecedor: "", entregueiNova: false, defeituosa: true, perda: false, formaDif: "", estornar: false, estornoValor: "" };

export default function Trocas({ vendaTroca, aoConsumir, dono = true, aoSair }) {
  const [pecas, setPecas] = useState([]);
  const [prateleira, setPrateleira] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [creditos, setCreditos] = useState([]);
  const [perdas, setPerdas] = useState([]);
  const [fornecedores, setFornecedores] = useState([]); // sugestões do datalist
  const [form, setForm] = useState(null);
  const [marcadas, setMarcadas] = useState(new Set());
  const [fForn, setFForn] = useState(""); // filtro prateleira por fornecedor ('' = todos)
  const [fProd, setFProd] = useState(""); // filtro prateleira por produto (contém)
  const [abate, setAbate] = useState(null); // { valor, descricao } — prompt() não existe no Electron
  const [resolvendo, setResolvendo] = useState(null); // { lote, itens, modo, valorTotal, aceitas }
  const [itensLote, setItensLote] = useState([]);
  const [loteAberto, setLoteAberto] = useState(null); // lote expandido na lista
  const [[pSel, pDe, pAte], setFiltroPerdas] = useState(() => ["mes", ...calcAtalho("mes")]);

  // Separado do carregar(): mudar o período das perdas não pode limpar a seleção
  // da prateleira que o dono já tinha montado pro lote.
  const carregarPerdas = () => {
    const conds = [];
    const params = [];
    if (pDe) { conds.push("date(p.criado_em) >= ?"); params.push(pDe); }
    if (pAte) { conds.push("date(p.criado_em) <= ?"); params.push(pAte); }
    window.api
      .query(`SELECT p.*, pc.nome, pc.modelo FROM perdas p LEFT JOIN pecas pc ON pc.id = p.peca_id
              ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""} ORDER BY p.id DESC`, params)
      .then(setPerdas);
  };

  useEffect(carregarPerdas, [pDe, pAte]);

  const carregar = () => {
    window.api.query("SELECT * FROM pecas ORDER BY nome, modelo").then(setPecas);
    window.api
      // Só vai pro fornecedor o que é defeito E não virou perda. Peça funcionando
      // e peça descartada não contam prazo nem entram em lote. A própria linha em
      // perdas é o marcador — sem coluna extra em trocas pra sair do sincronismo.
      .query(`SELECT t.*, CAST(julianday('now','localtime') - julianday(t.recebido_em) AS INTEGER) AS dias
              FROM trocas t
              WHERE t.lote_id IS NULL AND t.defeituosa = 1
                AND NOT EXISTS (SELECT 1 FROM perdas WHERE troca_id = t.id)
              ORDER BY t.recebido_em`)
      .then(setPrateleira);
    carregarPerdas();
    window.api
      .query(`SELECT l.*, COUNT(t.id) AS qtd, SUM(t.valor_compra) AS valor
              FROM lotes l JOIN trocas t ON t.lote_id = l.id
              GROUP BY l.id ORDER BY l.id DESC`)
      .then(setLotes);
    // Itens de todos os lotes, com a perda de cada um: é o que o dropdown mostra.
    // ponytail: carrega tudo (poucos lotes numa loja); filtrar por lote se crescer.
    window.api
      .query(`SELECT t.id, t.lote_id, t.modelo, t.defeito, t.valor_compra, t.creditada,
                     (SELECT valor FROM perdas WHERE troca_id = t.id) AS perda_valor
              FROM trocas t WHERE t.lote_id IS NOT NULL ORDER BY t.lote_id, t.id`)
      .then(setItensLote);
    window.api.query("SELECT * FROM creditos ORDER BY id DESC").then(setCreditos);
    window.api.query("SELECT DISTINCT fornecedor FROM trocas WHERE fornecedor != '' ORDER BY fornecedor")
      .then((r) => setFornecedores(r.map((x) => x.fornecedor)));
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
      estornoValor: (vendaTroca.preco_venda / 100).toFixed(2).replace(".", ","),
    });
    aoConsumir();
  }, [vendaTroca]);

  const salvar = async () => {
    const valor = parseReais(form.valor);
    if (!form.modelo.trim() || (form.defeituosa && !form.defeito.trim()) || isNaN(valor)) {
      alert(form.defeituosa ? "Preencha modelo, defeito e valor de compra." : "Preencha modelo e valor de compra.");
      return;
    }
    // A peça funcionando não tem defeito nem fornecedor: nunca vai pro lote.
    const defeito = form.defeituosa ? form.defeito.trim() : "devolvida funcionando";
    const perda = form.defeituosa && form.perda; // peça boa não é perda: voltou pro estoque
    const fornecedor = form.defeituosa && !perda ? form.fornecedor.trim() : "";
    // Perda é sempre a preço de CUSTO — é o mesmo número do campo "Valor de compra".
    const registrarPerda = ["INSERT INTO perdas (troca_id, peca_id, valor, motivo) VALUES (last_insert_rowid(),?,?,?)",
      [form.peca_id || null, valor, form.observacao.trim()]];
    const comandos = [];
    if (form.travada && form.estornar) {
      // Estorno: nenhuma peça de reposição sai do estoque. A venda original fica
      // no histórico — faturamento de mês passado não muda por devolução de hoje.
      const est = parseReais(form.estornoValor);
      if (isNaN(est) || est <= 0) {
        alert("Valor do estorno inválido.");
        return;
      }
      if (!form.formaDif) {
        alert(`Escolha por onde saíram os ${fmtReais(est)} devolvidos ao cliente.`);
        return;
      }
      comandos.push([
        `INSERT INTO trocas (modelo, defeito, observacao, valor_compra, fornecedor, peca_id, venda_id, defeituosa,
                             estorno, forma_pagamento) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [form.modelo.trim(), defeito, form.observacao.trim(), valor, fornecedor, form.peca_id || null,
         form.venda_id, form.defeituosa ? 1 : 0, est, form.formaDif],
      ]);
      if (perda) comandos.push(registrarPerda);
    } else if (form.travada) {
      const nova = pecas.find((p) => p.id === Number(form.trocarPor));
      if (!nova || nova.quantidade < 1) {
        alert("Escolha a peça de reposição (precisa ter estoque).");
        return;
      }
      // Diferença sem forma de pagamento é dinheiro entrando/saindo da gaveta sem
      // rastro: o fechamento do dia não fecharia.
      const diferenca = nova.preco_venda - form.precoPago;
      if (diferenca !== 0 && !form.formaDif) {
        alert(`Escolha por onde ${diferenca > 0 ? "entrou" : "saiu"} a diferença de ${fmtReais(Math.abs(diferenca))}.`);
        return;
      }
      comandos.push(
        [`INSERT INTO trocas (modelo, defeito, observacao, valor_compra, fornecedor, peca_id, venda_id, nova_peca_id, defeituosa,
                              diferenca, forma_pagamento, nova_preco_compra)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          // nova.preco_compra congelado aqui: a média ponderada muda esse número a
          // cada entrada de estoque, então consultar depois daria o custo errado.
          [form.modelo.trim(), defeito, form.observacao.trim(), valor, fornecedor, form.peca_id || null,
           form.venda_id, nova.id, form.defeituosa ? 1 : 0,
           diferenca, diferenca !== 0 ? form.formaDif : null, nova.preco_compra]],
        // last_insert_rowid() é o da troca acima: tem que vir antes de qualquer outro INSERT.
        ...(perda ? [registrarPerda] : []),
        ["UPDATE pecas SET quantidade = quantidade - 1 WHERE id = ?", [nova.id]]
      );
    } else {
      comandos.push([`INSERT INTO trocas (modelo, defeito, observacao, valor_compra, fornecedor, peca_id, defeituosa)
                      VALUES (?,?,?,?,?,?,?)`,
        [form.modelo.trim(), defeito, form.observacao.trim(), valor, fornecedor, form.peca_id || null, form.defeituosa ? 1 : 0]]);
      if (perda) comandos.push(registrarPerda);
      if (form.entregueiNova && form.peca_id) {
        comandos.push(["UPDATE pecas SET quantidade = quantidade - 1 WHERE id = ?", [form.peca_id]]);
      }
    }
    // Voltou boa: entra de volta no estoque em vez de ir pra prateleira.
    if (!form.defeituosa && form.peca_id) {
      comandos.push(["UPDATE pecas SET quantidade = quantidade + 1 WHERE id = ?", [form.peca_id]]);
    }
    await window.api.tx(comandos);
    fechar();
    carregar();
  };

  // Colaborador não tem esta tela: sair do formulário devolve ele pra Venda.
  const fechar = () => (dono ? setForm(null) : aoSair());

  const excluir = async (t) => {
    if (!confirm(`Excluir "${t.modelo} — ${t.defeito}" da prateleira?`)) return;
    await window.api.tx([
      ["DELETE FROM perdas WHERE troca_id = ?", [t.id]], // antes da troca: a FK aponta pra ela
      ["DELETE FROM trocas WHERE id = ?", [t.id]],
    ]);
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

  // O fornecedor raramente aceita o lote inteiro: abre a tela de fechamento em
  // vez de creditar a soma cheia direto.
  const abrirResolucao = async (l) => {
    const itens = await window.api.query("SELECT * FROM trocas WHERE lote_id = ? ORDER BY id", [l.id]);
    setResolvendo({
      lote: l, itens, modo: "total",
      valorTotal: (l.valor / 100).toFixed(2).replace(".", ","),
      aceitas: new Set(itens.map((t) => t.id)), // começa tudo aceito: é o caso comum
    });
  };

  const creditoDe = (r) =>
    r.modo === "total"
      ? parseReais(r.valorTotal)
      : r.itens.filter((t) => r.aceitas.has(t.id)).reduce((s, t) => s + t.valor_compra, 0);

  const confirmarResolucao = async () => {
    const { lote, itens, modo, aceitas } = resolvendo;
    const credito = creditoDe(resolvendo);
    if (isNaN(credito) || credito < 0) {
      alert("Valor de crédito inválido.");
      return;
    }
    if (credito > lote.valor) {
      alert(`O crédito não pode passar do valor do lote (${fmtReais(lote.valor)}).`);
      return;
    }
    const perda = lote.valor - credito;
    const comandos = [
      ["UPDATE lotes SET status = 'resolvido', resolvido_em = datetime('now','localtime'), modo = ?, credito = ?, perda = ? WHERE id = ?",
        [modo, credito, perda, lote.id]],
    ];
    if (credito > 0) {
      comandos.push(["INSERT INTO creditos (valor, descricao) VALUES (?,?)", [credito, `Retorno do lote #${lote.id}`]]);
    }
    if (modo === "itens") {
      // Item a item dá pra dizer QUAL peça o fornecedor recusou: uma perda por peça.
      itens.forEach((t) => {
        if (aceitas.has(t.id)) comandos.push(["UPDATE trocas SET creditada = 1 WHERE id = ?", [t.id]]);
        else comandos.push(["INSERT INTO perdas (troca_id, peca_id, valor, motivo) VALUES (?,?,?,?)",
          [t.id, t.peca_id, t.valor_compra, `Lote #${lote.id} — fornecedor não aceitou`]]);
      });
    } else if (perda > 0) {
      // No valor total não se sabe quais peças entraram no corte: uma perda só.
      comandos.push(["INSERT INTO perdas (valor, motivo) VALUES (?,?)",
        [perda, `Lote #${lote.id} — creditou ${fmtReais(credito)} de ${fmtReais(lote.valor)}`]]);
    }
    await window.api.tx(comandos);
    setResolvendo(null);
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
  // A consulta já vem filtrada pelo período: somar a lista inteira é somar o período.
  const totalPerdas = perdas.reduce((s, p) => s + p.valor, 0);

  const fornsPrateleira = [...new Set(prateleira.map((t) => t.fornecedor).filter(Boolean))].sort();
  const prod = fProd.trim().toLowerCase();
  const prateleiraFiltrada = prateleira.filter((t) =>
    (!fForn || t.fornecedor === fForn) && (!prod || t.modelo.toLowerCase().includes(prod)));
  const todasMarcadas = prateleiraFiltrada.length > 0 && prateleiraFiltrada.every((t) => marcadas.has(t.id));

  // Seleciona/desmarca só o que está filtrado, preservando o resto da seleção.
  const alternarTodas = (marcar) => {
    const s = new Set(marcadas);
    prateleiraFiltrada.forEach((t) => (marcar ? s.add(t.id) : s.delete(t.id)));
    setMarcadas(s);
  };

  const aoEscolherPeca = (peca_id) => {
    const p = pecas.find((x) => x.id === Number(peca_id));
    setForm({
      ...form, peca_id,
      modelo: p ? `${p.nome} ${p.modelo}`.trim() : form.modelo,
      valor: p ? (p.preco_compra / 100).toFixed(2).replace(".", ",") : form.valor,
    });
  };

  if (!dono && !form) return null; // fração de segundo entre salvar e voltar pra Venda

  if (form) {
    const novaPeca = form.travada ? pecas.find((p) => p.id === Number(form.trocarPor)) : null;
    const dif = novaPeca ? novaPeca.preco_venda - form.precoPago : 0;
    return (
      <div style={{ maxWidth: 520 }}>
        <h2>{form.travada ? "Trocar peça" : form.defeituosa ? "Registrar peça defeituosa" : "Registrar devolução"}</h2>
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
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>Estado da peça devolvida</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[[true, "Com defeito"], [false, "Funcionando"]].map(([valor, rotulo]) => (
            <button key={rotulo} onClick={() => setForm({ ...form, defeituosa: valor })}
              style={{ ...btn, background: form.defeituosa === valor ? "#38bdf8" : "#e2e8f0", color: form.defeituosa === valor ? "#0f172a" : "#334155" }}>
              {rotulo}
            </button>
          ))}
        </div>
        {!form.defeituosa && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 15, color: "#166534" }}>
            A peça devolvida volta pro estoque. Não vai pra prateleira do fornecedor.
          </div>
        )}
        {form.defeituosa && (
          <>
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>Destino da peça</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              {[[false, "Vai para o fornecedor"], [true, "Descarte → perda"]].map(([valor, rotulo]) => (
                <button key={rotulo} onClick={() => setForm({ ...form, perda: valor })}
                  style={{ ...btn, background: form.perda === valor ? "#38bdf8" : "#e2e8f0", color: form.perda === valor ? "#0f172a" : "#334155" }}>
                  {rotulo}
                </button>
              ))}
            </div>
            {form.perda && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 15, color: "#991b1b" }}>
                Peça sem troca com fornecedor: a loja come o prejuízo. Entra em Perdas pelo preço de
                compra {dono && form.valor && `(${fmtReais(parseReais(form.valor) || 0)})`}, não vai pra prateleira.
              </div>
            )}
          </>
        )}
        {[...(form.peca_id ? [] : [["Modelo", "modelo"]]),
          ...(form.defeituosa ? [["Defeito", "defeito"]] : []),
          [form.perda && form.defeituosa ? "Motivo da perda" : "Observação (opcional)", "observacao"],
          // Custo é do dono. O valor continua indo pro banco: veio congelado da venda.
          ...(dono ? [["Valor de compra (R$)", "valor"]] : [])].map(([rotulo, chave]) => (
          <label key={chave} style={{ display: "block", marginBottom: 12 }}>
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>{rotulo}</div>
            <input style={inp} value={form[chave]} onChange={(e) => setForm({ ...form, [chave]: e.target.value })} />
          </label>
        ))}
        {form.defeituosa && !form.perda && (
          <label style={{ display: "block", marginBottom: 12 }}>
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>Fornecedor</div>
            <input style={inp} list="lista-fornecedores" placeholder="Escolha ou digite um novo"
              value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} />
            <datalist id="lista-fornecedores">
              {fornecedores.map((f) => <option key={f} value={f} />)}
            </datalist>
          </label>
        )}
        {form.travada && (
          <>
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>Desfecho</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              {[[false, "Repor peça"], [true, "Estornar o valor"]].map(([valor, rotulo]) => (
                <button key={rotulo} onClick={() => setForm({ ...form, estornar: valor, formaDif: "" })}
                  style={{ ...btn, background: form.estornar === valor ? "#38bdf8" : "#e2e8f0", color: form.estornar === valor ? "#0f172a" : "#334155" }}>
                  {rotulo}
                </button>
              ))}
            </div>
          </>
        )}
        {form.travada && form.estornar && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 8 }}>
              <div style={{ fontWeight: "bold", marginBottom: 4 }}>Valor a devolver (R$)</div>
              <input style={inp} aria-label="Valor do estorno" value={form.estornoValor}
                onChange={(e) => setForm({ ...form, estornoValor: e.target.value })} />
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                Veio do valor pago na venda ({fmtReais(form.precoPago)}), já com desconto. Pode editar.
              </div>
            </label>
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>Por onde o dinheiro saiu?</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {Object.entries(FORMAS).map(([valor, rotulo]) => (
                <button key={valor} onClick={() => setForm({ ...form, formaDif: valor })}
                  style={{ ...btn, background: form.formaDif === valor ? "#38bdf8" : "#e2e8f0", color: form.formaDif === valor ? "#0f172a" : "#334155" }}>
                  {rotulo}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>
              Sai do fechamento de hoje. Nenhuma peça de reposição sai do estoque, e a venda
              original continua no histórico.
            </div>
          </div>
        )}
        {form.travada && !form.estornar && (
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
        {form.travada && !form.estornar && novaPeca && dif !== 0 && (
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 17, fontWeight: "bold", marginBottom: 8, color: dif > 0 ? "#16a34a" : "#dc2626" }}>
              Diferença: {dif > 0 ? `você recebe +${fmtReais(dif)}` : `você devolve ${fmtReais(-dif)}`}
            </div>
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>
              Por onde o dinheiro {dif > 0 ? "entrou" : "saiu"}?
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {Object.entries(FORMAS).map(([valor, rotulo]) => (
                <button key={valor} onClick={() => setForm({ ...form, formaDif: valor })}
                  style={{ ...btn, background: form.formaDif === valor ? "#38bdf8" : "#e2e8f0", color: form.formaDif === valor ? "#0f172a" : "#334155" }}>
                  {rotulo}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>
              {dif > 0 ? "Entra" : "Sai"} no fechamento do dia nessa forma.
            </div>
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
          <button style={{ ...btn, background: "#e2e8f0" }} onClick={fechar}>Cancelar</button>
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
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>
            Prateleira ({prateleiraFiltrada.length}{prateleiraFiltrada.length !== prateleira.length ? ` de ${prateleira.length}` : ""})
          </h3>
          <select style={{ ...inp, width: "auto" }} value={fForn} onChange={(e) => setFForn(e.target.value)}>
            <option value="">Todos os fornecedores</option>
            {fornsPrateleira.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <input style={{ ...inp, width: 180 }} placeholder="Filtrar por produto…" value={fProd}
            onChange={(e) => setFProd(e.target.value)} />
          {prateleiraFiltrada.length > 0 && (
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 15, cursor: "pointer" }}>
              <input type="checkbox" style={{ width: 18, height: 18 }}
                checked={todasMarcadas} onChange={(e) => alternarTodas(e.target.checked)} />
              Selecionar todas
            </label>
          )}
          {marcadas.size > 0 && (
            <button style={{ ...btn, marginLeft: "auto", background: "#f59e0b", color: "white" }} onClick={fecharLote}>
              Fechar lote e enviar ({marcadas.size})
            </button>
          )}
        </div>
        <table aria-label="Prateleira" style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
          <tbody>
            {prateleiraFiltrada.map((t) => (
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
                <td style={{ padding: 8, color: "#64748b" }}>{t.fornecedor || "—"}</td>
                <td style={{ padding: 8 }}>{fmtReais(t.valor_compra)}</td>
                <td style={{ padding: 8, whiteSpace: "nowrap", color: t.diferenca > 0 ? "#16a34a" : "#dc2626" }}>
                  {t.estorno > 0 || t.diferenca ? (
                    <>
                      {t.estorno > 0
                        ? `estorno −${fmtReais(t.estorno)}`
                        : `${t.diferenca > 0 ? "+" : "−"}${fmtReais(Math.abs(t.diferenca))}`}
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>{FORMAS[t.forma_pagamento] || t.forma_pagamento}</div>
                    </>
                  ) : ""}
                </td>
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
            {prateleiraFiltrada.length === 0 && (
              <tr><td style={{ padding: 16, color: "#64748b" }}>
                {prateleira.length ? "Nenhuma peça no filtro." : "Nenhuma peça na prateleira."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={bloco}>
        <h3 style={{ marginTop: 0 }}>Lotes</h3>
        {resolvendo && (() => {
          const credito = creditoDe(resolvendo);
          const valido = !isNaN(credito) && credito >= 0 && credito <= resolvendo.lote.valor;
          const perda = resolvendo.lote.valor - credito;
          return (
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <h4 style={{ margin: "0 0 8px" }}>
                Lote #{resolvendo.lote.id} retornou — {resolvendo.itens.length} peça
                {resolvendo.itens.length === 1 ? "" : "s"}, {fmtReais(resolvendo.lote.valor)}
              </h4>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {[["total", "Valor total"], ["itens", "Item a item"]].map(([modo, rotulo]) => (
                  <button key={modo} onClick={() => setResolvendo({ ...resolvendo, modo })}
                    style={{ ...btn, background: resolvendo.modo === modo ? "#38bdf8" : "#e2e8f0", color: resolvendo.modo === modo ? "#0f172a" : "#334155" }}>
                    {rotulo}
                  </button>
                ))}
              </div>

              {resolvendo.modo === "total" ? (
                <label style={{ display: "block", marginBottom: 10 }}>
                  <div style={{ fontWeight: "bold", marginBottom: 4 }}>Quanto o fornecedor creditou (R$)</div>
                  <input style={{ ...inp, width: 180 }} autoFocus aria-label="Valor creditado"
                    value={resolvendo.valorTotal}
                    onChange={(e) => setResolvendo({ ...resolvendo, valorTotal: e.target.value })} />
                </label>
              ) : (
                <div style={{ marginBottom: 10, maxHeight: 220, overflow: "auto" }}>
                  {resolvendo.itens.map((t) => (
                    <label key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", cursor: "pointer" }}>
                      <input type="checkbox" style={{ width: 18, height: 18 }}
                        aria-label={`Aceita ${t.modelo}`}
                        checked={resolvendo.aceitas.has(t.id)}
                        onChange={(e) => {
                          const s = new Set(resolvendo.aceitas);
                          e.target.checked ? s.add(t.id) : s.delete(t.id);
                          setResolvendo({ ...resolvendo, aceitas: s });
                        }} />
                      <span style={{ flex: 1 }}>{t.modelo} <span style={{ color: "#64748b" }}>— {t.defeito}</span></span>
                      <strong style={{ color: resolvendo.aceitas.has(t.id) ? "#16a34a" : "#dc2626" }}>
                        {fmtReais(t.valor_compra)}
                      </strong>
                    </label>
                  ))}
                </div>
              )}

              {/* Ao vivo, antes de confirmar: é o número que o dono confere com o fornecedor. */}
              <div style={{ fontSize: 17, fontWeight: "bold", marginBottom: 10 }}>
                crédito <span style={{ color: "#16a34a" }}>{valido ? fmtReais(credito) : "—"}</span>
                {"  •  "}
                perda <span style={{ color: perda > 0 ? "#dc2626" : "#64748b" }}>{valido ? fmtReais(perda) : "—"}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...btn, background: "#22c55e", color: "white" }} onClick={confirmarResolucao}>
                  Confirmar fechamento
                </button>
                <button style={{ ...btn, background: "#e2e8f0" }} onClick={() => setResolvendo(null)}>Cancelar</button>
              </div>
            </div>
          );
        })()}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
          <tbody>
            {lotes.map((l) => {
              const resolvido = l.status === "resolvido";
              const aberto = loteAberto === l.id;
              const itens = itensLote.filter((t) => t.lote_id === l.id);
              const creditadas = itens.filter((t) => t.creditada);
              const perdidas = itens.filter((t) => !t.creditada && t.perda_valor != null);
              return (
              <React.Fragment key={l.id}>
              <tr
                onClick={resolvido ? () => setLoteAberto(aberto ? null : l.id) : undefined}
                title={resolvido ? (aberto ? "Recolher" : "Ver item a item") : undefined}
                style={{ borderBottom: aberto ? "none" : "1px solid #e2e8f0",
                  cursor: resolvido ? "pointer" : undefined, background: aberto ? "#f1f5f9" : undefined }}>
                <td style={{ padding: 8, fontWeight: "bold" }}>
                  {resolvido && setaPedido(aberto)} Lote #{l.id}
                </td>
                <td style={{ padding: 8 }}>{l.qtd} peça{l.qtd === 1 ? "" : "s"} — {fmtReais(l.valor)}</td>
                <td style={{ padding: 8, color: "#64748b" }}>enviado {l.enviado_em?.slice(8, 10)}/{l.enviado_em?.slice(5, 7)}</td>
                <td style={{ padding: 8, textAlign: "right" }}>
                  {l.status === "resolvido" ? (
                    <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>
                      <span style={{ color: "#16a34a" }}>✔ crédito {fmtReais(l.credito ?? l.valor)}</span>
                      {l.perda > 0 && <span style={{ color: "#dc2626" }}> — perda {fmtReais(l.perda)}</span>}
                      <div style={{ fontSize: 12, fontWeight: "normal", color: "#94a3b8" }}>
                        {l.resolvido_em?.slice(8, 10)}/{l.resolvido_em?.slice(5, 7)}
                        {l.modo === "itens" ? " • item a item" : l.modo === "total" ? " • valor total" : ""}
                      </div>
                    </span>
                  ) : (
                    <button style={{ ...btn, padding: "8px 14px", fontSize: 14, background: "#22c55e", color: "white" }} onClick={() => abrirResolucao(l)}>
                      Lote retornou → fechar
                    </button>
                  )}
                </td>
              </tr>
              {aberto && (
                <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <td colSpan={4} style={{ padding: "8px 8px 12px 24px" }}>
                    {/* Crédito e perda sempre juntos: ver só o crédito esconde o prejuízo. */}
                    <div style={{ fontWeight: "bold", marginBottom: 6 }}>
                      {l.modo === "itens" ? (
                        <>
                          <span style={{ color: "#16a34a" }}>
                            {creditadas.length} {creditadas.length === 1 ? "item creditado" : "itens creditados"}
                            {" "}({fmtReais(l.credito ?? 0)})
                          </span>
                          {" — "}
                          <span style={{ color: perdidas.length ? "#dc2626" : "#64748b" }}>
                            {perdidas.length} perdido{perdidas.length === 1 ? "" : "s"} ({fmtReais(l.perda ?? 0)})
                          </span>
                        </>
                      ) : (
                        <>
                          <span style={{ color: "#16a34a" }}>crédito {fmtReais(l.credito ?? l.valor)}</span>
                          {" — "}
                          <span style={{ color: l.perda > 0 ? "#dc2626" : "#64748b" }}>perda {fmtReais(l.perda ?? 0)}</span>
                          <div style={{ fontWeight: "normal", fontSize: 13, color: "#64748b" }}>
                            Fechado pelo valor total: não dá pra saber quais peças o fornecedor recusou.
                          </div>
                        </>
                      )}
                    </div>
                    {itens.map((t) => {
                      // No valor total ninguém sabe quais foram aceitas: item sem cor.
                      const cor = l.modo !== "itens" ? "#334155" : t.creditada ? "#16a34a" : "#dc2626";
                      return (
                        <div key={t.id} style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 15, color: cor }}>
                          <span style={{ flex: 1 }}>
                            {l.modo === "itens" && (t.creditada ? "✔ " : "✖ ")}
                            {t.modelo} <span style={{ color: "#94a3b8" }}>— {t.defeito}</span>
                          </span>
                          <strong>{fmtReais(t.valor_compra)}</strong>
                          {l.modo === "itens" && !t.creditada && t.perda_valor != null && (
                            <span style={{ color: "#dc2626" }}>perda {fmtReais(t.perda_valor)}</span>
                          )}
                        </div>
                      );
                    })}
                  </td>
                </tr>
              )}
              </React.Fragment>
              );
            })}
            {lotes.length === 0 && (
              <tr><td style={{ padding: 16, color: "#64748b" }}>Nenhum lote fechado ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={bloco}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          Perdas
          <FiltroData sel={pSel} aoEscolher={(chave, d, a) => setFiltroPerdas([chave, d, a])} />
          <span style={{ fontSize: 16, fontWeight: "normal", color: "#64748b" }}>
            total {sufixoTitulo(pSel)}: <strong style={{ color: totalPerdas ? "#dc2626" : "#64748b" }}>{fmtReais(totalPerdas)}</strong>
          </span>
        </h3>
        <table aria-label="Perdas" style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
          <tbody>
            {perdas.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: 8, color: "#64748b" }}>{p.criado_em.slice(8, 10)}/{p.criado_em.slice(5, 7)}</td>
                {/* perda de lote no modo "valor total" não aponta pra peça: o motivo explica */}
                <td style={{ padding: 8, fontWeight: "bold" }}>{`${p.nome || ""} ${p.modelo || ""}`.trim() || "—"}</td>
                <td style={{ padding: 8, color: "#64748b" }}>{p.motivo || "—"}</td>
                <td style={{ padding: 8, fontWeight: "bold", color: "#dc2626", textAlign: "right" }}>−{fmtReais(p.valor)}</td>
              </tr>
            ))}
            {perdas.length === 0 && (
              <tr><td style={{ padding: 16, color: "#64748b" }}>
                Nenhuma perda {pSel === "tudo" ? "registrada" : "no período"}.
              </td></tr>
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
