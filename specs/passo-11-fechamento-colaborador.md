# Passo 11 — Fechamento do dia para o colaborador (+ vendedor na venda)

> Melhoria 7 do cliente. Bloco A. Carrega o **F3** (registrar quem vendeu), que o
> passo 13 (desconto) também precisa.

## Objetivo

O colaborador consegue prestar conta da gaveta no fim do expediente sem precisar
do administrador — e sem ver custo, margem ou lucro.

## Entregável

- Schema: `ALTER TABLE vendas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)`.
  Toda venda passa a gravar quem estava logado. Vendas antigas ficam `NULL` e
  aparecem como "não informado".
- Aba nova **Fechamento**, visível para o **colaborador** (o administrador
  continua vendo o mesmo bloco dentro do Dashboard, não ganha aba nova):
  - Total do dia **por forma de pagamento** (as 5) + total geral + quantidade de
    vendas.
  - **Nada de custo, margem ou lucro** — só o que entrou.
  - Do dia inteiro da loja, sem quebra por pessoa (decisão: o colaborador não vê
    quanto o colega vendeu).
- No **Dashboard do administrador**: filtro **por vendedor** no histórico de
  vendas, aplicado também na exportação Excel, com uma coluna "Vendedor".

## Fora de escopo

- Fechamento de caixa com conferência de valor contado × valor esperado
  (sangria, troco inicial). Se o cliente pedir, é passo à parte.
- Colaborador ver histórico de outros dias — só o dia corrente.

## Como testar

1. Logar como colaborador → aba **Fechamento** existe; Dashboard e Config
   continuam invisíveis.
2. Vender 3 peças em formas de pagamento diferentes → o fechamento mostra cada
   forma com o valor certo e o total batendo com a soma.
3. Conferir que em nenhum lugar da tela do colaborador aparece custo, margem ou
   lucro.
4. Logar como administrador → Dashboard → filtrar o histórico pelo colaborador →
   só as vendas dele. Exportar Excel → coluna Vendedor preenchida.
5. Vendas feitas antes da atualização aparecem como "não informado", sem quebrar
   nenhum total.
