# Passo 1 — Shell de navegação

## Objetivo

App abre e navega entre as 5 telas do v1. Nenhuma funcionalidade ainda — só a
estrutura que os próximos passos preenchem.

## Entregável

- Barra de abas no topo: **Estoque | Venda | Dashboard | Trocas | Config**.
- Botões grandes e legíveis (usuário leigo, mínimo de cliques).
- Aba ativa destacada; cada tela é um componente vazio com o título.
- Tudo em `src/App.jsx` + um arquivo por tela em `src/telas/` (só quando a tela
  ganhar conteúdo — placeholder pode ficar inline no App).

## Fora de escopo

- Qualquer acesso ao banco, estilo elaborado, roteador (useState basta).

## Como testar

1. `npm run dev`
2. Janela abre na aba Estoque.
3. Clicar em cada aba troca a tela e destaca a aba ativa.
