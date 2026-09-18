// Passo 27: dois PCs na loja, um banco só.
//
// O app inteiro fala com o banco por dois caminhos (window.api.query e .tx), então
// basta publicar esses dois por HTTP na rede local: o PC principal serve, o outro
// vira terminal e faz fetch. Nenhuma tela sabe da diferença.
//
// ponytail: SQL cru viaja na rede. Aceito nesta rede — LAN da loja, token no
// header, porta única. Se um dia sair da loja, virar handlers nomeados (o
// refactor que specs/limites-conhecidos.md descreve) + HTTPS.
//
// Sobre o tanto de log aqui: o balcão "perdeu o principal" na loja e ninguém
// soube dizer por quê — o único rastro era o diálogo "Sem conexão", que é o
// mesmo texto pra app fechado, PC dormindo, firewall e wifi caído. Cada ponto
// em que a rede pode falhar escreve no log.txt COM o motivo que o Node deu, e
// o balcão registra a história da conexão (caiu / diagnóstico / voltou), não só
// cada falha solta.
const fs = require("fs");
const path = require("path");
const http = require("http");
const net = require("net");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { log, causa } = require("./log");

const PORTA_PADRAO = 5174;
const LENTO_MS = 2000; // acima disto a venda "trava" na percepção de quem opera

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
  const antes = cfg;
  cfg = { ...cfg, ...novo };
  if (cfg.modo === "servidor") {
    cfg.porta = cfg.porta || PORTA_PADRAO;
    // 8 caracteres porque alguém vai digitar isto à mão, olhando pra um papel,
    // no outro PC. Contra a rede da loja basta; à internet ele não fica exposto.
    cfg.token = cfg.token || crypto.randomBytes(4).toString("hex").toUpperCase();
  }
  fs.writeFileSync(arquivo, JSON.stringify(cfg, null, 2));
  // Mudar de modo é o que "desconecta" um PC do outro de vez — e vinha
  // acontecendo sem ninguém saber quem mexeu. Fica registrado o antes e o depois.
  log("[rede] configuração salva:", semToken(antes), "->", semToken(cfg));
  return cfg;
}

// O token não precisa estar no log que o cliente vai mandar por WhatsApp.
const semToken = (c) => JSON.stringify({ ...c, token: c && c.token ? "***" : undefined });

// O 192.168.x é o que o roteador da loja entrega; adaptador de VPN/VirtualBox
// aparece na lista junto e confunde quem for digitar. O da loja vem primeiro.
const ips = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i.family === "IPv4" && !i.internal)
    .map((i) => i.address)
    .sort((a, b) => Number(b.startsWith("192.168.")) - Number(a.startsWith("192.168.")));

// Pro log: "SELECT * FROM usuarios ORDER BY…" diz qual tela estava aberta na
// hora da falha; o SQL inteiro de uma venda ocuparia a linha toda.
const resumoCorpo = (corpo) => {
  if (!corpo) return "";
  if (corpo.comandos) return `tx com ${corpo.comandos.length} comandos: ${String(corpo.comandos[0]?.[0] || "").trim().slice(0, 50)}…`;
  return String(corpo.sql || "").replace(/\s+/g, " ").trim().slice(0, 70);
};

// --- Contadores do resumo periódico -----------------------------------------
//
// A linha de resumo (main.js dispara a cada 30 min) responde "o balcão estava
// sendo usado às 14h?" e "quando parou de chegar pedido no principal?" — as
// duas perguntas que o log só de falhas não responde.
const periodo = { inicio: Date.now(), ok: 0, falhas: 0, somaMs: 0, maisLento: 0, porBalcao: {} };
let ultimoPedido = 0; // servidor: quando chegou o último pedido de um balcão
let ociosoSegundos = () => null; // servidor: há quanto tempo ninguém mexe no PC principal (powerMonitor)

const contar = (ok, ms, balcao) => {
  periodo[ok ? "ok" : "falhas"]++;
  periodo.somaMs += ms;
  if (ms > periodo.maisLento) periodo.maisLento = ms;
  if (balcao) periodo.porBalcao[balcao] = (periodo.porBalcao[balcao] || 0) + 1;
};

const segundos = (ms) => `${Math.round(ms / 1000)}s`;
const minutos = (ms) => `${Math.round(ms / 60000)} min`;
const duracao = (ms) => (ms < 60000 ? segundos(ms) : minutos(ms));

function resumoPeriodico() {
  const p = periodo;
  const total = p.ok + p.falhas;
  const partes = [`${p.ok} pedidos ok, ${p.falhas} com falha`];
  if (total) partes.push(`média ${Math.round(p.somaMs / total)}ms, mais lento ${p.maisLento}ms`);
  const balcoes = Object.entries(p.porBalcao).map(([ip, n]) => `${ip}: ${n}`).join(", ");
  if (balcoes) partes.push(`por balcão: ${balcoes}`);
  if (cfg && cfg.modo === "servidor") {
    partes.push(ultimoPedido ? `último pedido há ${segundos(Date.now() - ultimoPedido)}` : "nenhum pedido desde que abriu");
    const oc = ociosoSegundos();
    if (oc != null) partes.push(`ninguém mexe neste PC há ${oc}s`);
  }
  if (cfg && cfg.modo === "cliente") {
    partes.push(
      conexao.viva === null ? "ainda não falou com o principal"
        : conexao.viva ? `conexão viva (última resposta há ${segundos(Date.now() - conexao.ultimaOk)})`
        : `SEM CONEXÃO desde ${new Date(conexao.caiuEm).toLocaleTimeString()} (${conexao.falhas} falhas)`
    );
  }
  partes.push(`endereços deste PC: ${ips().join(", ") || "NENHUM"}`);
  log(`[rede] resumo dos últimos ${duracao(Date.now() - p.inicio)}:`, partes.join(" | "));
  Object.assign(periodo, { inicio: Date.now(), ok: 0, falhas: 0, somaMs: 0, maisLento: 0, porBalcao: {} });
}

// --- PC principal ----------------------------------------------------------

// minhaVersao fixa no boot: o servidor compara contra o que ELE subiu rodando.
function servir(banco, { porta = PORTA_PADRAO, token } = {}, minhaVersao = versao, { ocioso } = {}) {
  if (ocioso) ociosoSegundos = ocioso;
  const balcoesVistos = new Set();

  const servidor = http.createServer((req, res) => {
    const balcao = req.socket.remoteAddress;
    const t0 = Date.now();
    // O balcão sumir no meio de um pedido é rotina — wifi da loja oscilando, ou
    // alguém fechando o app durante a venda. Medido no Node 20: isto NÃO derruba
    // o servidor, ele trata o aborto por dentro. Os ouvintes aqui são pelo
    // registro: "caiu 40 vezes hoje" é o que diferencia rede ruim de bug nosso,
    // e sem eles esse evento não aparece em lugar nenhum.
    // Antes do teste de token, senão o 401 e o 409 saem daqui sem ouvinte algum.
    req.on("error", (e) => log("[rede] conexão do balcão", balcao, "caiu no meio do pedido", req.url + ":", causa(e)));
    res.on("error", (e) => log("[rede] resposta para o balcão", balcao, "interrompida:", causa(e)));

    // Silêncio longo seguido de pedido é a assinatura de "o principal ficou
    // inalcançável e voltou": o balcão não manda nada enquanto não consegue.
    if (ultimoPedido && t0 - ultimoPedido > 10 * 60 * 1000) {
      const oc = ociosoSegundos();
      log("[rede] primeiro pedido depois de", duracao(t0 - ultimoPedido), "sem tráfego, de", balcao,
        oc != null ? `(ninguém mexe neste PC há ${oc}s)` : "");
    }
    ultimoPedido = t0;

    const responder = (status, corpo) => {
      contar(status === 200, Date.now() - t0, balcao);
      // Se o balcão já foi embora, escrever na conexão morta levanta erro — e o
      // catch lá de baixo responderia de novo, levantando outro.
      try {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(corpo));
      } catch (e) {
        log("[rede] resposta perdida para", balcao, req.url + ":", causa(e));
      }
    };
    if (req.headers["x-token"] !== token) {
      log("[rede] pedido de", balcao, "RECUSADO: token não confere");
      return responder(401, { erro: "token" });
    }
    // Os dois PCs se atualizam sozinhos, em horários diferentes. Por alguns
    // minutos o cliente pode pedir uma coluna que o servidor ainda não criou.
    if (req.headers["x-versao"] !== minhaVersao) {
      log("[rede] pedido de", balcao, "RECUSADO: ele está na versão", req.headers["x-versao"], "e este PC na", minhaVersao);
      return responder(409, { versao: minhaVersao });
    }
    let corpo = "";
    req.on("data", (d) => (corpo += d));
    req.on("end", () => {
      let pedido;
      try {
        pedido = JSON.parse(corpo);
        // Fila de graça: better-sqlite3 é síncrono e o Node é uma thread só, então
        // duas vendas ao mesmo tempo viram duas transações em sequência.
        const r = req.url === "/db-tx" ? banco.transacao(pedido.comandos) : banco.executar(pedido.sql, pedido.params);
        const ms = Date.now() - t0;
        // Banco lento no principal é o balcão "travando" sem falhar — não
        // aparece como erro em lugar nenhum, só aqui.
        if (ms > LENTO_MS) log("[rede] pedido LENTO de", balcao, `${ms}ms:`, resumoCorpo(pedido));
        responder(200, { r });
      } catch (e) {
        log("[rede] pedido de", balcao, "falhou no banco:", String(e.message).split("\n")[0], "|", resumoCorpo(pedido));
        responder(400, { erro: e.message });
      }
    });
  });

  servidor.on("listening", () => log("[rede] servidor ouvindo na porta", porta, "| endereços deste PC:", ips().join(", ") || "NENHUM"));
  servidor.on("close", () => log("[rede] servidor de rede FECHOU — nenhum balcão consegue conectar a partir de agora"));
  servidor.on("error", (e) => log("[rede] servidor de rede ERRO:", causa(e)));
  // Pedido que nem chegou a ser HTTP (ou conexão resetada com pedido pela
  // metade). Sem ouvinte o Node responde 400 sozinho; com ouvinte, é nosso.
  servidor.on("clientError", (e, socket) => {
    log("[rede] conexão inválida de", socket.remoteAddress + ":", causa(e));
    if (e.code === "ECONNRESET" || !socket.writable) return socket.destroy();
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });
  // Um balcão novo (ou o mesmo com IP novo) é notícia; a reconexão normal do
  // keep-alive a cada poucos segundos não é.
  servidor.on("connection", (socket) => {
    const ip = socket.remoteAddress;
    if (balcoesVistos.has(ip)) return;
    balcoesVistos.add(ip);
    log("[rede] balcão conectou pela primeira vez desde que abriu:", ip);
  });
  servidor.listen(porta, "0.0.0.0");
  return servidor;
}

// --- Firewall do Windows ---------------------------------------------------

// O Windows pergunta "liberar em rede privada/pública?" UMA vez por programa, na
// primeira vez que ele abre a porta, e guarda a resposta pra sempre. Quem clicou
// Cancelar (ou deixou só "pública") nunca mais vê o aviso: o balcão só enxerga
// "sem conexão" e não há o que clicar. Este botão escreve a regra na mão, no
// lugar do diálogo que não volta — inclusive depois de uma atualização, porque
// a regra é do .exe e o caminho dele não muda.
//
// remoteip=LocalSubnet em vez de profile=private: vale mesmo que o Windows tenha
// marcado a rede da loja como pública (que é o esquecimento comum), e continua
// só aceitando quem está no mesmo roteador — o limite que o passo 27 assume.
const REGRA_FIREWALL = "Estoque Celular (rede da loja)";

// Mexer no firewall é coisa de administrador: o Start-Process -Verb RunAs é o
// que faz aparecer o "deseja permitir alterações?" do Windows.
const rodarComoAdmin = (bat) =>
  new Promise((resolve) =>
    execFile(
      "powershell",
      ["-NoProfile", "-Command", `$p = Start-Process -FilePath '${bat}' -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode`],
      (erro, _saida, stderr) => resolve(erro ? { erro: String(stderr).trim() || erro.message } : { ok: true })
    )
  );

async function liberarFirewall(app, rodar = rodarComoAdmin) {
  if (process.platform !== "win32") return { erro: "Isto só existe no Windows." };
  const porta = (cfg && cfg.porta) || PORTA_PADRAO;
  const exe = process.execPath;
  const bat = path.join(app.getPath("temp"), "estoque-firewall.bat");
  fs.writeFileSync(
    bat,
    [
      "@echo off",
      // apaga o "não permitir" gravado naquele dia — regra de bloqueio vence
      // qualquer liberação, então tem que sair antes.
      `netsh advfirewall firewall delete rule name=all dir=in program="${exe}" >nul 2>&1`,
      `netsh advfirewall firewall delete rule name="${REGRA_FIREWALL}" >nul 2>&1`,
      `netsh advfirewall firewall add rule name="${REGRA_FIREWALL}" dir=in action=allow protocol=TCP localport=${porta} remoteip=LocalSubnet program="${exe}" enable=yes`,
    ].join("\r\n"),
    "latin1"
  );
  log("[rede] liberando a porta", porta, "no Firewall do Windows para", exe);
  const r = await rodar(bat);
  log("[rede] firewall:", r.ok ? "regra gravada" : `falhou: ${r.erro}`);
  if (r.ok) return { ok: true, porta };
  return {
    erro: /cancel/i.test(r.erro)
      ? "Você respondeu Não na janela do Windows que pede permissão de administrador. Clique no botão de novo e responda Sim."
      : `Não deu para liberar no Firewall: ${r.erro}`,
  };
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
  } catch (e) {
    // O "Detalhe técnico" no diálogo é pra foto de celular: o cliente manda o
    // print e dá pra saber se foi ECONNREFUSED (app fechado lá) ou ETIMEDOUT
    // (PC dormindo/firewall) sem esperar o arquivo de log.
    throw new Error(
      `Sem conexão com o PC principal (${url}).\n\nVerifique se ele está ligado e conectado na rede da loja.\n\nDetalhe técnico: ${causa(e)}`,
      { cause: e }
    );
  }
  const resp = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error("O token deste PC não confere com o do PC principal. Confira em Config → Rede nos dois.");
  if (r.status === 409)
    throw new Error(`Este PC está na versão ${versao} e o principal na ${resp.versao}. Aguarde a atualização terminar nos dois.`);
  if (!r.ok) throw new Error(resp.erro || `Erro ${r.status} no PC principal.`);
  return resp.r;
}

// A história da conexão com o principal, do ponto de vista do balcão. Cada
// falha solta vai pro log; mas o que se lê depois é a transição: quando CAIU,
// o que o diagnóstico viu naquele instante, e quando VOLTOU.
const conexao = { viva: null, ultimaOk: 0, caiuEm: 0, falhas: 0, ultimoDiagnostico: 0 };

async function chamar(rota, corpo) {
  const t0 = Date.now();
  try {
    const r = await requisitar(cfg.url, cfg.token, rota, corpo);
    const ms = Date.now() - t0;
    contar(true, ms);
    if (ms > LENTO_MS) log("[rede] principal demorou", `${ms}ms`, "para responder", rota + ":", resumoCorpo(corpo));
    if (conexao.viva === false)
      log("[rede] CONEXÃO VOLTOU depois de", duracao(Date.now() - conexao.caiuEm), "e", conexao.falhas, "pedidos falhados");
    else if (conexao.viva === null) log("[rede] primeira resposta do principal", cfg.url, `em ${ms}ms`);
    Object.assign(conexao, { viva: true, ultimaOk: Date.now(), falhas: 0 });
    return r;
  } catch (e) {
    const ms = Date.now() - t0;
    contar(false, ms);
    // Sem .cause é resposta do principal (token, versão, erro de SQL) — a rede
    // funcionou. Só a falha de transporte conta como conexão caída.
    if (!e.cause) {
      log("[rede] principal respondeu com erro em", rota, `(${ms}ms):`, String(e.message).split("\n")[0], "|", resumoCorpo(corpo));
      throw e;
    }
    conexao.falhas++;
    log("[rede] FALHA", rota, `(${ms}ms):`, causa(e.cause), "|", resumoCorpo(corpo), "| endereços deste PC:", ips().join(", ") || "NENHUM (este PC está sem rede)");
    if (conexao.viva !== false) {
      log("[rede] CONEXÃO CAIU com", cfg.url,
        conexao.ultimaOk ? `— última resposta boa há ${segundos(Date.now() - conexao.ultimaOk)}` : "— nunca respondeu desde que o app abriu");
      Object.assign(conexao, { viva: false, caiuEm: Date.now() });
    }
    // Uma vez por minuto enquanto estiver fora: o quadro pode mudar (PC voltou
    // a responder ping mas o app ainda não abriu lá, por exemplo).
    if (Date.now() - conexao.ultimoDiagnostico > 60 * 1000) {
      conexao.ultimoDiagnostico = Date.now();
      diagnosticar(cfg.url).catch((e) => log("[rede] diagnóstico falhou:", causa(e)));
    }
    throw e;
  }
}

// Ping + tentativa de abrir a porta, na hora da queda. O erro do fetch já diz
// muito, mas os dois juntos separam os quatro casos que a loja confunde:
// PC desligado/dormindo, app fechado lá, firewall, e rede do próprio balcão.
async function diagnosticar(url) {
  const { hostname: host, port } = new URL(url);
  const porta = Number(port) || 80;
  const [ping, tcp] = await Promise.all([pingar(host), abrirPorta(host, porta)]);
  let leitura;
  if (ping.ok && tcp.ok) leitura = "PC principal e sistema alcançáveis AGORA — a queda foi momentânea";
  else if (ping.ok && tcp.code === "ECONNREFUSED") leitura = "PC principal está ligado e na rede, mas NADA ouve na porta: o sistema está fechado lá (ou a porta mudou)";
  else if (ping.ok) leitura = "PC principal responde ping mas a porta não abre: Firewall do Windows bloqueando, ou o sistema lá travado";
  else if (tcp.ok) leitura = "porta abriu mas ping não (ping bloqueado no principal) — a queda foi momentânea";
  else leitura = "PC principal NÃO responde na rede: desligado, dormindo, sem cabo/wifi, ou o IP dele mudou";
  log(`[rede] diagnóstico: ping ${host} ${ping.ok ? `ok em ${ping.ms}ms` : `falhou (${ping.motivo})`};`,
    `porta ${porta} ${tcp.ok ? `abriu em ${tcp.ms}ms` : `falhou (${tcp.code || tcp.motivo})`}`, "=>", leitura);
}

const pingar = (host) =>
  new Promise((resolve) => {
    const t0 = Date.now();
    const args = process.platform === "win32" ? ["-n", "1", "-w", "1500", host] : ["-c", "1", "-W", "2", host];
    execFile("ping", args, { timeout: 4000, windowsHide: true }, (erro, saida) => {
      // No Windows o ping devolve 0 até em "Host de destino inacessível"; o
      // texto é o que vale. TTL= só aparece em resposta de verdade.
      const ok = !erro && /TTL=/i.test(String(saida));
      resolve({ ok, ms: Date.now() - t0, motivo: erro ? erro.code || erro.message : "sem resposta" });
    });
  });

const abrirPorta = (host, porta) =>
  new Promise((resolve) => {
    const t0 = Date.now();
    const s = net.connect({ host, port: porta });
    s.setTimeout(3000);
    s.unref();
    const fim = (r) => { s.destroy(); resolve({ ms: Date.now() - t0, ...r }); };
    s.on("connect", () => fim({ ok: true }));
    s.on("timeout", () => fim({ ok: false, motivo: "sem resposta em 3s" }));
    s.on("error", (e) => fim({ ok: false, code: e.code, motivo: e.message }));
  });

const testar = async (url, token) => {
  const t0 = Date.now();
  try {
    await requisitar(url, token, "/db", { sql: "SELECT 1", params: [] });
    log("[rede] teste de conexão com", url, "OK em", `${Date.now() - t0}ms`);
    return { ok: true };
  } catch (e) {
    log("[rede] teste de conexão com", url, "FALHOU:", e.cause ? causa(e.cause) : String(e.message).split("\n")[0]);
    return { erro: e.message };
  }
};

module.exports = { ler, salvar, ips, servir, chamar, testar, requisitar, liberarFirewall, resumoPeriodico, PORTA_PADRAO };
