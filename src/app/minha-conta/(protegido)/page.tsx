import Link from "next/link";
import { redirect } from "next/navigation";
import { getClienteAtual } from "@/lib/get-cliente";
import { prisma } from "@/lib/prisma";
import { QaRing } from "@/components/QaRing";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const ROTULO_TIPO_LANCAMENTO: Record<string, string> = {
  RECEITA: "Receita",
  DESPESA_FIXA: "Despesa fixa",
  DESPESA_VARIAVEL: "Despesa variável",
  COMPRA_CARTAO: "Compra no cartão",
  FATURA_FECHADA: "Fatura fechada",
};

const ICONE_TIPO_LANCAMENTO: Record<string, string> = {
  RECEITA: "💰",
  DESPESA_FIXA: "📌",
  DESPESA_VARIAVEL: "🛒",
  COMPRA_CARTAO: "💳",
  FATURA_FECHADA: "🧾",
};

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Ano/mês corrente em horário de Brasília (fixo UTC-3, sem horário de
// verão desde 2019) — mesma convenção já usada no cron de tarefas.
function anoMesAtualBrasil(agora: Date): { ano: number; mes: number } {
  const [ano, mes] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(agora)
    .split("-")
    .map(Number);
  return { ano, mes };
}

// Início/fim de um mês (meia-noite de Brasília do dia 1 até meia-noite de
// Brasília do dia 1 do mês seguinte) — mesma âncora usada em todo o app
// pra "dia X em Brasília" não virar o dia errado em UTC.
function limitesDoMes(ano: number, mes: number) {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0, 0));
  const fim = new Date(Date.UTC(mes === 12 ? ano + 1 : ano, mes === 12 ? 0 : mes, 1, 3, 0, 0, 0));
  return { inicio, fim };
}

function paramMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export default async function MinhaContaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string | string[] }>;
}) {
  const cliente = await getClienteAtual();
  if (!cliente) redirect("/minha-conta/entrar");

  const { mes: mesParamBruto } = await searchParams;
  // Next.js entrega string[] se a query tiver "?mes=" repetido — usa só o
  // primeiro valor nesse caso, em vez de deixar o .match() quebrar a página.
  const mesParam = Array.isArray(mesParamBruto) ? mesParamBruto[0] : mesParamBruto;
  const { ano: anoAtual, mes: mesAtualNum } = anoMesAtualBrasil(new Date());

  let ano = anoAtual;
  let mes = mesAtualNum;
  const match = mesParam?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const anoInformado = Number(match[1]);
    const mesInformado = Number(match[2]);
    // Ano mínimo 2000: evita o comportamento legado do JS Date, que trata
    // ano de 0 a 99 como 1900+ano (ex: Date.UTC(2, ...) vira o ano 1902).
    if (anoInformado >= 2000 && anoInformado <= 2100 && mesInformado >= 1 && mesInformado <= 12) {
      ano = anoInformado;
      mes = mesInformado;
    }
  }

  const { inicio: inicioMes, fim: fimMes } = limitesDoMes(ano, mes);
  const ehMesAtual = ano === anoAtual && mes === mesAtualNum;
  const mesAnterior = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  const mesSeguinte = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };

  const [dividas, pagamentos, tarefasPendentes, lancamentosDoMes, cartoes, ultimosLancamentos] = await Promise.all([
    prisma.divida.findMany({
      where: { clienteId: cliente.id, status: "ATIVA" },
      orderBy: [{ prioridade: "desc" }, { criadoEm: "asc" }],
    }),
    prisma.pagamento.findMany({
      where: { clienteId: cliente.id },
      orderBy: { data: "desc" },
      take: 10,
      include: { divida: { select: { credor: true } } },
    }),
    prisma.tarefa.findMany({
      where: { clienteId: cliente.id, status: "PENDENTE" },
      orderBy: [{ vencimento: "asc" }, { criadoEm: "asc" }],
    }),
    prisma.lancamento.findMany({
      where: { clienteId: cliente.id, data: { gte: inicioMes, lt: fimMes } },
      include: { cartao: { select: { nome: true } } },
    }),
    prisma.cartao.findMany({ where: { clienteId: cliente.id }, orderBy: { nome: "asc" } }),
    prisma.lancamento.findMany({
      where: { clienteId: cliente.id },
      orderBy: { data: "desc" },
      take: 10,
      include: { cartao: { select: { nome: true } } },
    }),
  ]);

  const totalDividas = dividas.reduce((soma, d) => soma + (d.valorTotal - d.valorPago), 0);

  const gastoCartaoMes = new Map<string, number>();
  let totalReceitasMes = 0;
  let totalFixasMes = 0;
  let totalVariaveisMes = 0;
  let totalCartaoMes = 0;
  for (const l of lancamentosDoMes) {
    if (l.tipo === "RECEITA") totalReceitasMes += l.valor;
    else if (l.tipo === "DESPESA_FIXA") totalFixasMes += l.valor;
    else if (l.tipo === "DESPESA_VARIAVEL") totalVariaveisMes += l.valor;
    else if (l.tipo === "COMPRA_CARTAO") {
      totalCartaoMes += l.valor;
      if (l.cartao) gastoCartaoMes.set(l.cartao.nome, (gastoCartaoMes.get(l.cartao.nome) ?? 0) + l.valor);
    }
  }
  // Inclui compras no cartão mesmo com fatura ainda aberta — de propósito
  // diferente do "saldo disponível" que o bot informa no WhatsApp (esse só
  // desconta fatura fechada, pra não travar o saldo antes da fatura vencer).
  // Aqui o objetivo é outro: mostrar tudo que já entrou/saiu no mês, cartão
  // incluído — por isso o rótulo abaixo não usa a palavra "disponível".
  const totalSaidasMes = totalFixasMes + totalVariaveisMes + totalCartaoMes;
  const resultadoMes = totalReceitasMes - totalSaidasMes;

  // Anel "comprometimento da renda": quanto da renda mensal já foi gasto
  // este mês (fixo + variável + cartão). Sem renda cadastrada não tem como
  // calcular percentual nenhum — o anel simplesmente não aparece nesse caso.
  const percentualRendaComprometida =
    cliente.rendaMensal && cliente.rendaMensal > 0 ? totalSaidasMes / cliente.rendaMensal : null;

  return (
    <div>
      <div className="mc-hero">
        <div className="mc-hero-top">
          <div>
            <p className="mc-hero-greeting">Olá, {cliente.nome.split(" ")[0]} 👋</p>
            <p className="mc-hero-sub">
              {ehMesAtual ? "Resumo do mês" : `Resumo de ${NOMES_MES[mes - 1]}/${ano}`}
            </p>
          </div>
          <div className="mc-hero-nav">
            <Link href={`/minha-conta?mes=${paramMes(mesAnterior.ano, mesAnterior.mes)}`} aria-label="Mês anterior">‹</Link>
            {!ehMesAtual && (
              <Link href={`/minha-conta?mes=${paramMes(mesSeguinte.ano, mesSeguinte.mes)}`} aria-label="Próximo mês">›</Link>
            )}
          </div>
        </div>

        <div className="mc-hero-body">
          <div>
            <p className="mc-hero-label">Entradas − saídas</p>
            <p className="mc-hero-amount" style={{ color: resultadoMes >= 0 ? "#fff" : "#ffe1e6" }}>
              {resultadoMes < 0 && "⚠️ "}{fmtValor(resultadoMes)}
            </p>
            <p className="mc-hero-caption">já conta compras no cartão do mês</p>
          </div>
          {percentualRendaComprometida != null && (
            <QaRing
              value={percentualRendaComprometida}
              size={76}
              strokeWidth={7}
              color={percentualRendaComprometida <= 1 ? "#34d399" : "#fb7185"}
              label={`${Math.round(percentualRendaComprometida * 100)}%`}
            />
          )}
        </div>

        <div className="mc-hero-chips">
          <div className="mc-hero-chip">
            <p className="mc-hero-chip-label">Renda mensal</p>
            <p className="mc-hero-chip-value">{cliente.rendaMensal != null ? fmtValor(cliente.rendaMensal) : "—"}</p>
          </div>
          <div className="mc-hero-chip">
            <p className="mc-hero-chip-label">Saldo devedor</p>
            <p className="mc-hero-chip-value" style={{ color: totalDividas > 0 ? "#ffe1e6" : "#fff" }}>{fmtValor(totalDividas)}</p>
          </div>
        </div>
      </div>

      <div className="mc-quick-actions">
        <Link href="#lancamentos" className="mc-quick-action">
          <span className="mc-quick-action-icon">🧾</span>
          <span className="mc-quick-action-label">Extrato</span>
        </Link>
        <Link href="#cartoes" className="mc-quick-action">
          <span className="mc-quick-action-icon">💳</span>
          <span className="mc-quick-action-label">Cartões</span>
        </Link>
        <Link href="#dividas" className="mc-quick-action">
          <span className="mc-quick-action-icon">📄</span>
          <span className="mc-quick-action-label">Dívidas</span>
        </Link>
        <Link href="#tarefas" className="mc-quick-action">
          <span className="mc-quick-action-icon">🔔</span>
          <span className="mc-quick-action-label">Tarefas</span>
        </Link>
      </div>

      <section className="mc-section">
        <div className="mc-section-head">
          <h2 className="mc-section-title">📊 Resumo — {NOMES_MES[mes - 1]}/{ano}</h2>
        </div>
        <div className="mc-card">
          {lancamentosDoMes.length === 0 ? (
            <p className="mc-empty">Nenhum gasto ou receita registrado em {NOMES_MES[mes - 1]}/{ano}.</p>
          ) : (
            <div className="mc-list">
              {[
                { rotulo: "Receitas", valor: totalReceitasMes, positivo: true },
                { rotulo: "Despesas fixas", valor: totalFixasMes, positivo: false },
                { rotulo: "Despesas variáveis", valor: totalVariaveisMes, positivo: false },
                { rotulo: "Compras no cartão", valor: totalCartaoMes, positivo: false },
              ]
                .filter((linha) => linha.valor > 0)
                .map((linha) => (
                  <div key={linha.rotulo} className="mc-list-row">
                    <div className="mc-list-body">
                      <div className="mc-list-desc">{linha.rotulo}</div>
                    </div>
                    <div className="mc-list-side">
                      <div className={`mc-list-value ${linha.positivo ? "mc-list-value-pos" : ""}`}>
                        {fmtValor(linha.valor)}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </section>

      <section id="cartoes" className="mc-section">
        <div className="mc-section-head">
          <h2 className="mc-section-title">💳 Cartões — {NOMES_MES[mes - 1]}/{ano}</h2>
        </div>
        <div className="mc-card">
          {cartoes.length === 0 ? (
            <p className="mc-empty">Nenhum cartão cadastrado ainda.</p>
          ) : (
            <div className="mc-list">
              {cartoes.map((c) => (
                <div key={c.id} className="mc-list-row">
                  <div className="mc-list-icon">💳</div>
                  <div className="mc-list-body">
                    <div className="mc-list-desc">{c.nome}</div>
                    <div className="mc-list-meta">
                      {c.diaFechamento ? `Fecha dia ${c.diaFechamento}` : ""}
                      {c.diaFechamento && c.diaVencimento ? " · " : ""}
                      {c.diaVencimento ? `Vence dia ${c.diaVencimento}` : ""}
                    </div>
                  </div>
                  <div className="mc-list-side">
                    <div className="mc-list-value">{fmtValor(gastoCartaoMes.get(c.nome) ?? 0)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="lancamentos" className="mc-section">
        <div className="mc-section-head">
          <h2 className="mc-section-title">🧾 Últimos lançamentos</h2>
        </div>
        <div className="mc-card">
          {ultimosLancamentos.length === 0 ? (
            <p className="mc-empty">Nenhum lançamento registrado ainda.</p>
          ) : (
            <div className="mc-list">
              {ultimosLancamentos.map((l) => (
                <div key={l.id} className="mc-list-row">
                  <div className="mc-list-icon">{ICONE_TIPO_LANCAMENTO[l.tipo] ?? "•"}</div>
                  <div className="mc-list-body">
                    <div className="mc-list-desc">
                      {l.descricao}
                      {l.comprovanteUrl && (
                        <a href={l.comprovanteUrl} target="_blank" rel="noopener noreferrer" title="Ver comprovante" style={{ marginLeft: 6 }}>
                          📎
                        </a>
                      )}
                    </div>
                    <div className="mc-list-meta">
                      {ROTULO_TIPO_LANCAMENTO[l.tipo] ?? l.tipo}
                      {l.cartao ? ` · ${l.cartao.nome}` : ""}
                      {l.recorrente ? " · 🔁 recorrente" : ""}
                    </div>
                  </div>
                  <div className="mc-list-side">
                    <div className={`mc-list-value ${l.tipo === "RECEITA" ? "mc-list-value-pos" : ""}`}>
                      {/* Fatura fechada é só um resumo do que já foi contado nas
                          compras individuais no cartão — sem +/- pra não parecer
                          uma saída nova (dobraria a contagem visualmente). */}
                      {l.tipo === "RECEITA" ? "+" : l.tipo === "FATURA_FECHADA" ? "" : "-"}{fmtValor(l.valor)}
                    </div>
                    <div className="mc-list-sub">
                      {fmtData(l.data)} · <Link href={`/minha-conta/lancamento/${l.id}/editar`}>editar</Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="dividas" className="mc-section">
        <div className="mc-section-head">
          <h2 className="mc-section-title">💳 Dívidas e empréstimos</h2>
        </div>
        <div className="mc-card">
          {dividas.length === 0 ? (
            <p className="mc-empty">Nenhuma dívida ativa registrada.</p>
          ) : (
            <div className="mc-list">
              {dividas.map((d) => (
                <div key={d.id} className="mc-list-row">
                  <div className="mc-list-body">
                    <div className="mc-list-desc">{d.credor}</div>
                    <div className="mc-list-meta">
                      {d.tipo}
                      {d.totalParcelas ? ` · ${d.totalParcelas}x` : ""}
                      {d.diaVencimento ? ` · vence dia ${d.diaVencimento}` : ""}
                      {d.emAtraso ? " · ⚠️ em atraso" : ""}
                    </div>
                  </div>
                  <div className="mc-list-side">
                    <div className="mc-list-value">{fmtValor(d.valorTotal - d.valorPago)}</div>
                    <div className="mc-list-sub">de {fmtValor(d.valorTotal)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="tarefas" className="mc-section">
        <div className="mc-section-head">
          <h2 className="mc-section-title">🔔 Tarefas e lembretes</h2>
        </div>
        <div className="mc-card">
          {tarefasPendentes.length === 0 ? (
            <p className="mc-empty">Nenhuma tarefa pendente.</p>
          ) : (
            <div className="mc-list">
              {tarefasPendentes.map((t) => (
                <div key={t.id} className="mc-list-row">
                  <div className="mc-list-body">
                    <div className="mc-list-desc">{t.descricao} {t.recorrente ? "🔁" : ""}</div>
                  </div>
                  <div className="mc-list-side">
                    <div className="mc-list-value">{t.valor != null ? fmtValor(t.valor) : ""}</div>
                    <div className="mc-list-sub">{t.vencimento ? fmtData(t.vencimento) : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mc-section">
        <div className="mc-section-head">
          <h2 className="mc-section-title">✅ Últimos pagamentos</h2>
        </div>
        <div className="mc-card">
          {pagamentos.length === 0 ? (
            <p className="mc-empty">Nenhum pagamento registrado ainda.</p>
          ) : (
            <div className="mc-list">
              {pagamentos.map((p) => (
                <div key={p.id} className="mc-list-row">
                  <div className="mc-list-body">
                    <div className="mc-list-desc">{p.divida.credor}</div>
                  </div>
                  <div className="mc-list-side">
                    <div className="mc-list-value">{fmtValor(p.valor)}</div>
                    <div className="mc-list-sub">{fmtData(p.data)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
