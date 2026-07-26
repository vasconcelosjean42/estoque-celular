import React, { useState } from "react";
import { fmtReais, parseReais, gerarCodigo } from "./Estoque.jsx";

// Cabeçalho aceito em qualquer ordem e sem acento/caixa certa. O fornecedor
// escreve "Nome do produto" onde a gente chama de Modelo.
const semAcento = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const COLUNAS = {
  tipo: ["tipo"],
  modelo: ["modelo", "nome do produto", "produto", "nome"],
  qtd: ["qtd", "quantidade"],
  compra: ["preco de compra", "compra", "custo"],
  venda: ["preco de venda", "venda"],
  codigo: ["codigo"],
  status: ["status"],
};

// C/A e COM ARO são a mesma coisa e o fornecedor usa as duas no mesmo arquivo.
export const normModelo = (s) =>
  String(s || "").toUpperCase().replace(/C\/A/g, "COM ARO").replace(/\s+/g, " ").trim();
const chave = (tipo, modelo) => `${normModelo(tipo)}|${normModelo(modelo)}`;

// Acha a linha do cabeçalho: o pedido do fornecedor tem título e instrução antes.
export const acharCabecalho = (linhas) => {
  for (let i = 0; i < Math.min(linhas.length, 20); i++) {
    const cels = (linhas[i] || []).map(semAcento);
    const achou = {};
    for (const [campo, nomes] of Object.entries(COLUNAS)) {
      const j = cels.findIndex((c) => nomes.includes(c));
      if (j >= 0) achou[campo] = j;
    }
    if (achou.modelo !== undefined && achou.qtd !== undefined) return { linha: i, cols: achou };
  }
  return null;
};

const numero = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  return /,/.test(s) ? parseReais(s) / 100 : Number(s.replace(/\s/g, ""));
};

// Transforma a planilha crua nas linhas da revisão, já classificadas.
export const analisar = (linhas, pecas) => {
  const cab = acharCabecalho(linhas);
  if (!cab) return { erro: "Não achei as colunas. O mínimo é Tipo, Modelo, Qtd e Preço de compra." };
  const { cols } = cab;
  const porCodigo = new Map(pecas.filter((p) => p.codigo).map((p) => [p.codigo.toUpperCase(), p]));
  const porNome = new Map(pecas.map((p) => [chave(p.nome, p.modelo), p]));

  const itens = [];
  const agrupadas = new Map(); // linha repetida na própria planilha soma quantidade
  let ignorados = 0;

  for (let i = cab.linha + 1; i < linhas.length; i++) {
    const cel = (c) => (cols[c] === undefined ? "" : String(linhas[i][cols[c]] ?? "").trim());
    const modelo = cel("modelo");
    if (!modelo) continue;
    if (semAcento(cel("status")) === "cancelado") { ignorados++; continue; }

    const tipo = cel("tipo");
    const qtd = numero(cel("qtd"));
    const compra = numero(cel("compra"));
    const venda = cel("venda") ? numero(cel("venda")) : null;
    const codigo = cel("codigo").toUpperCase();

    const k = `${codigo}##${chave(tipo, modelo)}`;
    if (agrupadas.has(k)) { agrupadas.get(k).qtd += qtd; agrupadas.get(k).repetida = true; continue; }

    const alvo = (codigo && porCodigo.get(codigo)) || porNome.get(chave(tipo, modelo)) || null;
    const pendencias = [];
    if (!tipo) pendencias.push("sem Tipo");
    if (!(qtd > 0) || !Number.isInteger(qtd)) pendencias.push("quantidade inválida");
    if (!(compra >= 0)) pendencias.push("preço de compra inválido");
    if (!alvo && venda === null) pendencias.push("produto novo sem preço de venda");

    const item = {
      linha: i + 1, tipo, modelo, qtd, compra, venda, codigo,
      alvo, pendencias, repetida: false,
      // preço divergente é decisão dele: começa mantendo o que já está no sistema
      atualizarPreco: false,
    };
    agrupadas.set(k, item);
    itens.push(item);
  }

  // Códigos dos novos: precisa simular a geração pra mostrar antes de gravar.
  const simuladas = pecas.map((p) => ({ nome: p.nome, codigo: p.codigo }));
  itens.forEach((it) => {
    if (it.alvo || it.pendencias.length) return;
    it.codigoNovo = gerarCodigo(it.tipo, simuladas);
    simuladas.push({ nome: it.tipo, codigo: it.codigoNovo });
  });

  const grupo = (it) => {
    if (it.pendencias.length) return "pendente";
    if (!it.alvo) return "novo";
    if (it.venda !== null && Math.round(it.venda * 100) !== it.alvo.preco_venda) return "divergente";
    return "soma";
  };
  itens.forEach((it) => (it.grupo = grupo(it)));
  const ordem = { divergente: 0, pendente: 1, novo: 2, soma: 3 };
  itens.sort((a, b) => ordem[a.grupo] - ordem[b.grupo] || a.linha - b.linha);
  return { itens, ignorados };
};

// Passa pelo mesmo caminho do "+ Entrada" do passo 6b: entrada gravada e custo
// médio ponderado recalculado. Somar estoque por fora furaria o histórico de
// compra e desalinharia o custo de todo produto importado.
export const gravarImportacao = async (itens, arquivo) => {
  const obs = `importação ${arquivo}`.slice(0, 120);
  const comandos = [];
  for (const it of itens) {
    const compra = Math.round(it.compra * 100);
    const venda = it.venda === null || it.venda === undefined ? null : Math.round(it.venda * 100);
    if (it.alvo) {
      const p = it.alvo;
      const qtdAtual = Math.max(p.quantidade, 0);
      const custoMedio = Math.round((qtdAtual * p.preco_compra + it.qtd * compra) / (qtdAtual + it.qtd));
      const trocaPreco = it.atualizarPreco && venda !== null;
      comandos.push([
        `UPDATE pecas SET quantidade = quantidade + ?, preco_compra = ?${trocaPreco ? ", preco_venda = ?" : ""} WHERE id = ?`,
        trocaPreco ? [it.qtd, custoMedio, venda, p.id] : [it.qtd, custoMedio, p.id],
      ]);
      // custo_anterior preenchido: é o que faz o "desfazer entrada" reverter exato.
      comandos.push(["INSERT INTO entradas (peca_id, quantidade, preco_compra, observacao, custo_anterior) VALUES (?,?,?,?,?)",
        [p.id, it.qtd, compra, obs, p.preco_compra]]);
    } else {
      comandos.push(["INSERT INTO pecas (nome, modelo, codigo, quantidade, preco_compra, preco_venda) VALUES (?,?,?,?,?,?)",
        [it.tipo, it.modelo, it.codigoNovo, it.qtd, compra, venda ?? 0]]);
      // last_insert_rowid() é o da peça acima: os dois comandos andam colados.
      comandos.push(["INSERT INTO entradas (peca_id, quantidade, preco_compra, observacao) VALUES (last_insert_rowid(),?,?,?)",
        [it.qtd, compra, obs]]);
    }
  }
  await window.api.tx(comandos);
};

const btn = { padding: "10px 18px", fontSize: 15, fontWeight: "bold", border: "none", borderRadius: 8, cursor: "pointer" };
const btnMini = { ...btn, padding: "4px 10px", fontSize: 13 };

const CABECALHOS = {
  divergente: ["Preço diferente do cadastrado", "#fef3c7", "#b45309"],
  pendente: ["Faltando informação — não vão entrar", "#fee2e2", "#dc2626"],
  novo: ["Produtos novos", "#dcfce7", "#16a34a"],
  soma: ["Só somam estoque", "#f1f5f9", "#334155"],
};

export default function Importacao({ pecas, aoFechar, aoImportar }) {
  const [analise, setAnalise] = useState(null);
  const [arquivo, setArquivo] = useState("");
  const [itens, setItens] = useState([]);
  const [gravando, setGravando] = useState(false);

  const escolher = async () => {
    const r = await window.api.abrirPlanilha();
    if (!r) return;
    if (r.erro) { alert(`Não consegui ler a planilha:\n\n${r.erro}`); return; }
    const a = analisar(r.linhas, pecas);
    if (a.erro) { alert(a.erro); return; }
    setArquivo(r.nome);
    setAnalise(a);
    setItens(a.itens);
  };

  const mudar = (linha, campo, valor) =>
    setItens(itens.map((it) => (it.linha === linha ? { ...it, [campo]: valor } : it)));

  const conta = (g) => itens.filter((it) => it.grupo === g).length;
  const entram = itens.filter((it) => it.grupo !== "pendente");

  const confirmar = async () => {
    setGravando(true);
    try {
      await aoImportar(entram, arquivo);
      aoFechar();
    } finally {
      setGravando(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
      <div style={{ background: "white", borderRadius: 12, padding: 20, width: "min(980px, 94vw)", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <h3 style={{ margin: "0 0 8px" }}>Importar produtos</h3>

        {!analise ? (
          <>
            <p style={{ color: "#475569", fontSize: 15, marginTop: 0 }}>
              A planilha precisa ter as colunas <strong>Tipo</strong>, <strong>Modelo</strong>,{" "}
              <strong>Qtd</strong> e <strong>Preço de compra</strong>. Preço de venda e Código são
              opcionais, e colunas a mais são ignoradas. Aceita .xlsx e .csv.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...btn, background: "#38bdf8", color: "#0f172a" }} onClick={escolher}>
                Escolher planilha…
              </button>
              <button style={{ ...btn, background: "#e2e8f0" }} onClick={aoFechar}>Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, color: "#475569", marginBottom: 8 }}>
              <strong>{arquivo}</strong> — nada é gravado até você confirmar.
            </div>
            <div style={{ flex: 1, overflow: "auto", minHeight: 0, border: "1px solid #e2e8f0", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <tbody>
                  {["divergente", "pendente", "novo", "soma"].map((g) => {
                    const doGrupo = itens.filter((it) => it.grupo === g);
                    if (!doGrupo.length) return null;
                    const [rotulo, fundo, cor] = CABECALHOS[g];
                    return (
                      <React.Fragment key={g}>
                        <tr style={{ background: fundo }}>
                          <td colSpan={5} style={{ padding: "6px 10px", fontWeight: "bold", color: cor }}>
                            {rotulo} ({doGrupo.length})
                            {g === "divergente" && (
                              <>
                                <button style={{ ...btnMini, background: "white", marginLeft: 10 }}
                                  onClick={() => setItens(itens.map((it) => (it.grupo === "divergente" ? { ...it, atualizarPreco: true } : it)))}>
                                  atualizar todos
                                </button>
                                <button style={{ ...btnMini, background: "white", marginLeft: 6 }}
                                  onClick={() => setItens(itens.map((it) => (it.grupo === "divergente" ? { ...it, atualizarPreco: false } : it)))}>
                                  manter todos
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                        {doGrupo.map((it) => (
                          <tr key={it.linha} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "4px 10px", color: "#94a3b8", whiteSpace: "nowrap" }}>L{it.linha}</td>
                            <td style={{ padding: "4px 10px" }}>
                              <strong>{it.tipo}</strong> {it.modelo}
                              {it.repetida && <span style={{ color: "#b45309" }}> (linha repetida, somada)</span>}
                            </td>
                            <td style={{ padding: "4px 10px", whiteSpace: "nowrap" }}>
                              {it.alvo
                                ? <>{it.alvo.quantidade} <span style={{ color: "#16a34a" }}>+{it.qtd}</span></>
                                : <>{it.qtd} un</>}
                            </td>
                            <td style={{ padding: "4px 10px", color: "#64748b", whiteSpace: "nowrap" }}>
                              {it.alvo ? it.alvo.codigo : it.codigoNovo || "—"}
                            </td>
                            <td style={{ padding: "4px 10px", whiteSpace: "nowrap" }}>
                              {it.grupo === "pendente" && <span style={{ color: "#dc2626" }}>{it.pendencias.join(", ")}</span>}
                              {it.grupo === "divergente" && (
                                <>
                                  {fmtReais(it.alvo.preco_venda)} → {fmtReais(Math.round(it.venda * 100))}
                                  <button style={{ ...btnMini, marginLeft: 8, background: it.atualizarPreco ? "#22c55e" : "#e2e8f0", color: it.atualizarPreco ? "white" : "#334155" }}
                                    onClick={() => mudar(it.linha, "atualizarPreco", !it.atualizarPreco)}>
                                    {it.atualizarPreco ? "atualizar" : "manter"}
                                  </button>
                                </>
                              )}
                              {it.grupo === "novo" && <span style={{ color: "#64748b" }}>{fmtReais(Math.round((it.venda ?? 0) * 100))}</span>}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15 }}>
                <strong>{conta("novo")}</strong> novos • <strong>{conta("soma") + conta("divergente")}</strong> somam estoque
                {conta("pendente") > 0 && <> • <strong style={{ color: "#dc2626" }}>{conta("pendente")}</strong> ficam de fora</>}
                {analise.ignorados > 0 && <> • {analise.ignorados} cancelados</>}
              </span>
              <button aria-label="Confirmar importação"
                style={{ ...btn, background: "#22c55e", color: "white", marginLeft: "auto" }}
                disabled={!entram.length || gravando} onClick={confirmar}>
                {gravando ? "Importando…" : `Importar ${entram.length} ${entram.length === 1 ? "produto" : "produtos"}`}
              </button>
              <button style={{ ...btn, background: "#e2e8f0" }} onClick={aoFechar}>Cancelar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
