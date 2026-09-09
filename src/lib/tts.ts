// ─────────────────────────────────────────
// QuitaZAP — Texto-pra-voz (lembrete em áudio)
// ─────────────────────────────────────────
// Pedido do Ibrahim (09/09/2026): lembrete de vencimento/tarefa também pode
// sair como nota de voz no WhatsApp. Arquitetura alinhada com o ChatGPT
// (consultoria de 09/09/2026):
// - Sem LLM no caminho: a mensagem já foi montada de forma determinística
//   pelos crons (mesmo texto que iria por WhatsApp) — TTS só lê em voz alta,
//   nunca "reescreve" (evita risco de mudar valor/data por alucinação).
// - gpt-4o-mini-tts (modelo de speech atual da OpenAI) + response_format
//   mp3 — o Z-API documenta MP3 em base64 no send-audio, então não precisa
//   de FFmpeg/OGG-Opus no MVP.
// - Sem Storage: fluxo inteiro em memória (texto → Buffer → base64 → envia
//   → descarta). Nada de bucket público, signed URL nem job de limpeza.
// ─────────────────────────────────────────

const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
// Voz neutra/calma — lembrete financeiro não é propaganda.
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || "alloy";

/**
 * Remove formatação do WhatsApp (*negrito*, _itálico_, linha de traços,
 * emojis mais comuns) antes de mandar pro TTS — sem isso o áudio "lê" os
 * asteriscos e separadores em voz alta. O texto ORIGINAL (com formatação)
 * continua sendo o que vai por WhatsApp em texto — essa limpeza é só pra
 * fala.
 */
export function textoParaFala(mensagem: string): string {
  return mensagem
    .replace(/[*_~`]/g, "")
    .replace(/^─+$/gm, "")
    // Emojis mais usados nos templates de lembrete/tarefa — lista curta de
    // propósito (não é objetivo cobrir every emoji Unicode, só os que a
    // própria QuitaZAP usa nos templates).
    .replace(/[⏰📅⚠️🔔💰📋🔑💬💚👋😊✅📄🔎💳🎤📷]/gu, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ". ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Gera o áudio (MP3) de um lembrete já pronto, via OpenAI TTS. Retorna
 * `null` em qualquer falha (nunca lança) — quem chama decide o fallback
 * (ver reminder-delivery.ts: lembrete em texto SEMPRE tem que sair, áudio é
 * só uma entrega extra).
 */
export async function gerarAudioLembrete(mensagem: string): Promise<Buffer | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-proj-SUA")) return null;

  const texto = textoParaFala(mensagem);
  if (!texto) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_TTS_MODEL,
        voice: OPENAI_TTS_VOICE,
        input: texto,
        response_format: "mp3",
        instructions: "Fale em português do Brasil, tom natural, calmo e direto — como um lembrete financeiro sério, não uma propaganda.",
      }),
    });

    if (!res.ok) {
      console.error(`[TTS] Erro OpenAI ${res.status}: ${await res.text()}`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.length > 0 ? buffer : null;
  } catch (err) {
    console.error("[TTS] Erro ao gerar áudio:", err);
    return null;
  }
}
