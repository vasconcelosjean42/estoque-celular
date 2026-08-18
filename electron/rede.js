// Passo 27: dois PCs na loja, um banco só.
//
// O app inteiro fala com o banco por dois caminhos (window.api.query e .tx), então
// basta publicar esses dois por HTTP na rede local: o PC principal serve, o outro
// vira terminal e faz fetch. Nenhuma tela sabe da diferença.
//
// ponytail: SQL cru viaja na rede. Aceito nesta rede — LAN da loja, token no
// header, porta única. Se um dia sair da loja, virar handlers nomeados (o
// refactor que specs/limites-conhecidos.md descreve) + HTTPS.
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const crypto = require("crypto");

const PORTA_PADRAO = 5174;

let arquivo;
let cfg;
let versao = "0";

// Sem rede.json = instalação de sempre: banco local e porta fechada. Só publica
// na rede quem escolheu "principal" na Config — ninguém abre porta sem querer.
function ler(app) {
  arquivo = path.join(app.getPath("userData"), "rede.json");
  versao = app.getVersion();
  try {
    cfg = JSON.parse(fs.readFileSync(arquivo, "utf-8"));
  } catch {
    cfg = { modo: "sozinho" };
  }
  return cfg;
}

function salvar(novo) {
  cfg = { ...cfg, ...novo };
  if (cfg.modo === "servidor") {
    cfg.porta = cfg.porta || PORTA_PADRAO;
    // 8 caracteres porque alguém vai digitar isto à mão, olhando pra um papel,
    // no outro PC. Contra a rede da loja basta; à internet ele não fica exposto.
    cfg.token = cfg.token || crypto.randomBytes(4).toString("hex").toUpperCase();
  }
  fs.writeFileSync(arquivo, JSON.stringify(cfg, null, 2));
  return cfg;
}

// O 192.168.x é o que o roteador da loja entrega; adaptador de VPN/VirtualBox
// aparece na lista junto e confunde quem for digitar. O da loja vem primeiro.
const ips = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i.family === "IPv4" && !i.internal)
    .map((i) => i.address)
    .sort((a, b) => Number(b.startsWith("192.168.")) - Number(a.startsWith("192.168.")));

// --- PC principal ----------------------------------------------------------

// minhaVersao fixa no boot: o servidor compara contra o que ELE subiu rodando.
function servir(banco, { porta = PORTA_PADRAO, token } = {}, minhaVersao = versao) {
  const servidor = http.createServer((req, res) => {
    const responder = (status, corpo) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(corpo));
    };
    if (req.headers["x-token"] !== token) return responder(401, { erro: "token" });
    // Os dois PCs se atualizam sozinhos, em horários diferentes. Por alguns
    // minutos o cliente pode pedir uma coluna que o servidor ainda não criou.
    if (req.headers["x-versao"] !== minhaVersao) return responder(409, { versao: minhaVersao });
    let corpo = "";
    req.on("data", (d) => (corpo += d));
    req.on("end", () => {
      try {
        const { sql, params, comandos } = JSON.parse(corpo);
        // Fila de graça: better-sqlite3 é síncrono e o Node é uma thread só, então
        // duas vendas ao mesmo tempo viram duas transações em sequência.
        responder(200, { r: req.url === "/db-tx" ? banco.transacao(comandos) : banco.executar(sql, params) });
      } catch (e) {
        responder(400, { erro: e.message });
      }
    });
  });
  servidor.on("error", (e) => console.error("servidor de rede:", e.message));
  servidor.listen(porta, "0.0.0.0");
  return servidor;
}

// --- PC terminal -----------------------------------------------------------

async function requisitar(url, token, rota, corpo) {
  let r;
  try {
    r = await fetch(url + rota, {
      method: "POST",
      headers: { "content-type": "application/json", "x-token": token, "x-versao": versao },
      body: JSON.stringify(corpo),
    });
  } catch {
    throw new Error(
      `Sem conexão com o PC principal (${url}).\n\nVerifique se ele está ligado e conectado na rede da loja.`
    );
  }
  const resp = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error("O token deste PC não confere com o do PC principal. Confira em Config → Rede nos dois.");
  if (r.status === 409)
    throw new Error(`Este PC está na versão ${versao} e o principal na ${resp.versao}. Aguarde a atualização terminar nos dois.`);
  if (!r.ok) throw new Error(resp.erro || `Erro ${r.status} no PC principal.`);
  return resp.r;
}

const chamar = (rota, corpo) => requisitar(cfg.url, cfg.token, rota, corpo);

const testar = async (url, token) => {
  try {
    await requisitar(url, token, "/db", { sql: "SELECT 1", params: [] });
    return { ok: true };
  } catch (e) {
    return { erro: e.message };
  }
};

module.exports = { ler, salvar, ips, servir, chamar, testar, requisitar, PORTA_PADRAO };
