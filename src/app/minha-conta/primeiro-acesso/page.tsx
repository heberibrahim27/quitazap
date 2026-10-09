import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { clienteIdDoTokenPrimeiroAcesso, verificarTokenPrimeiroAcesso } from "@/lib/primeiro-acesso";
import { inter } from "../entrar/fontes";
import "../entrar/login-neo.css";
import { PrimeiroAcessoForm } from "./PrimeiroAcessoForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Criar senha — QuitaZAP" };

const MENSAGENS_LINK: Record<string, string> = {
  invalido: "Esse link não é válido. Peça um novo link de acesso.",
  expirado: "Esse link expirou. Peça um novo link de acesso.",
  "ja-usado": "Esse link já foi usado. Entre com seu telefone e sua senha.",
};

export default async function PrimeiroAcessoPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { t } = await searchParams;
  const token = (Array.isArray(t) ? t[0] : t)?.trim() ?? "";

  let problema: string | null = null;
  const clienteId = token ? clienteIdDoTokenPrimeiroAcesso(token) : null;
  if (!clienteId) {
    problema = "invalido";
  } else {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, senhaHash: true },
    });
    const resultado = cliente ? verificarTokenPrimeiroAcesso(token, cliente.id, cliente.senhaHash) : "invalido";
    if (resultado !== "ok") problema = resultado;
  }

  return (
    <div className={`qzn-entrar ${inter.className}`}>
      <div className="qzn-blob alto b1" />
      <div className="qzn-blob alto b2" />
      <div className="qzn-blob fundo b3" />

      <div className="qzn-stage">
        <div className="qzn-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="qzn-brand-logo" src="/minha-conta/logo-simbolo.webp" alt="QuitaZAP" />
          <div>
            <h1 className="qzn-title">Bem-vindo ao QuitaZAP</h1>
            <p className="qzn-sub">Crie sua senha de acesso</p>
          </div>
        </div>

        {problema ? (
          <div className="qzn-form">
            <div className="qzn-error-banner" role="alert">{MENSAGENS_LINK[problema]}</div>
            <Link href="/minha-conta/entrar" className="qzn-forgot-link" style={{ alignSelf: "center" }}>
              Ir para o login
            </Link>
          </div>
        ) : (
          <PrimeiroAcessoForm token={token} />
        )}

        <div className="qzn-foot">
          <a href="/privacidade">Privacidade e Termos de Uso</a>
        </div>
      </div>
    </div>
  );
}
