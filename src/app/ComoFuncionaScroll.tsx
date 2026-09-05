"use client";

import { useEffect, useRef, useState } from "react";
import { WhatsAppScreen, WhatsAppBubble } from "./WhatsAppScreen";

const ESTADOS = [
  { numero: "01", label: "CONTE" },
  { numero: "02", label: "A GENTE ORGANIZA" },
  { numero: "03", label: "VOCÊ ENTENDE" },
] as const;

// Narrativa guiada por scroll: celular fica fixo (sticky no desktop) e as
// mensagens da MESMA conversa vão se acumulando conforme cada "estado"
// entra na viewport — a sequência exata de 3 prints reais de WhatsApp que
// o Ibrahim mandou como referência (usuário manda o gasto → bot confirma
// o registro → bot responde quanto ainda sobra), não um mockup de app
// inventado. O que controla a troca é o IntersectionObserver observando 3
// blocos-gatilho — não um listener de scroll recalculando a cada pixel
// (isso seria caro e arriscado pra performance mobile antes do lançamento).
export function ComoFuncionaScroll() {
  const [ativo, setAtivo] = useState(0);
  const refs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const alvos = refs.current.filter((el): el is HTMLDivElement => el !== null);
    if (alvos.length === 0) return;

    const observer = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) {
            const i = refs.current.indexOf(entrada.target as HTMLDivElement);
            if (i !== -1) setAtivo(i);
          }
        }
      },
      // Cada bloco de estado tem min-height:88vh, então a intersecção precisa
      // ser medida por uma faixa fina no centro da viewport (não por uma
      // fração da altura do próprio bloco) — do contrário nunca cruza o
      // limiar (um bloco maior que a faixa nunca cobre 50% dela).
      { threshold: 0, rootMargin: "-45% 0px -45% 0px" }
    );
    alvos.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const telaAtual = <TelaCelular estado={ativo} />;

  return (
    <>
      {/* Desktop — celular sticky + narrativa guiada por scroll (>=768px). */}
      <div className="qz-cf-desktop">
        <div className="qz-cf-sticky-col">
          <div className="qz-cf-sticky-inner">
            <div className="qz-panel-phone" aria-hidden="true">
              <div className="qz-phone-mock-inner">
                <div className="qz-phone-notch-band"><div className="qz-phone-notch" /></div>
                {telaAtual}
              </div>
            </div>
          </div>
        </div>
        <div className="qz-cf-steps-col">
          {ESTADOS.map((estado, i) => (
            <div key={estado.numero} ref={(el) => { refs.current[i] = el; }} className="qz-cf-step">
              <TextoEstado estado={estado} i={i} ativo={ativo === i} />
            </div>
          ))}
        </div>
      </div>

      {/* Mobile — sem sticky de 250vh: celular pequeno embutido em cada
          estado, empilhado, conectado por uma linha fina (<768px). */}
      <div className="qz-cf-mobile">
        {ESTADOS.map((estado, i) => (
          <div key={estado.numero} className="qz-reveal" style={{ "--qz-delay": `${i * 90}ms`, display: "flex", gap: 20 } as React.CSSProperties}>
            <div style={{ flexShrink: 0, width: 84, height: 173 }}>
              <div className="qz-phone-mock-inner" style={{ borderRadius: 20 }}>
                <div className="qz-phone-notch-band" style={{ height: 14 }}><div className="qz-phone-notch" /></div>
                <TelaCelular estado={i} compacta />
              </div>
            </div>
            <TextoEstado estado={estado} i={i} ativo />
          </div>
        ))}
      </div>
    </>
  );
}

function TextoEstado({ estado, i, ativo }: { estado: { numero: string; label: string }; i: number; ativo: boolean }) {
  const textos = [
    "Você manda uma mensagem contando o que gastou — do jeito que já fala com qualquer pessoa.",
    "A gente confirma na hora e guarda certinho no seu extrato, sem você precisar fazer nada.",
    "Você já sabe quanto ainda tem livre pra gastar — direto ali, na mesma conversa.",
  ];
  return (
    <div style={{ opacity: ativo ? 1 : 0.4, transition: "opacity .4s ease" }}>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.08em", marginBottom: 10 }}>
        {estado.numero} / {estado.label}
      </p>
      <p style={{ margin: 0, fontFamily: "var(--font-fraunces)", fontSize: 22, fontWeight: 500, color: "var(--ink)", lineHeight: 1.35, maxWidth: 380 }}>
        {textos[i]}
      </p>
    </div>
  );
}

// Mesma conversa real do início ao fim (prints enviados pelo Ibrahim) — as
// mensagens vão se acumulando conforme o estado avança, não trocam de tela.
function TelaCelular({ estado, compacta }: { estado: number; compacta?: boolean }) {
  return (
    <WhatsAppScreen compacta={compacta}>
      <WhatsAppBubble text="Gastei R$ 87,50 no mercado." time="09:41" out compacta={compacta} />
      {estado >= 1 && (
        <WhatsAppBubble text="✅ OK! Registrado! 🛒 Mercado R$ 87,50" time="09:41" compacta={compacta} />
      )}
      {estado >= 2 && (
        <WhatsAppBubble text="💰 Você ainda tem R$ 1.630 disponíveis." time="09:41" compacta={compacta} />
      )}
    </WhatsAppScreen>
  );
}
