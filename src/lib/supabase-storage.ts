// Upload da foto de perfil do cliente pro Supabase Storage — fica só a URL
// salva no Postgres (Cliente.fotoUrl); os bytes da imagem vivem no Storage,
// separado do banco relacional, então não pesa o banco conforme a base de
// clientes cresce. Bucket "avatars" (público pra leitura, só service role
// escreve) já criado no projeto Supabase com limite de 3MB e só JPEG.
const SUPABASE_URL = "https://iubrlwngulknqacrnrce.supabase.co";
const BUCKET = "avatars";

export async function subirFotoPerfil(clienteId: string, imagemJpeg: Blob): Promise<string> {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) {
    throw new Error("Upload de foto indisponível no momento (variável SUPABASE_SERVICE_ROLE_KEY não configurada).");
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
