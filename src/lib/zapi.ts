// ─────────────────────────────────────────
// QuitaZAP — Serviço WhatsApp
// Suporta: Z-API e Evolution API
// Troca via env var WHATSAPP_PROVIDER=evolution
// ─────────────────────────────────────────

const PROVIDER = process.env.WHATSAPP_PROVIDER ?? "zapi"; // "zapi" | "evolution"

// ── Z-API ────────────────────────────────
const ZAPI_INSTANCE     = process.env.ZAPI_INSTANCE ?? "";
const ZAPI_TOKEN        = process.env.ZAPI_TOKEN ?? "";
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN ?? "";

// ── Evolution API ────────────────────────
const EVO_URL      = process.env.EVO_URL ?? "";       // ex: https://evo.seuapp.railway.app
const EVO_INSTANCE = process.env.EVO_INSTANCE ?? "";  // nome da instância criada no painel
const EVO_APIKEY   = process.env.EVO_APIKEY ?? "";    // api key global

/**
 * Envia uma mensagem de texto via WhatsApp.
 * @param phone   Número completo com DDI: "5511999999999"
 * @param message Texto (suporta *negrito* e _itálico_ do WhatsApp)
 */
export async function sendWhatsApp(phone: string, message: string) {
  if (PROVIDER === "evolution") {
    return sendViaEvolution(phone, message);
  }
  return sendViaZapi(phone, message);
}

// ── Z-API ────────────────────────────────
async function sendViaZapi(phone: string, message: string) {
  if (!ZAPI_INSTANCE || ZAPI_INSTANCE === "SUA_INSTANCIA_AQUI") {
    console.warn("[ZAPI] Credenciais não configuradas — mensagem não enviada.");
    console.log(`[ZAPI MOCK] Para: ${phone}\n${message}`);
    return;
  }

  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ZAPI_CLIENT_TOKEN ? { "Client-Token": ZAPI_CLIENT_TOKEN } : {}),
    },
    body: JSON.stringify({ phone, message }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Z-API error ${res.status}: ${err}`);
  }

  return res.json();
}

// ── Evolution API ─────────────────────────
async function sendViaEvolution(phone: string, message: string) {
  if (!EVO_URL || !EVO_INSTANCE || !EVO_APIKEY) {
    console.warn("[EVO] Credenciais não configuradas — mensagem não enviada.");
    console.log(`[EVO MOCK] Para: ${phone}\n${message}`);
    return;
  }

  const url = `${EVO_URL}/message/sendText/${EVO_INSTANCE}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": EVO_APIKEY,
    },
    body: JSON.stringify({
      number: phone,
      text: message,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Evolution API error ${res.status}: ${err}`);
  }

  return res.json();
}

/**
 * Normaliza telefone para formato com DDI 55.
 * Suporta: "11999999999", "5511999999999", "+55 (11) 99999-9999"
 */
export function normalizarTelefone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return "55" + digits;
}
