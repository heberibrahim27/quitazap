import { redirect } from "next/navigation";
import Link from "next/link";
import { getClienteAtual } from "@/lib/get-cliente";
import { avaliarQuitaZapHoje } from "@/lib/estado-diario-service";

export const dynamic = "force-dynamic";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDataHora(d: Date) {
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtData(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// "QuitaZAP Hoje" — briefing curto ao abrir. Ver
// docs/chat-nativo-arquitetura.md seção 6.1: os 3 estados (mudança real /
// verificado sem novidade / dados insuficientes ou falha) nunca se
// confundem — quem decide isso é avaliarQuitaZapHoje(), não a UI.
export default async function QuitaZapHojePage() {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const avaliacao = await avaliarQuitaZapHoje(cliente.id);

  return (
    <div className="mc-hoje">
      <h1 className="mc-hoje-titulo">QuitaZAP Hoje</h1>
      <p className="mc-hoje-timestamp">
        Avaliado agora ({fmtDataHora(avaliacao.avaliadoEm)}) — com base no que você registrou até aqui, sem acesso a
        extrato bancário.
      </p>

      {avaliacao.estado === "falha" && (
        <div className="mc-hoje-card mc-hoje-card-falha">
          <p>{avaliacao.motivo}</p>
        </div>
      )}

      {avaliacao.estado === "mudanca" && (
        <div className="mc-hoje-card mc-hoje-card-mudanca">
          {avaliacao.mensagens.map((m, i) => (
            <p key={i}>{m}</p>
          ))}
          {avaliacao.saldoProjetado != null && (
            <p className="mc-hoje-saldo">Projeção do mês: {fmtValor(avaliacao.saldoProjetado)}</p>
          )}
        </div>
      )}

      {avaliacao.estado === "sem_novidade" && (
        <div className="mc-hoje-card mc-hoje-card-neutro">
          <p>Nenhuma mudança relevante desde sua última visita.</p>
          {avaliacao.saldoProjetado != null && (
            <p className="mc-hoje-saldo">Projeção do mês: {fmtValor(avaliacao.saldoProjetado)}</p>
          )}
        </div>
      )}

      <div className="mc-hoje-secao">
        <h2 className="mc-hoje-subtitulo">Próximos compromissos</h2>
        {avaliacao.compromissos.length === 0 ? (
          <p className="mc-hoje-vazio">Nada cadastrado pros próximos dias.</p>
        ) : (
          <ul className="mc-hoje-lista">
            {avaliacao.compromissos.map((c) => (
              <li key={c.id}>
                <span>{c.descricao}</span>
                <span>
                  {c.valor != null ? fmtValor(c.valor) + " · " : ""}
                  {fmtData(c.vencimento)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link href="/minha-conta/chat" className="mc-btn-primary mc-hoje-cta">
        Registrar algo agora
      </Link>
    </div>
  );
}
