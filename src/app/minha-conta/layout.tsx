import type { Metadata, Viewport } from "next";
import { RegistrarPWA } from "./RegistrarPWA";

// Layout raso, comum a /minha-conta/entrar e ao painel autenticado — só pra
// declarar o manifest da PWA e os ícones num lugar só, sem duplicar em cada
// página. O resto do site (painel admin, páginas de marketing) não usa esse
// manifest — não faz sentido oferecer "instalar" um painel interno.
export const metadata: Metadata = {
  manifest: "/minha-conta/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "QuitaZap",
  },
  icons: {
    icon: [
      { url: "/minha-conta/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/minha-conta/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/minha-conta/icons/apple-touch-icon.png",
  },
};

// Só themeColor aqui — width/initialScale já vêm do <meta viewport> manual
// no layout raiz; declarar de novo geraria duas tags <meta name="viewport">.
export const viewport: Viewport = {
  themeColor: "#071B3D",
};

export default function MinhaContaRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RegistrarPWA />
      {children}
    </>
  );
}
