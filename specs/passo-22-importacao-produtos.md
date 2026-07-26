# Passo 22 — Importação de produtos por planilha

> Pedido em 2026-07-26, depois de ver como o gestor já trabalha: ele recebe do
> fornecedor um pedido em Excel (`Estoque_Telas_Pedido_43091.xlsx`) e monta à
> parte uma tabela de preços de venda. Hoje ele redigitaria 214 produtos no app.

## Objetivo

Cadastrar/repor estoque a partir da planilha que ele **já tem**, sem redigitar.
Produto que já existe soma estoque; produto novo é criado. Nada entra no banco
antes de ele revisar item a item.

## O que os arquivos reais mostraram

Análise de `src/assets/produtos/` (os dois arquivos que ele mandou):

- O **pedido do fornecedor** tem tudo que importa: `Tipo`, `Qtd`, `Preço de
  compra` e um `Status` por item. 220 linhas, nenhuma célula vazia.
- A **tabela de preços** é um recorte do pedido sem os cancelados (214 linhas),
  e é onde mora o `Preço de venda` — a única informação que é decisão dele.
- `Status` tem `OK`, `CANCELADO`, `QTD ALTERADA` e `VALOR ALTERADO`. Os 6
  `CANCELADO` são exatamente os 6 que não aparecem na tabela de preços.
- O fornecedor escreve "com aro" de **duas formas no mesmo arquivo**: 73 linhas
  com `C/A` e 48 com `COM ARO`. Normalizar uma na outra não gera colisão.
- 36 nomes têm ` / ` separando **modelos compatíveis** (`A02 / A12 / A32 5G`).
  É **um** produto que serve vários aparelhos — não desmembrar em vários.
- 2 nomes vêm repetidos exatamente iguais.

## Formato aceito

Colunas mínimas (o cabeçalho pode vir em qualquer ordem; casa pelo nome):

| Coluna | Obrigatória | Vira |
|---|---|---|
| `Tipo` | sim | `pecas.nome` |
| `Modelo` (ou `Nome do produto`) | sim | `pecas.modelo` |
| `Qtd` | sim | quantidade a somar/criar |
| `Preço de compra` | sim | custo da leva |
| `Preço de venda` | não | `pecas.preco_venda` (novo sem ela fica pendente) |
| `Código` | não | casamento exato |
| `Status` | não | linha `CANCELADO` é ignorada |

Colunas a mais (`Marca`, `Tecnologia`, `Com aro`, `Total compra`, `Margem`…)
são **ignoradas sem reclamar** — o pedido do fornecedor tem várias, e todas
repetem o que já está no nome ou são derivadas.

`.xlsx` e `.csv`. O `.xlsx` é lido sem dependência nova: é um zip com XML e o
Node já traz o `zlib` (provado ao montar `modelo-importacao.xlsx`).

### Onde ele vê o formato antes de importar

A Config ganha **"Baixar planilha modelo"**, que entrega
`src/assets/produtos/modelo-importacao.xlsx` — as 5 colunas com os 214 produtos
reais dele dentro, não um exemplo inventado. Ele abre, vê o formato, e já pode
usar como base.

Junto, **"Baixar planilha do estoque"**, que gera o mesmo formato **mais a
coluna `Código`**, preenchido com o estoque atual. É esse o arquivo que ele deve
usar da segunda importação em diante (ver casamento, abaixo).

### Por que `Tipo` é obrigatório

Sem ele o gerador de código do passo 10 quebra. Ele tira 2 letras do `nome`:
com `Tipo = Tela` os 214 saem `TE001…TE214`; sem, cada produto vira um "tipo" e
os códigos saem `A0001`, `RE001`, `IP001` — inúteis pra busca.

## Casamento com o que já existe

Nesta ordem:

1. **`Código`**, quando a coluna vier preenchida. Exato.
2. **`Tipo` + `Modelo` normalizado**: caixa alta, espaços colapsados e
   `C/A` ≡ `COM ARO`. É o que salva o gestor da inconsistência do fornecedor.
3. Não casou → **produto novo**.

Nenhum casamento é definitivo antes da revisão: a tela deixa trocar "novo" por
"somar em «produto existente»" e vice-versa.

### Como o código chega até ele na prática

Ele nunca digita código. Usa o "Baixar planilha do estoque" descrito acima, que
já vem com a coluna `Código` preenchida, e só troca as quantidades pelas do
pedido novo. O casamento passa a ser exato.

Vale porque **renomear quebra o casamento por nome**: se ele trocar
`A01 C/A DIAMONDS` por `Tela A01 com aro`, a importação seguinte criaria
duplicata. Com código, não.

## Tela de revisão (modal)

Nada é gravado antes de confirmar. A lista vem ordenada por quanto exige
atenção:

1. **Preço divergente** — produto existe e a planilha traz outro preço de venda.
   Cada linha mostra `de → para` e deixa escolher **manter** ou **atualizar**,
   com um botão pra aplicar a escolha em todos de uma vez.
2. **Pendências** — sem preço de venda, quantidade inválida, `Tipo` faltando.
   Enquanto houver pendência, a linha não entra (dá pra corrigir ali mesmo).
3. **Novos** — vão ser criados. Mostra o código que cada um vai receber.
4. **Soma estoque, sem divergência** — recolhidos, só o total. Não exigem nada.

Rodapé fixo: "X novos • Y somam estoque • Z pendentes • W ignorados
(cancelados)". Botão confirma só o que está resolvido.

Linha repetida dentro da própria planilha (os 2 casos reais) aparece agrupada,
somando as quantidades, com aviso.

## Gravação

Uma transação só. Para cada linha aprovada:

- **Produto novo**: `INSERT INTO pecas` + `INSERT INTO entradas` com
  `observacao = 'importação <arquivo> <data>'`. É o mesmo caminho do cadastro
  manual, que já cria a entrada de "cadastro inicial".
- **Produto existente**: `UPDATE pecas` somando a quantidade + `INSERT INTO
  entradas`, recalculando o **custo médio ponderado** exatamente como o botão
  "+ Entrada" do passo 6b, e gravando `custo_anterior` pro desfazer funcionar.
- Preço de venda só é alterado nos itens em que ele escolheu "atualizar".

Passar por `entradas` é o ponto que não pode ser cortado: é o histórico de
compra da loja e a base do custo médio. Importação que soma estoque por fora
fura o rastro e desalinha o custo de todo produto importado.

**Desfazer sai de graça**: cada linha vira uma entrada normal, e o Estoque já
tem "desfazer entrada" item a item, revertendo quantidade e custo.

## Fora de escopo

- Desfazer a importação inteira num clique (item a item já existe).
- Atualizar nome/modelo de produto existente pela planilha — importação mexe em
  estoque e preço, não renomeia o cadastro.
- Desmembrar `A02 / A12 / A32 5G` em três produtos: é um produto só.
- Importar clientes, vendas ou trocas.
- Ler `.xls` antigo (só `.xlsx` e `.csv`).

## Como testar

1. Importar `modelo-importacao.xlsx` num banco vazio → 214 novos, todos
   `Tela`, códigos `TE001…TE214`, estoque somando **2862**.
2. Importar o **mesmo arquivo de novo** → 214 linhas em "soma estoque", nenhum
   novo, estoque vai a 5724 e cada produto ganha uma segunda entrada.
3. Editar uma linha da planilha pra um preço de venda diferente e importar → ela
   aparece **no topo** como divergente; escolher "manter" não muda o preço,
   "atualizar" muda.
4. Importar o pedido cru (`Estoque_Telas_Pedido_43091.xlsx`) → os 6 `CANCELADO`
   aparecem como ignorados e não entram.
5. Renomear um produto no app e reimportar a planilha **com** a coluna Código →
   ainda casa e soma no produto certo.
6. Linha sem preço de venda → fica pendente, e confirmar não a cria.
7. Depois de importar, "desfazer entrada" naquele produto devolve quantidade e
   custo de compra ao que eram antes.
8. Conferir que faturamento, lucro e perdas não mudaram: importação é compra,
   não venda.
