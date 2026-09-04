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
        gap: 10,
        // Cobre a maior parte da área de conteúdo (entre cabeçalho e menu
        // fixo embaixo) pra ficar centralizado de verdade na tela em
        // qualquer página, não só numa faixa pequena no topo.
        minHeight: "78vh",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/minha-conta/logo-simbolo.webp"
        alt=""
        width={88}
        height={80}
        style={{ animation: "mc-pulso 1.3s ease-in-out infinite" }}
      />
      <svg width="132" height="38" viewBox="0 0 132 38" style={{ overflow: "visible" }}>
        <path
          d="M5 20 Q 20 4, 35 20 T 65 20 T 95 20 T 127 20"
          fill="none"
          stroke="#1E63E9"
          strokeWidth="5"
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
          stroke-dasharray: 180;
          stroke-dashoffset: 180;
          animation: mc-rabisco 1.3s ease-in-out infinite;
        }
        @keyframes mc-rabisco {
          0% { stroke-dashoffset: 180; }
          45%, 55% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -180; }
        }
      `}</style>
    </div>
  );
}
