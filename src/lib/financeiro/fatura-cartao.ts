// ─────────────────────────────────────────
// QuitaZAP Controle — ciclo de fatura de cartão
// ─────────────────────────────────────────
// Em qual mês/ano de FATURA uma compra cai, a partir do dia de fechamento
// (e, quando cadastrado, do dia de vencimento) do cartão — achado real do
// Ibrahim (14/09/2026): a tela de Cartões agrupava compra pelo mês
// CALENDÁRIO da data, ignorando o ciclo de fatura por completo (compra em
// 01/09 com fechamento dia 25 sempre caía em "setembro", nunca em
// "outubro", mesmo o ciclo fechando 25/09 e vencendo só 01/10). Regra: se
// o dia da compra já passou do fechamento deste mês, ela pertence ao
// ciclo que fecha no mês seguinte; a fatura em si é rotulada pelo mês em
// que VENCE (convenção comum no Brasil — "fatura de outubro" é a que cai
// na conta em outubro), não pelo mês em que fechou — só dá pra fazer esse
// segundo deslocamento quando o vencimento também está cadastrado. Sem
// diaFechamento, mantém o comportamento antigo (mês calendário puro): não
// dá pra calcular ciclo nenhum sem essa data.
//
// Escopo deliberado (pedido do Ibrahim, 14/09/2026): só a TELA de Cartões
// usa isso. O Dashboard/Resumo do mês/Saúde Financeira/Orçamento (todos
// em motor.ts) continuam contando gasto pelo mês CALENDÁRIO em que a
// compra realmente aconteceu — "quanto gastei este mês" e "em qual fatura
// essa compra vai cair" são perguntas diferentes, e mexer no motor.ts
// arriscava quebrar cálculos já ajustados a dedo. motor.ts continua sendo
// o único lugar autorizado a somar Lancamento/Parcela pro resto do app.

export interface AnoMes {
  ano: number;
  mes: number;
}

// Ano/mês/dia em Brasília de uma data qualquer — mesma âncora usada no
// resto do Controle (ver anoMesAtualBrasil em motor.ts).
export function anoMesDiaBrasil(data: Date): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(data)
    .split("-")
    .map(Number);
  return { ano, mes, dia };
}

// Desloca (ano, mes) por `delta` meses (aceita negativo).
export function deslocarMes(ano: number, mes: number, delta: number): AnoMes {
  const total = ano * 12 + (mes - 1) + delta;
  return { ano: Math.floor(total / 12), mes: (((total % 12) + 12) % 12) + 1 };
}

export function mesFaturaDaCompra(data: Date, diaFechamento: number | null, diaVencimento: number | null): AnoMes {
  const { ano, mes, dia } = anoMesDiaBrasil(data);
  if (diaFechamento == null) return { ano, mes };

  const fechamento = dia > diaFechamento ? deslocarMes(ano, mes, 1) : { ano, mes };
  if (diaVencimento == null || diaVencimento >= diaFechamento) return fechamento;
  return deslocarMes(fechamento.ano, fechamento.mes, 1);
}

// ── Consulta por texto ("como está minha fatura?") ─────────────────────
// Achado em QA (Ibrahim, 04/10/2026): "como está minha fatura do nubank" e
// "quanto gastei no cartão este mês" eram tratadas como REGISTRO de gasto —
// o bot respondia "Qual foi o valor desse gasto?" e ainda deixava uma
// pendência que atrapalhava as mensagens seguintes.
function normalizarConsulta(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectarConsultaFatura(mensagem: string): boolean {
  const t = normalizarConsulta(mensagem);
  if (!t || t.length > 120) return false;

  // Afirmações/comandos que têm fluxo próprio (fatura fechou em X, paguei a
  // fatura, configurar fechamento/vencimento) nunca são consulta.
  if (/\b(fechou|fechei|paguei|pago|quitei|quitada|pagou)\b|\bfecha (dia|hoje)|\bvence (dia|hoje)|\bconfigur/.test(t)) return false;
  if (/\d/.test(t) && !/\?/.test(t) && !/^(como|quanto|qual|quais)/.test(t)) return false;

  const pergunta =
    /\?/.test(t) ||
    /^(como|quanto|qual|quais|quando|que dia|ver|mostra|mostrar|me mostra|me manda|me diz|minha|minhas|meu|meus|fatura|faturas)\b/.test(t);
  if (!pergunta) return false;

  const falaDeFatura = /\bfaturas?\b/.test(t);
  const falaDeGastoNoCartao = /\b(gastei|gasto|gastos|usei|uso|compras?)\b.*\bcart(ao|oes)\b/.test(t) || /\bcart(ao|oes)\b.*\b(gastei|gasto|gastos|usei)\b/.test(t);
  return falaDeFatura || (/^(quanto|qual|quais|como|ver|mostra)/.test(t) && falaDeGastoNoCartao);
}

export type NomeMes = string;
const NOMES_MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export function rotuloMesFatura(f: AnoMes): NomeMes {
  return `${NOMES_MES[f.mes - 1]}/${f.ano}`;
}

// ── Resumo de faturas por cartão (puro — o acesso ao banco fica em
// fatura-cartao-consulta.ts) ──────────────────────────────────────────

export interface CartaoParaFatura {
  nome: string;
  diaFechamento: number | null;
  diaVencimento: number | null;
}
export interface CompraParaFatura {
  valor: number;
  data: Date;
}
export interface ResumoFaturaCartao {
  nome: string;
  semFechamento: boolean;
  diaFechamento: number | null;
  diaVencimento: number | null;
  atual: { rotulo: string; valor: number; fechaEm: string | null };
  anterior: { rotulo: string; valor: number; vencimento: string | null } | null;
  proxima: { rotulo: string; valor: number } | null;
  gastoMesCalendario: number;
}

function dd(dia: number, mes: number): string {
  return `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
}
function somaPorFatura(compras: CompraParaFatura[], cartao: CartaoParaFatura, alvo: AnoMes): number {
  let total = 0;
  for (const c of compras) {
    const f = mesFaturaDaCompra(c.data, cartao.diaFechamento, cartao.diaVencimento);
    if (f.ano === alvo.ano && f.mes === alvo.mes) total += c.valor;
  }
  return Math.round(total * 100) / 100;
}

export function resumirFaturasDoCartao(cartao: CartaoParaFatura, compras: CompraParaFatura[], agora: Date): ResumoFaturaCartao {
  const hoje = anoMesDiaBrasil(agora);
  const mesCalendario: AnoMes = { ano: hoje.ano, mes: hoje.mes };

  let gastoMesCalendario = 0;
  for (const c of compras) {
    const p = anoMesDiaBrasil(c.data);
    if (p.ano === hoje.ano && p.mes === hoje.mes) gastoMesCalendario += c.valor;
  }
  gastoMesCalendario = Math.round(gastoMesCalendario * 100) / 100;

  // Sem dia de fechamento não existe ciclo: cai no mês calendário (mesmo
  // comportamento antigo da tela de Cartões).
  if (cartao.diaFechamento == null) {
    return {
      nome: cartao.nome,
      semFechamento: true,
      diaFechamento: null,
      diaVencimento: cartao.diaVencimento,
      atual: { rotulo: rotuloMesFatura(mesCalendario), valor: somaPorFatura(compras, cartao, mesCalendario), fechaEm: null },
      anterior: null,
      proxima: null,
      gastoMesCalendario,
    };
  }

  const atual = mesFaturaDaCompra(agora, cartao.diaFechamento, cartao.diaVencimento);
  const anterior = deslocarMes(atual.ano, atual.mes, -1);
  const proxima = deslocarMes(atual.ano, atual.mes, 1);

  // O rótulo é o mês em que a fatura VENCE; quando o vencimento é antes do
  // fechamento no calendário (ex.: fecha 25, vence 01), ela fechou no mês
  // anterior ao rótulo.
  const deslocaFechamento = cartao.diaVencimento != null && cartao.diaVencimento < cartao.diaFechamento;
  const mesFechaAtual = deslocaFechamento ? deslocarMes(atual.ano, atual.mes, -1) : atual;
  const valorProxima = somaPorFatura(compras, cartao, proxima);

  return {
    nome: cartao.nome,
    semFechamento: false,
    diaFechamento: cartao.diaFechamento,
    diaVencimento: cartao.diaVencimento,
    atual: {
      rotulo: rotuloMesFatura(atual),
      valor: somaPorFatura(compras, cartao, atual),
      fechaEm: dd(cartao.diaFechamento, mesFechaAtual.mes),
    },
    anterior: {
      rotulo: rotuloMesFatura(anterior),
      valor: somaPorFatura(compras, cartao, anterior),
      vencimento: cartao.diaVencimento != null ? dd(cartao.diaVencimento, anterior.mes) : null,
    },
    proxima: valorProxima > 0 ? { rotulo: rotuloMesFatura(proxima), valor: valorProxima } : null,
    gastoMesCalendario,
  };
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
}

export function formatarRespostaFaturas(resumos: ResumoFaturaCartao[], nomeMesAtual: string): string {
  if (resumos.length === 0) {
    return (
      "Você ainda não tem cartão cadastrado. Me diga assim: \"nubank fecha dia 10 e vence dia 17\" " +
      "que eu configuro e passo a separar as compras por fatura."
    );
  }

  const blocos = resumos.map((r) => {
    const linhas = [`*${r.nome}*${r.diaFechamento != null ? ` (fecha dia ${r.diaFechamento}${r.diaVencimento != null ? ` · vence dia ${r.diaVencimento}` : ""})` : ""}`];
    if (r.semFechamento) {
      linhas.push(`• Compras de ${r.atual.rotulo}: ${brl(r.atual.valor)}`);
      linhas.push("• Esse cartão ainda não tem dia de fechamento — somei pelo mês do calendário. Me diga \"" + r.nome.toLowerCase() + " fecha dia X\" pra separar certo.");
    } else {
      linhas.push(`• Fatura aberta (${r.atual.rotulo}): ${brl(r.atual.valor)}${r.atual.fechaEm ? ` — fecha em ${r.atual.fechaEm}` : ""}`);
      if (r.anterior) {
        linhas.push(`• Fatura anterior (${r.anterior.rotulo}): ${brl(r.anterior.valor)}${r.anterior.vencimento ? ` — vencimento ${r.anterior.vencimento}` : ""}`);
      }
      if (r.proxima) linhas.push(`• Próxima fatura (${r.proxima.rotulo}): ${brl(r.proxima.valor)}`);
    }
    return linhas.join("\n");
  });

  const totalMes = Math.round(resumos.reduce((s, r) => s + r.gastoMesCalendario, 0) * 100) / 100;
  return (
    "💳 *Suas faturas*\n\n" +
    blocos.join("\n\n") +
    `\n\n📅 *Gasto no cartão em ${nomeMesAtual}* (pela data da compra): ${brl(totalMes)}\n` +
    "_As faturas seguem o dia de fechamento de cada cartão. Mostro só o que está registrado no QuitaZap — não sei se a fatura já foi paga._"
  );
}
