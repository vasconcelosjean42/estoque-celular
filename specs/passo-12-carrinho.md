# Passo 12 — Venda com carrinho (vários itens no mesmo pedido)

> Melhoria 8 do cliente. Bloco B, **fundação**: os passos 13 (desconto) e 14
> (clientes) penduram no pedido e só fazem sentido depois deste.

## Objetivo

Uma venda deixa de ser "uma peça por vez": o operador clica em vários produtos,
eles vão para um carrinho e no fim ele fecha um pedido único com forma de
pagamento, cliente e total.

## Decisão de schema (importante)

**Não nasce tabela `pedidos`.** `vendas` continua sendo uma linha por item — o que
mantém Dashboard, fechamento, histórico, exportação e trocas funcionando sem
reescrita — e ganha só um agrupador:

- `ALTER TABLE vendas ADD COLUMN pedido_id INTEGER`
- Migração: `UPDATE vendas SET pedido_id = id WHERE pedido_id IS NULL` — toda
  venda antiga vira um pedido de 1 item, e as telas podem agrupar sempre.
- Forma de pagamento, cliente e vendedor são repetidos em cada linha do pedido
  (já são colunas de `vendas`).
- **Mão de obra é do pedido**, gravada em uma única linha dele — assim
  `SUM(preco_venda × quantidade + mao_de_obra)` continua certo sem tocar nas
  queries do Dashboard.

## Entregável

- Tela de Venda: cada clique em **"+ Adicionar"** joga a peça no **carrinho**
  (painel lateral). No carrinho: item, quantidade ajustável, preço unitário,
  subtotal e botão remover. Adicionar a mesma peça de novo soma quantidade.
- Botão **"Finalizar venda (N itens)"** → tela de confirmação com: lista dos
  itens, mão de obra (se ligada na Config), **forma de pagamento**, **nome do
  cliente** e **total**.
- Confirmar → **uma transação só**: N inserts em `vendas` com o mesmo
  `pedido_id` + N updates de estoque. Se qualquer item ficou sem estoque
  suficiente, nada é gravado e o aviso diz qual peça.
- Lista "Vendas de hoje" agrupa por pedido: uma linha de cabeçalho (hora, total,
  forma de pagamento, cliente) e os itens embaixo.
- **Desfazer** devolve o **pedido inteiro** (todos os itens ao estoque). Desfazer
  um item isolado não existe — isso é troca, que já tem fluxo próprio.
- **Trocar** continua sendo **por item** (a troca aponta para a linha da peça).
- **Nota**: uma nota por pedido, com todos os itens na descrição.
  `ALTER TABLE notas ADD COLUMN pedido_id INTEGER` (notas antigas seguem pelo
  `venda_id`).

## Fora de escopo

- Salvar carrinho entre reinícios do app (carrinho vive na tela).
- Vários pedidos abertos ao mesmo tempo / comanda.
- Preço editável item a item — some do carrinho e volta como **desconto no
  pedido** no passo 13.

## Como testar

1. Adicionar 3 peças ao carrinho, ajustar a quantidade de uma delas, remover
   outra → carrinho e total refletem cada mexida.
2. Finalizar → confirmar com Pix → estoque das peças baixa certo, as linhas
   aparecem agrupadas em "Vendas de hoje" sob um pedido só.
3. Dashboard: faturamento e lucro do dia batem com o total do pedido; o
   fechamento por forma de pagamento contabiliza o pedido inteiro em Pix.
4. Mão de obra num pedido de 3 itens → soma **uma vez** no total.
5. Desfazer o pedido → os 3 itens voltam ao estoque e o pedido some do histórico.
6. Nota ligada → gera uma nota só, com os 3 itens listados.
7. Tentar finalizar um pedido em que uma peça não tem estoque suficiente → recusa
   dizendo qual peça, e **nenhum** item do pedido é gravado.
8. Vendas feitas antes da atualização continuam aparecendo normalmente no
   histórico e no Dashboard.
