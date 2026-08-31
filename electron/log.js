// Log em arquivo. Quando o app fechava sozinho na loja não sobrava rastro
// nenhum: sem log, diagnosticar "reiniciou 4 vezes hoje" vira adivinhação a
// 400km de distância. Uma linha por evento em userData/log.txt — é o arquivo
// que se pede pro cliente mandar quando algo estranho acontecer.
//
// Sem dependência nova (electron-log) de propósito: são 30 linhas e o que
// precisamos é anexar texto num arquivo.
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

const texto = (p) => (p instanceof Error ? p.stack || p.message : typeof p === "string" ? p : JSON.stringify(p));

function log(...partes) {
  const linha = `${new Date().toISOString()} ${partes.map(texto).join(" ")}\n`;
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

// Formato que o electron-updater espera (autoUpdater.logger). O debug dele é
// verborrágico a ponto de esconder o resto; fica de fora.
const logger = {
  info: (m) => log("[updater]", m),
  warn: (m) => log("[updater] aviso:", m),
  error: (m) => log("[updater] ERRO:", m),
  debug: () => {},
};

module.exports = { log, logger };
