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
import { calcularDreAdmin, calcularAssinantesParaLucro, PRECO_MENSAL, COMISSAO_CAKTO } from "@/lib/financeiro-admin/motor";
import { TIPOS_CONTATO, LABEL_TIPO_CONTATO, normalizarContato, criarContatoSocial, type TipoContato } from "@/lib/contatos-sociais";

export const SYSTEM_PROMPT = `Você é o assistente interno do painel administrativo do QuitaZAP — uso exclusivo da equipe (Ibrahim e afins), nunca do cliente final. Ajuda com perguntas sobre a gestão do negócio (clientes, assinaturas, métricas financeiras do SaaS) e executa ações administrativas simples quando pedido.

Fatos fixos do negócio (não precisa de ferramenta pra isso, já sabe de cor):
- Preço da assinatura hoje: R$ ${PRECO_MENSAL.toFixed(2).replace(".", ",")}/mês (mesmo valor pra todo cliente pagante).
- Comissão da Cakto sobre cada cobrança: ${(COMISSAO_CAKTO * 100).toFixed(1).replace(".", ",")}%.
- Isso é o preço de tabela/catálogo — não confunda com "ARPU" (receita média por assinante ativo), que é um dado observado que pode variar/zerar conforme a base atual.

Status de assinatura — só existem 3, não invente um quarto:
- PAGO: assinatura ativa e em dia.
- CANCELADO: já foi pagante, assinatura venceu e não renovou (ou cancelou/reembolsou).
- INATIVO: cliente gratuito/lead, nunca pagou nada — NÃO é sinônimo de "pagamento pendente", "pagamento recusado" ou "pagamento em análise". O sistema hoje NÃO tem esse conceito de "pendente" — o webhook da Cakto ainda não distingue esse estado de nenhum outro. Se perguntarem por "clientes com pagamento pendente/falho", nunca rotule cliente INATIVO como "pendente" — explique que esse dado não existe no sistema hoje e, se fizer sentido, ofereça mostrar os INATIVOs deixando claro que são leads gratuitos (não uma cobrança pendente).

Regras rígidas, sem exceção:
- Você só sabe o que as ferramentas abaixo devolvem (além dos fatos fixos acima). Nunca invente número, nome ou ID.
- Todo valor em reais tem no máximo 2 casas decimais (formato R$ 0,00) — nunca escreva um valor monetário com 3+ casas decimais.
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

function argNumero(args: Record<string, unknown>, chave: string): number | null {
  const v = args[chave];
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

// Arredonda pra centavos antes de devolver ao modelo — sem isso, valor
// derivado de custo de IA (LogIA.custoUSD × câmbio) chega com 4+ casas
// decimais (ex: R$ 0,0284) e o modelo simplesmente ecoa o número cru na
// resposta em vez de formatar como dinheiro de verdade.
function arredondarMoeda(v: number): number {
  return Math.round(v * 100) / 100;
}

// ── Leitura ──────────────────────────────

const buscarMetricasNegocio: ResultadoLeitura = {
  tipo: "leitura",
  async executar(args) {
    const mes = argTexto(args, "mes") || undefined;
    const m = await calcularMetricasNegocio(mes);
    return {
      mes: m.mes,
      precoMensalCatalogo: PRECO_MENSAL,
      mrrAtual: arredondarMoeda(m.mrrAtual),
      mrrMesAnterior: arredondarMoeda(m.mrrMesAnterior),
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
      // ARPU é receita média OBSERVADA por assinante — não confundir com
      // precoMensalCatalogo (preço de tabela). Difere/zera quando a base
      // de ativos é pequena; nunca é a resposta certa pra "qual o preço
      // da assinatura".
      arpu: arredondarMoeda(m.arpu),
      receitaPerdidaCancelamentos: arredondarMoeda(m.receitaPerdidaCancelamentos),
      alertas: m.alertas,
    };
  },
};

const buscarDreMes: ResultadoLeitura = {
  tipo: "leitura",
  async executar(args) {
    const mes = argTexto(args, "mes") || undefined;
    const dre = await calcularDreAdmin(mes);
    return {
      ...dre,
      precoMensalCatalogo: PRECO_MENSAL,
      receitaBruta: arredondarMoeda(dre.receitaBruta),
      comissaoCakto: arredondarMoeda(dre.comissaoCakto),
      receitaLiquida: arredondarMoeda(dre.receitaLiquida),
      custoIA: arredondarMoeda(dre.custoIA),
      custoIAPagantes: arredondarMoeda(dre.custoIAPagantes),
      custoIAGratuitos: arredondarMoeda(dre.custoIAGratuitos),
      custoManual: arredondarMoeda(dre.custoManual),
      resultadoOperacional: arredondarMoeda(dre.resultadoOperacional),
      custos: dre.custos.map((c) => ({ ...c, valor: arredondarMoeda(c.valor) })),
    };
  },
};

const calcularAssinantesParaMeta: ResultadoLeitura = {
  tipo: "leitura",
  async executar(args) {
    const lucroDesejado = argNumero(args, "lucroDesejado");
    if (lucroDesejado === null) return { erro: "Informe o lucro operacional desejado, em reais." };

    const mes = argTexto(args, "mes") || undefined;
    const r = await calcularAssinantesParaLucro(lucroDesejado, mes);
    return {
      ...r,
      precoMensalCatalogo: PRECO_MENSAL,
      custoManualMes: arredondarMoeda(r.custoManualMes),
      margemPorAssinante: arredondarMoeda(r.margemPorAssinante),
    };
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
  calcular_assinantes_para_meta: calcularAssinantesParaMeta,
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
      name: "calcular_assinantes_para_meta",
      description: "Simula quantos assinantes ativos são necessários pra atingir um resultado operacional (lucro) desejado no mês, usando preço da assinatura, comissão da Cakto e custos reais do DRE. Use pra perguntas tipo 'quantos assinantes preciso pra ter R$X de lucro/resultado'. lucroDesejado=0 é o break-even.",
      parameters: {
        type: "object",
        properties: {
          lucroDesejado: { type: "number", description: "Resultado operacional mensal desejado, em reais. Use 0 pra break-even." },
          mes: { type: "string", description: "Mês no formato AAAA-MM. Se omitido, usa o mês atual." },
        },
        required: ["lucroDesejado"],
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
      description: "Lista clientes filtrados por status de assinatura. INATIVO = cliente gratuito/lead que nunca pagou — não existe status de 'pagamento pendente/recusado' no sistema hoje, não confunda os dois.",
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
      description: "Conta quantos clientes existem em cada status de assinatura (pago, cancelado, inativo). INATIVO = gratuito/lead, não 'pagamento pendente' (esse conceito não existe no sistema hoje).",
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
