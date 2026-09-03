// Mesmo padrão de alinhamento do card Resumo do Dashboard: "R$" fixo à
// esquerda, número alinhado à direita — em vez do valor inteiro como um
// bloco só, que sempre deixava o "R$" em posições diferentes por linha
// (números com tamanhos diferentes).
export function ValorLista({
  valor,
  sinal = "",
  cor,
}: {
  valor: number;
  sinal?: "+" | "-" | "";
  cor?: "pos" | "neg";
}) {
  const numero = Math.abs(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const classeCor = cor === "pos" ? " mc-list-value-pos" : cor === "neg" ? " mc-list-value-neg" : "";

  return (
    <div className={`mc-list-value${classeCor}`}>
      <span className="mc-list-value-cifrao">{sinal}R$</span>
      <span className="mc-list-value-numero">{numero}</span>
    </div>
  );
}
