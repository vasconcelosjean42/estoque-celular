# Passo 25 — Código de barras (cadastro, filtros e bipagem na venda)

> Pedido do cliente em 2026-07-26 (item 3 de 3), com pistola de código de barras
> na loja. Reverte a decisão de 2026-07-24 ("sem código de barras"), que valia
> quando não havia leitor.

## O que a pistola faz

Leitor USB é um **teclado**: ele digita os caracteres do código no campo que
estiver com o foco e manda **Enter** no fim (sufixo padrão de fábrica). O app não
precisa de driver, biblioteca nem permissão — precisa de um campo focado e de
saber o que fazer no Enter.

## Entregável

### 1. Campo no cadastro

`pecas.codigo_barras TEXT NOT NULL DEFAULT ''`, com índice único **parcial**
(vazio não colide com vazio — é o mesmo padrão do `codigo` do passo 10).

- Campo **"Código de barras"** no formulário do produto, abaixo do código
  interno. Basta clicar nele e bipar.
- **Opcional**: produto salva sem ele. Pode ser preenchido ou trocado depois,
  editando o produto — é o mesmo campo.
- **Repetido é recusado**, dizendo de qual produto o código já é. Dois produtos
  com o mesmo código de barras fariam a bipagem vender o item errado.
- Sem validação de formato: aceita EAN-13, EAN-8, UPC e Code128 (que tem letra).
  O valor é só aparado nas pontas.

### 2. Código de barras ≠ código do produto

O `codigo` (`TE001`) continua existindo e continua sendo o que a importação por
planilha usa pra casar produto. O código de barras é o do **fabricante**, e nem
todo produto tem (peça avulsa de fornecedor chinês costuma vir sem).

### 3. Filtros

A busca do **Estoque** e a da **Venda** passam a casar por código de barras,
junto com código, nome e modelo. Na lista do Estoque o código de barras aparece
em cinza embaixo do código interno — é assim que o dono enxerga quais produtos
ainda faltam bipar.

### 4. Bipar na venda cai direto no carrinho

Na busca da Venda, **Enter** (o que a pistola manda no fim do código):

1. Casamento **exato** com código de barras ou com o código interno → o produto
   entra no carrinho e a busca é limpa, pronta pro próximo bipe.
2. Sem casamento exato, mas com **um único produto** filtrado na tela → esse
   entra. Serve pra quem digita "tela a12" e aperta Enter.
3. Nada disso → não faz nada; a lista filtrada continua na tela (código não
   cadastrado aparece como "Nenhuma peça encontrada").

Bipar o mesmo código duas vezes soma quantidade no item do carrinho, como o
botão "+ Adicionar" já fazia. Produto **sem estoque não entra** no carrinho, nem
bipado nem clicado.

## Decisões

- **Enter é o gatilho, não um cronômetro.** A alternativa seria medir o intervalo
  entre teclas pra "adivinhar" que foi pistola e não digitação. É heurística que
  erra em máquina lenta, e a pistola já manda Enter de fábrica. Se alguma vier
  sem, se configura a pistola (código de barras que vem no manual dela).
- **A busca continua filtrando enquanto a pistola digita.** Não dá pra evitar
  sem o cronômetro acima, e não atrapalha: o Enter chega logo em seguida e limpa
  tudo.
- **Coluna nova em vez de reaproveitar `codigo`.** O `codigo` é gerado pela loja,
  é a chave da importação por planilha e existe pra todo produto; o de barras é
  do fabricante e falta em muitos. Enfiar os dois na mesma coluna quebraria a
  importação e o gerador `TE001`.
- **A trava de duplicidade é no banco e na tela.** Índice único parcial pra não
  depender só da validação da tela (importação e edição são caminhos diferentes).

## Fora de escopo

- Coluna `Código de barras` na importação/exportação por planilha (passo 22).
  É o caminho natural pra cadastrar os 214 de uma vez, se ele pedir.
- Modo "bipagem em série" pra sair batendo o estoque inteiro pela prateleira.
- Gerar/imprimir etiqueta de código de barras.
- Bipar na entrada de estoque, na troca ou no inventário.
- Validar dígito verificador do EAN.

## Como testar

1. Cadastrar produto bipando o código no campo → salva com o código.
2. Cadastrar outro produto com o **mesmo** código de barras → recusado, dizendo
   de quem é o código.
3. Cadastrar produto **sem** código de barras → salva normal; depois editar o
   produto e bipar → passa a ter código.
4. Estoque: buscar pelo código de barras → acha o produto.
5. Venda: bipar o código → o produto **entra no carrinho** direto e o campo de
   busca fica limpo.
6. Bipar o mesmo produto de novo → quantidade 2 no carrinho.
7. Bipar produto com estoque 0 → não entra, com aviso.
8. Bipar um código que não existe → nada acontece e a lista mostra "Nenhuma peça
   encontrada".
