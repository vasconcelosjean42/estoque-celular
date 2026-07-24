# Passo 15 — Troca de peça que está funcionando

> Melhoria 9 do cliente. Bloco C (primeiro, é o mais simples). Já estava previsto
> na dúvida 4 do AGENTS.md ("devolve funcionando: a peça volta ao estoque").

## Objetivo

Nem toda troca é defeito: às vezes o cliente comprou a peça errada, ou desistiu,
e devolve a peça **boa**. Hoje o sistema manda tudo para a prateleira do
fornecedor, o que suja a prateleira e esconde estoque bom.

## Entregável

- Schema: `trocas.defeituosa INTEGER NOT NULL DEFAULT 1`.
- No formulário de troca, escolha do **estado da peça devolvida**:
  - **Com defeito** (padrão) → fluxo de hoje: vai para a prateleira, aguarda
    lote do fornecedor.
  - **Funcionando** → a peça devolvida **volta ao estoque** (+1 na peça
    original), **não entra na prateleira**, não tem fornecedor nem perda. O campo
    "Defeito" some do formulário.
- Nos dois casos, a peça de reposição escolhida continua saindo do estoque (−1).
- A troca continua sendo gravada em `trocas` e agrupada embaixo da venda, para o
  histórico ficar completo.
- A prateleira passa a listar só `defeituosa = 1`; o contador de 40 dias e o
  fechamento de lote não enxergam peça funcionando.
- **Desfazer** a troca reverte os dois movimentos de estoque.

## Fora de escopo

- Recalcular o custo médio da peça que voltou (volta com o custo que a peça tem
  hoje — a distorção é de centavos e não vale a complexidade).
- Estorno em dinheiro em vez de reposição: é o passo 18.

## Como testar

1. Vender uma peça A. Na venda → **Trocar** → marcar **Funcionando**, repor com a
   peça B → estoque de A **+1**, estoque de B **−1**.
2. Aba Trocas → a peça **não** aparece na prateleira e não conta no contador de
   40 dias.
3. A venda mostra a troca agrupada embaixo, como hoje.
4. Desfazer a troca → A volta a −1 e B volta a +1 (estoque como antes).
5. Repetir marcando **Com defeito** → comportamento de hoje, peça na prateleira.
6. Fechar lote → só as defeituosas entram.
