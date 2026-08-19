import { Manrope } from "next/font/google";

// Fonte compartilhada entre o layout protegido e a tela de login (fora do
// grupo de rotas protegidas) — uma única declaração evita duas configurações
// de next/font/google divergentes para a mesma família.
export const manrope = Manrope({ subsets: ["latin"], weight: ["500", "600", "700", "800"] });
