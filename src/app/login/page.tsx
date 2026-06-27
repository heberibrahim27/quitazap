export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;

  return (
    <main style={{
      minHeight: "100vh", background: "#0f172a",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        background: "#ffffff", borderRadius: 24, padding: 40,
        width: "100%", maxWidth: 400,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, background: "#16a34a", borderRadius: 16,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, fontWeight: 900, color: "#fff", marginBottom: 12,
          }}>Q</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#0f172a" }}>QuitaZAP</h1>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
            Acesso restrito ao operador
          </p>
        </div>

        {erro && (
          <div style={{
            background: "#fee2e2", border: "1px solid #fecaca",
            borderRadius: 10, padding: "10px 14px", marginBottom: 20,
            color: "#991b1b", fontSize: 14, fontWeight: 600,
          }}>
            ❌ Senha incorreta. Tente novamente.
          </div>
        )}

        <form method="POST" action="/api/auth/login" style={{ display: "grid", gap: 16 }}>
          <label style={{ display: "grid", gap: 6, fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
            Senha de acesso
            <input
              name="senha"
              type="password"
              required
              autoFocus
              placeholder="Digite a senha"
              style={{
                border: "1px solid #cbd5e1", borderRadius: 12,
                padding: "12px 14px", fontSize: 16, outline: "none",
                width: "100%", background: "#f8fafc", color: "#0f172a",
              }}
            />
          </label>
          <button type="submit" style={{
            background: "#16a34a", color: "#fff", border: "none",
            padding: "14px", borderRadius: 12, fontWeight: 800,
            fontSize: 16, cursor: "pointer", width: "100%",
          }}>
            Entrar
          </button>
        </form>
      </div>
    </main>
  );
}
