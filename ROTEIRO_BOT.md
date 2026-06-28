# Roteiro Completo do Bot QuitaZAP
> Definido em sessão de trabalho — aprovado por Ibrahim

---

## ETAPA 1 — BOAS-VINDAS (mensagem única após compra ou cadastro gratuito)

> Olá, *[nome]*! 👋 Seja bem-vindo(a) ao *QuitaZAP!*
>
> Sou seu consultor financeiro pessoal. Vou te ajudar a sair das dívidas com um plano claro e direto. 💪
>
> *Antes de começar, me conta rapidinho:*
>
> 1️⃣ Como você trabalha? CLT, servidor público, autônomo, MEI ou empresário?
> 2️⃣ Tem dependentes? Filhos ou alguém que depende de você financeiramente?

**Regra:** UMA única mensagem. Não reapresentar o bot depois.

---

## ETAPA 2 — CONFIRMAÇÃO DO PERFIL + RENDA

**Bot confirma o perfil:**
> Certo, já anotei, *[nome]*! 👨‍👩‍👧‍👦 Família de 4 pessoas — vou considerar isso na hora de montar seu plano.
>
> *Agora me fala sobre sua renda:*
>
> • Qual o seu salário líquido mensal? *(o que cai na conta todo mês)*
> • Tem outra renda além do salário?

**Bot confirma a renda (2 mensagens separadas):**

Mensagem 1:
> 💰 *Renda mensal: R$ 3.200,00*

Mensagem 2:
> Anotado! ✅ Agora me fala suas despesas fixas — aquelas que chegam todo mês certinho...

---

## ETAPA 3 — DESPESAS FIXAS

> Agora me fala suas *despesas fixas* — e aqui é hora de ser honesto! 😄
>
> Pensa em tudo que sai todo mês da sua conta, até aquela assinatura de streaming que você nem lembra mais que tem... 😅
>
> • Aluguel ou financiamento
> • Escola ou creche dos filhos
> • Plano de saúde
> • Internet, energia, água, telefone
> • Netflix, Spotify, Amazon...
> • Academia que você paga mas não vai 😂
>
> Me manda tudo que lembrar, um por um ou de uma vez!

**Bot confirma em bloco monospace (2 mensagens separadas):**

Mensagem 1:
> 📋 *Despesas fixas anotadas:*
>
> ```
> Aluguel        R$  800,00
> Escola         R$  350,00
> Plano saúde    R$  280,00
> Internet       R$  100,00
> Energia        R$  150,00
> Netflix        R$   45,00
> Academia       R$   99,00
> ─────────────────────────
> Total fixo     R$ 1.824,00
> ```

Mensagem 2:
> Tem mais alguma conta fixa? Se não, vamos para as *despesas variáveis!* 👇

---

## ETAPA 4 — DESPESAS VARIÁVEIS (Cartões + Gastos à vista)

> *Agora me fala suas despesas variáveis:*
>
> 💳 *Cartões de crédito*
> _(eles variam todo mês e geralmente são onde o dinheiro some sem a gente perceber)_
>
> Me fala o primeiro cartão:
>
> • Banco:
> • Valor da fatura atual:
> • Vencimento:
>
> _Pode responder nesse formato ou do jeito que preferir, eu entendo! 😊_

**Bot confirma cartões (2 mensagens separadas):**

Mensagem 1:
> 💳 *Cartões anotados:*
>
> ```
> Nubank    R$ 1.200,00   vence dia 10
> Itaú      R$   800,00   vence dia 15
> C6        R$   450,00   vence dia 20
> ──────────────────────────────────────
> Total     R$ 2.450,00/mês
> ```

Mensagem 2:
> Tem mais algum cartão? 💳
>
> Se não, me fala se teve algum gasto à vista esse mês:
>
> • Mercado
> • Farmácia
> • Combustível
> • Qualquer coisa paga no dinheiro ou Pix 😊

**Bot confirma gastos à vista (2 mensagens separadas):**

Mensagem 1:
> 🛒 *Gastos à vista anotados:*
>
> ```
> Mercado    R$ 300,00
> Farmácia   R$  50,00
> ─────────────────────
> Total      R$ 350,00
> ```

Mensagem 2:
> Agora vamos para as *dívidas*! 💰
>
> Me fala a primeira — pode ser banco, loja, financeira, qualquer dívida que esteja pagando ou em atraso.
>
> • Nome do credor:
> • Valor total da dívida:
> • Valor da parcela:
> • Parcelas restantes:
>
> _Pode responder nesse formato ou do jeito que preferir! 😊_

---

## ETAPA 5 — DÍVIDAS

**Bot confirma cada dívida em bloco monospace.**

Após cada dívida, pergunta se tem mais:
> Tem mais alguma dívida? 💳
>
> Pode ser:
> • Outra financeira
> • Loja
> • Carnê
> • Cheque especial
> • Qualquer coisa que esteja pagando ou em atraso.

Quando cliente diz que acabou:
> Certo, *[nome]*! 👊 Já tenho tudo que preciso.
>
> Deixa eu montar seu diagnóstico financeiro completo... ⏳

---

## ETAPA 6 — DIAGNÓSTICO COMPLETO

Mensagem 1:
> 📊 *Diagnóstico Financeiro — [nome]*
>
> ```
> RENDA
> Salário líquido        R$  3.200,00
>
> DESPESAS FIXAS
> Aluguel                R$    800,00
> Escola                 R$    350,00
> Plano de saúde         R$    280,00
> Internet               R$    100,00
> Energia                R$    150,00
> Netflix                R$     45,00
> Academia               R$     99,00
> ─────────────────────────────────────
> Total fixo             R$  1.824,00
>
> DESPESAS VARIÁVEIS
> Cartões                R$  2.450,00
> Gastos à vista         R$    350,00
> ─────────────────────────────────────
> Total variável         R$  2.800,00
>
> DÍVIDAS
> Banco do Brasil        R$  8.000,00
> Financ. Carro          R$ 22.000,00
> Casas Bahia            R$  1.200,00
> ─────────────────────────────────────
> Total dívidas          R$ 31.200,00
>
> SOBRA MENSAL           R$ -1.424,00
> ```

---

## ETAPA 7 — QUITASCORE

Imagem do velocímetro enviada (PNG gerado dinamicamente).

Seguida de mensagem:
> 💳 *Sua Saúde Financeira — QuitaScore*
>
> ```
> Score atual       235/1000  🔴 Crítico
> ─────────────────────────────────────
> Comprometimento renda    60/300
> Equilíbrio orçamento      0/250
> Nível endividamento     100/200
> Adimplência              75/150
> Reserva emergência        0/100
> ```

### Critérios do QuitaScore (0 a 1000):

**1. Comprometimento de renda (300 pts)**
- < 15%: 300 pts
- 15–30%: 240 pts
- 30–40%: 150 pts
- 40–50%: 60 pts
- > 50%: 0 pts

**2. Equilíbrio do orçamento (250 pts)**
- Sobra > 20%: 250 pts
- Sobra 10–20%: 200 pts
- Sobra 1–10%: 120 pts
- Zerado: 60 pts
- Déficit até 10%: 20 pts
- Déficit > 10%: 0 pts

**3. Nível de endividamento (200 pts)**
- Dívidas < 3x renda mensal: 200 pts
- 3x a 6x: 160 pts
- 6x a 12x: 100 pts
- 12x a 24x: 40 pts
- > 24x: 0 pts

**4. Adimplência (150 pts)**
- 100% em dia: 150 pts
- 1 dívida < 30 dias atraso: 90 pts
- 1 dívida > 30 dias atraso: 50 pts
- 2+ em atraso: 0 pts
- ⚠️ Se orçamento negativo: adimplência vale 50% dos pontos (pagando em dia com déficit não é saúde)

**5. Reserva de emergência (100 pts)**
- > 6 meses: 100 pts
- 3–6 meses: 75 pts
- 1–3 meses: 50 pts
- < 1 mês: 20 pts
- Sem reserva: 0 pts

### Faixas:
- 0–300: 🔴 Crítico
- 301–500: ⚠️ Atenção
- 501–700: 🟡 Regular
- 701–900: 🟢 Bom
- 901–1000: ⭐ Excelente

---

## ETAPA 8 — SUGESTÕES DE CORTE

> 🎯 *Vamos estancar a sangria, [nome]!*
>
> Para respirar financeiramente, o primeiro passo é ajustar o orçamento. Analisei seus gastos e encontrei alguns pontos onde você pode recuperar fôlego.
>
> ──────────────────────
> 💡 *Sugestões de corte ou redução:*
>
> ```
> Academia   R$ 99,00/mês  (está usando?)
> Netflix    R$ 45,00/mês  (plano familiar?)
> Internet   R$ 100,00/mês (pesquise mais barato)
> ──────────────────────────────────────────
> Potencial  R$ 244,00/mês
> ```
> ──────────────────────
>
> Você decide o que faz sentido pra sua realidade. Cada real cortado aqui vai direto pro pagamento das dívidas. 💪
>
> *O que você toparia reduzir ou cancelar?*

**Regra:** NUNCA mandar cancelar. Sempre sugerir. O cliente decide.

---

## ETAPA 9 — PLANO DE QUITAÇÃO

Mensagem 1 (após cliente decidir cortes):
> 💪 *Ótimo, [nome]!*
>
> Quitando a Casas Bahia de uma vez você para de pagar juros e libera *R$ 200,00/mês* para atacar a próxima dívida.

Mensagem 2:
> *Agora vamos atacar as dívidas.* 🎯
>
> Você tem *R$ 31.200,00* em dívidas no total.
>
> A estratégia mais eficiente é começar pela menor.
> Você elimina logo e libera a parcela para atacar a próxima.
>
> ──────────────────────
> 📋 *Ordem sugerida de quitação:*
>
> 1️⃣ *Casas Bahia*
> ```
> Saldo    R$  1.200,00
> Parcela  R$    200,00  (6x)
> ```
>
> 2️⃣ *Banco do Brasil*
> ```
> Saldo    R$  8.000,00
> Parcela  R$    350,00  (28x)
> ```
>
> 3️⃣ *Financiamento do Carro*
> ```
> Saldo    R$ 22.000,00
> Parcela  R$    680,00  (48x)
> ```
> ──────────────────────
>
> *Consegue apertar o orçamento esse mês para quitar a Casas Bahia de uma vez?*

---

## ETAPA 10 — META DO MÊS

> 🎯 *Sua meta do mês:*
>
> ```
> Juntar até o vencimento   R$ 1.200,00
> Dívida eliminada          Casas Bahia
> Parcela liberada          R$  200,00/mês
> ```
>
> Me avisa quando quitar! 🙌

---

## ETAPA 11 — VENCIMENTOS DO MÊS

> *Perfeito, [nome]!* 🙌
>
> Enquanto isso, vamos garantir que as outras parcelas não atrasem.
>
> ──────────────────────
> 📅 *Seus vencimentos do mês:*
>
> ```
> Banco do Brasil   dia 10   R$ 350,00
> Financ. Carro     dia 15   R$ 680,00
> Nubank            dia 10   R$ 1.200,00
> Itaú              dia 15   R$   800,00
> C6                dia 20   R$   450,00
> ```
> ──────────────────────
>
> Pagar em dia evita juros e multa — cada centavo extra conta agora. 💪
>
> Me avisa quando quitar a Casas Bahia que a gente atualiza seu plano! 😊

**Lembretes automáticos:** 3 dias, 2 dias, 1 dia e no dia do vencimento (tarefa #16).

---

## ETAPA 12 — DÍVIDA QUITADA (Celebração)

GIF animada enviada (gerada com nome do cliente).
Seguida de mensagem de texto com próxima meta.

---

## ETAPA 13 — SCORE MENSAL (Todo dia 1º)

Nova imagem do velocímetro + mensagem:
> 🎉 *Seu QuitaScore de [mês]:*
> [imagem do velocímetro]
>
> *+45 pontos em relação ao mês passado!*
> Você está evoluindo, [nome]! 💪

---

## ETAPA 14 — REENGAJAMENTO (Cliente some)

**3 dias sem resposta:**
> Oi sumido(a) 😅 ficou rico(a) e esqueceu de mim?
> *X dias* sem me mandar um boleto... não me abandona não! 😢
>
> Quando quiser retomar é só falar, tô aqui! 💪

**7 dias:**
> Tô aqui, viu? 👀
> Já faz *X dias* que a gente não conversa...
> Enquanto isso suas dívidas não tiraram férias não 😬
>
> Bora retomar? Uma mensagem já basta! 😊

**15 dias:**
> *X dias* sem notícias suas, [nome]! 😱
> Espero que esteja tudo bem por aí...
>
> Quando voltar, seu plano financeiro continua aqui te esperando. É só falar! 🤝

**Após 15 dias:** bot para de enviar mensagens.

GIF animada de reengajamento enviada junto com a mensagem dos 3 dias.

---

## ETAPA 15 — CANCELAMENTO

> Que pena, [nome]! 😢 Antes de qualquer coisa, me conta o que aconteceu?
>
> • Não estou conseguindo usar direito
> • Não vejo resultado ainda
> • Tô sem dinheiro no momento
> • Outro motivo

**Respostas:**
- "Não consigo usar" → bot oferece ajuda, reinicia o fluxo
- "Sem resultado ainda" → bot mostra progresso real desde o início
- "Sem dinheiro" → bot oferece pausa de 30 dias
- "Outro motivo" → escala para atendimento manual

---

## ETAPA 16 — DÚVIDAS SOBRE PREÇO/ASSINATURA

> O *QuitaZAP* custa *R$ 29,90/mês* e você pode cancelar quando quiser, sem multa e sem burocracia. 😊
>
> Por esse valor você tem:
>
> • Consultor financeiro pessoal 24h pelo WhatsApp
> • Plano de quitação personalizado
> • Lembretes automáticos de vencimento
> • Acompanhamento mensal do seu progresso
> • QuitaScore — seu score de saúde financeira
>
> Para assinar é só acessar:
> 👉 *www.quitazap.com.br*

---

## REGRAS GERAIS DE FORMATAÇÃO

- Usar *negrito* para valores monetários, nomes e destaques
- Usar blocos monospace (```) para listas de valores — garante alinhamento no mobile
- Separar confirmações do próximo passo em mensagens diferentes
- Máximo 2 perguntas por mensagem
- Nunca reinventar dados não informados pelo cliente
- Nunca mandar cancelar gastos — sempre sugerir
- Respostas curtas, linguagem simples, tom acolhedor

---

## TAREFAS PENDENTES DE IMPLEMENTAÇÃO

| # | Tarefa |
|---|--------|
| 16 | Lembretes automáticos de vencimento (3, 2, 1 dia e no dia) |
| 17 | QuitaScore com velocímetro PNG dinâmico |
| 18 | GIF animada de celebração (nome dinâmico) |
| 19 | Job mensal de atualização do QuitaScore |
| 20 | Fluxo de reengajamento automático |
| 21 | Indique e Ganhe |
| 22 | Diário Financeiro por Voz |
| 23 | Relatório mensal de categorização de gastos |
| 24 | Modo META |
| 25 | Relatório mensal em PDF |
| 26 | Corrigir leitura de boleto/extrato PDF Nubank |
| 27 | Avaliar Open Finance |
| 28 | 🔥 Cobrador Automático Pessoal Inteligente |
