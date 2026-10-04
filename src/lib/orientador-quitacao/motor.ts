// ─────────────────────────────────────────
// QuitaZAP — Orientador de Quitação (motor determinístico, puro)
// ─────────────────────────────────────────
// Filosofia do produto (Ibrahim, 05/10/2026): ajudar o povo a QUITAR DÍVIDAS e
// ter RESPIRO — nada de investimento. Desenho revisado com o ChatGPT:
//   · todo número sai daqui (backend); a IA só narra, nunca recalcula;
//   · fila híbrida: atraso/risco de corte > vence perto > menor saldo (bola de
//     neve por padrão, porque não temos taxa de juros real por dívida);
//   · nunca sugerir novo cartão/empréstimo/cheque especial para pagar dívida;
//   · comprometimento acima de 100% = modo crítico (preservar o essencial,
//     mapear, renegociar) — nada de "acelerar quitação" com dinheiro que não existe;
//   · "Respiro" = colchão pequeno (7 dias do dia a dia) pra não voltar ao cartão;
//   · sem taxa/valor de quitação não existe "economiza R$ X": só prazo pelo
//     cronograma das parcelas.
// Consignado (desconto em folha) conta no total devido e na renda comprometida,
// mas fica fora da fila de ataque — o desconto sai do salário antes de qualquer decisão.

export type NivelComprometimento = "NORMAL" | "ALTO" | "CRITICO" | "INSUSTENTAVEL";

export interface DividaEntrada {
  id: string;
  credor: string;
  tipo: string;
  saldoDevedor: number;
  valorTotal: number;
  valorPago: number;
  emAtraso: boolean;
  diasAtraso: number;
  /** Dias até a próxima parcela (negativo = já passou); null sem cronograma. */
  venceEmDias: number | null;
  /** Serviço essencial/cartão: consequência grave se atrasar. */
  risco: boolean;
  consignado: boolean;
  /** Valores das parcelas em aberto, na ordem de vencimento. */
  parcelasPendentes: number[];
}

export interface EntradaOrientacao {
  rendaEfetiva: number | null;
  /** 0..n (1 = 100% da renda comprometida). null quando não dá pra calcular. */
  percentualComprometido: number | null;
  /** Renda − tudo que já está comprometido no mês (mesma conta da hero da home). */
  saldoProjetado: number;
  /** Despesas fixas + variáveis do mês (o "custo de vida" do dia a dia). */
  custoDeVidaMensal: number;
  respiroAtual: number;
  respiroMetaExiste: boolean;
  dividas: DividaEntrada[];
  quitadas: number;
  totalContratado: number;
  totalPago: number;
}

export type TipoPasso = "REGULARIZAR" | "RESPIRO" | "ATACAR" | "PRESERVAR" | "MAPEAR" | "NEGOCIAR" | "SEM_SOBRA" | "SEM_DIVIDAS" | "COMPLETAR_DADOS";

export interface Passo {
  quando: "AGORA" | "DEPOIS" | "PROXIMO";
  tipo: TipoPasso;
  texto: string;
  valor?: number;
  dividaId?: string;
}

export interface ItemFila {
  id: string;
  credor: string;
  saldoDevedor: number;
  emAtraso: boolean;
  diasAtraso: number;
  motivo: "ATRASO_RISCO" | "ATRASO" | "VENCE_PERTO" | "MENOR_SALDO";
  parcelaMensal: number | null;
}

export interface Orientacao {
  nivel: NivelComprometimento | null;
  modoCritico: boolean;
  totalDevido: number;
  quantidadeDividas: number;
  atrasadas: number;
  percentualComprometido: number | null;
  sobraAlocavel: number;
  fila: ItemFila[];
  alvo: ItemFila | null;
  respiro: { alvo: number | null; atual: number; falta: number; diasCobertos: number | null; temMeta: boolean };
  progresso: { percentualPago: number; quitadas: number };
  passos: Passo[];
}

export const DIAS_RESPIRO_INICIAL = 7;
const DIAS_VENCE_PERTO = 7;

/** Frases que o Orientador nunca pode produzir (guardrail testado). */
export const FRASES_PROIBIDAS = [
  "novo empréstimo",
  "novo emprestimo",
  "pegar um empréstimo",
  "pegar um emprestimo",
  "cheque especial",
  "novo cartão",
  "novo cartao",
  "antecipação de limite",
  "antecipacao de limite",
  "investir",
  "investimento",
];

export function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
}

export function nivelComprometimento(percentual: number | null): NivelComprometimento | null {
  if (percentual == null || !Number.isFinite(percentual)) return null;
  if (percentual <= 0.5) return "NORMAL";
  if (percentual <= 0.7) return "ALTO";
  if (percentual <= 1) return "CRITICO";
  return "INSUSTENTAVEL";
}

const arred = (v: number) => Math.round(v * 100) / 100;

/** Fila de ataque: atraso+risco > atraso > vence em até 7 dias > menor saldo. Consignado fica de fora. */
export function montarFila(dividas: DividaEntrada[]): ItemFila[] {
  const candidatas = dividas.filter((d) => !d.consignado && d.saldoDevedor > 0.005);

  function camada(d: DividaEntrada): ItemFila["motivo"] {
    if (d.emAtraso && d.risco) return "ATRASO_RISCO";
    if (d.emAtraso) return "ATRASO";
    if (d.venceEmDias != null && d.venceEmDias <= DIAS_VENCE_PERTO) return "VENCE_PERTO";
    return "MENOR_SALDO";
  }
  const peso: Record<ItemFila["motivo"], number> = { ATRASO_RISCO: 0, ATRASO: 1, VENCE_PERTO: 2, MENOR_SALDO: 3 };

  return candidatas
    .map((d) => ({ d, motivo: camada(d) }))
    .sort(
      (a, b) =>
        peso[a.motivo] - peso[b.motivo] ||
        (a.motivo === "ATRASO_RISCO" || a.motivo === "ATRASO" ? b.d.diasAtraso - a.d.diasAtraso : 0) ||
        a.d.saldoDevedor - b.d.saldoDevedor ||
        a.d.credor.localeCompare(b.d.credor, "pt-BR")
    )
    .map(({ d, motivo }) => ({
      id: d.id,
      credor: d.credor,
      saldoDevedor: arred(d.saldoDevedor),
      emAtraso: d.emAtraso,
      diasAtraso: d.diasAtraso,
      motivo,
      parcelaMensal: d.parcelasPendentes.length > 0 ? d.parcelasPendentes[0] : null,
    }));
}

/** Quantos meses antes a dívida termina se, todo mês, forem pagos `extra` reais além da parcela.
 * Pelo cronograma nominal: o extra abate as últimas parcelas. NÃO considera desconto de juros na
 * antecipação (o credor pode dar — mas não temos o dado, então não prometemos). */
export function simularExtraMensal(parcelas: number[], extra: number): { prazoAtualMeses: number; novoPrazoMeses: number; mesesAntes: number } | null {
  if (!Number.isFinite(extra) || extra <= 0 || parcelas.length === 0) return null;
  const total = parcelas.reduce((s, v) => s + v, 0);
  let acumulado = 0;
  for (let m = 1; m <= parcelas.length; m++) {
    acumulado += parcelas[m - 1] + extra;
    if (acumulado + 1e-9 >= total) {
      return { prazoAtualMeses: parcelas.length, novoPrazoMeses: m, mesesAntes: parcelas.length - m };
    }
  }
  return { prazoAtualMeses: parcelas.length, novoPrazoMeses: parcelas.length, mesesAntes: 0 };
}

export function calcularRespiro(custoDeVidaMensal: number, atual: number, temMeta: boolean) {
  const custoDia = custoDeVidaMensal / 30;
  const alvo = custoDia > 0 ? arred(custoDia * DIAS_RESPIRO_INICIAL) : null;
  const falta = alvo != null ? Math.max(arred(alvo - atual), 0) : 0;
  const diasCobertos = custoDia > 0 ? Math.round((atual / custoDia) * 10) / 10 : null;
  return { alvo, atual: arred(atual), falta, diasCobertos, temMeta };
}

export function montarOrientacao(entrada: EntradaOrientacao): Orientacao {
  const ativas = entrada.dividas.filter((d) => d.saldoDevedor > 0.005);
  const totalDevido = arred(ativas.reduce((s, d) => s + d.saldoDevedor, 0));
  const atrasadas = ativas.filter((d) => d.emAtraso).length;
  const nivel = nivelComprometimento(entrada.percentualComprometido);
  const modoCritico = nivel === "INSUSTENTAVEL";
  const fila = montarFila(entrada.dividas);
  const alvo = fila[0] ?? null;

  const buffer = entrada.rendaEfetiva != null ? Math.max(50, entrada.rendaEfetiva * 0.05) : 50;
  const sobraAlocavel = arred(Math.max(entrada.saldoProjetado - buffer, 0));
  const respiro = calcularRespiro(entrada.custoDeVidaMensal, entrada.respiroAtual, entrada.respiroMetaExiste);
  const percentualPago = entrada.totalContratado > 0 ? Math.min(Math.round((entrada.totalPago / entrada.totalContratado) * 100), 100) : 0;

  const passos: Passo[] = [];

  if (nivel == null) {
    passos.push({
      quando: "AGORA",
      tipo: "COMPLETAR_DADOS",
      texto: "Para eu montar seu plano de quitação, preciso da sua renda mensal e de alguns gastos registrados. Cadastre a renda no Perfil ou lance uma receita do mês.",
    });
  } else if (ativas.length === 0) {
    passos.push({ quando: "AGORA", tipo: "SEM_DIVIDAS", texto: "Você não tem dívidas ativas registradas. Esse é o melhor lugar para estar!" });
    if (respiro.alvo != null && respiro.falta > 0 && sobraAlocavel > 0) {
      passos.push({
        quando: "DEPOIS",
        tipo: "RESPIRO",
        texto: `Separe ${brl(Math.min(sobraAlocavel, respiro.falta))} para o seu Respiro (${DIAS_RESPIRO_INICIAL} dias do dia a dia), para um imprevisto não virar dívida de novo.`,
        valor: arred(Math.min(sobraAlocavel, respiro.falta)),
      });
    }
  } else if (modoCritico) {
    passos.push({
      quando: "AGORA",
      tipo: "PRESERVAR",
      texto: "O que você tem já não cobre tudo o que está comprometido no mês. Primeiro garanta o essencial: moradia, comida, saúde e energia.",
    });
    passos.push({
      quando: "DEPOIS",
      tipo: "MAPEAR",
      texto: `Vamos olhar as suas ${ativas.length} dívida${ativas.length === 1 ? "" : "s"} (${brl(totalDevido)} no total) e evitar novos atrasos nas mais graves.`,
    });
    if (alvo) {
      passos.push({
        quando: "PROXIMO",
        tipo: "NEGOCIAR",
        texto: `Procure ${alvo.credor} para renegociar: peça o valor para quitar e o custo total antes de aceitar qualquer proposta.`,
        dividaId: alvo.id,
      });
    }
  } else {
    let sobra = sobraAlocavel;

    if (alvo && alvo.emAtraso) {
      passos.push({
        quando: "AGORA",
        tipo: "REGULARIZAR",
        texto: `Regularize ${alvo.credor} primeiro: está atrasada há ${alvo.diasAtraso} dia${alvo.diasAtraso === 1 ? "" : "s"}.`,
        valor: alvo.parcelaMensal ?? undefined,
        dividaId: alvo.id,
      });
    }

    if (sobra <= 0) {
      passos.push({
        quando: passos.length === 0 ? "AGORA" : "DEPOIS",
        tipo: "SEM_SOBRA",
        texto: "Neste mês não sobra dinheiro para antecipar dívida. O foco é pagar as parcelas em dia — peça uma dica de economia para abrir espaço.",
      });
    } else {
      const jaTemRespiro = respiro.alvo == null || respiro.falta <= 0;
      if (!jaTemRespiro) {
        const valorRespiro = arred(Math.min(sobra, respiro.falta));
        passos.push({
          quando: passos.length === 0 ? "AGORA" : "DEPOIS",
          tipo: "RESPIRO",
          texto: `Antes de acelerar, separe ${brl(valorRespiro)} para o seu Respiro (${DIAS_RESPIRO_INICIAL} dias do dia a dia). Assim um imprevisto não vira cartão de novo.`,
          valor: valorRespiro,
        });
        sobra = arred(sobra - valorRespiro);
      }
      if (sobra > 0 && alvo) {
        const valorAtaque = arred(Math.min(sobra, alvo.saldoDevedor));
        passos.push({
          quando: passos.length === 0 ? "AGORA" : "DEPOIS",
          tipo: "ATACAR",
          texto:
            alvo.emAtraso
              ? `O que sobrar (${brl(valorAtaque)}) também vai para ${alvo.credor}.`
              : `Use ${brl(valorAtaque)} a mais em ${alvo.credor} — a menor dívida que você consegue eliminar de vez e liberar espaço no mês.`,
          valor: valorAtaque,
          dividaId: alvo.id,
        });
      }
    }

    const proximo = fila[1] ?? null;
    if (proximo) {
      passos.push({ quando: "PROXIMO", tipo: "ATACAR", texto: `Depois dessa, o próximo alvo é ${proximo.credor} (${brl(proximo.saldoDevedor)}).`, dividaId: proximo.id });
    }
  }

  return {
    nivel,
    modoCritico,
    totalDevido,
    quantidadeDividas: ativas.length,
    atrasadas,
    percentualComprometido: entrada.percentualComprometido,
    sobraAlocavel,
    fila,
    alvo,
    respiro,
    progresso: { percentualPago, quitadas: entrada.quitadas },
    passos,
  };
}

const ROTULO_NIVEL: Record<NivelComprometimento, string> = {
  NORMAL: "tranquilo",
  ALTO: "alto",
  CRITICO: "crítico",
  INSUSTENTAVEL: "acima do que você ganha",
};

/** Texto final (determinístico, empático, sem jargão). O LLM pode reescrever o tom, nunca os números. */
export function formatarOrientacao(o: Orientacao): string {
  const linhas: string[] = [];

  if (o.nivel != null && o.quantidadeDividas > 0) {
    const pct = o.percentualComprometido != null ? `${Math.round(o.percentualComprometido * 100)}%` : "";
    linhas.push(`📍 Seu momento: você deve ${brl(o.totalDevido)} em ${o.quantidadeDividas} dívida${o.quantidadeDividas === 1 ? "" : "s"}${o.atrasadas > 0 ? ` (${o.atrasadas} em atraso)` : ""}.`);
    linhas.push(`Sua renda comprometida está em ${pct} — nível ${ROTULO_NIVEL[o.nivel]}.`);
    if (!o.modoCritico) linhas.push(`Dinheiro livre para atacar as dívidas este mês: ${brl(o.sobraAlocavel)}.`);
    linhas.push("");
  }

  for (const quando of ["AGORA", "DEPOIS", "PROXIMO"] as const) {
    const doBloco = o.passos.filter((p) => p.quando === quando);
    if (doBloco.length === 0) continue;
    const rotulo = quando === "AGORA" ? "AGORA" : quando === "DEPOIS" ? "DEPOIS" : "PRÓXIMO ALVO";
    for (const p of doBloco) linhas.push(`${rotulo}: ${p.texto}`);
  }

  if (o.progresso.quitadas > 0 || o.progresso.percentualPago >= 25) {
    linhas.push("");
    const partes: string[] = [];
    if (o.progresso.percentualPago >= 25) partes.push(`você já pagou ${o.progresso.percentualPago}% de tudo o que contratou`);
    if (o.progresso.quitadas > 0) partes.push(`já quitou ${o.progresso.quitadas} dívida${o.progresso.quitadas === 1 ? "" : "s"}`);
    linhas.push(`🎉 Olha o quanto você já andou: ${partes.join(" e ")}.`);
  }

  linhas.push("");
  linhas.push("Orientação com base no que está registrado no QuitaZAP — não é consultoria financeira regulamentada.");
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Texto do simulador "e se eu pagar X a mais por mês?" para a dívida-alvo. */
export function formatarSimulacaoExtra(credor: string, extra: number, parcelas: number[]): string {
  const r = simularExtraMensal(parcelas, extra);
  if (!r) return `Não tenho o cronograma de parcelas de ${credor} para simular. Cadastre as parcelas para eu calcular o prazo.`;
  if (r.mesesAntes <= 0) return `Pagando ${brl(extra)} a mais por mês em ${credor}, o prazo quase não muda (${r.prazoAtualMeses} parcela${r.prazoAtualMeses === 1 ? "" : "s"}). Um valor maior ajudaria mais.`;
  return [
    `Pagando ${brl(extra)} a mais por mês em ${credor}, ela terminaria em cerca de ${r.novoPrazoMeses} ${r.novoPrazoMeses === 1 ? "mês" : "meses"} em vez de ${r.prazoAtualMeses} — aproximadamente ${r.mesesAntes} ${r.mesesAntes === 1 ? "mês" : "meses"} antes.`,
    "Esse prazo vem do cronograma das parcelas. Pergunte ao credor o valor de quitação: pagar antes costuma dar desconto nos juros, mas não temos como prometer quanto.",
  ].join("\n");
}
