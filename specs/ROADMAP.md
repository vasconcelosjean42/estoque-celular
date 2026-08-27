# Roadmap v1 — um passo por vez, testável no fim de cada um

Cada passo vira uma spec em `specs/passo-N-*.md` quando for começar. Ordem pensada
para o app ser usável cedo (estoque + venda primeiro, resto depois).

| # | Passo | Entregável testável | Status |
|---|-------|---------------------|--------|
| 1 | Shell de navegação | App abre com 5 abas grandes (Estoque, Venda, Dashboard, Trocas, Config), telas vazias | ✅ aprovado |
| 2 | Estoque | Cadastrar/editar/excluir peça, margem automática, alerta de mínimo | ✅ aprovado |
| 3 | Venda rápida | Buscar → vender em 1 clique, preço editável, baixa estoque, forma de pagamento (espécie/Pix/crédito à vista/parcelado) | ✅ aprovado |
| 4 | Dashboard | Lucro/faturamento semana/mês/ano, histórico, fechamento do dia por forma de pagamento | ✅ aprovado |
| 5 | Config + backup | Pasta de backup, flag mão de obra, título e logo editáveis | ✅ aprovado |
| 6 | Trocas | Prateleira de defeituosas, 40 dias, lotes; retorno vira crédito c/ fornecedor (valor de compra); troca ligada à venda (botão Trocar, agrupamento, desfazer) | ✅ aprovado |
| 6b | Entrada de estoque | Botão "+ Entrada" na peça: soma quantidade, atualiza preço de compra, grava histórico de entradas | ✅ aprovado |
| 6c | Smoke test E2E | `npm test`: builda, abre o app com banco isolado e percorre venda → troca → desfazer, falhando em tela branca/erro | ✅ |
| 7 | Usuários | Login simples administrador × colaborador; colaborador não vê preço de compra/margem/lucro nem edita preços | ✅ aprovado |
| 8 | Build + auto-update | Instalador .exe, electron-updater + GitHub Releases (auto-update validado v0.1.2→v0.1.4); abre com o Windows (checkbox na Config) e maximizado | ✅ aprovado |
| 9 | Nota / recibo | Opcional por flag na Config: após confirmar venda, gera recibo PDF (porta a lógica do sistema Python já validado, adaptada). OFF = idêntico a hoje | ✅ feito (falta validar PDF na térmica) |

Fora do v1 (versão futura): **Fiado** — venda a prazo, lista de quem deve, baixa de dívida.

Regra: só começo o passo N+1 depois que você testou e aprovou o passo N.

---

# v2 — melhorias pedidas pelo cliente (2026-07-24)

Spec de cada uma já escrita. Ordem pensada por dependência, não pela numeração do
cliente: o carrinho (passo 12) muda a estrutura da venda, e o conceito de perda
(passo 16) é usado por três passos depois dele.

| # | Passo | Item do cliente | Depende de | Status |
|---|-------|-----------------|------------|--------|
| — | **Bloco A — rápidos e isolados** | | | |
| 10 | Código do produto (`TE001`) + busca por código | 1 | — | ✅ aprovado |
| 11 | Fechamento do dia p/ colaborador + vendedor na venda | 7 | — | ✅ aprovado |
| — | **Bloco B — venda** | | | |
| 12 | Carrinho: vários itens num pedido | 8 | — | ✅ aprovado |
| 13 | Desconto com autorização por PIN | 11 | 11, 12 | ✅ aprovado |
| 14 | Cadastro de clientes e histórico de compras | 2 | 12 | ✅ aprovado |
| — | **Bloco C — trocas e perda** | | | |
| 15 | Troca de peça que está funcionando | 9 | — | ✅ aprovado |
| 16 | Perda: troca que não vai pro fornecedor | 6 | — | ✅ aprovado |
| 17 | Forma de pagamento na diferença da troca | 3 | — | ✅ aprovado |
| 17b | Lucro exato da troca + perdas na margem | — (dúvida do cliente) | 16, 17 | ✅ aprovado |
| 18 | Estorno (devolver o dinheiro) | 10 | 15, 17 | ✅ aprovado |
| 19 | Crédito parcial do lote (total ou item a item) | 4 | 16 | ✅ aprovado |
| 20 | Detalhe do lote item a item | 5 | 16, 19 | ✅ aprovado (no bloco Lotes, não no histórico de crédito) |
| 21 | Arquivar produto fora de linha | — (cortesia) | — | ✅ aprovado |
| 22 | Importação de produtos por planilha | — (pedido 2026-07-26) | 10, 6b | 🔨 feito, publicado em v0.2.0 |

---

# v3 — 3 ajustes pedidos pelo cliente (2026-07-26)

| # | Passo | Item do cliente | Depende de | Status |
|---|-------|-----------------|------------|--------|
| 23 | Linha de totais no topo do Estoque | 1 | — | 🔨 feito |
| 24 | Colaborador faz e desfaz trocas, sem PIN | 2 | 15, 18 | 🔨 feito |
| 25 | Código de barras (cadastro, filtros, bipar na venda) | 3 | 10 | 🔨 feito |

## Decisões tomadas em 2026-07-24

- **Código do produto**: 2 letras do tipo + 3 dígitos sequenciais (`TE001`),
  automático e editável, prefixo estendido pra 3 letras quando colidir. Sem
  código de barras. **Revisto em 2026-07-26 (passo 25)**: a loja comprou pistola,
  e o código de barras entrou como campo próprio — o `TE001` continua sendo o
  código da loja e a chave da importação por planilha.
- **Dinheiro de troca bate no caixa**: diferença e estorno entram/saem do
  fechamento do dia com forma de pagamento.
- **Fechamento do colaborador**: dia inteiro da loja, sem quebra por pessoa; a
  segmentação por vendedor fica no relatório do administrador.
- **Arquivar produto**: sem cobrança, e sem efeito financeiro (só esconde da
  lista).
- **Diferença de troca entra no faturamento**, mas não no lucro (é acerto de
  troca, não margem de venda). **Revisto em 2026-07-25 (passo 17b)**: a parte da
  diferença que não cobre o custo a mais da peça entregue *é* margem, e entra no
  lucro. A regra virou `diferença − (custo que saiu − custo que voltou)`.
- **Desfazer apaga o pedido inteiro**, nunca item a item. Devolver um item de um
  pedido já pago é estorno/troca (passos 15 e 18), que cuida da forma de
  pagamento e do destino da peça.
- **Peça que volta funcionando não recalcula o custo médio** — o custo do produto
  não pode mudar sem ter havido compra. Erra pra baixo (mostra menos lucro),
  nunca pra cima.

## Três mudanças estruturais que este pacote traz

1. **Venda vira pedido** (passo 12) — `vendas` continua uma linha por item, mas
   ganha `pedido_id`. Tudo que pendura na venda (cliente, desconto, nota) precisa
   vir depois.
2. **Perda passa a existir** (passo 16) — tabela `perdas`, sempre a preço de
   custo, usada pelos passos 19, 20 e pelo cálculo de margem.
3. **A venda passa a saber quem vendeu** (passo 11) — `vendas.usuario_id`,
   necessário pro fechamento e pro rastro de quem autorizou desconto.

---

# v1.0.0 — dois PCs na loja (2026-08-15)

| # | Passo | Item do cliente | Depende de | Status |
|---|-------|-----------------|------------|--------|
| 27 | Balcão e escritório no mesmo banco, pela rede da loja | "banco na nuvem" | 8 | 🔨 feito, falta testar na loja |

O pedido veio como "banco de dados na nuvem"; a dor é **dois PCs ao mesmo
tempo**. Spec em `specs/passo-27-dois-pcs.md`, com os quatro padrões de mercado
comparados e o porquê da escolha.

**Decisão: servidor na rede local, não na nuvem.** Um PC guarda o banco, o outro
é terminal. Dois computadores a cinco metros um do outro não precisam da
internet do interior no meio do caminho, e um banco único faz o conflito de
estoque deixar de existir em vez de precisar ser resolvido. A nuvem continua
sendo o backup diário na pasta do Drive, que é o papel que ela faz bem aqui.

Isto **revoga** a linha do `AGENTS.md` ("Sem banco na nuvem, sem sync — 1 PC só,
não há conflito") no ponto do "1 PC só" — o resto continua valendo, inclusive o
"sem banco na nuvem".

---

# v1.1.0 — cliente que sumiu e quanto ele comprou (2026-08-27)

| # | Passo | Item do cliente | Depende de | Status |
|---|-------|-----------------|------------|--------|
| 28 | Dias sem comprar (laranja/vermelho) + total por período | "ligar pros clientes que sumiram" e "quanto os clientes já compraram, na semana/mês/período" | 14, 7 | 🔨 feito, falta usar na loja |

Os dois pedidos caem na mesma tela e por isso viraram um passo só. Spec em
`specs/passo-28-dias-sem-comprar.md`.

**O alerta e o período não se misturam.** Dias sem comprar é sempre absoluto; o
filtro de período recorta só quanto e quantas vezes o cliente comprou. Recortar
o alerta junto faria a loja inteira aparecer como sumida todo dia 1º.

**Quem zera no período não sai da lista** — entra por `CASE`, não por `WHERE`. É
justamente esse cliente que o dono está procurando quando abre o mês.

**A lista de clientes saiu de dentro da Config.** Ela era do administrador porque
morava lá; quem liga é a funcionária. Virou aba do colaborador, sem editar nem
excluir cadastro e sem o filtro de período, que é do dono.
