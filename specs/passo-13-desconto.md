# Passo 13 — Desconto com autorização por PIN

> Melhoria 11 do cliente. Bloco B. **Depende do passo 12** (o desconto é do
> pedido) e do passo 11 (`usuario_id` na venda).

## Objetivo

Dar desconto na hora de fechar a venda, com rastro de quem autorizou: o
administrador dá à vontade, o colaborador precisa que um administrador digite o
PIN de permissão dele.

## Entregável

- Schema:
  - `usuarios.pin_permissao TEXT NOT NULL DEFAULT ''` — 4 dígitos, **único**
    entre os preenchidos (índice único parcial). É diferente do PIN de login.
  - `vendas.desconto INTEGER NOT NULL DEFAULT 0` — centavos, do pedido inteiro,
    gravado em **uma linha só** dele (mesma regra da mão de obra).
  - `vendas.desconto_por INTEGER REFERENCES usuarios(id)` — quem autorizou.
- Na tela de confirmação da venda, botão **"Aplicar desconto"** → escolhe entre:
  - **Porcentagem** (ex.: 10% → desconta do total), ou
  - **Valor final** (ex.: total 187,00 → digita 180,00 → desconto de 7,00).
  - O total recalcula na hora, mostrando "Desconto: −R$ x,xx".
- **Permissão**:
  - Logado como administrador → aplica direto, `desconto_por` = ele mesmo.
  - Logado como colaborador → abre pedido de **PIN de permissão**; o sistema
    valida contra os administradores e grava `desconto_por` = o admin do PIN.
    PIN errado → recusa, sem desconto.
- **Config → Usuários**: cada administrador cadastra seu PIN de permissão.
  PIN repetido é recusado (é ele que identifica quem liberou).
- **Tag**: pedido com desconto > 0 aparece marcado com uma etiqueta
  **"desconto"** na lista de vendas e no histórico do Dashboard.
- **Dashboard**: filtro "só pedidos com desconto", e coluna com o valor do
  desconto e quem autorizou (inclusive na exportação Excel).
- Faturamento e lucro passam a descontar: as fórmulas viram
  `SUM(preco_venda × quantidade + mao_de_obra − desconto)`.

## Fora de escopo

- Teto de desconto por colaborador (ex.: "no máximo 10%") — se o cliente quiser,
  é passo à parte.
- Desconto item a item: é sempre sobre o total do pedido.
- PIN com criptografia: continua texto puro, como os PINs de hoje — é controle
  operacional, não segurança bancária.

## Como testar

1. Config → cadastrar PIN de permissão para o administrador. Tentar repetir o
   mesmo PIN em outro admin → recusado.
2. Logado como administrador: fechar venda de R$ 200,00 com 10% → total R$
   180,00, desconto R$ 20,00 gravado, tag "desconto" na linha.
3. Mesma venda usando **valor final** R$ 180,00 → desconto calculado igual.
4. Logado como colaborador: aplicar desconto → pede PIN. PIN errado → recusa.
   PIN certo → aplica e grava o **administrador dono do PIN** como autorizador.
5. Dashboard: filtrar "com desconto" → só esses pedidos; o lucro do período
   reflete o desconto (menor que sem ele).
6. Exportar Excel → colunas de desconto e de quem autorizou preenchidas.
