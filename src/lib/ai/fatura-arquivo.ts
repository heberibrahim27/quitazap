// Porta única dos dois canais (chat e WhatsApp) pra ARQUIVO de fatura (OFX/CSV):
// leitura determinística (importacao-fatura.ts) → se a estrutura for irreconhecível,
// IA lê o texto como último recurso → monta o pendente com deduplicação.
// Nunca grava dívida/gasto — quem chama guarda o pendente e pede confirmação.

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { chatCompletion, type TelemetriaIA } from "@/lib/ai/openai-client";
import { PROMPT_FATURA_IMAGEM, interpretarFaturaImagem } from "@/lib/ai/fatura-imagem";
import { decodificarTexto, lerArquivoFatura } from "@/lib/importacao-fatura";
import { montarFaturaCartaoPendente, type FaturaCartaoDetectada, type FaturaCartaoPendente } from "@/lib/fatura-cartao-flow";

const TAMANHO_MAX_TEXTO_IA = 60_000;

const PROMPT_FATURA_TEXTO = PROMPT_FATURA_IMAGEM.replace(
  /^[^\n]*\n/,
  "Abaixo está o conteúdo de um ARQUIVO exportado de fatura de cartão de crédito. Leia linha por linha, do início ao fim, e responda APENAS com JSON (sem markdown):\n"
);

export type ResultadoArquivoFatura =
  | { tipo: "nao_fatura" }
  | { tipo: "sem_emissor" }
  | { tipo: "pendente"; pendente: FaturaCartaoPendente; via: "arquivo" | "ia" };

function pareceTexto(bytes: Uint8Array): boolean {
  const amostra = bytes.subarray(0, 4000);
  return !amostra.includes(0);
}

export async function processarArquivoFatura(opts: {
  clienteId: string;
  gratuito: boolean;
  nomeArquivo: string;
  bytes: Buffer;
}): Promise<ResultadoArquivoFatura> {
  let fatura: (Omit<FaturaCartaoDetectada, "emissor"> & { emissor: string | null }) | null = null;
  let via: "arquivo" | "ia" = "arquivo";

  const lido = lerArquivoFatura(opts.nomeArquivo, opts.bytes);
  if (lido) {
    fatura = lido.fatura;
  } else if (pareceTexto(opts.bytes) && opts.bytes.length <= TAMANHO_MAX_TEXTO_IA) {
    // Estrutura que o leitor não conhece (banco novo, formato mudou): a IA lê o
    // texto, e o cliente ainda confere tudo no card antes de salvar.
    const resposta = await chatCompletion({
      model: "gpt-4o",
      mensagens: [{ role: "user", content: `${PROMPT_FATURA_TEXTO}\n\n---\n${decodificarTexto(opts.bytes)}` }],
      temperature: 0,
      maxTokens: 3000,
      telemetria: { clienteId: opts.clienteId, gratuito: opts.gratuito, skill: "fatura-arquivo-ia" } satisfies TelemetriaIA,
    });
    const porIa = interpretarFaturaImagem(resposta.conteudo, "__sem_emissor__");
    if (porIa) {
      fatura = { ...porIa, emissor: porIa.emissor === "__sem_emissor__" ? null : porIa.emissor };
      via = "ia";
    }
  }
  if (!fatura) return { tipo: "nao_fatura" };

  // Arquivo costuma trazer o nome do banco; sem ele, só assume o cartão quando
  // o cliente tem um único — nunca chuta entre vários.
  let emissor = fatura.emissor;
  if (!emissor) {
    const cartoes = await prisma.cartao.findMany({ where: { clienteId: opts.clienteId }, select: { nome: true }, take: 2 });
    if (cartoes.length !== 1) return { tipo: "sem_emissor" };
    emissor = cartoes[0].nome;
  }

  const hash = crypto.createHash("sha256").update(opts.bytes).digest("hex");
  const pendente = await montarFaturaCartaoPendente(opts.clienteId, hash, { ...fatura, emissor });
  return { tipo: "pendente", pendente, via };
}

export const MENSAGEM_ARQUIVO_NAO_RECONHECIDO =
  "Não consegui ler esse arquivo como fatura de cartão. Tenta exportar em OFX ou CSV pelo app do banco, ou me manda um print da fatura.";
export const MENSAGEM_ARQUIVO_SEM_CARTAO =
  "Li o arquivo, mas não achei o nome do banco nele. Renomeie o arquivo começando pelo banco (ex.: Nubank_fatura.csv) e envie de novo.";
