// ─────────────────────────────────────────
// Orientador de Quitação — candidatos de alerta proativo (parte pura)
// ─────────────────────────────────────────
// O Orientador é um agente que PROPÕE; quem decide o envio é o portão único
// (política de 1 mensagem/dia, 4/semana, silêncio, opt-out, dedupe, disjuntor).
// Dois tipos, os dois no espírito "ajudar a quitar e dar respiro":
//   · QUIT_PLAN — plano do mês (dias 1 a 3): diagnóstico + AGORA/DEPOIS/PRÓXIMO ALVO.
//     Fica quieto no modo crítico (renda comprometida acima de 100%): uma mensagem
//     automática dizendo isso seria dura demais — a pessoa pode perguntar e o
//     Quita responde com cuidado.
//   · DEBT_MILESTONE — comemoração: dívida quitada e marcos de 25/50/75/100% do
//     total já pago. Cada marco só uma vez na vida.
// Todo número vem do motor (motor.ts); aqui só há template.

import type { CandidatoAlerta } from "../agentes/alertas";
import { brl, formatarOrientacao, type Orientacao } from "./motor";

export const PRIORIDADE_PLANO_QUITACAO = 58;
const PRIORIDADE_QUITADA = 66;
const PRIORIDADE_MARCO: Record<number, number> = { 25: 56, 50: 60, 75: 64, 100: 68 };

export function detectarPlanoQuitacao(o: Orientacao, ctx: { periodKey: string; diaHoje: number }): CandidatoAlerta[] {
  if (ctx.diaHoje > 3) return [];
  if (o.nivel == null || o.modoCritico) return [];
  if (o.fila.length === 0) return [];
  const corpo = formatarOrientacao(o);
  return [
    {
      tipo: "QUIT_PLAN",
      entityId: "GLOBAL",
      qualifier: o.nivel,
      periodKey: ctx.periodKey,
      prioridade: PRIORIDADE_PLANO_QUITACAO,
      mensagem: `📅 *Plano de quitação do mês*\n${corpo}`,
      payload: { nivel: o.nivel, totalDevido: o.totalDevido, sobraAlocavel: o.sobraAlocavel, alvo: o.alvo?.credor ?? null },
    },
  ];
}

export interface ProgressoDividas {
  totalContratado: number;
  totalPago: number;
  /** Dívidas que passaram a QUITADA nos últimos dias (não comemora quitação antiga). */
  quitadasRecentes: Array<{ id: string; credor: string }>;
  /** Quanto ainda falta pagar no total. */
  faltaPagar: number;
  /** Próximo alvo da fila (menor saldo/atraso), se houver. */
  proximoAlvo: { credor: string; saldoDevedor: number } | null;
}

export function detectarMarcosQuitacao(p: ProgressoDividas): CandidatoAlerta[] {
  const out: CandidatoAlerta[] = [];
  const proximo = p.proximoAlvo ? ` Próximo alvo: ${p.proximoAlvo.credor} (${brl(p.proximoAlvo.saldoDevedor)}).` : "";

  for (const q of p.quitadasRecentes) {
    out.push({
      tipo: "DEBT_MILESTONE",
      entityId: q.id,
      qualifier: "QUITADA",
      periodKey: "VIDA",
      prioridade: PRIORIDADE_QUITADA,
      mensagem: `🎉 *Você quitou ${q.credor}!* Uma dívida a menos e mais espaço no seu mês.${proximo}`,
      payload: { credor: q.credor },
    });
  }

  if (p.totalContratado > 0) {
    const pct = Math.min(Math.round((p.totalPago / p.totalContratado) * 100), 100);
    const marco = pct >= 100 ? 100 : pct >= 75 ? 75 : pct >= 50 ? 50 : pct >= 25 ? 25 : null;
    if (marco != null) {
      out.push({
        tipo: "DEBT_MILESTONE",
        entityId: "GLOBAL",
        qualifier: `PAGO_${marco}`,
        periodKey: "VIDA",
        prioridade: PRIORIDADE_MARCO[marco],
        mensagem:
          marco === 100
            ? `🏁 *Você pagou tudo o que contratou!* Foi um caminho longo e você chegou lá. Agora é cuidar do seu respiro para não voltar.`
            : `📈 *Você já pagou ${marco}% de tudo o que contratou!* Faltam ${brl(p.faltaPagar)}.${proximo}`,
        payload: { marco, faltaPagar: p.faltaPagar },
      });
    }
  }
  return out;
}
