# Passo 21 — Arquivar produto fora de linha

> Sugestão minha, aceita na conversa de 2026-07-24. **Sem cobrança** — entra por
> minha conta, junto com as correções de garantia.

## Objetivo

Produto que já vendeu **não pode ser excluído** (o histórico e o lucro do período
se perderiam — ver `specs/testes.md`, bug S1). O efeito colateral é que a lista
só cresce: peça de aparelho que ninguém mais tem fica atrapalhando a busca todo
dia. Arquivar tira da frente sem tocar no histórico.

## Entregável

- Schema: `pecas.arquivado INTEGER NOT NULL DEFAULT 0`.
- Botão **"Arquivar"** na linha do produto no Estoque. Quando o produto tem venda
  ou troca, é ele que aparece no lugar do aviso de "não pode excluir" (o aviso
  passa a sugerir arquivar).
- Produto arquivado **some** da lista do Estoque e da busca da Venda.
- Checkbox **"mostrar arquivados"** no Estoque → lista os arquivados em cinza,
  com botão **"Desarquivar"**.
- Histórico intacto: Dashboard, exportação, notas e trocas continuam mostrando as
  vendas do produto arquivado normalmente.
- **Sem efeito financeiro**: arquivar não gera perda, não mexe em estoque, não
  altera nenhum total. É só deixar de listar.

## Fora de escopo

- Arquivar em lote / arquivar automático por tempo sem venda.
- Zerar o estoque ao arquivar (se sobrou peça, ela continua contando no estoque —
  arquivar é organização de tela, não baixa de mercadoria).

## Como testar

1. Produto com vendas → botão **Arquivar** → some do Estoque e da busca da Venda.
2. Dashboard: as vendas antigas desse produto continuam lá, com nome e lucro
   certos.
3. Marcar "mostrar arquivados" → aparece em cinza com botão Desarquivar.
4. Desarquivar → volta a aparecer normalmente nas duas telas.
5. Conferir que nenhum total (faturamento, lucro, estoque, perdas) mudou ao
   arquivar.
6. Produto **sem** nenhuma venda continua podendo ser **excluído** de verdade.
