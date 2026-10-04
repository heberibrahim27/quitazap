// Abas da hero da home: "home" é o painel completo (padrão, sem ?aba=); as
// outras mostram um resumo da seção com atalho pra página inteira. Arquivo
// separado (sem "use client") pra servidor e cliente poderem importar.
export const ABAS_HERO = ["home", "receita", "despesas", "metas"] as const;
export type AbaHero = (typeof ABAS_HERO)[number];

export function abaDaUrl(valor: string | null | undefined): AbaHero {
  return ABAS_HERO.includes(valor as AbaHero) ? (valor as AbaHero) : "home";
}

// Link da home preservando aba e mês (mes = "AAAA-MM", só quando não é o atual).
export function hrefHome(aba: AbaHero, mes: string | null): string {
  const q = [aba !== "home" ? `aba=${aba}` : "", mes ? `mes=${mes}` : ""].filter(Boolean).join("&");
  return q ? `/minha-conta?${q}` : "/minha-conta";
}
