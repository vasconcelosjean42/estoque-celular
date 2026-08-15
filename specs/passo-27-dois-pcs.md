# Passo 27 — Dois PCs na loja (v1.0.0)

> Pedido em 2026-08-15: "colocar um banco de dados na nuvem". A dor real,
> confirmada: **balcão e escritório usando o sistema ao mesmo tempo**. Reverte a
> linha do `AGENTS.md` que dizia "1 PC só, não há conflito".
>
> Restrição: **custo zero** (o comercial é sem mensalidade).

## Como esses sistemas funcionam na prática

Existe padrão, sim — e são quatro, não um. Vale saber qual é qual antes de
escolher, porque a diferença de custo entre eles é de 10× em código.

### 1. Servidor local na loja (cliente-servidor por rede local)

O que praticamente todo sistema de loja pequena no Brasil faz há 30 anos. **Um**
PC guarda o banco; os outros são clientes e falam com ele pela rede da loja
(cabo ou Wi-Fi do roteador). Nuvem nenhuma.

- Funciona com a internet caída — o que importa é o roteador, não o provedor.
- Conflito de estoque **não existe**: tem um banco só, e ele decide.
- Custo zero, para sempre.
- Se o PC principal desliga, o outro para. É a fraqueza real do modelo.

### 2. Nuvem 100% (SaaS, tipo Bling / Tiny / Omie)

Banco no servidor do fornecedor, cada PC abre o navegador. Ótimo pra acessar de
qualquer lugar, e **a loja para quando a internet cai**. Por isso todo SaaS de
PDV sério tem um "modo offline" embutido — que é o padrão 3.

### 3. Offline-first com sincronização

Cada PC tem banco local, opera sempre local, e um processo sobe/desce as
mudanças. É o padrão dos PDVs modernos e o mais robusto — e o mais caro de fazer
certo. Custa:

- **Trocar todo `INTEGER PRIMARY KEY` por UUID** (senão o produto id 42 do PC A
  colide com o id 42 do PC B). Isso é o schema inteiro, e todo o histórico.
- Marcar em cada linha o que já subiu, o que veio, o que mudou dos dois lados.
- Resolver conflito: os dois editaram o preço da mesma peça, quem ganha?
- E o furo que não fecha: dois PCs offline vendem a última tela ao mesmo tempo.
  Os dois aceitam. O estoque vai a −1 e **nenhuma sincronização conserta isso**,
  porque a peça física já saiu duas vezes. Só uma autoridade única na hora da
  venda evita — ou seja, o padrão 1.

### 4. Banco na nuvem com réplica local (Turso/libSQL, PowerSync, Electric)

Meio-termo moderno: lê de um SQLite local (rápido, offline) e escreve no
remoto. É quase só trocar o driver — mas **escrever exige internet**. Internet
de interior caiu, a loja não vende. Troca uma dependência (o PC do balcão) por
outra pior (o provedor).

## Decisão: padrão 1 — servidor na rede local

Os dois PCs ficam **na mesma loja, na mesma rede**. Botar o banco na nuvem pra
dois computadores que estão a cinco metros um do outro adiciona latência,
dependência da internet do interior e um problema de sistema distribuído
(conflito de estoque) que um banco único faz simplesmente não existir.

A nuvem continua fazendo o que já faz bem hoje e não muda: **backup diário do
`.db` na pasta do Google Drive** (`main.js:24`). Esse é o papel certo da nuvem
aqui — guardar cópia, não servir consulta.

**O que faz esse passo ser barato:** todo o app já fala com o banco por dois
únicos caminhos — `ipcMain.handle("db")` e `ipcMain.handle("db-tx")`
(`electron/main.js:61-80`). Publicar esses dois na rede e fazer o segundo PC
apontar pra lá **não muda uma linha das 4.900 do React**. As telas não sabem
nem vão saber se o banco está nesta máquina ou na outra.

## Entregável

### 1. Modo do PC (`rede.json` em userData)

Arquivo pequeno em `app.getPath("userData")/rede.json`, **fora do banco** — o PC
cliente não tem banco pra guardar essa informação:

```json
{ "modo": "servidor", "porta": 5174, "token": "gerado-na-instalacao" }
{ "modo": "cliente", "url": "http://192.168.0.10:5174", "token": "o-mesmo" }
```

Sem arquivo = `servidor`. Instalação existente continua funcionando sozinha,
sem tocar em nada.

O resto da config (título, logo, mão de obra, flag de nota) continua na tabela
`config` — e passa a ser **compartilhada**, que é o certo: mudou no escritório,
mudou no balcão.

### 2. PC principal publica o banco na rede

Extrair as duas funções que os handlers de IPC já executam e servir as mesmas
por HTTP, só quando `modo = servidor`:

- `POST /db` → `{ sql, params }`
- `POST /db-tx` → `{ comandos }`
- Header `x-token` obrigatório; token errado → 401.
- Escuta em `0.0.0.0:5174` (rede local). Um `http.createServer` de Node, sem
  dependência nova.

As requisições **se enfileiram sozinhas**: o servidor Node é uma thread só e o
better-sqlite3 é síncrono. Duas vendas simultâneas viram duas transações em
sequência, não duas ao mesmo tempo. Correção de graça.

### 3. PC cliente aponta pro principal

Quando `modo = cliente`, os handlers `db` e `db-tx` não abrem banco nenhum:
fazem `fetch` pro servidor e devolvem a resposta. O `electron/db.js` nem é
carregado nessa máquina.

Consequência: no cliente ficam desligados **backup diário** e a leitura de
`abrir_com_windows` no boot (os dois tocam o banco antes da janela existir).
Backup é responsabilidade do PC principal, que é onde o arquivo está.

### 4. Erro de rede que o leigo entende

Servidor desligado é o caso mais provável do dia a dia, e hoje qualquer erro de
query vira tela quebrada. O cliente mostra diálogo do sistema:

> **Sem conexão com o PC principal (192.168.0.10).**
> Verifique se ele está ligado e conectado na rede da loja.

Um aviso por vez, não um por query.

### 5. Trava de versão

Os dois PCs se atualizam sozinhos pelo GitHub, em horas diferentes. Por alguns
minutos o cliente pode estar numa versão que pede uma coluna que o servidor
ainda não criou. O cliente manda a versão no header; diferente da do servidor →
recusa com mensagem clara ("Este PC está na versão X e o principal na Y.
Aguarde a atualização terminar nos dois."). Barato, e evita erro de SQL
incompreensível na frente do cliente da loja.

### 6. Trava de estoque (existe hoje, some com 2 PCs)

`Venda.jsx:219` faz `UPDATE pecas SET quantidade = quantidade - ? WHERE id = ?`
sem conferir se tem saldo. Com 1 PC ninguém percebe, porque a tela sempre está
fresca. Com 2 PCs a tela do balcão pode estar mostrando estoque de 3 minutos
atrás.

Vira `... WHERE id = ? AND quantidade >= ?`; se a transação não alterou linha,
a venda falha inteira com "O estoque desta peça acabou (vendida no outro PC).
Atualize a tela." Mesma trava nos outros pontos que baixam estoque
(`Trocas.jsx:153,161`).

### 7. Config: bloco "Rede"

Só pro administrador:

- Mostra o modo deste PC e, no servidor, **o IP e a porta pra digitar no outro**
  (o leigo não vai descobrir o IP sozinho).
- Trocar pra cliente: campo do endereço + token, com botão **"Testar conexão"**
  que diz "Conectado ao PC principal" ou o erro. Precisa reiniciar o app.
- Alerta visível quando o PC principal está com IP dinâmico e mudou — sintoma é
  o "sem conexão" do item 4 depois de reiniciar o roteador. O texto da tela
  manda fixar o IP no roteador.

## Decisões

- **Nada de SQLite em pasta compartilhada do Windows.** É a primeira ideia que
  aparece e é a que corrompe o banco: o travamento de arquivo do SQLite não
  funciona direito sobre SMB, e a documentação do próprio SQLite desaconselha.
  Perder o banco da loja é pior que qualquer coisa que esse passo resolve.
- **Nada de trocar por Postgres/MySQL.** Instalar e manter um servidor de banco
  num PC de loja, com usuário leigo, pra dois clientes, é infra demais — e
  reescreveria o SQL das 12 telas.
- **SQL cru viajando na rede** é a linha que o `limites-conhecidos.md` já
  marcava como "deixa de valer se um dia virar rede". Aceito **nesta rede**:
  LAN da loja, token compartilhado, servidor que só escuta a porta 5174. Não
  aceito se um dia sair da loja — aí vira o refactor de handlers nomeados que
  aquele documento descreve. Anotar como teto, não como pendência silenciosa.
- **Sem descoberta automática do servidor.** Digitar o IP uma vez na instalação
  é mais previsível que mDNS/broadcast quebrando no Wi-Fi do cliente.
- **Sem tempo real.** A tela do outro PC não se atualiza sozinha quando alguém
  vende; ela atualiza ao trocar de aba ou refazer a busca, como já faz. A trava
  do item 6 é o que impede o estrago. Tempo real só se ele reclamar.

## Fora de escopo

- Nuvem de verdade (dono ver de casa) — é outro passo, e depende deste.
- Terceiro PC ou PC fora da loja.
- Sincronização offline: se a rede da loja cai, o PC cliente para. Ele é um
  terminal, não tem banco.
- Failover: PC principal morreu, o cliente não vira principal sozinho. A saída
  manual existe e é razoável — restaurar o backup do Drive no outro PC e mudar
  o modo pra servidor na Config.
- Criptografia do tráfego (HTTPS). Rede local da loja, token no header.

## Como testar

Precisa dos dois PCs (ou duas máquinas na mesma rede).

1. PC principal: Config → Rede mostra o IP e a porta. App funciona igual a hoje.
2. PC cliente: apontar pro IP + token → "Testar conexão" responde conectado.
3. Reiniciar o cliente: abre com **os mesmos produtos, vendas e clientes** do
   principal. Título e logo idênticos (vieram do banco compartilhado).
4. Vender no cliente → a venda aparece no Dashboard do principal ao trocar de
   aba. Estoque baixou nos dois.
5. Cadastrar produto no principal → aparece na busca do cliente.
6. **Corrida**: peça com estoque 1, abrir a Venda nos dois PCs com ela na tela.
   Vender no principal, depois vender no cliente → o cliente recusa com o aviso
   de estoque, e o estoque final é **0**, nunca −1.
7. Desligar o PC principal → o cliente mostra "Sem conexão com o PC principal",
   sem tela branca, e volta a funcionar quando o principal liga.
8. Token errado no cliente → recusa dizendo que o token não confere.
9. Backup: só o principal gera o `estoque-<data>.db` na pasta do Drive.
10. Instalação antiga, sem `rede.json` → abre como sempre, nada mudou.
