# Passo 23 — Linha de totais no topo do Estoque

> Pedido do cliente em 2026-07-26 (item 1 de 3).

## Objetivo

O administrador abre o Estoque e quer saber, sem exportar nada: quanto tem de
mercadoria, quanto ela custou, quanto ela vale vendida e qual a margem disso.
Hoje esses números só existem produto a produto.

## Entregável

Uma linha fixa no **topo da tabela de produtos**, dentro do cabeçalho, alinhada
com as colunas que já existem:

| Coluna | Mostra |
|---|---|
| Produto | `Totais (N produtos)` |
| Qtd | soma das quantidades em estoque |
| Compra | Σ `quantidade × preco_compra` |
| Venda | Σ `quantidade × preco_venda` |
| Margem | `total venda − total compra` e o % sobre o total de compra |

## Decisões

- **"Total de itens" = soma das quantidades**, não número de produtos. Os dois
  aparecem: a contagem de produtos vai entre parênteses na célula do nome.
- **Compra e venda são multiplicados pela quantidade.** Somar preço unitário não
  significaria nada; o que o dono quer saber é quanto dinheiro está parado na
  prateleira e quanto ele vira se vender tudo.
- **A margem é a do estoque inteiro** (`total venda − total compra`), não a média
  aritmética das margens de cada produto. Média simples deixa um produto de
  margem 300% com 1 unidade pesar igual a uma tela de margem 40% com 50
  unidades — e o número não bateria com os dois totais exibidos ao lado dele.
- **Acompanha o filtro.** Buscar "tela" mostra os totais só das telas listadas.
  É o que torna a linha útil: dá pra ver quanto vale cada família de produto.
- **Arquivado só entra quando "mostrar arquivados" está marcado** — a linha soma
  exatamente o que está na tela.
- **Só o administrador vê.** O colaborador não tem as colunas Compra e Margem;
  mostrar a linha vazaria o custo.

## Fora de escopo

- Totais das entradas / do período (a tabela de baixo não muda).
- Exportar os totais, gráfico de evolução do valor do estoque.
- Contar estoque negativo de forma especial (entra na soma como está).

## Como testar

1. Cadastrar dois produtos e buscar por um prefixo comum → a linha mostra
   2 produtos, a soma das quantidades e os dois valores multiplicados pela
   quantidade.
2. Apertar mais o filtro pra sobrar um produto → todos os números caem para os
   daquele produto.
3. Arquivar um deles → sai dos totais; marcar "mostrar arquivados" → volta.
4. Entrar como colaborador → a linha de totais não existe.
