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
        alignItems: "center",
        justifyContent: "center",
        minHeight: "40vh",
        padding: "60px 0",
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          border: "3px solid rgba(30,99,233,0.15)",
          borderTopColor: "#1E63E9",
          animation: "mc-spin 0.7s linear infinite",
        }}
      />
      <style>{`@keyframes mc-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
