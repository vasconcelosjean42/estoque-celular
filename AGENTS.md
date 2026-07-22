# Estoque Celular

Sistema desktop de controle de estoque, vendas e trocas para uma loja de peças, acessórios e conserto de celular. Cliente: pequena empresa, 1 PC na loja, usuário leigo em sistemas. Prioridade absoluta: **mínimo de cliques** e simplicidade.

## Stack

- **Electron + React (Vite) + better-sqlite3** — tudo JS, roda 100% offline.
- Banco: arquivo único SQLite em `app.getPath("userData")/estoque.db`, WAL ativado.
- **Preços em centavos (INTEGER)** — nunca float para dinheiro.
- Backup: cópia diária do `.db` para uma pasta configurável (apontar para a pasta do Google Drive desktop do cliente = "nuvem" de graça). Sem banco na nuvem, sem sync — 1 PC só, não há conflito.
- Login simples com níveis de acesso: **dono** (vê/edita tudo) × **funcionário** (não vê preço de compra/margem/lucro, não edita preços). Sem impressão fiscal (v1).

## Escopo v1

1. **Estoque** — peça: nome, modelo, quantidade, preço compra, preço venda, margem automática, alerta de estoque mínimo.
2. **Venda rápida** — busca → 1 clique → baixa estoque + registra venda (preço editável na hora p/ desconto). Custo é congelado na venda (`preco_compra` copiado) para margem histórica correta.
3. **Dashboard** — lucro/faturamento por semana/mês/ano, gráficos simples, histórico completo de vendas.
4. **Trocas (garantia c/ fornecedor)** — peça defeituosa devolvida por terceiro entra na "prateleira" com modelo/defeito/data; contador de 40 dias; fechar lote → enviado ao fornecedor; retorno do lote conforme resposta da dúvida 1 abaixo.
5. **Config** — flag mão de obra ON/OFF (soma valor de serviço na venda), pasta de backup.

## Caso de uso canônico

Cliente chega para trocar tela do Note 10. Tela no estoque: compra R$100, venda R$200. Operador busca "note 10" → vende → estoque -1, venda +R$200, lucro +R$100, entra na semana/mês/ano e no histórico.

## Regras de código

- Ladder ponytail: menor solução que funciona, sem abstração especulativa.
- Schema é a fonte de verdade (`electron/db.js`). Margem, totais e períodos são **derivados por query**, nunca armazenados.
- Renderer chama SQL direto via IPC (`window.api.query`) — app local, único usuário, sem conteúdo remoto; não criar camada de repositório/ORM.

## Comercial (fechado)

- **Venda do sistema: R$ 600** (preço de interior, à vista ou parcelado a combinar).
- **Garantia: 90 dias** — correção de bugs sem custo.
- **Manutenção: sem mensalidade.** Cobrada **por chamado**, só quando o cliente chamar: **R$ 60 por problema resolvido** (fora da garantia), independente de quantas visitas levar. Valor pode ser reajustado com o tempo.
- **Funcionalidade nova: valor a definir por demanda**, conforme complexidade de implementação e integração — orçada e aprovada antes de fazer.
- Manutenção ≠ funcionalidade nova: manutenção mantém o que existe funcionando; coisa nova é orçamento à parte.

## DÚVIDAS RESPONDIDAS (2026-07-22)

1. **Quando o fornecedor devolve o lote trocado: a peça nova volta ao estoque ou vira crédito para compras futuras?**
   R: Vira **crédito** com o fornecedor, no mesmo valor de compra da peça. Sistema controla o saldo de crédito.

2. **Registrar forma de pagamento (dinheiro/cartão/Pix)? Se cartão, a taxa da maquininha desconta do lucro mostrado?**
   R: Sim, separado: **espécie, Pix, crédito à vista, crédito parcelado**. Taxa da maquininha é repassada ao cliente (não desconta do lucro). Fechamento do dia mostra o total por forma de pagamento (quanto bateu em espécie, quanto caiu em Pix etc.).

3. **Existe venda fiado/a prazo? Precisa controlar "quem deve"?**
   R: **Sem fiado no v1** — fica para uma versão futura (o schema/telas devem facilitar essa adição). Requisito firme: o programa deve ser fácil de estender e de **atualizar sem perder dados** — electron-updater + GitHub Releases (app se atualiza sozinho; banco fica em userData, intocado).

4. **O terceiro que devolve a peça defeituosa recebe reembolso ou peça nova na hora? (afeta caixa e estoque)**
   R: Na maioria troca pelo **mesmo modelo** na hora. Pode trocar por outra peça, pagando/recebendo a diferença. Se não usou a peça e devolve funcionando: **estorno** do valor e a peça **volta ao estoque**.

5. **O sistema tem nome? (título da janela, ícone)**
   R: **Título e logo editáveis na tela de Config.**

## Adição pedida pelo cliente

- **Controle de usuários**: dono edita preços e vê tudo; demais níveis não veem preço de compra, margem e lucro.
