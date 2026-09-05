// Lista fixa das planilhas que a tela /atualizacao-dados sabe importar.
// `chave` é o identificador estável usado no banco (PlanilhaAnalytics.chave)
// e na rota /api/analytics-planilhas/[chave] — mudar a chave de um item
// existente "perde" a importação anterior (upsert por chave), então trate
// como um identificador permanente, não um rótulo.
export type PlanilhaAnalyticsDef = {
  chave: string;
  nome: string;
  descricao: string;
};

export const PLANILHAS_ANALYTICS: PlanilhaAnalyticsDef[] = [
  {
    chave: "trafego-site",
    nome: "Tráfego do site",
    descricao: "Sessões, usuários e páginas vistas — export do Google Analytics.",
  },
  {
    chave: "aquisicao",
    nome: "Aquisição de visitantes",
    descricao: "Canal de origem (orgânico, pago, direto, social) — export do Google Analytics.",
  },
  {
    chave: "conversoes",
    nome: "Conversões",
    descricao: "Eventos de conversão (cadastro, checkout, WhatsApp) — export do Google Analytics.",
  },
];

export function planilhaPorChave(chave: string): PlanilhaAnalyticsDef | undefined {
  return PLANILHAS_ANALYTICS.find((p) => p.chave === chave);
}
