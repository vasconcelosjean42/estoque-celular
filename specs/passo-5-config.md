# Passo 5 — Config + backup

## Objetivo

Tela de Config funcional: identidade do sistema (título + logo), flag de mão de
obra e backup automático numa pasta escolhida (apontar pra pasta do Google
Drive desktop = nuvem de graça).

## Entregável

- **Título do sistema**: campo de texto; muda o título da janela e aparece na
  barra do app. Padrão: "Estoque Celular".
- **Logo**: botão "Escolher logo…" abre seletor de imagem; aparece na barra do
  app ao lado do título. Botão remover. (Guardada em base64 na tabela `config` —
  sem arquivo solto.)
- **Mão de obra ON/OFF**: liga/desliga o campo "Mão de obra" na tela de Venda.
  Padrão: ON.
- **Pasta de backup**: botão "Escolher pasta…" (seletor nativo de pastas);
  mostra a pasta atual. Botão **"Fazer backup agora"** com resultado na tela.
- **Backup automático**: ao abrir o app e a cada 1h (arquivo
  `estoque-AAAA-MM-DD.db`, um por dia, sobrescreve no mesmo dia).
- Tudo gravado na tabela `config` (chave/valor). IPC novo: `escolherPasta`,
  `escolherLogo`, `backupAgora`.

## Fora de escopo

- Restaurar backup pela interface (restauração = copiar o .db de volta, manual).
- Múltiplos logos, temas, cores.

## Como testar

1. Aba Config → mudar o título → barra do app e título da janela mudam na hora.
2. Escolher uma logo (PNG/JPG) → aparece na barra. Remover → some.
3. Desligar mão de obra → campo some da tela de Venda. Ligar → volta.
4. Escolher uma pasta de backup → "Fazer backup agora" → arquivo
   `estoque-<data>.db` aparece na pasta.
5. Fechar e reabrir o app → backup do dia é refeito sozinho e as configs persistem.
