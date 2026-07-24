# Bateria de testes — baseline v0.1.4

Estado de referência **antes** das melhorias pedidas pelo cliente. Rodar tudo com o app
instalado (não o `npm run dev`) e com o painel de dev → "Limpar banco de dados" antes de começar.
Prioridade = quanto custa se quebrar: **P0 = dinheiro/dado errado**, P1 = operação trava,
P2 = incômodo.

Automatizado (`npm test`):

- `test/smoke.js` — o app abre e o fluxo crítico anda de ponta a ponta.
- `test/p0.js` — casos **1–10, 12–15, 17–22, 25–29 e 32** desta lista (30 no total),
  mexendo pela UI e conferindo o resultado no banco. Cada caso é isolado: uma falha não
  esconde as outras. Validado quebrando a baixa de estoque de propósito → 4 casos acusaram.

Manual: os casos 11, 16, 23, 24 e tudo de P1/P2 (dependem de impressora, data do sistema,
pasta de backup, release publicada — caro de automatizar, barato de olhar).

---

## Bugs encontrados na leitura do código — corrigidos em 2026-07-24

Achados montando esta bateria, todos confirmados rodando. Correção de garantia (não são
funcionalidade nova). Cada um tem teste automatizado travando a regressão.

| # | Sintoma para o cliente | Correção | Teste |
|---|------------------------|----------|-------|
| S1 | Clicar em "Excluir" num produto que já vendeu **não fazia nada** — nem excluía, nem avisava (a FK do banco barrava calada). Como todo cadastro com quantidade > 0 cria uma entrada, pegava quase todo produto. | Avisa que o produto tem venda/troca e não pode sair (histórico e lucro do período se perderiam), sugerindo deixar a quantidade em 0. Produto que só tem entrada agora é excluído junto com ela. | 20, 20b, 21 |
| S2 | Preço digitado com ponto de milhar (`1.500,00`) virava **R$ 1,50** — venda registrada com 1/1000 do valor. | `parseReais` entende `1.500,00`, `1500,00`, `10,5` e também `10.50` (ponto do teclado numérico). | 7, 8, 8b |
| S3 | Desfazer uma entrada cuja leva já tinha sido vendida deixava o **estoque negativo**. | Recusa com explicação de quantas peças ainda existem e manda acertar pelo cadastro. | 19 |
| S4 | Dois cliques no ícone abriam **duas janelas** no mesmo banco: a segunda com estoque velho, sobrescrevendo a primeira. | Instância única — o 2º clique foca a janela que já está aberta. | manual (verificado: 2ª instância sai em ~0,3s) |
| S5 | Qualquer erro de banco falhava **calado**: a tela não reagia e o usuário achava que tinha dado certo. | Rede de segurança única em `src/main.jsx`: erro não tratado vira aviso na tela + log. | 33 |
| S6 | Apagar dígitos do PIN deixava o campo curto na tela e o **PIN antigo no banco** — o dono achava que tinha trocado e não tinha. | PIN incompleto não salva e o campo volta ao valor real ao sair. | 32 |

---

## P0 — Dinheiro e estoque (nunca pode errar)

### Venda
- [ ] 1. Vender 1 peça (compra 100,00 / venda 200,00) → estoque −1, venda R$ 200,00, lucro R$ 100,00 no Dashboard.
- [ ] 2. Vender quantidade 3 com 5 em estoque → estoque 2, total = 3 × preço.
- [ ] 3. Tentar vender quantidade maior que o estoque → bloqueado com aviso, nada gravado.
- [ ] 4. Tentar vender quantidade 0 / vazia / letra → bloqueado, nada gravado.
- [ ] 5. Peça com estoque 0 → botão "Vender" desabilitado.
- [ ] 6. Editar o preço na hora (desconto) → venda grava o preço editado, lucro cai proporcional.
- [ ] 7. Preço com **separador de milhar** `1.500,00` (S2) → conferir se grava R$ 1.500,00 ou R$ 1,50.
- [ ] 8. Preço com vírgula de 1 casa `10,5` → R$ 10,50.
- [ ] 9. Mão de obra preenchida → soma no total **uma vez só**, mesmo com quantidade 3.
- [ ] 10. Mão de obra vazia → total = preço × qtd, sem NaN.
- [ ] 11. Confirmar venda e **fechar o app na hora** → reabrir: venda gravada E estoque baixado (nunca só um dos dois).
- [ ] 12. Desfazer venda → estoque volta exatamente a quantidade vendida, some do histórico e do Dashboard.
- [ ] 13. Vender, depois **alterar o preço de compra** do produto no Estoque → o lucro da venda antiga **não muda** (custo congelado).
- [ ] 14. Vender com cada uma das 5 formas de pagamento → cada uma aparece certa no fechamento do dia.

### Estoque e entradas
- [ ] 15. Cadastrar produto com quantidade 5 → aparece na lista e gera entrada "cadastro inicial".
- [ ] 16. Cadastro em série: salvar 3 seguidos com 📌 no preço → os 3 entram, campos fixados mantidos.
- [ ] 17. Entrada de 7 a 20,00 sobre 5 a 10,00 → custo vira **15,83** (média ponderada).
- [ ] 18. Desfazer essa entrada → quantidade e custo voltam a 5 / 10,00.
- [ ] 19. Entrada → **vender tudo** → desfazer a entrada (S3) → conferir se o estoque fica negativo.
- [ ] 20. Excluir produto **sem** venda/entrada → some da lista.
- [ ] 21. Excluir produto **com** venda (S1) → deve avisar que não pode (ou impedir), nunca ficar mudo.
- [ ] 22. Editar produto (nome, preços) → lista atualiza, vendas antigas intactas.
- [ ] 23. Estoque mínimo: deixar qtd ≤ mínimo → linha vermelha + ⚠.
- [ ] 24. Ordenar por cada coluna (3 cliques: ↑ ↓ padrão) → ordem correta, inclusive Margem.

### Permissões (colaborador)
- [ ] 25. Logar como colaborador → só abas Estoque e Venda.
- [ ] 26. Colaborador não vê coluna Compra, Margem, nem o bloco "Últimas entradas".
- [ ] 27. Colaborador não vê "+ Novo produto", "+ Entrada", "Excluir" e não abre o form ao clicar na linha.
- [ ] 28. Colaborador vendendo: campo de preço **somente leitura**.
- [ ] 29. Colaborador não vê o botão "Trocar" nas vendas.
- [ ] 30. Sair e voltar como dono → tudo visível de novo.
- [ ] 31. PIN errado 3× → só recusa, não trava nem entra.
- [ ] 32. Trocar o PIN pela Config (S6) → sair, entrar com o PIN novo; o antigo não funciona mais.
- [ ] 33. Tentar remover o único administrador → bloqueado.
- [ ] 34. Remover um colaborador → some da tela de login.

---

## P0 — Código do produto (passo 10, aprovado 2026-07-24)

- [x] 85. Migração: abrir com banco antigo → todo produto ganha código, agrupado por tipo, nenhum repetido. **auto 38**
- [x] 86. Cadastrar "Tela" → código preenche sozinho enquanto digita; segunda "Tela" avança o número. **auto 34**
- [x] 87. "Capinha" pega `CA`; "Câmera traseira" vira `CAM` (3 letras, acento ignorado). **auto 35**
- [x] 88. Editar o código na mão → para de se regerar ao trocar o tipo. **auto 37b**
- [x] 89. Código repetido é recusado; com código livre, salva. **auto 37**
- [x] 90. Busca por prefixo (`TE0`) e por código inteiro (`TE002`), no Estoque e na Venda. **auto 36**
- [x] 91. Painel de dev: desativar demo com troca/nota por cima do fictício → apaga o fictício, preserva o real. **auto 39**

## P0 — Fechamento e vendedor (passo 11, aprovado 2026-07-24)

- [x] 92. Venda grava quem estava logado. **auto 40**
- [x] 93. Colaborador tem a aba Fechamento (além de Estoque e Venda). **auto 25**
- [x] 94. Fechamento mostra total do dia e nº de vendas, sem custo/margem/lucro. **auto 30**
- [x] 95. Venda do colaborador sai no nome dele. **auto 31**
- [x] 96. Dashboard e aba Fechamento mostram o mesmo número. **auto 30 + 43**
- [x] 97. Dashboard filtra o histórico por vendedor; voltar para "todos" restaura. **auto 41**
- [x] 98. Venda anterior ao passo 11 aparece como "não informado". **auto 43**
- [x] 99. Excluir usuário que já vendeu preserva a venda (zera só o vendedor). **auto 42**
- [ ] 100. Exportar Excel com a coluna Vendedor preenchida. *(manual — download de arquivo)*

## P1 — Trocas, crédito e relatórios

### Trocas
- [ ] 35. Venda → "Trocar" → escolher peça de reposição → estoque da nova −1, peça velha na prateleira, venda marcada "trocada".
- [ ] 36. Trocar por peça **mais cara** → mostra "você recebe +R$ x"; mais barata → "você paga".
- [ ] 37. Trocar por peça com estoque 0 → bloqueado.
- [ ] 38. Cadeia A → B → C: trocar a peça já trocada → as 3 linhas aparecem agrupadas sob a venda, só a última tem botão.
- [ ] 39. Desfazer a última troca → peça volta ao estoque e sai da prateleira.
- [ ] 40. Registrar defeituosa avulsa (sem venda) com "entreguei peça nova" → estoque −1.
- [ ] 41. Contador de dias: peça com 41 dias na prateleira → linha vermelha "⚠ prazo!".
- [ ] 42. Filtrar prateleira por fornecedor e por produto → "Selecionar todas" marca **só o filtrado**.
- [ ] 43. Fechar lote com 3 peças → lote #N com soma dos valores de compra, peças somem da prateleira.
- [ ] 44. "Lote retornou" → crédito com o valor exato do lote, lote vira ✔ resolvido, botão some.
- [ ] 45. Abater crédito de R$ 100,00 → saldo cai 100,00; abater mais que o saldo → saldo negativo em vermelho (é o esperado?).
- [ ] 46. Excluir peça da prateleira → some, não mexe no estoque.

### Dashboard
- [ ] 47. Cards Hoje / 7 dias / Mês / Ano batem com a soma manual das vendas do período.
- [ ] 48. Fechamento de hoje: soma das 5 formas = faturamento do card "Hoje".
- [ ] 49. Gráfico 14 dias / Este mês / Este ano → barras nas datas certas, dias sem venda com barra zerada.
- [ ] 50. Clicar numa vela → abre o detalhe por forma de pagamento daquele dia/mês; clicar de novo fecha.
- [ ] 51. Filtro de data manual (de/até) e os atalhos (Hoje, Ontem, Semana, Mês, Tudo) → contagem e totais coerentes.
- [ ] 52. Exportar Excel → abre no Excel com acento certo, colunas separadas, valores em vírgula decimal.
- [ ] 53. Exportar com produto que tenha `;` ou aspas no nome → não quebra as colunas.
- [ ] 54. Mais de 50 vendas no período → paginação anterior/próxima funciona.
- [ ] 55. **Virada de dia**: mudar a data do Windows para amanhã, reabrir → "Hoje" zera, "Ontem" mostra o movimento.
- [ ] 56. **Virada de mês/ano**: idem para 1º do mês e 1º de janeiro.

### Nota / recibo
- [ ] 57. Ligar nota na Config + dados da loja → vender → modal aparece, gerar PDF abre o arquivo com logo, nº 0001.
- [ ] 58. Segunda venda → nº 0002 (sequência não repete nem pula).
- [ ] 59. "Pular" a nota → venda registrada sem nota; botão "Nota" ainda disponível na linha depois.
- [ ] 60. Reimprimir → mesmo número, mesmos valores, não cria nota nova.
- [ ] 61. Nota com nome de cliente com acento/aspas → sai correto no PDF.
- [ ] 62. Desfazer uma venda que já tinha nota emitida → definir o comportamento esperado (hoje a nota fica no banco).
- [ ] 63. Nota desligada na Config → nenhum botão de nota na tela de Venda.

---

## P2 — Infraestrutura (o seguro do cliente)

### Backup e restauração
- [ ] 64. Escolher pasta → "Fazer backup agora" → arquivo `estoque-AAAA-MM-DD.db` criado.
- [ ] 65. Sem pasta escolhida → mensagem clara, não quebra.
- [ ] 66. Pasta apagada/pendrive removido → mensagem de erro, app continua funcionando.
- [ ] 67. Backup roda sozinho ao abrir e de hora em hora; 2 backups no mesmo dia → sobrescreve o arquivo do dia.
- [ ] 68. **Restauração real**: copiar o `.db` do backup por cima de `%APPDATA%/estoque-celular/estoque.db` com o app fechado → abrir e conferir que os dados voltaram completos (é o teste que mais importa aqui).
- [ ] 69. Apontar a pasta para o Google Drive → arquivo sincroniza.

### Atualização
- [ ] 70. Instalar a versão anterior, cadastrar dados, publicar release nova → "Verificar atualização" acha, baixa, instala.
- [ ] 71. Depois do update: **todos os dados continuam lá** (produtos, vendas, usuários, config, logo).
- [ ] 72. Sem internet → mensagem de erro, não trava o app.
- [ ] 73. Já na última versão → "Você já está na versão mais recente".

### Comportamento geral
- [ ] 74. Abrir o app **duas vezes** (S4) → verificar se abre duas janelas e o que acontece com o estoque.
- [ ] 75. Desligar o PC na tomada com o app aberto → reabrir: banco íntegro, nenhuma venda pela metade.
- [ ] 76. "Iniciar com o Windows" ligado → reiniciar → app abre sozinho; desligar → não abre.
- [ ] 77. Trocar título e logo na Config → refletem na barra de cima e no recibo.
- [ ] 78. Nome de produto muito longo / com emoji → tabela não quebra o layout.
- [ ] 79. Tela em 1366×768 (notebook comum de loja) → nada cortado, botões alcançáveis.
- [ ] 80. Ativar demo → 40 produtos e 4 meses de venda; desativar → some só o fictício.
- [ ] 81. Demo ativa → registrar uma venda real sobre produto fictício → desativar demo → **essa venda real também some** (comportamento documentado; confirmar se o cliente aceita).
- [ ] 82. "Limpar banco de dados" → volta a Administrador/1234, tudo vazio.

### Volume (só se o cliente tiver base grande)
- [ ] 83. 1.000 produtos cadastrados → busca da tela de Venda responde sem travar.
- [ ] 84. 10.000 vendas → Dashboard e exportação não congelam a tela.

---

## Como eu tocaria isso

1. `npm test` a cada mudança — 30 casos P0 em ~40s.
2. P0 manual: só o que sobrou (11, 16, 23, 24).
3. P1 e P2 manuais, na primeira rodada inteiros; depois, a cada release, pelo menos
   P2/68 (restaurar backup) e P2/71 (dados após update) — são o seguro do cliente.
4. Os 6 bugs da tabela acima já estão corrigidos: na rodada manual, confirmar S1, S3, S4 e
   S6 na máquina do cliente (S2 e S5 estão cobertos pelo automatizado).
