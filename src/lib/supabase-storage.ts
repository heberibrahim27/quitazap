// Upload da foto de perfil do cliente pro Supabase Storage — fica só a URL
// salva no Postgres (Cliente.fotoUrl); os bytes da imagem vivem no Storage,
// separado do banco relacional, então não pesa o banco conforme a base de
// clientes cresce. Bucket "avatars" (público pra leitura, só service role
// escreve) já criado no projeto Supabase com limite de 3MB e só JPEG.
const SUPABASE_URL = "https://iubrlwngulknqacrnrce.supabase.co";
const BUCKET = "avatars";

// Bucket PRIVADO (public: false) pra foto de comprovante enviada pelo chat
// nativo — ao contrário da foto de perfil, um recibo pode ter dado sensível
// (últimos dígitos de cartão, endereço). Nunca gera URL pública: devolve só
// o CAMINHO no Storage, que fica salvo em Lancamento.comprovanteUrl como
// referência opaca — exibir a imagem de volta (quando essa tela existir)
// precisa passar por uma rota autenticada que gera uma signed URL de vida
// curta sob demanda, nunca uma permanente.
const BUCKET_COMPROVANTES = "comprovantes";

export async function subirComprovante(clienteId: string, imagemJpeg: Blob): Promise<string> {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) {
    console.error("[UPLOAD COMPROVANTE] SUPABASE_SERVICE_ROLE_KEY não configurada.");
    throw new Error("Envio de foto indisponível no momento. Tente novamente mais tarde.");
  }

  const caminho = `${clienteId}/${Date.now()}-${crypto.randomUUID()}.jpg`;
  const bytes = new Uint8Array(await imagemJpeg.arrayBuffer());

  const resposta = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET_COMPROVANTES}/${caminho}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${chave}`,
      apikey: chave,
      "Content-Type": "image/jpeg",
    },
    body: bytes,
  });

  if (!resposta.ok) {
    throw new Error(`Falha ao enviar a foto (${resposta.status}).`);
  }

  return caminho;
}

// Bucket PRIVADO separado do de comprovante — mimeType de áudio gravado
// no navegador varia por engine (webm/opus no Chrome/Android, mp4/aac no
// Safari), então a política de tipos permitidos é mais larga que a de foto
// (sempre JPEG fixo). Mesmo princípio de nunca gerar URL pública: devolve
// só o caminho.
const BUCKET_AUDIOS = "audios-chat";

export async function subirAudioChat(clienteId: string, audio: Blob): Promise<string> {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) {
    console.error("[UPLOAD AUDIO] SUPABASE_SERVICE_ROLE_KEY não configurada.");
    throw new Error("Envio de áudio indisponível no momento. Tente novamente mais tarde.");
  }

  const contentType = audio.type || "audio/webm";
  const ext = contentType.includes("mp4") ? "mp4" : contentType.includes("mpeg") ? "mp3" : contentType.includes("ogg") ? "ogg" : "webm";
  const caminho = `${clienteId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await audio.arrayBuffer());

  const resposta = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET_AUDIOS}/${caminho}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${chave}`,
      apikey: chave,
      "Content-Type": contentType,
    },
    body: bytes,
  });

  if (!resposta.ok) {
    throw new Error(`Falha ao enviar o áudio (${resposta.status}).`);
  }

  return caminho;
}

export async function subirFotoPerfil(clienteId: string, imagemJpeg: Blob): Promise<string> {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) {
    // Detalhe de configuração (nome da env var) só no log do servidor — a
    // mensagem que sobe pro cliente (via perfil/page.tsx) é o que vira texto
    // na tela, não é o lugar de expor detalhe de infraestrutura interna.
    console.error("[UPLOAD FOTO] SUPABASE_SERVICE_ROLE_KEY não configurada.");
    throw new Error("Upload de foto indisponível no momento. Tente novamente mais tarde.");
  }

  const caminho = `clientes/${clienteId}.jpg`;
  const bytes = new Uint8Array(await imagemJpeg.arrayBuffer());

  const resposta = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${caminho}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${chave}`,
      apikey: chave,
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
    },
    body: bytes,
  });

  if (!resposta.ok) {
    throw new Error(`Falha ao enviar a foto (${resposta.status}).`);
  }

  // cache-buster: mesmo caminho de sempre, então sem isso o navegador
  // continuaria mostrando a foto antiga depois de trocar
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${caminho}?v=${Date.now()}`;
}
