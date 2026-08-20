type Props = {
  tipo: "sucesso" | "erro" | "info";
  mensagem: string;
};

const cores = {
  sucesso: { bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.25)", color: "#6ee7b7", icone: "✅" },
  erro:    { bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.25)",  color: "#fca5a5", icone: "❌" },
  info:    { bg: "rgba(0,123,255,0.08)",  border: "rgba(0,123,255,0.25)",  color: "#7dc4ff", icone: "ℹ️" },
};

export function AlertaBanner({ tipo, mensagem }: Props) {
  const c = cores[tipo];
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 16, padding: "14px 16px", marginBottom: 20,
      display: "flex", alignItems: "center", gap: 10,
      fontSize: 13.5, fontWeight: 600, color: c.color,
    }}>
      <span>{c.icone}</span>
      <span>{mensagem}</span>
    </div>
  );
}
