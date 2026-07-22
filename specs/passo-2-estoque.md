# Passo 2 — Estoque

## Objetivo

Tela de Estoque completa: cadastrar, editar, excluir e listar peças, com margem
calculada e alerta visual de estoque baixo.

## Entregável

- **Lista de peças** em tabela: nome, modelo, quantidade, preço compra, preço
  venda, margem (R$ e %). Ordenada por nome.
- **Busca** por nome/modelo no topo da lista (filtra enquanto digita).
- **Cadastrar**: botão grande "+ Nova peça" abre formulário (nome, modelo,
  quantidade, preço compra, preço venda, estoque mínimo). Preços digitados em
  reais (ex.: 100,00) e gravados em centavos.
- **Editar**: clicar na linha abre o mesmo formulário preenchido.
- **Excluir**: botão na linha, com confirmação simples (`confirm()`).
- **Alerta**: linha com `quantidade <= estoque_minimo` fica destacada em
  vermelho/âmbar.
- Margem é derivada na exibição (`preco_venda - preco_compra`), nunca gravada.
- Dados via `window.api.query` direto na tela (`src/telas/Estoque.jsx`).

## Fora de escopo

- Foto da peça, código de barras, categorias, paginação (lista pequena).

## Como testar

1. `npm run dev` → aba Estoque.
2. Cadastrar "Tela Note 10", compra 100,00, venda 200,00, qtd 3, mínimo 1 →
   aparece na lista com margem R$ 100,00 (100%).
3. Editar a peça (mudar preço) → lista atualiza.
4. Cadastrar outra peça com qtd 0 → linha destacada de alerta.
5. Buscar "note" → filtra. Excluir → some da lista.
6. Fechar e reabrir o app → dados persistem.
