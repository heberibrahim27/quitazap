// ─────────────────────────────────────────
// QuitaZAP — Contatos Sociais (redes/suporte configuráveis pelo admin)
// ─────────────────────────────────────────
// Substitui os números/links hardcoded que existiam antes em 3 pontos
// públicos (rodapé da landing, política de privacidade, plano do
// Cobrador). Cadastro fica em /painel/contatos; os 3 consumidores
// públicos só leem daqui, nunca reprocessam valorBruto — o link já sai
// normalizado e validado no momento da gravação (ver normalizarContato).

import { prisma } from "@/lib/prisma";

export const TIPOS_CONTATO = ["WHATSAPP", "INSTAGRAM", "FACEBOOK", "EMAIL", "YOUTUBE", "TIKTOK", "OUTRO"] as const;
export type TipoContato = (typeof TIPOS_CONTATO)[number];

export const LABEL_TIPO_CONTATO: Record<TipoContato, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  EMAIL: "E-mail",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  OUTRO: "Outro",
};

export interface ContatoSocialPublico {
  id: string;
  tipo: TipoContato;
  nome: string;
  link: string;
}

function ehTipoValido(tipo: string): tipo is TipoContato {
  return (TIPOS_CONTATO as readonly string[]).includes(tipo);
}

// Normaliza + valida o valor digitado pelo admin de acordo com o tipo,
// pra nunca gravar lixo que quebraria um <a href> nos pontos públicos
// depois. Retorna o link final pronto pra usar, ou um erro legível.
export function normalizarContato(tipo: string, valorBruto: string): { ok: true; link: string } | { ok: false; erro: string } {
  const valor = valorBruto.trim();
  if (!valor) return { ok: false, erro: "Informe o link ou contato." };
  if (!ehTipoValido(tipo)) return { ok: false, erro: "Tipo de canal inválido." };

  if (tipo === "WHATSAPP") {
    const digitos = valor.replace(/\D/g, "");
    if (digitos.length < 10 || digitos.length > 13) {
      return { ok: false, erro: "Número de WhatsApp inválido — inclua DDD (e o 55 do Brasil, se for o caso)." };
    }
    return { ok: true, link: `https://wa.me/${digitos}` };
  }

  if (tipo === "EMAIL") {
    const email = valor.replace(/^mailto:/i, "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, erro: "E-mail inválido." };
    }
    return { ok: true, link: `mailto:${email}` };
  }

  // INSTAGRAM / FACEBOOK / YOUTUBE / TIKTOK / OUTRO: precisa ser uma URL utilizável.
  const comProtocolo = /^https?:\/\//i.test(valor) ? valor : `https://${valor}`;
  try {
    const url = new URL(comProtocolo);
    return { ok: true, link: url.toString() };
  } catch {
    return { ok: false, erro: "Link inválido — confira se digitou o endereço completo." };
  }
}

// Todos os canais ativos, pro rodapé da landing (ícones/lista) — ordenados
// pela ordem definida no admin.
export async function listarContatosAtivos(): Promise<ContatoSocialPublico[]> {
  const linhas = await prisma.contatoSocial.findMany({
    where: { ativo: true },
    orderBy: { ordem: "asc" },
    select: { id: true, tipo: true, nome: true, link: true },
  });
  return linhas.filter((l): l is ContatoSocialPublico => ehTipoValido(l.tipo));
}

// Um canal só, pra usar como "contato de suporte" (privacidade, plano do
// Cobrador) — prioriza WhatsApp, depois e-mail, depois qualquer outro
// ativo (nessa ordem), sempre respeitando a `ordem` dentro de cada tipo.
// null quando não existe nenhum canal ativo (quem consome deve esconder
// o CTA por completo nesse caso, nunca mostrar link/placeholder vazio).
export async function getContatoSuporte(): Promise<ContatoSocialPublico | null> {
  const ativos = await listarContatosAtivos();
  if (ativos.length === 0) return null;
  const porPrioridade = (tipo: TipoContato) => ativos.find((c) => c.tipo === tipo);
  return porPrioridade("WHATSAPP") ?? porPrioridade("EMAIL") ?? ativos[0];
}
