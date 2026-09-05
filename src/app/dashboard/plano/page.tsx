import { getContatoSuporte } from "@/lib/contatos-sociais";
import { PlanoPageClient } from "./PlanoPageClient";

// Revalida a cada 5min + on-demand (revalidatePath) quando o admin mexe
// em /painel/contatos.
export const revalidate = 300;

export default async function PlanoPage() {
  const contatoSuporte = await getContatoSuporte();
  return <PlanoPageClient contatoSuporte={contatoSuporte} />;
}
