type Props = {
  tipo: "sucesso" | "erro" | "info";
  mensagem: string;
};

const cores = {
  sucesso: { bg: "#f0fdf4", border: "#bbf7d0", color: "#166534", icone: "✅" },
  erro:    { bg: "#fef2f2", border: "#fecaca", color: "#991b1b", icone: "❌" },
  info:    { bg: "#eff6ff", border: "#bfdbfe", color: "#1e40af", icone: "ℹ️" },
};

export function AlertaBanner({ tipo, mensagem }: Props) {
  const c = cores[tipo];
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 12, padding: "12px 16px", marginBottom: 20,
      display: "flex", alignItems: "center", gap: 10,
      fontSize: 14, fontWeight: 600, color: c.color,
    }}>
      <span>{c.icone}</span>
      <span>{mensagem}</span>
    </div>
  );
}
