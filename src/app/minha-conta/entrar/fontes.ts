import { Anton, Inter } from "next/font/google";

// Anton: headline "Seu dinheiro, sob controle." — condensada, peso forte.
// Inter: todo o resto da tela (marca, campos, links, botão).
export const anton = Anton({ subsets: ["latin"], weight: "400", display: "swap" });
export const inter = Inter({ subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });
