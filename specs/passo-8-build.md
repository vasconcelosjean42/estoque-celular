# Passo 8 — Build, instalador e auto-update

## Objetivo

Colocar o sistema na máquina do cliente como app instalado que se atualiza
sozinho **sem perder dados** (banco fica em userData, intocado pelo update).

## Entregável

- **Instalador .exe** (electron-builder, NSIS) — `npm run build`.
- **Auto-update**: electron-updater + GitHub Releases. App checa ao abrir,
  baixa em background e aplica na próxima abertura. Sem passo manual pro cliente.
- **Abrir junto com o Windows**: `app.setLoginItemSettings({ openAtLogin })`
  (só funciona no app instalado). Checkbox na Config pra ligar/desligar —
  ligado por padrão.
- **Janela maximizada** ao abrir (`win.maximize()`): ocupa a tela toda com a
  barra de título — não usar fullscreen/quiosque, usuário leigo precisa
  conseguir minimizar.
- Ícone do app (usa o logo da Config? não — ícone fixo no build; logo da
  Config é só o cabeçalho interno).

## Como publicar uma atualização

1. Subir a versão em `package.json` (ex.: 0.1.0 → 0.1.1).
2. `npm run build` (se a extração do winCodeSign falhar com erro de symlink,
   é bug conhecido no Windows — o cache já foi extraído manualmente uma vez;
   alternativa: ativar Modo Desenvolvedor do Windows).
3. Criar um release no GitHub com a tag `v0.1.1` e anexar do `dist/`:
   `Estoque Celular Setup X.Y.Z.exe`, o `.blockmap` e o `latest.yml`.
   (Ou `npx electron-builder --win --publish always` com `GH_TOKEN` setado.)
4. Apps instalados baixam sozinhos na próxima abertura e instalam ao fechar.

Obs.: sem certificado de assinatura, o Windows SmartScreen avisa na primeira
instalação ("app não reconhecido") — normal; clicar em "Executar assim mesmo".

## Como testar

1. `npm run build` gera o instalador em `dist/`.
2. Instalar numa máquina (ou VM) → app abre maximizado, login funciona,
   banco novo criado em userData.
3. Reiniciar o Windows → app abre sozinho.
4. Publicar release nova no GitHub → app instalado atualiza sozinho e os
   dados (vendas, estoque, usuários) continuam lá.
