// ─────────────────────────────────────────
// QuitaZAP — Gerador de Plano de Quitação
// ─────────────────────────────────────────

export type DividaTemp = {
  texto: string;
  valor: number;
  parcelas: number;
};

export function gerarMensagemPlano(
  nome: string,
  dividas: DividaTemp[],
  renda: number
): string {
  const total = dividas.reduce((sum, d) => sum + (d.valor || 0), 0);

  // Snowball: menores primeiro
  const ordenadas = [...dividas].sort((a, b) => (a.valor || 0) - (b.valor || 0));

  // Separar 25% da renda por mês = ~6.25% por semana
  const separarSemana = Math.round((renda * 0.25) / 4);
  const separarMes    = Math.round(renda * 0.25);
  const meses         = total > 0 && separarMes > 0 ? Math.ceil(total / separarMes) : 0;
  const mesesEsforco  = Math.ceil(meses * 0.65);

  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

  const prioridades = ordenadas
    .slice(0, 5)
    .map((d, i) => {
      const label = d.texto.split(",")[0]?.trim() || `Dívida ${i + 1}`;
      const val   = d.valor > 0 ? ` — R$ ${fmt(d.valor)}` : "";
      const parc  = d.parcelas > 1 ? ` (${d.parcelas}x)` : "";
      return `${emojis[i]} ${label}${val}${parc}`;
    })
    .join("\n");

  return `📊 *Diagnóstico QuitaZAP — ${nome}*

💳 *Total em dívidas:* R$ ${fmt(total)}
Você tem ${dividas.length} dívida${dividas.length !== 1 ? "s" : ""} cadastrada${dividas.length !== 1 ? "s" : ""}.

🎯 *Prioridade de pagamento:*
${prioridades}

💰 *Quanto separar:*
Com renda de R$ ${fmt(renda)}: reserve *R$ ${fmt(separarSemana)}/semana*

📅 *Previsão de quitação:*
Pagando o mínimo: ~${meses} meses
Com esforço extra: ~${mesesEsforco} meses

---
✅ Suas informações foram registradas. Siga o plano e acompanhe seu progresso!

_QuitaZAP — Organize hoje, quite amanhã_ 💚`;
}

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
