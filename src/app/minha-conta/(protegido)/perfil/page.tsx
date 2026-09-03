import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { hashSenhaCliente, verificarSenhaCliente } from "@/lib/cliente-auth";
import { subirFotoPerfil } from "@/lib/supabase-storage";
import { FotoPerfilForm } from "./FotoPerfilForm";
import { NotificacoesPush } from "../NotificacoesPush";
import { ResetTotalForm } from "./ResetTotalForm";
import { resetarDadosFinanceiros } from "./reset-actions";

export default async function PerfilPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");
  const { ok, erro } = await searchParams;

  async function salvarFotoPerfil(formData: FormData) {
    "use server";
    const clienteAtual = await getClienteAtual();
    if (!clienteAtual) redirect("/minha-conta/entrar");

    const arquivo = formData.get("foto");
    if (!(arquivo instanceof Blob) || arquivo.size === 0) {
      redirect("/minha-conta/perfil?erro=Selecione uma imagem.");
    }
    if (arquivo.size > 3 * 1024 * 1024) {
      redirect("/minha-conta/perfil?erro=Imagem muito grande (máx. 3MB).");
    }

    let url: string;
    try {
      url = await subirFotoPerfil(clienteAtual.id, arquivo);
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Falha ao enviar a foto.";
      redirect(`/minha-conta/perfil?erro=${encodeURIComponent(mensagem)}`);
    }

    await prisma.cliente.update({ where: { id: clienteAtual.id }, data: { fotoUrl: url } });
    // O avatar mora no layout (Header), não nesta página — sem isso o
    // navegador continuaria mostrando o layout em cache após o redirect,
    // com a foto antiga (ou o ícone) até uma navegação nova recarregar tudo.
    revalidatePath("/minha-conta", "layout");
    redirect("/minha-conta/perfil?ok=foto");
  }

  async function trocarSenha(formData: FormData) {
    "use server";
    const clienteAtual = await getClienteAtual();
    if (!clienteAtual) redirect("/minha-conta/entrar");

    const senhaAtual = String(formData.get("senhaAtual") || "");
    const novaSenha = String(formData.get("novaSenha") || "");
    const confirmarSenha = String(formData.get("confirmarSenha") || "");

    if (clienteAtual.senhaHash && !verificarSenhaCliente(senhaAtual, clienteAtual.senhaHash)) {
      redirect("/minha-conta/perfil?erro=Senha atual incorreta.");
    }
    if (novaSenha.length < 6) {
      redirect("/minha-conta/perfil?erro=A nova senha precisa ter pelo menos 6 caracteres.");
    }
    if (novaSenha !== confirmarSenha) {
      redirect("/minha-conta/perfil?erro=A confirmação não bate com a nova senha.");
    }

    await prisma.cliente.update({
      where: { id: clienteAtual.id },
      data: { senhaHash: hashSenhaCliente(novaSenha) },
    });
    redirect("/minha-conta/perfil?ok=senha");
  }

  return (
    <div>
      <div className="card-head">
        <p className="card-title">
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" /></svg>
          </span>
          <span className="title-label">Perfil</span>
        </p>
      </div>

      {ok === "foto" && (
        <div className="mc-card" style={{ marginBottom: 16, background: "var(--green-soft)", border: "1px solid rgba(23,166,90,0.25)" }}>
          <p style={{ margin: 0, color: "var(--green)", fontSize: 13.5, fontWeight: 600 }}>Foto de perfil atualizada.</p>
        </div>
      )}
      {ok === "senha" && (
        <div className="mc-card" style={{ marginBottom: 16, background: "var(--green-soft)", border: "1px solid rgba(23,166,90,0.25)" }}>
          <p style={{ margin: 0, color: "var(--green)", fontSize: 13.5, fontWeight: 600 }}>Senha alterada com sucesso.</p>
        </div>
      )}
      {ok === "reset" && (
        <div className="mc-card" style={{ marginBottom: 16, background: "var(--green-soft)", border: "1px solid rgba(23,166,90,0.25)" }}>
          <p style={{ margin: 0, color: "var(--green)", fontSize: 13.5, fontWeight: 600 }}>
            Dados financeiros resetados. Seu controle começa do zero a partir de agora.
          </p>
        </div>
      )}
      {erro && (
        <div className="mc-card" style={{ marginBottom: 16, background: "var(--red-soft)", border: "1px solid rgba(226,59,92,0.25)" }}>
          <p style={{ margin: 0, color: "var(--red)", fontSize: 13.5, fontWeight: 600 }}>{erro}</p>
        </div>
      )}

      <FotoPerfilForm fotoAtual={cliente.fotoUrl} enviarFoto={salvarFotoPerfil} />

      <NotificacoesPush />

      <div className="mc-card" style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--ink-dim)" }}>Nome</p>
        <p style={{ margin: "4px 0 14px", fontSize: 15, fontWeight: 700 }}>{cliente.nome}</p>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--ink-dim)" }}>Telefone</p>
        <p style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 700 }}>{cliente.telefone}</p>
        <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--ink-faint)" }}>
          Pra trocar nome ou telefone, fale com a gente pelo WhatsApp.
        </p>
      </div>

      <div className="card-head">
        <p className="card-title" style={{ fontSize: 14 }}>
          <span className="title-label">Alterar senha</span>
        </p>
      </div>
      <form action={trocarSenha} className="mc-form-card">
        {cliente.senhaHash && (
          <label className="mc-label">
            Senha atual
            <input name="senhaAtual" type="password" required className="mc-input" />
          </label>
        )}
        <label className="mc-label">
          Nova senha
          <input name="novaSenha" type="password" required minLength={6} className="mc-input" />
        </label>
        <label className="mc-label">
          Confirmar nova senha
          <input name="confirmarSenha" type="password" required minLength={6} className="mc-input" />
        </label>
        <div>
          <button type="submit" className="mc-btn-primary" style={{ border: "none", width: "100%" }}>
            Alterar senha
          </button>
        </div>
      </form>

      <div className="card-head" style={{ marginTop: 24 }}>
        <p className="card-title" style={{ fontSize: 14 }}>
          <span className="title-label">Zona de risco</span>
        </p>
      </div>
      <ResetTotalForm acao={resetarDadosFinanceiros} />
    </div>
  );
}
