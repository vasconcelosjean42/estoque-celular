# Passo 20 — Detalhe do lote no histórico e perdas na margem

> Melhoria 5 do cliente. Bloco C. **Depende dos passos 16 e 19.**

## Objetivo

Ver, no histórico de crédito, o que aconteceu item a item dentro de cada lote — o
que virou crédito e o que virou prejuízo — e poder incluir esse prejuízo no
cálculo de margem do mês.

## Entregável

### Histórico de crédito com dropdown

- Cada lote vira uma linha clicável que **expande** mostrando os itens.
- Cabeçalho da expansão: **"X itens creditados (R$ Y) — Z itens perdidos
  (R$ W)"**.
- Modo **item a item**: item creditado em **verde**, item perdido em **vermelho**
  com o valor da perda ao lado.
- Modo **valor total**: lista os itens sem cor (não dá para saber quais foram
  aceitos), mostrando crédito e perda totais do lote.
- Nos dois modos aparece **crédito e perda**, nunca só o crédito.

### Perdas na margem

- Dashboard ganha o interruptor **"contar perdas de troca"**, gravado na Config
  (fica como o dono deixou).
- Ligado: o lucro do período passa a descontar as perdas do período
  (`lucro das vendas − perdas`), nos cards, no gráfico e no resumo do histórico.
- Desligado: exatamente como é hoje.
- Em ambos, um rodapé mostra "perdas no período: R$ x" para o dono saber o que
  está deixando de fora.
- **Data da perda**: a perda de um lote conta no dia em que o lote foi resolvido;
  a perda de troca direta (passo 16), no dia da troca.

## Fora de escopo

- Rateio de perda por produto/categoria.
- Relatório de perdas separado do Dashboard (o bloco na aba Trocas já lista).

## Como testar

1. Resolver um lote em **item a item** com 3 aceitos e 1 recusado → no histórico
   de crédito, clicar no lote expande: 3 linhas verdes, 1 vermelha com o valor, e
   o cabeçalho "3 itens creditados (R$ x) — 1 item perdido (R$ y)".
2. Resolver outro lote por **valor total** → expande listando os itens sem cor,
   com crédito e perda totais certos.
3. Clicar de novo → fecha.
4. Dashboard com "contar perdas" **desligado** → lucro igual ao de hoje.
5. Ligar → lucro do mês cai exatamente o valor das perdas do mês; o rodapé mostra
   esse valor.
6. Fechar e reabrir o app → o interruptor continua como foi deixado.
7. Perda registrada por troca direta (passo 16) também entra quando ligado.
