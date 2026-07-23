# Passo 6b — Entrada de estoque

## Objetivo

Registrar chegada de mercadoria com histórico, em vez de editar a quantidade na
mão: quando entrou, quanto entrou, a quanto foi comprada.

## Entregável

- Botão **"+ Entrada"** em cada linha do Estoque → formulário: quantidade
  recebida, preço de compra da leva (R$, pré-preenchido com o atual),
  observação opcional (ex.: fornecedor, "compra com crédito").
- Confirmar → **transação**: soma a quantidade na peça, recalcula o
  `preco_compra` pelo **custo médio ponderado móvel** (padrão dos ERPs:
  `(qtd_atual×custo_atual + qtd_leva×custo_leva) ÷ total`) e grava na tabela
  `entradas` com o preço da leva. Editar a peça na mão continua sobrescrevendo
  o custo direto (correção do dono).
- **Últimas entradas** (20 mais recentes) listadas abaixo da tabela do Estoque:
  data, peça, qtd, preço de compra, observação.
- Schema: tabela nova `entradas (peca_id, quantidade, preco_compra, observacao,
  criado_em)`.

## Fora de escopo

- Desfazer entrada (editar a peça resolve), pedido de compra, vínculo
  automático com abate de crédito do fornecedor (pode citar na observação).

## Como testar

1. Estoque → "+ Entrada" numa peça → qtd 5, preço de compra novo (ex.: 110,00),
   obs "leva julho" → quantidade da peça sobe 5, preço de compra vira 110,00,
   margem recalcula.
2. Entrada aparece em "Últimas entradas" com data e observação.
3. Fechar e reabrir → histórico persiste.
