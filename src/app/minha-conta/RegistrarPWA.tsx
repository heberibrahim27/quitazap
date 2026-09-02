"use client";

import { useEffect } from "react";

// Registra o service worker só quando o navegador dá suporte — silencioso
// em caso de erro (não é crítico pro app funcionar, só habilita instalar
// como PWA e a tela de fallback offline).
export function RegistrarPWA() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/minha-conta/sw.js", { scope: "/minha-conta/" }).catch(() => {});
    }
  }, []);

  return null;
}
