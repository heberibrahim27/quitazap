import type { Viewport } from "next";
import "./globals.css";
import { AdminShell } from "@/components/AdminShell";

export const metadata = {
  title: "QuitaZAP MVP",
  description: "Sistema interno para organizar dividas e gerar plano de quitacao pelo WhatsApp.",
};

// viewport-fit=cover: sem isso, env(safe-area-inset-top) sempre resolve
// pra 0 no iOS — precisa disso pro Minha Conta (PWA) conseguir pintar a
// cor até debaixo da barra de status em vez de deixar uma faixa branca.
// Vem daqui (não de um <meta> manual) pra poder herdar/mesclar com o
// viewport de src/app/minha-conta/layout.tsx sem duplicar a tag.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
