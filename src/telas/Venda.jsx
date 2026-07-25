import React, { useEffect, useState } from "react";
import { fmtReais, parseReais } from "./Estoque.jsx";
import FiltroData, { calcAtalho, sufixoTitulo } from "./FiltroData.jsx";
import { NotaModal, reimprimirNota } from "./Nota.jsx";
import { resolverCliente } from "./Clientes.jsx";

export const FORMAS = {
  especie: "Espécie",
  pix: "Pix",
  debito: "Débito",
  credito_avista: "Crédito à vista",
  credito_parcelado: "Crédito parcelado",
};

// Uma linha por item no banco; as telas agrupam por pedido. Recebe as vendas em
// ordem decrescente de id e devolve [[pedido_id, itens na ordem em que entraram]].
export const agruparPedidos = (vendas) => {
  const ordem = [];
  const por = {};
  vendas.forEach((v) => {
    const pid = v.pedido_id ?? v.id;
    if (!por[pid]) { por[pid] = []; ordem.push(pid); }
    por[pid].push(v);
  });
  return ordem.map((pid) => [pid, por[pid].slice().reverse()]);
};

// Totais do pedido num lugar só: mão de obra e desconto ficam gravados em uma
// linha do pedido, então somar item a item por fora sempre erra em alguma tela.
export const totalPedido = (itens) =>
  itens.reduce((s, v) => s + v.preco_venda * v.quantidade + v.mao_de_obra - v.desconto, 0);
export const lucroPedido = (itens) =>
  itens.reduce((s, v) => s + (v.preco_venda - v.preco_compra) * v.quantidade + v.mao_de_obra - v.desconto, 0);
export const descontoPedido = (itens) => itens.reduce((s, v) => s + v.desconto, 0);

// Etiqueta do pedido com desconto — a mesma na Venda e no Dashboard.
export const tagDesconto = (valor) => (
  <span style={{ background: "#fef3c7", color: "#b45309", borderRadius: 4, padding: "1px 6px", fontSize: 12, fontWeight: "bold", marginLeft: 6 }}>
    desconto {fmtReais(valor)}
  </span>
);

// Mesma seta no Dashboard e na Venda: o pedido abre e fecha igual nos dois.
export const setaPedido = (aberto) => (
  <span style={{ display: "inline-block", width: 16, color: "#64748b", fontSize: 12 }}>{aberto ? "▼" : "▶"}</span>
);

// Guarda o que o operador escolheu (% ou valor final) e deriva os centavos na
// hora — mexer na mão de obra depois do desconto não deixa o valor desatualizado.
export const calcDesconto = (desc, bruto) => {
  if (!desc) return 0;
  const d = desc.pct != null ? Math.round((bruto * desc.pct) / 100) : bruto - desc.final;
  return Math.min(Math.max(d, 0), bruto);
};

const inp = { padding: 10, fontSize: 16, borderRadius: 6, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box" };
const btn = { padding: "12px 20px", fontSize: 16, fontWeight: "bold", border: "none", borderRadius: 8, cursor: "pointer" };
const btnMini = { ...btn, padding: "6px 12px", fontSize: 14 };

export default function Venda({ maoDeObraOn = true, dono = true, cfg = {}, usuario = null, aoTrocar }) {
  const notaOn = cfg.nota_ativa === "1";
  const [pecas, setPecas] = useState([]);
  const [vendasHoje, setVendasHoje] = useState([]);
  const [trocasVenda, setTrocasVenda] = useState([]); // trocas vinculadas a vendas (cadeia A → B → C)
  const [clientes, setClientes] = useState([]);
  const [notasPorPedido, setNotasPorPedido] = useState({}); // pedido_id → nota (p/ reimprimir)
  const [notaVenda, setNotaVenda] = useState(null); // pedido recém-confirmado aguardando nota
  const [flashId, setFlashId] = useState(null); // pedido destacado após confirmar
  const [busca, setBusca] = useState("");
  // ponytail: carrinho vive nesta tela, então trocar de aba no meio da venda o
  // esvazia. Subir o estado pro App resolve, se o cliente reclamar.
  const [carrinho, setCarrinho] = useState([]); // [{ peca, qtd, preco }]
  const [fechando, setFechando] = useState(null); // { maoDeObra, forma, cliente, desc, descontoPor }
  const [descUI, setDescUI] = useState(null); // painel de desconto aberto: { modo, valor, pin }
  const [abertos, setAbertos] = useState(new Set()); // pedidos expandidos na lista
  const [[fSel, fDe, fAte], setFiltroData] = useState(() => ["hoje", ...calcAtalho("hoje")]);

  const carregar = () => {
    window.api.query("SELECT * FROM pecas ORDER BY nome, modelo").then(setPecas);
    window.api.query("SELECT id, codigo, nome FROM clientes ORDER BY nome").then(setClientes);
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
    // ponytail: varre notas inteiro (tabela pequena numa loja); filtrar por pedido se crescer.
    if (notaOn) {
      window.api.query("SELECT * FROM notas").then((rows) => {
        const m = {};
        rows.forEach((n) => { m[n.pedido_id ?? n.venda_id] = n; });
        setNotasPorPedido(m);
      });
    }
  };

  useEffect(() => {
    carregar();
  }, [fDe, fAte]);

  // --- carrinho --------------------------------------------------------------

  const adicionar = (p) => {
    const item = carrinho.find((x) => x.peca.id === p.id);
    if (item) {
      if (item.qtd >= p.quantidade) {
        alert(`Só tem ${p.quantidade} em estoque de ${p.nome} ${p.modelo}.`.replace(/\s+/g, " "));
        return;
      }
      setCarrinho(carrinho.map((x) => (x.peca.id === p.id ? { ...x, qtd: x.qtd + 1 } : x)));
      return;
    }
    setCarrinho([...carrinho, { peca: p, qtd: 1, preco: (p.preco_venda / 100).toFixed(2).replace(".", ",") }]);
  };

  const mudarItem = (id, campo, valor) =>
    setCarrinho(carrinho.map((x) => (x.peca.id === id ? { ...x, [campo]: valor } : x)));
  const removerItem = (id) => setCarrinho(carrinho.filter((x) => x.peca.id !== id));

  const subtotal = (it) => (parseReais(it.preco) || 0) * (Number(it.qtd) || 0);
  const totalCarrinho = carrinho.reduce((s, it) => s + subtotal(it), 0);

  const finalizar = async () => {
    const maoDeObra = fechando.maoDeObra.trim() === "" ? 0 : parseReais(fechando.maoDeObra);
    if (isNaN(maoDeObra)) {
      alert("Mão de obra inválida.");
      return;
    }
    for (const it of carrinho) {
      const qtd = Number(it.qtd);
      const nome = `${it.peca.nome} ${it.peca.modelo}`.trim();
      if (isNaN(parseReais(it.preco))) {
        alert(`Preço inválido em ${nome}.`);
        return;
      }
      if (!qtd || qtd < 1 || qtd > it.peca.quantidade) {
        alert(`Quantidade inválida em ${nome} (disponível: ${it.peca.quantidade}).`);
        return;
      }
    }
    const desconto = calcDesconto(fechando.desc, totalCarrinho + maoDeObra);
    // Nome novo vira cadastro aqui mesmo; nome já conhecido volta com o id dele.
    const cli = await resolverCliente(fechando.cliente, clientes);
    const [{ n: pedidoId }] = await window.api.query("SELECT COALESCE(MAX(pedido_id),0)+1 AS n FROM vendas");
    const comandos = [];
    carrinho.forEach((it, i) => {
      comandos.push(["UPDATE pecas SET quantidade = quantidade - ? WHERE id = ?", [Number(it.qtd), it.peca.id]]);
      comandos.push([
        `INSERT INTO vendas (peca_id, quantidade, preco_venda, preco_compra, mao_de_obra,
                             forma_pagamento, cliente, cliente_id, usuario_id, pedido_id, desconto, desconto_por)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        // Mão de obra e desconto são do pedido: gravam numa linha só pra não somar duas vezes.
        [it.peca.id, Number(it.qtd), parseReais(it.preco), it.peca.preco_compra, i === 0 ? maoDeObra : 0,
         fechando.forma, cli.nome, cli.id, usuario?.id ?? null, pedidoId,
         i === 0 ? desconto : 0, i === 0 ? fechando.descontoPor : null],
      ]);
    });
    await window.api.tx(comandos);
    if (notaOn) {
      setNotaVenda({
        pedido_id: pedidoId,
        cliente: cli.nome, // nome do cadastro, não o que foi digitado (pode ter vindo por código)
        descricao: carrinho.map((it) => `${it.qtd}x ${it.peca.nome} ${it.peca.modelo}`.trim()).join("\n")
          + (desconto ? `\nDesconto: -${fmtReais(desconto)}` : ""),
        valor_total: totalCarrinho + maoDeObra - desconto,
      });
    }
    setCarrinho([]);
    setFechando(null);
    setDescUI(null);
    setBusca("");
    carregar();
    setFlashId(pedidoId);
    setTimeout(() => document.getElementById(`pedido-${pedidoId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    setTimeout(() => setFlashId(null), 1600);
  };

  // Administrador aplica direto; colaborador precisa do PIN de permissão de um
  // administrador, e é esse administrador que fica gravado como autorizador.
  const aplicarDesconto = async (bruto) => {
    const desc = descUI.modo === "pct"
      ? { pct: Number(String(descUI.valor).replace(",", ".")) }
      : { final: parseReais(descUI.valor) };
    if (descUI.modo === "pct" && (!(desc.pct > 0) || desc.pct > 100)) {
      alert("Porcentagem inválida (entre 0 e 100).");
      return;
    }
    if (descUI.modo === "final" && (isNaN(desc.final) || desc.final < 0 || desc.final > bruto)) {
      alert(`Valor final inválido (no máximo ${fmtReais(bruto)}).`);
      return;
    }
    let autorizador = usuario?.id ?? null;
    if (!dono) {
      const [admin] = await window.api.query(
        "SELECT id FROM usuarios WHERE papel = 'dono' AND pin_permissao = ? AND pin_permissao != ''",
        [descUI.pin.trim()]
      );
      if (!admin) {
        alert("PIN de permissão inválido. Desconto não aplicado.");
        return;
      }
      autorizador = admin.id;
    }
    setFechando({ ...fechando, desc, descontoPor: autorizador });
    setDescUI(null);
  };

  // --- vendas já registradas -------------------------------------------------

  const notaClick = (pid, itens) => {
    const existente = notasPorPedido[pid];
    if (existente) return reimprimirNota(existente, cfg);
    const desconto = descontoPedido(itens);
    setNotaVenda({
      pedido_id: pid,
      cliente: itens[0].cliente || "",
      descricao: itens.map((v) => `${v.quantidade}x ${v.nome} ${v.modelo}`.trim()).join("\n")
        + (desconto ? `\nDesconto: -${fmtReais(desconto)}` : ""),
      valor_total: totalPedido(itens),
    });
  };

  const desfazerTroca = async (t) => {
    const boa = !t.defeituosa; // peça devolvida funcionando tinha voltado ao estoque
    if (!confirm(`Desfazer a troca? ${t.nova_nome} ${t.nova_modelo} volta ao estoque${
      boa ? " e a peça devolvida sai dele de novo" : " e a peça sai da aba Trocas"}.`)) return;
    const comandos = [
      ["DELETE FROM trocas WHERE id = ?", [t.id]],
      ["UPDATE pecas SET quantidade = quantidade + 1 WHERE id = ?", [t.nova_peca_id]],
    ];
    // Desfazer reverte os dois movimentos, senão a devolvida boa fica somada pra sempre.
    if (boa && t.peca_id) comandos.push(["UPDATE pecas SET quantidade = quantidade - 1 WHERE id = ?", [t.peca_id]]);
    await window.api.tx(comandos);
    carregar();
  };

  // Desfazer é do pedido inteiro: devolver item solto de pedido já pago é troca/estorno.
  const desfazer = async (itens) => {
    const desc = itens.map((v) => `${v.quantidade}x ${v.nome} ${v.modelo}`.trim()).join(", ");
    if (!confirm(`Desfazer a venda de ${desc}?`)) return;
    const comandos = [];
    itens.forEach((v) => {
      comandos.push(["DELETE FROM vendas WHERE id = ?", [v.id]]);
      comandos.push(["UPDATE pecas SET quantidade = quantidade + ? WHERE id = ?", [v.quantidade, v.peca_id]]);
    });
    await window.api.tx(comandos);
    carregar();
  };

  // --- tela de fechamento do pedido -----------------------------------------

  if (fechando) {
    const maoDeObra = parseReais(fechando.maoDeObra) || 0;
    const bruto = totalCarrinho + maoDeObra;
    const desconto = calcDesconto(fechando.desc, bruto);
    return (
      <div style={{ maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>Confirmar venda</h2>
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, marginBottom: 16 }}>
          {carrinho.map((it) => (
            <div key={it.peca.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 16 }}>
              <span>{it.qtd}x {it.peca.nome} {it.peca.modelo}</span>
              <strong>{fmtReais(subtotal(it))}</strong>
            </div>
          ))}
          {maoDeObraOn && maoDeObra > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 16, color: "#64748b" }}>
              <span>Mão de obra</span>
              <strong>{fmtReais(maoDeObra)}</strong>
            </div>
          )}
        </div>
        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Cliente (opcional)</div>
          {/* datalist é a sugestão nativa do próprio input — sem componente de autocomplete */}
          <input style={inp} list="clientes-cadastrados" placeholder="Nome do cliente ou código (C001)"
            value={fechando.cliente} onChange={(e) => setFechando({ ...fechando, cliente: e.target.value })} />
          <datalist id="clientes-cadastrados">
            {clientes.map((c) => <option key={c.id} value={c.nome} label={c.codigo} />)}
          </datalist>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            Nome novo vira cadastro automático.
          </div>
        </label>
        {maoDeObraOn && (
          <label style={{ display: "block", marginBottom: 12 }}>
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>Mão de obra (R$, opcional)</div>
            <input style={inp} placeholder="0,00" value={fechando.maoDeObra}
              onChange={(e) => setFechando({ ...fechando, maoDeObra: e.target.value })} />
          </label>
        )}
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>Forma de pagamento</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {Object.entries(FORMAS).map(([valor, rotulo]) => (
            <button key={valor} onClick={() => setFechando({ ...fechando, forma: valor })}
              style={{ ...btn, background: fechando.forma === valor ? "#38bdf8" : "#e2e8f0", color: fechando.forma === valor ? "#0f172a" : "#334155" }}>
              {rotulo}
            </button>
          ))}
        </div>
        {desconto > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "#b45309", fontSize: 17, fontWeight: "bold" }}>
            <span>Desconto: −{fmtReais(desconto)}</span>
            {fechando.desc.pct != null && <span style={{ fontWeight: "normal", color: "#64748b" }}>({fechando.desc.pct}%)</span>}
            <button style={{ ...btnMini, background: "#e2e8f0", color: "#334155" }}
              onClick={() => setFechando({ ...fechando, desc: null, descontoPor: null })}>
              Remover desconto
            </button>
          </div>
        ) : descUI ? (
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {[["pct", "Porcentagem"], ["final", "Valor final"]].map(([modo, rotulo]) => (
                <button key={modo} onClick={() => setDescUI({ ...descUI, modo, valor: "" })}
                  style={{ ...btnMini, background: descUI.modo === modo ? "#38bdf8" : "#e2e8f0", color: descUI.modo === modo ? "#0f172a" : "#334155" }}>
                  {rotulo}
                </button>
              ))}
            </div>
            <input style={{ ...inp, marginBottom: 8 }} autoFocus
              aria-label={descUI.modo === "pct" ? "Porcentagem de desconto" : "Valor final do pedido"}
              placeholder={descUI.modo === "pct" ? "ex.: 10" : `ex.: ${fmtReais(bruto).replace("R$ ", "")}`}
              value={descUI.valor} onChange={(e) => setDescUI({ ...descUI, valor: e.target.value })} />
            {!dono && (
              <input style={{ ...inp, marginBottom: 8 }} type="password" inputMode="numeric" maxLength={4}
                aria-label="PIN de permissão" placeholder="PIN de permissão do administrador"
                value={descUI.pin} onChange={(e) => setDescUI({ ...descUI, pin: e.target.value.replace(/\D/g, "") })} />
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...btn, background: "#22c55e", color: "white", flex: 1 }} onClick={() => aplicarDesconto(bruto)}>
                Aplicar
              </button>
              <button style={{ ...btn, background: "#e2e8f0" }} onClick={() => setDescUI(null)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <button style={{ ...btnMini, background: "#fef3c7", color: "#b45309", marginBottom: 12 }}
            onClick={() => setDescUI({ modo: "pct", valor: "", pin: "" })}>
            Aplicar desconto
          </button>
        )}
        <div style={{ fontSize: 22, fontWeight: "bold", marginBottom: 16 }}>Total: {fmtReais(bruto - desconto)}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...btn, background: "#22c55e", color: "white", flex: 1, fontSize: 20 }} onClick={finalizar}>
            Confirmar venda
          </button>
          <button style={{ ...btn, background: "#e2e8f0" }} onClick={() => setFechando(null)}>Voltar</button>
          <button style={{ ...btn, background: "#fee2e2", color: "#dc2626" }}
            onClick={() => { setFechando(null); setDescUI(null); setCarrinho([]); }}>
            Cancelar venda
          </button>
        </div>
      </div>
    );
  }

  // --- lista de produtos + carrinho + vendas ---------------------------------

  const filtro = busca.trim().toLowerCase();
  const visiveis = filtro
    ? pecas.filter((p) => `${p.codigo} ${p.nome} ${p.modelo}`.toLowerCase().includes(filtro))
    : pecas;

  const trocasPorVenda = {};
  trocasVenda.forEach((t) => (trocasPorVenda[t.venda_id] ||= []).push(t));

  const pedidos = agruparPedidos(vendasHoje);

  const alternar = (pid) => {
    const s = new Set(abertos);
    s.has(pid) ? s.delete(pid) : s.add(pid);
    setAbertos(s);
  };

  const acoesTroca = (v) => (
    dono && (
      <button style={{ ...btnMini, background: "#fef3c7", color: "#b45309", marginRight: 6 }}
        onClick={() => aoTrocar({ venda_id: v.id, peca_id: v.peca_id, nome: v.nome, modelo: v.modelo, preco_compra: v.preco_compra, preco_venda: v.preco_venda })}>
        Trocar
      </button>
    )
  );

  const linhasTroca = (v) => {
    const cadeia = trocasPorVenda[v.id] || [];
    return cadeia.map((t, i) => {
      const ultima = i === cadeia.length - 1;
      return (
        <tr key={`t${t.id}`} style={{ borderBottom: ultima ? "1px solid #e2e8f0" : "none", background: "#fffbeb" }}>
          <td style={{ padding: 8, color: "#64748b" }}>{t.recebido_em.slice(11, 16)}</td>
          <td style={{ padding: 8 }} colSpan={2}>
            ↳ trocado por 1x <strong>{t.nova_nome} {t.nova_modelo}</strong>
          </td>
          <td style={{ padding: 8, color: "#b45309" }}>{t.defeituosa ? "troca" : "devolveu boa"}</td>
          <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
            {t.lote_id ? (
              <span style={{ color: "#64748b", fontSize: 14 }}>no lote #{t.lote_id}</span>
            ) : ultima && dono ? (
              <>
                <button style={{ ...btnMini, background: "#fef3c7", color: "#b45309", marginRight: 6 }}
                  onClick={() => aoTrocar({ venda_id: t.venda_id, peca_id: t.nova_peca_id, nome: t.nova_nome, modelo: t.nova_modelo, preco_compra: t.nova_compra, preco_venda: t.nova_preco })}>
                  Trocar
                </button>
                <button style={{ ...btnMini, background: "#fee2e2", color: "#dc2626" }} onClick={() => desfazerTroca(t)}>
                  Desfazer
                </button>
              </>
            ) : (
              <span style={{ color: "#b45309", fontSize: 14, fontWeight: "bold" }}>trocada ↓</span>
            )}
          </td>
        </tr>
      );
    });
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <input style={{ ...inp, marginBottom: 16 }} autoFocus placeholder="Buscar peça por código, nome ou modelo…"
        value={busca} onChange={(e) => setBusca(e.target.value)} />

      <div style={{ flex: "6 1 0", display: "flex", gap: 16, minHeight: 0 }}>
        <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 16 }}>
            <tbody>
              {visiveis.map((p) => {
                const noCarrinho = carrinho.find((x) => x.peca.id === p.id);
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid #e2e8f0", background: noCarrinho ? "#f0fdf4" : undefined }}>
                    <td style={{ padding: 8, color: "#64748b", fontFamily: "monospace", whiteSpace: "nowrap" }}>{p.codigo}</td>
                    <td style={{ padding: 8, fontWeight: "bold" }}>{p.nome} {p.modelo}</td>
                    <td style={{ padding: 8 }}>qtd: {p.quantidade}</td>
                    <td style={{ padding: 8 }}>{fmtReais(p.preco_venda)}</td>
                    <td style={{ padding: 8, textAlign: "right" }}>
                      <button
                        disabled={p.quantidade < 1}
                        onClick={() => adicionar(p)}
                        style={{ ...btn, background: p.quantidade < 1 ? "#e2e8f0" : "#22c55e", color: p.quantidade < 1 ? "#94a3b8" : "white", cursor: p.quantidade < 1 ? "not-allowed" : "pointer" }}>
                        + Adicionar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {visiveis.length === 0 && (
                <tr><td style={{ padding: 24, color: "#64748b" }}>Nenhuma peça {filtro ? "encontrada" : "cadastrada"}.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {carrinho.length > 0 && (
          <div style={{ width: 340, display: "flex", flexDirection: "column", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12 }}>
            <h3 style={{ margin: "0 0 8px" }}>Carrinho ({carrinho.length})</h3>
            <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
              {carrinho.map((it) => (
                <div key={it.peca.id} style={{ borderBottom: "1px solid #e2e8f0", padding: "8px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong style={{ fontSize: 15 }}>{it.peca.nome} {it.peca.modelo}</strong>
                    <button aria-label={`Remover ${it.peca.nome} ${it.peca.modelo}`.trim()}
                      onClick={() => removerItem(it.peca.id)}
                      style={{ border: "none", background: "transparent", cursor: "pointer", color: "#dc2626", fontSize: 18 }}>
                      ✕
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                    <input type="number" min={1} max={it.peca.quantidade} value={it.qtd}
                      aria-label={`Quantidade de ${it.peca.nome} ${it.peca.modelo}`.trim()}
                      onChange={(e) => mudarItem(it.peca.id, "qtd", e.target.value)}
                      style={{ ...inp, width: 64, padding: 6, fontSize: 15 }} />
                    <span style={{ color: "#64748b" }}>×</span>
                    <input value={it.preco} readOnly={!dono}
                      aria-label={`Preço de ${it.peca.nome} ${it.peca.modelo}`.trim()}
                      onChange={(e) => mudarItem(it.peca.id, "preco", e.target.value)}
                      style={{ ...inp, width: 90, padding: 6, fontSize: 15, ...(dono ? {} : { background: "#f1f5f9", color: "#64748b" }) }} />
                    <strong style={{ marginLeft: "auto", fontSize: 15 }}>{fmtReais(subtotal(it))}</strong>
                  </div>
                  <div style={{ fontSize: 13, color: "#64748b" }}>disponível: {it.peca.quantidade}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 20, fontWeight: "bold", margin: "12px 0" }}>Total: {fmtReais(totalCarrinho)}</div>
            <button style={{ ...btn, background: "#22c55e", color: "white", fontSize: 18 }}
              onClick={() => { setFechando({ maoDeObra: "", forma: "especie", cliente: "", desc: null, descontoPor: null }); setDescUI(null); }}>
              Finalizar venda ({carrinho.length} {carrinho.length === 1 ? "item" : "itens"})
            </button>
            <button style={{ ...btn, background: "transparent", color: "#64748b", fontSize: 14, marginTop: 4 }}
              onClick={() => setCarrinho([])}>
              Limpar carrinho
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: "4 1 0", overflow: "auto", minHeight: 0, borderTop: "2px solid #cbd5e1", marginTop: 12 }}>
        <h3 style={{ margin: "12px 0 8px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {fSel === "tudo" ? "Todas as vendas" : `Vendas ${sufixoTitulo(fSel)}`}
          <FiltroData sel={fSel} aoEscolher={(chave, d, a) => setFiltroData([chave, d, a])} />
        </h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
          <tbody>
            {pedidos.map(([pid, itens]) => {
              const total = totalPedido(itens);
              const desconto = descontoPedido(itens);
              const temTroca = itens.some((v) => (trocasPorVenda[v.id] || []).length > 0);
              const fundo = flashId === pid ? "#86efac" : temTroca ? "#fffbeb" : undefined;
              const botaoNota = notaOn && (
                <button style={{ ...btnMini, background: "#e0f2fe", color: "#0369a1", marginRight: 6 }}
                  onClick={() => notaClick(pid, itens)}>
                  🧾 {notasPorPedido[pid] ? "Reimprimir" : "Nota"}
                </button>
              );
              const botaoDesfazer = !temTroca && (
                <button style={{ ...btnMini, background: "#fee2e2", color: "#dc2626" }} onClick={() => desfazer(itens)}>
                  Desfazer
                </button>
              );

              // Pedido de 1 item continua numa linha só — é o caso comum no balcão.
              if (itens.length === 1) {
                const v = itens[0];
                const trocada = (trocasPorVenda[v.id] || []).length > 0;
                return (
                  <React.Fragment key={pid}>
                    <tr id={`pedido-${pid}`} style={{ borderBottom: trocada ? "none" : "1px solid #e2e8f0", transition: "background .8s", background: fundo }}>
                      <td style={{ padding: 8, color: "#64748b" }}>{v.criado_em.slice(11, 16)}</td>
                      <td style={{ padding: 8 }}>
                        {v.quantidade}x {v.nome} {v.modelo}
                        {v.cliente && <span style={{ color: "#64748b" }}> — {v.cliente}</span>}
                        {desconto > 0 && tagDesconto(desconto)}
                      </td>
                      <td style={{ padding: 8, fontWeight: "bold" }}>{fmtReais(total)}</td>
                      <td style={{ padding: 8 }}>{FORMAS[v.forma_pagamento] || v.forma_pagamento}</td>
                      <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
                        {botaoNota}
                        {trocada ? <span style={{ color: "#b45309", fontSize: 14, fontWeight: "bold" }}>trocada ↓</span>
                          : <>{acoesTroca(v)}{botaoDesfazer}</>}
                      </td>
                    </tr>
                    {linhasTroca(v)}
                  </React.Fragment>
                );
              }

              const aberto = abertos.has(pid);
              return (
                <React.Fragment key={pid}>
                  <tr id={`pedido-${pid}`} onClick={() => alternar(pid)} title={aberto ? "Recolher" : "Expandir"}
                    style={{ borderBottom: aberto ? "none" : "1px solid #e2e8f0", cursor: "pointer", transition: "background .8s", background: fundo || "#f1f5f9" }}>
                    <td style={{ padding: 8, color: "#64748b" }}>{itens[0].criado_em.slice(11, 16)}</td>
                    <td style={{ padding: 8, fontWeight: "bold" }}>
                      {setaPedido(aberto)} Pedido com {itens.length} itens
                      {itens[0].cliente && <span style={{ color: "#64748b", fontWeight: "normal" }}> — {itens[0].cliente}</span>}
                      {desconto > 0 && tagDesconto(desconto)}
                    </td>
                    <td style={{ padding: 8, fontWeight: "bold" }}>{fmtReais(total)}</td>
                    <td style={{ padding: 8 }}>{FORMAS[itens[0].forma_pagamento] || itens[0].forma_pagamento}</td>
                    {/* os botões não podem abrir/fechar o pedido junto */}
                    <td onClick={(e) => e.stopPropagation()} style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
                      {botaoNota}
                      {temTroca ? <span style={{ color: "#b45309", fontSize: 14, fontWeight: "bold" }}>com troca</span> : botaoDesfazer}
                    </td>
                  </tr>
                  {aberto && itens.map((v, i) => {
                    const trocada = (trocasPorVenda[v.id] || []).length > 0;
                    return (
                      <React.Fragment key={v.id}>
                        <tr style={{ borderBottom: i === itens.length - 1 && !trocada ? "1px solid #e2e8f0" : "none", background: fundo }}>
                          <td />
                          <td style={{ padding: "6px 8px", paddingLeft: 24 }}>↳ {v.quantidade}x {v.nome} {v.modelo}</td>
                          <td style={{ padding: "6px 8px" }}>{fmtReais(v.preco_venda * v.quantidade + v.mao_de_obra)}</td>
                          <td />
                          <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                            {trocada ? <span style={{ color: "#b45309", fontSize: 14, fontWeight: "bold" }}>trocada ↓</span> : acoesTroca(v)}
                          </td>
                        </tr>
                        {linhasTroca(v)}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
            {pedidos.length === 0 && (
              <tr><td style={{ padding: 16, color: "#64748b" }}>Nenhuma venda no período.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {notaVenda && <NotaModal venda={notaVenda} cfg={cfg} aoFechar={() => { setNotaVenda(null); carregar(); }} />}
    </div>
  );
}
