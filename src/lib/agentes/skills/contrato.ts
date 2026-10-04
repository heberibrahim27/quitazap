// ─────────────────────────────────────────
// Contrato do Skill Registry (puro) — desenho acordado com o ChatGPT
// ─────────────────────────────────────────
// Skill = interface de CAPACIDADE (o que o sistema sabe fazer); a regra
// financeira continua nos serviços de domínio. Os dois canais (WhatsApp e
// chat nativo) chamam exatamente a mesma skill — o canal só importa na
// entrada e na resposta, nunca no efeito financeiro.

export type CanalSkill = "whatsapp" | "app";

export interface SkillContext {
  userId: string;
  timezone: string;
  channel: CanalSkill;
  gratuito?: boolean;
}

export type SkillResult<T> = { ok: true; data: T } | { ok: false; code: string; userMessage?: string };

export type ModoSkill = "READ" | "WRITE";

export interface Skill<I, O> {
  name: string;
  description: string;
  /** READ pode ser exposta ao agente Quita; WRITE nunca (escrita é determinística + confirmação). */
  modo: ModoSkill;
  validate(input: unknown): I;
  execute(ctx: SkillContext, input: I): Promise<SkillResult<O>>;
}

export class RegistroDeSkills {
  private skills = new Map<string, Skill<unknown, unknown>>();

  register<I, O>(skill: Skill<I, O>): void {
    if (this.skills.has(skill.name)) throw new Error(`Skill duplicada: ${skill.name}`);
    this.skills.set(skill.name, skill as Skill<unknown, unknown>);
  }

  get(nome: string): Skill<unknown, unknown> | undefined {
    return this.skills.get(nome);
  }

  list(modo?: ModoSkill): Array<{ name: string; description: string; modo: ModoSkill }> {
    return [...this.skills.values()]
      .filter((s) => !modo || s.modo === modo)
      .map((s) => ({ name: s.name, description: s.description, modo: s.modo }));
  }

  /** Valida a entrada e executa; erro de validação ou exceção viram resultado, nunca estouram. */
  async run<O = unknown>(nome: string, ctx: SkillContext, input: unknown): Promise<SkillResult<O>> {
    const skill = this.skills.get(nome);
    if (!skill) return { ok: false, code: "SKILL_DESCONHECIDA" };
    let entrada: unknown;
    try {
      entrada = skill.validate(input);
    } catch (err) {
      return { ok: false, code: "ENTRADA_INVALIDA", userMessage: err instanceof Error ? err.message : undefined };
    }
    try {
      return (await skill.execute(ctx, entrada)) as SkillResult<O>;
    } catch (err) {
      console.error(`[SKILL] ${nome} falhou:`, err);
      return { ok: false, code: "ERRO_INTERNO" };
    }
  }
}
