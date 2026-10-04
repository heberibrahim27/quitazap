import type { CSSProperties } from "react";

// No login o cartão fica sobreposto à foto (position absolute); aqui não há
// foto, então ele precisa ocupar o próprio espaço.
export const CARTAO_SEM_FOTO: CSSProperties = {
  position: "relative",
  left: "auto",
  top: "auto",
  width: "min(92vw, 340px)",
  maxWidth: "none",
  margin: "0 auto",
};
