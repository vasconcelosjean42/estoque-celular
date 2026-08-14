import React, { useEffect, useState } from "react";
import Clientes from "./Clientes.jsx";
import { fmtReais } from "./Estoque.jsx";
import Importacao, { gravarImportacao } from "./Importacao.jsx";
import NOVIDADES from "../novidades.js";

export const lerConfig = async () => {
  const linhas = await window.api.query("SELECT chave, valor FROM config");
  return Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
};

export const salvarConfig = (chave, valor) =>
  window.api.query("INSERT OR REPLACE INTO config (chave, valor) VALUES (?,?)", [chave, valor]);

// Máscara de telefone BR: (99) 99999-9999 (celular) ou (99) 9999-9999 (fixo).
const mascaraTelefone = (str) => {
  const d = String(str).replace(/\D/g, "").slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

const bloco = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, marginBottom: 16 };
const btn = { padding: "10px 18px", fontSize: 15, fontWeight: "bold", border: "none", borderRadius: 8, cursor: "pointer", background: "#38bdf8", color: "#0f172a" };

// Vitrine de clientes: nome + contato. O POOL repete o índice de quem volta
// sempre, então a tela de Clientes nasce com cliente fiel, cliente de duas
// compras e cliente de uma só — que é o que o dono quer ver ali.
const NOMES_DEMO = [
  ["Ana Paula Ribeiro", "(84) 99812-4471"], ["Carlos Eduardo Lima", "(84) 99634-2280"],
  ["Marina Souza", "(84) 98871-9053"], ["Rodrigo Alves", "(84) 99145-6612"],
  ["Juliana Castro", "(84) 99908-3374"], ["Fernando Bezerra", "(84) 98450-7719"],
  ["Patrícia Nunes", "(84) 99327-8865"], ["Thiago Moreira", "(84) 99781-2043"],
  ["Camila Duarte", "(84) 98693-5518"], ["Marcelo Pinto", "(84) 99562-0937"],
  ["Bianca Ferreira", "(84) 99204-6688"], ["Célula Assistência Técnica", "(84) 3211-7788"],
];
const POOL_DEMO = [
  ...[0, 1, 2].flatMap((i) => Array(8).fill(i)),   // fiéis: aparecem toda semana
  ...[3, 4, 5, 6].flatMap((i) => Array(3).fill(i)), // habituais
  7, 8, 9, 10, 11,                                  // compraram uma vez
];

const isoDataHora = (msAtras, hora) => {
  const dt = new Date(Date.now() - msAtras);
  dt.setHours(hora, Math.floor(Math.random() * 60), 0);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}:00`;
};

export default function Config({ aoMudar }) {
  const [cfg, setCfg] = useState(null);
  const [msgBackup, setMsgBackup] = useState("");
  const [dev, setDev] = useState(null); // null | "pin" | "aberto"
  const [pin, setPin] = useState("");
  const [usuarios, setUsuarios] = useState([]);
  const [novoUsuario, setNovoUsuario] = useState(null); // { nome, pin, papel }
  const [importando, setImportando] = useState(false);
  const [pecasImport, setPecasImport] = useState([]); // estoque atual, p/ casar na importação
  const [appInfo, setAppInfo] = useState(null); // { versao, empacotado }
  const [upd, setUpd] = useState(null); // status do update vindo do main

  const carregarUsuarios = () =>
    window.api.query("SELECT * FROM usuarios ORDER BY papel DESC, nome").then(setUsuarios);

  useEffect(() => {
    lerConfig().then(setCfg);
    carregarUsuarios();
    window.api.appInfo?.().then(setAppInfo);
    window.api.onUpdateStatus?.(setUpd);
  }, []);

  if (!cfg) return null;

  const gravar = async (chave, valor) => {
    await salvarConfig(chave, valor);
    setCfg({ ...cfg, [chave]: valor });
    aoMudar();
  };

  const backupAgora = async () => {
    setMsgBackup("Fazendo backup…");
    const r = await window.api.backupAgora();
    setMsgBackup(r.ok ? `✔ Backup salvo em ${r.destino}` : `✖ ${r.erro}`);
  };

  const verificarUpdate = async () => {
    setUpd({ estado: "checando" });
    const r = await window.api.checkUpdate?.();
    if (r?.erro) setUpd({ estado: "erro", msg: r.erro });
  };

  const textoUpdate = (u) => {
    if (!u) return "";
    if (u.estado === "checando") return "Verificando…";
    if (u.estado === "baixando") return `Baixando atualização${u.pct != null ? ` ${u.pct}%` : ""}…`;
    if (u.estado === "atual") return "✔ Você já está na versão mais recente.";
    if (u.estado === "pronto") return `✔ Versão ${u.versao} baixada. Clique para instalar.`;
    if (u.estado === "erro") return `✖ ${u.msg}`;
    return "";
  };

  const salvarPinUsuario = async (u, valor) => {
    const p = valor.replace(/\D/g, "").slice(0, 4);
    setUsuarios(usuarios.map((x) => (x.id === u.id ? { ...x, pin: p } : x)));
    if (/^\d{4}$/.test(p)) await window.api.query("UPDATE usuarios SET pin = ? WHERE id = ?", [p, u.id]);
  };

  // Cabeçalho igual ao que a importação espera; as 3 linhas são só pra ele ver
  // o formato. O arquivo do estoque leva a coluna Código na frente.
  const baixarModelo = () =>
    window.api.salvarPlanilha("modelo-importacao.xlsx", [
      ["Tipo", "Modelo", "Qtd", "Preço de compra", "Preço de venda"],
      ["Tela", "A01 C/A DIAMONDS", 20, 55, 65],
      ["Tela", "A02 / A12 / A32 5G DIAMONDS", 32, 43, 55],
      ["Bateria", "iPhone 11", 10, 38, 90],
    ]);

  const baixarEstoque = async () => {
    const pecas = await window.api.query(
      "SELECT codigo, nome, modelo, quantidade, preco_compra, preco_venda FROM pecas WHERE arquivado = 0 ORDER BY nome, modelo"
    );
    const hoje = new Date();
    const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    await window.api.salvarPlanilha(`estoque-${dia}.xlsx`, [
      ["Código", "Tipo", "Modelo", "Qtd", "Preço de compra", "Preço de venda"],
      ...pecas.map((p) => [p.codigo, p.nome, p.modelo, p.quantidade, p.preco_compra / 100, p.preco_venda / 100]),
    ]);
  };

  // É o PIN de permissão que identifica quem liberou o desconto, então repetido
  // não pode: dois administradores com o mesmo PIN apagam o rastro.
  const salvarPinPermissao = async (u, valor) => {
    const p = valor.replace(/\D/g, "").slice(0, 4);
    setUsuarios(usuarios.map((x) => (x.id === u.id ? { ...x, pin_permissao: p } : x)));
    if (!/^\d{4}$/.test(p)) return;
    const [dono] = await window.api.query(
      "SELECT nome FROM usuarios WHERE pin_permissao = ? AND id != ?", [p, u.id]);
    if (dono) {
      alert(`O PIN de permissão ${p} já é de ${dono.nome}. Escolha outro.`);
      carregarUsuarios();
      return;
    }
    await window.api.query("UPDATE usuarios SET pin_permissao = ? WHERE id = ?", [p, u.id]);
  };

  const removerUsuario = async (u) => {
    if (u.papel === "dono" && usuarios.filter((x) => x.papel === "dono").length === 1) {
      alert("Precisa existir pelo menos um administrador.");
      return;
    }
    if (!confirm(`Tem certeza que quer excluir o usuário "${u.nome}"?`)) return;
    // As vendas dele continuam no histórico, só perdem o nome do vendedor —
    // sem isto a FK barraria a exclusão de quem já vendeu. desconto_por aponta
    // pra usuarios do mesmo jeito: quem já autorizou desconto também tem que sair.
    await window.api.tx([
      ["UPDATE vendas SET usuario_id = NULL WHERE usuario_id = ?", [u.id]],
      ["UPDATE vendas SET desconto_por = NULL WHERE desconto_por = ?", [u.id]],
      ["DELETE FROM usuarios WHERE id = ?", [u.id]],
    ]);
    carregarUsuarios();
  };

  const adicionarUsuario = async () => {
    if (!novoUsuario.nome.trim() || !/^\d{4}$/.test(novoUsuario.pin)) {
      alert("Preencha nome e PIN de 4 dígitos.");
      return;
    }
    await window.api.query("INSERT INTO usuarios (nome, pin, papel) VALUES (?,?,?)",
      [novoUsuario.nome.trim(), novoUsuario.pin, novoUsuario.papel]);
    setNovoUsuario(null);
    carregarUsuarios();
  };

  const demoAtiva = !!cfg?.demo_ids;

  // Loja fictícia de 4 meses: carrinho, cliente que volta, pagamento dividido,
  // desconto autorizado, nota emitida, troca de todo tipo e lote fechado com o
  // fornecedor. É a tela de vendas do sistema inteiro — tudo que ele faz tem que
  // aparecer aqui. IMPORTANTE: cada tabela nova gravada aqui entra em `ids` e no
  // desativarDemo, senão fica lixo (ou FK quebrada) quando o cliente desligar.
  const ativarDemo = async () => {
    const rnd = (n) => Math.floor(Math.random() * n);
    const um = (l) => l[rnd(l.length)];
    const ids = { pecas: [], vendas: [], entradas: [], trocas: [], lotes: [], creditos: [], clientes: [], notas: [], perdas: [] };

    // 8 tipos × 5 modelos = 40 produtos (o caso 39 do test/p0.js conta esses 40)
    const tipos = [
      ["Tela", 22000, 42000], ["Bateria", 7000, 16000], ["Conector de carga", 1200, 4500],
      ["Câmera traseira", 9000, 22000], ["Alto-falante", 2500, 8000], ["Tampa traseira", 4500, 12000],
      ["Capinha", 500, 2500], ["Película 3D", 300, 1500],
    ];
    const modelos = ["iPhone 11", "iPhone 13", "Galaxy S22", "Galaxy A32", "Moto G52"];
    const produtos = tipos.flatMap(([tipo, compraBase, vendaBase]) =>
      modelos.map((modelo, m) => {
        const fator = 1 + (m % 3) * 0.15; // varia preço por modelo
        return { nome: tipo, modelo, qtd: rnd(25), // alguns caem no alerta de mínimo
          compra: Math.round(compraBase * fator), venda: Math.round(vendaBase * fator) };
      })
    );
    // Um em cada cinco sai com código de barras, pra pistola ter o que bipar na demo.
    (await window.api.tx(produtos.map((p, i) => [
      "INSERT INTO pecas (nome, modelo, quantidade, preco_compra, preco_venda, estoque_minimo, codigo_barras) VALUES (?,?,?,?,?,?,?)",
      [p.nome, p.modelo, p.qtd, p.compra, p.venda, 3, i % 5 === 0 ? `789${1000000000 + i}` : ""],
    ]))).forEach((r, i) => {
      produtos[i].id = r.lastInsertRowid;
      ids.pecas.push(r.lastInsertRowid);
    });

    const clientes = NOMES_DEMO.map(([nome, contato]) => ({ nome, contato }));
    const [{ n: baseCli }] = await window.api.query(
      "SELECT COALESCE(MAX(CAST(substr(codigo,2) AS INTEGER)),0)+1 AS n FROM clientes WHERE codigo GLOB 'C[0-9]*'");
    (await window.api.tx(clientes.map((c, i) => [
      "INSERT INTO clientes (codigo, nome, contato, criado_em) VALUES (?,?,?,?)",
      [`C${String(baseCli + i).padStart(3, "0")}`, c.nome, c.contato, isoDataHora((115 - i * 8) * 86400000, 10)],
    ]))).forEach((r, i) => {
      clientes[i].id = r.lastInsertRowid;
      ids.clientes.push(r.lastInsertRowid);
    });

    // Quem vendeu: o administrador que já existe. Também é ele que autoriza os
    // descontos — sem isso a etiqueta de desconto ficaria sem dono na tela.
    const [dono] = await window.api.query("SELECT id FROM usuarios WHERE papel = 'dono' ORDER BY id LIMIT 1");
    const formas = ["especie", "pix", "debito", "credito_avista", "credito_parcelado"];
    const [{ n: basePedido }] = await window.api.query("SELECT COALESCE(MAX(pedido_id),0)+1 AS n FROM vendas");
    const [{ n: baseNota }] = await window.api.query("SELECT COALESCE(MAX(numero),0)+1 AS n FROM notas");
    let pedidoId = basePedido, numeroNota = baseNota;
    const cmdVendas = [], linhas = [], cmdPagamentos = [], cmdNotas = [];

    for (let d = 120; d >= 0; d--) {
      const doDia = 1 + rnd(5);
      for (let i = 0; i < doDia; i++) {
        // Hora crescente dentro do dia: as telas listam por id, então venda das
        // 16h gravada antes da de 13h apareceria fora de ordem no mesmo dia.
        const quando = isoDataHora(d * 86400000, 9 + i * 2);
        // Carrinho: a maioria leva uma peça só, mas tem quem leve 2 ou 3.
        const itens = [];
        const alvo = Math.random() < 0.62 ? 1 : Math.random() < 0.75 ? 2 : 3;
        while (itens.length < alvo) {
          const p = produtos[rnd(produtos.length)];
          if (!itens.some((i) => i.p === p)) {
            itens.push({ p, qtd: p.venda < 3000 && Math.random() < 0.4 ? 1 + rnd(2) : 1 }); // acessório sai em par
          }
        }
        const cli = Math.random() < 0.7 ? clientes[um(POOL_DEMO)] : null; // resto é balcão, sem cadastro
        const mao = Math.random() < 0.35 ? um([3000, 5000, 8000]) : 0;
        const bruto = itens.reduce((s, i) => s + i.p.venda * i.qtd, 0) + mao;
        // Desconto em valor redondo, como o dono daria na mão.
        const desconto = Math.random() < 0.18 ? Math.round((bruto * um([5, 10, 15])) / 10000) * 100 : 0;
        const total = bruto - desconto;
        const dividido = Math.random() < 0.12;
        itens.forEach((it, i) => {
          linhas.push({ pedidoId, peca: it.p, preco: it.p.venda, dias: d, quando, cli });
          cmdVendas.push([
            `INSERT INTO vendas (peca_id, quantidade, preco_venda, preco_compra, mao_de_obra, forma_pagamento,
                                 cliente, cliente_id, usuario_id, pedido_id, desconto, desconto_por, criado_em)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            // Mão de obra e desconto são do pedido: só a primeira linha os carrega.
            [it.p.id, it.qtd, it.p.venda, it.p.compra, i === 0 ? mao : 0, dividido ? "dividido" : um(formas),
             cli?.nome ?? "", cli?.id ?? null, dono?.id ?? null, pedidoId,
             i === 0 ? desconto : 0, i === 0 && desconto ? dono?.id ?? null : null, quando],
          ]);
        });
        if (dividido) {
          // Entrada em espécie + resto no cartão/Pix; a soma tem que fechar o total.
          const entrada = Math.max(100, Math.round((total * 0.4) / 100) * 100);
          cmdPagamentos.push(
            ["INSERT INTO pagamentos (pedido_id, forma, valor, criado_em) VALUES (?,?,?,?)", [pedidoId, "especie", entrada, quando]],
            ["INSERT INTO pagamentos (pedido_id, forma, valor, criado_em) VALUES (?,?,?,?)",
              [pedidoId, um(["pix", "debito", "credito_parcelado"]), total - entrada, quando]]
          );
        }
        if (Math.random() < 0.4) { // nota é opcional na venda: só parte dos pedidos tem
          cmdNotas.push([
            "INSERT INTO notas (pedido_id, numero, cliente_nome, cliente_contato, descricao, valor_total, criado_em) VALUES (?,?,?,?,?,?,?)",
            [pedidoId, numeroNota++, cli?.nome ?? "", cli?.contato ?? "",
             itens.map((it) => `${it.qtd}x ${it.p.nome} ${it.p.modelo}`).join("\n") + (desconto ? `\nDesconto: -${fmtReais(desconto)}` : ""),
             total, quando],
          ]);
        }
        pedidoId++;
      }
    }
    (await window.api.tx(cmdVendas)).forEach((r, i) => {
      linhas[i].id = r.lastInsertRowid;
      ids.vendas.push(r.lastInsertRowid);
    });
    await window.api.tx(cmdPagamentos); // sem id: o desativar acha pelo pedido_id da venda
    (await window.api.tx(cmdNotas)).forEach((r) => ids.notas.push(r.lastInsertRowid));

    (await window.api.tx([
      ["INSERT INTO entradas (peca_id, quantidade, preco_compra, observacao, criado_em) VALUES (?,?,?,?,?)",
        [produtos[0].id, 8, 28000, "cadastro inicial", isoDataHora(110 * 86400000, 10)]],
      ["INSERT INTO entradas (peca_id, quantidade, preco_compra, observacao, criado_em) VALUES (?,?,?,?,?)",
        [produtos[35].id, 40, 300, "leva do mês", isoDataHora(45 * 86400000, 14)]],
      ["INSERT INTO entradas (peca_id, quantidade, preco_compra, observacao, criado_em) VALUES (?,?,?,?,?)",
        [produtos[5].id, 12, 7200, "fornecedor de SP", isoDataHora(30 * 86400000, 11)]],
      ["INSERT INTO entradas (peca_id, quantidade, preco_compra, observacao, criado_em) VALUES (?,?,?,?,?)",
        [produtos[12].id, 6, 23500, "reposição urgente", isoDataHora(12 * 86400000, 16)]],
      ["INSERT INTO entradas (peca_id, quantidade, preco_compra, observacao, criado_em) VALUES (?,?,?,?,?)",
        [produtos[30].id, 50, 520, "caixa de capinhas", isoDataHora(6 * 86400000, 9)]],
      ["INSERT INTO entradas (peca_id, quantidade, preco_compra, observacao, criado_em) VALUES (?,?,?,?,?)",
        [produtos[1].id, 4, 24000, "compra avulsa", isoDataHora(2 * 86400000, 15)]],
    ])).forEach((r) => ids.entradas.push(r.lastInsertRowid));

    // Lotes: um já resolvido pelo valor cheio do acerto, um resolvido item a item
    // (o fornecedor recusou uma peça) e um ainda na mão do fornecedor.
    const dias = (n) => `datetime('now','localtime','-${n} days')`;
    (await window.api.tx([
      [`INSERT INTO lotes (status, enviado_em, resolvido_em) VALUES ('resolvido', ${dias(75)}, ${dias(58)})`],
      [`INSERT INTO lotes (status, enviado_em, resolvido_em) VALUES ('resolvido', ${dias(40)}, ${dias(22)})`],
      [`INSERT INTO lotes (status, enviado_em) VALUES ('enviado', ${dias(11)})`],
    ])).forEach((r) => ids.lotes.push(r.lastInsertRowid));
    const [loteA, loteB, loteC] = ids.lotes;

    // A reposição é sempre do mesmo tipo e do preço mais próximo (tela por tela):
    // trocar uma tela por uma película daria uma diferença absurda na demo.
    const doTipo = (peca, mais) =>
      produtos.filter((p) => p.nome === peca.nome && (mais ? p.venda > peca.venda : p.venda < peca.venda))
        .sort((a, b) => (mais ? a.venda - b.venda : b.venda - a.venda))[0];
    // Trocas vindas do histórico de venda: o cliente volta com a peça que comprou.
    // Só serve a venda de um produto que TENHA reposição mais cara/mais barata.
    const daVenda = (tipo, deDias, ateDias, exige = () => true) =>
      linhas.find((l) => l.cli && l.peca.nome === tipo && l.dias <= deDias && l.dias >= ateDias && exige(l))
      || linhas.find((l) => l.cli && exige(l));
    const trocaVenda = daVenda("Tela", 50, 40);
    const trocaCara = daVenda("Bateria", 30, 20, (l) => doTipo(l.peca, true));
    const trocaBarata = daVenda("Tela", 20, 12, (l) => doTipo(l.peca, false));
    const trocaEstorno = daVenda("Capinha", 9, 3);
    const maisCara = doTipo(trocaCara.peca, true) || trocaCara.peca;
    const maisBarata = doTipo(trocaBarata.peca, false) || trocaBarata.peca;
    const trocasCmd = [
      // 1) mesmo modelo na hora, sem diferença — o caso mais comum da loja
      [`INSERT INTO trocas (modelo, defeito, observacao, valor_compra, fornecedor, peca_id, venda_id, nova_peca_id,
                            diferenca, nova_preco_compra, recebido_em, lote_id) VALUES (?,?,?,?,?,?,?,?,0,?,${dias(45)},?)`,
        [`${trocaVenda.peca.nome} ${trocaVenda.peca.modelo}`, "manchas na tela", `cliente ${trocaVenda.cli.nome}`,
         trocaVenda.peca.compra, "Distribuidora Norte", trocaVenda.peca.id, trocaVenda.id, trocaVenda.peca.id,
         trocaVenda.peca.compra, loteA]],
      // 2) trocou por peça melhor e pagou a diferença no Pix
      [`INSERT INTO trocas (modelo, defeito, observacao, valor_compra, fornecedor, peca_id, venda_id, nova_peca_id,
                            diferenca, forma_pagamento, nova_preco_compra, recebido_em, lote_id) VALUES (?,?,?,?,?,?,?,?,?,'pix',?,${dias(28)},?)`,
        [`${trocaCara.peca.nome} ${trocaCara.peca.modelo}`, "não segura carga", "levou a de qualidade melhor",
         trocaCara.peca.compra, "Distribuidora Norte", trocaCara.peca.id, trocaCara.id, maisCara.id,
         maisCara.venda - trocaCara.preco, maisCara.compra, loteB]],
      // 3) trocou por peça mais barata e recebeu a diferença de volta em espécie
      [`INSERT INTO trocas (modelo, defeito, observacao, valor_compra, fornecedor, peca_id, venda_id, nova_peca_id,
                            diferenca, forma_pagamento, nova_preco_compra, recebido_em, lote_id) VALUES (?,?,?,?,?,?,?,?,?,'especie',?,${dias(16)},?)`,
        [`${trocaBarata.peca.nome} ${trocaBarata.peca.modelo}`, "touch falhando", "aceitou a paralela e recebeu a diferença",
         trocaBarata.peca.compra, "Peças Já", trocaBarata.peca.id, trocaBarata.id, maisBarata.id,
         maisBarata.venda - trocaBarata.preco, maisBarata.compra, loteB]],
      // 4) devolveu funcionando: estorno no Pix e a peça volta pro estoque
      [`INSERT INTO trocas (modelo, defeito, observacao, valor_compra, peca_id, venda_id, defeituosa, estorno,
                            forma_pagamento, recebido_em) VALUES (?,'devolvida funcionando',?,?,?,?,0,?,'pix',${dias(5)})`,
        [`${trocaEstorno.peca.nome} ${trocaEstorno.peca.modelo}`, "não serviu no aparelho", trocaEstorno.peca.compra,
         trocaEstorno.peca.id, trocaEstorno.id, trocaEstorno.preco]],
      // 5-8) trazidas por terceiro, ainda na prateleira — uma já passou dos 40 dias
      [`INSERT INTO trocas (modelo, defeito, observacao, valor_compra, fornecedor, recebido_em) VALUES ('Tela Galaxy A32','listra verde','trouxe da assistência do bairro',24000,'Distribuidora Norte',${dias(47)})`],
      [`INSERT INTO trocas (modelo, defeito, observacao, valor_compra, fornecedor, recebido_em) VALUES ('Bateria Moto G52','estufou','cliente Marcelo',8500,'Peças Já',${dias(19)})`],
      [`INSERT INTO trocas (modelo, defeito, valor_compra, fornecedor, recebido_em) VALUES ('Conector de carga iPhone 11','não carrega',1400,'Peças Já',${dias(9)})`],
      [`INSERT INTO trocas (modelo, defeito, observacao, valor_compra, fornecedor, recebido_em) VALUES ('Câmera traseira Galaxy S22','foto tremida','chegou hoje',10500,'Distribuidora Norte',${dias(1)})`],
      // 9-10) no lote que ainda está com o fornecedor
      [`INSERT INTO trocas (modelo, defeito, valor_compra, fornecedor, recebido_em, lote_id) VALUES ('Tela iPhone 13','sombra no touch',28000,'Distribuidora Norte',${dias(20)},?)`, [loteC]],
      [`INSERT INTO trocas (modelo, defeito, valor_compra, fornecedor, recebido_em, lote_id) VALUES ('Alto-falante iPhone 11','som chiado',2800,'Distribuidora Norte',${dias(15)},?)`, [loteC]],
      // 11) a peça do lote B que o fornecedor recusou (vira perda logo abaixo)
      [`INSERT INTO trocas (modelo, defeito, observacao, valor_compra, fornecedor, recebido_em, lote_id) VALUES ('Tampa traseira Moto G52','trincada no canto','fornecedor não aceitou',5200,'Peças Já',${dias(35)},?)`, [loteB]],
      // 12-13) completam o lote A, o mais antigo, fechado pelo valor do acerto
      [`INSERT INTO trocas (modelo, defeito, valor_compra, fornecedor, recebido_em, lote_id, creditada) VALUES ('Tela iPhone 11','apagou do nada',24000,'Distribuidora Norte',${dias(80)},?,1)`, [loteA]],
      [`INSERT INTO trocas (modelo, defeito, valor_compra, fornecedor, recebido_em, lote_id, creditada) VALUES ('Bateria Galaxy S22','descarrega em 2h',9000,'Distribuidora Norte',${dias(78)},?,1)`, [loteA]],
    ];
    (await window.api.tx(trocasCmd)).forEach((r) => ids.trocas.push(r.lastInsertRowid));
    // Peça devolvida funcionando volta pro estoque (troca 4).
    await window.api.query("UPDATE pecas SET quantidade = quantidade + 1 WHERE id = ?", [trocaEstorno.peca.id]);
    const recusada = ids.trocas[10];

    // Crédito e perda do lote saem da soma das peças que ele leva — número
    // chutado aqui apareceria brigando com o total do lote na tela de Trocas.
    const valorA = trocaVenda.peca.compra + 24000 + 9000;
    const creditoA = Math.round((valorA * 0.8) / 100) * 100; // acerto no valor cheio: o fornecedor cortou 20%
    const valorB = trocaCara.peca.compra + trocaBarata.peca.compra + 5200;
    const creditoB = valorB - 5200; // item a item: só a tampa trincada ficou de fora
    await window.api.tx([
      ["UPDATE lotes SET modo = 'total', credito = ?, perda = ? WHERE id = ?", [creditoA, valorA - creditoA, loteA]],
      ["UPDATE lotes SET modo = 'itens', credito = ?, perda = 5200 WHERE id = ?", [creditoB, loteB]],
      ["UPDATE trocas SET creditada = 1 WHERE id IN (?,?)", [ids.trocas[1], ids.trocas[2]]],
    ]);

    (await window.api.tx([
      // Lote A fechado pelo valor total: a diferença virou uma perda só, sem dono.
      // O texto vem montado do JS: concatenar o id no SQL o imprime como "1.0".
      [`INSERT INTO perdas (valor, motivo, criado_em) VALUES (?, ?, ${dias(58)})`,
        [valorA - creditoA, `Lote #${loteA} — creditou ${fmtReais(creditoA)} de ${fmtReais(valorA)}`]],
      // Lote B fechado item a item: dá pra dizer QUAL peça o fornecedor recusou.
      [`INSERT INTO perdas (troca_id, valor, motivo, criado_em) VALUES (?, 5200, ?, ${dias(22)})`,
        [recusada, `Lote #${loteB} — fornecedor não aceitou`]],
      // Perda de bancada: peça quebrada no conserto, a preço de custo.
      [`INSERT INTO perdas (peca_id, valor, motivo, criado_em) VALUES (?, ?, 'quebrou na bancada', ${dias(26)})`,
        [produtos[2].id, produtos[2].compra]],
    ])).forEach((r) => ids.perdas.push(r.lastInsertRowid));

    (await window.api.tx([
      [`INSERT INTO creditos (valor, descricao, criado_em) VALUES (?,?, ${dias(58)})`, [creditoA, `Retorno do lote #${loteA}`]],
      [`INSERT INTO creditos (valor, descricao, criado_em) VALUES (?,?, ${dias(22)})`, [creditoB, `Retorno do lote #${loteB}`]],
      [`INSERT INTO creditos (valor, descricao, criado_em) VALUES (-10000,'Abatido na compra de películas', ${dias(18)})`],
      [`INSERT INTO creditos (valor, descricao, criado_em) VALUES (-25000,'Abatido em telas do iPhone 13', ${dias(7)})`],
    ])).forEach((r) => ids.creditos.push(r.lastInsertRowid));
    await salvarConfig("demo_ids", JSON.stringify(ids));
    location.reload();
  };

  const desativarDemo = async () => {
    try {
      const ids = JSON.parse(cfg.demo_ids);
      const em = (lista) => (lista || []).join(",") || "0";
      const p = em(ids.pecas);
      const vendasDemo = `SELECT id FROM vendas WHERE id IN (${em(ids.vendas)}) OR peca_id IN (${p})`;
      // Apaga o que é da demo e solta o que é real: registro do dono criado por
      // cima de produto fictício perde só a referência, não some.
      //
      // ATENÇÃO: toda FK nova que apontar para pecas/vendas/lotes tem que entrar
      // aqui, senão o desativar volta a morrer com "FOREIGN KEY constraint
      // failed". Coberto pelo caso 39 do test/p0.js.
      await window.api.tx([
        [`DELETE FROM notas WHERE id IN (${em(ids.notas)})`, []],
        [`UPDATE notas  SET venda_id = NULL WHERE venda_id IN (${vendasDemo})`, []],
        [`UPDATE trocas SET venda_id = NULL WHERE venda_id IN (${vendasDemo})`, []],
        // antes de vendas: sem a venda não dá mais pra achar o pedido dividido
        [`DELETE FROM pagamentos WHERE pedido_id IN (SELECT pedido_id FROM vendas WHERE id IN (${vendasDemo}))`, []],
        [`DELETE FROM vendas   WHERE id IN (${em(ids.vendas)})   OR peca_id IN (${p})`, []],
        [`DELETE FROM entradas WHERE id IN (${em(ids.entradas)}) OR peca_id IN (${p})`, []],
        [`UPDATE trocas SET peca_id = NULL      WHERE peca_id IN (${p})`, []],
        [`UPDATE trocas SET nova_peca_id = NULL WHERE nova_peca_id IN (${p})`, []],
        // perdas aponta pra trocas e pecas: some com a da demo e solta a real.
        [`DELETE FROM perdas WHERE id IN (${em(ids.perdas)}) OR troca_id IN (${em(ids.trocas)})`, []],
        [`UPDATE perdas SET peca_id = NULL WHERE peca_id IN (${p})`, []],
        [`DELETE FROM trocas WHERE id IN (${em(ids.trocas)})`, []],
        [`UPDATE trocas SET lote_id = NULL WHERE lote_id IN (${em(ids.lotes)})`, []],
        [`DELETE FROM lotes    WHERE id IN (${em(ids.lotes)})`, []],
        [`DELETE FROM creditos WHERE id IN (${em(ids.creditos)})`, []],
        // Cliente fictício sai, mas venda real feita no nome dele só perde o vínculo.
        [`UPDATE vendas SET cliente_id = NULL WHERE cliente_id IN (${em(ids.clientes)})`, []],
        [`DELETE FROM clientes WHERE id IN (${em(ids.clientes)})`, []],
        [`DELETE FROM pecas    WHERE id IN (${p})`, []],
        ["DELETE FROM config WHERE chave = 'demo_ids'", []],
      ]);
      location.reload();
    } catch (e) {
      alert(`Erro ao desativar: ${e.message}`);
    }
  };

  // Zera o banco: apaga TODOS os dados e volta ao estado de fábrica (Administrador/1234).
  const limparBanco = async () => {
    if (!confirm("APAGAR TODOS OS DADOS? Produtos, vendas, entradas, trocas, créditos, notas, usuários e configurações serão perdidos. Isto não tem como desfazer.")) return;
    if (!confirm("Tem certeza mesmo? O sistema volta ao estado de fábrica (login Administrador / PIN 1234).")) return;
    try {
      await window.api.tx([
        ["DELETE FROM notas", []],
        ["DELETE FROM creditos", []],
        ["DELETE FROM perdas", []], // antes de trocas e pecas: referencia as duas
        ["DELETE FROM trocas", []],
        ["DELETE FROM lotes", []],
        ["DELETE FROM entradas", []],
        ["DELETE FROM pagamentos", []],
        ["DELETE FROM vendas", []],
        ["DELETE FROM clientes", []], // depois de vendas: é ela que referencia o cliente
        ["DELETE FROM pecas", []],
        ["DELETE FROM usuarios", []],
        ["DELETE FROM config", []],
        ["INSERT INTO usuarios (nome, pin, papel) VALUES ('Administrador','1234','dono')", []],
      ]);
      location.reload();
    } catch (e) {
      alert(`Erro ao limpar: ${e.message}`);
    }
  };

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={bloco}>
        <h3 style={{ marginTop: 0 }}>Sobre / Atualização</h3>
        <div style={{ fontSize: 16, marginBottom: 10 }}>
          Versão instalada: <strong>{appInfo ? appInfo.versao : "…"}</strong>
        </div>
        {appInfo && !appInfo.empacotado ? (
          <div style={{ fontSize: 14, color: "#64748b" }}>
            Modo desenvolvimento — atualização automática só funciona no app instalado.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button style={btn} disabled={upd?.estado === "checando" || upd?.estado === "baixando"} onClick={verificarUpdate}>
                Verificar atualização
              </button>
              {upd?.estado === "pronto" && (
                <button style={{ ...btn, background: "#22c55e", color: "white" }} onClick={() => window.api.installUpdate()}>
                  Instalar e reiniciar
                </button>
              )}
            </div>
            {upd && <div style={{ marginTop: 8, fontSize: 15, color: upd.estado === "erro" ? "#dc2626" : "#334155" }}>{textoUpdate(upd)}</div>}
          </>
        )}

        {/* Board da ÚLTIMA atualização, e só dela. O app se atualiza sozinho, então
            é aqui que o cliente descobre o que mudou. Fechar guarda a versão vista;
            a próxima atualização ocupa o mesmo lugar — nunca duas empilhadas, mesmo
            que ele não tenha fechado a anterior. Fonte: src/novidades.js. */}
        {NOVIDADES[0] && cfg.novidades_vistas !== NOVIDADES[0].versao && (
          <div aria-label="Novidades da versão"
            style={{ marginTop: 16, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <strong style={{ fontSize: 16, color: "#0f172a" }}>
                ✨ Novidades da versão {NOVIDADES[0].versao}
              </strong>
              <span style={{ color: "#94a3b8", fontSize: 14 }}>{NOVIDADES[0].data}</span>
              <button aria-label="Fechar novidades" title="Fechar"
                onClick={() => gravar("novidades_vistas", NOVIDADES[0].versao)}
                style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", color: "#64748b", fontSize: 20, lineHeight: 1 }}>
                ✕
              </button>
            </div>
            <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 15, color: "#334155" }}>
              {NOVIDADES[0].itens.map((i) => <li key={i} style={{ marginBottom: 4 }}>{i}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div style={bloco}>
        <h3 style={{ marginTop: 0 }}>Título do sistema</h3>
        <input
          style={{ padding: 10, fontSize: 16, borderRadius: 6, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box" }}
          value={cfg.titulo ?? "Estoque Celular"}
          onChange={(e) => gravar("titulo", e.target.value)}
        />
      </div>

      <div style={bloco}>
        <h3 style={{ marginTop: 0 }}>Logo</h3>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {cfg.logo && <img src={cfg.logo} alt="logo" style={{ height: 48 }} />}
          <button style={btn} onClick={async () => {
            const logo = await window.api.escolherLogo();
            if (logo) gravar("logo", logo);
          }}>
            Escolher logo…
          </button>
          {cfg.logo && (
            <button style={{ ...btn, background: "#fee2e2", color: "#dc2626" }} onClick={() => gravar("logo", "")}>
              Remover
            </button>
          )}
        </div>
      </div>

      <div style={bloco}>
        <h3 style={{ marginTop: 0 }}>Mão de obra na venda</h3>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 16, cursor: "pointer" }}>
          <input
            type="checkbox"
            style={{ width: 22, height: 22 }}
            checked={cfg.mao_de_obra !== "0"}
            onChange={(e) => gravar("mao_de_obra", e.target.checked ? "1" : "0")}
          />
          Mostrar campo "Mão de obra" ao vender
        </label>
      </div>

      <div style={bloco}>
        <h3 style={{ marginTop: 0 }}>Iniciar com o Windows</h3>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 16, cursor: "pointer" }}>
          <input
            type="checkbox"
            style={{ width: 22, height: 22 }}
            checked={cfg.abrir_com_windows !== "0"}
            onChange={(e) => {
              gravar("abrir_com_windows", e.target.checked ? "1" : "0");
              window.api.autoStart(e.target.checked);
            }}
          />
          Abrir o sistema junto com o Windows (vale para o app instalado)
        </label>
      </div>

      <div style={bloco}>
        <h3 style={{ marginTop: 0 }}>Nota / recibo</h3>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 16, cursor: "pointer", marginBottom: 12 }}>
          <input
            type="checkbox"
            style={{ width: 22, height: 22 }}
            checked={cfg.nota_ativa === "1"}
            onChange={(e) => gravar("nota_ativa", e.target.checked ? "1" : "0")}
          />
          Gerar nota após a venda
        </label>
        {cfg.nota_ativa === "1" && (
          <>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 12 }}>
              Recibo não fiscal impresso após confirmar a venda. Usa o logo acima. Preencha os dados da loja:
            </div>
            {[["Nome na nota", "nota_loja_nome", "ex.: Xiaomi Centro"],
              ["Endereço", "nota_loja_endereco", "ex.: R. Getúlio Vargas, 186"],
              ["Telefone", "nota_loja_telefone", "ex.: (99) 98454-7874"],
              ["Email/contato", "nota_loja_email", "opcional"],
              ["Rodapé", "nota_rodape", "ex.: Obrigado pela preferência!"]].map(([rotulo, chave, ph]) => (
              <label key={chave} style={{ display: "block", marginBottom: 10 }}>
                <div style={{ fontWeight: "bold", marginBottom: 4, fontSize: 15 }}>{rotulo}</div>
                <input
                  style={{ padding: 10, fontSize: 16, borderRadius: 6, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box" }}
                  placeholder={ph}
                  inputMode={chave === "nota_loja_telefone" ? "numeric" : undefined}
                  value={cfg[chave] ?? ""}
                  onChange={(e) => gravar(chave, chave === "nota_loja_telefone" ? mascaraTelefone(e.target.value) : e.target.value)}
                />
              </label>
            ))}
          </>
        )}
      </div>

      <div style={bloco}>
        <h3 style={{ marginTop: 0 }}>Importação de produtos</h3>
        <div style={{ fontSize: 14, color: "#64748b", marginBottom: 10 }}>
          Cadastra e repõe estoque a partir de uma planilha. Produto que já existe soma
          estoque; produto novo é criado. Você revê item a item antes de gravar.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={{ ...btn, background: "#38bdf8", color: "#0f172a" }}
            onClick={async () => {
              setPecasImport(await window.api.query("SELECT * FROM pecas"));
              setImportando(true);
            }}>
            Importar planilha…
          </button>
          <button style={{ ...btn, background: "#e2e8f0", color: "#334155" }} onClick={baixarModelo}>
            Baixar planilha modelo
          </button>
          <button style={{ ...btn, background: "#e2e8f0", color: "#334155" }} onClick={baixarEstoque}>
            Baixar planilha do estoque
          </button>
        </div>
        <div style={{ fontSize: 14, color: "#64748b", marginTop: 10 }}>
          Use a <strong>planilha do estoque</strong> a partir da segunda importação: ela já vem
          com a coluna Código, e aí o produto certo é encontrado mesmo que você tenha renomeado
          ele aqui dentro.
        </div>
      </div>

      <div style={bloco}>
        <h3 style={{ marginTop: 0 }}>Clientes</h3>
        <div style={{ fontSize: 14, color: "#64748b", marginBottom: 10 }}>
          Clique no nome pra ver o que o cliente já comprou.
        </div>
        <Clientes />
      </div>

      <div style={bloco}>
        <h3 style={{ marginTop: 0 }}>Usuários</h3>
        {usuarios.map((u) => (
          <div key={u.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #e2e8f0", fontSize: 15 }}>
            <strong style={{ flex: 1 }}>{u.nome}</strong>
            <span style={{ color: "#64748b" }}>{u.papel === "dono" ? "administrador" : "colaborador"}</span>
            <span>PIN:</span>
            {/* onBlur: PIN incompleto não é salvo — recarregar evita a tela mostrar
                um PIN que não é o do banco (dono achava que tinha trocado e não trocou). */}
            <input value={u.pin} aria-label={`PIN de ${u.nome}`}
              onChange={(e) => salvarPinUsuario(u, e.target.value)} onBlur={carregarUsuarios}
              style={{ padding: 6, fontSize: 15, borderRadius: 6, border: "1px solid #cbd5e1", width: 64, textAlign: "center" }} />
            {/* Só administrador libera desconto, então só ele tem PIN de permissão. */}
            {u.papel === "dono" && (
              <>
                <span>Permissão:</span>
                <input value={u.pin_permissao || ""} aria-label={`PIN de permissão de ${u.nome}`} placeholder="—"
                  onChange={(e) => salvarPinPermissao(u, e.target.value)} onBlur={carregarUsuarios}
                  style={{ padding: 6, fontSize: 15, borderRadius: 6, border: "1px solid #cbd5e1", width: 64, textAlign: "center" }} />
              </>
            )}
            <button aria-label={`Remover ${u.nome}`} style={{ ...btn, padding: "6px 12px", fontSize: 14, background: "#fee2e2", color: "#dc2626" }} onClick={() => removerUsuario(u)}>
              Remover
            </button>
          </div>
        ))}
        {novoUsuario ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <input placeholder="Nome" autoFocus value={novoUsuario.nome}
              onChange={(e) => setNovoUsuario({ ...novoUsuario, nome: e.target.value })}
              style={{ padding: 8, fontSize: 15, borderRadius: 6, border: "1px solid #cbd5e1", flex: 1, minWidth: 120 }} />
            <input placeholder="PIN (4 dígitos)" inputMode="numeric" maxLength={4} value={novoUsuario.pin}
              onChange={(e) => setNovoUsuario({ ...novoUsuario, pin: e.target.value.replace(/\D/g, "") })}
              style={{ padding: 8, fontSize: 15, borderRadius: 6, border: "1px solid #cbd5e1", width: 110, textAlign: "center" }} />
            <select value={novoUsuario.papel} onChange={(e) => setNovoUsuario({ ...novoUsuario, papel: e.target.value })}
              style={{ padding: 8, fontSize: 15, borderRadius: 6, border: "1px solid #cbd5e1" }}>
              <option value="funcionario">colaborador</option>
              <option value="dono">administrador</option>
            </select>
            <button style={{ ...btn, background: "#22c55e", color: "white" }} onClick={adicionarUsuario}>Adicionar</button>
            <button style={{ ...btn, background: "#e2e8f0", color: "#334155" }} onClick={() => setNovoUsuario(null)}>Cancelar</button>
          </div>
        ) : (
          <button style={{ ...btn, marginTop: 12 }} onClick={() => setNovoUsuario({ nome: "", pin: "", papel: "funcionario" })}>
            + Novo usuário
          </button>
        )}
        <div style={{ fontSize: 14, color: "#64748b", marginTop: 10 }}>
          Colaborador só acessa Estoque e Venda, não vê preço de compra/margem/lucro e não edita preços.
          O PIN de permissão é o que o administrador digita pra liberar desconto na venda do colaborador —
          diferente do PIN de login, e único por administrador.
        </div>
      </div>

      <div style={bloco}>
        <h3 style={{ marginTop: 0 }}>Backup</h3>
        <div style={{ marginBottom: 8, fontSize: 15 }}>
          Pasta: <strong>{cfg.pasta_backup || "nenhuma (backup desligado)"}</strong>
        </div>
        <div style={{ fontSize: 14, color: "#64748b", marginBottom: 12 }}>
          Dica: escolha a pasta do Google Drive do computador — o backup sobe pra nuvem sozinho.
          Backup roda ao abrir o app e a cada 1 hora (1 arquivo por dia).
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn} onClick={async () => {
            const pasta = await window.api.escolherPasta();
            if (pasta) gravar("pasta_backup", pasta);
          }}>
            Escolher pasta…
          </button>
          <button style={{ ...btn, background: "#22c55e", color: "white" }} onClick={backupAgora}>
            Fazer backup agora
          </button>
        </div>
        {msgBackup && <div style={{ marginTop: 8, fontSize: 15 }}>{msgBackup}</div>}
      </div>

      <div style={{ fontSize: 11, color: "#cbd5e1", margin: "2px 0 1px" }}>
        Desenvolvido por{" "}
        <a href="https://www.instagram.com/jeanvascc_/" target="_blank" rel="noreferrer"
          style={{ color: "#b4c0cf", textDecoration: "none" }}>
          ⚡ Oficial Vasconcelos Dev
        </a>
      </div>

      {/* botão de desenvolvedor: invisível, canto inferior direito da tela */}
      <button
        aria-hidden
        onClick={() => { setDev("pin"); setPin(""); }}
        style={{ position: "fixed", right: 0, bottom: 0, width: 48, height: 48, opacity: 0, border: "none", background: "transparent", cursor: "default" }}
      />

      {dev && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={() => setDev(null)}>
          <div style={{ background: "white", borderRadius: 12, padding: 24, minWidth: 340 }} onClick={(e) => e.stopPropagation()}>
            {dev === "pin" ? (
              <>
                <h3 style={{ marginTop: 0 }}>Desenvolvedor</h3>
                <input
                  autoFocus
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Senha (4 dígitos)"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    pin === "4242" ? setDev("aberto") : (alert("Senha incorreta."), setPin(""));
                  }}
                  style={{ padding: 12, fontSize: 22, borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", textAlign: "center", letterSpacing: 8 }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button style={{ ...btn, flex: 1 }} onClick={() => (pin === "4242" ? setDev("aberto") : (alert("Senha incorreta."), setPin("")))}>
                    Entrar
                  </button>
                  <button style={{ ...btn, background: "#e2e8f0" }} onClick={() => setDev(null)}>Cancelar</button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ marginTop: 0 }}>Config de desenvolvedor</h3>
                <div style={{ fontSize: 15, marginBottom: 12 }}>
                  Dados de demonstração: <strong style={{ color: demoAtiva ? "#16a34a" : "#64748b" }}>{demoAtiva ? "ATIVOS" : "desativados"}</strong>
                </div>
                <div style={{ fontSize: 14, color: "#64748b", marginBottom: 16 }}>
                  Cria produtos, vendas de 4 meses, trocas e crédito fictícios pra apresentar o sistema.
                  Desativar apaga <strong>somente</strong> os dados fictícios — o que for real fica intacto.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {demoAtiva ? (
                    <button style={{ ...btn, background: "#fee2e2", color: "#dc2626", flex: 1 }} onClick={desativarDemo}>
                      Desativar e apagar dados fictícios
                    </button>
                  ) : (
                    <button style={{ ...btn, background: "#22c55e", color: "white", flex: 1 }} onClick={ativarDemo}>
                      Ativar dados de demonstração
                    </button>
                  )}
                  <button style={{ ...btn, background: "#e2e8f0" }} onClick={() => setDev(null)}>Fechar</button>
                </div>

                <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 16, paddingTop: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: "bold", marginBottom: 4, color: "#dc2626" }}>Zona de perigo</div>
                  <div style={{ fontSize: 14, color: "#64748b", marginBottom: 12 }}>
                    Apaga <strong>todos</strong> os dados e volta o sistema ao estado de fábrica
                    (Administrador / PIN 1234). Use para preparar uma máquina nova.
                  </div>
                  <button style={{ ...btn, background: "#dc2626", color: "white", width: "100%" }} onClick={limparBanco}>
                    Limpar banco de dados
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {importando && (
        <Importacao
          pecas={pecasImport}
          aoFechar={() => setImportando(false)}
          aoImportar={async (itens, arquivo) => {
            await gravarImportacao(itens, arquivo);
            alert(`${itens.length} produto(s) importado(s).`);
          }}
        />
      )}
    </div>
  );
}
