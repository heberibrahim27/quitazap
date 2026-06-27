// ─────────────────────────────────────────
// QuitaZAP — Serviço Z-API (WhatsApp)
// Docs: https://developer.z-api.io
// ─────────────────────────────────────────

const INSTANCE     = process.env.ZAPI_INSTANCE ?? "";
const TOKEN        = process.env.ZAPI_TOKEN ?? "";
const CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN ?? "";

/**
 * Envia uma mensagem de texto via Z-API.
 * @param phone  Número completo com DDI: "5511999999999"
 * @param message Texto da mensagem (suporta *negrito* e _itálico_ do WhatsApp)
 */
export async function sendWhatsApp(phone: string, message: string) {
  if (!INSTANCE || INSTANCE === "SUA_INSTANCIA_AQUI") {
    console.warn("[Z-API] Credenciais não configuradas — mensagem não enviada.");
    console.log(`[Z-API MOCK] Para: ${phone}\n${message}`);
    return;
  }

  const url = `https://api.z-api.io/instances/${INSTANCE}/token/${TOKEN}/send-text`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(CLIENT_TOKEN ? { "Client-Token": CLIENT_TOKEN } : {}),
    },
    body: JSON.stringify({ phone, message }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Z-API error ${res.status}: ${err}`);
  }

  return res.json();
}

/**
 * Normaliza telefone para formato Z-API: só dígitos com DDI 55.
 * Suporta entradas como "11999999999", "5511999999999", "+55 (11) 99999-9999"
 */
export function normalizarTelefone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return "55" + digits;
}
