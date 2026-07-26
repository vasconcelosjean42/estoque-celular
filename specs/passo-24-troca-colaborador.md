# Passo 24 — Colaborador faz e desfaz trocas

> Pedido do cliente em 2026-07-26 (item 2 de 3): "é muito comum de eles fazerem".

## Objetivo

Trocar peça no balcão é rotina do colaborador, não do dono. Hoje o botão
**Trocar** na venda só aparece pro administrador, então o cliente espera o dono
chegar (ou o colaborador entra com o login do dono, que é pior: a venda e a
troca saem no nome errado).

## Entregável

- O botão **Trocar** na venda e o **Desfazer** da linha de troca passam a
  aparecer também pro colaborador.
- **Sem PIN de autorização.** É operação de balcão, não desconto.
- A **aba Trocas continua escondida** do colaborador: prateleira, lotes, crédito
  com fornecedor e perdas são gestão do dono.
- Clicando em Trocar, o colaborador cai direto no formulário de troca daquela
  venda (o mesmo do administrador) e, ao salvar ou cancelar, **volta pra Venda** —
  nunca chega na tela de Trocas.
- No formulário, o colaborador **não vê o campo "Valor de compra"** nem o valor
  na mensagem de descarte: é custo, e a regra de sempre é que colaborador não vê
  custo. O valor continua sendo gravado (vem do custo congelado da venda).

## Decisões

- **Nada de PIN, nem de trilha de auditoria nova.** O cliente pediu explicitamente
  sem senha; a troca já fica ligada à venda, que grava `usuario_id` desde o passo
  11 — dá pra saber de quem foi a venda de origem.
- **Desfazer também libera.** Errar a peça de reposição na hora é comum; se só o
  dono pudesse desfazer, o colaborador registraria uma segunda troca por cima pra
  se acertar, e o estoque ficaria errado nos dois lados.
- **Estorno continua disponível junto** — é o mesmo formulário. Devolver dinheiro
  é parte do mesmo atendimento de balcão.
- **A aba Trocas não vira permissão configurável.** Um nível a mais de permissão
  por tela é complexidade que ninguém pediu.

## Fora de escopo

- Colaborador fechar lote, resolver lote, abater crédito ou registrar peça
  defeituosa avulsa (tudo isso mora na aba Trocas, que continua do dono).
- Relatório de "quem fez cada troca".

## Como testar

1. Entrar como colaborador → a aba **Trocas** continua não existindo.
2. Vender uma peça → o botão **Trocar** aparece na venda.
3. Trocar por outra peça → nenhuma senha é pedida, o estoque anda nos dois
   produtos e a tela volta pra Venda (sem passar pela prateleira).
4. No formulário, conferir que **não** existe campo "Valor de compra".
5. **Desfazer** a troca pela linha da troca → estoque volta ao que era.
6. Entrar como administrador → tudo continua igual pra ele.
