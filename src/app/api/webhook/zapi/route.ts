// ─────────────────────────────────────────
// QuitaZAP — Webhook Z-API (mensagens recebidas)
// POST /api/webhook/zapi
// Suporta: texto, áudio (Whisper), imagem (GPT-4o Vision) e PDF (pdf-parse)
// ─────────────────────────────────────────

import { NextRequest, NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp, sendWhatsAppImage, normalizarTelefone, variacoesTelefone } from "@/lib/zapi";
import { processarMensagemIA, type Mensagem, type DividaIA } from "@/lib/ai-bot";
import {
  atualizarDespesasFixasControle,
  carregarEstadoControle,
  configurarCartaoControle,
  consultarCartoesControle,
  consultarSaldoControle,
  corrigirRendaControle,
  corrigirOrigemUltimoGastoControle,
  criarEstadoComConfirmacaoInterpretacaoFinanceira,
  criarMensagemEstadoControle,
  gerenciarFaturaCartaoControle,
  gerenciarDespesasFixasControle,
  registrarGastoControle,
  resolverValorGastoPendente,
  criarEstadoComPendenciaPagamentoDivida,
  respostaAguardarValorPagamentoDivida,
  resolverValorPagamentoDividaPendente,
  salvarItensConfirmadosIA,
  type EstadoControleFinanceiro,
  type ResultadoGastoControle,
} from "@/lib/controle-financeiro-flow";
import { sincronizarEstadoComMotorCentral } from "@/lib/controle-financeiro-sync";
import { classificarConfirmacaoIA } from "@/lib/ia/confirmacao-resolver";
import { detectarComandoModoLembrete, deliverReminder } from "@/lib/reminder-delivery";
import { detectarConsultaFinanceira, responderConsultaFinanceira } from "@/lib/ia/consulta-financeira-resolver";
import { detectarSimulacaoParcela, responderSimulacaoParcela } from "@/lib/ia/simulador-parcela-resolver";
import { detectarLimiteSeguro, responderLimiteSeguro } from "@/lib/ia/limite-seguro-resolver";
import { detectarRotaDividas, responderRotaDividas } from "@/lib/ia/rota-dividas-resolver";
import { detectarPlanoPagamento, detectarMetaPrazo, responderPlanoPagamento, responderMetaPrazo } from "@/lib/ia/plano-pagamento-resolver";
import { detectarConsultaVazamentos, responderConsultaVazamentos } from "@/lib/ia/vazamentos-resolver";
import { detectarHorasTrabalho, responderHorasTrabalho } from "@/lib/ia/horas-trabalho-resolver";
import { tentarResponderConsultaLivre } from "@/lib/ia/classificador-consulta-livre";
import { classificarLembreteLivreIA, devePularFallbackLembreteIA } from "@/lib/ia/tarefa-resolver";
import {
  persistirLancamentosControle,
  persistirCartaoControle,
  corrigirOrigemLancamentoControle,
  type OrigemLancamentoControle,
} from "@/lib/controle-financeiro-service";
import {
  persistirDividaConfirmadaIA,
  persistirPagamentoDividaConfirmadoIA,
  persistirMetaConfirmadaIA,
} from "@/lib/rescue-financeiro-service";
import {
  formatarPreviaIntentFinanceiro,
  intentFinanceiroConfirmavel,
  resolverLoteGastosCartao,
  resolverIntencaoFinanceiraIA,
} from "@/lib/ia/financeiro-intent-resolver";
import { MENSAGEM_FORA_ESCOPO_FINANCEIRO, type FinanceiroIntent, type TipoItemFinanceiro } from "@/lib/ia/financeiro-intent-schema";
import { extrairDadosServidorPublicoManual } from "@/lib/diagnostico-normalizer";
import { gerarRespostaDadosFolhaServidor, deveConfirmarDadosFolhaServidor } from "@/lib/servidor-publico-flow";
import { parseMoneyBR } from "@/lib/money";
import { normalizarRespostaCompraImagem, formatarValorBR } from "@/lib/gasto-flow";
import { transcreverAudio, analisarImagem } from "@/lib/ai/openai-client";
import {
  deveAguardarDespesasFixasControle,
  ETAPA_AGUARDANDO_DESPESAS_FIXAS,
  ETAPA_AGUARDANDO_GASTOS,
  extrairRendaControle,
  formatarMensagensDespesasFixasControle,
  mensagemExplicarDespesasFixasControle,
  mensagemPedidoDespesasFixasControle,
  mensagemRendaRegistradaControle,
  mensagensResetControle,
  pareceForaEscopoControle,
  pareceGastoVariavelControle,
  pareceReceitaAvulsaControle,
  parsearDespesasFixasControle,
  devePularDespesasFixasControle,
} from "@/lib/onboarding-controle";
import { processarLeadVendas } from "@/lib/sales-bot";
import { detectarComandoTarefa } from "@/lib/tarefa-flow";
import { processarComandoTarefa } from "@/lib/tarefa-service";
import {
  gerarResumoMensal,
  gerarResumoSemana,
  gerarDespesasMes,
  gerarListaComandos,
  gerarQuitaScore,
  calcularTotalParcelas,
} from "@/lib/plano";
import { urlPainelCobrador } from "@/lib/cobrador-token";
import { boletoValido, mensagemPreviaBoleto, detectarRespostaBoleto, salvarBoletoComoDivida, type BoletoDetectado } from "@/lib/boleto-flow";
import { comprovanteFotoValido, mensagemPreviaComprovante, detectarRespostaComprovante, type ComprovanteFotoDetectado } from "@/lib/comprovante-foto-flow";
import {
  faturaCartaoValida,
  hashPDF,
  hashJaProcessado,
  montarFaturaCartaoPendente,
  mensagemPerguntaAmbiguo,
  mensagemFaturaSemNovidade,
  mensagemResumoLote,
  mensagemLoteConfirmado,
  detectarRespostaFaturaCartao,
  salvarComprasParceladasFatura,
  type FaturaCartaoDetectada,
  type FaturaCartaoPendente,
} from "@/lib/fatura-cartao-flow";

// GIF de celebração quando o cliente avisa que pagou uma dívida
const GIF_PARABENS = "https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif";

// Garante que o tipo da dívida seja sempre um valor aceito por DividaIA
const TIPOS_DIVIDA_IA = ["CARTAO", "EMPRESTIMO", "FINANCIAMENTO", "CHEQUE_ESPECIAL", "CREDIARIO", "LOJA", "IMPOSTO", "ALUGUEL", "ASSOCIACAO", "OUTRO"] as const;
function normalizarTipoDividaIA(tipo: string | null | undefined): DividaIA["tipo"] {
  return (TIPOS_DIVIDA_IA as readonly string[]).includes(tipo ?? "")
    ? (tipo as DividaIA["tipo"])
    : "OUTRO";
}

// ── Prompt de análise de imagem via GPT-4o Vision ──
// (a chamada em si — fetch, custo, log — vive em @/lib/ai/openai-client)
const PROMPT_ANALISE_IMAGEM = `Analise esta imagem financeira. Pode ser:
- Boleto, fatura de cartão, extrato bancário, comprovante de empréstimo, carnê
- Contracheque, holerite, comprovante de salário ou folha de pagamento
- Recibo, nota fiscal ou cupom de uma COMPRA do dia a dia (mercado, farmácia, restaurante, loja, posto de gasolina, etc.)

Se for RECIBO, NOTA FISCAL ou CUPOM DE COMPRA (não é boleto, fatura, contracheque nem holerite — não tem valor de parcela mensal, vencimento futuro, nem é sobre salário/desconto em folha), extraia:
- Nome do estabelecimento (loja, mercado, restaurante etc.)
- Valor total pago

Responda EXATAMENTE nesse formato, numa frase só, sem mais nada — não inclua CNPJ, data, hora, número do pedido/cupom nem qualquer outro número além do valor total:
Comprei em [nome do estabelecimento], R$ [valor total]

Exemplo: Comprei em Mercado Extra, R$ 85,30

Se for CONTRACHEQUE ou HOLERITE, extraia:
- Nome do órgão ou empresa pagadora
- Cargo ou função
- Mês e ano de referência
- Total de vantagens
- Total de descontos
- Salário líquido
- Se houver 13º salário, abono, férias ou verba extraordinária, informe o valor e calcule o líquido normal sem esse extra

CLASSIFICAÇÃO DOS DESCONTOS EM FOLHA:

1. EMPRESTIMOS OU DESCONTOS PARCELADOS

Liste como emprestimos TODOS os descontos em folha que tenham formato NNN/NNN com total de parcelas menor que 900.

Isso inclui:
- Empréstimo comum
- Consignado
- Banco
- Financeira
- Crédito
- Benefício assistencial
- Auxílio assistencial
- Qualquer desconto parcelado com fim definido

Exemplos:
- Empréstimo Comum 3 - BANCO DIGIO S.A 027/120 304,00
  banco: BANCO DIGIO S.A
  parcelaAtual: 27
  totalParcelas: 120
  valorParcela: 304,00

- Benefício Assistencial - ASSEBA 015/036 306,89
  banco: ASSEBA
  parcelaAtual: 15
  totalParcelas: 36
  valorParcela: 306,89

- Benefício Assistencial - ASTEBA 017/036 320,63
  banco: ASTEBA
  parcelaAtual: 17
  totalParcelas: 36
  valorParcela: 320,63

2. ASSOCIACOES OU MENSALIDADES RECORRENTES

Liste como associacoes SOMENTE mensalidades ou associações recorrentes com formato NNN/999 ou NNN/000.

Exemplos:
- Mensalidade Valor - ASSEBA 015/999 80,00
  nome: ASSEBA
  valorMensal: 80,00

- Mensalidade Valor - ASTEBA 015/999 80,00
  nome: ASTEBA
  valorMensal: 80,00

- Mensalidade Valor - ASPRA-BA 113/999 87,00
  nome: ASPRA-BA
  valorMensal: 87,00

REGRA CRITICA:
- NNN/999 ou NNN/000 significa associação ou mensalidade recorrente
- NNN/036, NNN/048, NNN/060, NNN/096, NNN/120 ou qualquer total menor que 900 significa empréstimo ou desconto parcelado
- Nunca classifique Benefício Assistencial 015/036 como associação
- Benefício Assistencial com prazo finito deve entrar em emprestimos

Informe também:
- Margem comprometida
- Descontos de saúde
- Previdência
- Imposto de renda

Não inclua saúde, Planserv, assistência médica, previdência, INSS, SPSM, IPREV ou IR nos arrays emprestimos ou associacoes.

IMPORTANTE:
Os consignados e descontos parcelados já estão descontados no líquido.
Use o líquido normal sem 13º, férias ou abono como renda mensal recorrente.
Se houver verba extraordinária no mês, trate como dinheiro extra do mês, não como renda fixa mensal.

Se for BOLETO, FATURA ou DÍVIDA, extraia:
- Credor, banco ou loja
- Valor total da dívida ou da fatura
- Valor da parcela mensal
- Número de parcelas restantes
- Data de vencimento
- Se está em atraso

Responda assim:
Fatura Nubank de R$ 1.500 vencendo dia 15. Mínimo R$ 150.

Se a imagem NÃO for financeira, responda apenas: [NAO_FINANCEIRA]`;

// ── Tipos para extração de PDF ──────────────────────────────────────────

type EmprestimoConsig = {
  banco: string;
  valorParcela: number;
  parcelaAtual: number;
  totalParcelas: number;
};

type AssociacaoConsig = {
  nome: string;
  valorMensal: number;
};

type PDFContracheque = {
  tipo: "CONTRACHEQUE";
  orgao: string;
  salarioBruto: number;
  salarioLiquidoTotal: number;   // líquido que aparece no contracheque, pode incluir 13º
  extraOrdinario: number;        // total de 13º + férias + abonos, 0 se nenhum
  salarioLiquidoNormal: number;  // salário líquido recorrente sem verba extra
  emprestimos: EmprestimoConsig[];
  associacoes: AssociacaoConsig[];
};

type PDFBoleto = {
  tipo: "BOLETO";
  beneficiario: string;
  valor: number;
  vencimento: string; // YYYY-MM-DD
  linhaDigitavel: string | null;
};

type PDFParceladaFatura = {
  descricao: string;
  parcelaAtual: number;
  totalParcelas: number;
  valorParcela: number;
};

type PDFFaturaCartao = {
  tipo: "FATURA_CARTAO";
  emissor: string;
  vencimentoFatura: string; // YYYY-MM-DD
  parceladas: PDFParceladaFatura[];
};

type PDFOutro = {
  tipo: "OUTRO";
  texto: string;
};

type PDFResult = PDFContracheque | PDFBoleto | PDFFaturaCartao | PDFOutro;

// Contracheque continua pausado no MVP (motivo: erro nos valores extraídos
// em alguns formatos, ver mensagem de fallback abaixo) — mas boleto
// ("Boleto Inteligente") já está ativo, ver handler de tipoEntrada
// === "documento" mais abaixo.
// ── Upload de PDF para OpenAI Files API ──────────────────────────────────

async function uploadPDFOpenAI(pdfUrl: string): Promise<{ fileId: string; apiKey: string }> {
  const apiKey = process.env.OPENAI_API_KEY!;
  const res = await fetch(pdfUrl);
  if (!res.ok) throw new Error(`Falha ao baixar PDF: ${res.status}`);
  const buffer = await res.arrayBuffer();

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "application/pdf" }), "documento.pdf");
  form.append("purpose", "user_data");

  const uploadRes = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`OpenAI upload falhou ${uploadRes.status}: ${err}`);
  }
  const { id: fileId } = await uploadRes.json() as { id: string };
  return { fileId, apiKey };
}

async function deletePDFOpenAI(fileId: string, apiKey: string) {
  await fetch(`https://api.openai.com/v1/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch(() => {});
}

// ── Extração estruturada de PDF via GPT-4o ───────────────────────────────
// Para contracheques: retorna JSON estruturado (bypassa gpt-4o-mini)
// Para outros docs: retorna texto para processar normalmente

async function extrairPDF(pdfUrl: string): Promise<PDFResult> {
  const { fileId, apiKey } = await uploadPDFOpenAI(pdfUrl);

  try {
    const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [
            { type: "file", file: { file_id: fileId } },
            {
              type: "text",
              text: `Analise este documento. Se for um CONTRACHEQUE ou HOLERITE (folha de pagamento de servidor público ou funcionário), responda APENAS com este JSON (sem markdown):

{
  "tipo": "CONTRACHEQUE",
  "orgao": "nome do órgão/empresa",
  "salarioBruto": 0.00,
  "salarioLiquidoTotal": 0.00,
  "extraOrdinario": 0.00,
  "salarioLiquidoNormal": 0.00,
  "emprestimos": [
  { "banco": "BANCO OU CREDOR 1", "valorParcela": 250.00, "parcelaAtual": 12, "totalParcelas": 60 },
  { "banco": "BANCO OU CREDOR 2", "valorParcela": 180.50, "parcelaAtual": 8, "totalParcelas": 36 },
  { "banco": "ASSOCIACAO X - Benefício Assistencial", "valorParcela": 120.00, "parcelaAtual": 10, "totalParcelas": 36 }
],
"associacoes": [
  { "nome": "ASSOCIACAO X", "valorMensal": 80.00 },
  { "nome": "ASSOCIACAO Y", "valorMensal": 65.00 }
]
}

Regras para o JSON:

REGRAS DE SALÁRIO, LÍQUIDO E VERBA EXTRA:

- salarioLiquidoTotal = valor líquido final impresso no contracheque. É o valor que caiu ou cairá na conta naquele mês.

- salarioBruto = total de vantagens, vencimentos ou proventos antes dos descontos.

- extraOrdinario = soma dos valores nas VANTAGENS que sejam verba não recorrente, como:
  13º salário
  adiantamento de 13º
  décimo terceiro
  férias
  abono
  diferença eventual
  parcela única
  verba extraordinária

- REGRA CRÍTICA DO 13º:
  Se existir uma linha nas VANTAGENS com "13", "13º", "13°", "décimo terceiro", "decimo terceiro", "adiantamento 13", "1ª parcela 13" ou texto equivalente, use o valor integral dessa linha como extraOrdinario.

- Nunca calcule extraOrdinario por diferença entre bruto, descontos, margem ou líquido.

- O extraOrdinario deve vir diretamente da linha de VANTAGEM extraordinária.

- salarioLiquidoNormal = salarioLiquidoTotal - extraOrdinario.

- Se não houver 13º, férias, abono ou verba extraordinária, então extraOrdinario = 0 e salarioLiquidoNormal = salarioLiquidoTotal.

- Nunca coloque salarioLiquidoNormal igual ao salarioLiquidoTotal quando houver 13º, férias, abono ou verba extraordinária.

- O salarioLiquidoTotal representa o dinheiro disponível somente neste mês.

- O salarioLiquidoNormal representa a base recorrente dos próximos meses.

REGRAS DE EMPRÉSTIMOS E ASSOCIAÇÕES:

- emprestimos: percorra TODAS as linhas de DESCONTOS do contracheque. Sempre que encontrar um padrão de parcela NNN/NNN e o total de parcelas for menor que 900, inclua essa linha em emprestimos.

- O formato NNN/NNN significa:
  parcelaAtual = os 3 primeiros números antes da barra
  totalParcelas = os 3 números depois da barra

- O valorParcela é o valor em reais no final da mesma linha.

- Inclua em emprestimos qualquer desconto parcelado com prazo finito, mesmo que o nome não seja banco. Isso inclui descrições como:
  Empréstimo
  Emprestimo
  Consignado
  Banco
  Financeira
  Crédito
  Credito
  Benefício Assistencial
  Beneficio Assistencial
  Auxílio Assistencial
  Auxilio Assistencial
  Desconto parcelado

- Se houver várias linhas com o mesmo banco ou credor, registre TODAS separadamente. Não junte, não some e não omita linhas repetidas.

- associacoes: percorra TODAS as linhas de DESCONTOS do contracheque. Sempre que encontrar mensalidade ou associação com padrão NNN/999 ou NNN/000, inclua em associacoes.

- NNN/999 ou NNN/000 significa mensalidade recorrente ou associação sem prazo definido.

- Nunca classifique como associacao um item com prazo finito, como NNN/012, NNN/024, NNN/036, NNN/048, NNN/060, NNN/072, NNN/096, NNN/120 ou qualquer total menor que 900.

- Regra decisiva:
  Se totalParcelas < 900 → emprestimos
  Se totalParcelas = 999 ou 000 → associacoes

- Para definir o nome:
  Se a linha tiver hífen, use o texto depois do último hífen como credor principal.
  Exemplo genérico: "Empréstimo Comum - BANCO X 012/060 250,00" → banco = "BANCO X"
  Exemplo genérico: "Benefício Assistencial - ASSOCIAÇÃO X 010/036 120,00" → banco = "ASSOCIAÇÃO X - Benefício Assistencial"
  Exemplo genérico: "Mensalidade Valor - ASSOCIAÇÃO X 015/999 80,00" → nome = "ASSOCIAÇÃO X"

- NÃO incluir IR, imposto de renda, previdência, INSS, SPSM, IPREV, Planserv, assistência médica, plano de saúde, auxílio transporte ou auxílio alimentação nos arrays emprestimos ou associacoes.

- Só inclua uma linha nesses arrays se ela for claramente:
  1. desconto parcelado com NNN/NNN e totalParcelas menor que 900; ou
  2. mensalidade/associação recorrente com NNN/999 ou NNN/000.

VALIDAÇÃO FINAL ANTES DE RESPONDER:

- Confira se salarioLiquidoNormal + extraOrdinario = salarioLiquidoTotal.
- Se houver verba extra e essa conta não fechar, revise os valores antes de responder.
- Confira se todas as linhas de desconto com NNN/NNN e totalParcelas menor que 900 foram incluídas em emprestimos.
- Confira se todas as linhas com NNN/999 ou NNN/000 foram incluídas em associacoes.
- Responda somente com JSON válido.

Se for um BOLETO BANCÁRIO (título de cobrança com linha digitável/código de barras — conta, fatura, carnê, guia — não confundir com contracheque), responda APENAS com este JSON (sem markdown):

{ "tipo": "BOLETO", "beneficiario": "nome de quem recebe o pagamento", "valor": 0.00, "vencimento": "AAAA-MM-DD", "linhaDigitavel": "00000.00000 00000.000000 00000.000000 0 00000000000000" }

Regras para o boleto:
- beneficiario: nome do cedente/beneficiário impresso no boleto (quem vai receber o pagamento), nunca o nome do pagador/sacado.
- valor: o valor total do documento (campo "Valor do documento" ou "Valor cobrado"), sempre número, nunca string.
- vencimento: data de vencimento no formato AAAA-MM-DD. Se não conseguir ler a data com certeza, use null.
- linhaDigitavel: a linha digitável completa (os números abaixo do código de barras), como texto, mantendo os espaços. Se não conseguir ler com certeza, use null — nunca invente números.
- Se não conseguir extrair valor OU vencimento com confiança, responda com tipo "OUTRO" em vez de arriscar um valor errado.

Se for uma FATURA DE CARTÃO DE CRÉDITO (documento com lista de compras do mês, geralmente com nome do banco/cartão, valor total da fatura e data de vencimento — não confundir com boleto avulso nem contracheque), responda APENAS com este JSON (sem markdown):

{
  "tipo": "FATURA_CARTAO",
  "emissor": "nome popular do banco ou cartão",
  "vencimentoFatura": "AAAA-MM-DD",
  "parceladas": [
    { "descricao": "nome da compra/loja", "parcelaAtual": 3, "totalParcelas": 10, "valorParcela": 299.90 }
  ]
}

Regras para a fatura de cartão:
- emissor: o nome popular/comercial do banco ou cartão, como o cliente reconheceria (ex: "Nubank", "Itaú", "Inter", "C6 Bank", "Bradesco") — NUNCA a razão social legal (ex: nunca "NU PAGAMENTOS S.A.", nunca CNPJ).
- vencimentoFatura: a data de VENCIMENTO da fatura (não a de fechamento), formato AAAA-MM-DD. Se não conseguir ler com certeza, use null.
- IMPORTANTE — cobertura completa: percorra TODAS as seções de lançamentos do documento (normalmente "Transações"/"Compras" E também "Pagamentos e Financiamentos"/"Parcelamentos" quando existirem como seções separadas — Pix parcelado no crédito, empréstimo ou financiamento pelo cartão também contam, não são só "compras em loja"), linha por linha, do início ao fim, mesmo em documentos com várias páginas. NUNCA pule ou deduplique uma linha só porque o nome se repete: é comum a MESMA loja/pessoa aparecer várias vezes na fatura com parcelamentos DIFERENTES e não relacionados (ex: "Loja X - Parcela 2/2" e, em outra linha, "Loja X - Parcela 1/3") — trate cada linha como uma compra independente e avalie cada uma pela própria fração impressa, nunca pelo que outra linha do mesmo nome mostrou.
- parceladas: liste TODA compra/lançamento com parcelamento explicitamente impresso no documento, no formato "parcela X/Y", "X de Y" ou equivalente, onde ainda restam parcelas futuras (Y maior que X). NUNCA inclua:
  - compra à vista (sem nenhuma indicação de parcelamento) — não gera compromisso futuro;
  - compra cuja parcela atual já é a última (X igual a Y) — nada de futuro a lançar;
  - qualquer parcelamento que você tenha que INFERIR ou ADIVINHAR — se X e Y não estiverem explicitamente impressos na linha da compra, não inclua essa compra na lista, mesmo que pareça parcelada pelo nome da loja.
- descricao: nome da loja/pessoa/compra, sem incluir o texto da parcela (ex: "Magazine Luiza", nunca "Magazine Luiza 03/10").
- parcelaAtual/totalParcelas: números inteiros, exatamente como impressos (ex: "03/10" → parcelaAtual=3, totalParcelas=10).
- valorParcela: valor da parcela impresso na linha daquela compra (quando a linha mostrar "total a pagar" da parcela com juros/IOF embutido, use esse total — é o valor que realmente vai cobrar do cliente), sempre número.
- Antes de responder, revise sua própria lista contra o documento mais uma vez: confira se todo "X/Y" com Y maior que X que aparece em QUALQUER seção de lançamentos da fatura está presente na lista, incluindo casos de nomes repetidos.
- Se não conseguir identificar o emissor OU a data de vencimento com confiança, responda com tipo "OUTRO" em vez de arriscar.

Se não for contracheque, boleto nem fatura de cartão (for extrato bancário, comprovante avulso, etc), responda com:
{ "tipo": "OUTRO", "texto": "descrição do documento em português" }`,
            },
          ],
        }],
       temperature: 0,
max_tokens: 2000,
response_format: { type: "json_object" },
      }),
    });

    if (!chatRes.ok) {
      const err = await chatRes.text();
      throw new Error(`GPT-4o PDF erro ${chatRes.status}: ${err}`);
    }
    const chatData = await chatRes.json() as { choices: { message: { content: string } }[] };
    const raw = chatData.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw) as PDFResult;
    // Não loga valor/linha digitável/beneficiário em claro (dado financeiro
    // sensível) — só o suficiente pra depurar qual ramo foi tomado.
    console.log(`[PDF] tipo="${parsed.tipo}"`, parsed.tipo === "CONTRACHEQUE"
      ? `emp=${parsed.emprestimos.length} assoc=${parsed.associacoes.length}`
      : parsed.tipo === "BOLETO"
        ? `temLinhaDigitavel=${parsed.linhaDigitavel != null}`
        : parsed.tipo === "FATURA_CARTAO"
          ? `parceladas=${parsed.parceladas?.length ?? 0}`
          : "");
    return parsed;

  } finally {
    await deletePDFOpenAI(fileId, apiKey);
  }
}

// ── Monta DiagnosticoIA diretamente do contracheque (sem gpt-4o-mini) ────

function buildDiagContracheque(dados: PDFContracheque, nome: string): import("@/lib/ai-bot").DiagnosticoIA {
  const liquidoNormal = dados.salarioLiquidoNormal > 0
    ? dados.salarioLiquidoNormal
    : dados.salarioLiquidoTotal;

  const dividas: import("@/lib/ai-bot").DiagnosticoIA["dividas"] = [
    ...dados.emprestimos.map((e) => ({
      credor: e.banco,
      tipo: "EMPRESTIMO" as const,
      valorOriginal: e.valorParcela * e.totalParcelas,
      saldoAtual: e.valorParcela * Math.max(e.totalParcelas - e.parcelaAtual, 0),
      valorParcela: e.valorParcela,
      totalParcelas: e.totalParcelas,
      parcelasRestantes: Math.max(e.totalParcelas - e.parcelaAtual, 1),
      emAtraso: false,
    })),
    ...dados.associacoes.map((a) => ({
      credor: a.nome,
      tipo: "ASSOCIACAO" as const,
      valorOriginal: 0,
      saldoAtual: 0,
      valorParcela: a.valorMensal,
      totalParcelas: 999,
      parcelasRestantes: 999,
      emAtraso: false,
    })),
  ];

  return {
    dadosPessoais: { nome, vinculo: "SERVIDOR_PUBLICO", profissao: dados.orgao },
    renda: {
      salarioLiquido: liquidoNormal,
      totalFamiliar: liquidoNormal,
      salarioLiquidoComExtras: dados.extraOrdinario > 0 ? dados.salarioLiquidoTotal : undefined,
      adiantamento13: dados.extraOrdinario > 0 ? dados.extraOrdinario : undefined,
    },
    despesasFixas: [],
    despesasVariaveis: [],
    dividas,
    cartoes: [],
    emprestimos: [],
    patrimonio: {},
    objetivos: { objetivoPrincipal: "QUITAR_DIVIDAS" },
    alertas: {},
  };
}

// ── Detecção de comandos rápidos ──────────
function detectarComando(msg: string): string | null {
  // Remove acentos para comparação robusta
  const m = msg
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/resumo|saldo do mes|resumo do mes|resumo simples|como (ta|esta|tá|está) (meu )?mes|situacao do mes/.test(m)) return "RESUMO_MES";
  if (/despesas? do mes|quanto devo por mes|minhas despesas|o que (tenho|preciso) pagar|minhas contas/.test(m)) return "DESPESAS_MES";
  if (/quanto preciso (ganhar|faturar)|receita da semana|preciso ganhar|quanto tenho que ganhar|meta (da|semanal)/.test(m)) return "RECEITA_SEMANA";
  if (/posso gastar quanto|quanto posso gastar|quanto sobra essa semana|quanto (tenho|to) livre/.test(m)) return "GASTAR_SEMANA";
  if (/^(ajuda|comandos|menu|help|oi|ola|o que voce faz|o que posso (perguntar|pedir|fazer|solicitar)|o que (vc|voce) (faz|pode)|quais (sao|são)?(os )?comandos|como (funciona|usar))/.test(m)) return "AJUDA";
  if (/^(resete|resetar|reiniciar|recomecar|comecar de novo|apagar tudo|novo inicio|limpar|zerar|começar do zero)/.test(m)) return "RESETAR";
  if (/^cobrar?\s+\S/.test(m)) return "COBRAR";
  if (/minhas cobran[cç]as|ver cobran[cç]as|lista de cobran[cç]as|quem me deve|quem nao (pagou|pago)|devedores/.test(m)) return "VER_COBRANCAS";
  if (/meu painel|meu dashboard|abrir painel|painel cobrador|link (do )?painel|meu link/.test(m)) return "MEU_PAINEL";
  if (/paguei|ja paguei|ja quitei|quitei|paga a|paguei a|terminei de pagar|efetuei o pagamento|liquidei|quitando/.test(m)) return "PAGUEI";

  // Diagnóstico / relatório financeiro
  // Tem que ficar ANTES do QUITASCORE para não confundir diagnóstico com score.
  if (
    /diagnostico|meu diagnostico|gerar diagnostico|diagnostico financeiro|relatorio|meu relatorio|relatorio financeiro|meu plano financeiro|plano financeiro|enviar diagnostico|manda meu diagnostico|cad[eê] meu diagnostico/.test(m)
  ) return "DIAGNOSTICO";

  if (/quita.?score|meu score|ver (meu )?score|score financeiro|saude financeira|minha saude financeira|meu (indice|index|pontu|nota financ)|como (estou|ta|está) (financ|meu score|meu quita)|pontuacao financ/.test(m)) return "QUITASCORE";

  // Desfazer/apagar o último lançamento — rede de segurança pro registro
  // automático sem confirmação (sugestão do debate com o ChatGPT, set/2026):
  // como agora o bot lança direto quando está confiante, o custo de um erro
  // precisa ser baixo — "desfazer" tem que ser tão fácil quanto mandar o
  // lançamento errado foi. Ancorado no início da frase (como RESETAR) pra
  // não disparar em qualquer texto que contenha essas palavras soltas.
  if (
    /^(desfaz(er)?|apaga(r)?\s+(isso|esse|essa|o ultimo|a ultima)|cancela(r)?\s+(o ultimo lancamento|essa despesa|esse gasto|essa receita|o ultimo gasto|o ultimo registro)|errei|foi engano|nao foi isso|nao era isso)\b/.test(m)
  ) return "DESFAZER_LANCAMENTO";

  return null;
}

// ── Parseia comando "cobrar" com GPT ──────
async function parsearComandoCobrar(mensagem: string): Promise<{
  devedorNome: string;
  devedorFone: string;
  valor: number;
  diaVencimento: number;
  enviarAgora: boolean;
  mensagemCustom?: string;
  pixChave?: string;
  camposFaltando?: string[];
} | null> {
  const apiKey = process.env.OPENAI_API_KEY!;
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const anoAtual = hoje.getFullYear();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você extrai dados de cobranças financeiras enviadas pelo WhatsApp em português. Hoje é ${hoje.toLocaleDateString("pt-BR")} (dia ${hoje.getDate()}, mês ${mesAtual}/${anoAtual}).

Responda APENAS com JSON válido no formato:
{
  "devedorNome": "Nome da pessoa que deve (null se não informado)",
  "devedorFone": "55DDD+número com 13 dígitos (null se não informado)",
  "valor": 500.00,
  "diaVencimento": 20,
  "enviarAgora": false,
  "mensagemCustom": "mensagem personalizada ou null",
  "pixChave": "chave pix ou null",
  "camposFaltando": []
}

Regras:
- devedorFone: apenas dígitos, sempre com DDI 55. Ex: "71999999999" → "5571999999999". Se não mencionado, use null.
- valor: número decimal. "R$500" → 500.0, "1.500,00" → 1500.0. Se não mencionado, use 0.
- diaVencimento: dia do mês (1-31). "dia 20" → 20. Se não mencionado, use ${hoje.getDate() + 1}.
- enviarAgora: true se o usuário disse "agora", "hoje", "já", "manda agora", "envia agora". false caso contrário.
- mensagemCustom: texto entre aspas ou após "mensagem:", "aviso:", "escreva:". null se não informado.
- pixChave: chave pix do CREDOR (quem está cobrando) para o devedor efetuar o pagamento. Pode ser CPF, CNPJ, e-mail, telefone ou chave aleatória. Palavras-chave: "pix:", "minha chave", "chave pix". null se não informado.
- camposFaltando: lista de campos ausentes entre ["nome", "telefone", "valor"]. Nunca inclua "diaVencimento" nem "pixChave" — são opcionais.

Exemplos:
"cobrar João 71999999999 500 dia 20" → devedorNome:"João", devedorFone:"5571999999999", valor:500, camposFaltando:[]
"cobrar o Pedro" → devedorNome:"Pedro", devedorFone:null, valor:0, camposFaltando:["telefone","valor"]
"cobrar Ana, 11987654321, R$300, mensagem: Aninha, não esquece!" → devedorNome:"Ana", valor:300, mensagemCustom:"Aninha, não esquece!"
"cobrar João, 71999999999, R$500, dia 20, pix: 123.456.789-00" → pixChave:"123.456.789-00"
"cobrar Maria, 71988887777, R$200, minha chave pix é joao@email.com" → pixChave:"joao@email.com"`,
        },
        { role: "user", content: mensagem },
      ],
      max_tokens: 300,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    console.error(`[COBRAR] GPT parse erro ${res.status}`);
    return null;
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "{}";

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.devedorNome) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Meia-noite de hoje em Brasília (fixo UTC-3) — mesma técnica de
// limitesDoMes em motor.ts, usada aqui só pra janela do detector de
// lançamento duplicado.
function inicioDoDiaBrasil(agora: Date): Date {
  const [ano, mes, dia] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(agora)
    .split("-")
    .map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia, 3, 0, 0, 0));
}

// ── Deduplicação de mensagens ─────────────
// O carimbo de "já processado" é gravado ANTES do processamento em si (não dá
// pra marcar só no fim — a função tem dezenas de `return` espalhados pelo
// fluxo). Por isso, nas duas camadas, "já processei" só vale por uma janela
// curta: se o processamento anterior falhou (erro 500, timeout) e a Z-API
// reenviar o mesmo webhook depois da janela, deixa passar de novo em vez de
// bloquear a mensagem pra sempre.
const JANELA_DEDUPE_MS = 10 * 60 * 1000; // 10 minutos, nas duas camadas

// Camada 1: Map em memória (rápido, mas não sobrevive a cold start nem
// funciona entre múltiplas instâncias serverless). Guarda o instante em que
// viu cada messageId — sem isso, uma instância "quente" reteria o ID
// indefinidamente (até ser expulso pelo limite de 500), reproduzindo o mesmo
// bloqueio permanente que a janela de expiração existe pra evitar.
const mensagensProcessadas = new Map<string, number>();
function jáProcessou(id: string): boolean {
  if (!id) return false;
  const agora = Date.now();
  const vistoEm = mensagensProcessadas.get(id);
  if (vistoEm !== undefined && agora - vistoEm < JANELA_DEDUPE_MS) return true;
  // Map preserva ordem de inserção, não de atualização — ao renovar uma chave
  // existente, remove e reinsere pra ela ir pro fim (senão a expulsão por
  // tamanho abaixo pode derrubar uma entrada recém-vista antes de uma velha).
  mensagensProcessadas.delete(id);
  mensagensProcessadas.set(id, agora);
  if (mensagensProcessadas.size > 500) {
    const primeiraChave = mensagensProcessadas.keys().next().value;
    if (primeiraChave !== undefined) mensagensProcessadas.delete(primeiraChave);
  }
  return false;
}

// Camada 2: tabela MensagemProcessada (só é consultada quando a camada 1 diz
// "não vi essa antes" — cobre cold start / múltiplas instâncias). Qualquer
// erro aqui (tabela ainda não migrada, banco fora do ar) é tratado como
// "não é duplicata" — essa camada nunca pode bloquear uma mensagem legítima.
// A renovação do carimbo velho usa updateMany com filtro de data (atômico no
// banco) em vez de ler-e-depois-escrever, pra duas requisições concorrentes
// do mesmo messageId vencido não conseguirem "renovar" as duas ao mesmo tempo.
async function jáProcessouPersistente(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    await prisma.mensagemProcessada.create({ data: { messageId: id } });
    return false;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      const cutoff = new Date(Date.now() - JANELA_DEDUPE_MS);
      try {
        const renovado = await prisma.mensagemProcessada.updateMany({
          where: { messageId: id, criadoEm: { lt: cutoff } },
          data: { criadoEm: new Date() },
        });
        // count === 0: ou ainda está dentro da janela (duplicata de verdade),
        // ou outra requisição concorrente já reivindicou a renovação primeiro —
        // nos dois casos, essa aqui deve recuar e tratar como duplicata.
        return renovado.count === 0;
      } catch (erroRenovacao) {
        // Erro na renovação (não no create) não pode virar "é duplicata" por
        // padrão — mantém a garantia de nunca bloquear mensagem legítima.
        console.warn("[Z-API] Falha ao renovar carimbo de duplicata (seguindo só com a checagem em memória):", erroRenovacao);
        return false;
      }
    }
    console.warn("[Z-API] Checagem persistente de duplicata falhou (seguindo só com a checagem em memória):", err);
    return false;
  }
}

// Decisão do Ibrahim (set/2026): o bot deixou de "conduzir diálogo" pra
// registrar qualquer coisa — ele deve interpretar e já lançar direto,
// sem perguntar "confirma?", DESDE QUE a interpretação seja confiável.
// Só mensagem genuinamente confusa/ambígua (confiança baixa) ainda passa
// pelo fluxo de confirmação por texto (1-Sim / 2-Não). O corte abaixo
// separa os dois casos usando o campo `confianca` que todo FinanceiroIntent
// já carrega (resolvedores locais ficam quase todos entre 0.75 e 0.95; só
// os casos propositalmente incertos — ex.: pagamento de dívida sem credor
// identificado — ficam abaixo disso e continuam pedindo confirmação).
//
// Revisão feita em debate com ChatGPT (set/2026): um único corte de
// confiança pra qualquer tipo de lançamento trata "errei a categoria de um
// gasto de mercado" com a mesma gravidade de "errei se é dívida nova ou
// pagamento de dívida existente" — o segundo caso é bem mais caro de errar
// sozinho (mexe em saldo/dívida de forma mais permanente e mais difícil do
// cliente perceber o erro de relance). Por isso, lançamentos de tipos de
// maior risco (dívida, pagamento de dívida, meta, configuração de cartão,
// transferência) exigem uma confiança mais alta pra auto-registrar; os
// demais (despesa/receita do dia a dia — o grosso do volume) seguem no
// limiar original.
const LIMIAR_CONFIANCA_AUTO_REGISTRO = 0.75;
const LIMIAR_CONFIANCA_AUTO_REGISTRO_ALTO_RISCO = 0.85;
const TIPOS_ALTO_RISCO_AUTO_REGISTRO = new Set<TipoItemFinanceiro>([
  "divida",
  "pagamento_divida",
  "meta",
  "cartao",
  "transferencia",
]);

function podeAutoRegistrarIntentFinanceiro(intent: FinanceiroIntent): boolean {
  const limiar = intent.itens.some((item) => TIPOS_ALTO_RISCO_AUTO_REGISTRO.has(item.tipo))
    ? LIMIAR_CONFIANCA_AUTO_REGISTRO_ALTO_RISCO
    : LIMIAR_CONFIANCA_AUTO_REGISTRO;
  return intent.confianca >= limiar;
}

// Aplica no webhook o mesmo conjunto de persistências que o fluxo de
// confirmação por texto ("1-Sim") já fazia — reaproveitado aqui pra
// registrar direto, sem esperar a resposta do cliente, quando a
// interpretação é confiável o suficiente (ver podeAutoRegistrarIntentFinanceiro).
async function registrarIntentFinanceiroDireto(
  sessao: { id: string; clienteId: string | null },
  telefone: string,
  mensagem: string,
  servidorHistoricoSessao: Array<{ role: string; content?: string | null }>,
  estadoAtual: EstadoControleFinanceiro,
  intent: FinanceiroIntent,
  origemLancamentoControle: OrigemLancamentoControle,
  comprovanteUrlImagem: string | undefined
): Promise<void> {
  const resultado = salvarItensConfirmadosIA(estadoAtual, intent);

  await sendWhatsApp(telefone, resultado.resposta);

  await prisma.botSessao.updateMany({
    where: { id: sessao.id },
    data: {
      dividasTemp: JSON.stringify([
        ...servidorHistoricoSessao,
        { role: "user", content: mensagem },
        { role: "assistant", content: resultado.resposta },
        ...(resultado.atualizouEstado ? [criarMensagemEstadoControle(resultado.estado)] : []),
      ]),
    },
  });

  after(() => persistirLancamentosControle(sessao.clienteId, resultado.itensParaPersistir, origemLancamentoControle, comprovanteUrlImagem));
  after(() => persistirCartaoControle(sessao.clienteId, resultado.cartaoParaPersistir));
  after(() => persistirDividaConfirmadaIA(sessao.clienteId, resultado.dividaParaPersistir));
  after(() => persistirPagamentoDividaConfirmadoIA(sessao.clienteId, telefone, resultado.pagamentoDividaParaPersistir));
  after(() => persistirMetaConfirmadaIA(sessao.clienteId, telefone, resultado.metaParaPersistir));
}

// Os dois wrappers abaixo mantêm gerenciarDespesasFixasControle e
// gerenciarFaturaCartaoControle 100% síncronos e puros (testados em massa
// nos testes de regressão) — a chamada de IA só entra aqui, na camada
// assíncrona do webhook, e só quando já existe uma confirmação pendente e
// a resposta não bateu no formato exato esperado ("sim"/"1"/"confirmar"...).
// Nesse caso, a IA classifica a mensagem livre ("beleza pode ser") e a
// gente re-chama a função original já normalizada pro texto que ela
// reconhece, em vez de duplicar a lógica de confirmação aqui.
async function gerenciarDespesasFixasComFallbackIA(
  mensagem: string,
  estado: EstadoControleFinanceiro
): Promise<ResultadoGastoControle | null> {
  const resultado = gerenciarDespesasFixasControle(mensagem, estado);
  // processarConfirmacaoPendenteDespesaFixa só resolve estes 3 tipos de
  // pendência — "substituir_fatura_fechada" é tratado só por
  // gerenciarFaturaCartaoComFallbackIA. Checar o tipo (em vez de só
  // truthiness) evita chamar a IA à toa em toda mensagem enquanto uma
  // pendência de fatura estiver aberta, mesmo pra respostas exatas como "sim".
  const pendenteResolvivelAqui =
    estado.confirmacaoPendente &&
    estado.confirmacaoPendente.tipo !== "substituir_fatura_fechada";
  if (resultado || !pendenteResolvivelAqui) return resultado;

  const classificacao = await classificarConfirmacaoIA(mensagem);
  if (!classificacao) return null;

  return gerenciarDespesasFixasControle(classificacao === "confirmar" ? "sim" : "não", estado);
}

async function gerenciarFaturaCartaoComFallbackIA(
  mensagem: string,
  estado: EstadoControleFinanceiro
): Promise<ResultadoGastoControle | null> {
  const resultado = gerenciarFaturaCartaoControle(mensagem, estado);
  if (resultado || estado.confirmacaoPendente?.tipo !== "substituir_fatura_fechada") return resultado;

  const classificacao = await classificarConfirmacaoIA(mensagem);
  if (!classificacao) return null;

  return gerenciarFaturaCartaoControle(classificacao === "confirmar" ? "sim" : "não", estado);
}

// ── Webhook principal ─────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Ignora mensagens enviadas pelo próprio bot
    if (body.fromMe === true) return NextResponse.json({ ok: true });

    // Ignora duplicatas (Z-API pode enviar o mesmo webhook 2x)
    const msgId = body.messageId ?? body.message?.messageId ?? "";
    if (msgId) {
      if (jáProcessou(msgId)) {
        console.log(`[Z-API] Duplicata ignorada (memória): ${msgId}`);
        return NextResponse.json({ ok: true });
      }
      if (await jáProcessouPersistente(msgId)) {
        console.log(`[Z-API] Duplicata ignorada (banco): ${msgId}`);
        return NextResponse.json({ ok: true });
      }
    }

    // Tipo de entrada: texto, áudio ou imagem
    let mensagem = "";
    let tipoEntrada = "texto";

    if (body.type === "ReceivedCallback") {
      if (body.text?.message) {
        mensagem = body.text.message.trim();
        tipoEntrada = "texto";
      } else if (body.audio?.audioUrl) {
        tipoEntrada = "audio";
      } else if (body.image?.imageUrl) {
        tipoEntrada = "imagem";
      } else if (body.document?.documentUrl) {
        tipoEntrada = "documento";
      }
    }

    // Usado só pelo Lancamento (dashboard "Minha Conta") — o restante do
    // fluxo de Controle continua distinguindo só por tipoEntrada.
    // `let` (não `const`): quando um comprovante de foto pendente é
    // confirmado por uma mensagem de TEXTO separada ("sim"), reatribuímos os
    // dois abaixo pra "FOTO"/URL original — ver bloco de confirmação de
    // comprovanteFotoPendente mais adiante.
    let origemLancamentoControle: OrigemLancamentoControle =
      tipoEntrada === "audio" ? "AUDIO" : tipoEntrada === "imagem" ? "FOTO" : "TEXTO";

    // URL da própria imagem enviada no WhatsApp/Z-API, salva junto do
    // Lancamento como comprovante visual quando o gasto veio de foto.
    // Limitação aceita: é a URL original da Z-API, não uma cópia hospedada
    // por nós — se ela expirar (a Z-API não garante que fica acessível pra
    // sempre), o comprovante para de abrir. Resolver direito exigiria subir
    // a imagem pra um storage próprio (ex: Supabase Storage), com credencial
    // nova (service role key) que não temos configurada.
    let comprovanteUrlImagem: string | undefined =
      tipoEntrada === "imagem" ? body.image?.imageUrl : undefined;

    if (!mensagem && tipoEntrada === "texto") return NextResponse.json({ ok: true });

    const rawPhone = body.phone ?? "";
    const telefone = normalizarTelefone(rawPhone);
    console.log(`[Z-API] phone raw="${rawPhone}" normalizado="${telefone}" tipo="${tipoEntrada}"`);
    if (telefone.length < 10) return NextResponse.json({ ok: true });

    const variacoes = variacoesTelefone(telefone);

    const sessao = await prisma.botSessao.findFirst({
      where: { telefone: { in: variacoes } }
    });

    console.log(`[Z-API] sessao=${sessao ? `id=${sessao.id} etapa=${sessao.etapa}` : "null"}`);

    if (!sessao) {
      // Verifica se é cliente cadastrado (sem sessão de bot ativa)
      const clienteCadastrado = await prisma.cliente.findFirst({
        where: { telefone: { in: variacoes } },
        select: { id: true },
      });

      if (clienteCadastrado) {
        // Cliente existe mas sem sessão bot — provavelmente precisa reativar
        await sendWhatsApp(
          telefone,
          `Olá! 👋 Para reativar seu acesso ao QuitaZAP, entre em contato com o suporte. 😊`
        );
      } else {
        // Número desconhecido → funil de vendas
        // Busca lead existente para garantir que usamos o telefone no formato correto
        const leadExistente = await prisma.leadVendas.findFirst({
          where: { telefone: { in: variacoes } },
          select: { telefone: true },
        });
        const telefoneParaFunil = leadExistente?.telefone ?? telefone;
        console.log(`[FUNIL] raw="${rawPhone}" norm="${telefone}" alt="${variacoes[1] ?? "null"}" leadExistente="${leadExistente?.telefone ?? "null"}" → usando="${telefoneParaFunil}"`);
        await processarLeadVendas(telefoneParaFunil, mensagem);
      }
      return NextResponse.json({ ok: true });
    }

    // ── Verifica assinatura vencida (só para clientes pagantes) ──
    // isGratuito hoisted (não só const do bloco) porque telemetria de IA
    // do áudio/imagem abaixo (transcreverAudio/analisarImagem) também
    // precisa dele.
    let isGratuito = false;
    if (sessao.clienteId) {
      const clienteAtual = await prisma.cliente.findUnique({
        where: { id: sessao.clienteId },
        select: { assinaturaVenceEm: true, gratuito: true, isTeste: true },
      });
      const venceEm = clienteAtual?.assinaturaVenceEm;
      isGratuito = clienteAtual?.gratuito ?? false;

      // Bug de teste achado ao vivo (09/09/2026): conta isTeste=true não
      // era isenta desse bloqueio — sempre que a assinatura "de mentira"
      // dela vencia (ela nunca é renovada de verdade), toda mensagem de
      // teste passava a cair silenciosamente aqui e retornar ok:true sem
      // NUNCA chegar em nenhum fluxo de verdade, fazendo qualquer teste
      // nessa conta parecer "não fez nada" sem erro nenhum. Cliente de
      // teste deve simular uma conta paga funcionando, independente do
      // relógio de cobrança — mesmo espírito de `gratuito`.
      if (!isGratuito && !clienteAtual?.isTeste && venceEm && venceEm < new Date()) {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "nosso site";
        await sendWhatsApp(
          telefone,
          `⚠️ Sua assinatura do QuitaZAP venceu em ${venceEm.toLocaleDateString("pt-BR")}.\n\nPara continuar acessando seu plano financeiro, renove pelo link:\n👉 ${siteUrl}\n\nSe já renovou, aguarde alguns minutos e tente novamente. 😊`
        );
        return NextResponse.json({ ok: true });
      }
    }

    // ── Processa áudio ───────────────────────
    if (tipoEntrada === "audio") {
      try {
        await sendWhatsApp(sessao.telefone, "🎤 Recebi seu áudio! Transcrevendo...");
        mensagem = await transcreverAudio(body.audio.audioUrl, { clienteId: sessao.clienteId, gratuito: isGratuito, skill: "whisper-webhook" });
        console.log(`[Z-API] Áudio transcrito: "${mensagem}"`);
        if (!mensagem) {
          await sendWhatsApp(sessao.telefone, "Não consegui entender o áudio. Pode digitar a informação?");
          return NextResponse.json({ ok: true });
        }
      } catch (err) {
        console.error("[Z-API] Erro ao transcrever áudio:", err);
        await sendWhatsApp(sessao.telefone, "Não consegui processar o áudio. Pode digitar a informação?");
        return NextResponse.json({ ok: true });
      }
    }

    // ── Processa imagem ──────────────────────
    if (tipoEntrada === "imagem") {
      try {
        // Mensagem de espera diferente pra quem já é cliente Controle (foto
        // provavelmente é recibo/nota de compra do dia a dia) vs. lead do
        // funil de vendas (foto provavelmente é contracheque pro
        // diagnóstico) — antes essa frase citava "Raio-X do Salário" mesmo
        // pra quem mandava um recibo de mercado, o que não fazia sentido.
        await sendWhatsApp(
          sessao.telefone,
          sessao.clienteId
            ? "📷 Recebi sua foto! Analisando..."
            : "📷 Recebi sua imagem! Analisando...\n\n_Seu documento será usado para identificar informações financeiras e gerar seu Raio-X do Salário._"
        );
        const analise = await analisarImagem(body.image.imageUrl, PROMPT_ANALISE_IMAGEM, { clienteId: sessao.clienteId, gratuito: isGratuito, skill: "vision-webhook" });
        // Não loga o texto da análise em claro: pode conter dados de contracheque
        // (nome, cargo, salário) — só o suficiente pra depurar sem expor PII.
        console.log(`[Z-API] Imagem analisada (${analise?.length ?? 0} chars, financeira=${!analise?.includes("[NAO_FINANCEIRA]")})`);

        if (!analise || analise.includes("[NAO_FINANCEIRA]")) {
          await sendWhatsApp(sessao.telefone, "Não identifiquei informações financeiras nessa imagem. Pode me descrever em texto (dívida, gasto, compra...)?");
          return NextResponse.json({ ok: true });
        }

        const normalizado = normalizarRespostaCompraImagem(analise);

        // "Comprovante Inteligente" (09/09/2026, pesquisa de concorrentes +
        // decisão do Ibrahim): se a IA de visão reconheceu como recibo/nota
        // de compra (bate no formato "Comprei em X, R$ Y") e é um cliente já
        // cadastrado no Controle, pausa pra confirmação em vez de lançar
        // direto — diferente do cliente digitando ele mesmo, a leitura da
        // foto pode errar valor/estabelecimento sem o cliente perceber até
        // já ter virado gasto. Lead do funil de vendas (sem clienteId ainda)
        // continua com o comportamento de sempre (cai direto no cascade de
        // texto do diagnóstico), porque não é onde compra do dia a dia
        // normalmente aparece.
        const matchCompra = normalizado.match(/^Comprei em (.+), R\$ (\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+)$/);
        if (matchCompra && sessao.clienteId) {
          const valorExtraido = parseMoneyBR(matchCompra[2]);
          const pendente: ComprovanteFotoDetectado = {
            loja: matchCompra[1],
            valor: valorExtraido ?? 0,
            textoNormalizado: normalizado,
            imageUrl: body.image.imageUrl,
          };
          if (comprovanteFotoValido(pendente)) {
            await prisma.botSessao.updateMany({
              where: { id: sessao.id },
              data: { comprovanteFotoPendente: pendente as unknown as Prisma.InputJsonValue },
            });
            await sendWhatsApp(sessao.telefone, mensagemPreviaComprovante(pendente));
            return NextResponse.json({ ok: true });
          }
        }

        mensagem = normalizado;
      } catch (err) {
        console.error("[Z-API] Erro ao analisar imagem:", err);
        await sendWhatsApp(sessao.telefone, "Não consegui ler essa imagem. Pode digitar as informações?");
        return NextResponse.json({ ok: true });
      }
    }

    // ── Documento (PDF) ──────────────────────
    // Leitura de contracheque continua pausada no MVP (erro nos valores em
    // alguns formatos) — mas "Boleto Inteligente" já está ativo: reaproveita
    // o mesmo extrairPDF, só reage quando o retorno é BOLETO com dados
    // completos (nunca cria compromisso sem confirmação do cliente).
    if (tipoEntrada === "documento") {
      try {
        const resultado = await extrairPDF(body.document.documentUrl);

        if (resultado.tipo === "BOLETO" && sessao.clienteId) {
          const boleto: BoletoDetectado = {
            beneficiario: resultado.beneficiario,
            valor: resultado.valor,
            vencimento: resultado.vencimento,
            linhaDigitavel: resultado.linhaDigitavel,
          };
          if (boletoValido(boleto)) {
            await prisma.botSessao.updateMany({
              where: { id: sessao.id },
              data: { boletoPendente: boleto as unknown as Prisma.InputJsonValue },
            });
            await sendWhatsApp(sessao.telefone, mensagemPreviaBoleto(boleto));
            return NextResponse.json({ ok: true });
          }
        }

        // "Fatura Inteligente" — mesma lógica do Boleto Inteligente acima,
        // mas pode ter várias compras e precisa checar duplicidade antes de
        // pedir confirmação (ver fatura-cartao-flow.ts).
        if (resultado.tipo === "FATURA_CARTAO" && sessao.clienteId) {
          const fatura: FaturaCartaoDetectada = {
            emissor: resultado.emissor,
            vencimentoFatura: resultado.vencimentoFatura,
            parceladas: resultado.parceladas ?? [],
          };
          if (faturaCartaoValida(fatura)) {
            const hash = await hashPDF(body.document.documentUrl);
            const jaProcessado = await hashJaProcessado(sessao.clienteId, hash);
            if (jaProcessado) {
              await sendWhatsApp(sessao.telefone, "📄 Essa fatura já foi processada antes — não lancei de novo.");
              return NextResponse.json({ ok: true });
            }

            const pendente = await montarFaturaCartaoPendente(sessao.clienteId, hash, fatura);

            if (pendente.filaAmbiguos.length > 0) {
              await prisma.botSessao.updateMany({
                where: { id: sessao.id },
                data: { faturaCartaoPendente: pendente as unknown as Prisma.InputJsonValue },
              });
              await sendWhatsApp(sessao.telefone, mensagemPerguntaAmbiguo(pendente.filaAmbiguos[0]));
              return NextResponse.json({ ok: true });
            }

            if (pendente.confirmados.length === 0) {
              await sendWhatsApp(sessao.telefone, mensagemFaturaSemNovidade(pendente.jaCadastradas));
              return NextResponse.json({ ok: true });
            }

            await prisma.botSessao.updateMany({
              where: { id: sessao.id },
              data: { faturaCartaoPendente: pendente as unknown as Prisma.InputJsonValue },
            });
            await sendWhatsApp(sessao.telefone, mensagemResumoLote(pendente));
            return NextResponse.json({ ok: true });
          }
        }
      } catch (err) {
        console.error("[Z-API] Erro ao extrair PDF:", err);
      }

      // Contracheque, "OUTRO", boleto com dado incompleto, ou erro na
      // extração — mesma orientação de fallback já usada pro contracheque.
      await sendWhatsApp(
        sessao.telefone,
        `📄 Recebi seu PDF, mas não consegui ler os dados com segurança (a leitura automática de contracheque está em beta e foi pausada para evitar erro nos valores).\n\n` +
          `Para eu montar seu diagnóstico com segurança, me envie os dados principais assim:\n\n` +
          `Salário líquido normal:\n` +
          `Líquido recebido este mês:\n` +
          `13º/férias/verba extra:\n\n` +
          `Empréstimos em folha:\n` +
          `BANCO X 250,00 12/60\n` +
          `BANCO Y 180,00 08/36\n\n` +
          `Associações:\n` +
          `ASSEBA 80,00\n` +
          `ASPRA 87,00`
      );
      return NextResponse.json({ ok: true });
    }

    // ── Confirmação de boleto pendente (Boleto Inteligente) ──
    // Independente da etapa/estado de texto — se há um boleto aguardando
    // confirmação, uma resposta sim/não resolve ele antes de qualquer outro
    // fluxo. Uma mensagem que não seja claramente sim/não cai no fluxo
    // normal (não trava a conversa esperando só essa resposta).
    //
    // Limitação conhecida: se o cliente também tiver uma
    // confirmacaoPendente do fluxo de texto (ex: gasto duplicado) aberta ao
    // mesmo tempo, um "sim" aqui resolve o boleto e deixa a outra pendência
    // esperando uma segunda resposta — não perde nem duplica nada, só pode
    // pedir a confirmação de novo. Cenário raro (exigiria as duas pendências
    // abertas ao mesmo tempo); não justificou unificar os dois mecanismos
    // de confirmação antes do lançamento.
    if (sessao.boletoPendente && tipoEntrada === "texto") {
      // Regex exata primeiro (grátis, instantânea); só cai pra IA quando o
      // cliente não respondeu num dos formatos exatos esperados — cobre
      // frases naturais tipo "isso mesmo pode salvar" ou "não quero não" que
      // clientes de qualquer nível de escolaridade mandam no dia a dia (achado
      // ao revisar o fluxo em 09/09/2026: sem isso o bot simplesmente não
      // reagia e o boleto ficava pendente pra sempre). Mesmo padrão já usado
      // em gerenciarDespesasFixasComFallbackIA/gerenciarFaturaCartaoComFallbackIA.
      const resposta = detectarRespostaBoleto(mensagem) ?? (await classificarConfirmacaoIA(mensagem));
      if (resposta) {
        const boletoPendente = sessao.boletoPendente as unknown as BoletoDetectado;
        await prisma.botSessao.updateMany({ where: { id: sessao.id }, data: { boletoPendente: Prisma.JsonNull } });
        if (resposta === "confirmar" && sessao.clienteId) {
          await salvarBoletoComoDivida(sessao.clienteId, boletoPendente);
          await sendWhatsApp(sessao.telefone, "✅ Salvei o boleto como um compromisso no seu Controle. Vou te lembrar antes do vencimento.");
        } else {
          await sendWhatsApp(sessao.telefone, "Beleza, não salvei. 👌");
        }
        return NextResponse.json({ ok: true });
      }
    }

    // ── Confirmação de comprovante de foto pendente ("Comprovante Inteligente") ──
    // Mesmo padrão do bloco de boleto acima. Diferença importante: em vez de
    // persistir aqui, um "sim" reinjeta o texto já normalizado no `mensagem`
    // e deixa cair no MESMO cascade de gasto de texto mais abaixo (nunca
    // duplica a lógica de categorização/checagem de orçamento/guard de
    // fatura já testada) — por isso não faz `return` no caminho de
    // confirmação, só no de negação.
    if (sessao.comprovanteFotoPendente && tipoEntrada === "texto") {
      const respostaComprovante = detectarRespostaComprovante(mensagem) ?? (await classificarConfirmacaoIA(mensagem));
      if (respostaComprovante) {
        const comprovantePendente = sessao.comprovanteFotoPendente as unknown as ComprovanteFotoDetectado;
        await prisma.botSessao.updateMany({ where: { id: sessao.id }, data: { comprovanteFotoPendente: Prisma.JsonNull } });
        if (respostaComprovante === "negar") {
          await sendWhatsApp(sessao.telefone, "Beleza, não registrei esse gasto. Se quiser, me diga o valor certo digitando a descrição e o valor. 👌");
          return NextResponse.json({ ok: true });
        }
        // Confirmado: a compra é do comprovante original, mesmo a resposta
        // tendo chegado em texto — preserva a origem/URL pra não perder o
        // vínculo com a foto (limitação que existia antes desta feature).
        mensagem = comprovantePendente.textoNormalizado;
        origemLancamentoControle = "FOTO";
        comprovanteUrlImagem = comprovantePendente.imageUrl;
        // Sem return — segue o fluxo normal abaixo com `mensagem` já pronta.
      }
    }

    // ── Confirmação de fatura de cartão pendente ("Fatura Inteligente") ──
    // Duas etapas possíveis, na ordem: (1) enquanto sobrar item na fila de
    // ambíguos, cada sim/não resolve um item por vez ("sim" = é a mesma
    // compra já cadastrada, não duplica; "não" = compra diferente, entra na
    // lista); (2) só depois da fila zerada, um sim/não final confirma o
    // lote inteiro. Mesma limitação conhecida do bloco de boleto acima
    // (pendência dupla com o fluxo de texto é rara e não perde/duplica
    // nada, só pode pedir a confirmação de novo).
    if (sessao.faturaCartaoPendente && tipoEntrada === "texto") {
      // Mesmo fallback por IA do bloco de boleto acima, mesmo motivo.
      const resposta = detectarRespostaFaturaCartao(mensagem) ?? (await classificarConfirmacaoIA(mensagem));
      if (resposta) {
        const pendente = sessao.faturaCartaoPendente as unknown as FaturaCartaoPendente;

        if (pendente.indice < pendente.filaAmbiguos.length) {
          const itemAtual = pendente.filaAmbiguos[pendente.indice];
          const proximoIndice = pendente.indice + 1;
          const confirmados =
            resposta === "negar"
              ? [...pendente.confirmados, { descricao: itemAtual.descricao, parcelaAtual: itemAtual.parcelaAtual, totalParcelas: itemAtual.totalParcelas, valorParcela: itemAtual.valorParcela }]
              : pendente.confirmados;
          const pendenteAtualizado: FaturaCartaoPendente = { ...pendente, indice: proximoIndice, confirmados };

          if (proximoIndice < pendenteAtualizado.filaAmbiguos.length) {
            await prisma.botSessao.updateMany({
              where: { id: sessao.id },
              data: { faturaCartaoPendente: pendenteAtualizado as unknown as Prisma.InputJsonValue },
            });
            await sendWhatsApp(sessao.telefone, mensagemPerguntaAmbiguo(pendenteAtualizado.filaAmbiguos[proximoIndice]));
            return NextResponse.json({ ok: true });
          }

          if (pendenteAtualizado.confirmados.length === 0) {
            await prisma.botSessao.updateMany({ where: { id: sessao.id }, data: { faturaCartaoPendente: Prisma.JsonNull } });
            await sendWhatsApp(sessao.telefone, mensagemFaturaSemNovidade(pendenteAtualizado.jaCadastradas));
            return NextResponse.json({ ok: true });
          }

          await prisma.botSessao.updateMany({
            where: { id: sessao.id },
            data: { faturaCartaoPendente: pendenteAtualizado as unknown as Prisma.InputJsonValue },
          });
          await sendWhatsApp(sessao.telefone, mensagemResumoLote(pendenteAtualizado));
          return NextResponse.json({ ok: true });
        }

        // Fila de ambíguos já zerada — essa resposta é sobre o lote final.
        await prisma.botSessao.updateMany({ where: { id: sessao.id }, data: { faturaCartaoPendente: Prisma.JsonNull } });
        if (resposta === "confirmar" && sessao.clienteId) {
          await salvarComprasParceladasFatura(sessao.clienteId, pendente);
          await sendWhatsApp(sessao.telefone, mensagemLoteConfirmado(pendente));
        } else {
          await sendWhatsApp(sessao.telefone, "Beleza, não lancei nada dessa fatura. 👌");
        }
        return NextResponse.json({ ok: true });
      }
    }

        // ── Comando RESETAR (funciona em qualquer etapa) ──
    if (detectarComando(mensagem) === "RESETAR") {
      if (sessao.clienteId) {
        await prisma.divida.deleteMany({ where: { clienteId: sessao.clienteId } });
        await prisma.planoEnviado.deleteMany({ where: { clienteId: sessao.clienteId } });
        await prisma.cliente.update({
          where: { id: sessao.clienteId },
          data: { statusAtendimento: "NOVO", rendaMensal: null },
        });
      }

      const [respostaReset, respostaInicio] = mensagensResetControle(sessao.nome ?? "cliente");

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          etapa: "CONVERSANDO",
          renda: null,
          dividasTemp: JSON.stringify([
            { role: "assistant", content: respostaReset },
            { role: "assistant", content: respostaInicio },
          ]),
          // Sem isso, um boleto/comprovante detectado antes do reset ficaria
          // pendente pra sempre — e um "sim" completamente sem relação, dias
          // depois, recriaria uma dívida/gasto com dados velhos.
          boletoPendente: Prisma.JsonNull,
          comprovanteFotoPendente: Prisma.JsonNull,
        },
      });

      await sendWhatsApp(telefone, respostaReset);
      await sendWhatsApp(telefone, respostaInicio);

      return NextResponse.json({ ok: true });
    }

    // ── Troca do modo de lembrete (texto/áudio) — funciona em qualquer
    // etapa, igual RESETAR. Pedido do Ibrahim (09/09/2026). ──
    if (sessao.clienteId && tipoEntrada === "texto") {
      const modoPedido = detectarComandoModoLembrete(mensagem);
      if (modoPedido) {
        await prisma.cliente.update({
          where: { id: sessao.clienteId },
          data: { modoLembrete: modoPedido },
        });
        if (modoPedido === "AUDIO") {
          // A própria confirmação já sai em nota de voz — assim o cliente
          // já ouve na hora como vai ser, e isso serve de teste real do
          // caminho TTS → Z-API a cada vez que alguém liga essa opção (cai
          // pra texto sozinho se áudio falhar, igual qualquer lembrete).
          await deliverReminder({
            phone: telefone,
            mensagem: "🔊 Combinado! De agora em diante, o lembrete de vencimento/tarefa mais importante vai chegar assim, em nota de voz (se algo falhar na hora, mando em texto). Pra voltar, é só mandar \"lembrete em texto\".",
            modo: "AUDIO",
          });
        } else {
          await sendWhatsApp(telefone, "✍️ Combinado! Seus lembretes voltam a ser só em texto.");
        }
        return NextResponse.json({ ok: true });
      }
    }

    // ── Desfazer o último lançamento ───────────────────────────────────
    // Complemento do registro automático sem confirmação: se o bot lançar
    // errado, o cliente precisa conseguir desfazer com a mesma facilidade
    // que mandou a mensagem original, sem precisar entrar no painel web.
    // Escopo intencionalmente restrito ao último Lancamento (gasto/receita/
    // despesa fixa) do cliente — é o caso de longe mais comum; desfazer
    // dívida/meta/cartão continua exigindo o fluxo específico de cada um.
    if (sessao.clienteId && detectarComando(mensagem) === "DESFAZER_LANCAMENTO") {
      const historicoParaDesfazer = (() => {
        try {
          return JSON.parse(sessao.dividasTemp ?? "[]") as Array<{ role: string; content?: string | null }>;
        } catch {
          return [];
        }
      })();

      const ultimoLancamento = await prisma.lancamento.findFirst({
        where: { clienteId: sessao.clienteId },
        orderBy: { criadoEm: "desc" },
      });

      if (!ultimoLancamento) {
        const respostaNada = "Não achei nenhum lançamento recente pra desfazer.";
        await sendWhatsApp(telefone, respostaNada);
        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...historicoParaDesfazer,
              { role: "user", content: mensagem },
              { role: "assistant", content: respostaNada },
            ]),
          },
        });
        return NextResponse.json({ ok: true });
      }

      await prisma.lancamento.delete({ where: { id: ultimoLancamento.id } });

      const rotuloTipo =
        ultimoLancamento.tipo === "RECEITA"
          ? "Receita"
          : ultimoLancamento.tipo === "DESPESA_FIXA"
            ? "Despesa fixa"
            : ultimoLancamento.tipo === "COMPRA_CARTAO"
              ? "Gasto no cartão"
              : ultimoLancamento.tipo === "FATURA_FECHADA"
                ? "Fatura"
                : "Despesa";
      const respostaDesfeito =
        `↩️ *Desfeito.*\n\n` +
        `${rotuloTipo} removida:\n` +
        `${ultimoLancamento.descricao} — ${formatarValorBR(ultimoLancamento.valor)}\n\n` +
        `Se não era esse, me avisa que eu confiro. Pode mandar o lançamento certo agora.`;

      await sendWhatsApp(telefone, respostaDesfeito);
      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          dividasTemp: JSON.stringify([
            ...historicoParaDesfazer,
            { role: "user", content: mensagem },
            { role: "assistant", content: respostaDesfeito },
          ]),
        },
      });

      return NextResponse.json({ ok: true });
    }

    // ── Comandos de Tarefa (lembretes e pagamentos por texto/áudio) ───────
    // Prefixos explícitos ("tarefa:", "lembrete:", "pagamento:") e comandos
    // de consulta ("minhas tarefas", "concluí ...", "cancelar ...") — não
    // interferem no estado de conversa (dividasTemp) do resto do fluxo.
    const comandoTarefa = detectarComandoTarefa(mensagem);
    if (comandoTarefa) {
      const origemMensagemTarefa = tipoEntrada === "audio" ? "AUDIO" : "TEXTO";
      const respostaTarefa = await processarComandoTarefa(sessao.clienteId, comandoTarefa, origemMensagemTarefa);
      // respostaTarefa é null quando "concluir"/"cancelar" não acham nenhuma tarefa
      // pendente parecida — nesse caso não intercepta, a cascata normal continua
      // (evita sequestrar mensagens comuns que começam com "terminei"/"cancela"/etc).
      if (respostaTarefa) {
        await sendWhatsApp(telefone, respostaTarefa);
        return NextResponse.json({ ok: true });
      }
    }

    // ── Fluxo fixo: Servidor público / contracheque ───────────────────────
    const servidorMsgNormalizada = mensagem
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

    const servidorHistoricoSessao = (() => {
      try {
        return JSON.parse(sessao.dividasTemp ?? "[]") as Array<{
          role: string;
          content: string;
        }>;
      } catch {
        return [];
      }
    })();

    const servidorHistoricoTexto = servidorHistoricoSessao
      .map((h) => h.content ?? "")
      .join("\n")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const servidorEstaRespondendoPerfilTrabalho =
      servidorHistoricoTexto.includes("como voce trabalha hoje") ||
      servidorHistoricoTexto.includes("perfil de trabalho") ||
      servidorHistoricoSessao.length === 0;

    const servidorEscolheuServidorPublico =
      /\bservidor\b|\bservidor publico\b|\bfuncionario publico\b|\bconcursado\b|\bpolicial\b|\bpm\b|\bmunicipal\b|\bestadual\b|\bfederal\b/.test(
        servidorMsgNormalizada
      );

    if (servidorEstaRespondendoPerfilTrabalho && servidorEscolheuServidorPublico) {
      // Leitura automática de contracheque pausada no MVP — pede os dados manualmente.
      const respostaServidor = `Perfeito. ✅ Como você é servidor público, vou organizar seus descontos em folha manualmente para evitar erro na leitura automática do contracheque.

Me envie assim:

1️⃣ Salário líquido normal:
2️⃣ Líquido recebido este mês:
3️⃣ Teve 13º, férias ou verba extra? Qual valor?

4️⃣ Empréstimos/consignados/descontos parcelados em folha:
Exemplo:
BANCO X 250,00 12/60
BANCO Y 180,50 08/36
ASSEBA benefício 120,00 10/36

5️⃣ Associações/mensalidades em folha:
Exemplo:
ASSEBA 80,00
ASPRA 87,00

Pode mandar tudo em uma mensagem só.`;

      await sendWhatsApp(telefone, respostaServidor);

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          dividasTemp: JSON.stringify([
            ...servidorHistoricoSessao,
            { role: "user", content: mensagem },
            { role: "assistant", content: respostaServidor },
          ]),
        },
      });

      return NextResponse.json({ ok: true });
    }

    // ── Comando COBRAR ───────────────────────────────────────────────────────
    if (deveConfirmarDadosFolhaServidor(servidorHistoricoSessao, mensagem)) {
      const dadosFolhaServidor = extrairDadosServidorPublicoManual(mensagem);
      if (dadosFolhaServidor.linhasNaoReconhecidas.length > 0) {
        await sendWhatsApp(
          telefone,
          "Consegui registrar parte dos dados, mas preciso confirmar estas linhas antes de continuar:\n\n" +
            dadosFolhaServidor.linhasNaoReconhecidas.map((linha) => `- ${linha}`).join("\n") +
            "\n\nMe envie essas linhas no formato: Banco/Nome valor parcelaAtual/totalParcelas ou Associação valor."
        );

        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
            ]),
          },
        });

        return NextResponse.json({ ok: true });
      }

      const respostaFolhaServidor = gerarRespostaDadosFolhaServidor(mensagem);
      await sendWhatsApp(telefone, respostaFolhaServidor);

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          dividasTemp: JSON.stringify([
            ...servidorHistoricoSessao,
            { role: "user", content: mensagem },
            { role: "assistant", content: respostaFolhaServidor },
          ]),
        },
      });

      return NextResponse.json({ ok: true });
    }

    // Sincroniza com o motor central (mesmo que o Dashboard usa) antes de
    // qualquer fluxo usar o estado — ver controle-financeiro-sync.ts pro
    // porquê (bug real achado ao vivo: saldo do WhatsApp divergindo do
    // Dashboard porque o "estado" antigo era um acumulador vitalício).
    const estadoAntesFluxosControle = await sincronizarEstadoComMotorCentral(
      sessao.clienteId,
      carregarEstadoControle(servidorHistoricoSessao as Mensagem[], sessao.renda),
      sessao.renda
    );
    const correcaoRenda = corrigirRendaControle(mensagem, estadoAntesFluxosControle);
    if (correcaoRenda) {
      await sendWhatsApp(telefone, correcaoRenda.resposta);

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          renda: correcaoRenda.estado.rendaMensal,
          dividasTemp: JSON.stringify([
            ...servidorHistoricoSessao,
            { role: "user", content: mensagem },
            { role: "assistant", content: correcaoRenda.resposta },
            ...(correcaoRenda.atualizouEstado ? [criarMensagemEstadoControle(correcaoRenda.estado)] : []),
          ]),
        },
      });

      return NextResponse.json({ ok: true });
    }

    const resultadoConsultaCartoesControle = consultarCartoesControle(mensagem, estadoAntesFluxosControle);
    if (resultadoConsultaCartoesControle) {
      await sendWhatsApp(telefone, resultadoConsultaCartoesControle.resposta);

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          dividasTemp: JSON.stringify([
            ...servidorHistoricoSessao,
            { role: "user", content: mensagem },
            { role: "assistant", content: resultadoConsultaCartoesControle.resposta },
          ]),
        },
      });

      return NextResponse.json({ ok: true });
    }

    const resultadoConsultaSaldoControle = consultarSaldoControle(mensagem, estadoAntesFluxosControle);
    if (resultadoConsultaSaldoControle) {
      await sendWhatsApp(telefone, resultadoConsultaSaldoControle.resposta);

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          dividasTemp: JSON.stringify([
            ...servidorHistoricoSessao,
            { role: "user", content: mensagem },
            { role: "assistant", content: resultadoConsultaSaldoControle.resposta },
          ]),
        },
      });

      return NextResponse.json({ ok: true });
    }

    // Consulta financeira em linguagem natural (Skill Analista, prioridade
    // 2) — sempre lê do motor central (src/lib/financeiro/motor.ts), nunca
    // recalcula por conta própria. Leitura pura, sem efeito colateral, por
    // isso roda sem confirmação e antes da cascata de registro de gasto.
    if (sessao.clienteId) {
      const tipoConsulta = detectarConsultaFinanceira(mensagem);
      if (tipoConsulta) {
        const respostaConsulta = await responderConsultaFinanceira(tipoConsulta, sessao.clienteId, mensagem, isGratuito);
        await sendWhatsApp(telefone, respostaConsulta);

        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: respostaConsulta },
            ]),
          },
        });

        return NextResponse.json({ ok: true });
      }
    }

    // Simulador "essa parcela cabe?" (Skill Analista, próxima leva) — só
    // dispara em frase hipotética com "em Nx"/"N vezes" explícito (ex: "se
    // eu comprar R$1.800 em 10x, como ficam meus próximos salários?").
    // Leitura pura (nunca registra nada), por isso roda antes da cascata
    // de registro de gasto, igual à consulta financeira acima.
    if (sessao.clienteId) {
      const deteccaoSimulacao = detectarSimulacaoParcela(mensagem);
      if (deteccaoSimulacao) {
        const respostaSimulacao = await responderSimulacaoParcela(sessao.clienteId, mensagem, isGratuito, deteccaoSimulacao);
        await sendWhatsApp(telefone, respostaSimulacao);

        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: respostaSimulacao },
            ]),
          },
        });

        return NextResponse.json({ ok: true });
      }
    }

    // "Até o próximo salário" / limite seguro por dia (Skill Analista) —
    // leitura pura, mesmo padrão das duas consultas acima.
    if (sessao.clienteId) {
      if (detectarLimiteSeguro(mensagem)) {
        const respostaLimite = await responderLimiteSeguro(sessao.clienteId, isGratuito);
        await sendWhatsApp(telefone, respostaLimite);

        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: respostaLimite },
            ]),
          },
        });

        return NextResponse.json({ ok: true });
      }
    }

    // Rota pra ficar livre das dívidas (Skill Analista) — leitura pura,
    // mesmo padrão das consultas acima.
    if (sessao.clienteId) {
      if (detectarRotaDividas(mensagem)) {
        const respostaRota = await responderRotaDividas(sessao.clienteId, isGratuito);
        await sendWhatsApp(telefone, respostaRota);

        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: respostaRota },
            ]),
          },
        });

        return NextResponse.json({ ok: true });
      }
    }

    // Meta/prazo do Plano de Pagamento ("quero quitar o Carrefour em 6
    // meses") — mais específico que o plano geral abaixo, por isso checado
    // primeiro. Leitura pura, mesmo padrão das consultas acima.
    if (sessao.clienteId) {
      const deteccaoMeta = detectarMetaPrazo(mensagem);
      if (deteccaoMeta) {
        const respostaMeta = await responderMetaPrazo(sessao.clienteId, isGratuito, deteccaoMeta);
        await sendWhatsApp(telefone, respostaMeta);

        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: respostaMeta },
            ]),
          },
        });

        return NextResponse.json({ ok: true });
      }
    }

    // Plano de Pagamento do mês ("monta meu plano de pagamento", "o que eu
    // pago primeiro esse mês") — motor determinístico por camadas de
    // prioridade (plano-pagamento-motor.ts). Leitura pura, mesmo padrão
    // das consultas acima.
    if (sessao.clienteId) {
      if (detectarPlanoPagamento(mensagem)) {
        const respostaPlano = await responderPlanoPagamento(sessao.clienteId, isGratuito);
        await sendWhatsApp(telefone, respostaPlano);

        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: respostaPlano },
            ]),
          },
        });

        return NextResponse.json({ ok: true });
      }
    }

    // "Vazamentos do salário" (Skill Analista) — leitura pura, mesmo
    // padrão das consultas acima.
    if (sessao.clienteId) {
      if (detectarConsultaVazamentos(mensagem)) {
        const respostaVazamentos = await responderConsultaVazamentos(sessao.clienteId, isGratuito);
        await sendWhatsApp(telefone, respostaVazamentos);

        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: respostaVazamentos },
            ]),
          },
        });

        return NextResponse.json({ ok: true });
      }
    }

    // "Compra em horas de trabalho" (Skill Analista) — leitura pura, mesmo
    // padrão das consultas acima.
    if (sessao.clienteId) {
      if (detectarHorasTrabalho(mensagem)) {
        const respostaHoras = await responderHorasTrabalho(sessao.clienteId, mensagem, isGratuito);
        await sendWhatsApp(telefone, respostaHoras);

        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: respostaHoras },
            ]),
          },
        });

        return NextResponse.json({ ok: true });
      }
    }

    // "Treinamento contínuo" (pedido do Ibrahim, 09/2026) — se a mensagem
    // sobreviveu aos 8 regex de consulta acima (nenhum bateu) mas ainda
    // assim parece uma pergunta, tenta um classificador de IA pra rotear
    // pra uma das 6 skills de consulta mais seguras de generalizar (só
    // leitura, nunca cria/altera dado) em vez de deixar cair no
    // resolverIntencaoFinanceiraIA logo abaixo. Precisa rodar ANTES desse
    // resolver geral, não depois: achado ao vivo (teste real, 09/2026) —
    // resolverIntencaoFinanceiraIA tenta classificar QUALQUER mensagem
    // (inclusive consultas) e, quando decide "fora de escopo" (emEscopo:
    // false), já responde com a mensagem genérica de apresentação e
    // encerra a requisição — um classificador de consulta colocado depois
    // dele (como cheguei a subir numa primeira versão) nunca seria
    // alcançado nesses casos. Ver classificador-consulta-livre.ts pro
    // racional completo (revisado com ChatGPT antes de subir) e pra Fase 2
    // proposta (exemplos aprovados + correção do usuário como sinal de
    // treino, com humano aprovando antes de virar regra nova).
    if (sessao.clienteId) {
      const respostaConsultaLivre = await tentarResponderConsultaLivre(mensagem, sessao.clienteId, isGratuito);
      if (respostaConsultaLivre) {
        await sendWhatsApp(telefone, respostaConsultaLivre);

        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: respostaConsultaLivre },
            ]),
          },
        });

        return NextResponse.json({ ok: true });
      }
    }

    const loteGastosCartao = resolverLoteGastosCartao(mensagem);
    if (loteGastosCartao) {
      if (
        intentFinanceiroConfirmavel(loteGastosCartao) &&
        podeAutoRegistrarIntentFinanceiro(loteGastosCartao)
      ) {
        await registrarIntentFinanceiroDireto(
          sessao,
          telefone,
          mensagem,
          servidorHistoricoSessao,
          estadoAntesFluxosControle,
          loteGastosCartao,
          origemLancamentoControle,
          comprovanteUrlImagem
        );
        return NextResponse.json({ ok: true });
      }

      const respostaIntent = formatarPreviaIntentFinanceiro(loteGastosCartao);
      const estadoComIntent = criarEstadoComConfirmacaoInterpretacaoFinanceira(
        estadoAntesFluxosControle,
        loteGastosCartao
      );

      await sendWhatsApp(telefone, respostaIntent);

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          dividasTemp: JSON.stringify([
            ...servidorHistoricoSessao,
            { role: "user", content: mensagem },
            { role: "assistant", content: respostaIntent },
            criarMensagemEstadoControle(estadoComIntent),
          ]),
        },
      });

      return NextResponse.json({ ok: true });
    }

    const gerenciamentoDespesasFixas = await gerenciarDespesasFixasComFallbackIA(mensagem, estadoAntesFluxosControle);
    if (gerenciamentoDespesasFixas) {
      await sendWhatsApp(telefone, gerenciamentoDespesasFixas.resposta);

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          ...(gerenciamentoDespesasFixas.etapa ? { etapa: gerenciamentoDespesasFixas.etapa } : {}),
          dividasTemp: JSON.stringify([
            ...servidorHistoricoSessao,
            { role: "user", content: mensagem },
            { role: "assistant", content: gerenciamentoDespesasFixas.resposta },
            ...(gerenciamentoDespesasFixas.atualizouEstado ? [criarMensagemEstadoControle(gerenciamentoDespesasFixas.estado)] : []),
          ]),
        },
      });

      after(() => persistirLancamentosControle(sessao.clienteId, gerenciamentoDespesasFixas.itensParaPersistir, origemLancamentoControle, comprovanteUrlImagem));
      after(() => persistirCartaoControle(sessao.clienteId, gerenciamentoDespesasFixas.cartaoParaPersistir));
      after(() => persistirDividaConfirmadaIA(sessao.clienteId, gerenciamentoDespesasFixas.dividaParaPersistir));
      after(() => persistirPagamentoDividaConfirmadoIA(sessao.clienteId, telefone, gerenciamentoDespesasFixas.pagamentoDividaParaPersistir));
      after(() => persistirMetaConfirmadaIA(sessao.clienteId, telefone, gerenciamentoDespesasFixas.metaParaPersistir));

      return NextResponse.json({ ok: true });
    }

    const estadoAntesGasto = estadoAntesFluxosControle;

    // Detector de lançamento duplicado (Skill Analista): busca só o
    // suficiente pra registrarGastoControle/resolverValorGastoPendente
    // comparar valor+estabelecimento contra o que já foi lançado hoje —
    // nunca recalcula nada financeiro, só compara texto/valor bruto.
    const lancamentosRecentesControle = sessao.clienteId
      ? await prisma.lancamento.findMany({
          where: { clienteId: sessao.clienteId, data: { gte: inicioDoDiaBrasil(new Date()) } },
          select: { descricao: true, valor: true },
        })
      : [];

    // ── Resposta a "Qual foi o valor desse gasto?" pendente ────────────────
    // Antes de qualquer outra coisa (inclusive antes do interpretador de
    // IA): se o bot ficou esperando só o número de um gasto sem valor, a
    // resposta ("500") é resolvida direto aqui. Sem isso, essa resposta,
    // sozinha e sem contexto, não parece financeira o suficiente pra IA
    // reconhecer e a informação do cliente se perdia (bug encontrado em
    // testes, set/2026).
    if (estadoAntesGasto.confirmacaoPendente?.tipo === "aguardar_valor_gasto") {
      const resolvidoPendente = resolverValorGastoPendente(mensagem, estadoAntesGasto, lancamentosRecentesControle);
      if (resolvidoPendente) {
        await sendWhatsApp(telefone, resolvidoPendente.resposta);

        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: resolvidoPendente.resposta },
              ...(resolvidoPendente.atualizouEstado ? [criarMensagemEstadoControle(resolvidoPendente.estado)] : []),
            ]),
          },
        });

        after(() => persistirLancamentosControle(sessao.clienteId, resolvidoPendente.itensParaPersistir, origemLancamentoControle, comprovanteUrlImagem));

        return NextResponse.json({ ok: true });
      }
    }

    // ── Resposta a "Qual foi o valor desse pagamento?" pendente ────────────
    // Mesma ideia do bloco acima, mas pra pagamento de dívida sem valor
    // (ex.: "Já paguei a parcela do Carlos") — bug da mesma família
    // encontrado em teste (set/2026): sem isso, a mensagem caía no fluxo
    // genérico de gasto e virava uma despesa errada em vez de baixa de
    // dívida no credor certo.
    if (estadoAntesGasto.confirmacaoPendente?.tipo === "aguardar_valor_pagamento_divida") {
      const resolvidoPagamento = resolverValorPagamentoDividaPendente(mensagem, estadoAntesGasto);
      if (resolvidoPagamento) {
        await sendWhatsApp(telefone, resolvidoPagamento.resposta);

        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: resolvidoPagamento.resposta },
              ...(resolvidoPagamento.atualizouEstado ? [criarMensagemEstadoControle(resolvidoPagamento.estado)] : []),
            ]),
          },
        });

        after(() => persistirPagamentoDividaConfirmadoIA(sessao.clienteId, telefone, resolvidoPagamento.pagamentoDividaParaPersistir));

        return NextResponse.json({ ok: true });
      }
    }

    const correcaoOrigem = corrigirOrigemUltimoGastoControle(mensagem, estadoAntesGasto);
    if (correcaoOrigem) {
      await sendWhatsApp(telefone, correcaoOrigem.resposta);

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          dividasTemp: JSON.stringify([
            ...servidorHistoricoSessao,
            { role: "user", content: mensagem },
            { role: "assistant", content: correcaoOrigem.resposta },
            ...(correcaoOrigem.atualizouEstado ? [criarMensagemEstadoControle(correcaoOrigem.estado)] : []),
          ]),
        },
      });

      after(() =>
        corrigirOrigemLancamentoControle(
          sessao.clienteId,
          estadoAntesGasto.ultimoGasto,
          correcaoOrigem.estado.ultimoGasto?.cartao
        )
      );

      return NextResponse.json({ ok: true });
    }

    const gerenciamentoFaturaCartao = await gerenciarFaturaCartaoComFallbackIA(mensagem, estadoAntesGasto);
    if (gerenciamentoFaturaCartao) {
      await sendWhatsApp(telefone, gerenciamentoFaturaCartao.resposta);

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          dividasTemp: JSON.stringify([
            ...servidorHistoricoSessao,
            { role: "user", content: mensagem },
            { role: "assistant", content: gerenciamentoFaturaCartao.resposta },
            ...(gerenciamentoFaturaCartao.atualizouEstado ? [criarMensagemEstadoControle(gerenciamentoFaturaCartao.estado)] : []),
          ]),
        },
      });

      after(() => persistirLancamentosControle(sessao.clienteId, gerenciamentoFaturaCartao.itensParaPersistir, origemLancamentoControle));

      return NextResponse.json({ ok: true });
    }

    const configuracaoCartao = configurarCartaoControle(mensagem, estadoAntesGasto);
    if (configuracaoCartao) {
      await sendWhatsApp(telefone, configuracaoCartao.resposta);

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          dividasTemp: JSON.stringify([
            ...servidorHistoricoSessao,
            { role: "user", content: mensagem },
            { role: "assistant", content: configuracaoCartao.resposta },
            ...(configuracaoCartao.atualizouEstado ? [criarMensagemEstadoControle(configuracaoCartao.estado)] : []),
          ]),
        },
      });

      after(() => persistirCartaoControle(sessao.clienteId, configuracaoCartao.cartaoParaPersistir));

      return NextResponse.json({ ok: true });
    }

    // Decisão do Ibrahim (set/2026): acabou o onboarding guiado (perguntar
    // renda mensal, depois despesas fixas, antes de liberar o resto). O
    // cliente novo já pode mandar qualquer gasto/receita/dívida/meta/cartão
    // desde a primeira mensagem — sem passar por um "assistente" que
    // conduz o diálogo. Constante travada em false (em vez de apagar o
    // bloco inteiro) pra manter o histórico de como funcionava, caso
    // precise voltar atrás.
    const aguardandoRendaControle = false;

    if (aguardandoRendaControle) {
      if (pareceForaEscopoControle(mensagem)) {
        await sendWhatsApp(telefone, MENSAGEM_FORA_ESCOPO_FINANCEIRO);
        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: MENSAGEM_FORA_ESCOPO_FINANCEIRO },
            ]),
          },
        });
        return NextResponse.json({ ok: true });
      }

      if (pareceReceitaAvulsaControle(mensagem)) {
        const respostaReceitaNaRenda =
          "Isso parece uma receita/entrada avulsa, não sua renda mensal. Para começar, me informe sua renda mensal. Exemplo: 3000.";
        await sendWhatsApp(telefone, respostaReceitaNaRenda);
        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: respostaReceitaNaRenda },
            ]),
          },
        });
        return NextResponse.json({ ok: true });
      }

      const rendaControle = extrairRendaControle(mensagem, true);
      if (rendaControle) {
        const respostaRenda = mensagemRendaRegistradaControle(rendaControle);
        const perguntaDespesas = mensagemPedidoDespesasFixasControle();
        const explicacaoDespesas = mensagemExplicarDespesasFixasControle();

        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            etapa: ETAPA_AGUARDANDO_DESPESAS_FIXAS,
            renda: rendaControle,
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: respostaRenda },
              { role: "assistant", content: perguntaDespesas },
              { role: "assistant", content: explicacaoDespesas },
            ]),
          },
        });

        await sendWhatsApp(telefone, respostaRenda);
        await sendWhatsApp(telefone, perguntaDespesas);
        await sendWhatsApp(telefone, explicacaoDespesas);

        return NextResponse.json({ ok: true });
      }
    }

    const aguardandoDespesasFixasControle = deveAguardarDespesasFixasControle(
      sessao.etapa,
      servidorHistoricoSessao
    );

    if (aguardandoDespesasFixasControle) {
      if (devePularDespesasFixasControle(mensagem)) {
        const [
          respostaDespesasFixas,
          respostaResumoDespesas,
          respostaProximaEtapa,
        ] = formatarMensagensDespesasFixasControle([], sessao.renda);
        const estadoControle = atualizarDespesasFixasControle(
          estadoAntesFluxosControle,
          0,
          sessao.renda,
          []
        );

        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            etapa: ETAPA_AGUARDANDO_GASTOS,
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: respostaDespesasFixas },
              { role: "assistant", content: respostaResumoDespesas },
              { role: "assistant", content: respostaProximaEtapa },
              criarMensagemEstadoControle(estadoControle),
            ]),
          },
        });

        await sendWhatsApp(telefone, respostaDespesasFixas);
        await sendWhatsApp(telefone, respostaResumoDespesas);
        await sendWhatsApp(telefone, respostaProximaEtapa);

        return NextResponse.json({ ok: true });
      }

      if (pareceForaEscopoControle(mensagem)) {
        await sendWhatsApp(telefone, MENSAGEM_FORA_ESCOPO_FINANCEIRO);
        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: MENSAGEM_FORA_ESCOPO_FINANCEIRO },
            ]),
          },
        });
        return NextResponse.json({ ok: true });
      }

      if (pareceReceitaAvulsaControle(mensagem)) {
        const respostaReceitaNasFixas =
          "Isso parece uma receita/entrada, não uma despesa fixa mensal. Primeiro vamos concluir suas despesas fixas. Envie aluguel, energia, internet, pensão, assinaturas etc., ou digite 'pular'.";
        await sendWhatsApp(telefone, respostaReceitaNasFixas);
        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: respostaReceitaNasFixas },
            ]),
          },
        });
        return NextResponse.json({ ok: true });
      }

      // forcarLocal removido (item 6 do raio-x do bot): resolverMensagemMista
      // (regra hiper-específica que só batia com 2 mensagens de teste) foi
      // removida do resolvedor local — sem deixar a IA real como fallback
      // aqui, uma mensagem mista de verdade durante o onboarding ("energia
      // 200, aluguel 900, água na rua 20, chatgpt 35") passaria direto pelo
      // parser de despesas fixas simples (sem pedir confirmação), perdendo
      // o gasto variável ("água na rua") no meio do caminho.
      const intentOnboardingDespesas = await resolverIntencaoFinanceiraIA(mensagem);
      if (
        intentOnboardingDespesas?.emEscopo &&
        intentOnboardingDespesas.itens.length > 1 &&
        intentOnboardingDespesas.itens.some((item) => item.tipo !== "despesa_fixa")
      ) {
        const respostaIntent = formatarPreviaIntentFinanceiro(intentOnboardingDespesas);
        const estadoComIntent = criarEstadoComConfirmacaoInterpretacaoFinanceira(
          estadoAntesFluxosControle,
          intentOnboardingDespesas
        );

        await sendWhatsApp(telefone, respostaIntent);
        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: respostaIntent },
              criarMensagemEstadoControle(estadoComIntent),
            ]),
          },
        });
        return NextResponse.json({ ok: true });
      }

      if (pareceGastoVariavelControle(mensagem)) {
        const respostaGastoNasFixas =
          "Isso parece um gasto do dia a dia, não uma despesa fixa mensal. Primeiro vamos concluir suas despesas fixas ou digite 'pular'.";
        await sendWhatsApp(telefone, respostaGastoNasFixas);
        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: respostaGastoNasFixas },
            ]),
          },
        });
        return NextResponse.json({ ok: true });
      }

      const despesasFixas = parsearDespesasFixasControle(mensagem);
      if (despesasFixas.length === 0) {
        const respostaErro = "Não consegui identificar os valores das despesas fixas.\n\nPode mandar assim:\n\n```\nEnergia 120\nInternet 90\nPensão 900\n```";

        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: respostaErro },
            ]),
          },
        });

        await sendWhatsApp(telefone, respostaErro);

        return NextResponse.json({ ok: true });
      }

      const [
        respostaDespesasFixas,
        respostaResumoDespesas,
        respostaProximaEtapa,
      ] = formatarMensagensDespesasFixasControle(despesasFixas, sessao.renda);
      const totalDespesasFixas = despesasFixas.reduce((soma, despesa) => soma + despesa.valor, 0);
      const estadoControle = atualizarDespesasFixasControle(
        estadoAntesFluxosControle,
        totalDespesasFixas,
        sessao.renda,
        despesasFixas
      );

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          etapa: ETAPA_AGUARDANDO_GASTOS,
          dividasTemp: JSON.stringify([
            ...servidorHistoricoSessao,
            { role: "user", content: mensagem },
            { role: "assistant", content: respostaDespesasFixas },
            { role: "assistant", content: respostaResumoDespesas },
            { role: "assistant", content: respostaProximaEtapa },
            criarMensagemEstadoControle(estadoControle),
          ]),
        },
      });

      await sendWhatsApp(telefone, respostaDespesasFixas);
      await sendWhatsApp(telefone, respostaResumoDespesas);
      await sendWhatsApp(telefone, respostaProximaEtapa);

      return NextResponse.json({ ok: true });
    }

    const intentFinanceiro = await resolverIntencaoFinanceiraIA(mensagem, {
      temConfirmacaoPendente: Boolean(estadoAntesGasto.confirmacaoPendente),
    });
    if (intentFinanceiro) {
      const intentConfirmavel = intentFinanceiroConfirmavel(intentFinanceiro);

      if (intentConfirmavel && podeAutoRegistrarIntentFinanceiro(intentFinanceiro)) {
        await registrarIntentFinanceiroDireto(
          sessao,
          telefone,
          mensagem,
          servidorHistoricoSessao,
          estadoAntesGasto,
          intentFinanceiro,
          origemLancamentoControle,
          comprovanteUrlImagem
        );
        return NextResponse.json({ ok: true });
      }

      // Pagamento de dívida reconhecido (com credor) mas SEM valor — ex.:
      // "Já paguei a parcela do Carlos". A mensagem genérica de "reenviar
      // em lista" (pensada pra listas de despesas fixas) não faz sentido
      // aqui; pergunta o valor especificamente e guarda o credor já
      // identificado numa pendência, em vez de deixar a informação se
      // perder (bug da mesma família do "aguardar_valor_gasto", achado em
      // teste set/2026).
      if (
        !intentConfirmavel &&
        intentFinanceiro.emEscopo &&
        intentFinanceiro.itens.length === 1 &&
        intentFinanceiro.itens[0].tipo === "pagamento_divida"
      ) {
        const credorAproximado = intentFinanceiro.itens[0].descricaoNormalizada || "Dívida";
        const respostaPendencia = respostaAguardarValorPagamentoDivida(credorAproximado);
        const estadoComPendencia = criarEstadoComPendenciaPagamentoDivida(estadoAntesGasto, credorAproximado);

        await sendWhatsApp(telefone, respostaPendencia);

        await prisma.botSessao.updateMany({
          where: { id: sessao.id },
          data: {
            dividasTemp: JSON.stringify([
              ...servidorHistoricoSessao,
              { role: "user", content: mensagem },
              { role: "assistant", content: respostaPendencia },
              criarMensagemEstadoControle(estadoComPendencia),
            ]),
          },
        });

        return NextResponse.json({ ok: true });
      }

      const respostaIntent = formatarPreviaIntentFinanceiro(intentFinanceiro);
      const estadoComIntent = intentConfirmavel
        ? criarEstadoComConfirmacaoInterpretacaoFinanceira(estadoAntesGasto, intentFinanceiro)
        : estadoAntesGasto;

      await sendWhatsApp(telefone, respostaIntent);

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          dividasTemp: JSON.stringify([
            ...servidorHistoricoSessao,
            { role: "user", content: mensagem },
            { role: "assistant", content: respostaIntent },
            ...(intentConfirmavel
              ? [criarMensagemEstadoControle(estadoComIntent)]
              : []),
          ]),
        },
      });

      return NextResponse.json({ ok: true });
    }

    const gastoRapido = registrarGastoControle(mensagem, estadoAntesGasto, new Date(), lancamentosRecentesControle);
    if (gastoRapido) {
      await sendWhatsApp(telefone, gastoRapido.resposta);

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          dividasTemp: JSON.stringify([
            ...servidorHistoricoSessao,
            { role: "user", content: mensagem },
            { role: "assistant", content: gastoRapido.resposta },
            ...(gastoRapido.atualizouEstado ? [criarMensagemEstadoControle(gastoRapido.estado)] : []),
          ]),
        },
      });

      after(() => persistirLancamentosControle(sessao.clienteId, gastoRapido.itensParaPersistir, origemLancamentoControle, comprovanteUrlImagem));

      return NextResponse.json({ ok: true });
    }

    // Decisão do Ibrahim (set/2026): sem onboarding guiado, não existe mais
    // "aguardando a primeira resposta de renda" — quem quiser
    // atualizar/declarar a renda mensal usa a correção explícita
    // (corrigirRendaControle, mais acima na cascata: "minha renda é 3000",
    // "corrigir renda pra 3000"), não esse fallback genérico. Constante
    // travada em false pelo mesmo motivo do aguardandoRendaControle acima.
    const aguardandoRendaControleDepoisDoGasto = false;

    const rendaControle = extrairRendaControle(mensagem, aguardandoRendaControleDepoisDoGasto);
    if (rendaControle) {
      const respostaRenda = mensagemRendaRegistradaControle(rendaControle);
      const perguntaDespesas = mensagemPedidoDespesasFixasControle();
      const explicacaoDespesas = mensagemExplicarDespesasFixasControle();

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          etapa: ETAPA_AGUARDANDO_DESPESAS_FIXAS,
          renda: rendaControle,
          dividasTemp: JSON.stringify([
            ...servidorHistoricoSessao,
            { role: "user", content: mensagem },
            { role: "assistant", content: respostaRenda },
            { role: "assistant", content: perguntaDespesas },
            { role: "assistant", content: explicacaoDespesas },
          ]),
        },
      });

      await sendWhatsApp(telefone, respostaRenda);
      await sendWhatsApp(telefone, perguntaDespesas);
      await sendWhatsApp(telefone, explicacaoDespesas);

      return NextResponse.json({ ok: true });
    }

    if (detectarComando(mensagem) === "COBRAR") {
      if (!sessao.clienteId) {
        await sendWhatsApp(telefone,
          "⚠️ Apenas assinantes do QuitaZAP podem usar o Cobrador Automático.\n\n" +
          "Acesse *www.quitazap.com.br* e assine para liberar essa função! 🚀"
        );
        return NextResponse.json({ ok: true });
      }

      await sendWhatsApp(telefone, "⏳ Processando sua cobrança...");

      const dados = await parsearComandoCobrar(mensagem);

      // Se não conseguiu extrair nada minimamente útil
      if (!dados) {
        await sendWhatsApp(telefone,
          "Não entendi quem você quer cobrar. 😅\n\n" +
          "Me manda assim:\n" +
          "*Cobrar [Nome], [WhatsApp], R$[valor], dia [X]*\n\n" +
          "Exemplo: _Cobrar João, 71999999999, R$500, dia 20_\n\n" +
          "Pode mandar por áudio também! 🎤"
        );
        return NextResponse.json({ ok: true });
      }

      // Se faltam campos obrigatórios, pede de forma conversacional
      const faltando = dados.camposFaltando ?? [];
      if (faltando.length > 0 || !dados.devedorFone || !dados.valor) {
        const partesFaltando: string[] = [];
        if (!dados.devedorNome) partesFaltando.push("o *nome* de quem deve");
        if (!dados.devedorFone) partesFaltando.push("o *WhatsApp* de quem deve");
        if (!dados.valor || dados.valor === 0) partesFaltando.push("o *valor* da dívida");

        const nomeMencionado = dados.devedorNome ? `*${dados.devedorNome}*` : "essa pessoa";
        await sendWhatsApp(telefone,
          `Entendi que você quer cobrar ${nomeMencionado}! 👍\n\n` +
          `Só preciso saber mais ${partesFaltando.length === 1 ? "uma coisa" : "algumas coisas"}:\n\n` +
          partesFaltando.map((p) => `• ${p}`).join("\n") +
          `\n\nMe manda os dados que eu registro a cobrança! 😊`
        );
        return NextResponse.json({ ok: true });
      }

      // Calcula data de vencimento
      const hojeC = new Date();
      let dataVenc: Date;
      if (dados.enviarAgora) {
        dataVenc = hojeC; // Vencimento hoje = envio imediato
      } else {
        dataVenc = new Date(hojeC.getFullYear(), hojeC.getMonth(), dados.diaVencimento);
        if (dataVenc < hojeC) {
          dataVenc = new Date(hojeC.getFullYear(), hojeC.getMonth() + 1, dados.diaVencimento);
        }
      }

      // Busca nome e telefone do credor
      const credor = await prisma.cliente.findUnique({
        where: { id: sessao.clienteId },
        select: { nome: true, telefone: true },
      });

      const credorNome = credor?.nome ?? sessao.nome ?? "QuitaZAP";
      const pixChave   = dados.pixChave ?? null;

      const cobranca = await prisma.cobranca.create({
        data: {
          clienteId:   sessao.clienteId,
          credorNome,
          devedorNome: dados.devedorNome,
          devedorFone: dados.devedorFone,
          valor:       dados.valor,
          vencimento:  dataVenc,
          mensagem:    dados.mensagemCustom ?? null,
          pixChave,
          status:      dados.enviarAgora ? "ENVIADA" : "PENDENTE",
          etapa:       1,
          ultimoEnvio: dados.enviarAgora ? new Date() : null,
          tentativas:  dados.enviarAgora ? 1 : 0,
        },
      });

      const fmtValor = dados.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const fmtData  = dataVenc.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

      // Se "enviar agora", dispara imediatamente para o devedor
      if (dados.enviarAgora) {
        try {
          const msgDevedor =
            `Oi *${dados.devedorNome}*! 👋\n\n` +
            `*${credorNome}* está te lembrando de um compromisso financeiro:\n\n` +
            `💰 *Valor:* ${fmtValor}\n` +
            `📅 *Vencimento:* hoje\n` +
            (dados.mensagemCustom ? `\n💬 _"${dados.mensagemCustom}"_\n` : "") +
            (pixChave ? `\nPara pagar via Pix: 🔑 *${pixChave}*` : "") +
            `\n\n──────────────────\n` +
            `💬 _Mensagem enviada pelo QuitaZAP_\n` +
            `👉 www.quitazap.com.br`;
          await sendWhatsApp(dados.devedorFone, msgDevedor);
          console.log(`[COBRAR] Enviado imediatamente para ${dados.devedorNome} (${dados.devedorFone})`);
        } catch (err) {
          console.error("[COBRAR] Erro ao enviar imediatamente:", err);
        }

        await sendWhatsApp(telefone,
          `✅ *Cobrança enviada agora!*\n\n` +
          `👤 *Devedor:* ${dados.devedorNome}\n` +
          `📞 *WhatsApp:* ${dados.devedorFone}\n` +
          `💰 *Valor:* ${fmtValor}\n` +
          (pixChave ? `🔑 *Chave Pix:* ${pixChave}\n` : "") +
          (dados.mensagemCustom ? `💬 *Mensagem:* "${dados.mensagemCustom}"\n` : "") +
          `\nSe não pagar, reenvio automático em *+3 dias* (mais firme) e *+7 dias* (última chance). 📲`
        );
      } else {
        await sendWhatsApp(telefone,
          `✅ *Cobrança agendada!*\n\n` +
          `👤 *Devedor:* ${dados.devedorNome}\n` +
          `📞 *WhatsApp:* ${dados.devedorFone}\n` +
          `💰 *Valor:* ${fmtValor}\n` +
          `📅 *Vencimento:* dia ${fmtData}\n` +
          (pixChave ? `🔑 *Chave Pix:* ${pixChave}\n` : "") +
          (dados.mensagemCustom ? `💬 *Mensagem:* "${dados.mensagemCustom}"\n` : "") +
          `\nA mensagem será enviada automaticamente no dia ${fmtData}. 📲\n` +
          `Se não pagar, reenvio automático em *+3* e *+7 dias* com tom diferente.`
        );
      }

      console.log(`[COBRAR] id=${cobranca.id} devedor=${dados.devedorNome} valor=${dados.valor} enviarAgora=${dados.enviarAgora}`);
      return NextResponse.json({ ok: true });
    }

    // ── Comando VER_COBRANCAS ────────────────────────────────────────────────
    if (detectarComando(mensagem) === "VER_COBRANCAS" && sessao.clienteId) {
      const cobrancas = await prisma.cobranca.findMany({
        where: { clienteId: sessao.clienteId, status: { not: "CANCELADA" } },
        orderBy: { vencimento: "asc" },
        take: 10,
      });

      if (cobrancas.length === 0) {
        await sendWhatsApp(telefone,
          "📋 Você ainda não tem cobranças cadastradas.\n\n" +
          "Para cobrar alguém, use:\n" +
          "*Cobrar [Nome], [número], R$[valor], dia [dia]*\n\n" +
          "Exemplo: Cobrar João, 71999999999, R$500, dia 20"
        );
        return NextResponse.json({ ok: true });
      }

      const fmtStatus: Record<string, string> = {
        PENDENTE: "⏳ Pendente",
        ENVIADA: "📤 Enviada",
        PAGA: "✅ Paga",
        CANCELADA: "❌ Cancelada",
      };

      let lista = `📋 *Suas Cobranças:*\n\n`;
      for (const c of cobrancas) {
        const valor = c.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const venc  = c.vencimento.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        const st    = fmtStatus[c.status] ?? c.status;
        lista += `👤 *${c.devedorNome}* — ${valor} — dia ${venc} — ${st}\n`;
      }
      const linkPainel = urlPainelCobrador(sessao.clienteId);
      lista += `\n\n📊 *Seu painel completo:*\n${linkPainel}`;

      await sendWhatsApp(telefone, lista);
      return NextResponse.json({ ok: true });
    }

    // ── Comando MEU_PAINEL ───────────────────────────────────────────────────
    if (detectarComando(mensagem) === "MEU_PAINEL" && sessao.clienteId) {
      const link = urlPainelCobrador(sessao.clienteId);
      await sendWhatsApp(telefone,
        `📊 *Seu Painel de Cobranças*\n\n` +
        `Acesse suas cobranças direto pelo link:\n` +
        `👉 ${link}\n\n` +
        `_O link é exclusivo para você e não expira._ 🔐\n\n` +
        `Dica: salve o link nos favoritos do celular para acesso rápido! 📌`
      );
      return NextResponse.json({ ok: true });
    }

       // ── Comando DIAGNOSTICO ───────────────────────────────────────────────
    if (detectarComando(mensagem) === "DIAGNOSTICO") {
      if (!sessao.clienteId) {
        await sendWhatsApp(
          telefone,
          "Ainda não encontrei seu cadastro ativo. Me chame depois da ativação do acesso para eu gerar seu diagnóstico. ✅"
        );
        return NextResponse.json({ ok: true });
      }

      const ultimoPlano = await prisma.planoEnviado.findFirst({
        where: { clienteId: sessao.clienteId },
        orderBy: { id: "desc" },
      });

      if (!ultimoPlano?.texto) {
        await sendWhatsApp(
          telefone,
          "Ainda não tenho um diagnóstico salvo para você. Vamos completar sua renda, despesas e dívidas para eu gerar seu diagnóstico financeiro. ✅"
        );
        return NextResponse.json({ ok: true });
      }

      if (ultimoPlano.texto.length > 3800) {
        const partes = dividirMensagem(ultimoPlano.texto, 3800);
        for (const parte of partes) {
          await sendWhatsApp(telefone, parte);
          await new Promise((r) => setTimeout(r, 800));
        }
      } else {
        await sendWhatsApp(telefone, ultimoPlano.texto);
      }

      return NextResponse.json({ ok: true });
    }

    // ── Comando QUITASCORE ──────────────────────────────────────────────────
    if (detectarComando(mensagem) === "QUITASCORE") {
      if (!sessao.clienteId || !sessao.renda) {
        await sendWhatsApp(
          telefone,
          `Ainda não temos seu diagnóstico completo. Me conta sua situação financeira e eu gero seu QuitaScore! 😊`
        );
        return NextResponse.json({ ok: true });
      }

      const dividasDb = await prisma.divida.findMany({
        where: { clienteId: sessao.clienteId, status: "ATIVA" },
        select: {
          credor: true,
          valorTotal: true,
          valorPago: true,
          tipo: true,
          emAtraso: true,
          diasAtraso: true,
          obs: true,
        },
      });

      const diagParcial: import("@/lib/ai-bot").DiagnosticoIA = {
        dadosPessoais: { nome: sessao.nome ?? "", vinculo: "", dependentes: 0 },
        renda: { salarioLiquido: sessao.renda, totalFamiliar: sessao.renda },
        dividas: dividasDb.map((d) => {
          const m = (d.obs ?? "").match(/R\$\s*(\d[\d.,]*)/);
          const valorParcela = m ? parseMoneyBR(m[1]) ?? d.valorTotal : d.valorTotal;

          return {
            credor: d.credor,
            tipo: normalizarTipoDividaIA(d.tipo),
            valorOriginal: d.valorTotal,
            saldoAtual: d.valorTotal - d.valorPago,
            valorParcela,
            parcelasRestantes: 0,
            emAtraso: d.emAtraso,
            diasAtraso: d.diasAtraso ?? 0,
            obs: d.obs ?? "",
          };
        }),
        cartoes: [],
        despesasFixas: [],
        despesasVariaveis: [],
        emprestimos: [],
        patrimonio: { reservaEmergencia: 0 },
        objetivos: { objetivoPrincipal: "" },
        alertas: {},
      };

      await sendWhatsApp(telefone, gerarQuitaScore(diagParcial));
      return NextResponse.json({ ok: true });
    }

    // ── Comandos rápidos (responde sem reativar sessão) ──
    const comando = detectarComando(mensagem);

    // AJUDA funciona sempre, independente de ter renda ou não
    if (comando === "AJUDA") {
      await sendWhatsApp(telefone, gerarListaComandos(sessao.nome ?? "cliente"));
      return NextResponse.json({ ok: true });
    }

    if (comando && sessao.renda && sessao.renda > 0) {
      const nome = sessao.nome ?? "cliente";
      let resposta = "";

      if (sessao.clienteId) {
        const dividasDB = await prisma.divida.findMany({
          where: { clienteId: sessao.clienteId, status: "ATIVA" },
          select: { credor: true, valorTotal: true, diaVencimento: true, emAtraso: true, obs: true, tipo: true },
        });
        const totalParcelas = calcularTotalParcelas(dividasDB);
        const dividasFormatadas = dividasDB.map((d) => ({
          credor: d.credor,
          valorParcela: calcularTotalParcelas([d]),
          diaVencimento: d.diaVencimento,
          emAtraso: d.emAtraso,
          tipo: d.tipo,
          obs: d.obs,
        }));

        switch (comando) {
          case "RESUMO_MES":
            resposta = gerarResumoMensal(nome, sessao.renda, totalParcelas);
            break;
          case "DESPESAS_MES":
            resposta = gerarDespesasMes(dividasFormatadas);
            break;
          case "RECEITA_SEMANA":
            resposta = gerarResumoSemana(nome, sessao.renda, totalParcelas, "receita");
            break;
          case "GASTAR_SEMANA":
            resposta = gerarResumoSemana(nome, sessao.renda, totalParcelas, "gastar");
            break;
          case "PAGUEI": {
            // GIF de celebração + passa para IA processar a atualização
            try {
              await sendWhatsAppImage(
                telefone,
                GIF_PARABENS,
                `🎉 *Parabéns, ${nome.split(" ")[0]}!* Cada dívida quitada é uma vitória! 💚`
              );
            } catch { /* ignora erro no GIF, continua */ }
            // Deixa cair para a IA processar (não retorna aqui)
            break;
          }
        }
      }

      if (resposta) {
        await sendWhatsApp(telefone, resposta);
        return NextResponse.json({ ok: true });
      }
    }

    // ── Último recurso: pedido de lembrete em linguagem natural ───────────
    // Só chega aqui depois que toda a cascata determinística (gasto,
    // confirmação, fatura, comandos de menu...) já não reconheceu a
    // mensagem — detectarComandoTarefa (lá em cima) só bate com prefixo
    // explícito ("tarefa:"/"lembrete:"). Antes de cair pro papo genérico,
    // vale checar se não é um "me lembra de pagar a luz dia 10" disfarçado.
    // devePularFallbackLembreteIA protege duas quedas intencionais que já
    // aconteceram mais acima: PAGUEI (linha ~1914, cai de propósito pra IA
    // atualizar a dívida) e CONCLUIR/CANCELAR sem tarefa encontrada (linha
    // ~975) — sem isso, esse fallback "roubaria" essas mensagens e criaria
    // um Tarefa/Pagamento novo em vez de deixar o destino original acontecer.
    const tipoLembreteIA = devePularFallbackLembreteIA(comandoTarefa, comando)
      ? null
      : await classificarLembreteLivreIA(mensagem);
    if (tipoLembreteIA) {
      const prefixo = tipoLembreteIA === "PAGAMENTO" ? "pagamento" : "lembrete";
      const comandoTarefaIA = detectarComandoTarefa(`${prefixo}: ${mensagem}`);
      if (comandoTarefaIA) {
        const origemMensagemTarefaIA = tipoEntrada === "audio" ? "AUDIO" : "TEXTO";
        const respostaTarefaIA = await processarComandoTarefa(sessao.clienteId, comandoTarefaIA, origemMensagemTarefaIA);
        if (respostaTarefaIA) {
          await sendWhatsApp(telefone, respostaTarefaIA);
          return NextResponse.json({ ok: true });
        }
      }
    }

    // Reativa sessão se plano já gerado
    if (sessao.etapa === "PLANO_GERADO") {
      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: { etapa: "COLETANDO_DIVIDAS" },
      });
      sessao.etapa = "COLETANDO_DIVIDAS";
    }

    // ── Processa com IA ──────────────────────
    const historico: Mensagem[] = JSON.parse(sessao.dividasTemp || "[]");

    // Busca se cliente é gratuito para log de IA
    let clienteGratuito = false;
    if (sessao.clienteId) {
      const cli = await prisma.cliente.findUnique({
        where: { id: sessao.clienteId },
        select: { gratuito: true },
      });
      clienteGratuito = cli?.gratuito ?? false;
    }

    const resultado = await processarMensagemIA(
      historico,
      mensagem,
      sessao.nome ?? "cliente",
      sessao.clienteId,
      clienteGratuito,
      telefone
    );

    const historicoAtualizado: Mensagem[] = [
      ...historico,
      { role: "user", content: mensagem },
    ];

    // ── Resposta conversacional (rescue ladder) ──────────────
    // processarMensagemIA não gera mais diagnóstico algum (ver ai-bot.ts) —
    // src/lib/plano.ts e diagnostico-normalizer.ts seguem sem uso aqui,
    // mas cobertos por teste de regressão porque o comando QUITASCORE
    // ainda usa os tipos DividaIA/DiagnosticoIA a partir de Divida reais.
    await prisma.botSessao.updateMany({
      where: { id: sessao.id },
      data: {
        dividasTemp: JSON.stringify([
          ...historicoAtualizado,
          { role: "assistant", content: resultado.resposta },
        ]),
      },
    });

    await sendWhatsApp(telefone, resultado.resposta);

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("[Z-API] Erro no webhook:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function dividirMensagem(texto: string, maxChars: number): string[] {
  const partes: string[] = [];
  const linhas = texto.split("\n");
  let atual = "";

  for (const linha of linhas) {
    if ((atual + "\n" + linha).length > maxChars) {
      if (atual) partes.push(atual.trim());
      atual = linha;
    } else {
      atual = atual ? atual + "\n" + linha : linha;
    }
  }

  if (atual.trim()) partes.push(atual.trim());
  return partes;
}
