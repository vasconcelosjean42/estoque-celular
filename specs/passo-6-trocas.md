# Passo 6 — Trocas (garantia com fornecedor)

## Objetivo

Controlar o ciclo da peça defeituosa: entra na prateleira → fecha lote → envia
ao fornecedor → retorno vira **crédito** (valor de compra). Contador de 40 dias
pra não perder o prazo de garantia.

## Fluxo real (respostas 1 e 4 do AGENTS.md)

Cliente devolve peça defeituosa → na maioria das vezes leva **peça nova do
mesmo modelo na hora** (sai do estoque). A defeituosa fica na prateleira até
fechar um lote pro fornecedor. Fornecedor responde em até 40 dias → o valor
das peças do lote vira **crédito** pra abater em compras futuras.

## Entregável

- **Registrar defeituosa**: modelo, defeito, observação (opcional), valor de
  compra (R$). Pode vincular a uma peça do estoque (preenche modelo/valor
  sozinho) e marcar **"entreguei peça nova ao cliente"** → baixa 1 do estoque.
- **Prateleira**: lista das defeituosas ainda sem lote, com **dias na
  prateleira** — âmbar a partir de 30 dias, vermelho a partir de 40. Excluir
  registro (com confirmação).
- **Fechar lote**: marcar peças da prateleira (checkbox) → "Fechar lote e
  enviar" → lote com data de envio e valor total.
- **Lotes enviados**: lista com data, qtd de peças, valor; botão **"Lote
  retornou → gerar crédito"** → soma o valor do lote ao saldo de crédito.
- **Crédito com fornecedor**: card com o saldo; botão "Abater crédito" (valor +
  descrição) pra quando usar o crédito numa compra. Histórico de
  entradas/abates.
- Schema: `trocas` ganha `valor_compra` e `peca_id` (opcional); `lotes` ganha
  `resolvido_em`; tabela nova `creditos` (valor ±, descricao, criado_em).
  Saldo = SUM(valor), derivado.

## Fora de escopo

- Troca por outra peça com diferença paga → registrar como venda normal com
  preço editado (já existe na tela Venda).
- Estorno de peça funcionando → devolver a quantidade na tela Estoque (editar a
  peça) e desfazer a venda se for do dia; fluxo automático fica pra depois se
  o cliente sentir falta.

## Como testar

1. Aba Trocas → registrar defeituosa vinculada à peça do estoque, marcando
   "entreguei peça nova" → estoque baixa 1, item aparece na prateleira com 0 dias.
2. Registrar outra defeituosa avulsa (sem vínculo) digitando modelo e valor.
3. Marcar as duas → fechar lote → somem da prateleira, lote aparece em
   "enviados" com o valor somado.
4. "Lote retornou" → saldo de crédito sobe o valor do lote.
5. Abater 50,00 do crédito com descrição → saldo desce, histórico mostra.
