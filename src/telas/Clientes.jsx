import React, { useEffect, useState } from "react";
import { fmtReais } from "./Estoque.jsx";
import { rotuloForma, agruparPedidos, totalPedido, descontoPedido, tagDesconto } from "./Venda.jsx";
import FiltroData, { sufixoTitulo } from "./FiltroData.jsx";

const proximoCodigo = async () => {
  const [{ n }] = await window.api.query(
    "SELECT COALESCE(MAX(CAST(substr(codigo,2) AS INTEGER)),0)+1 AS n FROM clientes WHERE codigo GLOB 'C[0-9]*'"
  );
  return `C${String(n).padStart(3, "0")}`;
};

// Texto digitado na venda → cliente do cadastro. Código tem prioridade sobre o
// nome, que é o que desempata quando existem dois "João" (o cliente digita C002).
// ponytail: nome repetido casa com o primeiro; o código é a saída.
export const resolverCliente = async (texto, clientes) => {
  const t = texto.trim();
  if (!t) return { id: null, nome: "" };
  const igual = (a, b) => a.toLowerCase() === b.toLowerCase();
  const achado = clientes.find((c) => c.codigo && igual(c.codigo, t)) || clientes.find((c) => igual(c.nome, t));
  if (achado) return { id: achado.id, nome: achado.nome };
  const r = await window.api.query("INSERT INTO clientes (codigo, nome) VALUES (?,?)", [await proximoCodigo(), t]);
  return { id: r.lastInsertRowid, nome: t };
};

const btn = { padding: "8px 14px", fontSize: 14, fontWeight: "bold", border: "none", borderRadius: 6, cursor: "pointer" };
// boxSizing: sem ele o width:100% soma padding e borda e o input vaza por cima
// da célula vizinha na linha de edição.
const inp = { padding: 8, fontSize: 15, borderRadius: 6, border: "1px solid #cbd5e1", boxSizing: "border-box" };
const th = { padding: 8, textAlign: "left", cursor: "pointer", userSelect: "none" };

// [chave, rótulo, direção do primeiro clique, segue o filtro de período?]
// -1 em "dias": o primeiro clique já traz quem sumiu há mais tempo, que é a ordem
// de quem vai ligar. Nas outras colunas o primeiro clique é crescente.
const COLUNAS = [
  ["codigo", "Código"], ["nome", "Nome"], ["contato", "Contato"],
  ["total", "Total gasto", 1, true], ["compras", "Compras", 1, true],
  ["ultima", "Última compra"], ["dias", "Dias sem comprar", -1],
];

// Quanto o cliente já gastou é conversa de dono. Pra funcionária a tela serve
// pra ligar pra quem sumiu: nome, telefone e dias resolvem, o valor não.
const colunasDe = (dono) => (dono ? COLUNAS : COLUNAS.filter(([chave]) => chave !== "total"));

const dataBR = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—");

// Passo 28: a funcionária varre esta coluna com o olho antes de pegar o telefone.
// 1 dia sem comprar acende laranja, 2 ou mais acende vermelho. Quem comprou hoje
// não acende nada — o que interessa é a ausência, não a presença.
export const alertaDias = (dias) =>
  dias == null || dias < 1 ? null
    : dias === 1 ? { background: "#ffedd5", color: "#c2410c" }
    : { background: "#fee2e2", color: "#b91c1c" };

const textoDias = (dias) => (dias == null ? "—" : dias === 0 ? "hoje" : `${dias} dia${dias === 1 ? "" : "s"}`);
// Título separado do texto: "2 dias" sozinho não diz de quê, e é ele que o
// mouse parado em cima mostra.
const tituloDias = (dias) =>
  dias == null ? "nunca comprou" : dias === 0 ? "comprou hoje" : `${textoDias(dias)} sem comprar`;

export const tagDias = (dias) => {
  const alerta = alertaDias(dias);
  return (
    <span title={tituloDias(dias)}
      style={{ borderRadius: 4, padding: "1px 6px", fontSize: 13, color: "#64748b", ...alerta, fontWeight: alerta ? "bold" : undefined }}>
      {textoDias(dias)}
    </span>
  );
};

export default function Clientes({ dono = true }) {
  const [clientes, setClientes] = useState([]);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState(["nome", 1]); // [coluna, 1 crescente | -1 decrescente]
  const [detalhe, setDetalhe] = useState(null); // { cliente, itens }
  const [editando, setEditando] = useState(null); // { id, codigo, nome, contato }
  const [doDia, setDoDia] = useState([]);
  // '' nas duas pontas = "Tudo", que é como a lista sempre abriu. Só o
  // administrador troca o período; o colaborador fica no total de sempre.
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [atalhoSel, setAtalhoSel] = useState("tudo"); // null = período escolhido na mão

  const carregar = () => {
    const cond = [];
    const params = [];
    if (de) { cond.push("date(v.criado_em) >= ?"); params.push(de); }
    if (ate) { cond.push("date(v.criado_em) <= ?"); params.push(ate); }
    const noPeriodo = cond.length ? cond.join(" AND ") : "1";
    // O período recorta só quanto e quantas vezes o cliente comprou. Última compra
    // e dias sem comprar ficam absolutos de propósito: são o alerta de quem sumiu,
    // e recortá-los pelo mês faria a loja inteira parecer sumida todo dia 1º.
    // O CASE (em vez de WHERE) mantém na lista quem não comprou nada no período —
    // é justamente ele que o dono quer enxergar.
    window.api
      // Compras = pedidos, não itens: um carrinho de 3 peças é uma compra só.
      .query(`SELECT c.*,
                     COUNT(DISTINCT CASE WHEN ${noPeriodo} THEN v.pedido_id END) AS compras,
                     COALESCE(SUM(CASE WHEN ${noPeriodo}
                                       THEN v.preco_venda * v.quantidade + v.mao_de_obra - v.desconto END), 0) AS total,
                     MAX(v.criado_em) AS ultima,
                     -- Dia de calendário, não 24h: quem comprou ontem às 23h já
                     -- conta 1 dia hoje de manhã, que é como a loja fala.
                     CAST(julianday(date('now','localtime')) - julianday(date(MAX(v.criado_em))) AS INTEGER) AS dias
              FROM clientes c LEFT JOIN vendas v ON v.cliente_id = c.id GROUP BY c.id`,
        [...params, ...params]) // as duas colunas repetem a mesma condição
      .then(setClientes);
    window.api
      .query(`SELECT v.*, p.nome, p.modelo, c.nome AS cliente_nome, c.codigo AS cliente_codigo
              FROM vendas v JOIN pecas p ON p.id = v.peca_id
              LEFT JOIN clientes c ON c.id = v.cliente_id
              WHERE date(v.criado_em) = date('now','localtime') ORDER BY v.id DESC`)
      .then(setDoDia);
  };

  useEffect(carregar, [de, ate]);

  const abrir = async (c) => {
    const itens = await window.api.query(
      `SELECT v.*, p.nome, p.modelo FROM vendas v JOIN pecas p ON p.id = v.peca_id
       WHERE v.cliente_id = ? ORDER BY v.id DESC`,
      [c.id]
    );
    setDetalhe({ cliente: c, itens });
  };

  const salvar = async () => {
    const codigo = editando.codigo.trim().toUpperCase();
    const nome = editando.nome.trim();
    if (!nome) {
      alert("O cliente precisa de um nome.");
      return;
    }
    if (codigo && clientes.some((c) => c.codigo === codigo && c.id !== editando.id)) {
      alert(`O código ${codigo} já é de outro cliente.`);
      return;
    }
    await window.api.query("UPDATE clientes SET codigo = ?, nome = ?, contato = ? WHERE id = ?",
      [codigo, nome, editando.contato.trim(), editando.id]);
    setEditando(null);
    carregar();
  };

  // Excluir desvincula das vendas: o histórico de venda nunca some junto.
  const excluir = async (c) => {
    if (!confirm(`Excluir o cliente "${c.nome}"? As compras dele continuam no histórico, sem o nome.`)) return;
    await window.api.tx([
      ["UPDATE vendas SET cliente_id = NULL WHERE cliente_id = ?", [c.id]],
      ["DELETE FROM clientes WHERE id = ?", [c.id]],
    ]);
    setDetalhe(null);
    carregar();
  };

  if (detalhe) {
    const pedidos = agruparPedidos(detalhe.itens);
    return (
      <div>
        <button style={{ ...btn, background: "#e2e8f0", marginBottom: 12 }} onClick={() => setDetalhe(null)}>‹ Voltar</button>
        <h3 style={{ margin: "0 0 4px" }}>{detalhe.cliente.codigo} — {detalhe.cliente.nome}</h3>
        <div style={{ color: "#64748b", marginBottom: 12 }}>
          {detalhe.cliente.contato || "sem contato"} — {pedidos.length} compra{pedidos.length === 1 ? "" : "s"},
          total {fmtReais(totalPedido(detalhe.itens))}
        </div>
        <table style={{ width: "100%", minWidth: 620, borderCollapse: "collapse", fontSize: 15 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #cbd5e1" }}>
              {["Data", "Itens", "Valor", "Forma"].map((h) => <th key={h} style={{ padding: 8 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {pedidos.map(([pid, itens]) => (
              <tr key={pid} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: 8, color: "#64748b", whiteSpace: "nowrap" }}>
                  {dataBR(itens[0].criado_em)} {itens[0].criado_em.slice(11, 16)}
                </td>
                <td style={{ padding: 8 }}>
                  {itens.map((v) => `${v.quantidade}x ${v.nome} ${v.modelo}`.trim()).join(", ")}
                  {descontoPedido(itens) > 0 && tagDesconto(descontoPedido(itens))}
                </td>
                <td style={{ padding: 8, fontWeight: "bold" }}>{fmtReais(totalPedido(itens))}</td>
                <td style={{ padding: 8 }}>{rotuloForma(itens[0].forma_pagamento)}</td>
              </tr>
            ))}
            {pedidos.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 16, color: "#64748b" }}>Ainda não comprou nada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  const filtro = busca.trim().toLowerCase();
  const [col, dir] = ordem;
  const visiveis = clientes
    .filter((c) => !filtro || `${c.codigo} ${c.nome}`.toLowerCase().includes(filtro))
    .sort((a, b) => {
      const x = a[col];
      const y = b[col];
      // Quem nunca comprou não tem dias nem última compra: vai pro fim nas duas
      // direções, senão o topo da lista de ligações enche de quem não tem o que cobrar.
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
      return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR")) * dir;
    });

  const pedidosDoDia = agruparPedidos(doDia);
  // Somam o que está na tela, então acompanham a busca junto com o período:
  // procurar "Silva" responde quanto os Silva compraram no mês.
  const sufixo = sufixoTitulo(atalhoSel);
  const colunas = colunasDe(dono);
  const gastoVisivel = visiveis.reduce((s, c) => s + c.total, 0);
  const comprasVisiveis = visiveis.reduce((s, c) => s + c.compras, 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <input style={{ ...inp, flex: 1 }} placeholder="Buscar cliente por código ou nome…"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
        <span style={{ color: "#64748b", fontSize: 14, whiteSpace: "nowrap" }}>
          {visiveis.length} cliente{visiveis.length === 1 ? "" : "s"}
        </span>
      </div>
      {dono && (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <FiltroData sel={atalhoSel} de={de} ate={ate}
              aoEscolher={(chave, d, a) => { setAtalhoSel(chave); setDe(d); setAte(a); }} />
          </div>
          {/* role=status: o número muda ao trocar o período sem nada sair do
              lugar na tela — quem usa leitor de tela precisa ser avisado. */}
          <div role="status" style={{ fontSize: 16, color: "#475569", marginBottom: 10 }}>
            Compraram <strong style={{ color: "#0f172a" }}>{fmtReais(gastoVisivel)}</strong> em{" "}
            {comprasVisiveis} compra{comprasVisiveis === 1 ? "" : "s"}{sufixo && ` ${sufixo}`}
          </div>
          {/* A legenda usa a mesma tag da tabela: se a cor mudar, muda nos dois.
              Só na Config: na aba do colaborador a tela é a lista de ligações do
              dia inteiro, e a cor se explica sozinha depois da primeira vez. */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", color: "#64748b", fontSize: 14, marginBottom: 10 }}>
            {tagDias(1)} um dia sem comprar · {tagDias(2)} dois dias ou mais — hora de ligar
          </div>
        </>
      )}
      {/* A Config é estreita: a tabela rola em vez de espremer as colunas. */}
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: 620, borderCollapse: "collapse", fontSize: 15 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #cbd5e1" }}>
            {colunas.map(([chave, rotulo, inicial = 1, doPeriodo]) => (
              <th key={chave} style={th} title="Ordenar"
                onClick={() => setOrdem([chave, col === chave ? -dir : inicial])}>
                {/* O título diz de que período é o número, senão "Total gasto"
                    mentiria quando o dono estivesse olhando só a semana. */}
                {rotulo}{doPeriodo && sufixo ? ` ${sufixo}` : ""}
                {col === chave ? (dir === 1 ? " ▲" : " ▼") : ""}
              </th>
            ))}
            {dono && <th style={{ padding: 8 }} />}
          </tr>
        </thead>
        <tbody>
          {visiveis.map((c) => (
            editando?.id === c.id ? (
              <tr key={c.id} style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <td style={{ padding: 6 }}>
                  <input style={{ ...inp, width: 70 }} aria-label="Código do cliente" value={editando.codigo}
                    onChange={(e) => setEditando({ ...editando, codigo: e.target.value })} />
                </td>
                <td style={{ padding: 6 }}>
                  <input style={{ ...inp, width: "100%" }} aria-label="Nome do cliente" value={editando.nome}
                    onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />
                </td>
                {/* cobre tudo entre o nome e os botões: contato, total (só do
                    dono), compras, última compra e dias */}
                <td style={{ padding: 6 }} colSpan={colunas.length - 2}>
                  <input style={{ ...inp, width: "100%", maxWidth: 220 }} aria-label="Contato do cliente" placeholder="telefone ou email"
                    value={editando.contato} onChange={(e) => setEditando({ ...editando, contato: e.target.value })} />
                </td>
                <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                  <button style={{ ...btn, background: "#22c55e", color: "white", marginRight: 6 }} onClick={salvar}>Salvar</button>
                  <button style={{ ...btn, background: "#e2e8f0" }} onClick={() => setEditando(null)}>Cancelar</button>
                </td>
              </tr>
            ) : (
              <tr key={c.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: 8, fontFamily: "monospace", color: "#64748b" }}>{c.codigo}</td>
                <td style={{ padding: 8 }}>
                  <button onClick={() => abrir(c)} title="Ver histórico de compras"
                    style={{ border: "none", background: "none", padding: 0, font: "inherit", fontWeight: "bold", color: "#0369a1", cursor: "pointer" }}>
                    {c.nome}
                  </button>
                </td>
                {/* nowrap: telefone quebrado em duas linhas obriga a remontar o
                    número na cabeça na hora de discar. */}
                <td style={{ padding: 8, whiteSpace: "nowrap", color: c.contato ? undefined : "#94a3b8" }}>
                  {c.contato || "—"}
                </td>
                {dono && <td style={{ padding: 8, fontWeight: "bold" }}>{fmtReais(c.total)}</td>}
                <td style={{ padding: 8 }}>{c.compras}</td>
                <td style={{ padding: 8, color: "#64748b" }}>{dataBR(c.ultima)}</td>
                <td style={{ padding: 8 }}>{tagDias(c.dias)}</td>
                {dono && (
                  <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button style={{ ...btn, background: "#e2e8f0", marginRight: 6 }} aria-label={`Editar ${c.nome}`}
                      onClick={() => setEditando({ id: c.id, codigo: c.codigo, nome: c.nome, contato: c.contato })}>
                      Editar
                    </button>
                    <button style={{ ...btn, background: "#fee2e2", color: "#dc2626" }} aria-label={`Excluir ${c.nome}`}
                      onClick={() => excluir(c)}>
                      Excluir
                    </button>
                  </td>
                )}
              </tr>
            )
          ))}
          {visiveis.length === 0 && (
            <tr><td colSpan={colunas.length + (dono ? 1 : 0)} style={{ padding: 16, color: "#64748b" }}>
              Nenhum cliente {filtro ? "encontrado" : "cadastrado"}. O cadastro nasce sozinho quando você põe o nome numa venda.
            </td></tr>
          )}
        </tbody>
      </table>
      </div>

      <h4 style={{ margin: "20px 0 8px" }}>Compras de hoje</h4>
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: 620, borderCollapse: "collapse", fontSize: 15 }}>
        <tbody>
          {pedidosDoDia.map(([pid, itens]) => (
            <tr key={pid} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: 8, color: "#64748b", whiteSpace: "nowrap" }}>{itens[0].criado_em.slice(11, 16)}</td>
              <td style={{ padding: 8, fontWeight: "bold", color: itens[0].cliente_nome ? undefined : "#94a3b8" }}>
                {itens[0].cliente_nome
                  ? `${itens[0].cliente_codigo} — ${itens[0].cliente_nome}`
                  : itens[0].cliente || "sem cliente"}
              </td>
              <td style={{ padding: 8 }}>{itens.map((v) => `${v.quantidade}x ${v.nome} ${v.modelo}`.trim()).join(", ")}</td>
              <td style={{ padding: 8, fontWeight: "bold" }}>{fmtReais(totalPedido(itens))}</td>
              <td style={{ padding: 8 }}>{rotuloForma(itens[0].forma_pagamento)}</td>
            </tr>
          ))}
          {pedidosDoDia.length === 0 && (
            <tr><td style={{ padding: 16, color: "#64748b" }}>Nenhuma venda hoje.</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
