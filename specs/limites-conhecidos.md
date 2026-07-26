# Limites conhecidos e atalhos deliberados

Coisas que o sistema **não** faz hoje porque decidimos que não valia o custo
agora — não são bugs. Cada uma tem o teto anotado e o caminho de saída, pra
daqui a dois anos ninguém achar que foi descuido.

No código, os mesmos pontos estão marcados com um comentário `ponytail:`.
Pra listar todos: `grep -rn "ponytail:" src/ electron/`.

## Volume de dados

### Notas carregadas inteiras — `src/telas/Venda.jsx`

A aba Venda faz `SELECT * FROM notas` e monta um mapa `pedido_id → nota`, só
pra saber se cada pedido da tela já tem nota (botão "Nota" × "Reimprimir") e
poder reimprimir.

A lista mostra só o período filtrado — por padrão o dia de hoje, umas 15 vendas.
Mas carrega todas as notas já emitidas na vida da loja.

- **Só roda com a flag de nota ligada** (padrão é desligada).
- **Aperta**: por volta de 5.000 notas. Com ~15/dia, uns 3–4 anos de uso.
- **Gargalo real**: a serialização por IPC do processo principal pro renderer,
  não o SQLite. O campo `descricao` tem uma linha por item do pedido.
- **Sintoma**: a aba Venda demorando pra abrir.
- **Saída** (~10 linhas): a tela já tem os pedidos visíveis na mão, então
  `SELECT * FROM notas WHERE pedido_id IN (…)`.
- **Como medir**: `SELECT COUNT(*) FROM notas`.

### Itens de lote carregados inteiros — `src/telas/Trocas.jsx`

A aba Trocas carrega as peças de **todos** os lotes já enviados, pra alimentar o
dropdown do passo 20 — mesmo sem clicar em lote nenhum.

- **Aperta**: muito depois das notas. Com ~20 peças/mês, uns 240/ano.
- **Saída** (~10 linhas): carregar no clique, com `WHERE lote_id = ?`.

## Comportamento

### Carrinho vive na tela da Venda — `src/telas/Venda.jsx`

Trocar de aba no meio de uma venda esvazia o carrinho. É o atalho com maior
chance de incomodar na prática.

- **Saída**: subir o estado do carrinho pro `App.jsx`.

### Cliente com nome repetido — `src/telas/Clientes.jsx`

Dois clientes com o mesmo nome: digitar o nome na venda casa com o primeiro. O
**código** (`C001`) é o desempate — digitando ele, vai no certo.

- **Saída**: se virar problema, a sugestão da venda mostra código + nome e força
  a escolha quando houver mais de um.

### Desfazer entrada antiga — `src/telas/Estoque.jsx`

Entradas gravadas antes do passo 6b não têm o custo anterior guardado
(`custo_anterior`), então o desfazer recalcula a média ponderada com os números
atuais da peça. Pode dar diferença de centavos em entrada muito velha.

- Entradas novas guardam o snapshot e desfazem exato.

## Arquitetura

### O renderer manda SQL direto — `electron/main.js`

Não há handlers nomeados por operação: a tela monta o SQL e o processo principal
executa. É seguro **porque** o app é local, de um usuário só, sem conteúdo
remoto e sem servidor.

- **Deixa de valer** se um dia virar multiusuário, tiver acesso por rede ou
  abrir qualquer coisa vinda de fora.
- **Saída**: trocar por handlers nomeados (`vender`, `darEntrada`, …), com o SQL
  todo no processo principal.

## O que NÃO está nesta lista

Coisas que são decisão de produto, não atalho técnico, e estão no
`specs/ROADMAP.md` ou na spec do passo:

- Diferença de troca no lucro → `specs/passo-17b-lucro-exato-da-troca.md`
- Venda original não é reescrita no estorno → passo 18
- Perda de lote no modo "valor total" não aponta a peça → passo 19
