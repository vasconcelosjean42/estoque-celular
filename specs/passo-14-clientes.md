# Passo 14 — Cadastro de clientes e histórico de compras

> Melhoria 2 do cliente. Bloco B. **Depende do passo 12** (o cliente é do pedido).

## Objetivo

Parar de digitar o nome do cliente solto a cada venda: o cliente vira cadastro
com código, e o administrador consegue ver o que cada um comprou e quanto já
gastou na loja.

## Entregável

- Schema:
  - Tabela `clientes (id, codigo, nome, contato, criado_em)` — `codigo`
    sequencial automático `C001`, `C002`…, editável, único.
  - `vendas.cliente_id INTEGER REFERENCES clientes(id)`. A coluna `cliente`
    (texto) continua existindo para as vendas antigas.
  - **Migração**: os nomes que já estão em `vendas.cliente` viram clientes
    cadastrados e as vendas antigas são vinculadas.
- **Na venda** (tela de confirmação do pedido): o campo Cliente ganha sugestão
  dos clientes já cadastrados (por código ou nome). Nome novo → cria o cliente na
  hora, sem sair da venda. Continua **opcional** (venda de balcão sem nome segue
  funcionando).
- **Config → Clientes** (visível só para o administrador):
  - Lista: código, nome, contato, **total de compras (R$)**, nº de compras,
    última compra. Ordenável e com busca por código/nome.
  - Clicar num cliente → **histórico de compras dele**: data, itens, valor,
    forma de pagamento.
  - **Compras do dia**: lista das vendas de hoje com o cliente de cada uma.
  - Editar nome/contato/código e excluir cliente (excluir só desvincula das
    vendas, nunca apaga histórico de venda).

## Fora de escopo

- Fiado / "quem deve" — continua fora do v1, como combinado no AGENTS.md.
- Aniversário, endereço, CPF, campanha de mensagem.
- Colaborador consultar histórico de cliente (a tela vive na Config, que é do
  administrador).

## Como testar

1. Vender para "João" (cliente novo) → cliente criado com código `C00x`.
2. Vender de novo digitando `C00x` ou "João" → sugere e vincula ao mesmo
   cadastro, sem duplicar.
3. Config → Clientes: João aparece com 2 compras e o total certo.
4. Clicar em João → histórico com as duas compras, itens e formas de pagamento.
5. "Compras do dia" mostra as vendas de hoje com o nome do cliente.
6. Vender sem informar cliente → venda normal, sem cadastro criado.
7. Depois de atualizar com banco antigo: nomes que já existiam em vendas viraram
   clientes e o histórico deles está certo.
8. Excluir um cliente → some da lista, mas as vendas dele continuam no Dashboard.
