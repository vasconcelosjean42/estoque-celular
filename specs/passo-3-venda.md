# Passo 3 — Venda rápida

## Objetivo

Vender em poucos cliques: buscar a peça, confirmar preço e forma de pagamento,
estoque baixa sozinho. Erros se desfazem na hora.

## Entregável

- **Busca** no topo (igual à do Estoque). Lista mostra nome, modelo, quantidade
  disponível, preço de venda e botão grande **Vender** (desabilitado se qtd 0).
- **Painel de venda** ao clicar em Vender:
  - Quantidade (padrão 1, não pode passar do estoque).
  - Preço unitário **editável** (padrão = preço de venda; é aqui que dá desconto).
  - Mão de obra (R$, opcional, padrão vazio = 0).
  - Forma de pagamento: 4 botões — **Espécie | Pix | Crédito à vista | Crédito parcelado**.
  - Botão Confirmar → grava e volta pra busca.
- **Gravação atômica** (uma transação): baixa `pecas.quantidade` + insere em
  `vendas` com `preco_compra` congelado (custo do momento) e `forma_pagamento`.
- **Vendas de hoje** listadas abaixo da busca: hora, peça, qtd, total, forma,
  botão **Desfazer** (apaga a venda e devolve a quantidade ao estoque, com confirmação).
- Schema: coluna nova `vendas.forma_pagamento TEXT` (migração via `ALTER TABLE`
  tolerante em `db.js`); IPC ganha `window.api.tx` para rodar N comandos numa
  transação única.

## Fora de escopo

- Venda de múltiplas peças num carrinho (uma peça por venda; repetir se precisar).
- Impressão de comprovante, número de parcelas (taxa é repassada ao cliente).

## Como testar

1. Aba Venda → buscar "note" → aparece a Tela Note 10 com qtd e preço.
2. Vender 1 un., preço padrão, Pix → estoque cai 1 (confere na aba Estoque),
   venda aparece em "Vendas de hoje" com a forma Pix.
3. Vender de novo com preço editado (desconto) e mão de obra 50,00 → total reflete.
4. Tentar vender quantidade maior que o estoque → bloqueia.
5. Desfazer a última venda → some da lista e a quantidade volta ao estoque.
6. Peça com qtd 0 → botão Vender desabilitado.
