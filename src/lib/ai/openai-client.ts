// ─────────────────────────────────────────
// QuitaZAP — Client OpenAI central
// ─────────────────────────────────────────
// Antes desta extração, existiam 6 chamadas HTTP cruas à OpenAI
// espalhadas em 5 arquivos (ai-bot.ts, api/webhook/zapi/route.ts,
// src/lib/ia/*.ts), cada uma reimplementando fetch/erro/log — e por isso
// Whisper e Vision nunca registravam custo em `LogIA` (só o chat de
// ai-bot.ts registrava). Este arquivo centraliza transporte, tratamento
// de erro e telemetria de custo; modelo/prompt continuam sendo decisão de
// quem chama.
//
// Migração em progresso (ver decisão de arquitetura de 2026-09-04): por
// ora só ai-bot.ts e api/webhook/zapi/route.ts (Whisper/Vision) passam
// por aqui. Os 3 arquivos de src/lib/ia/ continuam com fetch próprio até
// um próximo PR — migrar todos de uma vez não era necessário pra Sprint 1
// (critério de sucesso era só Whisper/Vision passarem a logar custo).

import { prisma } from "@/lib/prisma";

export type TelemetriaIA = {
  clienteId: string | null;
  gratuito: boolean;
  /** Nome curto de quem está chamando (ex: "diagnostico", "whisper-webhook",
   * "vision-webhook") — vira o `tipo` gravado em LogIA hoje; quando a Skill
   * Analista existir, cada submódulo passa o próprio nome aqui. */
  skill: string;
};

// Preço por 1M tokens (USD). Ajustar aqui se a OpenAI mudar preço — é o
// único lugar que precisa mudar, ao contrário de hoje (só existia hardcoded
// dentro de ai-bot.ts, só pra gpt-4o-mini).
const PRECO_POR_MILHAO_TOKENS: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o": { input: 2.50, output: 10.00 },
};
// Whisper cobra por minuto de áudio, não por token.
const PRECO_WHISPER_POR_MINUTO = 0.006;

async function registrarLogIA(opts: {
  clienteId: string | null;
  gratuito: boolean;
  tipo: string;
  tokensInput: number;
  tokensOutput: number;
  custoUSD: number;
}) {
  try {
    await prisma.logIA.create({
      data: {
        clienteId: opts.clienteId,
        gratuito: opts.gratuito,
        tipo: opts.tipo,
        tokensInput: opts.tokensInput,
        tokensOutput: opts.tokensOutput,
        custoUSD: opts.custoUSD,
      },
    });
  } catch (e) {
    console.error("[LogIA] Erro ao registrar:", e);
  }
}

function apiKeyValida(): string | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-proj-SUA")) return null;
  return apiKey;
}

export type MensagemChat = { role: "system" | "user" | "assistant"; content: unknown };

export interface ChatCompletionOpts {
  model: string;
  mensagens: MensagemChat[];
  tools?: unknown[];
  toolChoice?: "auto" | "none";
  temperature?: number;
  maxTokens?: number;
  telemetria: TelemetriaIA;
}

export interface ChatCompletionResultado {
  conteudo: string;
  toolCalls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  finishReason: string | null;
}

export async function chatCompletion(opts: ChatCompletionOpts): Promise<ChatCompletionResultado> {
  const apiKey = apiKeyValida();
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.mensagens,
      ...(opts.tools ? { tools: opts.tools, tool_choice: opts.toolChoice ?? "auto" } : {}),
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens != null ? { max_tokens: opts.maxTokens } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI chat erro ${res.status}: ${err}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const usage = data.usage ?? {};
  const preco = PRECO_POR_MILHAO_TOKENS[opts.model] ?? PRECO_POR_MILHAO_TOKENS["gpt-4o-mini"];
  const tokensInput = usage.prompt_tokens ?? 0;
  const tokensOutput = usage.completion_tokens ?? 0;

  await registrarLogIA({
    clienteId: opts.telemetria.clienteId,
    gratuito: opts.telemetria.gratuito,
    tipo: opts.telemetria.skill,
    tokensInput,
    tokensOutput,
    custoUSD: (tokensInput * preco.input + tokensOutput * preco.output) / 1_000_000,
  });

  return {
    conteudo: choice?.message?.content ?? "",
    toolCalls: choice?.message?.tool_calls,
    finishReason: choice?.finish_reason ?? null,
  };
}

export async function transcreverAudio(audioUrl: string, telemetria: TelemetriaIA): Promise<string> {
  const apiKey = apiKeyValida();
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");

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
  // verbose_json devolve `duration` (segundos) além de `text` — é o único
  // jeito de saber o custo real (Whisper cobra por minuto, não por token),
  // sem mudar o texto transcrito devolvido.
  formData.append("response_format", "verbose_json");

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
  const duracaoMinutos = (data.duration ?? 0) / 60;

  await registrarLogIA({
    clienteId: telemetria.clienteId,
    gratuito: telemetria.gratuito,
    tipo: "whisper",
    tokensInput: 0,
    tokensOutput: 0,
    custoUSD: duracaoMinutos * PRECO_WHISPER_POR_MINUTO,
  });

  return data.text?.trim() ?? "";
}

export async function analisarImagem(imageUrl: string, prompt: string, telemetria: TelemetriaIA): Promise<string> {
  const apiKey = apiKeyValida();
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
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
  const usage = data.usage ?? {};
  const preco = PRECO_POR_MILHAO_TOKENS["gpt-4o"];
  const tokensInput = usage.prompt_tokens ?? 0;
  const tokensOutput = usage.completion_tokens ?? 0;

  await registrarLogIA({
    clienteId: telemetria.clienteId,
    gratuito: telemetria.gratuito,
    tipo: "vision",
    tokensInput,
    tokensOutput,
    custoUSD: (tokensInput * preco.input + tokensOutput * preco.output) / 1_000_000,
  });

  return data.choices?.[0]?.message?.content?.trim() ?? "";
}
