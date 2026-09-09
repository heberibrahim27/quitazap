// ─────────────────────────────────────────
// QuitaZAP — Entrega de lembrete (texto e/ou áudio)
// ─────────────────────────────────────────
// Camada única entre os crons (cron/lembretes, cron/tarefas) e o WhatsApp —
// pedido do Ibrahim (09/09/2026), arquitetura validada com o ChatGPT: os
// crons continuam só montando a mensagem determinística de sempre, sem
// saber de OpenAI/base64/modo de entrega. Regra inegociável: o lembrete em
// TEXTO nunca pode deixar de sair por causa de um áudio que falhou — texto
// é sempre o fallback, nunca o contrário.
//
// Kill switch global (FEATURE_AUDIO_REMINDERS=false desliga áudio pra todo
// mundo na hora, sem precisar mexer em Cliente.modoLembrete de ninguém) +
// opt-in por cliente (Cliente.modoLembrete, padrão "TEXTO" — ninguém recebe
// áudio sem pedir).
// ─────────────────────────────────────────

import { sendWhatsApp, sendWhatsAppAudio } from "./zapi";
import { gerarAudioLembrete } from "./tts";

export type ModoLembrete = "TEXTO" | "AUDIO" | "TEXTO_E_AUDIO";

function audioHabilitadoGlobalmente(): boolean {
  return process.env.FEATURE_AUDIO_REMINDERS !== "false";
}

/**
 * Entrega um lembrete já pronto (texto determinístico, igual ao que os
 * crons sempre montaram) respeitando a preferência do cliente:
 * - "TEXTO": só texto (comportamento de sempre).
 * - "AUDIO": tenta só áudio; se TTS ou envio falhar, cai pra texto.
 * - "TEXTO_E_AUDIO": manda texto primeiro (a parte crítica já garantida) e
 *   depois tenta áudio por cima, best-effort — se o áudio falhar aqui o
 *   texto já foi entregue, então só loga o erro.
 */
export async function deliverReminder(params: {
  phone: string;
  mensagem: string;
  modo?: string | null;
}): Promise<void> {
  const { phone, mensagem } = params;
  const modo: ModoLembrete =
    audioHabilitadoGlobalmente() && (params.modo === "AUDIO" || params.modo === "TEXTO_E_AUDIO")
      ? (params.modo as ModoLembrete)
      : "TEXTO";

  if (modo === "TEXTO") {
    await sendWhatsApp(phone, mensagem);
    return;
  }

  if (modo === "TEXTO_E_AUDIO") {
    await sendWhatsApp(phone, mensagem);
    try {
      const audio = await gerarAudioLembrete(mensagem);
      if (audio) await sendWhatsAppAudio(phone, audio.toString("base64"));
    } catch (err) {
      console.error("[REMINDER-DELIVERY] Áudio extra falhou (texto já foi entregue):", err);
    }
    return;
  }

  // modo === "AUDIO" — texto só entra como fallback se algo falhar.
  try {
    const audio = await gerarAudioLembrete(mensagem);
    if (!audio) throw new Error("TTS não retornou áudio");
    await sendWhatsAppAudio(phone, audio.toString("base64"));
  } catch (err) {
    console.error("[REMINDER-DELIVERY] Áudio falhou, caindo pra texto:", err);
    await sendWhatsApp(phone, mensagem);
  }
}

// Palavras de negação que, perto de "audio" ou "texto", invertem o sentido
// (bug real encontrado em teste 09/09/2026: "não quero mais lembrete em
// áudio, prefiro em texto" estava ligando áudio, porque a versão antiga só
// olhava se a palavra "audio" aparecia em algum lugar da frase, sem levar
// negação em conta — e "audio" era checado antes de "texto", então qualquer
// frase de cancelamento que citasse as duas palavras batia errado).
const NEGACAO = "nao|sem|cancela|cancelar|desativa|desativar|desliga|desligar|tira|tirar|para de|pare de|chega de|nada de";
const NEG_PERTO_DE_AUDIO = new RegExp(`\\b(${NEGACAO})\\b[^.!?]{0,25}\\baudio\\b`);
const NEG_PERTO_DE_TEXTO = new RegExp(`\\b(${NEGACAO})\\b[^.!?]{0,25}\\btexto\\b`);

/** Reconhece o cliente pedindo pra trocar o modo de entrega do lembrete no
 * meio de uma conversa de texto qualquer — funciona em qualquer etapa,
 * igual ao comando RESETAR. Escopo enxuto de propósito: só alterna entre
 * TEXTO e AUDIO (o modo TEXTO_E_AUDIO fica só pra ajuste manual por ora).
 * Se a frase pedir os dois ao mesmo tempo sem dar pra saber qual prevalece
 * (nenhum dos dois negado), não arrisca palpite — devolve null e a
 * mensagem segue o fluxo normal, sem trocar nada. */
export function detectarComandoModoLembrete(mensagem: string): "AUDIO" | "TEXTO" | null {
  const texto = mensagem
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // remove acentos: "áudio" → "audio"

  if (!texto.includes("lembrete")) return null;

  const querAudio = texto.includes("audio") && !NEG_PERTO_DE_AUDIO.test(texto);
  const querTexto = texto.includes("texto") && !NEG_PERTO_DE_TEXTO.test(texto);

  if (querAudio && !querTexto) return "AUDIO";
  if (querTexto && !querAudio) return "TEXTO";
  return null; // nenhuma menção clara, ou pediu as duas sem negar nenhuma — ambíguo
}
