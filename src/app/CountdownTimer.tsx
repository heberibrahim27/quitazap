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

  const blocos = partes
    ? [
        { valor: unidade(partes.h), rotulo: "H" },
        { valor: unidade(partes.m), rotulo: "M" },
        { valor: unidade(partes.s), rotulo: "S" },
      ]
    : [
        { valor: "--", rotulo: "H" },
        { valor: "--", rotulo: "M" },
        { valor: "--", rotulo: "S" },
      ];

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {blocos.map((b) => (
        <div key={b.rotulo} style={{ flex: 1, textAlign: "center" }}>
          <div style={{
            background: "#f1f5f9", borderRadius: 6, padding: "8px 0",
            fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#0f172a",
          }}>
            {b.valor}
          </div>
          <div style={{ marginTop: 3, fontSize: 9.5, color: "#94a3b8", fontWeight: 600 }}>{b.rotulo}</div>
        </div>
      ))}
    </div>
  );
}
