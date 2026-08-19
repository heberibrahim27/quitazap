# LEVANTAMENTO-QUITAZAP.md

> Raio-x somente leitura do estado atual do repositório `quitazap`, feito em 2026-08-15.
> Nenhum código foi alterado, nenhuma migration foi rodada, nenhuma dependência foi instalada.
> Não havia plugin/agente Codex configurado neste ambiente — toda a leitura de backend/SQL/segurança/financeiro foi feita diretamente pelo Claude Code (Explore/general-purpose agents em modo leitura), como indicado nas regras deste levantamento.

---

## 1. Stack técnica confirmada

- **Framework:** Next.js `^16.2.9` (App Router, `src/app`), React `^19.2.7`, TypeScript `^6.0.3`. Build/deploy via `next build`/`next start`.
- **Hospedagem:** Vercel — confirmado por `vercel.json` (define `crons`) e por variáveis como `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_SITE_URL`. Não há Dockerfile nem outro alvo de deploy no repositório.
- **Banco de dados:** PostgreSQL via **Supabase**, acessado com **Prisma ORM** (`@prisma/client` / `prisma` `^6.19.3`). `datasource db` em `prisma/schema.prisma` usa `DATABASE_URL` + `DIRECT_URL` (padrão Supabase com pool + conexão direta). Cliente Prisma singleton em `src/lib/prisma.ts`.
- **Provider de WhatsApp:** **Z-API** é o provider ativo por padrão (`WHATSAPP_PROVIDER` env var, default `"zapi"`). O código também suporta **Evolution API** como alternativa multi-instância (`WHATSAPP_PROVIDER=evolution`), pensada para o produto "QuitaZAP Receber" (cada cliente conecta o próprio WhatsApp Business). Toda a camada de envio está centralizada em `src/lib/zapi.ts` (`sendWhatsApp`, `sendWhatsAppImage`, `sendWhatsAppInstancia`, `normalizarTelefone`). O recebimento de mensagens é via webhook único: `POST /api/webhook/zapi` (`src/app/api/webhook/zapi/route.ts`, ~1900 linhas).
- **Integração Cakto (billing):**
  - **Não existe nenhuma chamada de API da Cakto para criar cobrança** neste repositório — o checkout acontece inteiramente na página hospedada da Cakto.
  - O app apenas (a) linka para o checkout da Cakto — link fixo `https://pay.cakto.com.br/3fz3gz6_945044` em `src/lib/sales-bot.ts` e `src/app/testar-funil/page.tsx`, e link configurável via `NEXT_PUBLIC_CAKTO_URL` na landing `/oferta` — e (b) recebe o webhook `POST /api/webhook/cakto` (`src/app/api/webhook/cakto/route.ts`), que trata apenas o evento `purchase_approved`, valida um campo `body.secret` contra `process.env.CAKTO_SECRET` **somente se essa env var estiver definida** (sem validação de assinatura/HMAC do payload), cria/renova o `Cliente` e inicia uma `BotSessao` de boas-vindas.
  - `src/app/financeiro/page.tsx` (painel interno) usa uma taxa fixa `COMISSAO_CAKTO = 0.053` só para cálculo de margem, não para integração real.
- **Uso de OpenAI hoje:** múltiplos pontos, todos via chamadas HTTP diretas à API da OpenAI (sem SDK):
  - **`gpt-4o-mini`** — motor conversacional principal do bot (`processarMensagemIA` em `src/lib/ai-bot.ts`), com function-calling (`gerar_diagnostico`) para extrair um diagnóstico financeiro estruturado quando o usuário pede. Também usado para interpretar comandos "cobrar" no webhook e como modelo padrão do interpretador de intenção financeira (`src/lib/ia/financeiro-intent-resolver.ts`, env-configurável via `OPENAI_FINANCEIRO_INTENT_MODEL`/`OPENAI_MODEL`).
  - **`gpt-4o`** — usado para Vision (análise de imagens de boletos/contracheques enviadas no WhatsApp) e para extração estruturada de PDF de contracheque (função `extrairPDF`, hoje **não é mais chamada automaticamente** — ver seção 5).
  - **`whisper-1`** — transcrição de áudio recebido no WhatsApp (`transcreverAudio`).
  - O interpretador de intenção financeira (`financeiro-intent-resolver.ts`) é **local-first**: primeiro tenta resolver por regex/heurística (`resolverLocal`); só chama a OpenAI se o resultado local ficar "dentro do escopo mas vazio" — reduz custo de IA no fluxo de lançamentos do dia a dia.
  - Custo é rastreado no modelo `LogIA` (`tipo`, `tokensInput`, `tokensOutput`, `custoUSD`), mas **apenas as chamadas de `ai-bot.ts` gravam log** — as chamadas de Vision, Whisper e do interpretador de intenção financeira não gravam em `LogIA` hoje.

---

## 2. Modelo de dados atual

`prisma/schema.prisma` define **dois conjuntos de modelos que convivem no mesmo banco** (comentário no próprio schema chama o segundo grupo de "Modelos novos (multi-tenant) — Sistema separado dos modelos legados acima"):

### Grupo legado — "QuitaZAP" / "QuitaZAP Controle" (em uso ativo pelo bot)
| Modelo | Campos principais | Relacionamentos |
|---|---|---|
| `Cliente` | nome, telefone, cpf, email, statusAtendimento, rendaMensal, despesasFixas, gratuito, assinaturaVenceEm | 1:N `Divida`, `Pagamento`, `PlanoEnviado`, `BotSessao`, `Cobranca` |
| `Divida` | credor, tipo (CARTAO/EMPRESTIMO/BOLETO/ACORDO/OUTRO), valorTotal, valorPago, status, prioridade, diaVencimento, emAtraso, diasAtraso | N:1 `Cliente`; 1:N `Parcela`, `Pagamento` |
| `Parcela` | numero, valor, vencimento, status | N:1 `Divida` |
| `Pagamento` | valor, data | N:1 `Divida`, `Cliente` |
| `PlanoEnviado` | texto (relatório/diagnóstico enviado) | N:1 `Cliente` |
| `BotSessao` | telefone (único), clienteId, etapa, dividasTemp (JSON serializado como histórico de conversa), renda | N:1 `Cliente` (opcional) |
| `LeadVendas` | telefone (único), etapa (funil de vendas), cupomEnviado, msgCount | sem relações |
| `Cobranca` (Cobrador Automático Pessoal) | credorNome, devedorNome, devedorFone, valor, vencimento, status, etapa, tentativas | N:1 `Cliente` |
| `LogIA` | tipo (chat/whisper/vision), tokensInput/Output, custoUSD, gratuito | sem relações (clienteId opcional, sem FK) |

### Grupo novo — "QuitaZAP Receber" (multi-tenant, com dashboard próprio em `/dashboard`, mas **não é o que o webhook do WhatsApp usa hoje**)
| Modelo | Campos principais | Relacionamentos |
|---|---|---|
| `Usuario` | email (único), senhaHash, plano, planoPago, assinaturaVenceEm, wpInstancia, wpConectado, wpTelefone | 1:N `ContatoReceber`, `Pendencia`, `EnvioBot`; 1:1 `ConfigUsuario` |
| `ContatoReceber` | nome, telefone, documento (único por `[usuarioId, telefone]`) | N:1 `Usuario`; 1:N `Pendencia` |
| `Pendencia` | descricao, tipo, valor, vencimento, formaPagto, pixChave, linkSlug (único), status (rico: RASCUNHO…PAGA…CANCELADA), etapa, tentativas | N:1 `Usuario`, `ContatoReceber` (opcional); 1:N `EnvioBot` |
| `EnvioBot` | etapa, mensagem, status, resposta | N:1 `Usuario`, `Pendencia` |
| `ConfigUsuario` | nomeNegocio, horarioEnvio, fusoHorario, resumoDiario/Semanal | 1:1 `Usuario` |

**Achado relevante de dívida técnica no schema:** o `Usuario.telefone` (campo de contato geral) é diferente do `Usuario.wpTelefone`/`wpInstancia`/`wpConectado` (número WhatsApp Business conectado). O cadastro (`/api/auth/registro`) só preenche `telefone`; a vinculação do WhatsApp da conta é um passo separado — e esse passo está **quebrado** (ver seção 5).

### Migrations vs. schema — divergência importante
Existe **uma única migration** no histórico (`prisma/migrations/20260627010952_init/migration.sql`, 111 linhas) e ela cria **apenas 6 tabelas**: `Cliente`, `Divida`, `Parcela`, `Pagamento`, `PlanoEnviado`, `BotSessao`. Os modelos `LeadVendas`, `Cobranca`, `LogIA`, `Usuario`, `ContatoReceber`, `Pendencia`, `EnvioBot`, `ConfigUsuario` (metade do schema atual) **não aparecem em nenhuma migration versionada**. Isso indica que o banco real no Supabase foi evoluído por fora do histórico de migrations do Prisma (provavelmente via `prisma db push` ou alteração direta), o que é uma divergência real entre "o que o schema.prisma descreve" e "o que o histórico de migrations documenta". **Não dá para confirmar via código se o banco de produção está de fato sincronizado com `schema.prisma`** — isso só é verificável direto no Supabase.

### Políticas de RLS (Row Level Security)
**Nenhuma política de RLS foi encontrada no código do repositório** — não há `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY` nem pasta de SQL customizado fora do Prisma. Como o acesso ao banco é sempre feito pelo backend via Prisma (presumivelmente com a connection string de service role/postgres direto), a ausência de RLS no repositório é consistente com um modelo "tudo protegido na camada de aplicação, não no banco". **Isso não é 100% verificável só pelo código**: políticas de RLS podem ter sido criadas manualmente no painel/SQL editor do Supabase sem nunca terem sido versionadas aqui. Marcado como **não verificável via código** se RLS existe ou não no banco real — o que dá para afirmar com certeza é que o repositório não define nem versiona nenhuma política de RLS.

---

## 3. Funcionalidades implementadas e funcionando de verdade

- **Autenticação/onboarding — dois sistemas paralelos e desconectados, achado de bug real:**
  - Sistema legado: `/login` (form) compara `senha` a `process.env.APP_SENHA` (fallback `"quitazap2024"`) em texto puro (sem hash, sem comparação em tempo constante) e seta cookie `qz_auth = "qz_autenticado"`. É essencialmente uma senha única de admin compartilhada, não autenticação por usuário.
  - Sistema novo: `/api/auth/registro` e `/api/auth/login` (modo JSON) usam `Usuario` + `bcryptjs` (hash cost 12) e emitem um token HMAC próprio (`src/lib/auth-jwt.ts`) no cookie **`qz-auth`** (hífen).
  - `src/middleware.ts` — que protege todas as rotas não-públicas do app — **só verifica o cookie `qz_auth` (underscore)**. Ele não sabe nada sobre `qz-auth`/JWT. Resultado: quem se cadastra ou loga pelo fluxo novo (`/cadastro`, `/entrar`) nunca ganha acesso às páginas protegidas pelo middleware, porque o cookie que ele recebe não é o que o middleware verifica. O que efetivamente "funciona" hoje para passar pelo middleware é a senha única de admin.
  - Não há rate limiting nem CSRF token em nenhuma das rotas de auth.
- **Leitura de PDF de contracheque:** implementada tecnicamente (`extrairPDF`, upload para OpenAI Files API + `gpt-4o` com prompt detalhado para classificar empréstimos consignados vs. associações), mas **está pausada no fluxo de produção**. O próprio código documenta isso: comentário `"PDF/contracheque pausado no MVP — manter funções para futura versão beta"`. Quando o usuário manda um documento no WhatsApp, o bot responde pedindo os dados manualmente em vez de processar o PDF. A dependência `pdf-parse` (`package.json`) **não é importada em lugar nenhum do `src/`** — é usada só como referência no menu de comentário do arquivo, ou seja, é dependência morta hoje (a extração de PDF real usa a Files API da OpenAI, não a lib `pdf-parse`).
- **Rastreamento de empréstimo consignado:** funcional, mas manual. Quando o usuário se identifica como servidor público, o bot pede que ele digite os empréstimos no formato `BANCO 250,00 12/60` (parcela atual/total). O parsing textual dessas linhas é feito em `src/lib/diagnostico-normalizer.ts` / `src/lib/servidor-publico-flow.ts`, com a mesma lógica de classificação (empréstimo com prazo finito vs. associação/mensalidade recorrente) que existiria na leitura automática de PDF/imagem — só que via texto digitado, não via upload de contracheque.
- **Conselhos automatizados de dívida:** o "diagnóstico" gerado por `processarMensagemIA` + `gerarRelatorio` (`src/lib/plano.ts`, 752 linhas) monta um relatório financeiro textual (renda, dívidas, prioridade de quitação, QuitaScore) enviado por WhatsApp e salvo em `PlanoEnviado`. Há também `gerarQuitaScore`/`calcularQuitaScore` (`src/lib/quita-score.ts`) — pontuação determinística (sem IA) baseada em histórico de pagamentos.
- **Cron jobs/automações (confirmado por `vercel.json` + leitura de cada rota):**
  - `/api/cron/lembretes` — **agendado, 11h UTC**. Roda dois sistemas em paralelo: (a) sistema novo, `Pendencia`→`EnvioBot`, marca pendências vencidas e envia lembretes D-3/D-2/D-1/D0; (b) sistema legado, `Divida` com `diaVencimento` batendo hoje/amanhã/em 3 dias.
  - `/api/cron/cobrador` — **agendado, 12h UTC**. Régua de cobrança do "Cobrador Automático" (`Cobranca`): etapa 1 (amigável, no vencimento), etapa 2 (firme, D+3), etapa 3 (última chance, D+7), auto-cancela 30 dias após etapa 3 sem pagamento.
  - `/api/cron/resumo` — **não está em `vercel.json`, é um no-op de propósito**: o comentário no código diz que relatórios só são enviados sob pedido do usuário; a rota só loga e retorna, mantida por compatibilidade com agendamentos antigos.
  - `/api/cron/lead-followup` — **não está em `vercel.json`**; segundo comentário no código é disparado via QStash (delay de 4h) a partir de `agendarFollowup()` em `sales-bot.ts`, não via cron do Vercel. Move um `LeadVendas` parado na etapa `OFERTA` para `FOLLOWUP` e reenvia o link da Cakto com cupom, se configurado.
  - Padrão de autenticação nos crons: header `x-internal-call: "1"` sempre pula a checagem; caso contrário, só exige `Authorization: Bearer <CRON_SECRET>` **se a env var `CRON_SECRET` estiver definida** — se não estiver, a rota fica sem nenhuma autenticação.
  - `/api/cobrador/disparar` — endpoint de disparo manual do painel que chama `/api/cron/cobrador` internamente usando `x-internal-call: "1"`, contornando de propósito o `CRON_SECRET`.
- **Landing page `/oferta` e fluxo de pagamento:** página de marketing single-tier ("QuitaZAP — R$ 29,90/mês"), toda a copy é estática, sem formulário de checkout embutido. Todo CTA aponta para `process.env.NEXT_PUBLIC_CAKTO_URL` (link externo hospedado pela Cakto); se a env var não estiver definida, os links caem em `"#"` (link morto). O funil de vendas via WhatsApp (`sales-bot.ts`) usa um link Cakto **hardcoded** diferente (`https://pay.cakto.com.br/3fz3gz6_945044`), então hoje existem dois pontos de entrada de checkout com origem de link distinta (env var vs. hardcoded) — vale unificar.
- **Painel `/dashboard` (sistema "QuitaZAP Receber"):** existe de verdade — páginas para contatos, pendências/"receber", relatórios, configurações, WhatsApp, mensagens — mas a página de conexão de WhatsApp (`/dashboard/whatsapp`) chama `PATCH /api/usuario/whatsapp`, **rota que não existe no repositório** (confirmado por busca — não há `src/app/api/usuario/whatsapp/route.ts` nem nada parecido). Ou seja, salvar a instância WhatsApp pela UI do dashboard está quebrado hoje.
- **Página raiz `/`:** não é a landing pública — é um painel interno (protegido pelo middleware) que mostra receita de assinantes vs. custo de IA do mês (via agregação de `LogIA`).

---

## 4. Webhook / bot de WhatsApp — estado atual

- **Existe e está ativo:** `POST /api/webhook/zapi` (`src/app/api/webhook/zapi/route.ts`), único endpoint que recebe tudo do Z-API.
- **Tipos de entrada suportados:** texto, áudio (transcrito via Whisper), imagem (analisada via GPT-4o Vision) e documento/PDF (recebido, mas a leitura automática está pausada — ver seção 3; o bot responde pedindo para digitar os dados).
- **Onde fica o parsing/interpretação:**
  - Deduplicação de mensagens por `messageId` (Set em memória, até 500 IDs — **não sobrevive a reinício/deploy nem funciona em múltiplas instâncias**, é um detalhe de dívida técnica).
  - Normalização de telefone (`normalizarTelefone`) e busca de `BotSessao` por telefone (com uma variação alternativa de dígito 9 para compatibilizar formatos antigos/novos de número BR).
  - Roteamento sequencial (uma cascata grande de `if`s) por: comando de reset → fluxo fixo de "servidor público"/contracheque manual → correção de renda → consulta de cartões/saldo → lote de gastos em cartão → despesas fixas → correção de origem de gasto → fatura de cartão → configuração de cartão → onboarding de renda → onboarding de despesas fixas → interpretação de intenção financeira (local ou IA) → comandos rápidos (`RESUMO_MES`, `COBRAR`, `VER_COBRANCAS`, `MEU_PAINEL`, `DIAGNOSTICO`, `QUITASCORE`, `AJUDA`) → fallback final para `processarMensagemIA` (conversa livre com IA + geração de diagnóstico).
  - A lógica de "controle financeiro" (lançamentos do dia a dia, cartões, faturas) vive majoritariamente em `src/lib/controle-financeiro-flow.ts` (2162 linhas) e `src/lib/gasto-flow.ts` (categorização de gastos por palavra-chave).
- **Fluxo completo até salvar no banco (dois caminhos, ambos sobre o schema legado):**
  1. **Lançamento do dia a dia** (ex.: "mercado 100"): `gasto-flow.ts`/`controle-financeiro-flow.ts` interpretam (local, com fallback IA via `financeiro-intent-resolver.ts`), o estado da conversa (saldo, cartões, despesas fixas) é serializado **dentro do próprio histórico da sessão** (`BotSessao.dividasTemp`, um JSON de mensagens) — ou seja, **não existe hoje uma tabela relacional para lançamentos financeiros individuais do QuitaZAP Controle**; o "banco de dados" desse fluxo é efetivamente o JSON de conversa da `BotSessao`.
  2. **Diagnóstico completo de dívidas** (fluxo de onboarding com IA function-calling): quando `processarMensagemIA` retorna um `diagnostico` estruturado, o webhook grava de fato em tabelas relacionais — atualiza `Cliente` (renda, status), cria uma linha de `Divida` por dívida identificada, e cria um `PlanoEnviado` com o relatório. Esse é o único ponto do fluxo do bot que persiste dados fora do JSON da sessão.
- **Confirmação:** existe uma suíte de testes de regressão (`tests/regressao-servidor-publico.test.mjs`, 2628 linhas, ~89 casos de teste) cobrindo esse fluxo — transpila TS on-the-fly para rodar com `node --test`, o que indica que esse caminho (onboarding servidor público + controle financeiro) é tratado como crítico e testado de verdade, diferente de outras partes do código.

---

## 5. Dívida técnica conhecida

- **Bug de autenticação real:** cookie `qz_auth` (usado pelo middleware) e `qz-auth` (usado pelo sistema Usuario/JWT) são nomes diferentes — o sistema de login multi-tenant novo não concede acesso às páginas protegidas (detalhe na seção 3).
- **Rota quebrada:** `/dashboard/whatsapp` chama `PATCH /api/usuario/whatsapp`, que não existe no repositório.
- **Migrations dessincronizadas do schema:** só existe uma migration (`20260627010952_init`) cobrindo 6 dos 14 modelos do `schema.prisma` atual — os modelos do "QuitaZAP Receber" e `LeadVendas`/`Cobranca`/`LogIA` não têm migration versionada.
- **PDF/contracheque pausado de propósito:** funções de extração de PDF (`extrairPDF`, `uploadPDFOpenAI`, `deletePDFOpenAI`, `buildDiagContracheque`) continuam no código mas não são chamadas no fluxo principal — comentário explícito: `"PDF/contracheque pausado no MVP — manter funções para futura versão beta"`.
- **Dependência morta:** `pdf-parse` está em `package.json` mas não é importada em nenhum arquivo `.ts`/`.tsx` de `src/`.
- **Cron sem autenticação garantida:** se `CRON_SECRET` não estiver setado no ambiente, `/api/cron/lembretes`, `/api/cron/cobrador` e `/api/broadcast/cobrador` ficam publicamente acessíveis sem nenhuma checagem (o comportamento fail-open não é sinalizado como intencional no código).
- **Webhook Cakto sem validação forte:** só valida `body.secret === CAKTO_SECRET`, e só se essa env var estiver definida; não há verificação de assinatura HMAC do payload.
- **Login legado sem hash/rate limit:** comparação de senha de admin em texto puro (`senha !== process.env.APP_SENHA`), sem hashing, sem rate limiting, sem CSRF em nenhuma rota de auth.
- **Deduplicação de mensagens em memória:** o `Set` de `messageId`s processados no webhook Z-API vive só na memória do processo (até 500 entradas, LRU simples) — não é confiável em ambiente serverless com múltiplas instâncias/cold starts.
- **Estado financeiro dentro de JSON de conversa:** o fluxo "QuitaZAP Controle" (lançamentos do dia a dia, cartões, faturas) não persiste em tabelas relacionais — tudo vive serializado em `BotSessao.dividasTemp`. Isso é a peça central de dívida técnica mais relevante para a próxima feature, porque qualquer registro de tarefa/pagamento por áudio/texto hoje seguiria o mesmo padrão frágil se reaproveitado sem mudança.
- **Dois links de checkout Cakto divergentes:** um hardcoded em `sales-bot.ts`/`testar-funil`, outro via env var em `/oferta` — sem fonte única de verdade.
- **Dois sistemas de dados paralelos no mesmo schema** (`Cliente`/`Divida`/`BotSessao` legado vs. `Usuario`/`Pendencia`/`ContatoReceber` novo) sem nenhuma ponte entre eles — o bot do WhatsApp e o painel `/dashboard` hoje não conversam com o mesmo conjunto de tabelas.
- Não foram encontrados comentários `TODO`/`FIXME` clássicos no código (`src/`) além dos comentários explícitos de "pausado no MVP" já citados — a maior parte da dívida técnica está documentada em prosa nos próprios comentários, não em marcadores padronizados.

---

## 6. Pontos de extensão pra nova feature (registro de tarefas e pagamentos por áudio/texto via WhatsApp)

- **O webhook `POST /api/webhook/zapi` dá pra reaproveitar como ponto de entrada.** Ele já:
  - Recebe e transcreve áudio via Whisper (`transcreverAudio`) — pronto para reuso direto em "registro por áudio".
  - Tem um interpretador de intenção financeira local-first com fallback em IA (`resolverIntencaoFinanceiraIA`) que já lida com lançamentos em lote, valores em BRL (`parseMoneyBR`), categorização e fluxo de confirmação (prévia → "1 confirma / 2 cancela") — o mesmo padrão de interação poderia ser estendido para "tarefas" e "pagamentos" como novos tipos de intenção, em vez de reconstruir a UX de confirmação do zero.
  - Já resolve sessão por telefone (`BotSessao`) e diferencia cliente cadastrado vs. lead vs. desconhecido.
  - **Porém**, a cascata de `if`s sequenciais já está grande (quase 1900 linhas no arquivo da rota, ~2160 linhas em `controle-financeiro-flow.ts`) e o estado fica dentro do JSON da sessão — adicionar mais um domínio (tarefas/pagamentos) direto nesse arquivo sem extrair uma camada de "intents" mais genérica tende a piorar a manutenibilidade. Do ponto de vista de infraestrutura de recebimento (Z-API, transcrição, roteamento por telefone), **não precisa de infraestrutura nova**; do ponto de vista de modelagem de dados e organização do parsing, **provavelmente vale desenhar tabelas relacionais dedicadas** (ex.: `Tarefa`, ou reaproveitar/expandir `Pendencia` do schema "Receber") em vez de continuar empilhando estado em `BotSessao.dividasTemp`.
- **A tabela de usuários já tem campo pra vincular WhatsApp à conta — mas só no schema novo.** `Usuario.wpInstancia` / `Usuario.wpConectado` / `Usuario.wpTelefone` existem exatamente para isso (Evolution API multi-instância). O schema legado (`Cliente`) só tem `telefone`, que já é usado como a própria chave de identificação do cliente no bot (não há um campo separado "número vinculado" ali, o telefone É o vínculo). Ou seja: **para o fluxo hoje ativo (bot sobre `Cliente`/`BotSessao`), o vínculo já existe implicitamente pelo campo `telefone`**; para o fluxo multi-tenant (`Usuario`), o vínculo existe como campo dedicado mas está com o endpoint de configuração quebrado (ver seção 5).
- Qual dos dois modelos de dados (`Cliente`/legado vs. `Usuario`/Receber) deve ser a base da nova feature de tarefas/pagamentos é uma **decisão de produto, não verificável via código** — os documentos `PLANO_QUITAZAP.md`, `PLANO_V2_QUITAZAP.md` e `docs/CONTEXTO_ATUAL_QUITAZAP_CONTROLE.md` mostram intenção declarada de consolidar em torno do "QuitaZAP Controle" (schema legado) como motor principal por ora, mas isso é uma decisão registrada em documento de planejamento, não algo que o código por si só determina.

---

## Observação final sobre o processo deste levantamento

Este ambiente não tinha um plugin/agente Codex configurado (verificado: não há `.codex/`, configuração ou referência a Codex no repositório ou no ambiente). Por isso, as seções de backend/SQL/segurança/financeiro foram levantadas pelo próprio Claude Code, em modo estritamente leitura, usando sub-agentes de exploração paralelos para cobrir mais código sem perder precisão factual. Nenhum dado foi inventado; todo achado acima está ancorado em arquivo e comportamento de código específicos, citados ao longo do documento.
