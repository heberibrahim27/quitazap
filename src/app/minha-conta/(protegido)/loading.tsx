// Sem isso, toda navegação entre páginas do Controle (clicar num link do
// menu, abrir um cartão, etc) ficava com a tela "parada" sem nenhum feedback
// enquanto o Server Component da próxima página buscava dados no banco —
// parecia travado mesmo quando o servidor respondia rápido. Esse arquivo cria
// automaticamente um boundary de Suspense pra toda a árvore de rotas
// protegidas, então o Next mostra isso na hora, antes mesmo da próxima
// página terminar de carregar.
export default function CarregandoMinhaConta() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        minHeight: "60vh",
        padding: "60px 0",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/minha-conta/logo-simbolo.webp"
        alt=""
        width={46}
        height={42}
        style={{ animation: "mc-pulso 1.3s ease-in-out infinite" }}
      />
      <svg width="72" height="22" viewBox="0 0 72 22" style={{ overflow: "visible" }}>
        <path
          d="M3 12 Q 12 2, 21 12 T 39 12 T 57 12 T 69 12"
          fill="none"
          stroke="#1E63E9"
          strokeWidth="3"
          strokeLinecap="round"
          className="mc-rabisco-path"
        />
      </svg>
      <style>{`
        @keyframes mc-pulso {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.88); opacity: 0.7; }
        }
        .mc-rabisco-path {
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          animation: mc-rabisco 1.3s ease-in-out infinite;
        }
        @keyframes mc-rabisco {
          0% { stroke-dashoffset: 100; }
          45%, 55% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -100; }
        }
      `}</style>
    </div>
  );
}
