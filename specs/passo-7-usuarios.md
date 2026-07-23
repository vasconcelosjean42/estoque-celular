# Passo 7 — Usuários (dono × funcionário)

## Objetivo

Login simples com dois papéis. Dono vê e edita tudo; funcionário opera o dia a
dia (vender, consultar estoque) sem ver custo/margem/lucro nem editar preços.

## Decisões

- **Login por PIN de 4 dígitos**: tela inicial com um botão grande por usuário
  (mínimo de cliques pra leigo) → digita PIN → entra. Botão "Sair" na barra.
- **Seed**: primeiro uso cria o usuário **Dono / PIN 1234** — trocar na Config.
- **PIN em texto puro no SQLite**: app local de 1 PC; é controle operacional
  ("funcionário não fuça"), não segurança contra ataque. Sem hash de propósito.
- **Funcionário só vê as abas Estoque e Venda.** Dashboard (lucro), Trocas
  (valor de compra em tudo) e Config são do dono. Se o cliente quiser
  funcionário registrando troca, a gente reavalia depois.

## Entregável

- Tabela `usuarios (id, nome, pin, papel 'dono'|'funcionario')` + seed.
- Tela de Login (usuário → PIN). Nav mostra quem está logado + "Sair".
- **Funcionário**:
  - Estoque: só Produto/Modelo/Qtd/Preço de venda. Sem "+ Novo produto", sem
    editar (clique na linha), sem excluir, sem "+ Entrada", sem "Últimas
    entradas" (mostra preço de compra).
  - Venda: vende normal, mas preço unitário travado (sem desconto). Sem botão
    "Trocar" e sem desfazer troca (levam pra aba Trocas). Desfazer venda pode.
- **Dono**: tudo como antes + bloco "Usuários" na Config: adicionar (nome,
  PIN, papel), remover (impede remover o último dono), trocar PIN inline.

## Como testar

1. Abrir o app → tela de login com "Dono" → PIN 1234 → entra com as 5 abas.
2. Config → Usuários → criar "Func" PIN 1111 funcionário. Trocar PIN do Dono.
3. Sair → entrar como Func → só abas Estoque e Venda; Estoque sem colunas
   Compra/Margem e sem botões; Venda com preço travado e sem "Trocar".
4. Vender como Func → funciona e baixa estoque.
5. PIN errado → aviso e não entra. `npm test` continua verde.
