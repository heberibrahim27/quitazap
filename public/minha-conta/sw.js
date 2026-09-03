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

// ── Push notifications ──────────────────────
// Payload sempre é um JSON simples { titulo, corpo, url } (ver
// src/lib/push-service.ts) — nunca dado financeiro sensível na notificação
// em si, só o aviso ("categoria X estourou o orçamento", por exemplo).
self.addEventListener("push", (event) => {
  let dados = { titulo: "QuitaZAP", corpo: "Você tem uma novidade no app." };
  try {
    if (event.data) dados = { ...dados, ...event.data.json() };
  } catch {
    // payload não veio em JSON — usa o texto puro como corpo
    if (event.data) dados.corpo = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: "/minha-conta/icons/icon-192.png",
      badge: "/minha-conta/icons/icon-192.png",
      data: { url: dados.url || "/minha-conta" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/minha-conta";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if (janela.url.includes(url) && "focus" in janela) return janela.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
