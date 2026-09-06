// ─────────────────────────────────────────
// QuitaZAP — Status do lead pro painel admin (lógica pura)
// ─────────────────────────────────────────
// Pedido do Ibrahim: um painel separado mostrando o atendimento do bot de
// vendas por lead, com um status tipo "assinou"/"pensando"/"parou de
// responder"/"objeção sem resposta"/"stop/optout". Nenhum desses status
// existe como campo próprio no banco — LeadVendas só guarda etapa (estado
// bruto do funil) + as poucas colunas de bookkeeping do loop de objeção.
// Esta função DERIVA o status de exibição a partir desses dados, sem
// precisar de mais nenhuma coluna além de motivoDesistencia (a única peça
// que realmente precisava ser persistida — "por que" desistiu não dá pra
// reconstruir depois só olhando o estado final).

export type StatusLead =
  | "ASSINOU"
  | "PEDIU_PRA_PARAR"
  | "RECUSOU"
  | "NAO_CONVERTEU"
  | "PENSANDO"
  | "OBJECAO_SEM_RESPOSTA"
  | "PAROU_DE_RESPONDER"
  | "EM_ANDAMENTO";

export const LABELS_STATUS_LEAD: Record<StatusLead, string> = {
  ASSINOU: "Assinou",
  PEDIU_PRA_PARAR: "Pediu pra parar",
  RECUSOU: "Recusou de início",
  NAO_CONVERTEU: "Não converteu",
  PENSANDO: "Pensando",
  OBJECAO_SEM_RESPOSTA: "Objeção sem resposta",
  PAROU_DE_RESPONDER: "Parou de responder",
  EM_ANDAMENTO: "Em andamento",
};

// Mesmo padrão de COR_STATUS_ASSINATURA (status-assinatura.ts): verde pra
// desfecho bom, vermelho pra desfecho ruim/explícito, cinza pra incerto.
export const COR_STATUS_LEAD: Record<StatusLead, { bg: string; color: string; border: string }> = {
  ASSINOU: { bg: "rgba(16,185,129,0.12)", color: "#6ee7b7", border: "rgba(16,185,129,0.25)" },
  EM_ANDAMENTO: { bg: "rgba(59,130,246,0.12)", color: "#7dc4ff", border: "rgba(59,130,246,0.25)" },
  PENSANDO: { bg: "rgba(250,204,21,0.12)", color: "#fcd34d", border: "rgba(250,204,21,0.25)" },
  OBJECAO_SEM_RESPOSTA: { bg: "rgba(250,204,21,0.12)", color: "#fcd34d", border: "rgba(250,204,21,0.25)" },
  PAROU_DE_RESPONDER: { bg: "rgba(255,255,255,0.06)", color: "#9ca3af", border: "rgba(255,255,255,0.12)" },
  RECUSOU: { bg: "rgba(239,68,68,0.12)", color: "#fca5a5", border: "rgba(239,68,68,0.25)" },
  PEDIU_PRA_PARAR: { bg: "rgba(239,68,68,0.12)", color: "#fca5a5", border: "rgba(239,68,68,0.25)" },
  NAO_CONVERTEU: { bg: "rgba(255,255,255,0.06)", color: "#9ca3af", border: "rgba(255,255,255,0.12)" },
};

export type LeadParaStatus = {
  etapa: string;
  motivoDesistencia: string | null;
  angulosUsados: string;
  tentativasObjecao: number;
  atualizadoEm: Date;
};

// Depois desse tempo sem nova mensagem (nem do lead, nem do bot), um lead
// ainda "ativo" (não converteu, não desistiu) é tratado como abandonado
// pra fins de relatório — bem mais que a janela de 4h do follow-up
// automático (agendarFollowup em sales-bot.ts), que já cobre a tentativa
// de reengajamento; isso aqui é só pra exibição no painel.
const HORAS_PARA_CONSIDERAR_ABANDONADO = 24;

export function calcularStatusLead(lead: LeadParaStatus, agora: Date = new Date()): StatusLead {
  if (lead.etapa === "CONVERTIDO") return "ASSINOU";

  if (lead.etapa === "DESISTIU") {
    if (lead.motivoDesistencia === "OPTOUT") return "PEDIU_PRA_PARAR";
    if (lead.motivoDesistencia === "RECUSOU") return "RECUSOU";
    return "NAO_CONVERTEU";
  }

  const horasParado = (agora.getTime() - lead.atualizadoEm.getTime()) / (1000 * 60 * 60);
  if (horasParado < HORAS_PARA_CONSIDERAR_ABANDONADO) return "EM_ANDAMENTO";

  // Parado há tempo — distingue POR QUE parou, quando dá.
  const usados = lead.angulosUsados ? lead.angulosUsados.split(",").filter(Boolean) : [];
  if (usados.at(-1) === "ADIAR") return "PENSANDO";
  if (lead.tentativasObjecao > 0) return "OBJECAO_SEM_RESPOSTA";
  return "PAROU_DE_RESPONDER";
}
