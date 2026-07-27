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
