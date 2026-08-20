import { redirect } from "next/navigation";

// /oferta virou a raiz do site (quitazap.com.br). Mantém essa rota como
// redirecionamento pra não quebrar link antigo (anúncio, bio de rede
// social, etc) que já esteja apontando pra cá — preserva a query string
// (utm_source, fbclid...) pro anúncio continuar rastreável.
export default async function OfertaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (Array.isArray(valor)) valor.forEach((v) => query.append(chave, v));
    else if (valor !== undefined) query.append(chave, valor);
  }
  const destino = query.toString() ? `/?${query.toString()}` : "/";
  redirect(destino);
}
