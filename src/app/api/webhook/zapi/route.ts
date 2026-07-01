// ─────────────────────────────────────────
// QuitaZAP — Webhook Z-API (mensagens recebidas)
// POST /api/webhook/zapi
// Suporta: texto, áudio (Whisper), imagem (GPT-4o Vision) e PDF (pdf-parse)
// ─────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp, sendWhatsAppImage, normalizarTelefone } from "@/lib/zapi";
import { processarMensagemIA, type Mensagem, type DividaIA } from "@/lib/ai-bot";
import { processarLeadVendas } from "@/lib/sales-bot";
import {
  gerarRelatorio,
  gerarResumoMensal,
  gerarResumoSemana,
  gerarDespesasMes,
  gerarListaComandos,
  gerarQuitaScore,
  calcularTotalParcelas,
} from "@/lib/plano";
import { urlPainelCobrador } from "@/lib/cobrador-token";

// GIF de celebração quando o cliente avisa que pagou uma dívida
const GIF_PARABENS = "https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif";

// Garante que o tipo da dívida seja sempre um valor aceito por DividaIA
const TIPOS_DIVIDA_IA = ["CARTAO", "EMPRESTIMO", "FINANCIAMENTO", "CHEQUE_ESPECIAL", "CREDIARIO", "LOJA", "IMPOSTO", "ALUGUEL", "ASSOCIACAO", "OUTRO"] as const;
function normalizarTipoDividaIA(tipo: string | null | undefined): DividaIA["tipo"] {
  return (TIPOS_DIVIDA_IA as readonly string[]).includes(tipo ?? "")
    ? (tipo as DividaIA["tipo"])
    : "OUTRO";
}

// ── Transcrição de áudio via Whisper ─────
async function transcreverAudio(audioUrl: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY!;

  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error(`Falha ao baixar áudio: ${audioRes.status}`);

  const audioBuffer = await audioRes.arrayBuffer();
  const contentType = audioRes.headers.get("content-type") || "audio/ogg";
  const ext = contentType.includes("mp4") ? "mp4" : contentType.includes("mpeg") ? "mp3" : "ogg";

  const audioBlob = new Blob([audioBuffer], { type: contentType });

  const formData = new FormData();
  formData.append("file", audioBlob, `audio.${ext}`);
  formData.append("model", "whisper-1");
  formData.append("language", "pt");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper erro ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.text?.trim() ?? "";
}

// ── Análise de imagem via GPT-4o Vision ──
async function analisarImagem(imageUrl: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY!;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analise esta imagem financeira. Pode ser:
- Boleto, fatura de cartão, extrato bancário, comprovante de empréstimo, carnê
- Contracheque, holerite, comprovante de salário ou folha de pagamento

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

Se a imagem NÃO for financeira, responda apenas: [NAO_FINANCEIRA]`,
            },
            {
              type: "image_url",
              image_url: { url: imageUrl, detail: "low" },
            },
          ],
        },
      ],
      max_tokens: 600,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GPT-4o Vision erro ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}
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

type PDFOutro = {
  tipo: "OUTRO";
  texto: string;
};

type PDFResult = PDFContracheque | PDFOutro;
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
    { "banco": "Nome do banco", "valorParcela": 0.00, "parcelaAtual": 0, "totalParcelas": 0 }
  ],
  "associacoes": [
    { "nome": "Nome da associação", "valorMensal": 0.00 }
  ]
}

Regras para o JSON:
- salarioLiquidoTotal = valor líquido impresso no contracheque (pode incluir 13º/férias)
- extraOrdinario = soma de 13º salário + férias + abono + qualquer verba eventual presente nas VANTAGENS. Se não houver nenhum, use 0.
- salarioLiquidoNormal = salarioLiquidoTotal - extraOrdinario (renda mensal real)
- emprestimos: o número da parcela aparece como NNN/NNN logo APÓS o nome do banco. "Empréstimo Comum 3" → o "3" é parte do nome, NÃO é a parcela. Leia o número correto.
- associacoes: incluir ASTEBA, ASSEBA, ASPRA e qualquer outra associação/mensalidade com parcela NNN/999 ou NNN/000
- NÃO incluir INSS, IR, saúde/Planserv nos arrays — esses são descontos, não dívidas

Se NÃO for contracheque (for boleto, fatura, extrato, etc), responda com:
{ "tipo": "OUTRO", "texto": "descrição do documento em português" }`,
            },
          ],
        }],
        max_tokens: 1500,
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
    console.log(`[PDF] tipo="${parsed.tipo}"`, parsed.tipo === "CONTRACHEQUE"
      ? `liq=${parsed.salarioLiquidoNormal} emp=${parsed.emprestimos.length} assoc=${parsed.associacoes.length}`
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

// ── Deduplicação de mensagens ─────────────
const mensagensProcessadas = new Set<string>();
function jáProcessou(id: string): boolean {
  if (!id) return false;
  if (mensagensProcessadas.has(id)) return true;
  mensagensProcessadas.add(id);
  if (mensagensProcessadas.size > 500) {
    const primeiro = mensagensProcessadas.values().next().value;
    if (primeiro) mensagensProcessadas.delete(primeiro);
  }
  return false;
}

// ── Webhook principal ─────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Ignora mensagens enviadas pelo próprio bot
    if (body.fromMe === true) return NextResponse.json({ ok: true });

    // Ignora duplicatas (Z-API pode enviar o mesmo webhook 2x)
    const msgId = body.messageId ?? body.message?.messageId ?? "";
    if (msgId && jáProcessou(msgId)) {
      console.log(`[Z-API] Duplicata ignorada: ${msgId}`);
      return NextResponse.json({ ok: true });
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

    if (!mensagem && tipoEntrada === "texto") return NextResponse.json({ ok: true });

    const rawPhone = body.phone ?? "";
    const telefone = normalizarTelefone(rawPhone);
    console.log(`[Z-API] phone raw="${rawPhone}" normalizado="${telefone}" tipo="${tipoEntrada}"`);
    if (telefone.length < 10) return NextResponse.json({ ok: true });

    const telefoneAlt = telefone.length === 13
      ? telefone.slice(0, 4) + telefone.slice(5)
      : telefone.length === 12
      ? telefone.slice(0, 4) + "9" + telefone.slice(4)
      : null;

    const sessao = await prisma.botSessao.findFirst({
      where: { telefone: { in: [telefone, ...(telefoneAlt ? [telefoneAlt] : [])] } }
    });

    console.log(`[Z-API] sessao=${sessao ? `id=${sessao.id} etapa=${sessao.etapa}` : "null"}`);

    if (!sessao) {
      // Verifica se é cliente cadastrado (sem sessão de bot ativa)
      const clienteCadastrado = await prisma.cliente.findFirst({
        where: { telefone: { in: [telefone, ...(telefoneAlt ? [telefoneAlt] : [])] } },
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
          where: { telefone: { in: [telefone, ...(telefoneAlt ? [telefoneAlt] : [])] } },
          select: { telefone: true },
        });
        const telefoneParaFunil = leadExistente?.telefone ?? telefone;
        console.log(`[FUNIL] raw="${rawPhone}" norm="${telefone}" alt="${telefoneAlt}" leadExistente="${leadExistente?.telefone ?? "null"}" → usando="${telefoneParaFunil}"`);
        await processarLeadVendas(telefoneParaFunil, mensagem);
      }
      return NextResponse.json({ ok: true });
    }

    // ── Verifica assinatura vencida (só para clientes pagantes) ──
    if (sessao.clienteId) {
      const clienteAtual = await prisma.cliente.findUnique({
        where: { id: sessao.clienteId },
        select: { assinaturaVenceEm: true, gratuito: true },
      });
      const venceEm = clienteAtual?.assinaturaVenceEm;
      const isGratuito = clienteAtual?.gratuito ?? false;

      if (!isGratuito && venceEm && venceEm < new Date()) {
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
        mensagem = await transcreverAudio(body.audio.audioUrl);
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
        await sendWhatsApp(sessao.telefone, "📷 Recebi sua imagem! Analisando...");
        const analise = await analisarImagem(body.image.imageUrl);
        console.log(`[Z-API] Imagem analisada: "${analise}"`);

        if (!analise || analise.includes("[NAO_FINANCEIRA]")) {
          await sendWhatsApp(sessao.telefone, "Não identifiquei informações financeiras nessa imagem. Pode me descrever a dívida em texto?");
          return NextResponse.json({ ok: true });
        }

        mensagem = analise;
      } catch (err) {
        console.error("[Z-API] Erro ao analisar imagem:", err);
        await sendWhatsApp(sessao.telefone, "Não consegui ler essa imagem. Pode digitar as informações?");
        return NextResponse.json({ ok: true });
      }
    }

    // ── Documento (PDF) ──────────────────────
    if (tipoEntrada === "documento") {
      const docUrl = body.document?.documentUrl ?? body.document?.fileUrl ?? "";
      if (!docUrl) {
        await sendWhatsApp(sessao.telefone, "Recebi um documento, mas não consegui acessar o arquivo. Pode tirar uma foto e me enviar como imagem?");
        return NextResponse.json({ ok: true });
      }
      try {
        await sendWhatsApp(sessao.telefone, "📄 Recebi seu PDF! Lendo o documento...");
        const pdfResult = await extrairPDF(docUrl);

        if (pdfResult.tipo === "CONTRACHEQUE") {
          // ── Caminho direto: monta diagnóstico sem passar pelo gpt-4o-mini ──
          const diag = buildDiagContracheque(pdfResult, sessao.nome ?? "cliente");
          const relatorio = gerarRelatorio(diag);
          const rendaTotal = diag.renda.salarioLiquido;

          const historicoComRelatorio = [
            { role: "assistant" as const, content: relatorio },
          ];

          await prisma.botSessao.updateMany({
            where: { id: sessao.id },
            data: {
              etapa: "PLANO_GERADO",
              renda: rendaTotal,
              dividasTemp: JSON.stringify(historicoComRelatorio),
            },
          });

          if (sessao.clienteId) {
            await prisma.cliente.update({
              where: { id: sessao.clienteId },
              data: { rendaMensal: rendaTotal, statusAtendimento: "PLANO_GERADO" },
            });
            await prisma.divida.deleteMany({ where: { clienteId: sessao.clienteId } });
            for (const d of diag.dividas) {
              await prisma.divida.create({
                data: {
                  clienteId: sessao.clienteId,
                  credor: d.credor,
                  valorTotal: d.saldoAtual ?? 0,
                  tipo: d.tipo ?? "OUTRO",
                  status: "ATIVA",
                  diaVencimento: null,
                  emAtraso: false,
                  obs: `${d.parcelasRestantes}x de R$${d.valorParcela} — contracheque`,
                },
              });
            }
            await prisma.planoEnviado.create({
              data: { clienteId: sessao.clienteId, texto: relatorio },
            });
          }

          const partes = relatorio.length > 3800 ? dividirMensagem(relatorio, 3800) : [relatorio];
          for (const parte of partes) {
            await sendWhatsApp(sessao.telefone, parte);
            await new Promise((r) => setTimeout(r, 1200));
          }

                    // Pergunta follow-up: se tem outras dívidas fora da folha
          // Não envia QuitaScore automaticamente aqui, porque ainda falta saber
          // se o cliente possui dívidas fora da folha.
          await new Promise((r) => setTimeout(r, 2000));
          await sendWhatsApp(
            sessao.telefone,
            `Esse foi o diagnóstico com base no seu contracheque! 📊\n\n` +
              `Você tem outras dívidas *fora da folha*? Por exemplo:\n` +
              `• Cartão de crédito\n` +
              `• Boleto em atraso\n` +
              `• Financiamento de veículo ou imóvel\n\n` +
              `Me conta que eu atualizo seu plano! 😊`
          );

          return NextResponse.json({ ok: true });
        }

        // ── PDF não é contracheque: processa como texto normalmente ──
        const texto = pdfResult.texto;
        if (!texto || texto.length < 30) {
          await sendWhatsApp(
            sessao.telefone,
            "Consegui abrir o PDF mas ele parece ser uma imagem escaneada — não consigo extrair o texto. Pode tirar uma foto do documento e enviar como imagem? 📷"
          );
          return NextResponse.json({ ok: true });
        }

        console.log(`[Z-API] PDF (outro) extraído (${texto.length} chars)`);
        mensagem = `[Cliente enviou um PDF com este conteúdo:]\n\n${texto.slice(0, 4000)}`;
        tipoEntrada = "texto";
      } catch (err) {
        console.error("[Z-API] Erro ao ler PDF:", err);
        await sendWhatsApp(
          sessao.telefone,
          "Tive dificuldade para ler esse PDF. Pode tirar uma foto e enviar como imagem? 📷"
        );
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

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: { etapa: "COLETANDO_DIVIDAS", dividasTemp: "[]", renda: null },
      });

      await sendWhatsApp(
        telefone,
        `✅ Tudo zerado! Vamos recomeçar do zero.\n\nOlá, *${sessao.nome ?? "cliente"}*! 👋\nSeu acesso ao *QuitaZAP* foi reativado.\n\nEu sou sua IA de organização financeira pelo WhatsApp.\n\nVou te ajudar a entender sua renda, despesas, dívidas e vencimentos para montar um plano de ação mais claro.\n\nPara começar, me diga:\n\nComo você trabalha hoje?\n\n1️⃣ CLT\n2️⃣ Servidor público\n3️⃣ Autônomo\n4️⃣ MEI\n5️⃣ Empresário\n6️⃣ Outro`
      );

      return NextResponse.json({ ok: true });
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
      servidorMsgNormalizada === "2" ||
      /\bservidor\b|\bservidor publico\b|\bfuncionario publico\b|\bconcursado\b|\bpolicial\b|\bpm\b|\bmunicipal\b|\bestadual\b|\bfederal\b/.test(
        servidorMsgNormalizada
      );

    if (servidorEstaRespondendoPerfilTrabalho && servidorEscolheuServidorPublico) {
      const respostaServidor = `Perfeito. ✅ Como você é servidor público, consigo analisar melhor sua situação se você enviar seu contracheque em PDF ou imagem.

Assim eu consigo identificar salário líquido, descontos em folha, consignados e margem com mais precisão.

Você prefere:

1️⃣ Enviar o contracheque agora
2️⃣ Informar os valores manualmente`;

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

    const servidorEstaEscolhendoContracheque =
      servidorHistoricoTexto.includes("enviar o contracheque agora") &&
      servidorHistoricoTexto.includes("informar os valores manualmente");

    if (servidorEstaEscolhendoContracheque && servidorMsgNormalizada === "1") {
      const respostaEnviar =
        "Perfeito. ✅ Pode enviar aqui o PDF ou a imagem do contracheque.";

      await sendWhatsApp(telefone, respostaEnviar);

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          dividasTemp: JSON.stringify([
            ...servidorHistoricoSessao,
            { role: "user", content: mensagem },
            { role: "assistant", content: respostaEnviar },
          ]),
        },
      });

      return NextResponse.json({ ok: true });
    }

    if (servidorEstaEscolhendoContracheque && servidorMsgNormalizada === "2") {
      const respostaManual = `Sem problema. ✅ Vamos informar manualmente.

Você tem alguém que depende financeiramente de você?
Pode ser filho, esposa/marido, pais ou outra pessoa.

1️⃣ Sim
2️⃣ Não`;

      await sendWhatsApp(telefone, respostaManual);

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          dividasTemp: JSON.stringify([
            ...servidorHistoricoSessao,
            { role: "user", content: mensagem },
            { role: "assistant", content: respostaManual },
          ]),
        },
      });

      return NextResponse.json({ ok: true });
    }

    // ── Comando COBRAR ───────────────────────────────────────────────────────
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
          const m = (d.obs ?? "").match(/R\$(\d+(?:[.,]\d+)?)/);
          const valorParcela = m ? parseFloat(m[1].replace(",", ".")) : d.valorTotal;

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
      clienteGratuito
    );

    const historicoAtualizado: Mensagem[] = [
      ...historico,
      { role: "user", content: mensagem },
    ];

    // ── Gera diagnóstico completo ────────────
    if (resultado.diagnostico) {
      const diag = resultado.diagnostico;
      const relatorio = gerarRelatorio(diag);
      const rendaTotal = diag.renda?.totalFamiliar ?? diag.renda?.salarioLiquido ?? 0;

      await prisma.botSessao.updateMany({
        where: { id: sessao.id },
        data: {
          etapa: "PLANO_GERADO",
          renda: rendaTotal,
          dividasTemp: JSON.stringify([
            ...historicoAtualizado,
            { role: "assistant", content: relatorio },
          ]),
        },
      });

      if (sessao.clienteId) {
        await prisma.cliente.update({
          where: { id: sessao.clienteId },
          data: { rendaMensal: rendaTotal, statusAtendimento: "PLANO_GERADO" },
        });

        for (const d of diag.dividas ?? []) {
          await prisma.divida.create({
            data: {
              clienteId: sessao.clienteId,
              credor: d.credor,
              valorTotal: d.saldoAtual ?? d.valorOriginal ?? 0,
              tipo: d.tipo ?? "OUTRO",
              status: "ATIVA",
              diaVencimento: d.diaVencimento ?? null,
              emAtraso: d.emAtraso ?? false,
              diasAtraso: d.diasAtraso ?? null,
              obs: `${d.parcelasRestantes}x de R$${d.valorParcela} — via bot QuitaZAP`,
            },
          });
        }

        await prisma.planoEnviado.create({
          data: { clienteId: sessao.clienteId, texto: relatorio },
        });
      }

      if (relatorio.length > 3800) {
        const partes = dividirMensagem(relatorio, 3800);
        for (const parte of partes) {
          await sendWhatsApp(telefone, parte);
          await new Promise((r) => setTimeout(r, 1200));
        }
      } else {
        await sendWhatsApp(telefone, relatorio);
      }

      // Envia QuitaScore
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const scoreMsg = gerarQuitaScore(resultado.diagnostico);
        await sendWhatsApp(telefone, scoreMsg);
      } catch { /* ignora erro no score */ }

      return NextResponse.json({ ok: true });
    }

    // ── Resposta conversacional ──────────────
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

    // ── Agenda resumo automático via QStash (10 min) ──
    const qstashToken = process.env.QSTASH_TOKEN;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (qstashToken && siteUrl && sessao.etapa !== "PLANO_GERADO") {
      try {
        await fetch(`https://qstash.upstash.io/v2/publish/${siteUrl}/api/cron/resumo`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${qstashToken}`,
            "Content-Type": "application/json",
            "Upstash-Delay": "600s",
          },
          body: JSON.stringify({
            telefone: sessao.telefone,
            agendadoEm: new Date().toISOString(),
          }),
        });
        console.log(`[QSTASH] Resumo agendado para ${sessao.telefone} em 10 min`);
      } catch (err) {
        console.error("[QSTASH] Erro ao agendar resumo:", err);
      }
    }

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
