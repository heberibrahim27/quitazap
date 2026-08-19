// ─────────────────────────────────────────
// QuitaZAP Controle — Tarefas e pagamentos (áudio/texto via WhatsApp)
// Módulo de lógica pura: parsing, cálculo de próxima ocorrência e
// heurística de match com Divida. Não importa Prisma — quem chama
// (webhook, cron) é responsável por toda a persistência.
// ─────────────────────────────────────────

import { parseMoneyBR } from "./money";
import { normalizarDescricaoFinanceira, normalizarTextoBusca } from "./descricao-financeira";
import { formatarDataBR, formatarValorBR } from "./gasto-flow";

export type TipoTarefa = "LEMBRETE" | "PAGAMENTO";
export type FrequenciaTarefa = "MENSAL" | "SEMANAL" | "ANUAL";

export const HORARIO_LEMBRETE_PADRAO = "08:00";

export type TarefaExtraida = {
  tipo: TipoTarefa;
  descricao: string;
  valor: number | null;
  vencimento: Date | null;
  recorrente: boolean;
  frequencia: FrequenciaTarefa | null;
  diaMes: number | null;
  diaSemana: number | null;
  /** Mês (1-12) da recorrência ANUAL. Guardado à parte do `vencimento` (que pode
   * ter sido clampado, ex: 29/02 num ano não bissexto vira 28/02) pra recorrência
   * futura sempre recalcular a partir do dia/mês originais que o usuário pediu. */
  mesAnual: number | null;
  horarioEnvio: string;
};

export type ResultadoExtracaoTarefa =
  | { ok: true; tarefa: TarefaExtraida }
  | { ok: false; motivo: "SEM_DESCRICAO" | "RECORRENCIA_SEM_DATA" };

export type ComandoTarefa =
  | { comando: "CRIAR"; resultado: ResultadoExtracaoTarefa }
  | { comando: "LISTAR" }
  | { comando: "CONCLUIR"; termo: string }
  | { comando: "CANCELAR"; termo: string };

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

// ── Detecção de comando ───────────────────

export function detectarComandoTarefa(mensagemOriginal: string): ComandoTarefa | null {
  const mensagem = (mensagemOriginal ?? "").trim();
  if (!mensagem) return null;

  const matchCriar = mensagem.match(/^(tarefa|lembrete|pagamento)\s*:\s*([\s\S]+)/i);
  if (matchCriar) {
    const prefixo = matchCriar[1].toLowerCase();
    const resto = matchCriar[2].trim();
    const tipo: TipoTarefa = prefixo === "pagamento" ? "PAGAMENTO" : "LEMBRETE";
    return { comando: "CRIAR", resultado: extrairTarefa(resto, tipo) };
  }

  const mNorm = normalizarTextoBusca(mensagem);
  if (/^(minhas tarefas|tarefas pendentes|ver tarefas|listar tarefas|meus lembretes|ver lembretes)$/.test(mNorm)) {
    return { comando: "LISTAR" };
  }

  // Não usa "terminei"/"finalizei" como gatilho: o webhook já usa "terminei de
  // pagar" como uma das frases do comando PAGUEI (confirmação de pagamento de
  // dívida) — reaproveitar esse verbo aqui sequestraria aquele fluxo. "concluí"
  // não colide com nenhum comando existente.
  const matchConcluir = mensagem.match(
    /^(?:conclu[ií]|marquei?\s+como\s+conclu[ií]da)\s+(?:a\s+tarefa\s+)?(.+)/i
  );
  if (matchConcluir) {
    return { comando: "CONCLUIR", termo: matchConcluir[1].trim() };
  }

  const matchCancelar = mensagem.match(/^(?:cancelar|cancela)\s+(?:a\s+tarefa\s+)?(.+)/i);
  if (matchCancelar) {
    return { comando: "CANCELAR", termo: matchCancelar[1].trim() };
  }

  return null;
}

// ── Extração de campos do texto ───────────

function extrairDataDDMM(texto: string): { restante: string; dia: number | null; mes: number | null } {
  const m = texto.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (!m) return { restante: texto, dia: null, mes: null };
  const dia = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return { restante: texto, dia: null, mes: null };
  return { restante: texto.replace(m[0], " "), dia, mes };
}

function extrairRecorrencia(texto: string): {
  restante: string;
  recorrente: boolean;
  frequencia: FrequenciaTarefa | null;
  diaSemana: number | null;
} {
  let t = texto;
  let recorrente = false;
  let frequencia: FrequenciaTarefa | null = null;
  let diaSemana: number | null = null;

  const matchDiaSemana = t.match(
    /\btod[ao]\s+(domingo|segunda(?:-feira)?|ter[cç]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[aá]bado)\b/i
  );
  if (matchDiaSemana) {
    const chave = normalizarTextoBusca(matchDiaSemana[1]).replace(/-feira$/, "");
    if (DIAS_SEMANA[chave] !== undefined) {
      diaSemana = DIAS_SEMANA[chave];
      recorrente = true;
      frequencia = "SEMANAL";
      t = t.replace(matchDiaSemana[0], " ");
    }
  }

  if (!recorrente && /\b(toda\s+semana|semanalmente)\b/i.test(t)) {
    recorrente = true;
    frequencia = "SEMANAL";
    t = t.replace(/\b(toda\s+semana|semanalmente)\b/i, " ");
  }

  if (!recorrente && /\b(todo\s+m[eê]s|mensalmente|\bmensal\b)\b/i.test(t)) {
    recorrente = true;
    frequencia = "MENSAL";
    t = t.replace(/\b(todo\s+m[eê]s|mensalmente|mensal)\b/i, " ");
  }

  if (!recorrente && /\b(todo\s+ano|anualmente|\banual\b)\b/i.test(t)) {
    recorrente = true;
    frequencia = "ANUAL";
    t = t.replace(/\b(todo\s+ano|anualmente|anual)\b/i, " ");
  }

  // "todo dia N" sem palavra "mês" explícita — também é recorrência mensal.
  if (!recorrente) {
    const matchTodoDia = t.match(/\btodo\s+(?=dia\s+\d{1,2}\b)/i);
    if (matchTodoDia) {
      recorrente = true;
      frequencia = "MENSAL";
      t = t.replace(matchTodoDia[0], " ");
    }
  }

  return { restante: t, recorrente, frequencia, diaSemana };
}

function extrairDia(texto: string): { restante: string; dia: number | null } {
  const m = texto.match(/\bdia\s+(\d{1,2})\b/i);
  if (!m) return { restante: texto, dia: null };
  const dia = parseInt(m[1], 10);
  if (dia < 1 || dia > 31) return { restante: texto, dia: null };
  return { restante: texto.replace(m[0], " "), dia };
}

function extrairHorario(texto: string): { restante: string; horario: string | null } {
  const m = texto.match(/\b(?:as|às)\s*(\d{1,2})(?:[:h](\d{2}))?\s*h?\b/i);
  if (!m) return { restante: texto, horario: null };
  const hora = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const minuto = m[2] ? Math.min(59, Math.max(0, parseInt(m[2], 10))) : 0;
  const horario = `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
  return { restante: texto.replace(m[0], " "), horario };
}

function extrairValor(texto: string): { restante: string; valor: number | null } {
  const m = texto.match(/r\$\s*\d[\d.,]*\d|r\$\s*\d\b/i) ?? texto.match(/\b\d+[.,]\d{2}\b/);
  if (!m) return { restante: texto, valor: null };
  const valor = parseMoneyBR(m[0]);
  if (valor == null) return { restante: texto, valor: null };
  return { restante: texto.replace(m[0], " "), valor };
}

function limparResiduos(texto: string): string {
  return texto
    .replace(/\btodo\b|\btoda\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,\s;:.-]+|[,\s;:.-]+$/g, "")
    .trim();
}

// ── Cálculo de datas ──────────────────────
// Todo o cálculo abaixo ancora explicitamente em America/Sao_Paulo via Date.UTC,
// independente do fuso do processo Node. Isso é proposital: o resto do módulo
// (e o cron em src/app/api/cron/tarefas/route.ts) formata/compara essas datas
// com timeZone: "America/Sao_Paulo" — construir com `new Date(ano, mes, dia)`
// (interpretado no fuso local do servidor, UTC na Vercel) faria "dia 10" virar
// 10/mês 00:00 UTC, que em Brasília (UTC-3) já é dia 9 às 21h — ou seja, toda
// data apareceria e disparava um dia adiantado. Por isso a meia-noite de
// Brasília é representada aqui como 03:00 UTC do mesmo dia civil.

const FUSO = "America/Sao_Paulo";
const OFFSET_BRASIL_HORAS = 3; // America/Sao_Paulo é UTC-3 o ano todo desde o fim do horário de verão em 2019

/** Componentes ano/mês/dia de `data`, já convertidos pro calendário de Brasília. */
function componentesBrasil(data: Date): { ano: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(data);
  const mapa = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return { ano: Number(mapa.year), mes: Number(mapa.month) - 1, dia: Number(mapa.day) };
}

/** Meia-noite do dia informado em horário de Brasília, como instante UTC absoluto. */
function meiaNoiteBrasil(ano: number, mesIndice: number, dia: number): Date {
  return new Date(Date.UTC(ano, mesIndice, dia, OFFSET_BRASIL_HORAS, 0, 0, 0));
}

function zerarHora(referencia: Date): Date {
  const { ano, mes, dia } = componentesBrasil(referencia);
  return meiaNoiteBrasil(ano, mes, dia);
}

/** Último dia do mês `mesIndice` (0-indexado, aceita overflow/underflow — ex: 12 = janeiro do ano seguinte). */
function ultimoDiaDoMes(ano: number, mesIndice: number): number {
  return new Date(Date.UTC(ano, mesIndice + 1, 0)).getUTCDate();
}

/** Constrói a meia-noite (Brasília) de "ano-mesIndice-dia", limitando `dia` ao último dia
 * real do mês (ex: dia 31 num mês de 30 dias vira dia 30, em vez de estourar pro mês seguinte). */
function construirDataClamped(ano: number, mesIndice: number, dia: number): Date {
  const ultimoDia = ultimoDiaDoMes(ano, mesIndice);
  return meiaNoiteBrasil(ano, mesIndice, Math.min(dia, ultimoDia));
}

export function proximaDataDoMes(dia: number, referencia: Date = new Date()): Date {
  const base = zerarHora(referencia);
  let venc = construirDataClamped(base.getUTCFullYear(), base.getUTCMonth(), dia);
  if (venc < base) venc = construirDataClamped(base.getUTCFullYear(), base.getUTCMonth() + 1, dia);
  return venc;
}

export function proximaDataDaSemana(diaSemana: number, referencia: Date = new Date()): Date {
  const base = zerarHora(referencia);
  let diff = diaSemana - base.getUTCDay();
  if (diff <= 0) diff += 7;
  return new Date(base.getTime() + diff * 24 * 60 * 60 * 1000);
}

export function proximaDataAnual(dia: number, mesIndice: number, referencia: Date = new Date()): Date {
  const base = zerarHora(referencia);
  let venc = construirDataClamped(base.getUTCFullYear(), mesIndice, dia);
  if (venc < base) venc = construirDataClamped(base.getUTCFullYear() + 1, mesIndice, dia);
  return venc;
}

/** Usado pelo cron para avançar uma tarefa recorrente já vencida para a próxima ocorrência.
 * Pra ANUAL usa diaMes + mesAnual (o dia/mês originais pedidos pelo usuário) em vez de reler
 * o `vencimento` já gravado — evita que um 29/02 clampado pra 28/02 num ano não bissexto
 * fique preso em 28/02 pra sempre, mesmo quando o próximo ano for bissexto. */
export function calcularProximaOcorrencia(
  tarefa: {
    frequencia: string | null;
    diaMes: number | null;
    diaSemana: number | null;
    mesAnual: number | null;
    vencimento: Date | null;
  },
  referencia: Date = new Date()
): Date | null {
  if (tarefa.frequencia === "MENSAL" && tarefa.diaMes != null) {
    return proximaDataDoMes(tarefa.diaMes, referencia);
  }
  if (tarefa.frequencia === "SEMANAL" && tarefa.diaSemana != null) {
    return proximaDataDaSemana(tarefa.diaSemana, referencia);
  }
  if (tarefa.frequencia === "ANUAL" && tarefa.diaMes != null && tarefa.mesAnual != null) {
    return proximaDataAnual(tarefa.diaMes, tarefa.mesAnual - 1, referencia);
  }
  return null;
}

// ── Extração principal ────────────────────

export function extrairTarefa(textoOriginal: string, tipo: TipoTarefa): ResultadoExtracaoTarefa {
  if (tipo === "PAGAMENTO") {
    let texto = textoOriginal;
    const valorInfo = extrairValor(texto);
    texto = valorInfo.restante;
    const horarioInfo = extrairHorario(texto);
    texto = horarioInfo.restante;
    texto = limparResiduos(texto);

    const descricao = normalizarDescricaoFinanceira(texto);
    if (!descricao) return { ok: false, motivo: "SEM_DESCRICAO" };

    return {
      ok: true,
      tarefa: {
        tipo: "PAGAMENTO",
        descricao,
        valor: valorInfo.valor,
        vencimento: new Date(),
        recorrente: false,
        frequencia: null,
        diaMes: null,
        diaSemana: null,
        mesAnual: null,
        horarioEnvio: horarioInfo.horario ?? HORARIO_LEMBRETE_PADRAO,
      },
    };
  }

  // tipo === "LEMBRETE"
  let texto = textoOriginal;

  const dataDDMM = extrairDataDDMM(texto);
  texto = dataDDMM.restante;

  const recorrenciaInfo = extrairRecorrencia(texto);
  texto = recorrenciaInfo.restante;

  const diaInfo = extrairDia(texto);
  texto = diaInfo.restante;

  const valorInfo = extrairValor(texto);
  texto = valorInfo.restante;

  const horarioInfo = extrairHorario(texto);
  texto = horarioInfo.restante;

  texto = limparResiduos(texto);
  const descricao = normalizarDescricaoFinanceira(texto);
  if (!descricao) return { ok: false, motivo: "SEM_DESCRICAO" };

  const hoje = new Date();
  let recorrente = recorrenciaInfo.recorrente;
  let frequencia = recorrenciaInfo.frequencia;
  let diaMes: number | null = null;
  let diaSemana: number | null = recorrenciaInfo.diaSemana;
  let mesAnual: number | null = null;
  let vencimento: Date | null = null;

  if (dataDDMM.dia != null && dataDDMM.mes != null) {
    vencimento = proximaDataAnual(dataDDMM.dia, dataDDMM.mes - 1, hoje);
    if (frequencia === "ANUAL") {
      diaMes = dataDDMM.dia;
      mesAnual = dataDDMM.mes;
    } else {
      recorrente = false;
      frequencia = null;
    }
  } else if (frequencia === "SEMANAL" && diaSemana != null) {
    vencimento = proximaDataDaSemana(diaSemana, hoje);
  } else if (diaInfo.dia != null) {
    vencimento = proximaDataDoMes(diaInfo.dia, hoje);
    if (frequencia === "MENSAL") {
      diaMes = diaInfo.dia;
    } else {
      // "anual"/"semanal" mencionados sem data completa não dá pra agendar de forma
      // recorrente com segurança — vira lembrete pontual pro próximo "dia N".
      recorrente = false;
      frequencia = null;
    }
  } else if (recorrenciaInfo.recorrente) {
    // Recorrência mencionada ("mensal", "todo mês"...) mas sem nenhum dia/data —
    // não dá pra agendar. Devolve erro específico pro chamador pedir a data.
    return { ok: false, motivo: "RECORRENCIA_SEM_DATA" };
  }

  return {
    ok: true,
    tarefa: {
      tipo: "LEMBRETE",
      descricao,
      valor: valorInfo.valor,
      vencimento,
      recorrente,
      frequencia,
      diaMes,
      diaSemana,
      mesAnual,
      horarioEnvio: horarioInfo.horario ?? HORARIO_LEMBRETE_PADRAO,
    },
  };
}

// ── Match com Divida existente (por credor) ──

export function encontrarDividaCorrespondente<T extends { credor: string }>(
  descricao: string,
  dividas: readonly T[]
): T | null {
  const alvo = normalizarTextoBusca(descricao);
  if (!alvo || dividas.length === 0) return null;

  const palavrasAlvo = new Set(alvo.split(" ").filter((p) => p.length >= 3));
  let melhor: T | null = null;
  let melhorPontuacao = 0;

  for (const divida of dividas) {
    const credorNorm = normalizarTextoBusca(divida.credor);
    if (!credorNorm) continue;

    let pontuacao = 0;
    if (alvo.includes(credorNorm) || credorNorm.includes(alvo)) {
      pontuacao = credorNorm.length + 100; // match direto de substring tem prioridade
    } else {
      for (const palavra of credorNorm.split(" ").filter((p) => p.length >= 3)) {
        if (palavrasAlvo.has(palavra)) pontuacao += palavra.length;
      }
    }

    if (pontuacao > melhorPontuacao) {
      melhorPontuacao = pontuacao;
      melhor = divida;
    }
  }

  return melhorPontuacao > 0 ? melhor : null;
}

// ── Match de Tarefa existente por termo livre (concluir/cancelar) ──

// "concluí"/"cancelar" usam linguagem natural, então o match errado tem custo real
// (concluir/cancelar a tarefa errada). Por isso essa função é deliberadamente
// conservadora: só devolve uma tarefa quando o match é inequívoco — com múltiplas
// candidatas batendo, ou só uma palavra genérica em comum, prefere devolver null
// (o chamador então não intercepta a mensagem) a arriscar agir na tarefa errada.
export function encontrarTarefaPorTermo<T extends { descricao: string }>(
  termo: string,
  tarefas: readonly T[]
): T | null {
  const alvo = normalizarTextoBusca(termo);
  if (!alvo || tarefas.length === 0) return null;
  // Termo curto demais (ex.: "a", "de") não é específico o suficiente pra
  // confirmar match nem por substring direta — evita "cancela a" acertar
  // qualquer tarefa cuja descrição contenha a letra "a".
  if (!alvo.split(" ").some((p) => p.length >= 3)) return null;

  const diretas = tarefas.filter((t) => {
    const desc = normalizarTextoBusca(t.descricao);
    return desc.length > 0 && (desc.includes(alvo) || alvo.includes(desc));
  });
  if (diretas.length === 1) return diretas[0];
  if (diretas.length > 1) return null; // ambíguo — mais de uma tarefa bate por substring

  const palavrasAlvo = new Set(alvo.split(" ").filter((p) => p.length >= 3));
  let melhor: T | null = null;
  let melhorPontuacao = 0;
  let empatou = false;

  for (const t of tarefas) {
    const palavrasTarefa = normalizarTextoBusca(t.descricao).split(" ").filter((p) => p.length >= 3);
    const comuns = palavrasTarefa.filter((p) => palavrasAlvo.has(p)).length;
    // Com só 1 palavra em comum, exige que a tarefa seja curta (senão 1 palavra
    // genérica tipo "pagar" ou "conta" combina com qualquer coisa).
    const minimoNecessario = palavrasTarefa.length <= 1 ? 1 : 2;
    if (comuns < minimoNecessario) continue;

    if (comuns > melhorPontuacao) {
      melhorPontuacao = comuns;
      melhor = t;
      empatou = false;
    } else if (comuns === melhorPontuacao) {
      empatou = true;
    }
  }

  return empatou ? null : melhor;
}

// ── Formatação de mensagens ───────────────

function formatarFrequencia(frequencia: FrequenciaTarefa | null): string {
  if (frequencia === "MENSAL") return "todo mês";
  if (frequencia === "SEMANAL") return "toda semana";
  if (frequencia === "ANUAL") return "todo ano";
  return "recorrente";
}

export function formatarConfirmacaoTarefa(tarefa: TarefaExtraida): string {
  const linhas: string[] = [];

  if (tarefa.tipo === "PAGAMENTO") {
    linhas.push(`✅ *Pagamento registrado:* ${tarefa.descricao}`);
    if (tarefa.valor != null) linhas.push(`💰 ${formatarValorBR(tarefa.valor)}`);
    return linhas.join("\n");
  }

  linhas.push(`🔔 *Lembrete criado:* ${tarefa.descricao}`);
  if (tarefa.valor != null) linhas.push(`💰 ${formatarValorBR(tarefa.valor)}`);
  if (tarefa.vencimento) linhas.push(`📅 ${formatarDataBR(tarefa.vencimento)}`);
  if (tarefa.recorrente) linhas.push(`🔁 Repete ${formatarFrequencia(tarefa.frequencia)}`);
  linhas.push(`⏰ Aviso às ${tarefa.horarioEnvio}`);
  linhas.push(`\n_Pra cancelar: "cancelar ${tarefa.descricao.toLowerCase()}"_`);

  return linhas.join("\n");
}

export function formatarMensagemErroExtracao(motivo: "SEM_DESCRICAO" | "RECORRENCIA_SEM_DATA"): string {
  if (motivo === "RECORRENCIA_SEM_DATA") {
    return (
      "Entendi que é recorrente, mas não achei o dia. 🤔\n\n" +
      "Manda assim: *lembrete: pagar a luz todo dia 10* ou *lembrete: pagar o seguro toda segunda*."
    );
  }
  return (
    "Não entendi o que devo lembrar. 🤔\n\n" +
    "Manda assim: *lembrete: pagar a luz dia 10, R$150* ou *pagamento: paguei a luz, R$150*."
  );
}

export function formatarListaTarefas<T extends {
  descricao: string;
  valor: number | null;
  vencimento: Date | null;
  recorrente: boolean;
  frequencia: string | null;
}>(tarefas: readonly T[]): string {
  if (tarefas.length === 0) {
    return (
      "📋 Você não tem tarefas pendentes.\n\n" +
      "Pra criar uma: *lembrete: pagar a luz dia 10*"
    );
  }

  let texto = `📋 *Suas tarefas pendentes:*\n\n`;
  for (const t of tarefas) {
    const venc = t.vencimento ? ` — ${formatarDataBR(t.vencimento)}` : "";
    const valor = t.valor != null ? ` — ${formatarValorBR(t.valor)}` : "";
    const rec = t.recorrente ? ` 🔁` : "";
    texto += `• ${t.descricao}${valor}${venc}${rec}\n`;
  }
  texto += `\n_Pra concluir: "concluí [nome da tarefa]"_`;
  return texto;
}
