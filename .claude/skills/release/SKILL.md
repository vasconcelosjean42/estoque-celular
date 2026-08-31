---
name: release
description: Gera e publica uma versão nova do Estoque Celular (build NSIS + GitHub Releases, que é o que alimenta o auto-update na loja). Use quando pedirem para "subir uma versão", "gerar a build", "publicar", "lançar a 1.0.x" ou "mandar pro cliente". Cobre o bump de versão, o mural de novidades, a suíte de testes, o build e o rascunho de release.
---

# Publicar uma versão do Estoque Celular

O app se atualiza sozinho pelo GitHub Releases, então publicar aqui é mexer
direto na loja do cliente. A ordem abaixo existe porque cada passo já quebrou
uma vez.

## Antes de qualquer coisa: o Node desta máquina

O `node` do PATH é **v16.10** — velho demais para o Vite 6 e sem `fetch` global,
que o `electron/rede.js` usa. Por isso `npm test` e `npm run build` **falham, e
não é bug do projeto**. Tudo roda pelo Node 20 embutido no Electron:

```bash
E=./node_modules/electron/dist/electron.exe
ELECTRON_RUN_AS_NODE=1 $E <script.js>
```

Dois detalhes que custam tempo quando esquecidos:

- Testes que sobem o app com Playwright precisam **limpar a variável antes do
  launch**, senão o Electron filho sobe como node:
  `$E -e "delete process.env.ELECTRON_RUN_AS_NODE; require('./test/p0.js');"`
- O build exige **`ELECTRON_NO_ASAR=1`**. Sem ele o fs asar-aware do Electron
  faz o empacotamento falhar com `Invalid package ... app.asar`.
- Scripts avulsos passados para `-e "require('...')"` precisam de **caminho
  Windows** (`C:/Users/.../Temp/x.js`). O `/tmp/x.js` do Git Bash não resolve.
- Script fora do projeto não acha as dependências: `require` do
  `electron-builder`/`playwright-core` por caminho absoluto do `node_modules`.

Instalar Node 20 LTS resolve os dois primeiros de vez.

## 1. Versão e mural

Subir a `version` no `package.json` **e** entrar com ela no topo de
`src/novidades.js`. Não é opcional: `test/p0.js:2507` compara as duas e fica
vermelho se divergirem.

O que escrever nos `itens`: linguagem de loja, o que ele passa a conseguir
fazer. Nada de nome de arquivo, tabela ou "passo 24". Versão só de correção
interna que ninguém vê pode levar um `"Correção de bugs."` e pronto — mas a
entrada tem que existir.

A Config mostra **só o primeiro item da lista**.

## 2. Suíte completa

Os cinco passos, na ordem (o `p0` leva alguns minutos):

```bash
E=./node_modules/electron/dist/electron.exe
ELECTRON_RUN_AS_NODE=1 $E test/rede.js
ELECTRON_RUN_AS_NODE=1 $E ./node_modules/vite/bin/vite.js build
ELECTRON_RUN_AS_NODE=1 $E -e "delete process.env.ELECTRON_RUN_AS_NODE; require('./test/smoke.js');"
ELECTRON_RUN_AS_NODE=1 $E -e "delete process.env.ELECTRON_RUN_AS_NODE; require('./test/p0.js');"
ELECTRON_RUN_AS_NODE=1 $E -e "delete process.env.ELECTRON_RUN_AS_NODE; require('./test/dois-pcs.js');"
```

O `vite build` no meio não é enfeite: `smoke`, `p0` e `dois-pcs` abrem o app
empacotado e leem o `dist/`. Mudou `src/`, tem que rebuildar antes deles.

## 3. Build e publicação

O **CLI** do electron-builder quebra o parse de argv rodando dentro do
Electron-como-node. Use a API, num script à parte:

```js
const raiz = "C:/meus-arquivos/projetos/estoque-celular";
const builder = require(raiz + "/node_modules/electron-builder");
builder
  .build({ projectDir: raiz, targets: builder.Platform.WINDOWS.createTarget("nsis"), publish: "always" })
  .then((r) => console.log("OK:\n" + r.join("\n")))
  .catch((e) => { console.error("FALHOU:", e); process.exit(1); });
```

`publish: "never"` para só gerar o instalador local; `"always"` para subir.

```bash
ELECTRON_NO_ASAR=1 ELECTRON_RUN_AS_NODE=1 $E <script>
```

### O token sai do próprio git

Não existe `GH_TOKEN` no ambiente e o `gh` CLI não está instalado — mas o
Gerenciador de Credenciais do Windows guarda o token que o `git push` usa, e ele
tem escopo `repo`. Pegue de lá em vez de pedir ao usuário:

```bash
export GH_TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill 2>/dev/null | sed -n 's/^password=//p')
```

Nunca imprima o valor. Se o `git push` funciona, isto funciona.

### Sai como rascunho

Sem `releaseType` na config, o electron-builder cria **draft**
(`electron-publish/out/gitHubPublisher.js:52`). Rascunho é invisível para o
electron-updater: **nada chega na loja** até alguém clicar em *Publish release*
no GitHub. Esse clique é do usuário — é o momento em que a atualização vai para
o cliente de verdade. Não publique o rascunho sem ele pedir.

Confira que subiram os **três** arquivos: o `.exe`, o `.blockmap` e o
`latest.yml`. Sem o `latest.yml` o updater não enxerga a versão.

## 4. Avisar sobre os dois PCs

Sempre que a loja tiver dois computadores, lembrar no fim:

- `rede.js:69` compara versão por **igualdade exata**. Com um PC na nova e o
  outro na velha, o balcão trava com 409 até os dois baterem. Atualizar os dois
  na sequência.
- Nessa tela de erro aparece o botão **"Usar o banco deste computador"**. Ele
  desconecta o balcão e faz ele gravar num banco separado — dois estoques
  divergentes para reconciliar na mão. Em queda de conexão real é a saída certa;
  em versão trocada é o pior movimento possível. Avisar quem vai atualizar.
- O instalador **não é assinado**: vai aparecer "O Windows protegeu o seu PC" →
  *Mais informações* → *Executar assim mesmo*.
