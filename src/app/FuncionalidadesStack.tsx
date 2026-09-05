"use client";

import { createRef, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

type Item = { titulo: string; texto: string; imagem?: string };

// Efeito "cards empilhando com scroll" (referência "Parallax Clean" que o
// Ibrahim mandou, mecanismo original em GSAP + ScrollTrigger, portado pra
// Framer Motion): cada card é position:sticky no MESMO "top" — por isso,
// ao rolar, cada novo card gruda na mesma posição da tela e visualmente
// empilha por cima do anterior. O card de trás encolhe (scale 1→0.9) e
// apaga um pouco (opacity 1→0.45) conforme o PRÓXIMO card avança do
// rodapé da tela (start) até quase o topo (end) — scrubado, ligado direto
// ao progresso do scroll, sem duração fixa. Só no desktop (>=768px); no
// mobile vira uma lista sequencial simples, sem sticky, pra não pesar.
export function FuncionalidadesStack({ itens }: { itens: Item[] }) {
  const refsBox = useRef<Array<React.RefObject<HTMLDivElement | null>> | null>(null);
  if (!refsBox.current) {
    refsBox.current = itens.map(() => createRef<HTMLDivElement>());
  }
  const itemRefs = refsBox.current;

  return (
    <>
      <div className="qz-feat-stack-desktop">
        {itens.map((item, i) => (
          <StackCard
            key={item.titulo}
            item={item}
            index={i}
            itemRef={itemRefs[i]}
            nextRef={itemRefs[i + 1]}
          />
        ))}
      </div>

      <div className="qz-feat-stack-mobile">
        {itens.map((item, i) => (
          <div key={item.titulo} className="qz-reveal qz-feat-stack-card" style={{ "--qz-delay": `${i * 60}ms` } as React.CSSProperties}>
            <ConteudoCard item={item} index={i} />
          </div>
        ))}
      </div>
    </>
  );
}

function StackCard({
  item,
  index,
  itemRef,
  nextRef,
}: {
  item: Item;
  index: number;
  itemRef: React.RefObject<HTMLDivElement | null>;
  nextRef?: React.RefObject<HTMLDivElement | null>;
}) {
  // Sem próximo card (último da pilha) não tem quem "cubra" ele, então
  // fica parado em scale/opacity cheios — o target aqui é só um
  // placeholder pro hook não quebrar, o resultado é descartado abaixo.
  const { scrollYProgress } = useScroll({
    target: nextRef ?? itemRef,
    offset: ["start end", "start 10vh"],
  });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.9]);
  const opacity = useTransform(scrollYProgress, [0, 1], [1, 0.45]);

  return (
    <div className="qz-feat-stack-item" ref={itemRef}>
      <motion.div className="qz-feat-stack-card" style={nextRef ? { scale, opacity } : undefined}>
        <ConteudoCard item={item} index={index} />
      </motion.div>
    </div>
  );
}

function ConteudoCard({ item, index }: { item: Item; index: number }) {
  return (
    <>
      <div className="qz-feat-stack-content">
        <div>
          <p style={{ margin: "0 0 8px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "#cbd5e1" }}>
            {String(index + 1).padStart(2, "0")}
          </p>
          <p style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 800, color: "#0f172a" }}>{item.titulo}</p>
          <p style={{ margin: 0, fontSize: 15, color: "#64748b", lineHeight: 1.6 }}>{item.texto}</p>
        </div>
      </div>
      <div className="qz-feat-stack-imgwrap">
        {item.imagem ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imagem} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          /* Placeholder — sem screenshot real batendo com essa
             funcionalidade ainda. */
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(160deg, #0a2e18 0%, #041a0c 100%)",
          }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.05em" }}>
              PRINT DO APP EM BREVE
            </span>
          </div>
        )}
      </div>
    </>
  );
}
