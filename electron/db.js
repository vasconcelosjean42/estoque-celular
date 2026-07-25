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

CREATE TABLE IF NOT EXISTS usuarios (
  id    INTEGER PRIMARY KEY,
  nome  TEXT NOT NULL,
  pin   TEXT NOT NULL, -- texto puro de propósito: controle operacional, não segurança
  papel TEXT NOT NULL DEFAULT 'funcionario' -- dono | funcionario
);

-- Livro único de perdas: sempre a preço de CUSTO, nunca de venda. Perder um cabo
-- custa o que foi pago nele. Os passos 19 e 20 gravam aqui também.
CREATE TABLE IF NOT EXISTS perdas (
  id        INTEGER PRIMARY KEY,
  troca_id  INTEGER REFERENCES trocas(id),
  peca_id   INTEGER REFERENCES pecas(id),
  valor     INTEGER NOT NULL, -- centavos, preço de compra
  motivo    TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS clientes (
  id        INTEGER PRIMARY KEY,
  codigo    TEXT NOT NULL DEFAULT '', -- C001, C002… sequencial e editável
  nome      TEXT NOT NULL,
  contato   TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS notas (
  id              INTEGER PRIMARY KEY,
  venda_id        INTEGER REFERENCES vendas(id),
  numero          INTEGER NOT NULL,        -- sequencial legível (0001, 0002…)
  cliente_nome    TEXT NOT NULL DEFAULT '',
  cliente_contato TEXT NOT NULL DEFAULT '', -- email ou telefone
  descricao       TEXT NOT NULL,           -- "1x Tela iPhone 13"
  valor_total     INTEGER NOT NULL,        -- centavos
  criado_em       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);

// Primeiro uso: garante um administrador pra conseguir logar (trocar PIN na Config).
db.exec("INSERT INTO usuarios (nome, pin, papel) SELECT 'Administrador', '1234', 'dono' WHERE NOT EXISTS (SELECT 1 FROM usuarios)");
db.exec("UPDATE usuarios SET nome = 'Administrador' WHERE nome = 'Dono' AND papel = 'dono'"); // renomeia o seed antigo

// Migrações idempotentes: ALTER falha se a coluna já existe — ignorar.
for (const sql of [
  "ALTER TABLE vendas ADD COLUMN forma_pagamento TEXT NOT NULL DEFAULT 'especie'",
  "ALTER TABLE trocas ADD COLUMN valor_compra INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE trocas ADD COLUMN peca_id INTEGER REFERENCES pecas(id)",
  "ALTER TABLE lotes ADD COLUMN resolvido_em TEXT",
  "ALTER TABLE vendas ADD COLUMN cliente TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE trocas ADD COLUMN venda_id INTEGER REFERENCES vendas(id)",
  "ALTER TABLE trocas ADD COLUMN nova_peca_id INTEGER REFERENCES pecas(id)",
  "ALTER TABLE entradas ADD COLUMN custo_anterior INTEGER", // p/ desfazer entrada revertendo o custo médio
  "ALTER TABLE trocas ADD COLUMN fornecedor TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE pecas ADD COLUMN codigo TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE vendas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)", // NULL = venda anterior ao passo 11
  // Passo 12: vendas continua uma linha por item; pedido_id agrupa o carrinho.
  // Venda antiga vira um pedido de 1 item, então as telas podem agrupar sempre.
  "ALTER TABLE vendas ADD COLUMN pedido_id INTEGER",
  "UPDATE vendas SET pedido_id = id WHERE pedido_id IS NULL",
  "ALTER TABLE notas ADD COLUMN pedido_id INTEGER",
  "UPDATE notas SET pedido_id = venda_id WHERE pedido_id IS NULL",
  // Parcial: os produtos ainda sem código ('') não colidem entre si.
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_pecas_codigo ON pecas(codigo) WHERE codigo != ''",
  // Passo 13: desconto do pedido, gravado em uma linha só (igual mão de obra).
  "ALTER TABLE vendas ADD COLUMN desconto INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE vendas ADD COLUMN desconto_por INTEGER REFERENCES usuarios(id)", // quem autorizou
  // PIN de permissão: diferente do PIN de login, e é ele que identifica quem
  // liberou o desconto — parcial, porque quem não tem fica com '' e não colide.
  "ALTER TABLE usuarios ADD COLUMN pin_permissao TEXT NOT NULL DEFAULT ''",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_pin_permissao ON usuarios(pin_permissao) WHERE pin_permissao != ''",
  // Passo 14: vendas.cliente (texto) fica pro histórico antigo; cliente_id é o vínculo.
  "ALTER TABLE vendas ADD COLUMN cliente_id INTEGER REFERENCES clientes(id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_codigo ON clientes(codigo) WHERE codigo != ''",
  // Passo 15: peça devolvida funcionando volta ao estoque e não vai pra prateleira.
  // Default 1 porque toda troca até aqui era defeito.
  "ALTER TABLE trocas ADD COLUMN defeituosa INTEGER NOT NULL DEFAULT 1",

]) {
  try {
    db.exec(sql);
  } catch {}
}

// Passo 14: os nomes soltos em vendas.cliente viram cadastro. Roda uma vez só —
// repetindo a cada boot, um cliente excluído voltaria do histórico de venda.
if (!db.prepare("SELECT 1 FROM config WHERE chave = 'migrou_clientes'").get()) {
  db.transaction(() => {
    db.prepare(`INSERT INTO clientes (nome) SELECT DISTINCT TRIM(cliente) FROM vendas
                WHERE TRIM(cliente) != ''
                  AND TRIM(cliente) NOT IN (SELECT nome FROM clientes)`).run();
    db.prepare(`UPDATE vendas SET cliente_id = (SELECT id FROM clientes WHERE nome = TRIM(vendas.cliente))
                WHERE cliente_id IS NULL AND TRIM(cliente) != ''`).run();
    db.prepare("INSERT INTO config (chave, valor) VALUES ('migrou_clientes','1')").run();
  })();
}

// Código sequencial C001 pros clientes que ainda não têm (migrados ou importados).
for (const { id } of db.prepare("SELECT id FROM clientes WHERE codigo = '' ORDER BY id").all()) {
  db.prepare(`UPDATE clientes SET codigo = 'C' || printf('%03d',
                (SELECT COALESCE(MAX(CAST(substr(codigo,2) AS INTEGER)),0)+1 FROM clientes WHERE codigo GLOB 'C[0-9]*'))
              WHERE id = ?`).run(id);
}

module.exports = db;
