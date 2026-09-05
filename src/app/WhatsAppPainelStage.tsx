"use client";

import { useEffect, useRef } from "react";

// Composição decorativa do fold WhatsApp+Painel ("depth rig" — 3 planos:
// painel atrás, celular no meio com leve rotação 3D, chips de vidro na
// frente) com parallax + spotlight reagindo ao mouse. Não usa scroll — é
// interação por ponteiro, então não compete com a decisão de cortar
// parallax contínuo ligado ao scroll (custo/risco de performance). Câmera
// "fixa"; só o que já está na tela se desloca alguns pixels/graus, e
// apenas enquanto o cursor está por cima. Desligado por completo em
// prefers-reduced-motion e em telas sem ponteiro fino (touch) — no
// celular a composição fica estática, só com a profundidade visual das
// camadas sobrepostas.
export function WhatsAppPainelStage() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dashboardRef = useRef<HTMLDivElement | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const dashboard = dashboardRef.current;
    if (!stage || !dashboard) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const handleMove = (e: PointerEvent) => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const rect = stage.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        stage.style.setProperty("--wp-px", px.toFixed(3));
        stage.style.setProperty("--wp-py", py.toFixed(3));

        // Spotlight relativo ao próprio painel, não ao estágio inteiro —
        // "segue o cursor no painel" mesmo quando o cursor está sobre
        // outra camada por cima dele.
        const dRect = dashboard.getBoundingClientRect();
        const spotX = ((e.clientX - dRect.left) / dRect.width) * 100;
        const spotY = ((e.clientY - dRect.top) / dRect.height) * 100;
        dashboard.style.setProperty("--wp-spot-x", `${spotX.toFixed(1)}%`);
        dashboard.style.setProperty("--wp-spot-y", `${spotY.toFixed(1)}%`);
        dashboard.style.setProperty("--wp-spot-o", "1");
      });
    };
    const handleLeave = () => {
      stage.style.setProperty("--wp-px", "0");
      stage.style.setProperty("--wp-py", "0");
      dashboard.style.setProperty("--wp-spot-o", "0");
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
      {/* Screenshot real da tela de Resumo do painel (auditoria de direção
          de arte apontou essa dobra como a que mais dependia de mockup
          fake — 2 linhas de texto e 5 barras desenhadas em CSS). */}
      <div ref={dashboardRef} className="qz-wp-dashboard">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/painel-resumo.webp" alt="Resumo real do painel QuitaZap" style={{ width: "100%", height: "auto", display: "block" }} />
      </div>

      <div className="qz-wp-phone">
        <div className="qz-wp-phone-photo premium-glass">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/whatsapp-2.webp" alt="Conversa real do QuitaZap no WhatsApp" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      </div>

      <div className="qz-wp-chip qz-wp-chip-1">
        <span className="qz-wp-chip-msg">“Gastei R$ 87,50 no mercado.”</span>
        <span className="qz-wp-chip-status">REGISTRADO ✓</span>
      </div>

      <div className="qz-wp-chip qz-wp-chip-2 premium-glass premium-glass--accent">
        <span className="qz-wp-chip-label">COM BASE NO QUE VOCÊ REGISTROU</span>
        <span className="qz-wp-chip-insight">
          Essa parcela reduziria sua sobra mensal em <strong>R$180</strong>.
        </span>
      </div>
    </div>
  );
}
