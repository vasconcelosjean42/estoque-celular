# Passo 19 — Crédito parcial do lote (valor total ou item a item)

> Melhoria 4 do cliente. Bloco C. **Depende do passo 16** (tabela `perdas`).

## Objetivo

Hoje, "Lote retornou → gerar crédito" assume que o fornecedor aprovou **tudo** e
credita a soma cheia do lote. Na prática nem todo item é aceito: parte vira
crédito, parte vira prejuízo — e esse prejuízo precisa aparecer.

## Entregável

- Schema:
  - `trocas.creditada INTEGER NOT NULL DEFAULT 0` — 1 = o fornecedor aceitou.
  - `lotes.modo TEXT` — `total` ou `itens`; `lotes.credito INTEGER`;
    `lotes.perda INTEGER`.
- Clicar em **"Lote retornou"** abre um **modal** com duas formas de fechar:
  - **Valor total** — digita quanto o fornecedor creditou (ex.: lote de R$
    500,00, crédito de R$ 320,00). A diferença (R$ 180,00) vira **perda**.
  - **Item a item** — lista as peças do lote com checkbox. Marcadas = aceitas; o
    crédito é a soma do `valor_compra` delas e o rodapé do modal mostra ao vivo
    "crédito R$ x — perda R$ y". As desmarcadas viram perda, uma linha por item.
- Confirmar → **uma transação**: lote vira `resolvido`, crédito entra em
  `creditos` e as perdas entram em `perdas` (com o `troca_id` de cada item no
  modo item a item).
- O crédito de um lote nunca passa do valor do lote — o modal recusa valor maior.

## Fora de escopo

- Crédito parcial **dentro** de um item (fornecedor aceitar a peça mas creditar
  só metade do valor dela). Se acontecer, usa-se o modo "valor total".
- Devolução física da peça recusada pelo fornecedor.

## Como testar

1. Fechar um lote com 4 peças (R$ 500,00 no total) e clicar em "Lote retornou".
2. **Valor total**: digitar R$ 320,00 → crédito de R$ 320,00 no histórico, perda
   de R$ 180,00 no bloco Perdas, lote marcado como resolvido.
3. Refazer com outro lote em **item a item**: marcar 3 de 4 → rodapé mostra o
   crédito das 3 e a perda da 4ª antes de confirmar; confirmar gera exatamente
   esses valores.
4. Saldo de crédito com o fornecedor sobe só pelo valor creditado.
5. Tentar creditar mais que o valor do lote → recusado.
6. Lote sem nenhum item aceito → crédito zero, lote inteiro em perda.
