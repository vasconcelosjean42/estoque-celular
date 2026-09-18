// Log em arquivo. Quando o app fechava sozinho na loja não sobrava rastro
// nenhum: sem log, diagnosticar "reiniciou 4 vezes hoje" vira adivinhação a
// 400km de distância. Uma linha por evento em userData/log.txt — é o arquivo
// que se pede pro cliente mandar quando algo estranho acontecer.
//
// Sem dependência nova (electron-log) de propósito: são 60 linhas e o que
// precisamos é anexar texto num arquivo.
//
// Formato de cada linha:  2026-09-17 11:03:11.123 -03:00 [area] mensagem
// A área ([rede], [energia], [app], [tela], [updater]) é o que permite ler o
// arquivo com um grep quando ele tiver milhares de linhas.
const fs = require("fs");
const os = require("os");
const path = require("path");

const LIMITE = 1024 * 1024; // 1 MB — PC de loja fica anos sem ninguém olhar

let arquivo;

function caminho() {
  if (arquivo) return arquivo;
  let dir;
  try {
    // Tarde, e não no require: main.js troca o userData no teste
    // (ESTOQUE_DB_DIR), e o test/rede.js roda em node puro, sem Electron —
    // lá o módulo "electron" é só o caminho do .exe e isto levanta TypeError.
    dir = require("electron").app.getPath("userData");
  } catch {
    dir = os.tmpdir();
  }
  arquivo = path.join(dir, "log.txt");
  return arquivo;
}

// Hora LOCAL, com o fuso escrito. O ISO em UTC obrigava a subtrair 3h de cada
// linha pra cruzar com "foi umas 11h" que a loja relata — e é exatamente nesse
// cruzamento que a investigação erra.
function agora() {
  const d = new Date();
  const p = (n, t = 2) => String(n).padStart(t, "0");
  const off = -d.getTimezoneOffset();
  const sinal = off >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)} ` +
    `${sinal}${p(Math.abs(off) / 60 | 0)}:${p(Math.abs(off) % 60)}`
  );
}

const texto = (p) => (p instanceof Error ? p.stack || p.message : typeof p === "string" ? p : JSON.stringify(p));

function log(...partes) {
  const linha = `${agora()} ${partes.map(texto).join(" ")}\n`;
  try {
    const f = caminho();
    // Uma geração de histórico basta: o que interessa é o dia do problema.
    if (fs.existsSync(f) && fs.statSync(f).size > LIMITE) fs.renameSync(f, f.replace(/\.txt$/, "-anterior.txt"));
    fs.appendFileSync(f, linha);
  } catch {
    // Log que quebra o app seria a pior troca possível.
  }
  console.log(linha.trim());
}

// O erro de rede do Node vem em camadas: fetch() lança "fetch failed" e esconde
// o motivo em .cause (ECONNREFUSED, ETIMEDOUT, EHOSTUNREACH, ECONNRESET…), que
// é a única parte que distingue "app fechado no principal" de "PC principal
// dormindo" de "wifi do balcão caiu". Devolve uma linha com tudo que existir.
function causa(e) {
  const partes = [];
  for (let atual = e, n = 0; atual && n < 4; atual = atual.cause, n++) {
    const campos = ["code", "errno", "syscall", "address", "port"]
      .filter((c) => atual[c] !== undefined)
      .map((c) => `${c}=${atual[c]}`);
    partes.push([!["Error", "TypeError"].includes(atual.name) && atual.name, atual.message, campos.length && `(${campos.join(" ")})`].filter(Boolean).join(" "));
  }
  return partes.join(" <- ");
}

// Formato que o electron-updater espera (autoUpdater.logger). O debug dele é
// verborrágico a ponto de esconder o resto; fica de fora.
const logger = {
  info: (m) => log("[updater]", m),
  warn: (m) => log("[updater] aviso:", m),
  error: (m) => log("[updater] ERRO:", m),
  debug: () => {},
};

// caminho() sai exportado pro menu "Ajuda > Ver logs" abrir a pasta certa.
module.exports = { log, logger, causa, caminho };
