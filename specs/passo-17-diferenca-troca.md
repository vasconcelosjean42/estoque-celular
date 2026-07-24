# Passo 17 — Forma de pagamento na diferença da troca

> Melhoria 3 do cliente. Bloco C.

## Objetivo

Hoje, quando o cliente troca por uma peça mais cara, a tela mostra "você recebe
+R$ 40,00" — e **só**. Esse dinheiro entra na gaveta e o sistema não sabe: não
está no fechamento do dia, não está no faturamento, não está em lugar nenhum. Na
hora de conferir o caixa, sobra dinheiro sem explicação.

## Decisão (confirmada com você)

A diferença **entra e sai do fechamento do dia**, com forma de pagamento. O caixa
tem que bater com o dinheiro real da gaveta.

## Entregável

- Schema:
  - `trocas.diferenca INTEGER NOT NULL DEFAULT 0` — centavos. **Positivo** = a
    loja recebeu; **negativo** = a loja devolveu.
  - `trocas.forma_pagamento TEXT` — por onde o dinheiro entrou/saiu.
- No formulário de troca, quando existe diferença, aparecem os **5 botões de
  forma de pagamento** (mesmos da venda), obrigatórios. Diferença zero → nem
  aparece.
- **Fechamento do dia** (Dashboard e aba Fechamento do colaborador) passa a somar
  as diferenças do dia junto com as vendas, na forma de pagamento certa. Uma
  diferença negativa **reduz** o valor daquela forma.
- Faturamento do período passa a incluir as diferenças.
- A aba Trocas mostra a diferença e a forma de pagamento em cada troca.

## Nota técnica

É aqui que o fechamento deixa de ler só a tabela `vendas`: passa a ser a soma de
**vendas + diferenças de troca** (e, no passo 18, + estornos). Vale isolar essa
consulta num lugar só, porque três telas usam ela.

## Fora de escopo

- Diferença parcelada ou paga em duas formas.
- Diferença entrar no cálculo de **lucro** (é dinheiro de acerto de troca, não
  margem de venda) — só faturamento e fechamento.

## Como testar

1. Troca com peça mais cara (diferença +R$ 40,00) paga em Pix → o Pix do
   fechamento do dia sobe R$ 40,00.
2. Troca com peça mais barata (diferença −R$ 15,00) devolvida em espécie → a
   espécie do fechamento cai R$ 15,00.
3. Troca sem diferença → nada muda no fechamento, e os botões de forma de
   pagamento nem aparecem.
4. Tentar salvar uma troca com diferença sem escolher forma de pagamento →
   recusa com aviso.
5. Conferir que o total do fechamento bate com vendas + diferenças do dia.
6. Trocas registradas antes da atualização continuam sem diferença e não mexem em
   nenhum total.
