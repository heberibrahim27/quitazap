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
// "alloy" (default antigo) soou robótica/arrastada no teste real do Ibrahim
// (09/09/2026). Trocado pra "nova" por recomendação do ChatGPT — mais natural
// pra fala cotidiana/assistente em pt-BR sem soar solene. Alternativas pra
// testar via env se quiser comparar: "coral" (mais acolhedora), "shimmer"
// (mais leve), "marin"/"cedar" (vozes mais novas, se disponíveis na conta).
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || "nova";
// Ritmo levemente acima do normal — ajuda com a sensação de "arrastado" sem
// comprometer naturalidade (recomendação: começar em 1.05, não pular direto
// pra 1.15 — velocidade sozinha não resolve prosódia, só ajuda o ritmo).
const OPENAI_TTS_SPEED = Number(process.env.OPENAI_TTS_SPEED) || 1.05;

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
        speed: OPENAI_TTS_SPEED,
        response_format: "mp3",
        // Instructions reescritas (09/09/2026) por recomendação do ChatGPT —
        // a versão anterior ("tom natural, calmo e direto — lembrete sério")
        // ainda soou de locutor/URA no teste real. Pedir explicitamente pra
        // soar como nota de voz de WhatsApp (não locução) foi o que mudou.
        instructions:
          "Fale em português brasileiro natural e conversacional, como uma pessoa enviando uma nota de voz curta pelo WhatsApp. Use ritmo normal e fluido, levemente ágil. Não fale devagar, não faça pausas longas e não use tom de locutor, propaganda, telemarketing ou atendimento eletrônico. Seja claro e tranquilo, sem dramatizar. Leia valores e datas naturalmente.",
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
