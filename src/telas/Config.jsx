import React, { useEffect, useState } from "react";

export const lerConfig = async () => {
  const linhas = await window.api.query("SELECT chave, valor FROM config");
  return Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
};

export const salvarConfig = (chave, valor) =>
  window.api.query("INSERT OR REPLACE INTO config (chave, valor) VALUES (?,?)", [chave, valor]);

const bloco = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, marginBottom: 16 };
const btn = { padding: "10px 18px", fontSize: 15, fontWeight: "bold", border: "none", borderRadius: 8, cursor: "pointer", background: "#38bdf8", color: "#0f172a" };

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

  const carregarUsuarios = () =>
    window.api.query("SELECT * FROM usuarios ORDER BY papel DESC, nome").then(setUsuarios);

  useEffect(() => {
    lerConfig().then(setCfg);
    carregarUsuarios();
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

  const salvarPinUsuario = async (u, valor) => {
    const p = valor.replace(/\D/g, "").slice(0, 4);
    setUsuarios(usuarios.map((x) => (x.id === u.id ? { ...x, pin: p } : x)));
    if (/^\d{4}$/.test(p)) await window.api.query("UPDATE usuarios SET pin = ? WHERE id = ?", [p, u.id]);
  };

  const removerUsuario = async (u) => {
    if (u.papel === "dono" && usuarios.filter((x) => x.papel === "dono").length === 1) {
      alert("Precisa existir pelo menos um dono.");
      return;
    }
    if (!confirm(`Remover usuário "${u.nome}"?`)) return;
    await window.api.query("DELETE FROM usuarios WHERE id = ?", [u.id]);
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

  const ativarDemo = async () => {
    // 8 tipos × 5 modelos = 40 produtos
    const tipos = [
      ["Tela", 22000, 42000], ["Bateria", 7000, 16000], ["Conector de carga", 1200, 4500],
      ["Câmera traseira", 9000, 22000], ["Alto-falante", 2500, 8000], ["Tampa traseira", 4500, 12000],
      ["Capinha", 500, 2500], ["Película 3D", 300, 1500],
    ];
    const modelos = ["iPhone 11", "iPhone 13", "Galaxy S22", "Galaxy A32", "Moto G52"];
    const produtos = tipos.flatMap(([tipo, compraBase, vendaBase]) =>
      modelos.map((modelo, m) => {
        const fator = 1 + (m % 3) * 0.15; // varia preço por modelo
        const qtd = Math.floor(Math.random() * 25); // alguns caem no alerta de mínimo
        return [tipo, modelo, qtd, Math.round(compraBase * fator), Math.round(vendaBase * fator), 3];
      })
    );
    const ids = { pecas: [], vendas: [], entradas: [], trocas: [], lotes: [], creditos: [] };
    for (const p of produtos) {
      const r = await window.api.query(
        "INSERT INTO pecas (nome, modelo, quantidade, preco_compra, preco_venda, estoque_minimo) VALUES (?,?,?,?,?,?)", p
      );
      ids.pecas.push(r.lastInsertRowid);
    }
    const formas = ["especie", "pix", "debito", "credito_avista", "credito_parcelado"];
    const vendas = [];
    for (let d = 120; d >= 0; d--) {
      for (let i = 2 + Math.floor(Math.random() * 7); i > 0; i--) {
        const p = Math.floor(Math.random() * produtos.length);
        vendas.push([
          "INSERT INTO vendas (peca_id, quantidade, preco_venda, preco_compra, mao_de_obra, forma_pagamento, criado_em) VALUES (?,?,?,?,?,?,?)",
          [ids.pecas[p], 1, produtos[p][4], produtos[p][3], Math.random() < 0.4 ? 5000 : 0,
           formas[Math.floor(Math.random() * formas.length)], isoDataHora(d * 86400000, 9 + Math.floor(Math.random() * 9))],
        ]);
      }
    }
    (await window.api.tx(vendas)).forEach((r) => ids.vendas.push(r.lastInsertRowid));
    (await window.api.tx([
      ["INSERT INTO entradas (peca_id, quantidade, preco_compra, observacao, criado_em) VALUES (?,?,?,?,?)",
        [ids.pecas[0], 8, 28000, "cadastro inicial", isoDataHora(15 * 86400000, 10)]],
      ["INSERT INTO entradas (peca_id, quantidade, preco_compra, observacao, criado_em) VALUES (?,?,?,?,?)",
        [ids.pecas[3], 40, 300, "leva do mês", isoDataHora(5 * 86400000, 14)]],
    ])).forEach((r) => ids.entradas.push(r.lastInsertRowid));
    const lote = await window.api.query(
      "INSERT INTO lotes (status, enviado_em, resolvido_em) VALUES ('resolvido', datetime('now','localtime','-50 days'), datetime('now','localtime','-20 days'))"
    );
    ids.lotes.push(lote.lastInsertRowid);
    (await window.api.tx([
      ["INSERT INTO trocas (modelo, defeito, valor_compra, recebido_em, lote_id) VALUES ('Tela iPhone 13','manchas na tela',28000, datetime('now','localtime','-55 days'), ?)", [lote.lastInsertRowid]],
      ["INSERT INTO trocas (modelo, defeito, valor_compra, recebido_em) VALUES ('Bateria iPhone 12','não segura carga',9000, datetime('now','localtime','-35 days'))"],
      ["INSERT INTO trocas (modelo, defeito, observacao, valor_compra, recebido_em) VALUES ('Tela Samsung','touch falhando','cliente João',22000, datetime('now','localtime','-8 days'))"],
    ])).forEach((r) => ids.trocas.push(r.lastInsertRowid));
    (await window.api.tx([
      ["INSERT INTO creditos (valor, descricao, criado_em) VALUES (28000,'Retorno do lote #' || ?, datetime('now','localtime','-20 days'))", [lote.lastInsertRowid]],
      ["INSERT INTO creditos (valor, descricao, criado_em) VALUES (-10000,'Abatido na compra de películas', datetime('now','localtime','-12 days'))"],
    ])).forEach((r) => ids.creditos.push(r.lastInsertRowid));
    await salvarConfig("demo_ids", JSON.stringify(ids));
    location.reload();
  };

  const desativarDemo = async () => {
    try {
      const ids = JSON.parse(cfg.demo_ids);
      const em = (lista) => lista.join(",") || "0";
      const p = em(ids.pecas);
      // Apaga os registros da demo E qualquer registro criado por cima de produto
      // fictício (venda/entrada de teste manual) — senão a FK trava tudo.
      await window.api.tx([
        [`DELETE FROM vendas WHERE id IN (${em(ids.vendas)}) OR peca_id IN (${p})`, []],
        [`DELETE FROM entradas WHERE id IN (${em(ids.entradas)}) OR peca_id IN (${p})`, []],
        [`UPDATE trocas SET peca_id = NULL WHERE peca_id IN (${p})`, []],
        [`DELETE FROM trocas WHERE id IN (${em(ids.trocas)})`, []],
        [`DELETE FROM lotes WHERE id IN (${em(ids.lotes)})`, []],
        [`DELETE FROM creditos WHERE id IN (${em(ids.creditos)})`, []],
        [`DELETE FROM pecas WHERE id IN (${p})`, []],
        ["DELETE FROM config WHERE chave = 'demo_ids'", []],
      ]);
      location.reload();
    } catch (e) {
      alert(`Erro ao desativar: ${e.message}`);
    }
  };

  return (
    <div style={{ maxWidth: 640 }}>
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
        <h3 style={{ marginTop: 0 }}>Usuários</h3>
        {usuarios.map((u) => (
          <div key={u.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #e2e8f0", fontSize: 15 }}>
            <strong style={{ flex: 1 }}>{u.nome}</strong>
            <span style={{ color: "#64748b" }}>{u.papel === "dono" ? "dono" : "funcionário"}</span>
            <span>PIN:</span>
            <input value={u.pin} onChange={(e) => salvarPinUsuario(u, e.target.value)}
              style={{ padding: 6, fontSize: 15, borderRadius: 6, border: "1px solid #cbd5e1", width: 64, textAlign: "center" }} />
            <button style={{ ...btn, padding: "6px 12px", fontSize: 14, background: "#fee2e2", color: "#dc2626" }} onClick={() => removerUsuario(u)}>
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
              <option value="funcionario">funcionário</option>
              <option value="dono">dono</option>
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
          Funcionário só acessa Estoque e Venda, não vê preço de compra/margem/lucro e não edita preços.
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
                    pin === "0000" ? setDev("aberto") : (alert("Senha incorreta."), setPin(""));
                  }}
                  style={{ padding: 12, fontSize: 22, borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", textAlign: "center", letterSpacing: 8 }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button style={{ ...btn, flex: 1 }} onClick={() => (pin === "0000" ? setDev("aberto") : (alert("Senha incorreta."), setPin("")))}>
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
