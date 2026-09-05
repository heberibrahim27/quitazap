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
      {/* Barra de digitar — sem ela a tela parava só na conversa e não
          lia como WhatsApp de verdade (faltava na primeira versão). */}
      <div className="qz-wa-inputbar" style={compacta ? { padding: "3px 5px 5px", gap: 4 } : undefined}>
        <div className="qz-wa-input-pill" style={compacta ? { padding: "2px 5px", gap: 3 } : undefined}>
          <IconeEmoji compacta={compacta} />
          <span className="qz-wa-input-placeholder" style={compacta ? { fontSize: 5.5 } : undefined}>Mensagem</span>
          <IconeClipe compacta={compacta} />
          <IconeCamera compacta={compacta} />
        </div>
        <span className="qz-wa-mic-btn" style={compacta ? { width: 16, height: 16 } : undefined}>
          <IconeMic compacta={compacta} />
        </span>
      </div>
    </div>
  );
}

function IconeEmoji({ compacta }: { compacta?: boolean }) {
  const s = compacta ? 8 : 16;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="1.6" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="8.7" cy="10" r="1" fill="#8696a0" stroke="none" />
      <circle cx="15.3" cy="10" r="1" fill="#8696a0" stroke="none" />
      <path d="M8 14.5c1 1.3 2.4 2 4 2s3-.7 4-2" strokeLinecap="round" />
    </svg>
  );
}
function IconeClipe({ compacta }: { compacta?: boolean }) {
  const s = compacta ? 8 : 16;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="1.6" style={{ flexShrink: 0 }}>
      <path d="M17 7.5 9.5 15a2.5 2.5 0 1 0 3.5 3.5l7-7a4.5 4.5 0 1 0-6.5-6.5l-7 7a6.5 6.5 0 0 0 9 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconeCamera({ compacta }: { compacta?: boolean }) {
  const s = compacta ? 8 : 16;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="1.6" style={{ flexShrink: 0 }}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}
function IconeMic({ compacta }: { compacta?: boolean }) {
  const s = compacta ? 9 : 16;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#fff" style={{ flexShrink: 0 }}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <rect x="11.1" y="17" width="1.8" height="4" fill="#fff" />
    </svg>
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
