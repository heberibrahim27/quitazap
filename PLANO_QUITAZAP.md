# 📋 PLANO COMPLETO — QuitaZAP
> Documento gerado em 28/06/2026 — estado atual do produto, arquitetura, funcionalidades implementadas e roadmap.

---

## 1. O QUE É O QUITAZAP

**QuitaZAP** é um SaaS de consultoria financeira pessoal 100% via WhatsApp. O cliente assina, conecta com o bot pelo WhatsApp, e recebe:

- Diagnóstico financeiro completo (renda, despesas, dívidas)
- Plano de quitação personalizado (estratégia bola de neve)
- QuitaScore — pontuação de saúde financeira com velocímetro visual
- Lembretes automáticos de vencimento
- Cobrador automático para cobrar devedores
- Acompanhamento mensal do progresso

**Proposta de valor:** Ter um consultor financeiro pessoal disponível 24h no WhatsApp por R$ 29,90/mês — sem aplicativos, sem login, sem burocracia.

**Público-alvo:** Trabalhadores endividados (CLT, servidores públicos, autônomos) que precisam de um plano concreto para sair das dívidas.

---

## 2. MODELO DE NEGÓCIO

| Item | Detalhe |
|------|---------|
| Preço | R$ 29,90/mês |
| Cobrança | Recorrência via CAKTO |
| Trial/Gratuito | Conta gratuita para teste (campo `gratuito` no banco) |
| Restrição | Funcionalidades premium só para assinantes ativos |
| Cancelamento | Sem multa, sem burocracia |

**Funil de vendas:**
1. Pessoa desconhecida manda mensagem no WhatsApp do bot
2. Bot identifica que não é cliente → inicia funil de vendas (`processarLeadVendas`)
3. Coleta nome, problema, interesse
4. Envia link de checkout CAKTO
5. Após compra: webhook CAKTO cria `Cliente` + `BotSessao` no banco → bot inicia onboarding

---

## 3. ARQUITETURA TÉCNICA

### Stack
- **Frontend/Backend:** Next.js 14 (App Router, TypeScript)
- **Banco de dados:** PostgreSQL via Supabase (Prisma ORM)
- **WhatsApp:** Z-API (ou Evolution API como fallback)
- **IA:** OpenAI GPT-4o-mini (conversas) + GPT-4o (análise de PDF/imagem) + Whisper (áudio)
- **Deploy:** Vercel (com Cron Jobs nativos)
- **Pagamento:** CAKTO (checkout + webhooks)
- **Domínio:** www.quitazap.com.br

### Modelos do Banco (Prisma)

```
Cliente          → assinante do QuitaZAP
BotSessao        → sessão do bot por número de WhatsApp
Divida           → dívidas cadastradas do cliente
PlanoEnviado     → histórico de planos gerados
LeadVendas       → funil de vendas (não-clientes)
Cobranca         → cobranças do Cobrador Automático
```

### Variáveis de Ambiente

```env
DATABASE_URL          # Supabase PostgreSQL (pgBouncer)
DIRECT_URL            # Supabase PostgreSQL direto (Prisma migrate)
OPENAI_API_KEY        # GPT-4o-mini / GPT-4o / Whisper
ZAPI_INSTANCE         # Instância Z-API
ZAPI_TOKEN            # Token Z-API
ZAPI_CLIENT_TOKEN     # Client Token Z-API
CAKTO_SECRET          # Webhook secret CAKTO
NEXT_PUBLIC_CAKTO_URL # Link de checkout CAKTO
CRON_SECRET           # Autenticação dos crons Vercel
NEXT_PUBLIC_SITE_URL  # https://www.quitazap.com.br
APP_SENHA             # Senha do painel admin
```

---

## 4. FLUXO DO BOT (Roteiro completo)

### Etapa 1 — Boas-vindas
- Disparo único após compra/cadastro
- Apresenta o bot e faz 2 perguntas: vínculo de trabalho + dependentes
- Regra: **nunca** reapresentar o bot depois

### Etapa 2 — Perfil + Renda
- Confirma perfil do cliente
- Coleta salário líquido e renda extra
- Confirma em mensagem monospace

### Etapa 3 — Despesas Fixas
- Coleta aluguel, escola, plano de saúde, internet, streaming, academia etc.
- Confirma em bloco monospace com total
- Pergunta se tem mais antes de avançar

### Etapa 4 — Despesas Variáveis
- Coleta cartões de crédito (banco, fatura, vencimento)
- Coleta gastos à vista (mercado, farmácia, combustível)
- Confirma em bloco monospace com totais

### Etapa 5 — Dívidas
- Coleta credor, valor total, parcela, parcelas restantes
- Repete até cliente dizer que acabou
- Cada dívida confirmada em bloco monospace

### Etapa 6 — Diagnóstico Financeiro
- Gera relatório completo: renda, despesas fixas, variáveis, dívidas, sobra mensal
- Usa bloco monospace alinhado

### Etapa 7 — QuitaScore
- Pontuação 0–1000 baseada em 5 critérios:
  - Comprometimento de renda (300 pts)
  - Equilíbrio do orçamento (250 pts)
  - Nível de endividamento (200 pts)
  - Adimplência (150 pts)
  - Reserva de emergência (100 pts)
- Faixas: Crítico → Atenção → Regular → Bom → Excelente
- **[PENDENTE]** Velocímetro PNG dinâmico

### Etapa 8 — Sugestões de Corte
- IA identifica despesas cortáveis/reduzíveis
- **Nunca manda cancelar** — sempre sugere, cliente decide
- Mostra potencial de economia por item

### Etapa 9 — Plano de Quitação
- Estratégia bola de neve: menor dívida primeiro
- Mostra ordem de quitação numerada com saldo e parcelas
- Calcula quando cada dívida será quitada

### Etapa 10 — Meta do Mês
- Define meta financeira do mês corrente
- Cliente confirma quando bater a meta

### Etapa 11 — Vencimentos do Mês
- Lista todos os vencimentos do mês com valores
- **[PENDENTE]** Lembretes automáticos 3 dias antes, 2 dias, 1 dia, no dia

### Etapa 12 — Celebração de Quitação
- **[PENDENTE]** GIF animada com nome do cliente quando quita uma dívida

### Etapa 13 — Score Mensal (dia 1º)
- **[PENDENTE]** Atualização automática mensal do QuitaScore com evolução

### Etapa 14 — Reengajamento
- **[PENDENTE]** 3 dias sem resposta → mensagem leve
- **[PENDENTE]** 7 dias → mensagem de urgência
- **[PENDENTE]** 15 dias → mensagem final, para de enviar

### Etapa 15 — Cancelamento
- Bot pergunta o motivo antes de cancelar
- Oferece alternativas (pausa 30 dias, reiniciar fluxo, suporte manual)

---

## 5. FUNCIONALIDADES IMPLEMENTADAS ✅

### Bot de IA
- [x] Processamento de mensagens de texto, áudio (Whisper), imagem (GPT-4o Vision), PDF
- [x] Histórico de conversa por sessão (contexto persistido)
- [x] Geração de diagnóstico financeiro completo
- [x] Geração de plano de quitação (bola de neve)
- [x] Sugestões de corte de gastos
- [x] Confirmações em monospace

### Comandos Rápidos do Bot
- [x] `resumo` / `saldo do mês` → resumo mensal
- [x] `despesas do mês` → lista de despesas
- [x] `quanto preciso ganhar` → meta de receita semanal
- [x] `quanto posso gastar` → margem semanal
- [x] `ajuda` / `comandos` → menu completo
- [x] `resete` / `reiniciar` → zera tudo e recomeça
- [x] `cobrar [nome, fone, valor, dia]` → cria cobrança automática
- [x] `minhas cobranças` → lista cobranças + link do painel
- [x] `meu painel` → link mágico do painel /cobrador
- [x] Suporte a áudio em todos os comandos (Whisper)

### Análise de Documentos
- [x] Imagem: extração de dados financeiros (boleto, fatura, contracheque)
- [x] PDF: leitura de contracheque com extração estruturada (JSON)
  - Salário bruto, líquido, extras (13º/férias)
  - Empréstimos consignados com parcelas
  - Associações (ASTEBA, ASSEBA etc.)
- [x] PDF de outros tipos: processado como texto pelo bot
- [x] Contracheque bypassa GPT-4o-mini → gera diagnóstico direto

### Cobrador Automático ✅
- [x] Criação de cobranças via WhatsApp (`cobrar João, 71999..., R$500, dia 20`)
- [x] Suporte a áudio para criar cobranças
- [x] Parsing inteligente com GPT-4o-mini (extrai nome, fone, valor, dia, pix, mensagem)
- [x] Envio imediato ou agendado
- [x] Régua de cobrança automática:
  - Dia do vencimento → mensagem amigável (Etapa 1)
  - Vencimento +3 dias → mensagem mais firme (Etapa 2)
  - Vencimento +7 dias → última chance (Etapa 3)
- [x] Suporte a chave PIX do credor na mensagem
- [x] Painel web `/cobrador` com dashboard completo
- [x] Link mágico por cliente (HMAC-SHA256, sem login, não expira)
  - Cliente digita "meu painel" → recebe URL exclusiva autenticada
  - `quitazap.com.br/cobrador?id=<clienteId>&token=<hmac>`
- [x] Cron Vercel diário para disparos automáticos
- [x] Broadcast para notificar clientes sobre a funcionalidade
- [x] API completa: GET (lista), POST (criar), PATCH (atualizar status)
- [x] Filtro por status: PENDENTE / ENVIADA / PAGA / CANCELADA

### Painel Admin
- [x] `/cobrador` — dashboard com hero, KPI cards, lista de cobranças
  - Botão "Nova cobrança" com formulário inline
  - Filtros por status
  - Ações por cobrança: marcar paga, enviar agora, cancelar
  - Botão "Avisar clientes" com modal de confirmação e preview
- [x] `/financeiro` — painel de clientes, receita, dívidas
- [x] Autenticação básica por senha (`APP_SENHA`)

### Integrações
- [x] Z-API (WhatsApp) — envio e recebimento de mensagens
- [x] Evolution API (fallback configurável via `WHATSAPP_PROVIDER`)
- [x] CAKTO — checkout e webhook de compra
  - Webhook cria `Cliente` + `BotSessao` automaticamente
  - Verifica assinatura via header `x-cakto-signature`
- [x] OpenAI: GPT-4o-mini (bot), GPT-4o (PDF/imagem), Whisper (áudio)
- [x] Supabase PostgreSQL via Prisma

### DevOps
- [x] Deploy via Vercel (git push → build automático)
- [x] `deploy.bat` para push com um duplo-clique
- [x] Cron Jobs Vercel: `/api/cron/cobrador` (diário 08:00 BRT)
- [x] Deduplicação de webhooks (Set em memória, 500 mensagens)

---

## 6. FUNCIONALIDADES PENDENTES 🔴

### Alta Prioridade

| # | Funcionalidade | Descrição |
|---|---------------|-----------|
| P1 | Lembretes de vencimento | Cron que envia aviso 3, 2, 1 dia antes e no dia de cada parcela |
| P2 | QuitaScore visual | Velocímetro PNG dinâmico gerado e enviado no WhatsApp |
| P3 | Score mensal automático | Job dia 1º que atualiza score e mostra evolução |
| P4 | Reengajamento automático | Mensagens a clientes que somem em 3, 7, 15 dias |

### Média Prioridade

| # | Funcionalidade | Descrição |
|---|---------------|-----------|
| M1 | GIF de celebração | GIF animada com nome do cliente quando quita uma dívida |
| M2 | Relatório PDF mensal | Extrato mensal das finanças em PDF enviado por WhatsApp |
| M3 | Categorização de gastos | Relatório mensal com categorias (alimentação, lazer, transporte etc.) |
| M4 | Modo META | Cliente define uma meta (reserva, viagem) e bot acompanha |
| M5 | Diário Financeiro por Voz | Cliente manda áudio diário dos gastos, bot categoriza e acumula |

### Baixa Prioridade / Futuro

| # | Funcionalidade | Descrição |
|---|---------------|-----------|
| F1 | Indique e Ganhe | Sistema de referral com desconto ou mês grátis |
| F2 | Open Finance | Leitura automática do extrato bancário via Open Finance |
| F3 | Login por WhatsApp (OTP) | Alternativa ao link mágico para acesso ao painel |
| F4 | Multi-instância Z-API | Suporte a vários números WhatsApp por conta |
| F5 | Leitura de boleto PDF Nubank | Correção da extração de PDF de faturas Nubank |

---

## 7. DETALHES TÉCNICOS — COBRADOR AUTOMÁTICO

### Modelos envolvidos

```prisma
model Cobranca {
  id          String   @id @default(cuid())
  clienteId   String
  credorNome  String
  devedorNome String
  devedorFone String
  valor       Float
  vencimento  DateTime
  mensagem    String?
  pixChave    String?
  status      String   @default("PENDENTE") // PENDENTE|ENVIADA|PAGA|CANCELADA
  etapa       Int      @default(1)
  tentativas  Int      @default(0)
  ultimoEnvio DateTime?
  criadoEm   DateTime @default(now())
  atualizadoEm DateTime @updatedAt
  cliente     Cliente  @relation(fields: [clienteId], references: [id])
}
```

### APIs

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/cobrador` | GET | Lista cobranças (filtros: status, clienteId+token, page, limit) |
| `/api/cobrador` | POST | Cria cobrança |
| `/api/cobrador` | PATCH | Atualiza status (PAGA, CANCELADA) |
| `/api/cobrador/disparar` | POST | Disparo manual / cron trigger |
| `/api/broadcast/cobrador` | GET | Preview: quantos clientes seriam notificados |
| `/api/broadcast/cobrador` | POST | Broadcast para todos os clientes (ou telefone único via `body.telefone`) |
| `/api/cron/cobrador` | POST | Cron diário 08:00 BRT — dispara cobranças pendentes |

### Link Mágico (autenticação sem login)

```
Token = HMAC-SHA256(clienteId, COBRADOR_TOKEN_SECRET)[0..31]
URL   = quitazap.com.br/cobrador?id=<clienteId>&token=<token>
```

- Verificado na API (`verificarTokenCobrador`)
- Sem expiração, sem banco de dados
- Gerado pelo bot quando cliente diz "meu painel"
- Painel detecta params na URL e filtra cobranças do cliente

---

## 8. DETALHES TÉCNICOS — PROCESSAMENTO DE DOCUMENTOS

### Fluxo de Contracheque (PDF)

1. Cliente envia PDF
2. Upload para OpenAI Files API (purpose: user_data)
3. GPT-4o extrai JSON estruturado:
   - `salarioLiquidoTotal`, `extraOrdinario`, `salarioLiquidoNormal`
   - `emprestimos[]` (banco, valorParcela, parcelaAtual, totalParcelas)
   - `associacoes[]` (nome, valorMensal)
4. `buildDiagContracheque()` monta `DiagnosticoIA` diretamente
5. `gerarRelatorio()` gera o diagnóstico
6. Bot envia o plano completo **sem passar pelo GPT-4o-mini** (mais rápido e preciso)
7. Arquivo deletado da OpenAI após uso

### Fluxo de Áudio

1. Cliente envia áudio (ogg/mp4/mp3)
2. Download do arquivo da URL Z-API
3. Upload para Whisper (OpenAI) com `language: "pt"`
4. Texto transcrito tratado como mensagem normal
5. Funciona para todos os comandos incluindo "cobrar" e cobrança

---

## 9. ESTRUTURA DE ARQUIVOS PRINCIPAIS

```
quitaZAP/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── webhook/
│   │   │   │   ├── zapi/route.ts      ← Bot principal (webhook WhatsApp)
│   │   │   │   └── cakto/route.ts     ← Webhook de compra CAKTO
│   │   │   ├── cobrador/
│   │   │   │   ├── route.ts           ← CRUD cobranças
│   │   │   │   └── disparar/route.ts  ← Disparo manual/cron
│   │   │   ├── broadcast/
│   │   │   │   └── cobrador/route.ts  ← Broadcast para clientes
│   │   │   └── cron/
│   │   │       └── cobrador/route.ts  ← Cron diário
│   │   ├── cobrador/
│   │   │   └── page.tsx               ← Painel admin cobranças
│   │   └── financeiro/
│   │       └── page.tsx               ← Painel admin financeiro
│   └── lib/
│       ├── ai-bot.ts                  ← IA consultora (GPT-4o-mini)
│       ├── sales-bot.ts               ← Bot de vendas (funil)
│       ├── plano.ts                   ← Geração de relatórios e comandos
│       ├── cobrador-token.ts          ← HMAC token para link mágico
│       ├── zapi.ts                    ← Envio WhatsApp (Z-API / Evolution)
│       └── prisma.ts                  ← Client Prisma singleton
├── prisma/
│   └── schema.prisma                  ← Modelos do banco
├── vercel.json                        ← Cron Jobs configurados
├── deploy.bat                         ← Script de deploy (git push)
└── ROTEIRO_BOT.md                     ← Roteiro completo do bot
```

---

## 10. CONFIGURAÇÃO DO VERCEL (Cron Jobs)

```json
{
  "crons": [
    {
      "path": "/api/cron/cobrador",
      "schedule": "0 11 * * *"
    }
  ]
}
```

> `0 11 * * *` = 08:00 BRT (Vercel usa UTC, BRT = UTC-3)

### Autenticação dos Crons
- Header `Authorization: Bearer <CRON_SECRET>` nos crons Vercel
- Header `x-internal-call: 1` para chamadas internas (ignora CRON_SECRET)

---

## 11. REGRAS GERAIS DO BOT

- **Nunca inventar dados** — só usa o que o cliente informou
- **Nunca mandar cancelar** — sempre sugerir, cliente decide
- **Máximo 2 perguntas por mensagem**
- **Tom acolhedor** — empático, não julgador
- **Linguagem simples** — sem jargão financeiro desnecessário
- **Monospace para números** — alinhamento garantido no mobile
- **2 mensagens separadas** — confirmação + próximo passo
- **Deduplicação de webhooks** — evita processar a mesma mensagem 2x

---

## 12. PRÓXIMOS PASSOS SUGERIDOS (Por Prioridade)

### Sprint 1 — Retenção e Engajamento
1. **Lembretes de vencimento** (P1) — maior impacto na retenção
2. **Reengajamento automático** (P4) — recupera clientes inativos
3. **Score mensal automático** (P3) — sensação de progresso

### Sprint 2 — Experiência Premium
4. **QuitaScore visual** (P2) — velocímetro PNG dinâmico
5. **GIF de celebração** (M1) — gamificação
6. **Modo META** (M4) — diferencial de produto

### Sprint 3 — Receita e Crescimento
7. **Relatório PDF mensal** (M2) — percepção de valor
8. **Indique e Ganhe** (F1) — crescimento orgânico
9. **Diário financeiro por voz** (M5) — hábito diário

---

## 13. MÉTRICAS A ACOMPANHAR

| Métrica | Onde medir |
|---------|-----------|
| MRR (Receita mensal recorrente) | Painel CAKTO |
| Churn mensal | CAKTO + banco (assinaturaVenceEm) |
| Clientes ativos | Tabela `Cliente` (gratuito=false, assinatura vigente) |
| Cobranças criadas por cliente | Tabela `Cobranca` |
| Taxa de pagamento (cobradas → pagas) | `Cobranca.status = PAGA / total` |
| Mensagens processadas por dia | Logs Vercel |
| Taxa de conversão do funil | Tabela `LeadVendas` |

---

*Documento gerado automaticamente pelo Claude — QuitaZAP development session*
*Última atualização: 28/06/2026*
