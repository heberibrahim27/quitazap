# RELATORIO-QUITAZAP.md

> Relatório consolidado — 2026-08-19. Cobre o que está funcionando de verdade (verificado com acesso real ao Vercel e ao Supabase, não só leitura de código), o que foi entregue nesta sessão, e o que só você pode decidir/fazer.

---

## 🚨 Resumo executivo — 2 achados urgentes desta sessão

1. **O banco do QuitaZAP estava pausado e o site caiu.** Durante esta sessão você reportou erro ao logar em quitazap.com.br. Investigando o Vercel achei o erro real nos logs de produção (`FATAL: tenant/user postgres.iubrlwngulknqacrnrce not found`, código `832877371` — bate exatamente com o que apareceu na sua tela) e confirmei no Supabase que o projeto `quitazap` estava com status **INACTIVE** (pausado). **Já reativei** — está `ACTIVE_HEALTHY` agora. Tente logar de novo. Isso não tinha nada a ver com o código que eu mexi — é um projeto Supabase separado que pausou (provavelmente por inatividade, consistente com você ter direcionado atenção/recursos pro BancaZap).
2. **RLS (Row Level Security) está desligado nas 15 tabelas do banco de produção do QuitaZAP.** Confirmei isso agora com acesso direto ao banco — não é mais suposição do levantamento original. Isso inclui `Cliente`, `Divida`, `Pagamento`, `Usuario` (com hash de senha) e todo o resto. **Não fiz nenhuma alteração nisso** — é uma decisão que só você deve tomar, com o SQL de correção pronto na seção "Achado crítico de segurança" abaixo. Ligar RLS sem as políticas certas pode travar o acesso do próprio sistema, por isso não apliquei sozinho.

---

## 1. O que está funcionando hoje (verificado agora, não só por código)

- **Produção está no ar**: `quitazap.com.br` aponta pro deployment `dpl_DCQeYUMrLZg7dQwkzb3bHq1TF2Lq` (branch `main`, commit "corrige saldo automatico apos fatura fechada"). Build OK, Proxy/Middleware OK.
- **Banco Supabase (`iubrlwngulknqacrnrce`) está `ACTIVE_HEALTHY`** — reativado nesta sessão.
- **As 15 tabelas do schema legado + Receber já existem no banco real** (confirmado via `list_tables`): `Cliente`, `Divida`, `Parcela`, `Pagamento`, `PlanoEnviado`, `BotSessao`, `LogIA`, `LeadVendas`, `Cobranca`, `Usuario`, `ContatoReceber`, `Pendencia`, `EnvioBot`, `ConfigUsuario`. Todas com 0 linhas no momento da checagem (não sei se é porque o pause zerou algo ou se já estava assim — não fiz nenhuma query de contagem antes de descobrir que o projeto estava pausado, então não dá pra comparar com um "antes").
- **A tabela `_prisma_migrations` existe mas está vazia** (`list_migrations` retornou `[]`). Isso confirma 100% o que o levantamento original suspeitava: o banco foi evoluído por fora do histórico de migrations (via `db push` ou direto no Supabase), nunca por `prisma migrate deploy`.
- **Cron jobs configurados no Vercel** (`/api/cron/lembretes`, `/api/cron/cobrador`) rodaram e logaram erro só porque o banco estava pausado (mesmo erro `ENOTFOUND`) — não é bug de lógica, é reflexo do achado #1.
- **Funcionalidades do Controle** (onboarding, controle financeiro, cobrador automático, funil de vendas) — o código está lá e o build passa, mas não consigo confirmar comportamento end-to-end sem WhatsApp conectado (ver seção 4).

---

## 2. O que foi entregue nesta sessão (branch `claude/quitazap-codebase-audit-d99arm`, ainda não mesclada em `main`)

### Feature nova: tarefas e pagamentos por áudio/texto
- Model `Tarefa` (lembretes pontuais/recorrentes — mensal/semanal/anual — e pagamentos), com reconciliação automática contra `Divida` quando o texto bate com um credor cadastrado.
- Comandos no bot: `tarefa:`/`lembrete:`/`pagamento:`, `minhas tarefas`, `concluí ...`, `cancelar ...`.
- Cron `/api/cron/tarefas` (roda de hora em hora) — avança recorrências e envia lembrete no horário configurado por tarefa.
- 42 testes novos (131 no total do projeto). `tsc`, `npm test`, `npm run build` passando limpos.
- **3 rodadas de auditoria (code-review) encontraram e eu corrigi 9 problemas reais**, o mais grave sendo: toda data era construída no fuso do servidor (UTC) mas exibida/comparada em horário de Brasília, fazendo qualquer lembrete aparecer e disparar um dia adiantado. Lista completa no `CONTINUIDADE.md`, seção 5.

### Hardening adicional (pedido de "continuar" e "adiantar o que puder")
- Checklist de deploy documentado (`CONTINUIDADE.md`, seção 8).
- Aviso em log quando `CRON_SECRET` não está configurado (4 rotas de cron/broadcast) — só observabilidade, não muda comportamento.
- **Migration "baseline" para `LeadVendas`/`Cobranca`/`LogIA`** — as 3 tabelas do legado que faltavam migration, confirmado agora que já existem no banco real. A migration está marcada claramente pra usar `prisma migrate resolve --applied` em vez de aplicar direto (ver seção 5).
- **Segunda camada de dedupe do webhook** (tabela `MensagemProcessada`, complementando o Map em memória que já existia) — passou por 3 rodadas de auditoria própria, corrigindo bloqueio permanente de mensagem após falha, condição de corrida na renovação, e limpeza automática (retenção 24h, reaproveitando o cron de tarefas).

Nada disso está em produção ainda — está tudo na branch, aguardando merge.

---

## 3. 🔒 Achado crítico de segurança — RLS desligado (decisão sua)

Confirmado agora com o linter de segurança do próprio Supabase (nível **ERROR/crítico**):

> **15 tabelas em `public` estão com Row Level Security desabilitado** — totalmente expostas às roles `anon` e `authenticated` que as bibliotecas cliente do Supabase usam. Isso inclui `Usuario` (tem `senhaHash`), `Cliente`, `Divida`, `Pagamento`, `Cobranca`, e todas as outras.

**O que isso significa na prática**: o app hoje acessa o banco via Prisma (conexão direta), não via o cliente JS do Supabase — não achei nenhuma variável `NEXT_PUBLIC_SUPABASE_*` nem uso do SDK do Supabase no código, então o app em si provavelmente não depende de RLS pra funcionar. **Mas** a API REST do Supabase (PostgREST) fica exposta publicamente em todo projeto Supabase por padrão, com ou sem uso — se alguém obtiver a `anon key` do projeto (que por design não é um segredo ultra-protegido), com RLS desligado consegue ler e escrever qualquer linha de qualquer tabela direto, sem passar pelo seu app.

**Eu não apliquei a correção.** Ligar RLS sem políticas de acesso corretas pode travar o funcionamento do próprio sistema (dependendo de qual role o Prisma usa pra conectar). É uma decisão de segurança que precisa ser sua, com cuidado. Se quiser seguir, o SQL abaixo liga RLS em todas as tabelas — mas **isso sozinho não basta**, precisa de políticas (`CREATE POLICY`) definindo quem pode acessar o quê, senão todo acesso via PostgREST fica bloqueado:

```sql
ALTER TABLE public."Cliente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Divida" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Parcela" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Pagamento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PlanoEnviado" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BotSessao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LogIA" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LeadVendas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Cobranca" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Usuario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ContatoReceber" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Pendencia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."EnvioBot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ConfigUsuario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
```

Caminho mais simples e comum quando o acesso é só via backend (Prisma), sem app cliente usando o Supabase diretamente: ligar RLS em todas + **nenhuma policy** (bloqueia totalmente o acesso via PostgREST/anon key, mas mantém o Prisma funcionando normalmente se ele conectar com a connection string "postgres" direta, que por padrão ignora RLS). Vale confirmar isso com cuidado antes de aplicar, idealmente testando primeiro. Não é algo pra rodar às pressas em produção sem verificar.

(Achados de performance também apareceram, nível informativo só — algumas FKs sem índice de cobertura. Não é urgente, posso detalhar se quiser.)

---

## 4. O que falta / pendências

### Bloqueado por decisão/ação sua (não é código)
- **Instância Z-API do QuitaZAP**: você me contou que ela foi redirecionada pro BancaZap e você não está pagando duas instâncias agora. Ou seja, **o bot de WhatsApp do QuitaZAP não está recebendo mensagens hoje**, mesmo com o banco de volta. Isso bloqueia qualquer teste end-to-end real da feature nova. Você mencionou que paga a assinatura (R$99) quando estiver pronto — combinado.
- **RLS desligado** (seção 3) — decisão de segurança sua.
- **Migrations da branch nova ainda não aplicadas** no banco real: `Tarefa`, `MensagemProcessada`, e a baseline de `LeadVendas`/`Cobranca`/`LogIA`. Passo a passo no `CONTINUIDADE.md`, seção 8.
- **Branch não mesclada** — tudo que descrevi na seção 2 está em `claude/quitazap-codebase-audit-d99arm`, não em `main`/produção.
- **Confirmar plano da Vercel** — o cron novo (`/api/cron/tarefas`) precisa rodar de hora em hora; no plano Hobby (gratuito) a Vercel só executa cron 1x/dia.

### Dívida técnica conhecida, não urgente (backlog documentado no `CONTINUIDADE.md`, seção 7)
- Estado financeiro do dia a dia (gastos, despesas fixas, cartões) inteiro dentro de JSON de conversa (`BotSessao.dividasTemp`), sem tabela relacional própria.
- Cascata do webhook grande (~1900 linhas em `route.ts`).
- PDF de contracheque pausado (decisão de produto).

---

## 5. O que você precisa fazer manualmente (checklist priorizado)

1. **Testar login em quitazap.com.br agora** — o banco já foi reativado, deve funcionar. Me avisa se não funcionar.
2. **Decidir sobre RLS** (seção 3) — ideal ter alguém validando antes de aplicar em produção, já que pode afetar acesso se o Prisma não estiver usando a connection string certa.
3. **Quando for mesclar a branch nova**: aplicar as migrations pendentes com cuidado (`CONTINUIDADE.md`, seção 8 tem o passo a passo, incluindo o alerta sobre `migrate resolve --applied` pras tabelas que já existem).
4. **Confirmar `CRON_SECRET`** está configurado no Vercel (Project Settings → Environment Variables).
5. **Confirmar plano da Vercel** (Hobby vs Pro) — afeta se o cron de tarefas roda de hora em hora de verdade.
6. **Reativar/pagar a instância Z-API do QuitaZAP** quando for testar a feature nova de verdade com WhatsApp real.
7. **Revisar e aprovar (ou pedir ajuste) na branch `claude/quitazap-codebase-audit-d99arm`** antes de mesclar em `main`.

---

## Onde encontrar mais detalhes

- `LEVANTAMENTO-QUITAZAP.md` — raio-x original do código (stack, modelo de dados, funcionalidades).
- `CONTINUIDADE.md` — plano da feature, decisões de produto, achados de auditoria completos, checklist de deploy, backlog do restante do Controle.
- Este arquivo (`RELATORIO-QUITAZAP.md`) — snapshot do que está funcionando/faltando/pendente, com dados verificados direto do Vercel e do Supabase nesta sessão.
