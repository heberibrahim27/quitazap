// ─────────────────────────────────────────
// QuitaZap Controle — Service Worker
// ─────────────────────────────────────────
// De propósito bem enxuto: só existe pra satisfazer o requisito do Chrome
// pra instalabilidade (manifest + service worker com handler de fetch) e
// dar uma tela mínima quando o navegador abre o app sem internet. Nunca
// cacheia dado financeiro (API, RSC payload, HTML autenticado) — só a rede
// responde por isso, sempre. Cacheia só a tela de login (estática, sem
// dado do cliente) como fallback puro de "sem internet".

const CACHE = "quitazap-controle-v1";
const OFFLINE_URL = "/minha-conta/entrar";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL))
  );
});
