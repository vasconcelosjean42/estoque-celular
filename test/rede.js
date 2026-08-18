// Passo 27 — a camada de rede sem Electron: o servidor do PC principal e o
// terminal falando com ele. Roda em node puro (rede.js só usa fs/http/os/crypto).
//
// Rodar: node test/rede.js
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const rede = require("../electron/rede");

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "estoque-rede-"));
  const app = (versao) => ({ getPath: () => tmp, getVersion: () => versao });

  assert.strictEqual(rede.ler(app("1.0.0")).modo, "sozinho",
    "sem rede.json a instalação continua como sempre foi, sem abrir porta");

  const cfg = rede.salvar({ modo: "servidor", porta: 5399 });
  assert.match(cfg.token, /^[0-9A-F]{8}$/, "token curto o bastante pra digitar à mão");
  assert.strictEqual(rede.salvar({ modo: "servidor" }).token, cfg.token, "token não pode trocar sozinho");

  const feitos = [];
  const banco = {
    executar: (sql, params) => { feitos.push(["db", sql, params]); return [{ ok: 1 }]; },
    transacao: (comandos) => { feitos.push(["tx", comandos]); return comandos.map(() => ({ changes: 1 })); },
  };
  const servidor = rede.servir(banco, cfg, "1.0.0");
  await new Promise((r) => servidor.once("listening", r));
  const url = `http://127.0.0.1:${cfg.porta}`;

  assert.deepStrictEqual(
    await rede.requisitar(url, cfg.token, "/db", { sql: "SELECT 1", params: [7] }), [{ ok: 1 }],
    "a query do terminal chega no banco do principal e a resposta volta");
  assert.deepStrictEqual(feitos.at(-1), ["db", "SELECT 1", [7]]);

  await rede.requisitar(url, cfg.token, "/db-tx", { comandos: [["UPDATE x", [1]], ["INSERT y", []]] });
  assert.strictEqual(feitos.at(-1)[1].length, 2, "a venda inteira vai numa transação só");

  await assert.rejects(() => rede.requisitar(url, "ERRADO12", "/db", { sql: "SELECT 1" }),
    /token deste PC não confere/, "token errado não pode virar erro genérico");

  // O terminal atualizou antes do principal: recusa antes de mandar SQL que o
  // outro lado ainda não entende.
  rede.ler(app("1.0.1"));
  await assert.rejects(() => rede.requisitar(url, cfg.token, "/db", { sql: "SELECT 1" }),
    /versão 1\.0\.1 e o principal na 1\.0\.0/, "versões diferentes têm que parar aqui");

  // Erro do SQLite atravessa a rede com a mensagem original.
  rede.ler(app("1.0.0"));
  banco.executar = () => { throw new Error("no such column: fulano"); };
  await assert.rejects(() => rede.requisitar(url, cfg.token, "/db", { sql: "SELECT fulano" }),
    /no such column: fulano/);

  servidor.close();
  await assert.rejects(() => rede.requisitar(url, cfg.token, "/db", { sql: "SELECT 1" }),
    /Sem conexão com o PC principal/, "principal desligado precisa de mensagem que o leigo entende");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("rede OK — servidor, token, versão e queda do principal");
})();
