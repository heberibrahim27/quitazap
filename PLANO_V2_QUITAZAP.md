# 📋 PLANO V2 — QuitaZAP (Visão Completa)
> Documento estratégico e técnico — gerado em 28/06/2026
> Substitui o PLANO_QUITAZAP.md como referência principal do projeto.

---

## 1. VISÃO GERAL DO PRODUTO

O QuitaZAP será uma plataforma SaaS com **dois módulos principais** e uma infraestrutura compartilhada:

| Módulo | Para quem | Preço | Prioridade |
|--------|-----------|-------|-----------|
| **QuitaZAP Receber** | MEIs, autônomos, pequenos negócios | R$29,90–R$99,90/mês | 🔴 PRIMEIRO |
| **QuitaZAP Controle** | Pessoas com dívidas e contas | R$19,90/mês | 🟡 DEPOIS |

**Frase que define o produto:**
> "O QuitaZAP ajuda você a organizar pendências, enviar lembretes automáticos pelo WhatsApp e acompanhar quem recebeu, leu, respondeu ou pagou."

**Principal métrica de valor:**
> R$ recuperados com QuitaZAP + tempo economizado

---

## 2. O QUE TEMOS HOJE (Aproveitar)

### Infraestrutura pronta ✅
- Next.js 14 App Router + TypeScript
- Prisma ORM + PostgreSQL (Supabase)
- Z-API / Evolution API para WhatsApp
- GPT-4o-mini (bot), GPT-4o (PDF/imagem), Whisper (áudio)
- Deploy Vercel + Cron Jobs
- Webhook CAKTO para pagamentos/assinatura
- Bot conversacional funcional

### Funcionalidades aproveitáveis ✅
- Cobrador Automático → **vira base do QuitaZAP Receber**
- Modelo `Cobranca` no Prisma → **expandir para `Pendencia`**
- Bot de comandos (cobrar, ver cobranças, meu painel) → **migrar para Receber**
- Link mágico HMAC → **substituir por login real**
- Parsing GPT de comandos → **manter e expandir**
- Painel /cobrador → **ponto de partida para o Dashboard**

### O que MUDA na arquitetura
| Antes | Depois |
|-------|--------|
| Senha única (APP_SENHA) para o painel | Login individual por cliente (email+senha) |
| Um WhatsApp para tudo (Z-API do sistema) | WhatsApp Business de cada cliente conectado |
| Cobranças simples (3 etapas fixas) | Pendências com régua configurável e status rico |
| Painel admin genérico | Dashboard por cliente com dados isolados |
| Link mágico HMAC | Sessão autenticada (NextAuth ou JWT) |

---

## 3. ARQUITETURA TÉCNICA V2

### Stack (sem mudanças estruturais)
- **Framework:** Next.js 14 App Router (TypeScript)
- **Banco:** PostgreSQL via Supabase + Prisma ORM
- **WhatsApp:** Evolution API (multi-instância — cada cliente conecta o próprio número)
- **IA:** OpenAI GPT-4o-mini / GPT-4o / Whisper
- **Auth:** NextAuth.js (email+senha, sessão JWT)
- **Deploy:** Vercel
- **Pagamento/Assinatura:** CAKTO
- **Pix (futuro):** Integração com gateway (Asaas, Pix EFI, Woovi)

### Por que Evolution API e não Z-API para multi-instância
A Z-API cobra por instância. A Evolution API é open source e permite N instâncias no mesmo servidor — cada cliente conecta seu WhatsApp Business sem custo adicional por número. O código atual já tem suporte a Evolution API via `WHATSAPP_PROVIDER=evolution`.

---

## 4. BANCO DE DADOS V2 (Prisma Schema)

### Modelos novos / modificados

```prisma
// ── USUÁRIO (dono da conta QuitaZAP) ─────────────────────────────────────
model Usuario {
  id            String    @id @default(cuid())
  nome          String
  email         String    @unique
  senhaHash     String
  telefone      String?
  plano         String    @default("GRATUITO") // GRATUITO | RECEBER_BASICO | RECEBER_PRO | RECEBER_PREMIUM | CONTROLE
  planoPago     Boolean   @default(false)
  assinaturaId  String?   // ID no CAKTO
  assinaturaVenceEm DateTime?
  gratuito      Boolean   @default(false)
  // WhatsApp Business conectado
  wpInstancia   String?   // nome da instância no Evolution API
  wpConectado   Boolean   @default(false)
  wpTelefone    String?   // número do WA Business conectado
  // Relações
  contatos      Contato[]
  pendencias    Pendencia[]
  configuracoes ConfigUsuario?
  criadoEm      DateTime  @default(now())
  atualizadoEm  DateTime  @updatedAt
}

// ── CONTATO (pagador/devedor do cliente) ─────────────────────────────────
model Contato {
  id         String     @id @default(cuid())
  usuarioId  String
  nome       String
  telefone   String
  email      String?
  documento  String?    // CPF/CNPJ
  obs        String?
  usuario    Usuario    @relation(fields: [usuarioId], references: [id])
  pendencias Pendencia[]
  criadoEm  DateTime   @default(now())

  @@unique([usuarioId, telefone])
}

// ── PENDÊNCIA (cobrança/lembrete de pagamento) ───────────────────────────
model Pendencia {
  id           String    @id @default(cuid())
  usuarioId    String
  contatoId    String?
  // Dados da cobrança
  descricao    String
  tipo         String    @default("OUTRO") // VENDA_FIADA | SERVICO | PARCELA | MENSALIDADE | ALUGUEL | OUTRO
  valor        Float
  vencimento   DateTime
  // Pagamento
  formaPagto   String?   // PIX_CHAVE | PIX_QR | PIX_LINK | MANUAL | SEM_PAGAMENTO_ONLINE
  pixChave     String?
  linkPagamento String?  // slug único: /pagar/ABC123
  linkAberto   Boolean   @default(false)
  // Status e envio
  status       String    @default("RASCUNHO")
  // RASCUNHO | AGENDADA | ENVIADA | ENTREGUE | LIDA | LINK_ABERTO | RESPONDIDA
  // AGUARDANDO_PAGAMENTO | PAGAMENTO_INICIADO | PAGA | PARCIALMENTE_PAGA
  // VENCIDA | PAUSADA | CANCELADA | FALHOU
  etapa        Int       @default(1)
  tentativas   Int       @default(0)
  enviarEm     DateTime? // data/hora agendada para envio
  ultimoEnvio  DateTime?
  // Régua personalizada
  reguaId      String?
  reguaPausada Boolean   @default(false)
  // Pagamento
  valorPago    Float?
  pagoEm       DateTime?
  comprovante  String?
  confirmacaoManual Boolean @default(false)
  // Mensagem
  mensagemCustom String?
  // Relações
  usuario      Usuario   @relation(fields: [usuarioId], references: [id])
  contato      Contato?  @relation(fields: [contatoId], references: [id])
  envios       Envio[]
  criadoEm    DateTime  @default(now())
  atualizadoEm DateTime @updatedAt
}

// ── ENVIO (cada mensagem de lembrete enviada) ────────────────────────────
model Envio {
  id          String    @id @default(cuid())
  pendenciaId String
  etapa       Int
  mensagem    String
  enviadoEm   DateTime  @default(now())
  status      String    @default("ENVIADO") // ENVIADO | ENTREGUE | LIDO | RESPONDIDO | FALHOU
  resposta    String?
  pendencia   Pendencia @relation(fields: [pendenciaId], references: [id])
}

// ── RÉGUA (configuração de lembretes) ───────────────────────────────────
model Regua {
  id        String   @id @default(cuid())
  usuarioId String?  // null = régua padrão do sistema
  nome      String
  etapas    String   // JSON: [{dias: 0, hora: "08:00", mensagem: "..."}, ...]
  padrao    Boolean  @default(false)
  criadoEm DateTime @default(now())
}

// ── CONFIGURAÇÕES DO USUÁRIO ─────────────────────────────────────────────
model ConfigUsuario {
  id              String   @id @default(cuid())
  usuarioId       String   @unique
  assinaturaName  String?  // nome do negócio para aparecer nas mensagens
  horarioEnvio    String   @default("08:00") // horário padrão de envio
  fusoHorario     String   @default("America/Bahia")
  resumoDiario    Boolean  @default(true)
  resumoSemanal   Boolean  @default(true)
  usuario         Usuario  @relation(fields: [usuarioId], references: [id])
}

// ── MODELOS LEGADOS (manter para QuitaZAP Controle) ─────────────────────
// Cliente, BotSessao, Divida, PlanoEnviado, LeadVendas — mantidos sem alteração
// Cobranca → deprecar gradualmente, migrar para Pendencia
```

---

## 5. MÓDULO PRIORITÁRIO — QuitaZAP Receber

### O que é
Plataforma para MEIs, autônomos e pequenos negócios enviarem lembretes automáticos de pagamento pelo próprio WhatsApp Business.

### Posicionamento correto
❌ "Robô de cobrança agressiva"
✅ "Lembretes automáticos de pagamento pelo seu WhatsApp Business"

### Fluxo principal
1. Cliente cria conta no QuitaZAP
2. Conecta seu WhatsApp Business (Evolution API — QR Code na tela)
3. Cria uma pendência (pagador + valor + vencimento)
4. Escolhe quando enviar e qual régua usar
5. QuitaZAP envia o lembrete pelo WhatsApp Business do cliente
6. Sistema rastreia: enviado → entregue → lido → respondido
7. Pagador paga via link → sistema confirma automaticamente

---

## 6. AUTENTICAÇÃO (Multi-tenant)

### Sistema de login
```
NextAuth.js com CredentialsProvider
- email + senha (hash bcrypt)
- Sessão JWT com usuarioId
- Middleware Next.js protege /dashboard/**
- Cada query Prisma filtra por usuarioId da sessão
```

### Rotas protegidas
```
/dashboard            → Dashboard inicial
/dashboard/receber    → Lista de pendências
/dashboard/contatos   → Contatos
/dashboard/mensagens  → Histórico de envios
/dashboard/pagamentos → Confirmações de pagamento
/dashboard/relatorios → Relatórios
/dashboard/whatsapp   → Conexão WhatsApp Business
/dashboard/configuracoes → Configurações
/dashboard/plano      → Plano e assinatura
```

### Rota pública
```
/pagar/[slug]   → Página de pagamento do devedor (sem login)
/receber        → Landing QuitaZAP Receber
/controle       → Landing QuitaZAP Controle
```

---

## 7. RÉGUA DE LEMBRETES PADRÃO

### Régua básica (configurável por cliente)
| Etapa | Quando | Tom |
|-------|--------|-----|
| 1 | 2 dias antes do vencimento | Lembrete amigável |
| 2 | No dia do vencimento | Lembrete gentil |
| 3 | 3 dias após vencimento | Tom mais firme |
| 4 | 7 dias após vencimento | Última tentativa |

### Modelos de mensagem (gerados automaticamente)
```
Etapa 1 (2 dias antes):
"Olá, [Nome]! 👋 [NegócioCliente] registrou um lembrete:
💰 Valor: R$500,00
📅 Vencimento: 30/06/2026
Para pagar com praticidade: quitazap.com.br/pagar/ABC123"

Etapa 2 (no dia):
"Bom dia, [Nome]! Hoje vence o pagamento de R$500,00 para [NegócioCliente].
🔗 quitazap.com.br/pagar/ABC123
Já pagou? Responda PAGO 😊"

Etapa 3 (+3 dias):
"[Nome], o pagamento de R$500,00 para [NegócioCliente] venceu há 3 dias.
Por favor, regularize assim que possível.
🔗 quitazap.com.br/pagar/ABC123"

Etapa 4 (+7 dias):
"[Nome], última tentativa de contato sobre o valor de R$500,00 vencido.
Entre em contato com [NegócioCliente] para resolver.
🔗 quitazap.com.br/pagar/ABC123"
```

### Tratamento de respostas automáticas
- `PAGO` ou `pago` → muda status para AGUARDANDO_CONFIRMAÇÃO, notifica cliente
- `PARAR` ou `parar` → pausa a régua da pendência
- Comprovante (imagem) → notifica cliente + status AGUARDANDO_CONFIRMAÇÃO
- Qualquer outra resposta → notifica cliente que o pagador respondeu

---

## 8. STATUS DA PENDÊNCIA (Fluxo completo)

```
RASCUNHO
  ↓ (agendou)
AGENDADA
  ↓ (cron enviou)
ENVIADA
  ↓ (WhatsApp confirmou entrega)
ENTREGUE
  ↓ (WhatsApp confirmou leitura)
LIDA
  ↓ (pagador clicou no link)
LINK_ABERTO
  ↓ (pagador respondeu)
RESPONDIDA
  ↓ (aguardando confirmação)
AGUARDANDO_PAGAMENTO
  ↓ (Pix iniciado)
PAGAMENTO_INICIADO
  ↓
PAGA ✅  ou  PARCIALMENTE_PAGA

Outros estados:
VENCIDA (passou do prazo sem pagar)
PAUSADA (cliente pausou a régua)
CANCELADA (cliente cancelou)
FALHOU (erro no envio WhatsApp)
```

---

## 9. PÁGINA DE PAGAMENTO PÚBLICA (/pagar/[slug])

### O que exibir
```
┌──────────────────────────────────┐
│  Logo QuitaZAP                   │
│                                  │
│  [Nome do Negócio]               │
│  enviou um lembrete              │
│                                  │
│  💰 R$ 500,00                   │
│  📋 Serviço de manutenção       │
│  📅 Vencimento: 30/06/2026      │
│                                  │
│  ┌────────────────────────────┐  │
│  │  📷 QR Code Pix            │  │
│  └────────────────────────────┘  │
│                                  │
│  Pix copia e cola:               │
│  [campo copiável]                │
│                                  │
│  ┌──────────────────────────┐    │
│  │   ✅ Já paguei           │    │
│  └──────────────────────────┘    │
│                                  │
│  Rodapé: enviado via QuitaZAP    │
└──────────────────────────────────┘
```

### Geração do slug
```
slug = cuid().slice(0, 8).toUpperCase() // ex: ABC123DE
URL  = quitazap.com.br/pagar/ABC123DE
```

---

## 10. CALCULADORA DE ECONOMIA

### Fórmula
```
Tempo manual por tentativa: 4 minutos
Tempo para cadastrar no QuitaZAP: 45 segundos

Tempo economizado = (lembretes_enviados × 4min) - (pendencias_criadas × 0.75min)
```

### No dashboard (card dinâmico)
```
⏱ Tempo economizado este mês: 5h05
"Tempo estimado que você deixou de gastar enviando e controlando lembretes manualmente."
```

### Na landing (calculadora interativa)
```
Quantas cobranças você faz por mês? [slider: 10–200]
Tempo manual estimado: X horas
Com QuitaZAP: Y minutos
Você economizaria: Z horas e W minutos por mês
```

---

## 11. DASHBOARD DO CLIENTE (Cards principais)

```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ 💰 Recuperado   │ │ 📋 Em aberto    │ │ 🔴 Vencidos     │
│ R$ 3.280,00     │ │ R$ 2.450,00     │ │ R$ 1.100,00     │
│ este mês        │ │ pendente        │ │ atrasados       │
└─────────────────┘ └─────────────────┘ └─────────────────┘
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ 📤 Lembretes   │ │ 👁 Taxa leitura │ │ ⏱ Economizado   │
│ 86 enviados     │ │ 72%             │ │ 5h05            │
│ este mês        │ │ das mensagens   │ │ este mês        │
└─────────────────┘ └─────────────────┘ └─────────────────┘

Frase dinâmica:
"O QuitaZAP trabalhou por você e ajudou a recuperar R$3.280,00 este mês."
```

---

## 12. BOT POR WHATSAPP (Operação sem painel)

### Comandos principais
| Comando | Ação |
|---------|------|
| `nova cobrança` | Inicia fluxo de criação de pendência |
| `vencidos` | Lista pendências vencidas |
| `receber hoje` | Lista pendências com vencimento hoje |
| `recuperado` | Total recuperado no mês |
| `relatório` | Resumo completo |
| `pagamentos` | Histórico de confirmações |
| `contatos` | Lista contatos cadastrados |
| `ajuda` | Menu de comandos |

### Fluxo de criação via bot
```
Bot: Vamos criar uma nova pendência! 😊
     Quem vai pagar? (pode enviar um contato da agenda)

Cliente: [envia contato ou digita nome + número]

Bot: 👤 João Silva — 71999999999
     Qual o valor?

Cliente: R$ 500

Bot: 💰 R$ 500,00. Qual o vencimento?

Cliente: dia 30

Bot: 📅 30/06/2026. Qual o tipo?
     1 — Serviço prestado
     2 — Venda fiada
     3 — Mensalidade
     4 — Parcela
     5 — Outro

Cliente: 1

Bot: ✅ Prévia da mensagem:
     "Olá, João! [Seu Negócio] registrou um lembrete..."
     
     Quando enviar?
     1 — Amanhã às 8h
     2 — No dia do vencimento
     3 — Escolher data/hora

Cliente: 1

Bot: 🎯 Pendência agendada!
     João Silva — R$500,00 — vence 30/06
     Lembrete em: 29/06 às 08:00
     [Link do painel]
```

### Relatório diário automático (bot → cliente)
```
Bom dia, [Nome]! ☀️

Resumo QuitaZAP Receber:
💰 Recuperado ontem: R$ 320,00
📋 Em aberto: R$ 1.450,00
🔴 Vencidos: R$ 600,00
📤 Lembretes enviados: 8
👁 Lidos: 5
💬 Responderam: 2
⏱ Tempo economizado: 32 minutos

Hoje você tem 3 lembretes agendados.

1 — Ver vencidos
2 — Criar nova pendência
3 — Ver pagamentos
4 — Abrir painel
```

---

## 13. PLANOS COMERCIAIS

### QuitaZAP Controle — R$ 19,90/mês
- Controle de contas e dívidas
- Lembretes de vencimento
- Resumo financeiro no WhatsApp
- Plano de quitação
- Relatório mensal

### QuitaZAP Receber Básico — R$ 29,90/mês
- Até 20 lembretes/mês
- Envio pelo WhatsApp Business conectado
- Status: enviado, entregue, lido
- Baixa manual
- Relatório básico
- Calculadora de tempo economizado

### QuitaZAP Receber Pro — R$ 49,90/mês
- Até 100 lembretes/mês
- Link de pagamento + página de pagamento
- Pix copia e cola + QR Code
- Notificação de leitura e resposta
- Respostas automáticas (PAGO/PARAR)
- Relatório completo de pendências
- Régua configurável

### QuitaZAP Receber Premium — R$ 99,90/mês
- Lembretes ilimitados
- Baixa automática via Pix (gateway)
- Pagamento parcial
- Régua totalmente personalizada
- Relatório financeiro avançado + exportação
- Integrações futuras

---

## 14. FASES DE DESENVOLVIMENTO

### FASE 1 — Autenticação e Base Multi-tenant (1–2 semanas)
**O que construir:**
- [ ] Sistema de cadastro e login (NextAuth.js + email/senha)
- [ ] Middleware de proteção de rotas `/dashboard/**`
- [ ] Modelos Prisma: `Usuario`, `Contato`, `Pendencia`, `Envio`, `Regua`, `ConfigUsuario`
- [ ] Isolamento de dados por `usuarioId` em todas as queries
- [ ] Webhook CAKTO atualizado para criar `Usuario` (não mais `Cliente`)
- [ ] Tela de cadastro + login
- [ ] Tela de "conectar WhatsApp" (QR Code Evolution API)

**O que manter do atual:**
- Modelos `Cliente`, `BotSessao`, `Divida`, `LeadVendas` (para QuitaZAP Controle, depois)
- Deploy Vercel, Supabase, estrutura Next.js

---

### FASE 2 — QuitaZAP Receber MVP (2–3 semanas)
**O que construir:**
- [ ] Tela "Nova Pendência" (pagador + valor + vencimento + tipo + forma pagamento)
- [ ] Tela "Receber" (lista de pendências com filtros e ações)
- [ ] Cadastro de contatos
- [ ] Régua padrão do sistema (4 etapas)
- [ ] Confirmação manual de pagamento
- [ ] Dashboard inicial (6 cards + frase de valor)
- [ ] Relatório simples (recuperado, em aberto, vencidos)

---

### FASE 3 — Bot WhatsApp do Cliente (1–2 semanas)
**O que construir:**
- [ ] Bot recebe comandos pelo WhatsApp do cliente (via número conectado do próprio usuário)
- [ ] Criar pendência pelo bot (fluxo conversacional)
- [ ] Receber contato da agenda via WhatsApp
- [ ] Prévia da mensagem antes de confirmar
- [ ] Relatório diário automático (cron 07:30 BRT)
- [ ] Relatório semanal (segunda-feira)
- [ ] Comandos: nova cobrança, vencidos, receber hoje, recuperado, ajuda

---

### FASE 4 — Envio Automático de Lembretes (1–2 semanas)
**O que construir:**
- [ ] Cron que verifica pendências e dispara lembretes no horário correto
- [ ] Envio via WhatsApp Business do cliente (Evolution API por instância)
- [ ] Rastreamento de status: enviado → entregue → lido (via webhook Evolution)
- [ ] Tratamento de respostas automáticas (PAGO, PARAR, comprovante)
- [ ] Notificação ao cliente quando o pagador responde/lê
- [ ] Pausa e reagendamento de régua

---

### FASE 5 — Dashboard Completa (1–2 semanas)
**O que construir:**
- [ ] Tela Mensagens (histórico de envios por pendência)
- [ ] Tela Pagamentos (confirmações + histórico)
- [ ] Tela Relatórios (recuperado, leitura, resposta, tempo economizado)
- [ ] Tela WhatsApp conectado (status + QR Code para reconexão)
- [ ] Tela Configurações (nome do negócio, horário, régua padrão)
- [ ] Tela Plano e assinatura

---

### FASE 6 — Link de Pagamento (1 semana)
**O que construir:**
- [ ] Geração de slug único por pendência
- [ ] Página pública `/pagar/[slug]` com QR Code + Pix copia e cola + botão "Já paguei"
- [ ] Rastreamento de abertura do link (status LINK_ABERTO)
- [ ] Botão "Já paguei" → notifica cliente + muda status
- [ ] Inclusão do link nas mensagens de lembrete

---

### FASE 7 — Baixa Automática via Pix (2–3 semanas)
**O que construir:**
- [ ] Integração com gateway Pix (Asaas, EFI ou Woovi)
- [ ] Geração de Pix dinâmico identificável por pendência
- [ ] Webhook do gateway → confirma pagamento automaticamente
- [ ] Cancelamento automático dos lembretes restantes após pagamento
- [ ] Notificação ao cliente: "João pagou R$500,00 automaticamente"
- [ ] Suporte a pagamento parcial

---

### FASE 8 — QuitaZAP Controle (migração) (2 semanas)
**O que construir:**
- [ ] Migrar funcionalidades do bot atual para o novo sistema multi-tenant
- [ ] Integrar com o dashboard (tela Controle separada das telas Receber)
- [ ] Lembretes de vencimento de contas pessoais
- [ ] Plano de quitação no dashboard
- [ ] Relatório mensal pessoal

---

## 15. APIS A CONSTRUIR

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth.js |
| `/api/usuario/registro` | POST | Cria conta nova |
| `/api/contatos` | GET/POST/PATCH/DELETE | CRUD contatos |
| `/api/pendencias` | GET/POST | Lista/cria pendências |
| `/api/pendencias/[id]` | GET/PATCH/DELETE | Pendência individual |
| `/api/pendencias/[id]/pausar` | POST | Pausa a régua |
| `/api/pendencias/[id]/confirmar` | POST | Confirma pagamento manual |
| `/api/pagamento/[slug]` | GET | Dados da página pública |
| `/api/pagamento/[slug]/pago` | POST | "Já paguei" do devedor |
| `/api/whatsapp/conectar` | POST | Gera QR Code para conexão |
| `/api/whatsapp/status` | GET | Status da conexão |
| `/api/webhook/evolution` | POST | Webhook de status + respostas |
| `/api/webhook/cakto` | POST | Compra/cancelamento (já existe) |
| `/api/webhook/pix` | POST | Confirmação automática Pix (Fase 7) |
| `/api/cron/lembretes` | POST | Cron diário de disparos |
| `/api/cron/relatorio-diario` | POST | Cron de relatório ao cliente |
| `/api/relatorios/resumo` | GET | Dados do dashboard |

---

## 16. ESTRUTURA DE ARQUIVOS V2

```
quitaZAP/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── registro/page.tsx
│   │   ├── dashboard/
│   │   │   ├── layout.tsx          ← Sidebar + autenticação
│   │   │   ├── page.tsx            ← Dashboard inicial (cards)
│   │   │   ├── receber/
│   │   │   │   ├── page.tsx        ← Lista de pendências
│   │   │   │   └── nova/page.tsx   ← Criar pendência
│   │   │   ├── contatos/page.tsx
│   │   │   ├── mensagens/page.tsx
│   │   │   ├── pagamentos/page.tsx
│   │   │   ├── relatorios/page.tsx
│   │   │   ├── whatsapp/page.tsx
│   │   │   ├── configuracoes/page.tsx
│   │   │   └── plano/page.tsx
│   │   ├── pagar/
│   │   │   └── [slug]/page.tsx     ← Página pública de pagamento
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/ ← NextAuth
│   │   │   ├── usuario/
│   │   │   ├── contatos/
│   │   │   ├── pendencias/
│   │   │   ├── pagamento/
│   │   │   ├── whatsapp/
│   │   │   ├── relatorios/
│   │   │   ├── webhook/
│   │   │   │   ├── evolution/      ← Status WA + respostas
│   │   │   │   ├── cakto/          ← Já existe
│   │   │   │   └── pix/            ← Confirmação automática (Fase 7)
│   │   │   └── cron/
│   │   │       ├── lembretes/      ← Disparo automático
│   │   │       └── relatorio-diario/
│   │   ├── (landing)/
│   │   │   ├── page.tsx            ← Landing principal
│   │   │   ├── receber/page.tsx    ← Landing QuitaZAP Receber
│   │   │   └── controle/page.tsx   ← Landing QuitaZAP Controle
│   │   └── layout.tsx
│   └── lib/
│       ├── auth.ts                 ← NextAuth config
│       ├── evolution.ts            ← Evolution API multi-instância
│       ├── pendencias.ts           ← Lógica de regime e disparo
│       ├── mensagens.ts            ← Templates de mensagem
│       ├── economia.ts             ← Cálculo de tempo economizado
│       ├── pix.ts                  ← Geração de Pix (Fase 7)
│       ├── prisma.ts               ← Já existe
│       ├── zapi.ts                 ← Já existe (manter para Controle)
│       └── plano.ts                ← Já existe (manter para Controle)
├── prisma/
│   └── schema.prisma
├── vercel.json
└── deploy.bat
```

---

## 17. DECISÕES TÉCNICAS IMPORTANTES

### Evolution API para multi-instância
- Cada cliente conecta seu WhatsApp Business via QR Code na tela `/dashboard/whatsapp`
- O sistema cria uma instância no Evolution API com o nome `usuario-{id}`
- Lembretes saem do número do próprio cliente (não do número do QuitaZAP)
- Webhook do Evolution notifica status de mensagens e respostas

### Isolamento de dados
- Todo `SELECT` filtra por `usuarioId` da sessão JWT
- Pendências só podem ser acessadas pelo dono
- Slug de pagamento é público, mas não expõe dados do cliente além do necessário

### Funil de vendas atual
- Mantido para QuitaZAP Controle (bot conversa com não-clientes)
- Para Receber: landing page → cadastro → conexão WhatsApp → criar primeira pendência

### O que NÃO construir agora
- Módulo de empréstimo com juros (risco jurídico, confunde posicionamento)
- Open Finance (complexidade alta, baixo retorno no MVP)
- App mobile (PWA ou web responsiva resolve)

---

## 18. MÉTRICAS POR PRODUTO

### QuitaZAP Receber
| Métrica | Como medir |
|---------|-----------|
| MRR | CAKTO + planos ativos |
| Valor recuperado pelos clientes | Soma de `Pendencia.valorPago` |
| Taxa de leitura | `Envio.status = LIDO / ENVIADO` |
| Taxa de recuperação | `PAGA / total não canceladas` |
| Tempo economizado total | Fórmula por usuário × todos os usuários |
| Lembretes enviados/mês | Count `Envio` |

### QuitaZAP Controle
| Métrica | Como medir |
|---------|-----------|
| Planos ativos | `Usuario.plano = CONTROLE` |
| Dívidas cadastradas | Count `Divida` |
| Taxa de atualização | Clientes que marcaram contas pagas |

---

## 19. PRÓXIMO PASSO IMEDIATO

**Fase 1 — Autenticação e Base**

Tarefa 1: Adicionar modelos ao `schema.prisma` e rodar migration
Tarefa 2: Instalar e configurar NextAuth.js
Tarefa 3: Criar telas de login e registro
Tarefa 4: Criar middleware de proteção `/dashboard/**`
Tarefa 5: Criar tela de dashboard inicial (com cards zerados)
Tarefa 6: Atualizar webhook CAKTO para criar `Usuario`

Estimativa: 1–2 dias de desenvolvimento.

---

*Documento gerado em 28/06/2026 — QuitaZAP V2 Planning Session*
*Para iniciar o desenvolvimento: anexe este arquivo + informe qual fase começar.*
