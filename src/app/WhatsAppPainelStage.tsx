"use client";

import { useEffect, useRef } from "react";
import { WhatsAppScreen, WhatsAppBubble } from "./WhatsAppScreen";

// Composição decorativa do fold WhatsApp+Painel: um "objeto de produto"
// (celular + fatia de painel + mensagens flutuando fora do celular) com
// leve parallax de mouse. Não usa scroll — é interação por ponteiro,
// então não compete com a decisão de cortar parallax contínuo ligado ao
// scroll (custo/risco de performance). Câmera "fixa"; só o que já está
// na tela se desloca alguns pixels, e apenas enquanto o cursor está por
// cima (prefers-reduced-motion desliga o efeito inteiro).
export function WhatsAppPainelStage() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const handleMove = (e: PointerEvent) => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const rect = stage.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        stage.style.setProperty("--wp-px", px.toFixed(3));
        stage.style.setProperty("--wp-py", py.toFixed(3));
      });
    };
    const handleLeave = () => {
      stage.style.setProperty("--wp-px", "0");
      stage.style.setProperty("--wp-py", "0");
    };

    stage.addEventListener("pointermove", handleMove);
    stage.addEventListener("pointerleave", handleLeave);
    return () => {
      stage.removeEventListener("pointermove", handleMove);
      stage.removeEventListener("pointerleave", handleLeave);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <div ref={stageRef} className="qz-wp-stage qz-reveal" aria-hidden="true" style={{ "--qz-delay": "80ms" } as React.CSSProperties}>
      <div className="qz-wp-dashboard">
        <div className="qz-wp-dash-head">
          <span>EXTRATO · SETEMBRO</span>
          <span className="qz-wp-dash-dot" />
        </div>
        <div className="qz-wp-dash-row">
          <span>Mercado</span>
          <span>R$ 87,50</span>
        </div>
        <div className="qz-wp-dash-row">
          <span>Farmácia</span>
          <span>R$ 42,00</span>
        </div>
        <div className="qz-wp-dash-bars">
          <span style={{ height: "38%" }} />
          <span style={{ height: "62%" }} />
          <span style={{ height: "45%" }} />
          <span style={{ height: "80%" }} />
          <span style={{ height: "30%" }} />
        </div>
      </div>

      <div className="qz-wp-phone">
        <div className="qz-panel-phone" style={{ width: 176, height: 364, margin: 0 }}>
          <div className="qz-phone-mock-inner">
            <div className="qz-phone-notch-band"><div className="qz-phone-notch" /></div>
            <WhatsAppScreen>
              <WhatsAppBubble text="Gastei R$ 42 na farmácia." time="14:02" out />
              <WhatsAppBubble text="Registrado! ✅ Já está no seu extrato." time="14:02" />
            </WhatsAppScreen>
          </div>
        </div>
      </div>

      <div className="qz-wp-chip qz-wp-chip-1">
        <span className="qz-wp-chip-msg">“Gastei R$ 42 na farmácia.”</span>
        <span className="qz-wp-chip-status">REGISTRADO ✓</span>
      </div>

      <div className="qz-wp-chip qz-wp-chip-2">
        <span className="qz-wp-chip-label">COM BASE NO QUE VOCÊ REGISTROU</span>
        <span className="qz-wp-chip-insight">
          Essa parcela reduziria sua sobra mensal em <strong>R$180</strong>.
        </span>
      </div>
    </div>
  );
}
