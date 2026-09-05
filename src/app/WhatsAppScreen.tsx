// Réplica fiel da interface do WhatsApp (cabeçalho, papel de parede,
// bolhas com timestamp e check duplo) — usada nas telas de celular do
// Como Funciona e do WhatsApp+Painel. Antes disso os "mockups" eram
// bolhas genéricas sem cabeçalho, sem alinhamento remetente/destinatário
// e sem check — não pareciam WhatsApp de verdade (feedback direto do
// Ibrahim: "ainda um lixo"). Cores e proporções aqui são as reais do
// WhatsApp (cabeçalho #075E54, bolha enviada #D9FDD3, papel de parede
// #E5DDD5, check lido #53BDEB), não uma reinterpretação "inspirada em".

export function WhatsAppScreen({ compacta, children }: { compacta?: boolean; children: React.ReactNode }) {
  return (
    <div className="qz-wa-screen">
      {/* paddingTop maior que o padding lateral pra empurrar o conteúdo
          pra baixo do notch do celular (.qz-phone-notch-band), que fica
          sobreposto (z-index) sobre os primeiros 24px (ou 14px no modo
          compacto) da tela — sem isso o nome "QuitaZap" ficava cortado
          atrás do notch. */}
      <div className="qz-wa-header" style={{
        paddingTop: compacta ? 16 : 30,
        paddingBottom: compacta ? 4 : 8,
        paddingLeft: compacta ? 6 : 12,
        paddingRight: compacta ? 6 : 12,
        gap: compacta ? 5 : 8,
      }}>
        <span className="qz-wa-avatar" style={compacta ? { width: 14, height: 14, fontSize: 6 } : undefined}>Q</span>
        <div className="qz-wa-header-info">
          <span className="qz-wa-header-name" style={compacta ? { fontSize: 6.5 } : undefined}>QuitaZap</span>
          <span className="qz-wa-header-status" style={compacta ? { fontSize: 4.5 } : undefined}>online</span>
        </div>
      </div>
      <div className="qz-wa-body" style={compacta ? { padding: "6px 5px", gap: 3 } : undefined}>
        {children}
      </div>
    </div>
  );
}

export function WhatsAppBubble({
  text,
  time,
  out,
  compacta,
}: {
  text: string;
  time: string;
  out?: boolean;
  compacta?: boolean;
}) {
  return (
    <div className={`qz-wa-row ${out ? "qz-wa-out" : "qz-wa-in"}`}>
      <div
        className={`qz-wa-bubble ${out ? "qz-wa-out" : "qz-wa-in"}`}
        style={compacta ? { fontSize: 6, padding: "3px 4px 2px", borderRadius: 4 } : undefined}
      >
        {text}
        <span className="qz-wa-meta" style={compacta ? { fontSize: 4.2, marginTop: 1, gap: 1 } : undefined}>
          {time}
          {out && <span className="qz-wa-check">✓✓</span>}
        </span>
      </div>
    </div>
  );
}
