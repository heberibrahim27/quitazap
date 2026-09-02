import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";

// Página "em breve": Metas ainda não tem modelo no banco — criar um agora
// sem definir primeiro o contrato (o que é uma meta, como o progresso é
// calculado, se ela puxa de Lancamento/Divida ou é um valor manual) repetiria
// o erro que evitamos com o Plano de Pagamento. Por enquanto só avisa o que
// vem por aí, sem inventar uma tabela às pressas.
export default async function MetasPage() {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  return (
    <div>
      <div className="card-head">
        <p className="card-title">
          <span className="title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></svg>
          </span>
          <span className="title-label">Metas</span>
        </p>
      </div>

      <div className="mc-card">
        <p style={{ margin: 0, fontWeight: 700 }}>Em construção</p>
        <p style={{ color: "var(--ink-dim)", marginTop: 8, fontSize: 13.5, lineHeight: 1.6 }}>
          Metas (como &ldquo;quitar o cartão até dezembro&rdquo; ou &ldquo;guardar R$500 por mês&rdquo;) ainda não têm um
          lugar pra viver no banco de dados — precisamos primeiro decidir o que uma meta é (um valor fixo? um prazo?
          ela acompanha uma dívida específica?) antes de criar essa tela de verdade, do mesmo jeito que fizemos com o
          Plano de Pagamento.
        </p>
      </div>
    </div>
  );
}
