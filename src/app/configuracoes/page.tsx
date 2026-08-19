import Link from "next/link";

export default async function ConfiguracoesPage() {
  return (
    <main className="page-shell">
      <section style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">⚙️ Configurações</h1>
          <p className="page-subtitle">Gerencie o acesso ao sistema QuitaZAP.</p>
        </div>

        {/* Alterar senha */}
        <div style={{
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20,
          padding: 32, boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
          display: "grid", gap: 16, marginBottom: 24,
        }}>
          <h2 style={{ margin: 0, fontSize: 17, color: "#0f172a" }}>🔑 Senha de acesso</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
            A senha de acesso ao painel é definida pela variável <code>APP_SENHA</code>, configurada
            direto na Vercel (Project Settings → Environment Variables). Não existe um formulário
            aqui pra trocar — trocar direto no Vercel evita que a senha nova fique guardada em
            algum lugar inseguro do próprio app.
          </p>
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
