// ─────────────────────────────────────────
// QuitaZAP — Ferramentas do Assistente Admin (IA interna)
// ─────────────────────────────────────────
// Única superfície de dado que o modelo enxerga: cada tool aqui é uma
// função escrita à mão com select explícito, igual ao princípio já usado
// em api/exportar/route.ts e status-assinatura.ts — o modelo nunca tem
// acesso a Prisma cru, então estruturalmente não tem como uma tool
// devolver renda/despesa/dívida do cliente final, mesmo que o prompt seja
// manipulado (prompt injection não abre uma coluna que a query nunca
// seleciona).
//
// Toda tool marcada `mutating: true` NUNCA executa a escrita quando o
// modelo a chama — só valida e devolve um resumo legível pra confirmação
// (ver validarEResumir). A execução de verdade só acontece via
// api/assistente-admin/confirmar/route.ts, chamada pelo clique explícito
// em "Confirmar" na tela, nunca de volta pelo modelo.

import { prisma } from "@/lib/prisma";
import { calcularStatusAssinatura, whereStatusAssinatura, LABEL_STATUS_ASSINATURA, type StatusAssinatura } from "@/lib/status-assinatura";
import { calcularMetricasNegocio } from "@/lib/financeiro-admin/metricas-negocio";
import { calcularDreAdmin } from "@/lib/financeiro-admin/motor";
import { TIPOS_CONTATO, LABEL_TIPO_CONTATO, normalizarContato, criarContatoSocial, type TipoContato } from "@/lib/contatos-sociais";

export const SYSTEM_PROMPT = `Você é o assistente interno do painel administrativo do QuitaZAP — uso exclusivo da equipe (Ibrahim e afins), nunca do cliente final. Ajuda com perguntas sobre a gestão do negócio (clientes, assinaturas, métricas financeiras do SaaS) e executa ações administrativas simples quando pedido.

Regras rígidas, sem exceção:
- Você só sabe o que as ferramentas abaixo devolvem. Nunca invente número, nome ou ID.
- Você NUNCA tem acesso a dado financeiro pessoal do cliente final (renda, despesas, dívidas, contracheque) — isso é por design, não por instrução: nenhuma ferramenta sua expõe esse dado. Se perguntarem, explique que esse dado é privado do cliente e não fica disponível aqui.
- Ferramentas de escrita (marcar_cliente_como_pago, cadastrar_contato_social) nunca executam a ação de verdade quando você as chama — elas só geram uma proposta que a pessoa confirma manualmente na tela. Ainda assim, só chame uma ferramenta de escrita quando o pedido for específico o bastante (já souber qual cliente/contato). Se o nome for ambíguo ou faltar informação, pergunte antes ou use buscar_cliente pra resolver.
- Pra qualquer ação envolvendo um cliente específico, sempre chame buscar_cliente antes se ainda não tiver o ID exato — nunca invente ou adivinhe um clienteId.
- Respostas diretas e objetivas — isso é ferramenta de trabalho, não bate-papo.`;

export interface ResultadoLeitura {
  tipo: "leitura";
  executar(args: Record<string, unknown>): Promise<unknown>;
}

export interface ResultadoEscrita {
  tipo: "escrita";
  /** Valida os argumentos e monta o resumo legível pra confirmação — NUNCA
   * grava nada. Chamada tanto na proposta (chat) quanto de novo na
   * confirmação (defesa em profundidade: o estado pode ter mudado). */
  validarEResumir(args: Record<string, unknown>): Promise<{ ok: true; resumo: string } | { ok: false; erro: string }>;
  /** Só é chamada depois da confirmação explícita do usuário. */
  executar(args: Record<string, unknown>): Promise<{ antes: unknown; depois: unknown; resultado: unknown }>;
}

export type DefinicaoFerramenta = ResultadoLeitura | ResultadoEscrita;

function argTexto(args: Record<string, unknown>, chave: string): string {
  return typeof args[chave] === "string" ? (args[chave] as string) : "";
}

// ── Leitura ──────────────────────────────

const buscarMetricasNegocio: ResultadoLeitura = {
  tipo: "leitura",
  async executar(args) {
    const mes = argTexto(args, "mes") || undefined;
    const m = await calcularMetricasNegocio(mes);
    return {
      mes: m.mes,
      mrrAtual: m.mrrAtual,
      mrrMesAnterior: m.mrrMesAnterior,
      crescimentoMrrPct: m.crescimentoMrrPct,
      assinantesAtivos: m.ativos,
      churnPct: m.churnPct,
      churnMesAnteriorPct: m.churnMesAnteriorPct,
      novosAssinantes: m.novosAssinantes,
      novosAssinantesMesAnterior: m.novosAssinantesMesAnterior,
      cancelamentos: m.cancelamentos,
      cancelamentosMesAnterior: m.cancelamentosMesAnterior,
      reativacoes: m.reativacoes,
      eventosProblema: m.eventosProblema,
      arpu: m.arpu,
      receitaPerdidaCancelamentos: m.receitaPerdidaCancelamentos,
      alertas: m.alertas,
    };
  },
};

const buscarDreMes: ResultadoLeitura = {
  tipo: "leitura",
  async executar(args) {
    const mes = argTexto(args, "mes") || undefined;
    const dre = await calcularDreAdmin(mes);
    return dre;
  },
};

function selecionarCampoCliente(c: { gratuito: boolean; assinaturaVenceEm: Date | null }) {
  return { status: calcularStatusAssinatura(c) };
}

const buscarCliente: ResultadoLeitura = {
  tipo: "leitura",
  async executar(args) {
    const busca = argTexto(args, "busca").trim();
    if (!busca) return { erro: "Informe um nome ou telefone pra buscar." };

    const digitos = busca.replace(/\D/g, "");
    const clientes = await prisma.cliente.findMany({
      where: {
        OR: [
          { nome: { contains: busca, mode: "insensitive" } },
          ...(digitos.length >= 4 ? [{ telefone: { contains: digitos } }] : []),
        ],
      },
      select: { id: true, nome: true, telefone: true, email: true, gratuito: true, assinaturaVenceEm: true, criadoEm: true },
      take: 5,
    });

    return clientes.map((c) => ({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      email: c.email,
      clienteDesde: c.criadoEm,
      ...selecionarCampoCliente(c),
      assinaturaVenceEm: c.assinaturaVenceEm,
    }));
  },
};

const STATUS_VALIDOS: StatusAssinatura[] = ["PAGO", "CANCELADO", "INATIVO"];

const listarClientesPorStatus: ResultadoLeitura = {
  tipo: "leitura",
  async executar(args) {
    const status = argTexto(args, "status").toUpperCase();
    if (!STATUS_VALIDOS.includes(status as StatusAssinatura)) {
      return { erro: `Status inválido — use um de: ${STATUS_VALIDOS.join(", ")}.` };
    }
    const limiteBruto = Number(args.limite);
    const limite = Number.isFinite(limiteBruto) ? Math.min(Math.max(Math.trunc(limiteBruto), 1), 50) : 20;

    const clientes = await prisma.cliente.findMany({
      where: whereStatusAssinatura(status as StatusAssinatura),
      orderBy: { criadoEm: "desc" },
      select: { id: true, nome: true, telefone: true, criadoEm: true, assinaturaVenceEm: true },
      take: limite,
    });
    return clientes;
  },
};

const contarClientesPorStatus: ResultadoLeitura = {
  tipo: "leitura",
  async executar() {
    const todos = await prisma.cliente.findMany({ select: { gratuito: true, assinaturaVenceEm: true } });
    const contagem: Record<StatusAssinatura, number> = { PAGO: 0, CANCELADO: 0, INATIVO: 0 };
    for (const c of todos) contagem[calcularStatusAssinatura(c)]++;
    return contagem;
  },
};

const listarContatosSociais: ResultadoLeitura = {
  tipo: "leitura",
  async executar() {
    return prisma.contatoSocial.findMany({
      orderBy: { ordem: "asc" },
      select: { id: true, tipo: true, nome: true, link: true, ativo: true },
    });
  },
};

// ── Escrita ──────────────────────────────

const DIAS_RENOVACAO_PADRAO = 30;

const marcarClienteComoPago: ResultadoEscrita = {
  tipo: "escrita",
  async validarEResumir(args) {
    const clienteId = argTexto(args, "clienteId").trim();
    if (!clienteId) return { ok: false, erro: "Faltou o clienteId — use buscar_cliente antes pra descobrir o ID certo." };

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, nome: true, telefone: true, gratuito: true, assinaturaVenceEm: true },
    });
    if (!cliente) return { ok: false, erro: "Cliente não encontrado — confira o ID (use buscar_cliente de novo)." };

    const statusAtual = LABEL_STATUS_ASSINATURA[calcularStatusAssinatura(cliente)];
    return {
      ok: true,
      resumo: `Marcar ${cliente.nome} (${cliente.telefone}) como pago — renova a assinatura por ${DIAS_RENOVACAO_PADRAO} dias a partir de hoje. Status atual: ${statusAtual}.`,
    };
  },
  async executar(args) {
    const clienteId = argTexto(args, "clienteId").trim();
    const antes = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { gratuito: true, assinaturaVenceEm: true },
    });
    if (!antes) throw new Error("Cliente não encontrado.");

    const novoVencimento = new Date(Date.now() + DIAS_RENOVACAO_PADRAO * 24 * 60 * 60 * 1000);
    const depois = await prisma.cliente.update({
      where: { id: clienteId },
      data: { gratuito: false, assinaturaVenceEm: novoVencimento },
      select: { gratuito: true, assinaturaVenceEm: true },
    });
    return { antes, depois, resultado: { ok: true } };
  },
};

const cadastrarContatoSocial: ResultadoEscrita = {
  tipo: "escrita",
  async validarEResumir(args) {
    const tipo = argTexto(args, "tipo").toUpperCase();
    const nome = argTexto(args, "nome").trim();
    const valor = argTexto(args, "valor").trim();

    if (!nome) return { ok: false, erro: "Informe um nome pra identificar o canal." };
    const normalizado = normalizarContato(tipo, valor);
    if (!normalizado.ok) return { ok: false, erro: normalizado.erro };

    const label = LABEL_TIPO_CONTATO[tipo as TipoContato] ?? tipo;
    return { ok: true, resumo: `Cadastrar canal ${label} "${nome}" → ${normalizado.link}` };
  },
  async executar(args) {
    const tipo = argTexto(args, "tipo").toUpperCase();
    const nome = argTexto(args, "nome").trim();
    const valor = argTexto(args, "valor").trim();

    const resultado = await criarContatoSocial(tipo, nome, valor);
    if (!resultado.ok) throw new Error(resultado.erro);
    return { antes: null, depois: resultado.contato, resultado: resultado.contato };
  },
};

// ── Registro + schemas OpenAI ────────────

export const REGISTRO_FERRAMENTAS: Record<string, DefinicaoFerramenta> = {
  buscar_metricas_negocio: buscarMetricasNegocio,
  buscar_dre_mes: buscarDreMes,
  buscar_cliente: buscarCliente,
  listar_clientes_por_status: listarClientesPorStatus,
  contar_clientes_por_status: contarClientesPorStatus,
  listar_contatos_sociais: listarContatosSociais,
  marcar_cliente_como_pago: marcarClienteComoPago,
  cadastrar_contato_social: cadastrarContatoSocial,
};

export const FERRAMENTAS_OPENAI = [
  {
    type: "function",
    function: {
      name: "buscar_metricas_negocio",
      description: "Métricas de saúde do negócio: MRR, churn, novos assinantes, cancelamentos, reativações, ARPU. Use pra perguntas sobre crescimento, cancelamento, receita recorrente.",
      parameters: {
        type: "object",
        properties: { mes: { type: "string", description: "Mês no formato AAAA-MM. Se omitido, usa o mês atual." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_dre_mes",
      description: "Receita, custo e resultado operacional (DRE) do mês. Use pra perguntas sobre receita, resultado, lucro, custo do negócio.",
      parameters: {
        type: "object",
        properties: { mes: { type: "string", description: "Mês no formato AAAA-MM. Se omitido, usa o mês atual." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_cliente",
      description: "Busca clientes por nome ou telefone (só dados de conta/assinatura). Use SEMPRE antes de uma ação que precise de um clienteId — nunca invente um ID.",
      parameters: {
        type: "object",
        properties: { busca: { type: "string", description: "Nome (ou parte) ou telefone do cliente." } },
        required: ["busca"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_clientes_por_status",
      description: "Lista clientes filtrados por status de assinatura.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["PAGO", "CANCELADO", "INATIVO"] },
          limite: { type: "number", description: "Máximo de resultados (padrão 20, máximo 50)." },
        },
        required: ["status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "contar_clientes_por_status",
      description: "Conta quantos clientes existem em cada status de assinatura (pago, cancelado, inativo).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_contatos_sociais",
      description: "Lista os canais de contato/redes sociais cadastrados, com status ativo/inativo.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "marcar_cliente_como_pago",
      description: `Renova a assinatura de um cliente por ${DIAS_RENOVACAO_PADRAO} dias a partir de hoje. AÇÃO DE ESCRITA — nunca executa de verdade quando chamada, só propõe. Use buscar_cliente antes pra ter o clienteId certo.`,
      parameters: {
        type: "object",
        properties: { clienteId: { type: "string" } },
        required: ["clienteId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cadastrar_contato_social",
      description: "Cadastra um novo canal de contato/rede social. AÇÃO DE ESCRITA — nunca executa de verdade quando chamada, só propõe.",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: [...TIPOS_CONTATO] },
          nome: { type: "string", description: 'Nome de exibição, ex: "Suporte QuitaZAP".' },
          valor: { type: "string", description: "Número com DDD (WhatsApp), e-mail, ou link — depende do tipo." },
        },
        required: ["tipo", "nome", "valor"],
      },
    },
  },
];
