# Passo 28 — Dias sem comprar, com alerta de cor

> Pedido do cliente em 2026-08-27 (item 1 de 2).

## Objetivo

A funcionária precisa ligar pros clientes que sumiram. Hoje a tela de Clientes
mostra a **data** da última compra — e ela tem que fazer a conta de cabeça, linha
por linha, pra saber quem já está parado. Nessa loja o cliente típico é revenda e
técnico, que compram quase todo dia; dois dias sem aparecer já é sinal de que foi
comprar em outro lugar.

Além disso a lista de Clientes só existe dentro da Config, que é do
administrador. **Quem liga é ela**, e ela não tem como chegar lá.

## Entregável

### 1. Coluna "Dias sem comprar"

Última coluna da tabela de clientes, ordenável como as outras:

| Situação | Mostra | Cor |
|---|---|---|
| Comprou hoje | `hoje` | nenhuma |
| 1 dia | `1 dia` | laranja (`#ffedd5` / `#c2410c`) |
| 2 dias ou mais | `N dias` | vermelho (`#fee2e2` / `#b91c1c`) |
| Nunca comprou | `—` | nenhuma |

Uma legenda com as duas cores fica acima da tabela, montada com a mesma tag da
coluna — cor que mudar num lugar muda nos dois.

### 2. Aba Clientes pro colaborador

`Estoque · Venda · Clientes · Fechamento`. Mesma tela do administrador, **sem os
botões Editar e Excluir**: mexer no cadastro continua sendo trabalho de quem tem
a Config. A coluna Contato vai junto — é o telefone que ela vai discar.

O administrador não ganha aba nova: ele continua vendo a lista dentro da Config,
onde ela sempre morou, agora com a coluna a mais.

## Decisões

- **Dia de calendário, não 24 horas.** Quem comprou ontem às 23h conta 1 dia hoje
  de manhã. É como a loja fala, e é o que faz a cor bater com a intuição dela.
  Em SQL: `julianday(date('now','localtime')) - julianday(date(MAX(criado_em)))`.
- **Quem comprou hoje não acende nada.** O alerta é sobre ausência; pintar quem
  está em dia gastaria a atenção que a cor deve chamar.
- **Um clique na coluna já ordena do maior pro menor.** Nas outras colunas o
  primeiro clique é crescente; aqui crescente traria quem comprou hoje pro topo,
  que é o oposto da lista de ligações. É a ordem em que ela trabalha.
- **Quem nunca comprou vai pro fim, nas duas direções.** Sem compra não há dia
  pra contar, e encher o topo da lista de quem não tem o que cobrar atrapalha.
- **Sem "não perturbe" nem registro de ligação.** Não foi pedido; a tela é pra
  olhar e discar.
- **O corte é fixo em 1 e 2 dias**, não configurável. É o número que o cliente
  deu; virar campo na Config seria abstração especulativa.

## Fora de escopo

- Marcar que o cliente já foi contatado, agendar retorno, histórico de ligação.
- WhatsApp / discagem direta pelo sistema.
- Notificação ou aviso automático quando alguém passa dos 2 dias.
- Deixar o corte de dias configurável.

## Como testar

1. Criar clientes com compras de hoje, ontem, anteontem e de vários dias atrás →
   `hoje` sem cor, `1 dia` laranja, `2 dias` e `9 dias` vermelhos.
2. Criar cliente sem compra nenhuma → `—`, sem cor, e o título "nunca comprou".
3. Clicar em "Dias sem comprar" → quem sumiu há mais tempo encabeça a lista e
   quem nunca comprou fica por último.
4. Entrar como colaborador → a aba Clientes existe, mostra os mesmos dias e as
   mesmas cores, tem a coluna Contato e **não** tem Editar/Excluir nem Config.
5. Entrar como administrador → nenhuma aba nova; a coluna está na Config.

Casos 156, 157 e 158 da bateria P0 (`test/p0.js`).
