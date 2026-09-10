"use client";

import { useEffect, useRef, useState } from "react";

// Instrumentação do bug de teclado no chat (recomendação do ChatGPT depois
// de 4 tentativas de correção "no escuro" — parar de adivinhar e capturar a
// geometria real durante a transição). Só ativa com ?debug=1 na URL (ver
// page.tsx) — nunca roda em uso normal. Guarda leituras num buffer em ref
// (nunca em state — re-renderizar a cada evento mascararia o próprio bug
// que estamos tentando capturar) e só empurra pra tela quando o cliente
// pede pra ver/copiar o log. Nunca captura texto de mensagem nem valor
// financeiro — só números de geometria/layout e o nome/classe do elemento
// focado (nunca o valor dele).
//
// V2 (10/09/2026) — ampliado depois de uma auditoria própria no V1 (achados
// registrados aqui pra não perder o porquê):
// - V1 lia a geometria de forma síncrona, direto no handler do evento — em
//   alguns navegadores isso pode capturar um layout que ainda não foi
//   commitado pro frame. Agora toda leitura passa por requestAnimationFrame,
//   inclusive a primeira (antes só o follow-up de +400ms usava rAF).
// - V1 só tinha UM follow-up (+400ms) pra qualquer evento. Agora
//   focusin/focusout — os dois momentos que mais importam pra esse bug —
//   ganham 3 follow-ups (+100/+300/+700ms), cobrindo a transição inteira do
//   teclado (tipicamente ~250-300ms) com margem antes e depois.
// - V1 não tinha ResizeObserver nenhum — só reagia a resize/scroll da
//   window e do visualViewport. Elementos podem recalcular layout (ex: o
//   flexbox do shell) sem disparar um desses dois eventos. Agora observa
//   shell/lista/compositor diretamente.
// - V1 só media shell/compositor/campo. Agora mede também o cabeçalho, a
//   lista de mensagens (geometria completa, não só scroll) e o container
//   pai (.mc-main) — um ancestral mudando de tamanho é um suspeito válido
//   que V1 não conseguia flagrar.
// - V1 não registrava orientação, o <meta name="viewport"> efetivo,
//   scrollX da window, nem largura/offsetLeft do visualViewport. Todos
//   adicionados.
// - V1 não registrava qual elemento estava focado em cada leitura (só dava
//   pra inferir pelo nome do evento) — agora grava tagName+className do
//   activeElement (nunca o valor digitado).
// - V1 tinha buffer sem limite — numa sessão de teste longa isso cresce sem
//   parar. Agora capado (LIMITE_BUFFER), descartando as leituras mais
//   antigas quando estoura.

const LIMITE_BUFFER = 600;

type Geom = {
  rect: { top: number; left: number; right: number; bottom: number; width: number; height: number };
  position: string;
  top: string; bottom: string; left: string; right: string;
  height: string; minHeight: string; maxHeight: string;
  padding: string; margin: string;
  transform: string;
  overflow: string; overflowX: string; overflowY: string;
  boxSizing: string;
} | null;

type Leitura = {
  t: number;
  evento: string;
  displayModeStandalone: boolean;
  navigatorStandalone: boolean | null;
  orientacao: string | null;
  metaViewportContent: string | null;
  windowInnerHeight: number;
  windowInnerWidth: number;
  windowScrollX: number;
  windowScrollY: number;
  documentClientWidth: number;
  documentClientHeight: number;
  scrollingElementScrollTop: number;
  scrollingElementScrollHeight: number;
  scrollingElementClientHeight: number;
  vvWidth: number | null;
  vvHeight: number | null;
  vvOffsetLeft: number | null;
  vvOffsetTop: number | null;
  vvPageTop: number | null;
  vvScale: number | null;
  mcTeclado: string;
  elementoFocado: string | null;
  shell: Geom;
  header: Geom;
  lista: Geom;
  composer: Geom;
  campo: Geom;
  containerPai: Geom;
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
    top: cs.top, bottom: cs.bottom, left: cs.left, right: cs.right,
    height: cs.height, minHeight: cs.minHeight, maxHeight: cs.maxHeight,
    padding: cs.padding, margin: cs.margin,
    transform: cs.transform,
    overflow: cs.overflow, overflowX: cs.overflowX, overflowY: cs.overflowY,
    boxSizing: cs.boxSizing,
  };
}

// Descreve o elemento focado sem nunca expor o que foi digitado nele —
// só tag + classe (ex: "TEXTAREA.mc-chat-composer-campo").
function descreverFocado(): string | null {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const classe = typeof el.className === "string" ? el.className : "";
  return `${el.tagName}${classe ? `.${classe.split(" ").join(".")}` : ""}`;
}

function capturarLeitura(evento: string, inicio: number): Leitura {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const lista = document.querySelector(".mc-chat-lista");
  const metaViewport = document.querySelector('meta[name="viewport"]');
  return {
    t: Math.round(performance.now() - inicio),
    evento,
    displayModeStandalone: typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches,
    navigatorStandalone: typeof navigator !== "undefined" ? ((navigator as unknown as { standalone?: boolean }).standalone ?? null) : null,
    orientacao: screen.orientation?.type ?? (typeof window.orientation === "number" ? String(window.orientation) : null),
    metaViewportContent: metaViewport?.getAttribute("content") ?? null,
    windowInnerHeight: window.innerHeight,
    windowInnerWidth: window.innerWidth,
    windowScrollX: window.scrollX,
    windowScrollY: window.scrollY,
    documentClientWidth: document.documentElement.clientWidth,
    documentClientHeight: document.documentElement.clientHeight,
    scrollingElementScrollTop: document.scrollingElement?.scrollTop ?? -1,
    scrollingElementScrollHeight: document.scrollingElement?.scrollHeight ?? -1,
    scrollingElementClientHeight: document.scrollingElement?.clientHeight ?? -1,
    vvWidth: vv?.width ?? null,
    vvHeight: vv?.height ?? null,
    vvOffsetLeft: vv?.offsetLeft ?? null,
    vvOffsetTop: vv?.offsetTop ?? null,
    vvPageTop: vv?.pageTop ?? null,
    vvScale: vv?.scale ?? null,
    mcTeclado: getComputedStyle(document.documentElement).getPropertyValue("--mc-teclado").trim(),
    elementoFocado: descreverFocado(),
    shell: medirElemento(document.querySelector(".mc-chat-shell")),
    header: medirElemento(document.querySelector(".mc-chat-header")),
    lista: medirElemento(document.querySelector(".mc-chat-lista")),
    composer: medirElemento(document.querySelector(".mc-chat-composer")),
    campo: medirElemento(document.querySelector(".mc-chat-composer-campo")),
    containerPai: medirElemento(document.querySelector(".mc-main")),
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

    function empurrar(leitura: Leitura) {
      buffer.current.push(leitura);
      // Buffer capado: numa sessão de teste longa (repetindo o toque no
      // campo várias vezes), descarta as leituras mais antigas em vez de
      // crescer sem limite — as mais recentes são sempre as relevantes
      // pro teste que está rodando agora.
      if (buffer.current.length > LIMITE_BUFFER) {
        buffer.current.splice(0, buffer.current.length - LIMITE_BUFFER);
      }
      setContagem(buffer.current.length);
    }

    // Toda leitura passa por requestAnimationFrame — inclusive a primeira,
    // não só os follow-ups — pra sempre ler o layout já commitado pro
    // frame, nunca um valor intermediário de transição.
    function registrar(evento: string) {
      requestAnimationFrame(() => empurrar(capturarLeitura(evento, inicioRef.current)));
    }

    // Só focusin/focusout ganham amostras extras cronometradas — são os
    // dois momentos que de fato disparam a transição do teclado (~250-
    // 300ms tipicamente no iOS); os outros eventos (resize/scroll/
    // ResizeObserver) já disparam repetidamente sozinhos durante essa
    // mesma transição, sem precisar de amostra sintética adicional.
    function registrarComFollowUps(evento: string) {
      registrar(evento);
      for (const atraso of [100, 300, 700]) {
        setTimeout(() => registrar(`${evento}+${atraso}ms`), atraso);
      }
    }

    const aoFocarIn = () => registrarComFollowUps("focusin");
    const aoFocarOut = () => registrarComFollowUps("focusout");
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

    // ResizeObserver nos 3 elementos que a hipótese de layout envolve
    // diretamente — cobre recálculo de tamanho que não passa por nenhum
    // evento de window/visualViewport (ex: o flexbox do shell
    // reajustando quando --mc-teclado muda).
    const alvosRO: Array<{ el: Element | null; nome: string }> = [
      { el: document.querySelector(".mc-chat-shell"), nome: "shell" },
      { el: document.querySelector(".mc-chat-lista"), nome: "lista" },
      { el: document.querySelector(".mc-chat-composer"), nome: "compositor" },
    ];
    const ro = new ResizeObserver((entradas) => {
      for (const entrada of entradas) {
        const alvo = alvosRO.find((a) => a.el === entrada.target);
        registrar(`ResizeObserver:${alvo?.nome ?? "desconhecido"}`);
      }
    });
    for (const { el } of alvosRO) {
      if (el) ro.observe(el);
    }

    registrar("montagem");

    return () => {
      document.removeEventListener("focusin", aoFocarIn);
      document.removeEventListener("focusout", aoFocarOut);
      window.removeEventListener("resize", aoRedimensionar);
      window.removeEventListener("scroll", aoRolar);
      vv?.removeEventListener("resize", aoRedimensionarVV);
      vv?.removeEventListener("scroll", aoRolarVV);
      ro.disconnect();
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
          <p className="mc-debug-teclado-aviso">
            Feche este painel antes de testar o toque no campo — ele fica por cima da tela e pode atrapalhar o próprio teste.
          </p>
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
