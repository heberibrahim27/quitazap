import type { DiagnosticoIA, DividaIA } from "./ai-bot";

function parseValorBR(valor: string | undefined): number | undefined {
  if (!valor) return undefined;
  const normalizado = valor.replace(/\./g, "").replace(",", ".");
  const numero = Number(normalizado);
  return Number.isFinite(numero) && numero > 0 ? numero : undefined;
}

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function capturarValor(textoNormalizado: string, regex: RegExp): number | undefined {
  return parseValorBR(textoNormalizado.match(regex)?.[1]);
}

function chave(nome: string): string {
  return normalizarTexto(nome).replace(/[^a-z0-9]/g, "");
}

function ehCabecalhoSecao(linhaNormalizada: string): boolean {
  return /^(dependentes?|despesas?|despesas fixas|cartoes?|cartoes de credito|gastos|renda|salario)\b/.test(
    linhaNormalizada.replace(/:$/, "")
  );
}

function extrairDadosServidorPublicoManual(textoOriginal: string) {
  const emprestimos: DividaIA[] = [];
  const associacoes: DividaIA[] = [];
  const linhasNaoReconhecidas: string[] = [];
  let secao: "EMPRESTIMOS" | "ASSOCIACOES" | null = null;

  for (const linhaOriginal of textoOriginal.split(/\r?\n/)) {
    const linha = linhaOriginal.trim();
    if (!linha) continue;

    const normalizada = normalizarTexto(linha).replace(/:$/, "").trim();

    if (/^(emprestimos?|consignados?|descontos em folha|emprestimos em folha|emprestimos\/consignados)/.test(normalizada)) {
      secao = "EMPRESTIMOS";
      continue;
    }

    if (/^(associacoes?|mensalidades?|associacoes\/mensalidades)/.test(normalizada)) {
      secao = "ASSOCIACOES";
      continue;
    }

    if (ehCabecalhoSecao(normalizada)) {
      secao = null;
      continue;
    }

    if (secao === "EMPRESTIMOS") {
      const match = linha.match(/^(.+?)\s+R?\$?\s*([\d.]+(?:,\d{1,2})?|\d+)\s+(\d{1,3})\s*\/\s*(\d{1,3})\b/i);
      if (!match) {
        linhasNaoReconhecidas.push(linha);
        continue;
      }

      const valorParcela = parseValorBR(match[2]);
      const parcelaAtual = Number(match[3]);
      const totalParcelas = Number(match[4]);
      if (!valorParcela || !parcelaAtual || !totalParcelas || parcelaAtual > totalParcelas) {
        linhasNaoReconhecidas.push(linha);
        continue;
      }

      const parcelasRestantes = Math.max(totalParcelas - parcelaAtual, 0);
      emprestimos.push({
        credor: match[1].trim(),
        tipo: "EMPRESTIMO",
        valorOriginal: valorParcela * parcelasRestantes,
        saldoAtual: valorParcela * parcelasRestantes,
        valorParcela,
        parcelaAtual,
        totalParcelas,
        parcelasRestantes,
        emAtraso: false,
      });
      continue;
    }

    if (secao === "ASSOCIACOES") {
      const match = linha.match(/^(.+?)\s+R?\$?\s*([\d.]+(?:,\d{1,2})?|\d+)\s*$/i);
      if (!match) {
        linhasNaoReconhecidas.push(linha);
        continue;
      }

      const valorParcela = parseValorBR(match[2]);
      if (!valorParcela) {
        linhasNaoReconhecidas.push(linha);
        continue;
      }

      associacoes.push({
        credor: match[1].trim(),
        tipo: "ASSOCIACAO",
        valorOriginal: 0,
        saldoAtual: 0,
        valorParcela,
        parcelasRestantes: 999,
        emAtraso: false,
      });
    }
  }

  return { emprestimos, associacoes, linhasNaoReconhecidas };
}

function extrairRendaServidorPublicoManual(textoOriginal: string) {
  const textoNormalizado = normalizarTexto(textoOriginal);
  const salarioLiquidoNormal = capturarValor(
    textoNormalizado,
    /salario\s+liquido\s+normal\s*:?\s*r?\$?\s*([\d.,]+)/
  );
  const liquidoRecebidoEsteMes = capturarValor(
    textoNormalizado,
    /liquido\s+recebido\s+(?:este|nesse)\s+mes\s*:?\s*r?\$?\s*([\d.,]+)/
  );
  const verbaExtra = capturarValor(
    textoNormalizado,
    /(?:13[ºo]?(?:\s*\/\s*(?:verba\s+extra|ferias))?|verba\s+extra|ferias)\s*:?\s*r?\$?\s*([\d.,]+)/
  );

  return { salarioLiquidoNormal, liquidoRecebidoEsteMes, verbaExtra };
}

function extrairCartoesComVencimento(textoOriginal: string) {
  return textoOriginal
    .split(/\r?\n/)
    .map((linha) => {
      const match = linha.trim().match(/^(.+?)\s+R?\$?\s*([\d.]+(?:,\d{1,2})?|\d+)\s+(?:vence\s+)?dia\s+(\d{1,2})\b/i);
      if (!match) return null;

      const valor = parseValorBR(match[2]);
      const diaVencimento = Number(match[3]);
      if (!valor || diaVencimento < 1 || diaVencimento > 31) return null;

      return {
        credor: match[1].trim(),
        valor,
        diaVencimento,
      };
    })
    .filter((cartao): cartao is { credor: string; valor: number; diaVencimento: number } => Boolean(cartao));
}

export function normalizarDiagnosticoManual(diag: DiagnosticoIA, mensagens: string[]): DiagnosticoIA {
  const textoOriginal = mensagens.join("\n");
  const textoNormalizado = normalizarTexto(textoOriginal);
  const isServidor =
    (diag.dadosPessoais?.vinculo ?? "").toUpperCase().includes("SERVIDOR_PUBLICO") ||
    /\bservidor publico\b|\bservidor\b/.test(textoNormalizado);

  const renda = { ...(diag.renda ?? {}) };

  if (isServidor) {
    const salarioNormal = capturarValor(
      textoNormalizado,
      /salario\s+liquido\s+normal\s*:?\s*r?\$?\s*([\d.,]+)/
    );
    const liquidoMes = capturarValor(
      textoNormalizado,
      /liquido\s+recebido\s+(?:este|nesse)\s+mes\s*:?\s*r?\$?\s*([\d.,]+)/
    );
    const verbaExtra = capturarValor(
      textoNormalizado,
      /(?:13[ºo]?(?:\s*\/\s*(?:verba\s+extra|ferias))?|verba\s+extra|ferias)\s*:?\s*r?\$?\s*([\d.,]+)/
    );

    if (salarioNormal) renda.salarioLiquido = salarioNormal;
    if (liquidoMes) renda.salarioLiquidoComExtras = liquidoMes;
    if (verbaExtra) renda.adiantamento13 = verbaExtra;
    if (liquidoMes) {
      renda.totalFamiliar = liquidoMes;
    } else if (salarioNormal && verbaExtra) {
      renda.totalFamiliar = salarioNormal + verbaExtra;
    }
  }

  const dadosFolha = isServidor
    ? extrairDadosServidorPublicoManual(textoOriginal)
    : { emprestimos: [], associacoes: [] };
  const temFolhaManual = dadosFolha.emprestimos.length > 0 || dadosFolha.associacoes.length > 0;
  const dividas = temFolhaManual
    ? [
        ...dadosFolha.emprestimos,
        ...dadosFolha.associacoes,
        ...(diag.dividas ?? []).filter((d) => {
          const credor = normalizarTexto(d.credor ?? "");
          return (
            d.tipo !== "EMPRESTIMO" &&
            d.tipo !== "ASSOCIACAO" &&
            !/^(emprestimo|associacao)\s*\d+/.test(credor)
          );
        }),
      ]
    : [...(diag.dividas ?? [])];
  const cartoes = extrairCartoesComVencimento(textoOriginal);

  for (const cartao of cartoes) {
    const cartaoChave = chave(cartao.credor);
    const existente = dividas.find((d) => {
      const credorChave = chave(d.credor ?? "");
      return d.tipo === "CARTAO" && (credorChave.includes(cartaoChave) || cartaoChave.includes(credorChave));
    });

    if (existente) {
      existente.diaVencimento = cartao.diaVencimento;
      existente.valorParcela = existente.valorParcela || cartao.valor;
      existente.saldoAtual = existente.saldoAtual || cartao.valor;
      existente.parcelasRestantes = existente.parcelasRestantes || 1;
      existente.emAtraso = existente.emAtraso ?? false;
    } else {
      dividas.push({
        credor: cartao.credor,
        tipo: "CARTAO",
        valorOriginal: cartao.valor,
        saldoAtual: cartao.valor,
        valorParcela: cartao.valor,
        parcelasRestantes: 1,
        diaVencimento: cartao.diaVencimento,
        emAtraso: false,
      } satisfies DividaIA);
    }
  }

  return {
    ...diag,
    renda,
    dividas,
    cartoes: (diag.cartoes ?? []).filter((cartao) => {
      const banco = chave(cartao.banco ?? "");
      return !cartoes.some((c) => banco && chave(c.credor) === banco);
    }),
  };
}

export { extrairDadosServidorPublicoManual, extrairRendaServidorPublicoManual };
