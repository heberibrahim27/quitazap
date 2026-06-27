const XLSX = require('xlsx');

const wb = XLSX.utils.book_new();

const precoMensal = 47.00;
const custoFixo = 105.82;
const custoVarCliente = 2.56;

// ── ABA 1: CUSTOS MENSAIS ──
const ws1_data = [
  ["QuitaZAP — Estrutura de Custos Mensais", "", "", ""],
  [],
  ["CUSTOS FIXOS MENSAIS", "", "", ""],
  ["Serviço", "Valor (R$)", "Status", "Observação"],
  ["Z-API (WhatsApp Bot)", 99.99, "⏳ Pendente pagamento", "Trial expira em ~1 dia — URGENTE"],
  ["Vercel (hospedagem)", 0.00, "✅ Grátis", "Free tier — até 100GB banda/mês"],
  ["Supabase (banco de dados)", 0.00, "✅ Grátis", "Free tier — até 500MB"],
  ["CAKTO (plataforma vendas)", 0.00, "✅ Grátis", "Cobra % por venda, sem mensalidade"],
  ["Domínio (.com.br)", 5.83, "⏳ Não adquirido", "~R$70/ano ÷ 12 meses"],
  ["TOTAL FIXO MENSAL", 105.82, "", ""],
  [],
  ["CUSTOS VARIÁVEIS (por cliente/mês)", "", "", ""],
  ["Serviço", "Valor (R$)", "Status", "Observação"],
  ["OpenAI GPT-4o-mini (IA)", 0.07, "✅ Ativo", "~R$0,07 por cliente/mês (estimativa)"],
  ["Taxa CAKTO via PIX (5,3%)", 2.49, "✅ Automático", "R$47 × 5,3% ≈ R$2,49 descontado na venda"],
  ["TOTAL VARIÁVEL / CLIENTE", 2.56, "", ""],
];
const ws1 = XLSX.utils.aoa_to_sheet(ws1_data);
ws1['!cols'] = [{wch:32},{wch:16},{wch:22},{wch:40}];
XLSX.utils.book_append_sheet(wb, ws1, "Custos Mensais");

// ── ABA 2: PROJEÇÃO ──
const ws2_data = [
  ["QuitaZAP — Projeção de Receita e Lucro", "", "", "", "", "", "", ""],
  [],
  ["PREMISSAS", ""],
  ["Preço mensal (R$)", precoMensal],
  ["Custo fixo mensal (R$)", custoFixo],
  ["Custo variável / cliente (R$)", custoVarCliente],
  [],
  ["Clientes", "Receita Bruta (R$)", "Custo Fixo (R$)", "Custo Variável (R$)", "Custo Total (R$)", "Lucro Líquido (R$)", "Margem %", "Status"],
];

for (const n of [1, 3, 5, 10, 20, 30, 50]) {
  const receita = n * precoMensal;
  const varTotal = n * custoVarCliente;
  const total = custoFixo + varTotal;
  const lucro = receita - total;
  const margem = (lucro / receita * 100).toFixed(1) + '%';
  const status = lucro < 0 ? "🔴 Prejuízo" : lucro < 50 ? "🟡 Break-even" : "🟢 Lucro";
  ws2_data.push([n, +receita.toFixed(2), +custoFixo.toFixed(2), +varTotal.toFixed(2), +total.toFixed(2), +lucro.toFixed(2), margem, status]);
}

ws2_data.push([]);
ws2_data.push(["💡 Break-even: 3 clientes cobrem todos os custos. A partir do 4º cliente é lucro puro."]);

const ws2 = XLSX.utils.aoa_to_sheet(ws2_data);
ws2['!cols'] = [{wch:12},{wch:18},{wch:16},{wch:18},{wch:16},{wch:18},{wch:10},{wch:16}];
XLSX.utils.book_append_sheet(wb, ws2, "Projeção de Lucro");

// ── ABA 3: INVESTIMENTO INICIAL ──
const ws3_data = [
  ["QuitaZAP — Investimento para Lançar o MVP", "", "", ""],
  [],
  ["Item", "Valor (R$)", "Tipo", "Observação"],
  ["Desenvolvimento do sistema", 0.00, "Zero", "Desenvolvido com Claude AI — sem custo de dev"],
  ["Hospedagem Vercel", 0.00, "Zero", "Free tier — sem custo"],
  ["Banco de dados Supabase", 0.00, "Zero", "Free tier — sem custo"],
  ["Z-API — 1º mês", 99.99, "Recorrente", "Precisa pagar — trial expirando"],
  ["Domínio quitazap.com.br", 70.00, "Anual", "Estimativa — compra única por ano"],
  ["OpenAI (créditos iniciais)", 5.00, "Variável", "Estimativa testes + primeiros clientes"],
  ["CAKTO (plataforma)", 0.00, "Zero", "Gratuito para produtores"],
  ["INVESTIMENTO TOTAL INICIAL", 174.99, "", ""],
  [],
  ["🚀 ROI: Com 4 clientes pagantes (R$188/mês) você recupera todo o investimento inicial no 1º mês."],
];
const ws3 = XLSX.utils.aoa_to_sheet(ws3_data);
ws3['!cols'] = [{wch:35},{wch:16},{wch:14},{wch:45}];
XLSX.utils.book_append_sheet(wb, ws3, "Investimento Inicial");

XLSX.writeFile(wb, "C:\\Users\\HOME\\Claude\\Projects\\QuitaZAP MVP\\QuitaZAP_Custos.xlsx");
console.log("Planilha salva com sucesso!");
