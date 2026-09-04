"use client";

import { useEffect, useState } from "react";

const DURACAO_MS = 24 * 60 * 60 * 1000; // 24h a partir do primeiro acesso
const RESET_APOS_MS = 7 * 24 * 60 * 60 * 1000; // some por 7 dias -> reseta
const STORAGE_KEY = "qz_countdown_started_at";

function unidade(n: number) {
  return String(Math.max(n, 0)).padStart(2, "0");
}

// Countdown "evergreen" por visitante: começa a contar 24h a partir do
// primeiro acesso de cada pessoa (guardado no localStorage). Reabrir a
// página continua de onde parou — só reseta se passar 7 dias sem
// acessar. Não é uma data fixa de campanha (isso exigiria confirmação
// de prazo real), é um mecanismo consistente e verificável por visitante.
export function CountdownTimer() {
  const [restanteMs, setRestanteMs] = useState<number | null>(null);

  useEffect(() => {
    let iniciadoEm: number;
    const agora = Date.now();
    try {
      const guardado = localStorage.getItem(STORAGE_KEY);
      if (guardado && agora - Number(guardado) < RESET_APOS_MS) {
        iniciadoEm = Number(guardado);
      } else {
        iniciadoEm = agora;
        localStorage.setItem(STORAGE_KEY, String(iniciadoEm));
      }
    } catch {
      iniciadoEm = agora;
    }

    const tick = () => {
      setRestanteMs(Math.max(iniciadoEm + DURACAO_MS - Date.now(), 0));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const partes = (() => {
    if (restanteMs === null) return null;
    const totalSegundos = Math.floor(restanteMs / 1000);
    return {
      h: Math.floor(totalSegundos / 3600),
      m: Math.floor((totalSegundos % 3600) / 60),
      s: totalSegundos % 60,
    };
  })();

  const texto = partes
    ? `${unidade(partes.h)}:${unidade(partes.m)}:${unidade(partes.s)}`
    : "--:--:--";

  return (
    <span style={{
      fontFamily: "var(--font-mono, monospace)", fontSize: 13, fontWeight: 600,
      color: "rgba(255,255,255,0.85)", letterSpacing: "0.03em",
    }}>
      {texto}
    </span>
  );
}
