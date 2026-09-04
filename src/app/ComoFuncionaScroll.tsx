"use client";

import { useEffect, useRef, useState } from "react";

const ESTADOS = [
  { numero: "01", label: "REGISTRE" },
  { numero: "02", label: "ORGANIZAMOS" },
  { numero: "03", label: "ENTENDA" },
] as const;

// Narrativa guiada por scroll: celular fica fixo (sticky no desktop) e o
// conteúdo da tela muda conforme cada "estado" entra na viewport. O que
// controla a troca é o IntersectionObserver observando 3 blocos-gatilho —
// não um listener de scroll recalculando a cada pixel (isso seria caro e
// arriscado pra performance mobile antes do lançamento).
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
    "O QuitaZap organiza tudo sozinho: o lançamento aparece certinho no seu extrato.",
    "Você pergunta antes de gastar de novo, e já sabe exatamente quanto ainda tem livre.",
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

function TelaCelular({ estado, compacta }: { estado: number; compacta?: boolean }) {
  const padX = compacta ? 8 : 20;
  const padY = compacta ? 10 : 0;
  const fontBase = compacta ? 7 : 13.5;
  if (estado === 0) {
    return (
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#0d1610,#070a08)", display: "flex", alignItems: "flex-end", paddingTop: padY, paddingLeft: padX, paddingRight: padX, paddingBottom: compacta ? 14 : 32 }}>
        <div style={{ background: "#dcf8c6", borderRadius: compacta ? "6px 6px 2px 6px" : "12px 12px 2px 12px", padding: compacta ? "5px 7px" : "10px 14px", fontSize: fontBase, color: "#1f2937", maxWidth: "85%" }}>
          Gastei R$ 87,50 no mercado.
        </div>
      </div>
    );
  }
  if (estado === 1) {
    return (
      <div style={{ position: "absolute", inset: 0, background: "#0a0f0b", paddingTop: compacta ? 18 : 40, paddingLeft: padX, paddingRight: padX, paddingBottom: padY, display: "flex", flexDirection: "column" as const, gap: compacta ? 4 : 10 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: compacta ? 6 : 10, color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em" }}>EXTRATO</span>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.06)", borderRadius: compacta ? 6 : 10, padding: compacta ? "6px 8px" : "12px 14px" }}>
          <span style={{ fontSize: fontBase, color: "#fff", fontWeight: 600 }}>Mercado</span>
          <span style={{ fontSize: fontBase, color: "var(--accent)", fontWeight: 700 }}>R$ 87,50</span>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: compacta ? 6 : 9.5, color: "var(--accent)", letterSpacing: "0.05em" }}>REGISTRADO ✓</span>
      </div>
    );
  }
  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#0a2e18,#041a0c)", display: "flex", alignItems: "center", justifyContent: "center", paddingTop: padY, paddingBottom: padY, paddingLeft: padX, paddingRight: padX }}>
      <p style={{ margin: 0, textAlign: "center", fontFamily: "var(--font-fraunces)", fontStyle: "italic", fontWeight: 500, fontSize: compacta ? 11 : 22, color: "#fff", lineHeight: 1.3 }}>
        Você ainda tem <span style={{ color: "var(--accent)" }}>R$ 1.630</span> disponíveis.
      </p>
    </div>
  );
}
