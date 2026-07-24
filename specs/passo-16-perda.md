# Passo 16 — Perda: troca que não vai para o fornecedor

> Melhoria 6 do cliente. Bloco C. **Cria o conceito de perda (F2)**, usado depois
> pelos passos 19, 20 e pelo cálculo de margem.

## Objetivo

Tem peça que não tem troca com fornecedor — cabo de carregador, película,
capinha. Se vem com defeito, a loja entrega uma nova e **come o prejuízo**. Hoje
esse dinheiro simplesmente some do sistema: não é crédito, não é venda, não é
nada.

## Decisão

Perda é sempre pelo **preço de compra** (custo), nunca pelo de venda. Perder um
cabo custa o que você pagou nele, não o que você cobraria.

## Entregável

- Schema: tabela `perdas (id, troca_id, peca_id, valor, motivo, criado_em)` —
  `valor` em centavos, sempre custo. Esta tabela é o **livro único de perdas**:
  os passos 19 e 20 gravam nela também.
- No formulário de troca, escolha do **destino da peça defeituosa**:
  - **Vai para o fornecedor** (padrão) → prateleira, como hoje.
  - **Sem troca com fornecedor → perda** → grava em `perdas` com o
    `preco_compra` da peça e o motivo, **não** entra na prateleira.
- A peça nova entregue ao cliente sai do estoque (−1), como já acontece.
- Aba Trocas ganha um bloco **Perdas**: lista (data, peça, valor, motivo) e
  **total do mês**.
- Desfazer a troca apaga a perda junto.

## Fora de escopo

- Perda por quebra/sumiço no balcão sem troca envolvida (não foi pedido; se o
  cliente quiser, a tabela já suporta, falta só um botão).
- Entrar no cálculo de lucro do Dashboard — isso é o passo 20, junto com o
  toggle "contar perdas de troca".

## Como testar

1. Registrar troca de um cabo (compra R$ 12,00) marcando **sem troca com
   fornecedor** → aparece no bloco Perdas com R$ 12,00, **não** aparece na
   prateleira.
2. Entregar cabo novo ao cliente → estoque do cabo −1.
3. Bloco Perdas mostra o total do mês somando as perdas registradas.
4. Desfazer a troca → a perda some junto e o estoque volta.
5. Registrar uma troca normal (com fornecedor) → continua indo para a prateleira,
   sem gerar perda.
