// ─────────────────────────────────────────
// QuitaZAP — Senha do painel admin (fundador)
// Fonte da verdade: ContaAdmin (linha única, hash bcrypt) — o fundador
// define/troca pelo próprio painel, em Configurações. Enquanto ele não
// definiu nenhuma ainda, cai pro bootstrap antigo (variável de ambiente
// APP_SENHA), pra login continuar funcionando sem exigir nenhuma ação
// manual só por essa mudança já estar no ar.
// ─────────────────────────────────────────

import { hashSync, compareSync } from "bcryptjs";
import { timingSafeEqual } from "crypto";
import { prisma } from "./prisma";

// Id fixo pra ContaAdmin ser sempre a mesma linha (upsert atômico) — sem
// isso, duas trocas de senha quase simultâneas (ex: 2 abas abertas)
// poderiam criar 2 linhas, e qual delas "vale" ficaria indefinido (achado
// da auto-revisão).
const ID_CONTA_ADMIN = "fundador";

function senhaConfereTempoConstante(digitada: string, correta: string): boolean {
  const a = Buffer.from(digitada);
  const b = Buffer.from(correta);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function verificarSenhaAdmin(senha: string): Promise<boolean> {
  const contaAdmin = await prisma.contaAdmin.findUnique({ where: { id: ID_CONTA_ADMIN } });

  if (contaAdmin) {
    return compareSync(senha, contaAdmin.senhaHash);
  }

  const correta = process.env.APP_SENHA;
  if (!correta) {
    console.error("[LOGIN ADMIN] Nem ContaAdmin nem APP_SENHA configurados — login bloqueado até configurar.");
    return false;
  }
  return senhaConfereTempoConstante(senha, correta);
}

// true = já existe uma senha definida pelo fundador no banco (ContaAdmin).
// false = ainda está no bootstrap via APP_SENHA.
export async function temSenhaAdminDefinida(): Promise<boolean> {
  const conta = await prisma.contaAdmin.findUnique({ where: { id: ID_CONTA_ADMIN }, select: { id: true } });
  return conta !== null;
}

export async function definirSenhaAdmin(senhaNova: string): Promise<void> {
  const senhaHash = hashSync(senhaNova, 12);
  await prisma.contaAdmin.upsert({
    where: { id: ID_CONTA_ADMIN },
    update: { senhaHash },
    create: { id: ID_CONTA_ADMIN, senhaHash },
  });
}
