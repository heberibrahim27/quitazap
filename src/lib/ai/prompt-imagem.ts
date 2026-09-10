// Prompt de análise de imagem via GPT-4o Vision — DUPLICADO de
// src/app/api/webhook/zapi/route.ts (PROMPT_ANALISE_IMAGEM) pro chat nativo
// poder reaproveitar a mesma extração testada em produção no WhatsApp, sem
// tocar no arquivo do webhook (regra permanente desta sessão: zero import
// novo, zero mudança nele). Mesmo padrão já usado em controle-orquestrador.ts
// pra duplicar helpers pequenos do webhook em vez de importar dele — ver
// comentário no topo daquele arquivo. Se o prompt do webhook mudar, essa
// cópia precisa ser atualizada manualmente junto.
export const PROMPT_ANALISE_IMAGEM = `Analise esta imagem financeira. Pode ser:
- Boleto, fatura de cartão, extrato bancário, comprovante de empréstimo, carnê
- Contracheque, holerite, comprovante de salário ou folha de pagamento
- Recibo, nota fiscal ou cupom de uma COMPRA do dia a dia (mercado, farmácia, restaurante, loja, posto de gasolina, etc.)

Se for RECIBO, NOTA FISCAL ou CUPOM DE COMPRA (não é boleto, fatura, contracheque nem holerite — não tem valor de parcela mensal, vencimento futuro, nem é sobre salário/desconto em folha), extraia:
- Nome do estabelecimento (loja, mercado, restaurante etc.)
- Valor total pago

Responda EXATAMENTE nesse formato, numa frase só, sem mais nada — não inclua CNPJ, data, hora, número do pedido/cupom nem qualquer outro número além do valor total:
Comprei em [nome do estabelecimento], R$ [valor total]

Exemplo: Comprei em Mercado Extra, R$ 85,30

Se for CONTRACHEQUE ou HOLERITE, extraia:
- Nome do órgão ou empresa pagadora
- Cargo ou função
- Mês e ano de referência
- Total de vantagens
- Total de descontos
- Salário líquido
- Se houver 13º salário, abono, férias ou verba extraordinária, informe o valor e calcule o líquido normal sem esse extra

CLASSIFICAÇÃO DOS DESCONTOS EM FOLHA:

1. EMPRESTIMOS OU DESCONTOS PARCELADOS

Liste como emprestimos TODOS os descontos em folha que tenham formato NNN/NNN com total de parcelas menor que 900.

Isso inclui:
- Empréstimo comum
- Consignado
- Banco
- Financeira
- Crédito
- Benefício assistencial
- Auxílio assistencial
- Qualquer desconto parcelado com fim definido

Exemplos:
- Empréstimo Comum 3 - BANCO DIGIO S.A 027/120 304,00
  banco: BANCO DIGIO S.A
  parcelaAtual: 27
  totalParcelas: 120
  valorParcela: 304,00

- Benefício Assistencial - ASSEBA 015/036 306,89
  banco: ASSEBA
  parcelaAtual: 15
  totalParcelas: 36
  valorParcela: 306,89

- Benefício Assistencial - ASTEBA 017/036 320,63
  banco: ASTEBA
  parcelaAtual: 17
  totalParcelas: 36
  valorParcela: 320,63

2. ASSOCIACOES OU MENSALIDADES RECORRENTES

Liste como associacoes SOMENTE mensalidades ou associações recorrentes com formato NNN/999 ou NNN/000.

Exemplos:
- Mensalidade Valor - ASSEBA 015/999 80,00
  nome: ASSEBA
  valorMensal: 80,00

- Mensalidade Valor - ASTEBA 015/999 80,00
  nome: ASTEBA
  valorMensal: 80,00

- Mensalidade Valor - ASPRA-BA 113/999 87,00
  nome: ASPRA-BA
  valorMensal: 87,00

REGRA CRITICA:
- NNN/999 ou NNN/000 significa associação ou mensalidade recorrente
- NNN/036, NNN/048, NNN/060, NNN/096, NNN/120 ou qualquer total menor que 900 significa empréstimo ou desconto parcelado
- Nunca classifique Benefício Assistencial 015/036 como associação
- Benefício Assistencial com prazo finito deve entrar em emprestimos

Informe também:
- Margem comprometida
- Descontos de saúde
- Previdência
- Imposto de renda

Não inclua saúde, Planserv, assistência médica, previdência, INSS, SPSM, IPREV ou IR nos arrays emprestimos ou associacoes.

IMPORTANTE:
Os consignados e descontos parcelados já estão descontados no líquido.
Use o líquido normal sem 13º, férias ou abono como renda mensal recorrente.
Se houver verba extraordinária no mês, trate como dinheiro extra do mês, não como renda fixa mensal.

Se for BOLETO, FATURA ou DÍVIDA, extraia:
- Credor, banco ou loja
- Valor total da dívida ou da fatura
- Valor da parcela mensal
- Número de parcelas restantes
- Data de vencimento
- Se está em atraso

Responda assim:
Fatura Nubank de R$ 1.500 vencendo dia 15. Mínimo R$ 150.

Se a imagem NÃO for financeira, responda apenas: [NAO_FINANCEIRA]`;
