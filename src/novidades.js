// Mural de atualizações — aparece na Config, dentro do bloco "Sobre / Atualização".
//
// REGRA (também está no AGENTS.md): toda versão nova entra AQUI NO TOPO, antes de
// gerar o build. É o que o cliente lê pra saber o que mudou depois que o app se
// atualiza sozinho. Escrever em linguagem de loja — o que ele passa a conseguir
// fazer — não em nome de arquivo, tabela ou passo do roadmap.
//
// A Config mostra SÓ o primeiro item desta lista. O resto fica aqui de histórico:
// board da atualização nova ocupa o lugar do anterior, nunca empilha.
export default [
  {
    versao: "1.0.3",
    data: "18/09/2026",
    itens: [
      "No menu de cima apareceu \"Ajuda > Ver logs\": abre a pasta com o arquivo de registro já selecionado. Quando o suporte pedir o log, é só clicar ali e mandar o arquivo.",
      "Quando o computador do balcão perde a conexão com o PC principal, o sistema agora anota o motivo (o PC principal desligou ou dormiu, o programa foi fechado lá, o Wi-Fi caiu, alguém clicou em Desconectar). Se acontecer de novo, o suporte pede o arquivo de registro e descobre a causa sem precisar ir até a loja.",
      "No aviso de \"Sem conexão com o PC principal\" passou a aparecer um detalhe técnico no fim. Uma foto desse aviso já ajuda o suporte.",
    ],
  },
  {
    versao: "1.0.2",
    data: "31/08/2026",
    itens: [
      "Correção de bugs.",
    ],
  },
  {
    versao: "1.0.1",
    data: "31/08/2026",
    itens: [
      "Na aba Clientes do colaborador saiu a coluna com o total que cada cliente já gastou. Ele continua vendo o nome, o telefone, quantas compras o cliente fez, a última e há quantos dias está sem comprar — que é o que ele usa pra ligar. O administrador continua vendo o valor normalmente, na Config.",
    ],
  },
  {
    versao: "1.0.0",
    data: "30/08/2026",
    itens: [
      "Dois computadores na loja usando o sistema ao mesmo tempo, com o mesmo estoque: um PC guarda os dados e o outro se conecta nele pela rede da loja. Em Config → Rede você escolhe qual é qual; o principal mostra o endereço e a senha pra digitar no outro.",
      "Vender no balcão e no escritório ao mesmo tempo não bagunça mais o estoque: se a última peça acabou de sair no outro computador, a venda é recusada com aviso em vez de deixar o estoque negativo.",
      "Se o computador principal estiver desligado, o outro avisa \"sem conexão com o PC principal\" em vez de dar erro, e volta a funcionar sozinho quando ele liga.",
      "Nessa tela de \"sem conexão\", o PC do balcão ganhou o botão \"Usar o banco deste computador\": se o principal não vai voltar (levaram a máquina, queimou), dá pra soltar o balcão na hora e continuar vendendo sozinho, sem chamar ninguém. O mesmo botão \"Desconectar\" está em Config → Rede pra quando o sistema abre normalmente. Os dados que ficaram no principal continuam lá, e o endereço fica gravado pra reconectar depois.",
      "Em Config → Rede, o PC principal ganhou o botão “Liberar o sistema no Firewall do Windows”. É pra quando o computador do balcão não conecta de jeito nenhum: o Windows só pergunta uma vez na vida se libera o sistema na rede, e se ele não perguntou — ou se alguém respondeu Não naquele dia — este botão faz a liberação sozinho. Pode clicar quantas vezes precisar; ele só abre para os computadores ligados no mesmo roteador da loja.",
      "A lista de clientes mostra há quantos dias cada um está sem comprar. Um dia sem aparecer fica laranja, dois dias ou mais fica vermelho — dá pra bater o olho e ver pra quem ligar.",
      "Clientes virou uma aba pro colaborador, com o telefone de cada um do lado, inteiro numa linha só pra discar direto. Antes a lista só existia dentro da Config, que é do administrador.",
      "Na Config, o administrador escolhe o período e vê quanto cada cliente comprou nele: hoje, ontem, esta semana, este mês ou entre duas datas. Uma linha em cima da lista mostra o total de todos juntos, e ela acompanha a busca — procurar um nome responde quanto aquele cliente comprou no período.",
      "Quem não comprou nada no período continua aparecendo na lista, zerado, com os dias sem comprar do lado — que é justamente o cliente que interessa achar.",
    ],
  },
  {
    versao: "0.7.0",
    data: "14/08/2026",
    itens: [
      "A lista de vendas agora mostra o dia junto com a hora — com os filtros de ontem, semana e mês dá pra saber de que dia é cada venda.",
      "Na Venda dá pra escolher o período por data, igual no Dashboard, e uma lupa acha a venda pelo nome do cliente ou pelo produto — sem rolar a lista procurando pra fazer a troca.",
      "Escolher uma data de início depois da data final (ou o contrário) não devolve mais lista vazia: a outra data acompanha sozinha.",
    ],
  },
  {
    versao: "0.6.0",
    data: "31/07/2026",
    itens: [
      "A nota agora sai com a forma de pagamento. Se o cliente pagou em mais de uma, o recibo lista cada uma e quanto foi em cada.",
    ],
  },
  {
    versao: "0.5.0",
    data: "30/07/2026",
    itens: [
      "O Estoque agora exporta a lista de produtos pro Excel num clique, com quantidade, preços e margem.",
      "E dá pra marcar os tipos que quer antes: só as telas, ou telas e baterias juntas — a planilha sai com o que estiver na tela.",
    ],
  },
  {
    versao: "0.4.0",
    data: "28/07/2026",
    itens: [
      "Uma venda pode ser paga em mais de uma forma: o cliente dá R$ 50 em dinheiro e o resto no cartão, e o fechamento do dia mostra cada parte no lugar certo.",
      "Importou a planilha errada? Agora dá pra desfazer a importação inteira num clique — ou clicar nela pra abrir a lista e tirar só os produtos errados.",
    ],
  },
  {
    versao: "0.3.0",
    data: "26/07/2026",
    itens: [
      "Estoque mostra no topo da tabela o total de itens, quanto o estoque custou, quanto ele vale vendido e a margem — e os números acompanham a busca.",
      "Colaborador agora faz e desfaz trocas direto na venda, sem precisar chamar o administrador e sem senha.",
      "Código de barras: cadastre bipando com a pistola, busque por ele no Estoque e na Venda, e bipe na venda pra jogar o produto direto no carrinho.",
    ],
  },
  {
    versao: "0.2.0",
    data: "26/07/2026",
    itens: [
      "Carrinho: vários produtos num pedido só, com desconto autorizado por PIN do administrador.",
      "Cadastro de clientes com histórico de compras.",
      "Trocas: peça devolvida funcionando volta ao estoque, estorno de dinheiro, perda e crédito parcial do lote.",
      "Importação de produtos por planilha, com revisão item a item antes de gravar.",
      "Arquivar produto fora de linha sem perder o histórico.",
    ],
  },
  {
    versao: "0.1.4",
    data: "24/07/2026",
    itens: ["Correção na atualização automática (o download falhava por causa do nome do arquivo)."],
  },
  {
    versao: "0.1.3",
    data: "24/07/2026",
    itens: ["Painel de desenvolvedor ganhou o 'limpar banco de dados' pra preparar máquina nova."],
  },
  {
    versao: "0.1.2",
    data: "23/07/2026",
    itens: ["Bloco 'Sobre' na Config mostrando a versão instalada, com verificar e instalar atualização."],
  },
  {
    versao: "0.1.1",
    data: "23/07/2026",
    itens: ["A venda recém-registrada pisca em verde na lista de vendas do dia."],
  },
];
