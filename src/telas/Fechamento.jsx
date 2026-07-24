import React, { useEffect, useState } from "react";
import { fmtReais } from "./Estoque.jsx";
import { FORMAS } from "./Venda.jsx";

// Mesmo bloco no Dashboard (administrador) e na aba Fechamento (colaborador):
// os dois têm que mostrar exatamente o mesmo número, então a consulta mora aqui.
// Só faturamento por forma de pagamento — nada de custo, margem ou lucro.
export default function Fechamento({ destaque = false }) {
  const [linhas, setLinhas] = useState([]);

  useEffect(() => {
    window.api
      .query(`SELECT forma_pagamento, SUM(preco_venda * quantidade + mao_de_obra) AS total, COUNT(*) AS n
              FROM vendas WHERE date(criado_em) = date('now','localtime') GROUP BY forma_pagamento`)
      .then(setLinhas);
  }, []);

  const total = linhas.reduce((s, l) => s + l.total, 0);
  const qtd = linhas.reduce((s, l) => s + l.n, 0);

  return (
    <div style={destaque ? { maxWidth: 560 } : undefined}>
      <h3 style={{ marginTop: 0 }}>Fechamento de hoje</h3>
      {Object.entries(FORMAS).map(([valor, rotulo]) => {
        const linha = linhas.find((f) => f.forma_pagamento === valor);
        return (
          <div key={valor} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #e2e8f0", fontSize: destaque ? 19 : 16 }}>
            <span>{rotulo}</span>
            <strong>{fmtReais(linha ? linha.total : 0)}</strong>
          </div>
        );
      })}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontSize: destaque ? 24 : 18, fontWeight: "bold" }}>
        <span>Total do dia</span>
        <span>{fmtReais(total)}</span>
      </div>
      <div style={{ color: "#64748b", fontSize: 15 }}>
        {qtd} venda{qtd === 1 ? "" : "s"} hoje
      </div>
    </div>
  );
}
