# Passo 17b — Lucro exato da troca e perdas na margem

> Não estava na lista das 12 melhorias. Nasceu de duas perguntas do cliente em
> 2026-07-25, e o segundo exemplo dele é que provou que a correção valia.

## O problema

Depois do passo 17 a diferença da troca entrava no faturamento com **lucro
zero**, sob o argumento "diferença é acerto de troca, não margem de venda".

Isso está certo **às vezes**. A diferença cobrada tem duas partes misturadas:

```
diferença cobrada = (custo a mais da peça entregue) + (margem nova)
```

Contar a diferença inteira como lucro mente pra cima. Contar zero mente pra
baixo. Só dá pra separar as duas se o sistema souber **quanto custou a peça de
reposição** — e ele não sabia.

## Os dois exemplos do cliente

Peça A: custo R$ 1.000, venda R$ 2.000. Vendida, depois trocada por B, com o
cliente pagando a diferença.

### Exemplo 1 — B custa R$ 1.500 e vende R$ 2.500

Diferença cobrada: R$ 500. Custo a mais: R$ 500. **Margem nova: zero.**
O comportamento antigo (lucro 0 na diferença) já acertava por coincidência.

### Exemplo 2 — B custa R$ 1.000 (igual A) e vende R$ 2.500

Diferença cobrada: R$ 500. Custo a mais: **zero**. **Margem nova: R$ 500.**
Aqui o comportamento antigo errava R$ 500 pra menos.

Foi o cliente que construiu o exemplo 2, depois de entender o 1. É ele que
justifica a coluna nova — sem ele, a correção parecia não pagar o próprio custo.

### Conferência pelo patrimônio (exemplo 2, A volta aproveitável)

| | Antes | Depois |
|---|---|---|
| Dinheiro | 0 | 2.500 |
| Estoque | A (1.000) + B (1.000) = 2.000 | A (1.000) |
| **Total** | **2.000** | **3.500** |

Lucro = R$ 1.500. ✔

## A decisão

**1. `trocas.nova_preco_compra`** — custo da peça de reposição, congelado no
momento da troca. Congelado porque a média ponderada muda `pecas.preco_compra` a
cada entrada de estoque: consultar depois daria o custo de outro dia. É a mesma
razão de `vendas.preco_compra` existir.

Com os dois lados na mão:

```
lucro da troca = diferença − (nova_preco_compra − valor_compra)
```

`valor_compra` já era o custo da peça que voltou.

**2. Vale mesmo com diferença zero.** Trocar por peça de custo maior sem cobrar
nada é prejuízo do tamanho do custo a mais. A view passou a incluir trocas com
`diferenca = 0` quando o custo da reposição é conhecido.

**3. Perdas entram no lucro, sempre.** Sem interruptor. A spec do passo 20 previa
um toggle "contar perdas de troca", mas o pedido do cliente foi o oposto: ele não
quer decidir nada, quer o número final certo. Interruptor é uma pergunta que ele
não fez. Se um dia quiser ver dos dois jeitos, é uma flag na Config.

Perda entra com `valor = 0` (não passa pela gaveta) e `lucro = −valor`. Então
**abate o lucro sem mexer no faturamento** — faturamento é dinheiro que entrou,
perda é custo.

**4. A view virou `movimentos`** (era `movimentos_caixa`). Com perdas dentro, o
nome antigo mentia: perda não é movimento de caixa.

## Os quatro números que passaram a fechar

Com A voltando aproveitável (estoque ou crédito com fornecedor) ou virando perda:

| | A volta aproveitável | A descartada |
|---|---|---|
| Exemplo 1 (B custa 500 a mais) | R$ 1.000 | R$ 0 |
| Exemplo 2 (B custa igual) | R$ 1.500 | R$ 500 |

Antes destas correções o sistema mostrava **R$ 1.000 nos quatro**.

## Fora de escopo

- **Reverter o lucro da venda original quando a peça volta.** Se A volta pro
  estoque, a venda de A registrou R$ 1.000 de lucro que, a rigor, deixou de
  existir — quem foi vendido de verdade foi B. Os totais acima já batem porque a
  margem da troca compensa, mas venda a venda o histórico continua mostrando a
  venda de A com o lucro dela. Mexer nisso é reescrever histórico de venda, o que
  o sistema evita em todo lugar.
- Rateio de perda por produto ou categoria.

## Efeito no passo 20

O passo 20 previa "perdas na margem" com interruptor. Isso foi feito aqui, sem
interruptor. **O passo 20 encolhe** para o que sobra: o dropdown de detalhe do
lote no histórico de crédito (o que virou crédito e o que virou prejuízo, item a
item). A regra "perda de lote conta no dia em que o lote foi resolvido" continua
valendo e sai de graça: a perda entra pela data de `perdas.criado_em`.

## Como testar

1. A (custo 1.000 / venda 2.000) e B (custo 1.000 / venda 2.500). Vender A,
   trocar por B cobrando R$ 500 → lucro do dia sobe **R$ 1.500**.
2. Mesmo teste com B custando 1.500 → lucro sobe **R$ 1.000** (a diferença só
   cobriu o custo).
3. Trocar por peça de custo maior **sem** diferença a cobrar → o lucro **cai** o
   custo a mais.
4. Troca com descarte → perda: o card do Dashboard mostra "perdas −R$ x (já
   descontadas)" e o lucro reflete isso; o faturamento não muda.
5. Trocas registradas antes desta atualização continuam com lucro 0 e o dinheiro
   delas segue no faturamento.

Casos 95 a 99 do `test/p0.js`; o 90 confere que o lucro do dia bate com
`margem das vendas + margem das trocas − perdas`.
