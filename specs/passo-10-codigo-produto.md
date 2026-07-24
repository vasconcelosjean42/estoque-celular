# Passo 10 — Código do produto e busca por código

> Melhoria 1 do cliente. Bloco A (independente, não depende de nenhum outro passo).

## Objetivo

Todo produto passa a ter um código curto e memorizável, gerado sozinho, para o
vendedor pedir/anotar peça sem soletrar nome e modelo. A busca do Estoque e da
Venda passa a achar por código também.

## Formato

`2 letras do tipo + 3 dígitos sequenciais daquele tipo` — `TE001`, `BA001`, `CA001`.

- **Tipo** é o campo `nome` que já existe ("Tela", "Bateria", "Capinha").
- Prefixo = 2 primeiras letras do tipo, sem acento, maiúsculas.
- **Colisão**: se as 2 letras já pertencem a outro tipo, estende para 3
  ("Capinha" pegou `CA` → "Câmera traseira" vira `CAM`). Quem cadastrou primeiro
  fica com as 2 letras.
- Numeração é por prefixo: `MAX(número do prefixo) + 1`.
- Onde o prefixo fica guardado: **em lugar nenhum**. Ao cadastrar, o sistema
  busca outro produto com o mesmo `nome` e reaproveita o prefixo dele; se não
  houver, gera um novo. Sem tabela nova, sem tela de configuração.

## Entregável

- Schema: `ALTER TABLE pecas ADD COLUMN codigo TEXT NOT NULL DEFAULT ''` +
  índice único parcial (`WHERE codigo != ''`) — o banco garante que não repete.
- **Migração**: na primeira abertura, todo produto existente ganha código,
  agrupado por tipo e na ordem de cadastro.
- Campo **Código** no formulário de produto: vem preenchido com o código gerado
  e é **editável**. Código repetido é recusado com aviso.
- Coluna **Código** na tabela do Estoque, primeira posição.
- Busca do Estoque e da Venda passa a casar **código, tipo (nome) e modelo** no
  mesmo campo. `TE0` traz todas as telas; `TE002` vai direto na peça.

## Fora de escopo

- Código de barras / leitor (decidido: não). Se um dia entrar, o leitor
  simplesmente digita o código no campo de busca — nada muda no sistema.
- Etiqueta impressa.

## Como testar

1. Cadastrar "Tela iPhone 15" → código vem `TE00x` sozinho, seguindo as telas
   que já existem.
2. Cadastrar "Capinha …" → `CA001`. Depois "Câmera traseira …" → `CAM001`
   (3 letras, porque `CA` já é da capinha).
3. Buscar `TE002` no Estoque e na Venda → acha a peça certa.
4. Buscar `TE0` → lista todas as telas.
5. Editar o código de um produto para `X1` → salva. Tentar repetir um código já
   usado → recusa com aviso, nada é gravado.
6. Abrir o app atualizado com o banco antigo → todos os produtos já vêm com
   código, nenhum repetido.
