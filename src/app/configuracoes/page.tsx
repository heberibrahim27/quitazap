import Link from "next/link";
import { redirect } from "next/navigation";
import { verificarSenhaAdmin, definirSenhaAdmin, temSenhaAdminDefinida } from "@/lib/admin-auth";
import { IconSettings, IconLogout, IconCheckCircle, IconAlertTriangle } from "@/components/icons";

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { ok, erro } = await searchParams;
  const jaTemSenhaPropria = await temSenhaAdminDefinida();

  async function trocarSenha(formData: FormData) {
    "use server";

    const senhaAtual = String(formData.get("senhaAtual") || "");
    const senhaNova = String(formData.get("senhaNova") || "");
    const senhaNovaConfirmar = String(formData.get("senhaNovaConfirmar") || "");

    if (!(await verificarSenhaAdmin(senhaAtual))) {
      redirect("/configuracoes?erro=atual");
    }
    if (senhaNova.length < 8) {
      redirect("/configuracoes?erro=curta");
    }
    if (senhaNova !== senhaNovaConfirmar) {
      redirect("/configuracoes?erro=confirmacao");
    }

    await definirSenhaAdmin(senhaNova);
    redirect("/configuracoes?ok=1");
  }

  const mensagemErro: Record<string, string> = {
    atual: "Senha atual incorreta.",
    curta: "A senha nova precisa ter pelo menos 8 caracteres.",
    confirmacao: "A confirmação não bateu com a senha nova.",
  };

  return (
    <div>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Configurações</h1>
          <p className="qa-page-subtitle">Gerencie o acesso ao painel do QuitaZAP.</p>
        </div>
      </div>

      <div className="qa-card" style={{ maxWidth: 460, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span className="qa-nav-icon"><IconSettings size={16} /></span>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Senha de acesso</h2>
        </div>
        <p style={{ fontSize: 13, color: "var(--qa-gray-400)", marginBottom: 18 }}>
          {jaTemSenhaPropria
            ? "Você já definiu sua própria senha. Pode trocar a qualquer momento aqui."
            : "Você ainda está usando a senha padrão configurada no servidor. Defina uma senha só sua abaixo."}
        </p>

        {ok === "1" && (
          <div className="qa-alert qa-alert-emerald">
            <IconCheckCircle size={16} /> Senha atualizada com sucesso.
          </div>
        )}
        {erro && mensagemErro[erro] && (
          <div className="qa-alert qa-alert-red">
            <IconAlertTriangle size={16} /> {mensagemErro[erro]}
          </div>
        )}

        <form action={trocarSenha} style={{ display: "grid", gap: 16 }}>
          <div className="qa-input-group">
            <input type="password" name="senhaAtual" placeholder=" " required autoComplete="current-password" />
            <label>Senha atual</label>
          </div>
          <div className="qa-input-group">
            <input type="password" name="senhaNova" placeholder=" " required minLength={8} autoComplete="new-password" />
            <label>Senha nova (mínimo 8 caracteres)</label>
          </div>
          <div className="qa-input-group">
            <input type="password" name="senhaNovaConfirmar" placeholder=" " required minLength={8} autoComplete="new-password" />
            <label>Confirmar senha nova</label>
          </div>
          <button type="submit" className="qa-btn-primary" style={{ marginTop: 4 }}>
            Salvar senha nova
          </button>
        </form>
      </div>

      <div className="qa-card" style={{ maxWidth: 460, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <strong style={{ display: "block", marginBottom: 4 }}>Encerrar sessão</strong>
          <span style={{ fontSize: 13, color: "var(--qa-gray-400)" }}>Você precisará digitar a senha novamente para acessar.</span>
        </div>
        <Link href="/logout" className="qa-btn-secondary">
          <IconLogout size={15} /> Sair
        </Link>
      </div>
    </div>
  );
}
