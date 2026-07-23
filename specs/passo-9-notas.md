# Passo 9 — Nota (recibo) após a venda

Feature **opcional**, ligada por flag na Config. Desligada (padrão), o app
funciona exatamente como hoje. Ligada, ao confirmar uma venda o operador pode
gerar um **recibo em PDF** (nota não fiscal) e imprimir/salvar.

Origem: porta a lógica do sistema Python já validado e vendido
(`projetos/sistema-de-notas-03/main-7.py`) — **só a geração de nota**. O
original era exclusivo para celular (IMEI, capacidade, garantia); aqui se vende
peça e serviço, então **esses campos não entram** — a nota usa só os dados que
já temos da venda.

## O que aproveitamos do original

- Layout de **recibo térmico 80mm**: logo, cabeçalho da loja (nome, endereço,
  telefone, email), título "NOTA NÃO FISCAL", data + número, dados do cliente,
  item + valor, total, rodapé "Obrigado pela preferência". Marca d'água
  opcional (10% de opacidade, centralizada).
- Config da loja editável e reimpressão pelo histórico.

## O que NÃO entra (era só p/ celular)

- IMEI1 / IMEI2 e sua validação de 15 dígitos.
- Capacidade (64GB…2TB).
- Garantia (30/60/90 dias, etc.).

## Como adapta ao nosso produto

- **Não recria a venda.** A venda já existe (tela Venda) com peça, quantidade,
  preço, forma de pagamento e **cliente** (campo já adicionado). A nota é um
  passo **posterior e opcional** que consome a venda.
- **Quase tudo auto-preenchido**: descrição (`Nx <peça> <modelo>`), valor total
  e cliente vêm da venda. O único campo digitável é o **contato do cliente**
  (email ou telefone), que a venda não guarda — e é opcional.
- **Dinheiro em centavos** (nosso padrão), não float.
- **PDF sem dependência nova**: Electron gera PDF nativo. Ver decisão abaixo.

## Flag na Config

- `nota_ativa` ('0'/'1', padrão '0') no `config`. Bloco "Nota / recibo" na tela
  Config com o checkbox e os dados da loja da nota (ver schema). Reaproveita o
  **logo** que já existe na Config (data URI).
- Flag OFF → nenhuma mudança na tela Venda. Flag ON → botão "Gerar nota"
  aparece após confirmar a venda.

## Geração do PDF — decisão técnica

Não portar `reportlab`. Montar o recibo como **HTML** (largura 80mm, CSS
`@page { size: 80mm auto }`) e:

- **Imprimir direto**: `window.print()` numa janela/rota só do recibo — abre o
  diálogo do sistema, que imprime na térmica OU salva como PDF. Zero
  dependência, e é o caminho mais útil pra quem tem impressora térmica.
- **Arquivar PDF** (p/ reimpressão): `win.webContents.printToPDF()` no main,
  salva o arquivo em `userData/notas/` e guarda o caminho na tabela `notas`.

`ponytail:` começar só com `window.print()` (cobre imprimir E salvar-como-PDF
pelo diálogo). O arquivamento automático via printToPDF entra se o cliente
pedir histórico de PDFs — a reimpressão pode só re-renderizar da tabela `notas`.

## Schema

Config da loja (chaves novas em `config`, todas texto):
`nota_ativa`, `nota_loja_nome`, `nota_loja_endereco`, `nota_loja_telefone`,
`nota_loja_email`, `nota_marca_dagua` (data URI, opcional), `nota_rodape`.

Tabela nova (snapshot da nota — não depende de a venda continuar existindo):

```
notas (
  id           INTEGER PRIMARY KEY,
  venda_id     INTEGER REFERENCES vendas(id), -- origem (pode ser NULL se avulsa)
  numero       INTEGER NOT NULL,     -- sequencial legível (0001, 0002…)
  cliente_nome TEXT NOT NULL DEFAULT '',
  cliente_contato TEXT NOT NULL DEFAULT '', -- email ou telefone
  descricao    TEXT NOT NULL,        -- "1x Tela iPhone 13"
  valor_total  INTEGER NOT NULL,     -- centavos
  criado_em    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
)
```

`numero` sequencial = `SELECT COALESCE(MAX(numero),0)+1 FROM notas` (recibo
profissional pede número que cresce; melhor que o uuid8 do original).

## Fluxo do usuário

1. Config → liga "Nota / recibo", preenche dados da loja uma vez.
2. Venda → confirma normal. Com a flag ON, abre um diálogo "Gerar nota?" já com
   cliente, descrição e valor preenchidos da venda; operador só completa o
   contato (opcional) e confirma.
3. Recibo renderiza (80mm) → `window.print()` → imprime ou salva PDF.
4. Reimpressão: pela lista de notas (ou pelo histórico do Dashboard, botão
   "Nota" na linha da venda que tiver nota).

## Fora de escopo

- Nota fiscal eletrônica / SEFAZ / emissão fiscal real. Isto é **recibo não
  fiscal**, igual ao original.
- Campos de celular (IMEI, capacidade, garantia) — removidos de propósito.
- Multi-item por nota (a venda é 1 item por confirmação, mapeia 1:1).
- Envio por email/WhatsApp — pode virar melhoria futura.

## A confirmar com o cliente

- Imprime em térmica 80mm (como o original) ou folha A4? Muda só o CSS.
- Quer arquivo PDF salvo automático de cada nota, ou basta imprimir/salvar na
  hora pelo diálogo?

## Como testar

1. Config OFF → Venda funciona idêntica a hoje, sem botão de nota. `npm test`
   verde sem tocar no fluxo atual.
2. Config ON + dados da loja → vender → "Gerar nota" → recibo com cabeçalho da
   loja, cliente, item, total e número sequencial; imprimir/salvar PDF abre o
   diálogo.
3. Reimprimir uma nota → mesmo conteúdo, mesmo número.
