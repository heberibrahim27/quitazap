import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AlertaBanner } from "@/components/AlertaBanner";

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { ok, erro } = await searchParams;

  async function alterarSenha(fd: FormData) {
    "use server";
    const senhaAtual = String(fd.get("senhaAtual") || "");
    const novaSenha  = String(fd.get("novaSenha") || "").trim();
    const confirmar  = String(fd.get("confirmar") || "").trim();

    const senhaCorreta = process.env.APP_SENHA || "quitazap2024";

    if (senhaAtual !== senhaCorreta) return redirect("/configuracoes?erro=senha_errada");
    if (!novaSenha || novaSenha.length < 4) return redirect("/configuracoes?erro=senha_curta");
    if (novaSenha !== confirmar) return redirect("/configuracoes?erro=nao_confere");

    // Atualiza o cookie com a nova senha
    const jar = await cookies();
    jar.set("qz_auth", novaSenha, {
      httpOnly: true, sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, path: "/",
    });

    redirect("/configuracoes?ok=senha");
  }

  const erros: Record<string, string> = {
    senha_errada: "Senha atual incorreta.",
    senha_curta:  "A nova senha precisa ter pelo menos 4 caracteres.",
    nao_confere:  "A nova senha e a confirmação não coincidem.",
  };

  return (
    <main className="page-shell">
      <section style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">⚙️ Configurações</h1>
          <p className="page-subtitle">Gerencie o acesso ao sistema QuitaZAP.</p>
        </div>

        {ok === "senha" && <AlertaBanner tipo="sucesso" mensagem="Senha alterada! Faça login novamente na próxima sessão." />}
        {erro && erros[erro] && <AlertaBanner tipo="erro" mensagem={erros[erro]} />}

        {/* Alterar senha */}
        <div style={{
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20,
          padding: 32, boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
          display: "grid", gap: 16, marginBottom: 24,
        }}>
          <h2 style={{ margin: 0, fontSize: 17, color: "#0f172a" }}>🔑 Alterar senha de acesso</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
            A senha atual está definida no arquivo <code>.env</code> (variável <code>APP_SENHA</code>).
            Para mudar permanentemente, edite o arquivo e reinicie o servidor.
          </p>

          <form action={alterarSenha} style={{ display: "grid", gap: 14 }}>
            <label style={labelStyle}>
              Senha atual
              <input name="senhaAtual" type="password" required style={inputStyle} placeholder="Senha atual" />
            </label>
            <label style={labelStyle}>
              Nova senha
              <input name="novaSenha" type="password" required minLength={4} style={inputStyle} placeholder="Mínimo 4 caracteres" />
            </label>
            <label style={labelStyle}>
              Confirmar nova senha
              <input name="confirmar" type="password" required style={inputStyle} placeholder="Repita a nova senha" />
            </label>
            <button type="submit" style={btnPrimary}>Alterar senha</button>
          </form>
        </div>

        {/* Sair */}
        <div style={{
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20,
          padding: 24, display: "flex", justifyContent: "space-between",
          alignItems: "center", gap: 16, flexWrap: "wrap",
        }}>
          <div>
            <strong style={{ color: "#0f172a", display: "block", marginBottom: 4 }}>Encerrar sessão</strong>
            <span style={{ fontSize: 13, color: "#64748b" }}>Você precisará digitar a senha novamente para acessar.</span>
          </div>
          <Link href="/logout" style={{
            background: "#fee2e2", color: "#991b1b", fontWeight: 700,
            padding: "10px 18px", borderRadius: 10, fontSize: 14, whiteSpace: "nowrap",
          }}>
            Sair do sistema
          </Link>
        </div>

      </section>
    </main>
  );
}

const labelStyle: React.CSSProperties = { display: "grid", gap: 6, fontWeight: 700, fontSize: 14, color: "#0f172a" };
const inputStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1", borderRadius: 12, padding: "11px 14px",
  fontSize: 15, outline: "none", background: "#f8fafc", color: "#0f172a",
};
const btnPrimary: React.CSSProperties = {
  background: "#0f172a", color: "#fff", border: "none",
  padding: "12px", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer",
};
