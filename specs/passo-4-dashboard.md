# Passo 4 — Dashboard

## Objetivo

O dono bate o olho e sabe: quanto entrou hoje (e por qual forma de pagamento),
quanto faturou e lucrou na semana/mês/ano, e o histórico completo de vendas.

## Entregável

- **Cards de período** (faturamento + lucro em cada): Hoje | Últimos 7 dias |
  Este mês | Este ano. Faturamento = venda × qtd + mão de obra; lucro =
  (venda − compra) × qtd + mão de obra. Tudo derivado por query, nada armazenado.
- **Fechamento do dia**: total de hoje por forma de pagamento (espécie / Pix /
  crédito à vista / parcelado) — pra conferir a gaveta e o extrato.
- **Gráfico simples**: barras de faturamento por dia, últimos 14 dias
  (divs coloridas, sem biblioteca).
- **Histórico completo**: tabela de todas as vendas (data/hora, peça, qtd,
  total, forma, lucro), mais recente primeiro.

## Fora de escopo

- Filtros por período customizado, exportação, comparativos. Esconder lucro por
  nível de usuário fica pro passo 7.

## Como testar

1. Aba Dashboard → cards mostram os valores das vendas já feitas no teste do passo 3.
2. Fazer uma venda nova em Pix → voltar ao Dashboard → card Hoje e a linha Pix
   do fechamento sobem na hora.
3. Desfazer essa venda na aba Venda → Dashboard reflete a remoção.
4. Histórico lista todas as vendas com lucro por linha.
