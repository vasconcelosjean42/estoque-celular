# Passo 18 — Estorno na troca (devolver o dinheiro)

> Melhoria 10 do cliente. Bloco C. **Depende do passo 17** (usa a mesma soma de
> caixa) e do passo 15 (estado da peça devolvida).

## Objetivo

Nem sempre dá para repor: pode não ter a peça em estoque, ou o cliente prefere o
dinheiro de volta. Hoje o sistema não tem como registrar isso.

## Decisão (confirmada com você)

O estorno **sai do fechamento do dia em que foi feito**, com forma de pagamento.
A venda original **continua no histórico** — não some, não é reescrita. Faturamento
de mês passado não muda por causa de devolução feita hoje.

## Entregável

- Schema:
  - `trocas.estorno INTEGER NOT NULL DEFAULT 0` — centavos devolvidos ao cliente.
  - Usa o `trocas.forma_pagamento` criado no passo 17 (por onde o dinheiro saiu).
- No formulário de troca, terceira opção de desfecho, ao lado de "repor peça":
  **"Estornar o valor"** → mostra o valor pago na venda (já com desconto, se
  teve), editável, e pede a forma de pagamento.
- Destino da peça devolvida segue as regras já existentes:
  - Funcionando (passo 15) → volta ao estoque.
  - Com defeito → prateleira do fornecedor ou perda (passo 16).
- Nenhuma peça de reposição sai do estoque (não teve reposição).
- **Fechamento do dia** mostra a saída na forma de pagamento escolhida.
- A venda aparece marcada como **"estornada"** na lista e no histórico, com o
  valor devolvido.

## Fora de escopo

- Estorno parcial de um pedido com vários itens (estorna o item trocado).
- Estorno de taxa de maquininha (a taxa é repassada ao cliente, conforme
  AGENTS.md).

## Como testar

1. Vender uma peça por R$ 200,00 em Pix. Trocar → **Estornar o valor** → R$
   200,00 em Pix → o Pix do fechamento do dia cai R$ 200,00.
2. A venda continua no histórico do Dashboard, marcada como estornada.
3. Peça devolvida marcada como **funcionando** → volta ao estoque.
4. Peça devolvida **com defeito, sem fornecedor** → entra em Perdas, não volta ao
   estoque.
5. Estorno de venda de ontem → sai do fechamento de **hoje**, e o faturamento de
   ontem **não** muda.
6. Estornar com valor diferente do pago (ex.: R$ 180,00 de R$ 200,00) → sai
   exatamente o valor digitado.
