import localFont from "next/font/local";

// Fonte compartilhada entre o layout protegido e a tela de login (fora do
// grupo de rotas protegidas) — uma única declaração evita duas configurações
// de next/font divergentes para a mesma família.
export const manrope = localFont({ src: "../../fonts/manrope.woff2", weight: "200 800", display: "swap" });
