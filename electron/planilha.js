// Leitura e escrita de .xlsx sem dependência: xlsx é um zip com XML dentro, e o
// Node já traz o zlib. Só o que a importação precisa — texto e número, uma aba.
const zlib = require("zlib");

// --- zip -------------------------------------------------------------------

const tabelaCrc = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = tabelaCrc[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// Devolve { nome: Buffer } lendo o diretório central (não dá pra confiar na
// ordem dos cabeçalhos locais).
const descompactar = (buf) => {
  let fim = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error("arquivo não parece um .xlsx (zip sem índice)");
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  const saida = {};
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("índice do zip corrompido");
    const metodo = buf.readUInt16LE(p + 10);
    const tam = buf.readUInt32LE(p + 20);
    const nLen = buf.readUInt16LE(p + 28);
    const eLen = buf.readUInt16LE(p + 30);
    const cLen = buf.readUInt16LE(p + 32);
    const nome = buf.toString("utf-8", p + 46, p + 46 + nLen);
    const local = buf.readUInt32LE(p + 42);
    // O cabeçalho local repete os tamanhos de nome/extra, e eles podem diferir
    // dos do índice — o começo dos dados só sai daqui.
    const dados = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const bruto = buf.subarray(dados, dados + tam);
    saida[nome] = metodo === 0 ? bruto : zlib.inflateRawSync(bruto);
    p += 46 + nLen + eLen + cLen;
  }
  return saida;
};

const compactar = (arquivos) => {
  const locais = [], central = [];
  let off = 0;
  for (const [nome, texto] of arquivos) {
    const cru = Buffer.from(texto, "utf-8");
    const comp = zlib.deflateRawSync(cru);
    const n = Buffer.from(nome, "utf-8");
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc32(cru), 14); h.writeUInt32LE(comp.length, 18);
    h.writeUInt32LE(cru.length, 22); h.writeUInt16LE(n.length, 26);
    locais.push(h, n, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6);
    c.writeUInt16LE(8, 10); c.writeUInt32LE(crc32(cru), 16);
    c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(cru.length, 24);
    c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, n);
    off += h.length + n.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10); fim.writeUInt32LE(cd.length, 12);
  fim.writeUInt32LE(off, 16);
  return Buffer.concat([...locais, cd, fim]);
};

// --- xml -------------------------------------------------------------------

const desescapar = (s) =>
  s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const escapar = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const letras = (ref) => ref.match(/^[A-Z]+/)[0];
const indice = (col) => [...col].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1;
const nomeCol = (i) => {
  let s = "", n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
};

// --- leitura ---------------------------------------------------------------

// Devolve matriz de strings (linha × coluna), a primeira aba do arquivo.
const lerXlsx = (buf) => {
  const partes = descompactar(buf);
  const compartilhadas = [];
  if (partes["xl/sharedStrings.xml"]) {
    const sx = partes["xl/sharedStrings.xml"].toString("utf-8");
    for (const m of sx.matchAll(/<si>(.*?)<\/si>/gs)) {
      compartilhadas.push(desescapar([...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((t) => t[1]).join("")));
    }
  }
  const nomeAba = Object.keys(partes).find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  if (!nomeAba) throw new Error("planilha sem aba de dados");
  const xml = partes[nomeAba].toString("utf-8");
  const linhas = [];
  for (const m of xml.matchAll(/<row[^>]*\br="(\d+)"[^>]*>(.*?)<\/row>/gs)) {
    const cels = [];
    for (const c of m[2].matchAll(/<c r="([A-Z]+\d+)"([^>]*)>(.*?)<\/c>/gs)) {
      const [, ref, attrs, corpo] = c;
      const tipo = (attrs.match(/\bt="(\w+)"/) || [])[1];
      const v = corpo.match(/<v>(.*?)<\/v>/s);
      const t = corpo.match(/<t[^>]*>(.*?)<\/t>/s);
      let valor = "";
      if (tipo === "s" && v) valor = compartilhadas[Number(v[1])] ?? "";
      else if (t) valor = desescapar(t[1]);
      else if (v) valor = desescapar(v[1]);
      cels[indice(letras(ref))] = String(valor);
    }
    linhas[Number(m[1]) - 1] = cels;
  }
  // Linha vazia no meio vira buraco no array; normaliza pra [] e corta o fim.
  for (let i = 0; i < linhas.length; i++) if (!linhas[i]) linhas[i] = [];
  while (linhas.length && !linhas[linhas.length - 1].some((x) => x && x.trim())) linhas.pop();
  return linhas;
};

// CSV do Excel pt-BR: separador ; e aspas duplicadas. Detecta , se não houver ;.
const lerCsv = (texto) => {
  const t = texto.replace(/^﻿/, "");
  const sep = (t.split("\n")[0].match(/;/g) || []).length >= (t.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const linhas = [];
  let cel = "", linha = [], aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') { cel += '"'; i++; }
      else if (ch === '"') aspas = false;
      else cel += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(cel); cel = ""; }
    else if (ch === "\n") { linha.push(cel); linhas.push(linha); linha = []; cel = ""; }
    else if (ch !== "\r") cel += ch;
  }
  if (cel || linha.length) { linha.push(cel); linhas.push(linha); }
  while (linhas.length && !linhas[linhas.length - 1].some((x) => x && x.trim())) linhas.pop();
  return linhas;
};

exports.ler = (caminho, buf) =>
  caminho.toLowerCase().endsWith(".csv") ? lerCsv(buf.toString("utf-8")) : lerXlsx(buf);

// --- escrita ---------------------------------------------------------------

// linhas = matriz; número vira célula numérica, resto vira texto.
exports.escrever = (aba, linhas) => {
  const rows = linhas.map((cels, r) => {
    const cs = cels.map((v, i) => {
      if (v === null || v === undefined || v === "") return "";
      const ref = `${nomeCol(i)}${r + 1}`;
      return typeof v === "number"
        ? `<c r="${ref}" t="n"><v>${v}</v></c>`
        : `<c r="${ref}" t="inlineStr"><is><t>${escapar(v)}</t></is></c>`;
    }).join("");
    return `<row r="${r + 1}">${cs}</row>`;
  }).join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col width="12" min="1" max="1" customWidth="1"/><col width="14" min="2" max="2" customWidth="1"/><col width="42" min="3" max="3" customWidth="1"/><col width="10" min="4" max="4" customWidth="1"/><col width="17" min="5" max="6" customWidth="1"/></cols><sheetData>${rows}</sheetData></worksheet>`;
  return compactar([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapar(aba)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", sheet],
  ]);
};
