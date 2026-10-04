import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { clienteIdDoTokenPrimeiroAcesso, verificarTokenPrimeiroAcesso } from "@/lib/primeiro-acesso";
import { anton, inter } from "../entrar/fontes";
import "../entrar/entrar.css";
import { CARTAO_SEM_FOTO } from "./estilo";
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
    <div className={`qz-entrar ${inter.className} qz-fast`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="qz-bg-photo" src="/minha-conta/login-fundo.jpg" alt="" />
      <div className="qz-bg-scrim" />

      <div className="qz-stage">
        <div className="qz-zone-top">
          <div className="qz-brand-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="qz-brand-logo" src="/minha-conta/logo-simbolo.webp" alt="QuitaZAP" />
            <div className="qz-brand-sub">Minha Conta</div>
          </div>
          <h1 className={`qz-headline ${anton.className}`}>
            <span><em>Bem-vindo ao</em></span>
            <span><em>QuitaZAP.</em></span>
          </h1>
        </div>

        <div className="qz-zone-mid">
          <div className="qz-scene">
            {problema ? (
              <div className="qz-login-card" style={CARTAO_SEM_FOTO}>
                <div className="qz-error-banner">{MENSAGENS_LINK[problema]}</div>
                <Link href="/minha-conta/entrar" className="qz-forgot-link" style={{ textAlign: "center" }}>
                  Ir para o login
                </Link>
              </div>
            ) : (
              <PrimeiroAcessoForm token={token} />
            )}
          </div>
        </div>

        <div className="qz-zone-bottom">
          <a href="/privacidade" style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)", textDecoration: "underline" }}>
            Privacidade e Termos de Uso
          </a>
        </div>
      </div>
    </div>
  );
}
