"use client";

import { useEffect, useRef, useState } from "react";

// Instrumentação do bug de teclado no chat (recomendação do ChatGPT depois
// de 4 tentativas de correção "no escuro" — parar de adivinhar e capturar a
// geometria real durante a transição). Só ativa com ?debug=1 na URL (ver
// page.tsx) — nunca roda em uso normal. Guarda leituras num buffer em ref
// (nunca em state — re-renderizar a cada evento mascararia o próprio bug
// que estamos tentando capturar) e só empurra pra tela quando o cliente
// pede pra ver/copiar o log. Nunca captura texto de mensagem nem valor
// financeiro — só números de geometria/layout.

type Geom = {
  rect: { top: number; left: number; right: number; bottom: number; width: number; height: number };
  position: string;
  top: string;
  bottom: string;
  height: string;
  minHeight: string;
  transform: string;
} | null;

type Leitura = {
  t: number;
  evento: string;
  displayModeStandalone: boolean;
  navigatorStandalone: boolean | null;
  windowInnerHeight: number;
  windowInnerWidth: number;
  windowScrollY: number;
  documentClientHeight: number;
  scrollingElementScrollTop: number;
  scrollingElementScrollHeight: number;
  scrollingElementClientHeight: number;
  vvHeight: number | null;
  vvOffsetTop: number | null;
  vvPageTop: number | null;
  vvScale: number | null;
  mcTeclado: string;
  shell: Geom;
  composer: Geom;
  campo: Geom;
  listaScrollTop: number | null;
  listaScrollHeight: number | null;
  listaClientHeight: number | null;
};

function medirElemento(el: Element | null): Geom {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    rect: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
    position: cs.position,
    top: cs.top,
    bottom: cs.bottom,
    height: cs.height,
    minHeight: cs.minHeight,
    transform: cs.transform,
  };
}

function capturarLeitura(evento: string, inicio: number): Leitura {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const lista = document.querySelector(".mc-chat-lista");
  return {
    t: Math.round(performance.now() - inicio),
    evento,
    displayModeStandalone: typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches,
    navigatorStandalone: typeof navigator !== "undefined" ? ((navigator as unknown as { standalone?: boolean }).standalone ?? null) : null,
    windowInnerHeight: window.innerHeight,
    windowInnerWidth: window.innerWidth,
    windowScrollY: window.scrollY,
    documentClientHeight: document.documentElement.clientHeight,
    scrollingElementScrollTop: document.scrollingElement?.scrollTop ?? -1,
    scrollingElementScrollHeight: document.scrollingElement?.scrollHeight ?? -1,
    scrollingElementClientHeight: document.scrollingElement?.clientHeight ?? -1,
    vvHeight: vv?.height ?? null,
    vvOffsetTop: vv?.offsetTop ?? null,
    vvPageTop: vv?.pageTop ?? null,
    vvScale: vv?.scale ?? null,
    mcTeclado: getComputedStyle(document.documentElement).getPropertyValue("--mc-teclado").trim(),
    shell: medirElemento(document.querySelector(".mc-chat-shell")),
    composer: medirElemento(document.querySelector(".mc-chat-composer")),
    campo: medirElemento(document.querySelector(".mc-chat-composer-campo")),
    listaScrollTop: lista?.scrollTop ?? null,
    listaScrollHeight: lista?.scrollHeight ?? null,
    listaClientHeight: lista?.clientHeight ?? null,
  };
}

export function useDebugTeclado(ativo: boolean) {
  const buffer = useRef<Leitura[]>([]);
  const inicioRef = useRef<number>(0);
  const [contagem, setContagem] = useState(0);

  useEffect(() => {
    if (!ativo) return;
    inicioRef.current = performance.now();

    function registrar(evento: string) {
      buffer.current.push(capturarLeitura(evento, inicioRef.current));
      // Segunda leitura ~400ms depois, já com a transição do teclado
      // estabilizada (pedido explícito: via requestAnimationFrame, não só
      // setTimeout cru, pra pegar o layout já pintado nesse instante).
      setTimeout(() => {
        requestAnimationFrame(() => {
          buffer.current.push(capturarLeitura(`${evento}+400ms`, inicioRef.current));
          setContagem(buffer.current.length);
        });
      }, 400);
      setContagem(buffer.current.length);
    }

    const aoFocarIn = () => registrar("focusin");
    const aoFocarOut = () => registrar("focusout");
    const aoRedimensionar = () => registrar("window:resize");
    const aoRolar = () => registrar("window:scroll");

    document.addEventListener("focusin", aoFocarIn);
    document.addEventListener("focusout", aoFocarOut);
    window.addEventListener("resize", aoRedimensionar);
    window.addEventListener("scroll", aoRolar, { passive: true });

    const vv = window.visualViewport;
    const aoRedimensionarVV = () => registrar("visualViewport:resize");
    const aoRolarVV = () => registrar("visualViewport:scroll");
    vv?.addEventListener("resize", aoRedimensionarVV);
    vv?.addEventListener("scroll", aoRolarVV);

    registrar("montagem");

    return () => {
      document.removeEventListener("focusin", aoFocarIn);
      document.removeEventListener("focusout", aoFocarOut);
      window.removeEventListener("resize", aoRedimensionar);
      window.removeEventListener("scroll", aoRolar);
      vv?.removeEventListener("resize", aoRedimensionarVV);
      vv?.removeEventListener("scroll", aoRolarVV);
    };
  }, [ativo]);

  function textoLog(): string {
    return JSON.stringify(buffer.current, null, 2);
  }

  function limpar() {
    buffer.current = [];
    setContagem(0);
  }

  return { contagem, textoLog, limpar };
}

export function PainelDebugTeclado({ buildId }: { buildId: string }) {
  const { contagem, textoLog, limpar } = useDebugTeclado(true);
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    const texto = textoLog();
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="mc-debug-teclado">
      <button type="button" className="mc-debug-teclado-toggle" onClick={() => setAberto((v) => !v)}>
        🐞 build {buildId.slice(0, 7)} · {contagem} leituras
      </button>
      {aberto && (
        <div className="mc-debug-teclado-painel">
          <div className="mc-debug-teclado-acoes">
            <button type="button" onClick={copiar}>{copiado ? "Copiado!" : "Copiar log"}</button>
            <button type="button" onClick={limpar}>Limpar</button>
          </div>
          <textarea readOnly className="mc-debug-teclado-texto" value={textoLog()} onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
    </div>
  );
}
