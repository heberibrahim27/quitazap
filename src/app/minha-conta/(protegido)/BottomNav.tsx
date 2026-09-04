"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NOMES_CATEGORIAS_GASTO, NOMES_CATEGORIAS_RECEITA, definirCategoriaGasto } from "@/lib/gasto-flow";
import { criarDespesaRapida, criarReceitaRapida } from "./lancamento-actions";
import { criarMeta } from "./metas/metas-actions";

type VisaoFab = "menu" | "despesa" | "receita" | "meta";

function hojeStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

// Componente à parte (client) só pra saber a rota atual — o layout continua
// Server Component.
//
// O "+" central abre um sheet com atalhos ("Nova despesa"/"Nova receita")
// que trocam o conteúdo do MESMO sheet pelo formulário — sem navegar pra
// outra página, então o cliente não perde o lugar onde estava nem precisa
// rolar por um formulário fixo no topo da tela pra ver a lista. "Mais" abre
// um sheet com o resto das páginas (Receitas, Despesas, Dívidas, Agenda,
// Metas, Perfil) e o Sair, já que o cabeçalho não mostra mais esse botão.
export function BottomNav({
  sair,
  cartoes,
}: {
  sair: (fd: FormData) => Promise<void>;
  cartoes: { id: string; nome: string }[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const naHome = pathname === "/minha-conta";
  const naMovimentacoes = pathname === "/minha-conta/movimentacoes";
  const naCartoes = pathname.startsWith("/minha-conta/cartoes");

  const [fabAberto, setFabAberto] = useState(false);
  const [fabVisao, setFabVisao] = useState<VisaoFab>("menu");
  const [maisAberto, setMaisAberto] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const [cartaoSelecionado, setCartaoSelecionado] = useState(false);
  const [categoria, setCategoria] = useState("Outros");
  const [categoriaEditadaManualmente, setCategoriaEditadaManualmente] = useState(false);

  const fecharTudo = () => {
    setFabAberto(false);
    setMaisAberto(false);
    setFabVisao("menu");
    setErroForm(null);
    setCartaoSelecionado(false);
    setCategoria("Outros");
    setCategoriaEditadaManualmente(false);
  };

  const voltarAoMenu = () => {
    setFabVisao("menu");
    setErroForm(null);
    setCartaoSelecionado(false);
    setCategoria("Outros");
    setCategoriaEditadaManualmente(false);
  };

  function aoEnviarDespesa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErroForm(null);
    startTransition(async () => {
      const resultado = await criarDespesaRapida(formData);
      if (resultado.erro) {
        setErroForm(resultado.erro);
        return;
      }
      fecharTudo();
      router.refresh();
    });
  }

  function aoEnviarReceita(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErroForm(null);
    startTransition(async () => {
      const resultado = await criarReceitaRapida(formData);
      if (resultado.erro) {
        setErroForm(resultado.erro);
        return;
      }
      fecharTudo();
      router.refresh();
    });
  }

  function aoEnviarMeta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErroForm(null);
    startTransition(async () => {
      const resultado = await criarMeta(formData);
      if (resultado.erro) {
        setErroForm(resultado.erro);
        return;
      }
      fecharTudo();
      router.refresh();
    });
  }

  return (
    <>
      <nav className="bottom-nav" aria-label="Navegação">
        <div className="bn-side">
          <Link href="/minha-conta" className={`bn-item ${naHome ? "active" : ""}`}>
            <span className="bn-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11L12 4l8 7" /><path d="M6 9.5V20a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1V9.5" /></svg>
            </span>
            Início
          </Link>
          <Link href="/minha-conta/movimentacoes" className={`bn-item ${naMovimentacoes ? "active" : ""}`}>
            <span className="bn-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l3 3v15H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>
            </span>
            Extrato
          </Link>
        </div>

        <span className="bn-fab-wrap">
          <button type="button" className="bn-fab" aria-label="Novo lançamento" onClick={() => setFabAberto(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </span>

        <div className="bn-side">
          <Link href="/minha-conta/cartoes" className={`bn-item ${naCartoes ? "active" : ""}`}>
            <span className="bn-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="15" height="9.5" rx="2.2" opacity="0.5" /><rect x="2.5" y="7.5" width="17.5" height="13" rx="2.5" /><path d="M2.5 12.5h17.5" /><rect x="5" y="16" width="4" height="3" rx="0.8" /></svg>
            </span>
            Cartões
          </Link>
          <button type="button" className={`bn-item ${maisAberto ? "active" : ""}`} onClick={() => setMaisAberto(true)}>
            <span className="bn-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
            </span>
            Mais
          </button>
        </div>
      </nav>

      <div className={`fab-backdrop ${fabAberto || maisAberto ? "open" : ""}`} onClick={fecharTudo} />

      <div className={`fab-sheet ${fabAberto ? "open" : ""}`} style={{ maxHeight: "85vh", overflowY: "auto" }}>
        <button type="button" className="fab-sheet-handle" onClick={fecharTudo} aria-label="Fechar" />
        <div className="fab-sheet-head">
          {fabVisao !== "menu" && (
            <button type="button" className="fab-sheet-back" onClick={voltarAoMenu} aria-label="Voltar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
          )}
          <p className="fab-sheet-title">
            {fabVisao === "menu"
              ? "Novo lançamento"
              : fabVisao === "despesa"
                ? "Nova despesa"
                : fabVisao === "receita"
                  ? "Nova receita"
                  : "Nova meta"}
          </p>
          <button type="button" className="fab-sheet-close" onClick={fecharTudo} aria-label="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {fabVisao === "menu" && (
          <>
            <button type="button" className="fab-sheet-option" onClick={() => setFabVisao("despesa")}>
              <span className="fab-sheet-icon blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11L12 4l8 7" /><path d="M6 9.5V20a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1V9.5" /></svg>
              </span>
              Nova despesa
            </button>
            <button type="button" className="fab-sheet-option" onClick={() => setFabVisao("receita")}>
              <span className="fab-sheet-icon green">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
              </span>
              Nova receita
            </button>
            <button type="button" className="fab-sheet-option" onClick={() => setFabVisao("meta")}>
              <span className="fab-sheet-icon blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>
              </span>
              Nova meta
            </button>
            <p style={{ margin: "10px 4px 0", fontSize: 12, color: "var(--ink-faint)", lineHeight: 1.5 }}>
              Também dá pra lançar tudo isso por texto ou áudio direto no WhatsApp.
            </p>
          </>
        )}

        {fabVisao === "despesa" && (
          <form onSubmit={aoEnviarDespesa} className="mc-form-card" style={{ padding: "4px 0 0", background: "none", backdropFilter: "none", WebkitBackdropFilter: "none", boxShadow: "none" }}>
            {erroForm && (
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--red)" }}>{erroForm}</p>
            )}
            <label className="mc-label">
              Descrição *
              <input
                name="descricao"
                required
                placeholder="Ex: Mercado, Aluguel, Uber"
                className="mc-input"
                onChange={(e) => {
                  // Sugere a categoria a partir do que foi digitado, mas só
                  // enquanto o cliente não mexeu no select manualmente —
                  // depois disso, a escolha dele manda.
                  if (!categoriaEditadaManualmente) setCategoria(definirCategoriaGasto(e.target.value));
                }}
              />
            </label>
            <label className="mc-label">
              Categoria
              <select
                name="categoria"
                value={categoria}
                onChange={(e) => {
                  setCategoria(e.target.value);
                  setCategoriaEditadaManualmente(true);
                }}
                className="mc-input"
              >
                {NOMES_CATEGORIAS_GASTO.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="mc-label">
              Valor *
              <input name="valor" required type="text" inputMode="decimal" placeholder="Ex: 150,00" className="mc-input" />
            </label>
            <label className="mc-label">
              Data
              <input name="data" type="date" defaultValue={hojeStr()} className="mc-input" />
            </label>
            <label className="mc-label">
              Tipo
              <select name="tipo" defaultValue="DESPESA_VARIAVEL" className="mc-input">
                <option value="DESPESA_VARIAVEL">Despesa variável</option>
                <option value="DESPESA_FIXA">Despesa fixa (repete todo mês)</option>
              </select>
            </label>
            {cartoes.length > 0 && (
              <label className="mc-label">
                Cartão (só se for compra no cartão)
                <select
                  name="cartaoId"
                  defaultValue=""
                  className="mc-input"
                  onChange={(e) => setCartaoSelecionado(e.target.value !== "")}
                >
                  <option value="">Nenhum — despesa direto</option>
                  {cartoes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </label>
            )}
            {cartaoSelecionado && (
              <label className="mc-label">
                Parcelas
                <select name="parcelas" defaultValue="1" className="mc-input">
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n === 1 ? "À vista (1x)" : `${n}x`}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="mc-label" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input name="recorrente" type="checkbox" style={{ width: 16, height: 16 }} />
              Recorrente (repete todo mês)
            </label>
            <button type="submit" className="mc-btn-primary" style={{ border: "none", width: "100%" }} disabled={enviando}>
              {enviando ? "Salvando..." : "Adicionar despesa"}
            </button>
          </form>
        )}

        {fabVisao === "receita" && (
          <form onSubmit={aoEnviarReceita} className="mc-form-card" style={{ padding: "4px 0 0", background: "none", backdropFilter: "none", WebkitBackdropFilter: "none", boxShadow: "none" }}>
            {erroForm && (
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--red)" }}>{erroForm}</p>
            )}
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-faint)", lineHeight: 1.5 }}>
              Lance seu salário e outras fontes de renda aqui — é isso que vira sua &quot;Renda&quot; no Dashboard e no Plano de Pagamento.
            </p>
            <label className="mc-label">
              Descrição *
              <input name="descricao" required placeholder="Ex: Salário, Freelance, Aluguel recebido" className="mc-input" />
            </label>
            <label className="mc-label">
              Categoria
              <select name="categoria" defaultValue="Salário" className="mc-input">
                {NOMES_CATEGORIAS_RECEITA.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="mc-label">
              Valor *
              <input name="valor" required type="text" inputMode="decimal" placeholder="Ex: 3500,00" className="mc-input" />
            </label>
            <label className="mc-label">
              Data
              <input name="data" type="date" defaultValue={hojeStr()} className="mc-input" />
            </label>
            <label className="mc-label" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input name="recorrente" type="checkbox" style={{ width: 16, height: 16 }} />
              Recorrente (repete todo mês, ex: salário fixo)
            </label>
            <button type="submit" className="mc-btn-primary" style={{ border: "none", width: "100%" }} disabled={enviando}>
              {enviando ? "Salvando..." : "Adicionar receita"}
            </button>
          </form>
        )}

        {fabVisao === "meta" && (
          <form onSubmit={aoEnviarMeta} className="mc-form-card" style={{ padding: "4px 0 0", background: "none", backdropFilter: "none", WebkitBackdropFilter: "none", boxShadow: "none" }}>
            {erroForm && (
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--red)" }}>{erroForm}</p>
            )}
            <label className="mc-label">
              Nome da meta *
              <input name="nome" required placeholder="Ex: Trocar de carro" className="mc-input" />
            </label>
            <label className="mc-label">
              Valor que quer guardar *
              <input name="valorAlvo" required type="text" inputMode="decimal" placeholder="Ex: 15.000,00" className="mc-input" />
            </label>
            <button type="submit" className="mc-btn-primary" style={{ border: "none", width: "100%" }} disabled={enviando}>
              {enviando ? "Salvando..." : "Criar meta"}
            </button>
          </form>
        )}
      </div>

      <div className={`fab-sheet ${maisAberto ? "open" : ""}`} style={{ maxHeight: "80vh", overflowY: "auto" }}>
        <button type="button" className="fab-sheet-handle" onClick={fecharTudo} aria-label="Fechar" />
        <div className="fab-sheet-head">
          <p className="fab-sheet-title">Mais</p>
          <button type="button" className="fab-sheet-close" onClick={fecharTudo} aria-label="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <Link href="/minha-conta/receitas" className="fab-sheet-option" onClick={fecharTudo}>
          <span className="fab-sheet-icon green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
          </span>
          Receitas
        </Link>
        <Link href="/minha-conta/despesas" className="fab-sheet-option" onClick={fecharTudo}>
          <span className="fab-sheet-icon blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11L12 4l8 7" /><path d="M6 9.5V20a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1V9.5" /></svg>
          </span>
          Despesas
        </Link>
        <Link href="/minha-conta/gastos" className="fab-sheet-option" onClick={fecharTudo}>
          <span className="fab-sheet-icon orange">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 3.5" /></svg>
          </span>
          Onde está indo meu dinheiro
        </Link>
        <Link href="/minha-conta/emprestimos" className="fab-sheet-option" onClick={fecharTudo}>
          <span className="fab-sheet-icon blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M4 21V10l8-6 8 6v11" /><path d="M9 21v-7h6v7" /></svg>
          </span>
          Empréstimos
        </Link>
        <Link href="/minha-conta/dividas" className="fab-sheet-option" onClick={fecharTudo}>
          <span className="fab-sheet-icon red">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 16.5h.01" /><path d="M10.3 3.9L2.5 18a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" /></svg>
          </span>
          Dívidas
        </Link>
        <Link href="/minha-conta/agenda" className="fab-sheet-option" onClick={fecharTudo}>
          <span className="fab-sheet-icon blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="4" /><path d="M3 9.5h18" /><path d="M8 3v3M16 3v3" /><circle cx="9" cy="14" r="1.15" fill="currentColor" stroke="none" /><circle cx="15" cy="14" r="1.15" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1.15" fill="currentColor" stroke="none" /></svg>
          </span>
          Agenda
        </Link>
        <Link href="/minha-conta/plano" className="fab-sheet-option" onClick={fecharTudo}>
          <span className="fab-sheet-icon blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M13 7l-4.5 6.2H12l-1 4L15.5 11H12l1-4z" /></svg>
          </span>
          Plano de pagamento
        </Link>
        <Link href="/minha-conta/metas" className="fab-sheet-option" onClick={fecharTudo}>
          <span className="fab-sheet-icon green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>
          </span>
          Metas
        </Link>
        <Link href="/minha-conta/perfil" className="fab-sheet-option" onClick={fecharTudo}>
          <span className="fab-sheet-icon blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" /></svg>
          </span>
          Perfil
        </Link>
        <form action={sair}>
          <button type="submit" className="fab-sheet-option" style={{ borderTop: "1px solid var(--line)" }}>
            <span className="fab-sheet-icon red">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
            </span>
            Sair da conta
          </button>
        </form>
      </div>
    </>
  );
}
