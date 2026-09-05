"use client";

import { createRef, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const ESTADOS = [
  { numero: "01", label: "CONTE" },
  { numero: "02", label: "A GENTE ORGANIZA" },
  { numero: "03", label: "VOCÊ ENTENDE" },
] as const;

const TEXTOS = [
  "Você manda uma mensagem contando o que gastou — do jeito que já fala com qualquer pessoa.",
  "A gente confirma na hora e guarda certinho no seu extrato, sem você precisar fazer nada.",
  "Você já sabe quanto ainda tem livre pra gastar — direto ali, na mesma conversa.",
] as const;

// Os 3 prints reais de WhatsApp que o Ibrahim mandou (tela do celular
// inteira, não uma recriação em CSS) — cada um já é a conversa completa
// naquele ponto (usuário manda o gasto → bot confirma o registro → bot
// responde quanto ainda sobra).
const FOTOS = ["/whatsapp-1.webp", "/whatsapp-2.webp", "/whatsapp-3.webp"];

// Efeito "cards empilhando com scroll" — mesmo mecanismo de
// FuncionalidadesStack.tsx (sticky no mesmo "top", card encolhe/apaga
// conforme o próximo avança, scrubado pelo scroll via Framer Motion),
// aplicado aqui aos 3 passos de "Como Funciona" com card próprio
// (foto de celular retrato + texto lado a lado, em vez do painel
// paisagem daquele componente). Só no desktop (>=768px); no mobile é
// lista sequencial simples, sem sticky, sem scale/opacity scrubado —
// mesma decisão de engenharia de não pesar no celular.
export function ComoFuncionaScroll() {
  const refsBox = useRef<Array<React.RefObject<HTMLDivElement | null>> | null>(null);
  if (!refsBox.current) {
    refsBox.current = ESTADOS.map(() => createRef<HTMLDivElement>());
  }
  const itemRefs = refsBox.current;

  return (
    <>
      {/* Desktop — cards empilhando com scroll (>=768px). */}
      <div className="qz-cf-stack-desktop">
        {ESTADOS.map((estado, i) => (
          <StackCard
            key={estado.numero}
            estado={estado}
            i={i}
            itemRef={itemRefs[i]}
            nextRef={itemRefs[i + 1]}
          />
        ))}
      </div>

      {/* Mobile — sem sticky: cada estado empilhado com a foto bem grande
          (quase a largura útil da tela, pra dar pra ler as mensagens
          dentro dela) em cima do texto (<768px). */}
      <div className="qz-cf-mobile">
        {ESTADOS.map((estado, i) => (
          <div key={estado.numero} className="qz-reveal" style={{ "--qz-delay": `${i * 90}ms` } as React.CSSProperties}>
            <div style={{
              width: "100%", maxWidth: 300, margin: "0 auto 24px", aspectRatio: "310 / 641",
              borderRadius: 28, overflow: "hidden", boxShadow: "0 24px 48px -20px rgba(15,23,42,.3)",
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={FOTOS[i]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <TextoEstado estado={estado} i={i} />
          </div>
        ))}
      </div>
    </>
  );
}

function StackCard({
  estado,
  i,
  itemRef,
  nextRef,
}: {
  estado: (typeof ESTADOS)[number];
  i: number;
  itemRef: React.RefObject<HTMLDivElement | null>;
  nextRef?: React.RefObject<HTMLDivElement | null>;
}) {
  // Sem próximo card (último da pilha) não tem quem "cubra" ele — o
  // target aqui é só um placeholder pro hook não quebrar, o resultado é
  // descartado abaixo (motion.div sem style aplicado).
  const reduzido = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll({
    target: nextRef ?? itemRef,
    offset: ["start end", "start 10vh"],
  });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.9]);
  const opacity = useTransform(scrollYProgress, [0, 1], [1, 0.45]);

  return (
    <div className="qz-cf-stack-item" ref={itemRef}>
      <motion.div className="qz-cf-stack-card" style={nextRef && !reduzido ? { scale, opacity } : undefined}>
        <div className="qz-cf-photo" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={FOTOS[i]} alt={i === 0 ? "Conversa real do QuitaZap no WhatsApp" : ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <TextoEstado estado={estado} i={i} />
      </motion.div>
    </div>
  );
}

function TextoEstado({ estado, i }: { estado: { numero: string; label: string }; i: number }) {
  return (
    <div>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.08em", marginBottom: 10 }}>
        {estado.numero} / {estado.label}
      </p>
      <p style={{ margin: 0, fontFamily: "var(--font-fraunces)", fontSize: 22, fontWeight: 500, color: "var(--ink)", lineHeight: 1.35, maxWidth: 380 }}>
        {TEXTOS[i]}
      </p>
    </div>
  );
}
