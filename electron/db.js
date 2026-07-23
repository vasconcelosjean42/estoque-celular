const Database = require("better-sqlite3");
const path = require("path");
const { app } = require("electron");

const db = new Database(path.join(app.getPath("userData"), "estoque.db"));
db.pragma("journal_mode = WAL");

// Preços sempre em CENTAVOS (INTEGER). Margem e totais são derivados por query.
db.exec(`
CREATE TABLE IF NOT EXISTS pecas (
  id             INTEGER PRIMARY KEY,
  nome           TEXT NOT NULL,
  modelo         TEXT NOT NULL DEFAULT '',
  quantidade     INTEGER NOT NULL DEFAULT 0,
  preco_compra   INTEGER NOT NULL,
  preco_venda    INTEGER NOT NULL,
  estoque_minimo INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS vendas (
  id           INTEGER PRIMARY KEY,
  peca_id      INTEGER NOT NULL REFERENCES pecas(id),
  quantidade   INTEGER NOT NULL DEFAULT 1,
  preco_venda  INTEGER NOT NULL,
  preco_compra INTEGER NOT NULL, -- custo congelado na hora da venda
  mao_de_obra  INTEGER NOT NULL DEFAULT 0,
  criado_em    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS lotes (
  id         INTEGER PRIMARY KEY,
  status     TEXT NOT NULL DEFAULT 'aberto', -- aberto | enviado | resolvido
  enviado_em TEXT
);

CREATE TABLE IF NOT EXISTS trocas (
  id          INTEGER PRIMARY KEY,
  modelo      TEXT NOT NULL,
  defeito     TEXT NOT NULL,
  observacao  TEXT NOT NULL DEFAULT '',
  recebido_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  lote_id     INTEGER REFERENCES lotes(id) -- NULL = ainda na prateleira
);

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS entradas (
  id           INTEGER PRIMARY KEY,
  peca_id      INTEGER NOT NULL REFERENCES pecas(id),
  quantidade   INTEGER NOT NULL,
  preco_compra INTEGER NOT NULL,
  observacao   TEXT NOT NULL DEFAULT '',
  criado_em    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS creditos (
  id        INTEGER PRIMARY KEY,
  valor     INTEGER NOT NULL, -- centavos; + entrada (lote retornou), - abate
  descricao TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);

// Migrações idempotentes: ALTER falha se a coluna já existe — ignorar.
for (const sql of [
  "ALTER TABLE vendas ADD COLUMN forma_pagamento TEXT NOT NULL DEFAULT 'especie'",
  "ALTER TABLE trocas ADD COLUMN valor_compra INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE trocas ADD COLUMN peca_id INTEGER REFERENCES pecas(id)",
  "ALTER TABLE lotes ADD COLUMN resolvido_em TEXT",
  "ALTER TABLE vendas ADD COLUMN cliente TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE trocas ADD COLUMN venda_id INTEGER REFERENCES vendas(id)",
  "ALTER TABLE trocas ADD COLUMN nova_peca_id INTEGER REFERENCES pecas(id)",
]) {
  try {
    db.exec(sql);
  } catch {}
}

module.exports = db;
