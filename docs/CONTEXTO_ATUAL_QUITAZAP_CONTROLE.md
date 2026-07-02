\# Contexto Atual — QuitaZAP Controle



\## Projeto



Caminho local:



C:\\Users\\HOME\\Desktop\\quitaZAP



Stack:



\- Next.js

\- TypeScript

\- Prisma

\- WhatsApp Z-API

\- OpenAI

\- Vercel



\## Regra de condução



Trabalhar com um comando por vez no Codex.



Fluxo obrigatório:



1\. Enviar um comando ao Codex

2\. Aguardar retorno completo

3\. Analisar retorno

4\. Testar se necessário

5\. Commit/push se aprovado

6\. Só depois enviar novo comando



Não empilhar comandos.



\## Status aprovado



Fluxo financeiro base aprovado:



\- Resetar

\- Onboarding

\- Renda mensal

\- Pular despesas fixas

\- Receita/entrada

\- Despesa fixa

\- Despesa variável

\- IA interpreta frase bagunçada

\- Prévia com 1/2

\- 1 confirma e salva

\- 2 cancela e limpa pendência

\- 1/2 sem pendência respondem corretamente

\- Listar despesas fixas

\- Saldo calcula corretamente

\- Guardião bloqueia fora de escopo



\## Fluxo IA aprovado



Regra central:



Usuário escreve → IA organiza → Bot mostra prévia → Cliente confirma ou cancela → Sistema salva → Sistema calcula



A IA interpreta, mas não calcula nem salva sozinha.



O sistema salva usando os itens estruturados da confirmação pendente, sem reprocessar o texto original.



\## Receitas



Aprovado:



"anota pra mim cliente pagou 200,00"



Comportamento esperado:



\- Tipo: receita

\- Descrição: Cliente pagou

\- Categoria: Recebimento de cliente

\- Valor: R$ 200,00

\- Soma no saldo do mês



\## Lote misto aprovado



Mensagem aprovada:



agua na rua 2,50. chatgpt mes 110. energia 200,00 akuguel 800, pensão 900



Resultado esperado:



\- Água na rua = despesa variável

\- ChatGPT = despesa fixa

\- Energia = despesa fixa

\- Aluguel = despesa fixa

\- Pensão = despesa fixa



Confirmação com 1 salva tudo corretamente.



\## Netflix + Mercado aprovado



Mensagem aprovada:



netflix mes 39,90. mercado 25,00



Resultado esperado:



\- Netflix = despesa fixa / Assinaturas / R$ 39,90

\- Mercado = despesa variável / Mercado / R$ 25,00



2 cancela corretamente.

1 salva corretamente.



\## Cartão e fatura fechada v1



Aprovado:



\- Configurar cartão

\- Registrar gasto no cartão

\- Fatura aberta soma

\- Fatura fechada separa valor fechado

\- Nova fatura aberta zera após fechamento

\- Novo gasto após fechamento entra na nova fatura aberta

\- Pagamento de fatura ainda não implementado, mas bloqueado com segurança



Teste aprovado:



Nubank fecha dia 25 e vence dia 05  

ifood 40 no nubank  

uber 30 no nubank  

fatura nubank fechou em 70  

mercado 100 no nubank  

paguei fatura nubank 70



Resultado:



\- Fatura fechada Nubank: R$ 70,00

\- Fatura aberta Nubank: R$ 100,00

\- Pagamento de fatura não vira gasto comum



\## Último bug pendente



Mensagem testada:



posto 150 no santander  

almoço 35 no picpay  

assinatura 29,90 no c6  

compra 80 no bradesco



Resultado errado:



O bot salvou direto como despesas fixas:



\- Posto no santander R$ 150,00

\- Almoço no picpay R$ 35,00

\- No c6 R$ 29,90

\- Compra no bradesco R$ 80,00



Resultado esperado:



O bot deve gerar prévia de gastos no cartão:



1\. Posto — Cartão Santander — R$ 150,00

2\. Almoço — Cartão PicPay — R$ 35,00

3\. Assinatura — Cartão C6 — R$ 29,90

4\. Compra — Cartão Bradesco — R$ 80,00



Depois pedir confirmação:



1️⃣ Sim, registrar tudo  

2️⃣ Não, quero corrigir



Regra:



Lote com padrão:



descrição + valor + no/na/no cartão/no banco/pelo/pela + cartão/banco



nunca pode cair em despesas fixas.



Deve ir para lote de gastos no cartão, pedir confirmação, e só salvar após resposta 1.



\## Próximo comando planejado para Codex



Corrigir prioridade do lote de gastos em cartão para impedir que seja capturado como despesa fixa.



Arquivos prováveis:



\- src/app/api/webhook/zapi/route.ts

\- src/lib/controle-financeiro-flow.ts

\- src/lib/ia/financeiro-intent-resolver.ts



Regras:



\- Lote de cartão antes de despesas fixas

\- Despesas fixas não podem capturar linhas com padrão claro de cartão

\- Cartão não configurado pode ser aceito como fatura aberta sem vencimento

\- Saldo disponível não reduz

\- Confirmar com 1 salva

\- Cancelar com 2 não salva



\## Próxima auditoria com Claude



Objetivo:



Auditar fluxos antigos e isolar o QuitaZAP Controle.



Verificar:



\- Fluxos antigos de cobrança

\- Fluxos antigos de servidor público

\- Fluxos antigos de dívida/parcela

\- Fallback antigo processarMensagemIA

\- Ordem do webhook

\- O que deve continuar

\- O que deve ser isolado

\- O que deve ser removido

\- O que deve entrar no Documento Oficial v8/v9



Decisão:



Não começar do zero.



Manter o projeto atual, mas isolar o QuitaZAP Controle como motor principal.

