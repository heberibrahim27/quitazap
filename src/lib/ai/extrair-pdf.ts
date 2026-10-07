// Leitura de PDF por IA (GPT-4o com o arquivo anexado): contracheque, boleto, fatura de
// cartão ou outro. Porta única dos dois canais (WhatsApp e chat nativo) — antes vivia
// dentro do webhook do WhatsApp, o que impedia o chat de ler PDF.
//
// Contracheque segue pausado no MVP (ver mensagem de fallback nos chamadores).

// ── Tipos para extração de PDF ──────────────────────────────────────────

export type EmprestimoConsig = {
  banco: string;
  valorParcela: number;
  parcelaAtual: number;
  totalParcelas: number;
};

export type AssociacaoConsig = {
  nome: string;
  valorMensal: number;
};

export type PDFContracheque = {
  tipo: "CONTRACHEQUE";
  orgao: string;
  salarioBruto: number;
  salarioLiquidoTotal: number;   // líquido que aparece no contracheque, pode incluir 13º
  extraOrdinario: number;        // total de 13º + férias + abonos, 0 se nenhum
  salarioLiquidoNormal: number;  // salário líquido recorrente sem verba extra
  emprestimos: EmprestimoConsig[];
  associacoes: AssociacaoConsig[];
};

export type PDFBoleto = {
  tipo: "BOLETO";
  beneficiario: string;
  valor: number;
  vencimento: string; // YYYY-MM-DD
  linhaDigitavel: string | null;
};

export type PDFParceladaFatura = {
  descricao: string;
  parcelaAtual: number;
  totalParcelas: number;
  valorParcela: number;
};

export type PDFFaturaCartao = {
  tipo: "FATURA_CARTAO";
  emissor: string;
  vencimentoFatura: string | null; // YYYY-MM-DD
  mesFatura?: string | null;
  totalFatura?: number | null;
  compras?: { descricao: string; valor: number; data: string; parcelaAtual: number | null; totalParcelas?: number | null }[];
  parceladas: PDFParceladaFatura[];
};

export type PDFOutro = {
  tipo: "OUTRO";
  texto: string;
};

export type PDFResult = PDFContracheque | PDFBoleto | PDFFaturaCartao | PDFOutro;

// Contracheque continua pausado no MVP (motivo: erro nos valores extraídos
// em alguns formatos, ver mensagem de fallback abaixo) — mas boleto
// ("Boleto Inteligente") já está ativo, ver handler de tipoEntrada
// === "documento" mais abaixo.
// ── Upload de PDF para OpenAI Files API ──────────────────────────────────

async function uploadPDFOpenAI(buffer: ArrayBuffer): Promise<{ fileId: string; apiKey: string }> {
  const apiKey = process.env.OPENAI_API_KEY!;

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

export async function extrairPDF(pdfUrl: string): Promise<PDFResult> {
  const res = await fetch(pdfUrl);
  if (!res.ok) throw new Error(`Falha ao baixar PDF: ${res.status}`);
  return extrairPDFBytes(await res.arrayBuffer());
}

function somaCompras(f: PDFFaturaCartao): number {
  return (f.compras ?? []).reduce((s, c) => s + (typeof c.valor === "number" ? c.valor : 0), 0);
}

/** |soma das compras lidas − total impresso|; null quando o documento não informa total. */
export function diferencaTotalFatura(f: PDFFaturaCartao): number | null {
  if (typeof f.totalFatura !== "number" || !Number.isFinite(f.totalFatura) || f.totalFatura <= 0) return null;
  return Math.abs(Math.round((somaCompras(f) - f.totalFatura) * 100) / 100);
}

export async function extrairPDFBytes(buffer: ArrayBuffer): Promise<PDFResult> {
  const { fileId, apiKey } = await uploadPDFOpenAI(buffer);

  try {
    const rodar = async (extra: string): Promise<PDFResult> => {
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
  "mesFatura": "AAAA-MM",
  "totalFatura": 842.30,
  "compras": [
    { "descricao": "nome da compra/loja", "valor": 139.12, "data": "AAAA-MM-DD", "parcelaAtual": null, "totalParcelas": null }
  ],
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
- mesFatura: mês de referência da fatura (ex.: "Novembro de 2026" vira "2026-11"); null se não aparecer. Se o vencimento não estiver impresso, use vencimentoFatura null e informe mesFatura.
- compras: TODA linha de cobrança da fatura, uma por linha, sem pular nenhuma: compras à vista, a linha do mês de cada parcelamento, IOF, Pix ou boleto no crédito, assinaturas, tarifas e encargos. NÃO inclua pagamentos recebidos, estornos, créditos nem o total da fatura. valor = número positivo como impresso. data = data impressa na linha no formato AAAA-MM-DD (o ano mais provável; compras nunca são futuras). parcelaAtual = o X e totalParcelas = o Y de "parcela X/Y" quando a linha é parcelada, null nos dois quando à vista. descricao sem o texto da parcela.
- totalFatura: o total de compras/lançamentos do período impresso na fatura (NÃO o saldo anterior, o pagamento mínimo nem o rotativo); null se não aparecer. A soma de compras deve bater com ele.
- REGRA DE CONFERÊNCIA: toda compra parcelada listada em parceladas TAMBÉM deve aparecer em compras (a linha do mês dela), com a data impressa. Antes de responder, confira linha por linha: o número de linhas de cobrança do documento deve ser igual ao tamanho de compras.
- Se não conseguir identificar o emissor OU (a data de vencimento e o mês da fatura) com confiança, responda com tipo "OUTRO" em vez de arriscar.

Se não for contracheque, boleto nem fatura de cartão (for extrato bancário, comprovante avulso, etc), responda com:
{ "tipo": "OUTRO", "texto": "descrição do documento em português" }` + extra,
            },
          ],
        }],
       temperature: 0,
max_tokens: 4000,
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
    };

    let resultado = await rodar("");
    // Conferência: a IA às vezes pula uma linha. Se o total impresso não bate com a soma das
    // compras lidas, relê uma vez avisando quanto falta e fica com a leitura mais próxima.
    if (resultado.tipo === "FATURA_CARTAO") {
      const dif = diferencaTotalFatura(resultado);
      if (dif != null && dif > 0.05) {
        const soma = somaCompras(resultado);
        const segunda = await rodar(
          `\n\nATENÇÃO: na leitura anterior as compras somaram R$ ${soma.toFixed(2)}, mas o total impresso na fatura é R$ ${resultado.totalFatura}. Releia o documento linha por linha procurando a(s) linha(s) de cobrança que faltou/faltaram em "compras" (diferença de R$ ${dif.toFixed(2)}).`
        );
        if (segunda.tipo === "FATURA_CARTAO") {
          const dif2 = diferencaTotalFatura(segunda);
          if (dif2 != null && dif2 < dif) resultado = segunda;
        }
      }
    }
    return resultado;

  } finally {
    await deletePDFOpenAI(fileId, apiKey);
  }
}
