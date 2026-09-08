// ─────────────────────────────────────────
// QuitaZAP — instrução de formatação compartilhada pros resolvers de IA
// ─────────────────────────────────────────
// Achado ao vivo (Ibrahim, 08/09/2026): respostas geradas por IA saíam com
// **negrito duplo** (padrão markdown comum, não o que o WhatsApp entende) e
// em parágrafo corrido, difícil de ler rápido no celular. WhatsApp só
// reconhece *um* asterisco pra negrito e _underscore_ pra itálico; **dois**
// asteriscos aparecem literalmente na tela pro cliente.
//
// Cada resolver (consulta-financeira, limite-seguro, plano-pagamento,
// vazamentos, horas-trabalho, rota-dividas, simulador-parcela) monta seu
// próprio system prompt (regras específicas do que pode/não pode dizer),
// mas todos compartilham a MESMA regra de formatação — centralizada aqui
// pra corrigir/ajustar formatação em um lugar só, sem repetir o texto em
// 7 arquivos diferentes.
export const INSTRUCAO_FORMATACAO_WHATSAPP =
  " Formatação: isto é WhatsApp, não markdown padrão — pra negrito use UM asterisco de cada lado (*assim*), nunca dois (**nunca**); pra itálico use underscore (_assim_). Não deixe nenhum asterisco duplicado ou sobrando no texto. Quando tiver mais de um número ou tópico pra mostrar, não escreva um parágrafo corrido só — quebre em linhas curtas, uma por tópico, cada uma com um emoji simples no início pra guiar o olho (ex: 💰 valor, 📅 prazo/data, ⚠️ alerta, 📊 resumo/comparação, ✅ confirmação) e o rótulo em *negrito* antes do número. Mesmo assim respeite o limite de linhas pedido acima — quebrar em tópicos não é motivo pra alongar a resposta.";
