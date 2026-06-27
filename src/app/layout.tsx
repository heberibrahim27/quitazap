import "./globals.css";
import { Navbar } from "@/components/Navbar";

export const metadata = {
  title: "QuitaZAP MVP",
  description: "Sistema interno para organizar dividas e gerar plano de quitacao pelo WhatsApp.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <Navbar />
        {children}
      </body>
    </html>
  );
}
