import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AGENTES, ROTULO_STATUS, ROTULO_TIPO_ALERTA, agregarMetricasPorTipo, calcularStatusAgente } from "@/lib/agentes/status";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FUSO = "America/Sao_Paulo";

function fmtData(d: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: FUSO }).format(new Date(d));
}

function fmtDuracao(ms: unknown) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return "—";
  return n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1)} s`;
}

const COR_STATUS: Record<string, { bg: string; color: string; border: string }> = {
  OPERANDO: { bg: "rgba(16,185,129,0.12)", color: "#6ee7b7", border: "rgba(16,185,129,0.25)" },
  PARCIAL: { bg: "rgba(245,158,11,0.12)", color: "#fcd34d", border: "rgba(245,158,11,0.25)" },
  AGUARDANDO_USO: { bg: "rgba(255,255,255,0.06)", color: "#9ca3af", border: "rgba(255,255,255,0.12)" },
  ATRASADO: { bg: "rgba(245,158,11,0.12)", color: "#fcd34d", border: "rgba(245,158,11,0.25)" },
  ERRO: { bg: "rgba(239,68,68,0.12)", color: "#fca5a5", border: "rgba(239,68,68,0.25)" },
  SEM_EXECUCAO: { bg: "rgba(239,68,68,0.12)", color: "#fca5a5", border: "rgba(239,68,68,0.25)" },
};

// Tela read-only: status de cada agente calculado das execuções REAIS
// (AuditoriaAssistente, ferramenta "agente:<nome>") — nunca de um rótulo
// fixo. Sem dado pessoal do cliente: só contagens.
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

  return (
    <div>
      <div className="qa-page-header">
        <div>
          <h1 className="qa-page-title">Agentes</h1>
          <p className="qa-page-subtitle">Status calculado das execuções reais — se um agente parar, aparece aqui.</p>
        </div>
        <Link href="/painel" className="qa-btn-secondary">← Dashboard</Link>
      </div>

      <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
        {AGENTES.map((def) => {
          const lista = doAgente(def.chave);
          const ultima = lista[0] ?? null;
          const diaHoje = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora);
          const comCobertura = lista.find((e) => (e.depois as { cobertura?: { dia?: string } } | null)?.cobertura?.dia === diaHoje);
          const cobertura = (comCobertura?.depois as { cobertura?: { avaliados: number; total: number; concluido: boolean } } | null)?.cobertura ?? null;
          const status = calcularStatusAgente(def, ultima ? { terminadoEm: ultima.criadoEm, sucesso: ultima.sucesso } : null, agora, Boolean(cobertura && !cobertura.concluido));
          const cor = COR_STATUS[status];
          const recentes = lista.filter((e) => e.criadoEm >= seteDias);
          const dados = (ultima?.depois ?? {}) as Record<string, unknown>;
          const args = (ultima?.argumentos ?? {}) as Record<string, unknown>;
          return (
            <div key={def.chave} className="qa-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ maxWidth: 560 }}>
                  <strong style={{ fontSize: 16 }}>{def.nome}</strong>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--qa-gray-400)" }}>{def.descricao}</p>
                </div>
                <span className="qa-badge" style={{ background: cor.bg, color: cor.color, border: `1px solid ${cor.border}` }}>
                  {ROTULO_STATUS[status]}
                </span>
              </div>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 12, fontSize: 13 }}>
                <span>Última execução: <strong>{ultima ? fmtData(ultima.criadoEm) : "—"}</strong></span>
                <span>Duração: <strong>{fmtDuracao(args.duracaoMs)}</strong></span>
                <span>Clientes avaliados: <strong>{String(dados.clientesAvaliados ?? "—")}</strong></span>
                <span>Ações: <strong>{String(dados.acoes ?? "—")}</strong></span>
                <span>Execuções (7 dias): <strong>{recentes.length}</strong></span>
                <span>Com erro (7 dias): <strong>{recentes.filter((e) => !e.sucesso).length}</strong></span>
              </div>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 6, fontSize: 12.5, color: "var(--qa-gray-400)" }}>
                <span>Versão: {def.versao}</span>
                {def.chave === "sentinela" && (
                  <span>
                    Cobertura hoje:{" "}
                    {cobertura ? `${cobertura.avaliados}/${cobertura.total} — ${cobertura.concluido ? "CONCLUÍDO" : "PARCIAL"}` : "ainda sem execução hoje"}
                  </span>
                )}
                {def.agenda && <span>Próxima execução: {def.agenda}</span>}
                <span>Configuração: {desligados.includes(def.chave) ? "desligado (AGENTES_DESLIGADOS)" : "habilitado"}</span>
              </div>
              {typeof dados.propostos === "number" && (
                <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--qa-gray-400)" }}>
                  Última execução — brutos {String(dados.brutos ?? 0)} · propostos {String(dados.propostos)} · selecionados {String(dados.selecionados ?? 0)} · enviados{" "}
                  {String(dados.enviados ?? 0)} · suprimidos por política {String(dados.suprimidosPolitica ?? 0)} · por prioridade {String(dados.suprimidosPrioridade ?? 0)}
                </p>
              )}
              {typeof dados.pausado === "string" && (
                <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#fcd34d" }}>Pausado na última execução: {dados.pausado}</p>
              )}
              {!!dados.motivosSupressao && typeof dados.motivosSupressao === "object" && Object.keys(dados.motivosSupressao as object).length > 0 && (
                <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--qa-gray-400)" }}>
                  Suprimidos na última execução:{" "}
                  {Object.entries(dados.motivosSupressao as Record<string, number>).map(([motivo, n]) => `${motivo}: ${n}`).join(" · ")}
                </p>
              )}
              {ultima && !ultima.sucesso && ultima.erro && (
                <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "#fca5a5" }}>Erro: {ultima.erro}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="qa-card" style={{ marginBottom: 20 }}>
        <strong style={{ fontSize: 15 }}>Alertas proativos — últimos 7 dias</strong>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 10, fontSize: 13 }}>
          <span>Enviados: <strong>{alertas7d}</strong></span>
          <span>Marcados como úteis: <strong>{feedbackUtil}</strong></span>
          <span>Marcados como errados: <strong>{feedbackErrado}</strong></span>
          <span>Pediram para parar: <strong>{silenciados}</strong></span>
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--qa-gray-400)" }}>
          Alerta marcado como errado vira item em <Link href="/revisao-pendente">Revisão pendente</Link> para investigar o cálculo.
        </p>
      </div>

      <div className="qa-card" style={{ marginBottom: 20 }}>
        <strong style={{ fontSize: 15 }}>Utilidade por tipo de alerta — últimos 30 dias</strong>
        {metricasPorTipo.length === 0 ? (
          <p style={{ margin: "10px 0 0", color: "var(--qa-gray-400)" }}>Nenhum alerta enviado ainda.</p>
        ) : (
          <div style={{ marginTop: 10, overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--qa-gray-400)" }}>
                  <th style={{ padding: "4px 8px 4px 0" }}>Tipo</th>
                  <th style={{ padding: "4px 8px" }}>Enviados</th>
                  <th style={{ padding: "4px 8px" }}>Úteis</th>
                  <th style={{ padding: "4px 8px" }}>Errados</th>
                  <th style={{ padding: "4px 8px" }}>Silenciados</th>
                  <th style={{ padding: "4px 8px" }}>Utilidade</th>
                </tr>
              </thead>
              <tbody>
                {metricasPorTipo.map((m) => (
                  <tr key={m.tipo}>
                    <td style={{ padding: "4px 8px 4px 0" }}>{ROTULO_TIPO_ALERTA[m.tipo] ?? m.tipo}</td>
                    <td style={{ padding: "4px 8px" }}>{m.enviados}</td>
                    <td style={{ padding: "4px 8px" }}>{m.uteis}</td>
                    <td style={{ padding: "4px 8px" }}>{m.errados}</td>
                    <td style={{ padding: "4px 8px" }}>{m.silenciados}</td>
                    <td style={{ padding: "4px 8px" }}>{m.utilidade == null ? "—" : `${Math.round(m.utilidade * 100)}% (de ${m.respostas})`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--qa-gray-400)" }}>
              Utilidade = úteis ÷ (úteis + errados). Sempre leia junto do número de respostas: 100% com 1 resposta não prova nada.
            </p>
          </div>
        )}
      </div>

      <div className="qa-card">
        <strong style={{ fontSize: 15 }}>Últimas execuções</strong>
        {execucoes.length === 0 ? (
          <p style={{ margin: "10px 0 0", color: "var(--qa-gray-400)" }}>Nenhuma execução registrada ainda — os crons rodam 1x por dia.</p>
        ) : (
          <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 13 }}>
            {execucoes.slice(0, 25).map((e) => (
              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span>{fmtData(e.criadoEm)} · <strong>{e.ferramenta.replace("agente:", "")}</strong></span>
                <span style={{ color: e.sucesso ? "var(--qa-gray-400)" : "#fca5a5" }}>{e.resumo}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
