# Roadmap v1 — um passo por vez, testável no fim de cada um

Cada passo vira uma spec em `specs/passo-N-*.md` quando for começar. Ordem pensada
para o app ser usável cedo (estoque + venda primeiro, resto depois).

| # | Passo | Entregável testável | Status |
|---|-------|---------------------|--------|
| 1 | Shell de navegação | App abre com 5 abas grandes (Estoque, Venda, Dashboard, Trocas, Config), telas vazias | ✅ aprovado |
| 2 | Estoque | Cadastrar/editar/excluir peça, margem automática, alerta de mínimo | spec pronta |
| 3 | Venda rápida | Buscar peça → vender em 1 clique, preço editável, baixa estoque | — |
| 4 | Dashboard | Lucro/faturamento semana/mês/ano + histórico de vendas | — |
| 5 | Config + backup | Flag mão de obra ON/OFF, escolher pasta de backup | — |
| 6 | Trocas | Prateleira de defeituosas, contador 40 dias, lotes p/ fornecedor | **bloqueado: dúvidas 1 e 4 do AGENTS.md** |
| 7 | Build final | Instalador .exe via electron-builder, ícone, nome (dúvida 5) | — |

Regra: só começo o passo N+1 depois que você testou e aprovou o passo N.
