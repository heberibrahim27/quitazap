// ─────────────────────────────────────────
// QuitaZAP — Gerador de Plano de Quitação
// ─────────────────────────────────────────

export type DividaTemp = {
  texto: string;
  valor: number;
  parcelas: number;
  valorParcela?: number;
  diaVencimento?: number;
  diaFechamento?: number;
  emAtraso?: boolean;
  mesesAtraso?: number;
};

export function gerarMensagemPlano(
  nome: string,
  dividas: DividaTemp[],
  renda: number
): string {
  const total = dividas.reduce((sum, d) => sum + (d.valor || 0), 0);

  // Parcela mensal por dívida: usa valorParcela se disponível, senão divide pelo nº de parcelas
  const dividasComParcela = dividas.map((d) => {
    const parc = d.parcelas > 0 ? d.parcelas : 1;
    const mensal = d.valorParcela && d.valorParcela > 0 ? d.valorParcela : d.valor / parc;
    return { ...d, mensal };
  });

  const parcelaMensalTotal = dividasComParcela.reduce((sum, d) => sum + d.mensal, 0);
  const comprometimento = renda > 0 ? (parcelaMensalTotal / renda) * 100 : 0;
  const nivelRisco =
    comprometimento > 50 ? "🔴 *Crítico* — renegociação urgente recomendada"
    : comprometimento > 30 ? "🟡 *Atenção* — controle rígido necessário"
    : "🟢 *Controlado* — siga o plano";

  // Snowball: menores dívidas primeiro
  const ordenadas = [...dividasComParcela].sort((a, b) => (a.valor || 0) - (b.valor || 0));

  // Meses até quitar tudo
  const mesesParaQuitar = Math.max(...dividas.map((d) => d.parcelas > 0 ? d.parcelas : 1));
  const dataQuitacao = new Date();
  dataQuitacao.setMonth(dataQuitacao.getMonth() + mesesParaQuitar);
  const mesQuitacao = dataQuitacao.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  // ── SEÇÃO: O QUE PAGAR ESTE MÊS ─────────────────────────
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const mesAtual = hoje.toLocaleDateString("pt-BR", { month: "long" });

  const dividasComVencimento = dividasComParcela.filter((d) => d.diaVencimento);
  const dividasSemVencimento = dividasComParcela.filter((d) => !d.diaVencimento);

  // Ordena por urgência: quem vence primeiro (considerando o mês atual)
  const ordenadosPorVencimento = [...dividasComVencimento].sort((a, b) => {
    const vA = a.diaVencimento! >= diaHoje ? a.diaVencimento! : a.diaVencimento! + 31;
    const vB = b.diaVencimento! >= diaHoje ? b.diaVencimento! : b.diaVencimento! + 31;
    return vA - vB;
  });

  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

  // Lista "o que pagar este mês"
  let listaMes = "";
  if (ordenadosPorVencimento.length > 0) {
    listaMes = ordenadosPorVencimento.map((d, i) => {
      const label = d.texto.split(",")[0]?.trim() || `Dívida ${i + 1}`;
      const diasRestantes = d.diaVencimento! >= diaHoje
        ? d.diaVencimento! - diaHoje
        : (31 - diaHoje) + d.diaVencimento!;
      const urgencia = diasRestantes <= 3 ? "⚠️ URGENTE — " : diasRestantes <= 7 ? "⏰ Esta semana — " : "";
      const fechaInfo = d.diaFechamento ? ` (fecha dia ${d.diaFechamento})` : "";
      const atrasoInfo = d.emAtraso ? ` ⚠️ em atraso${d.mesesAtraso ? ` (${d.mesesAtraso} meses)` : ""}` : "";
      return `${emojis[i]} *${label}*${atrasoInfo}\n   ${urgencia}Pagar *R$ ${fmt(d.mensal)}* até dia *${d.diaVencimento}*${fechaInfo}`;
    }).join("\n");

    if (dividasSemVencimento.length > 0) {
      const semData = dividasSemVencimento.map((d) => {
        const label = d.texto.split(",")[0]?.trim() || "Dívida";
        return `• *${label}* — R$ ${fmt(d.mensal)}/mês (confirme a data de vencimento)`;
      }).join("\n");
      listaMes += `\n\n📋 *Sem data informada:*\n${semData}`;
    }
  } else {
    // Se não tem nenhuma data, mostra as parcelas sem urgência
    listaMes = ordenadas.map((d, i) => {
      const label = d.texto.split(",")[0]?.trim() || `Dívida ${i + 1}`;
      const atrasoInfo = d.emAtraso ? ` ⚠️ em atraso` : "";
      return `${emojis[i]} *${label}*${atrasoInfo} — R$ ${fmt(d.mensal)}/mês`;
    }).join("\n");
  }

  // Dívidas em atraso
  const emAtraso = dividasComParcela.filter((d) => d.emAtraso);
  const alertaAtraso = emAtraso.length > 0
    ? `\n\n🚨 *ATENÇÃO — ${emAtraso.length} dívida(s) em atraso:*\n${emAtraso.map((d) => `• ${d.texto.split(",")[0]?.trim()}${d.mesesAtraso ? ` — ${d.mesesAtraso} meses sem pagar` : ""}`).join("\n")}\nPriorize quitar os juros do atraso antes de qualquer outra coisa.`
    : "";

  // Sobra após pagar
  const sobra = renda - parcelaMensalTotal;
  const sobraTexto = sobra > 0
    ? `Sobram *R$ ${fmt(sobra)}/mês* após pagar todas as parcelas. Use parte para criar uma reserva de emergência.`
    : `⚠️ Suas parcelas superam sua renda declarada. *Prioridade: renegociar as maiores dívidas imediatamente.*`;

  // Estratégia snowball
  const primeira = ordenadas[0];
  const estrategia = primeira
    ? `Quite *${primeira.texto.split(",")[0]?.trim()}* primeiro (menor dívida, R$ ${fmt(primeira.valor)}). Ao terminar, redirecione o valor da parcela para acelerar a próxima. Esse efeito reduz meses de prazo.`
    : "Priorize as menores dívidas primeiro para ganhar fôlego financeiro.";

  return `📊 *Plano QuitaZAP — ${nome}*

💳 *Situação geral:*
Total em dívidas: *R$ ${fmt(total)}*
Renda líquida: *R$ ${fmt(renda)}/mês*
Comprometimento: *${comprometimento.toFixed(0)}%* — ${nivelRisco}${alertaAtraso}

─────────────────────
🗓️ *O QUE PAGAR EM ${mesAtual.toUpperCase()}:*
${listaMes}

💰 *Total do mês: R$ ${fmt(parcelaMensalTotal)}*
${sobraTexto}

─────────────────────
🎯 *Estratégia — Método Bola de Neve:*
${estrategia}

📅 *Previsão de quitação: ${mesesParaQuitar} ${mesesParaQuitar === 1 ? "mês" : "meses"}*
Livre das dívidas em *${mesQuitacao}* seguindo o plano.

⚠️ *Regra de ouro:* Não contraia novas dívidas durante o plano.

✅ Sempre que pagar uma parcela ou contrair nova dívida, me avise e atualizo seu plano.

_QuitaZAP — Organize hoje, quite amanhã_ 💚`;
}

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
