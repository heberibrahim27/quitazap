import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { planilhaPorChave } from "@/lib/analytics-planilhas";
import { parsePlanilha } from "@/lib/planilha-parser";

// "/api" fica fora da checagem do middleware.ts (ver comentário em
// api/exportar/route.ts) — mesmo cookie que o middleware exige nas rotas
// admin.
const COOKIE_NAME = "qz_auth";
const COOKIE_TOKEN = "qz_autenticado";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chave: string }> }
) {
  if (req.cookies.get(COOKIE_NAME)?.value !== COOKIE_TOKEN) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { chave } = await params;
  if (!planilhaPorChave(chave)) {
    return NextResponse.json({ error: "Planilha desconhecida." }, { status: 404 });
  }

  const registro = await prisma.planilhaAnalytics.findUnique({ where: { chave } });
  return NextResponse.json({ registro });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chave: string }> }
) {
  if (req.cookies.get(COOKIE_NAME)?.value !== COOKIE_TOKEN) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { chave } = await params;
  const definicao = planilhaPorChave(chave);
  if (!definicao) {
    return NextResponse.json({ error: "Planilha desconhecida." }, { status: 404 });
  }

  const formData = await req.formData();
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }

  let linhas, metricas;
  try {
    const buffer = await arquivo.arrayBuffer();
    ({ linhas, metricas } = parsePlanilha(buffer));
  } catch {
    return NextResponse.json({ error: "Não consegui ler esse arquivo. Envie um .csv, .xlsx ou .xls válido." }, { status: 400 });
  }

  const registro = await prisma.planilhaAnalytics.upsert({
    where: { chave },
    update: { nomeArquivo: arquivo.name, linhas, metricas },
    create: { chave, nomeArquivo: arquivo.name, linhas, metricas },
  });

  // Substitui o "rebuild" de um site estático: os cards de /painel que leem
  // PlanilhaAnalytics são renderizados no servidor (force-dynamic), então
  // invalidar o cache dessas rotas já é suficiente pra refletir o arquivo
  // recém-importado na próxima visita — sem precisar de um novo deploy.
  revalidatePath("/painel");
  revalidatePath("/atualizacao-dados");

  return NextResponse.json({
    ok: true,
    nome: definicao.nome,
    nomeArquivo: registro.nomeArquivo,
    totalLinhas: metricas.totalLinhas,
    atualizadoEm: registro.atualizadoEm,
  });
}
