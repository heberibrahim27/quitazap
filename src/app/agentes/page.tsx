import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AGENTES, ROTULO_STATUS, ROTULO_TIPO_ALERTA, agregarMetricasPorTipo, calcularStatusAgente } from "@/lib/agentes/status";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FUSO = "America/Sao_Paulo";

const DIA_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO });
const HORA_FMT = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO });
const DATA_FMT = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: FUSO });

/** "hoje às 08:31", "ontem às 08:30" ou "4 de out às 08:30" — texto de gente, não de log. */
function quando(d: Date | string, agora: Date) {
  const data = new Date(d);
  const hora = HORA_FMT.format(data);
  const dia = DIA_FMT.format(data);
  if (dia === DIA_FMT.format(agora)) return `hoje às ${hora}`;
  if (dia === DIA_FMT.format(new Date(agora.getTime() - 86_400_000))) return `ontem às ${hora}`;
  return `${DATA_FMT.format(data).replace(".", "")} às ${hora}`;
}

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

const COR_STATUS: Record<string, string> = {
  OPERANDO: "ok",
  PARCIAL: "aviso",
  AGUARDANDO_USO: "neutro",
  ATRASADO: "aviso",
  ERRO: "erro",
  SEM_EXECUCAO: "erro",
};

// Tela read-only: status de cada agente calculado das execuções REAIS
// (AuditoriaAssistente, ferramenta "agente:<nome>") — nunca de um rótulo
// fixo. Sem dado pessoal do cliente: só contagens. O texto é pensado pro
// fundador (não pro desenvolvedor): nada de duração em ms, versão, flag de
// ambiente ou contador interno de política.
export default async function AgentesPage() {
  const agora = new Date();
  const seteDias = new Date(agora.getTime() - 7 * 86_400_000);

  const trintaDias = new Date(agora.getTime() - 30 * 86_400_000);
  const [alertas30d, feedbacks30d, mutes30d] = await Promise.all([
    prisma.mensagemChat.findMany({
      where: { direcao: "BOT", criadoEm: { gte: trintaDias }, dadosEstruturados: { path: ["tipo"], equals: "alerta_proativo" } },
      select: { dadosEstruturados: true },
    }),
    prisma.eventoAnalytics.findMany({ where: { tipo: "alerta_feedback", criadoEm: { gte: trintaDias } }, select: { caminho: true } }),
    prisma.eventoAnalytics.findMany({ where: { tipo: "alerta_silenciado", criadoEm: { gte: trintaDias } }, select: { caminho: true } }),
  ]);
  const metricasPorTipo = agregarMetricasPorTipo(
    alertas30d.map((a) => (a.dadosEstruturados as { alerta?: { tipo?: string } } | null)?.alerta?.tipo ?? "DESCONHECIDO"),
    feedbacks30d.map((e) => e.caminho),
    mutes30d.map((e) => e.caminho)
  );

  const [execucoes, alertas7d, feedbackUtil, feedbackErrado, silenciados] = await Promise.all([
    prisma.auditoriaAssistente.findMany({
      where: { ferramenta: { startsWith: "agente:" } },
      orderBy: { criadoEm: "desc" },
      take: 300,
    }),
    prisma.mensagemChat.count({
      where: { direcao: "BOT", criadoEm: { gte: seteDias }, dadosEstruturados: { path: ["tipo"], equals: "alerta_proativo" } },
    }),
    prisma.eventoAnalytics.count({ where: { tipo: "alerta_feedback", caminho: { endsWith: "#UTIL" }, criadoEm: { gte: seteDias } } }),
    prisma.eventoAnalytics.count({ where: { tipo: "alerta_feedback", caminho: { endsWith: "#ERRADO" }, criadoEm: { gte: seteDias } } }),
    prisma.eventoAnalytics.count({ where: { tipo: "alerta_silenciado", criadoEm: { gte: seteDias } } }),
  ]);

  const desligados = (process.env.AGENTES_DESLIGADOS ?? "").split(",").map((s) => s.trim().toLowerCase());
  const doAgente = (chave: string) => execucoes.filter((e) => e.ferramenta === `agente:${chave}`);
  const diaHoje = DIA_FMT.format(agora);

  const cartoes = AGENTES.map((def) => {
    const lista = doAgente(def.chave);
    const ultima = lista[0] ?? null;
    const comCobertura = lista.find((e) => (e.depois as { cobertura?: { dia?: string } } | null)?.cobertura?.dia === diaHoje);
    const cobertura = (comCobertura?.depois as { cobertura?: { avaliados: number; total: number; concluido: boolean } } | null)?.cobertura ?? null;
    const status = calcularStatusAgente(def, ultima ? { terminadoEm: ultima.criadoEm, sucesso: ultima.sucesso } : null, agora, Boolean(cobertura && !cobertura.concluido));
    const recentes = lista.filter((e) => e.criadoEm >= seteDias);
    const dados = (ultima?.depois ?? {}) as Record<string, unknown>;
    return { def, ultima, cobertura, status, dados, falhas7d: recentes.filter((e) => !e.sucesso).length, desligado: desligados.includes(def.chave) };
  });
  const automaticos = cartoes.filter((c) => c.def.modo === "periodico");
  const sobDemanda = cartoes.filter((c) => c.def.modo === "sob_demanda");
  const precisamAtencao = cartoes.filter((c) => !c.desligado && (c.status === "ERRO" || c.status === "ATRASADO" || c.status === "SEM_EXECUCAO")).length;
  const funcionando = cartoes.filter((c) => !c.desligado && (c.status === "OPERANDO" || c.status === "PARCIAL")).length;
  const nomeDoAgente = new Map(AGENTES.map((a) => [a.chave, a.nome]));

  const renderAgente = (c: (typeof cartoes)[number]) => {
    const { def, ultima, cobertura, status, dados, falhas7d, desligado } = c;
    const avaliados = typeof dados.clientesAvaliados === "number" ? dados.clientesAvaliados : null;
    const enviados = typeof dados.enviados === "number" ? dados.enviados : typeof dados.acoes === "number" ? dados.acoes : null;
    const fatos: string[] = [];
    if (avaliados != null) fatos.push(`Olhou ${plural(avaliados, "cliente", "clientes")}`);
    if (enviados != null) fatos.push(def.chave === "recorrencias" ? `Lançou ${plural(enviados, "item", "itens")}` : `Mandou ${plural(enviados, "aviso", "avisos")}`);
    return (
      <div key={def.chave} className="ag-card">
        <div className="ag-topo">
          <div className="ag-titulo">
            <strong>{def.nome}</strong>
            <p>{def.descricao}</p>
          </div>
          <span className={`ag-status ${desligado ? "neutro" : COR_STATUS[status]}`}>{desligado ? "Desligado" : ROTULO_STATUS[status]}</span>
        </div>
        <dl className="ag-fatos">
          <div>
            <dt>Última vez</dt>
            <dd>{ultima ? quando(ultima.criadoEm, agora) : def.modo === "sob_demanda" ? "Ainda não foi usado" : "Ainda não rodou"}</dd>
          </div>
          {fatos.length > 0 && (
            <div>
              <dt>Resultado</dt>
              <dd>{fatos.join(" · ")}</dd>
            </div>
          )}
          {def.agenda && (
            <div>
              <dt>Quando roda</dt>
              <dd>{def.agenda}</dd>
            </div>
          )}
          {def.chave === "sentinela" && cobertura && (
            <div>
              <dt>Hoje</dt>
              <dd>{cobertura.concluido ? `Olhou todos os ${cobertura.total} clientes` : `Olhou ${cobertura.avaliados} de ${cobertura.total} clientes (continua no próximo ciclo)`}</dd>
            </div>
          )}
        </dl>
        {typeof dados.pausado === "string" && (
          <p className="ag-nota aviso">Parou sozinho na última vez por segurança, porque muitos avisos foram marcados como errados.</p>
        )}
        {ultima && !ultima.sucesso && <p className="ag-nota erro">A última execução teve um problema. Veja o histórico no fim da página.</p>}
        {ultima?.sucesso && falhas7d > 0 && (
          <p className="ag-nota aviso">{plural(falhas7d, "execução teve problema", "execuções tiveram problema")} nos últimos 7 dias.</p>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Agentes</h1>
          <p className="qa-page-subtitle">Os ajudantes automáticos do QuitaZAP e como estão trabalhando.</p>
        </div>
        <Link href="/painel" className="qa-btn-secondary">← Dashboard</Link>
      </div>

      <div className="ag-resumo">
        <div>
          <span>{funcionando}</span>
          <small>{funcionando === 1 ? "funcionando" : "funcionando"}</small>
        </div>
        <div className={precisamAtencao > 0 ? "alerta" : undefined}>
          <span>{precisamAtencao}</span>
          <small>{precisamAtencao === 1 ? "precisa de atenção" : "precisam de atenção"}</small>
        </div>
        <div>
          <span>{alertas7d}</span>
          <small>{alertas7d === 1 ? "aviso enviado em 7 dias" : "avisos enviados em 7 dias"}</small>
        </div>
      </div>

      <h2 className="ag-secao">Avisos automáticos</h2>
      <p className="ag-secao-texto">Rodam sozinhos todos os dias e mandam mensagem para os clientes no WhatsApp.</p>
      <div className="ag-lista">{automaticos.map(renderAgente)}</div>

      <h2 className="ag-secao">Ajudantes do dia a dia</h2>
      <p className="ag-secao-texto">Entram em ação quando o cliente pede ou manda algo.</p>
      <div className="ag-lista">{sobDemanda.map(renderAgente)}</div>

      <h2 className="ag-secao">Como os clientes reagem aos avisos</h2>
      <p className="ag-secao-texto">Últimos 7 dias.</p>
      <div className="ag-resumo">
        <div>
          <span>{alertas7d}</span>
          <small>enviados</small>
        </div>
        <div>
          <span>{feedbackUtil}</span>
          <small>marcados como úteis</small>
        </div>
        <div>
          <span>{feedbackErrado}</span>
          <small>marcados como errados</small>
        </div>
        <div>
          <span>{silenciados}</span>
          <small>pediram para parar</small>
        </div>
      </div>
      {feedbackErrado > 0 && (
        <p className="ag-secao-texto" style={{ marginTop: 10 }}>
          Aviso marcado como errado vai para <Link href="/revisao-pendente">Revisão pendente</Link> para conferirmos o cálculo.
        </p>
      )}

      <div className="qa-card" style={{ marginTop: 14 }}>
        <strong style={{ fontSize: 15 }}>Qual tipo de aviso funciona melhor</strong>
        <p className="ag-secao-texto" style={{ margin: "4px 0 10px" }}>Últimos 30 dias.</p>
        {metricasPorTipo.length === 0 ? (
          <p style={{ margin: 0, color: "var(--qa-gray-400)" }}>Nenhum aviso enviado ainda.</p>
        ) : (
          <>
            <table className="ag-tabela">
              <thead>
                <tr>
                  <th>Tipo de aviso</th>
                  <th>Enviados</th>
                  <th>Úteis</th>
                  <th>Errados</th>
                  <th>Pediram para parar</th>
                  <th>Aprovação</th>
                </tr>
              </thead>
              <tbody>
                {metricasPorTipo.map((m) => (
                  <tr key={m.tipo}>
                    <td>{ROTULO_TIPO_ALERTA[m.tipo] ?? "Outro tipo"}</td>
                    <td>{m.enviados}</td>
                    <td>{m.uteis}</td>
                    <td>{m.errados}</td>
                    <td>{m.silenciados}</td>
                    <td>{m.utilidade == null ? "Sem respostas" : `${Math.round(m.utilidade * 100)}% (${plural(m.respostas, "resposta", "respostas")})`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="ag-secao-texto" style={{ margin: "10px 0 0" }}>
              Aprovação é a parte dos clientes que achou o aviso útil. Com poucas respostas, não dá para tirar conclusão.
            </p>
          </>
        )}
      </div>

      <details className="qa-card ag-historico" style={{ marginTop: 14 }}>
        <summary>Histórico das últimas execuções</summary>
        {execucoes.length === 0 ? (
          <p style={{ margin: "10px 0 0", color: "var(--qa-gray-400)" }}>Nada registrado ainda — os agentes rodam uma vez por dia.</p>
        ) : (
          <ul>
            {execucoes.slice(0, 25).map((e) => (
              <li key={e.id}>
                <span>
                  {quando(e.criadoEm, agora)} · <strong>{nomeDoAgente.get(e.ferramenta.replace("agente:", "")) ?? e.ferramenta.replace("agente:", "")}</strong>
                </span>
                <span className={e.sucesso ? "ok" : "erro"}>{e.sucesso ? "Rodou bem" : "Teve um problema"}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
