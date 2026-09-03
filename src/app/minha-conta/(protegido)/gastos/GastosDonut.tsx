const RAIO = 15.9155; // 2π·r ≈ 100, então dasharray/dashoffset já ficam direto em "% do círculo"

export function GastosDonut({
  categorias,
  totalFmt,
}: {
  categorias: { nome: string; percentual: number; cor: string }[];
  totalFmt: string;
}) {
  let acumulado = 0;

  return (
    <div className="gastos-donut-wrap">
      <svg viewBox="0 0 36 36" className="gastos-donut-svg">
        <circle r={RAIO} cx="18" cy="18" fill="none" stroke="var(--line)" strokeWidth="4" />
        <g transform="rotate(-90 18 18)">
          {categorias.map((c) => {
            const offset = -acumulado;
            acumulado += c.percentual;
            return (
              <circle
                key={c.nome}
                r={RAIO}
                cx="18"
                cy="18"
                fill="none"
                stroke={`var(--${c.cor})`}
                strokeWidth="4"
                strokeDasharray={`${c.percentual} ${100 - c.percentual}`}
                strokeDashoffset={offset}
              />
            );
          })}
        </g>
      </svg>
      <div className="gastos-donut-centro">
        <span className="gastos-donut-centro-label">Total</span>
        <span className="gastos-donut-centro-valor">{totalFmt}</span>
      </div>
    </div>
  );
}
