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
| 6c | Smoke test E2E | `npm test`: builda, abre o app com banco isolado e percorre venda → troca → desfazer, falhando em tela branca/erro | — |
| 7 | Usuários | Login simples dono × funcionário; funcionário não vê preço de compra/margem/lucro nem edita preços | — |
| 8 | Build + auto-update | Instalador .exe, electron-updater + GitHub Releases (atualiza sozinho sem perder dados) | — |

Fora do v1 (versão futura): **Fiado** — venda a prazo, lista de quem deve, baixa de dívida.

Regra: só começo o passo N+1 depois que você testou e aprovou o passo N.
