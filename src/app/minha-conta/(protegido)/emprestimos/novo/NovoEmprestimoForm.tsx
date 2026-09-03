"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

function fmtValor(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function paraNumero(texto: string): number | null {
  const n = Number(texto.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function NovoEmprestimoForm({ criarEmprestimo }: { criarEmprestimo: (fd: FormData) => Promise<void> }) {
  const [valorTotalTexto, setValorTotalTexto] = useState("");
  const [valorParcelaTexto, setValorParcelaTexto] = useState("");
  const [parcelasTexto, setParcelasTexto] = useState("");

  // Juros total = quanto a mais você vai pagar no total (parcela × qtd)
  // em relação ao valor que pegou emprestado. Só dá pra calcular quando
  // os três campos estão preenchidos — não é editável, é só informativo.
  const jurosTotal = useMemo(() => {
    const valorTotal = paraNumero(valorTotalTexto);
    const valorParcela = paraNumero(valorParcelaTexto);
    const parcelas = Number(parcelasTexto);
    if (valorTotal == null || valorParcela == null || !Number.isInteger(parcelas) || parcelas <= 0) return null;
    const totalAPagar = valorParcela * parcelas;
    return { totalAPagar, juros: totalAPagar - valorTotal };
  }, [valorTotalTexto, valorParcelaTexto, parcelasTexto]);

  return (
    <form action={criarEmprestimo} className="mc-form-card">
      <label className="mc-label">
        Quem emprestou *
        <input name="credor" required placeholder="Ex: Banco Inter, Nubank, João" className="mc-input" />
      </label>
      <label className="mc-label">
        Valor total tomado emprestado
        <input
          name="valorTotal"
          type="text"
          inputMode="decimal"
          placeholder="Deixe em branco se não lembrar"
          className="mc-input"
          value={valorTotalTexto}
          onChange={(e) => setValorTotalTexto(e.target.value)}
        />
      </label>
      <label className="mc-label">
        Valor da parcela
        <input
          name="valorParcela"
          type="text"
          inputMode="decimal"
          placeholder="Ex: 350,00 (o que você paga por mês)"
          className="mc-input"
          value={valorParcelaTexto}
          onChange={(e) => setValorParcelaTexto(e.target.value)}
        />
      </label>
      <label className="mc-label">
        Quantidade de parcelas *
        <input
          name="parcelas"
          required
          type="number"
          min={1}
          max={360}
          placeholder="Ex: 12"
          className="mc-input"
          value={parcelasTexto}
          onChange={(e) => setParcelasTexto(e.target.value)}
        />
      </label>
      <label className="mc-label">
        Data da primeira parcela *
        <input name="primeiraData" required type="date" className="mc-input" />
      </label>

      <div>
        <span className="mc-label" style={{ marginBottom: 7, display: "block" }}>Juros total estimado</span>
        <div className="emprestimo-juros-preview">
          {jurosTotal == null
            ? "Preencha valor total, valor da parcela e quantidade pra calcular"
            : jurosTotal.juros <= 0
              ? "Sem juros (ou você vai pagar menos do que pegou emprestado)"
              : `${fmtValor(jurosTotal.juros)} — você vai pagar ${fmtValor(jurosTotal.totalAPagar)} no total`}
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "var(--ink-faint)", lineHeight: 1.5 }}>
        Preencha pelo menos o valor total <strong>ou</strong> o valor da parcela. Se souber os dois, calculamos os
        juros pra você. As parcelas são geradas mensais a partir da primeira data — a data da última é calculada
        automaticamente. Depois de criado, dá pra marcar cada parcela como paga, adiantar qualquer uma (inclusive a
        última) e ajustar o valor pago em caso de desconto por antecipação.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="submit" className="mc-btn-primary" style={{ border: "none", flex: 1 }}>
          Criar empréstimo
        </button>
        <Link href="/minha-conta/emprestimos" className="mc-btn-secondary">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
