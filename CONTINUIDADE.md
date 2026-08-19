# CONTINUIDADE.md

> Documento de continuidade do QuitaZAP Controle.
> Base: `LEVANTAMENTO-QUITAZAP.md` (raio-x read-only de 2026-08-15).
> Escopo confirmado em chat: **só QuitaZAP Controle**. O QuitaZAP Receber (`Usuario`/`Pendencia`/`/dashboard`) é outro projeto/módulo, tratado à parte — nada aqui mexe nele.

---

## Status

**Feature "tarefas e pagamentos por áudio/texto": implementada, testada e auditada.**

- Schema + migration (`Tarefa`), módulo de parsing puro, orquestração com Prisma, integração no webhook, cron de lembretes, e 42 testes de regressão novos (131 no total do projeto) — tudo commitado na branch `claude/quitazap-codebase-audit-d99arm`.
- `tsc --noEmit`, `npm test` e `npm run build` passando limpos.
- Passou por 3 rodadas de auto-revisão de código (skill `code-review`, effort alto) — 9 achados reais encontrados e corrigidos ao longo do processo (detalhe na seção "Auditoria" abaixo). Nenhum achado aberto.

O que **não** está feito: o restante do backlog de dívida técnica do Controle (seção "Backlog do restante do Controle", no final) — não fazia parte do pedido desta etapa, listado aqui pra priorizarmos juntos o que vem a seguir.

---

## 1. Objetivo da feature

Permitir que o usuário do QuitaZAP Controle registre, por **áudio ou texto** no WhatsApp:
- **Tarefas/lembretes** — algo a fazer/lembrar, pontual ou recorrente (ex.: "lembrete: pagar a luz dia 10, R$150", "lembrete: revisar gastos toda segunda").
- **Pagamentos** — confirmação de que algo foi pago (ex.: "pagamento: paguei a luz, R$150"), reconciliando automaticamente com uma `Divida` ativa se o texto casar com o nome de um credor cadastrado.

---

## 2. Escopo confirmado

**Dentro do escopo:** webhook `POST /api/webhook/zapi`, schema legado (`Cliente`/`Divida`/`Pagamento`/`BotSessao`), transcrição de áudio via Whisper já existente.

**Fora do escopo (explicitamente adiado, não tocado):**
- QuitaZAP Receber (`Usuario`, `Pendencia`, `ContatoReceber`, `EnvioBot`, `/dashboard`).
- Leitura automática de PDF de contracheque (continua pausada).
- Bugs pré-existentes fora da área desta feature (ex.: cookie `qz_auth`/`qz-auth` do dashboard Receber, rota `/api/usuario/whatsapp` quebrada) — vivem no sistema Receber, não foram tocados.

---

## 3. Decisões de produto fechadas (respondidas em chat)

| Decisão | Resposta | Onde impacta |
|---|---|---|
| Tarefas recorrentes na v1? | **Sim** | `Tarefa.recorrente`/`frequencia`/`diaMes`/`diaSemana`/`mesAnual` + cron avança pra próxima ocorrência |
| Pagamento confirmado casa automaticamente com `Divida`? | **Sim** | `encontrarDividaCorrespondente()` por nome do credor + `registrarPagamentoDivida()` (cria `Pagamento`, incrementa `valorPago`, marca `QUITADA` se cobrir o total) |
| Tarefa é só financeira ou genérica? | **Só financeira** | Todo item tem `valor`/`vencimento` opcionais, mas o conceito continua dentro do domínio financeiro do Controle |
| Horário do lembrete: fixo ou configurável? | **Configurável por tarefa** | `Tarefa.horarioEnvio` (string "HH:MM", default "08:00"), extraído do texto ("...as 20h") |

---

## 4. O que foi entregue

### Modelo de dados
`model Tarefa` em `prisma/schema.prisma` (migration `prisma/migrations/20260819130406_add_tarefa/`, ainda **não aplicada em nenhum banco** — este ambiente não tem `DATABASE_URL`, então validação foi feita só via `prisma generate`/`tsc`/testes unitários, nunca contra um Postgres real):

```prisma
model Tarefa {
  id             String    @id @default(cuid())
  clienteId      String
  tipo           String    @default("LEMBRETE") // LEMBRETE | PAGAMENTO
  descricao      String
  valor          Float?
  vencimento     DateTime?
  recorrente     Boolean   @default(false)
  frequencia     String?   // MENSAL | SEMANAL | ANUAL
  diaMes         Int?      // 1-31 — usado em MENSAL e ANUAL
  mesAnual       Int?      // 1-12 — usado em ANUAL (guardado à parte do vencimento clampado)
  diaSemana      Int?      // 0-6 — usado em SEMANAL
  horarioEnvio   String    @default("08:00")
  dividaId       String?   // preenchido quando o texto bateu com uma Divida ATIVA
  status         String    @default("PENDENTE") // PENDENTE | CONCLUIDA | CANCELADA
  origem         String    @default("TEXTO")    // TEXTO | AUDIO
  concluidaEm    DateTime?
  ultimoLembrete DateTime?
  criadoEm       DateTime  @default(now())
  atualizadoEm   DateTime  @updatedAt

  cliente Cliente @relation(fields: [clienteId], references: [id], onDelete: Cascade)
  divida  Divida? @relation(fields: [dividaId], references: [id], onDelete: SetNull)
}
```

### Código
- **`src/lib/tarefa-flow.ts`** — lógica pura (sem Prisma): `detectarComandoTarefa`, `extrairTarefa` (parsing de descrição/valor/data/recorrência/horário), `calcularProximaOcorrencia`/`proximaDataDoMes`/`proximaDataDaSemana`/`proximaDataAnual`, `encontrarDividaCorrespondente`, `encontrarTarefaPorTermo`, formatação de mensagens. Segue o padrão já usado em `gasto-flow.ts`/`onboarding-controle.ts` (módulo isolado, sem tocar Prisma).
- **`src/lib/tarefa-service.ts`** — orquestração com Prisma (criar/listar/concluir/cancelar tarefa, reconciliar pagamento com `Divida`, reaproveitando a mesma lógica de `src/app/clientes/[id]/pagamento/novo/page.tsx`).
- **`src/app/api/webhook/zapi/route.ts`** — novo bloco na cascata, logo após o comando RESETAR (comandos com prefixo explícito — `tarefa:`/`lembrete:`/`pagamento:` — e frases exatas como "minhas tarefas" sempre respondem; "concluí"/"cancelar" só interceptam quando encontram uma tarefa pendente correspondente, senão devolvem `null` e a cascata normal continua).
- **`src/app/api/cron/tarefas/route.ts`** — roda de hora em hora (`vercel.json`): avança recorrências vencidas e envia lembrete respeitando o `horarioEnvio` de cada tarefa, com toda a lógica de "é hoje?" ancorada em `America/Sao_Paulo` (não em UTC — ver Auditoria).
- **`src/lib/plano.ts`** — menu de ajuda (`gerarListaComandos`) atualizado com os novos comandos.
- **`tests/regressao-tarefas.test.mjs`** — 42 testes cobrindo parsing, recorrência, cálculo de datas (com fuso), matching e formatação.

### Comandos novos no bot
```
lembrete: pagar a luz dia 10, R$150
lembrete: pagar a luz todo dia 10, R$150     (recorrente mensal)
lembrete: revisar gastos toda segunda        (recorrente semanal)
lembrete: renovar seguro todo ano dia 10/03  (recorrente anual)
pagamento: paguei a luz, R$150               (reconcilia com Divida se achar match)
minhas tarefas
concluí pagar a luz
cancelar pagar a luz
```

---

## 5. Auditoria — achados e correções

Três rodadas de `code-review` (effort alto) sobre o diff. Todos os achados abaixo foram corrigidos e travados com teste; nenhum ficou pendente.

**Rodada 1:**
1. **Colisão de cascata** — "concluí"/"cancelar" são verbos naturais demais; sem cuidado, sequestrariam mensagens comuns do onboarding/negociação de dívida. Corrigido: só interceptam quando encontram uma tarefa pendente de fato correspondente; sem match, devolvem `null` e a cascata normal continua.
2. **Overflow de dia do mês** — "todo dia 31" num mês de 30 dias estourava pro mês seguinte (`new Date` normaliza automaticamente). Corrigido com `construirDataClamped`/`ultimoDiaDoMes`.
3. **Reconciliação automática indevida** — "concluí" (só dispensar o lembrete) estava também gravando `Pagamento`/atualizando `Divida`. Corrigido: reconciliação com dívida só acontece no comando explícito `pagamento:`.
4. **Fuso do cron** — janela "é hoje?" comparava limites de dia em UTC, mas a hora do lembrete (`horarioEnvio`) é em horário de Brasília — lembretes configurados entre 21h-23h nunca disparariam. Corrigido comparando por data já convertida pro fuso (`Intl.DateTimeFormat` com `timeZone: "America/Sao_Paulo"`).

**Rodada 2:**
5. **Bug de fuso na raiz (o mais sério)** — `new Date(ano, mes, dia)` é interpretado no fuso do processo (UTC na Vercel), então "dia 10" virava 10 às 00h UTC = 9 às 21h em Brasília — toda data aparecia e disparava **um dia adiantada**, sempre, não só em horário de borda. Corrigido reescrevendo a construção de datas pra ancorar explicitamente em Brasília via `Date.UTC(..., 3, 0, 0, 0)` (meia-noite de Brasília = 03h UTC, já que o Brasil não tem mais horário de verão desde 2019).
6. **Verbo "terminei" colidia com o comando PAGUEI legado** ("terminei de pagar" já é gatilho de outro fluxo, de confirmação de pagamento de dívida). Corrigido removendo "terminei"/"finalizei" do gatilho de tarefa — só "concluí" (que não existe em nenhum outro lugar do código).
7. **Matching fuzzy fraco demais** — 1 palavra genérica em comum (ex. "pagar") já bastava pra interceptar. Corrigido: exige 2+ palavras significativas em comum (ou a tarefa ter só 1 palavra), e resultado ambíguo (empate ou múltiplos matches diretos) retorna `null` em vez de escolher arbitrariamente.
8. **ANUAL relia no `vencimento` já clampado** — um "29/02" clampado pra 28/02 num ano não bissexto ficaria preso em 28/02 pra sempre, mesmo no próximo ano bissexto. Corrigido guardando `diaMes`+`mesAnual` separado do `vencimento`, e recalculando a partir desses dois.

**Rodada 3:**
9. **Termo curto demais no match direto** — "cancela a" (`termo="a"`) batia como substring de qualquer tarefa que contivesse a letra "a". Corrigido exigindo pelo menos uma palavra com 3+ letras antes de tentar qualquer match.

---

## 6. Limitações conhecidas (não são bugs, são escolhas de escopo pra v1)

- **UX sem prévia de confirmação** — diferente do fluxo de gastos (que tem "1 confirma / 2 cancela"), os comandos `tarefa:`/`lembrete:`/`pagamento:` criam direto, sem passo de confirmação. Decisão pragmática: são prefixos explícitos e deliberados, então o risco de interpretação errada é baixo — mas se quiser o mesmo padrão de prévia, dá pra adicionar depois.
- **Cron hourly pode não rodar de hora em hora no plano Hobby da Vercel** — o plano gratuito da Vercel limita cron jobs a uma execução por dia, independente do `schedule` configurado; o `horarioEnvio` configurável por tarefa só funciona de verdade com plano Pro (ou superior). **Não verificável via código** qual plano está em uso — vale confirmar.
- **Migration não aplicada** — este ambiente não tem acesso a um Postgres real (`DATABASE_URL` não configurada), então a migration nunca rodou contra um banco de verdade. Precisa ser aplicada (`prisma migrate deploy` ou equivalente) antes do deploy.
- **Matching de dívida é só por nome do credor** — não há desambiguação se dois credores tiverem nomes parecidos; nesse caso pega o de maior pontuação de match, sem pedir confirmação ao usuário.

---

## 7. Backlog do restante do Controle (pra priorizarmos juntos)

Da seção "Dívida técnica conhecida" do `LEVANTAMENTO-QUITAZAP.md`, filtrado só pro que é relevante ao Controle (exclui itens específicos do Receber, como o bug de cookie do dashboard):

- **Estado financeiro do dia a dia inteiro dentro de JSON de conversa** (`BotSessao.dividasTemp`) — gastos, despesas fixas e cartões não têm tabela relacional própria; é o maior item de dívida técnica do produto e o que mais limitaria qualquer evolução futura (relatórios estruturados, edição/correção de lançamento, auditoria).
- **Migrations dessincronizadas do schema** — só 7 dos 15 modelos atuais têm migration versionada (o resto do legado nunca foi versionado, incluindo `Cobranca`/`LogIA`/`LeadVendas`). Isso pode causar drift silencioso entre `schema.prisma` e o banco real de produção.
- **Dedupe de mensagens do webhook em memória** — `Set` de até 500 IDs, não sobrevive a cold start nem funciona com múltiplas instâncias serverless.
- **Cron sem autenticação garantida se `CRON_SECRET` não estiver setado** (fail-open) — afeta `/api/cron/lembretes`, `/api/cron/cobrador` e agora também `/api/cron/tarefas`.
- **PDF de contracheque pausado** — código pronto (`extrairPDF` etc.) mas desativado no fluxo principal; decisão de produto sobre reativar ou não.
- **Cascata do webhook muito grande** (`route.ts` já passa de 1900 linhas) — cada feature nova que entra direto na cascata piora a manutenibilidade; vale considerar extrair um roteador de intents mais explícito em algum momento.

Nenhum desses bloqueia a feature de tarefas/pagamentos entregue nesta etapa. Ficam aqui só pra decidirmos juntos o que entra na próxima rodada.

---

## 8. Checklist de deploy (o que só você consegue fazer/confirmar)

Confirmado no repositório: **não existe nenhum passo automático de `prisma migrate deploy` no build** (`package.json` só roda `prisma generate` no `postinstall`, e não há isso em `vercel.json`). Ou seja, aplicar a migration no banco real é sempre manual — nunca acontece sozinho ao fazer deploy na Vercel.

### 1. Aplicar a migration com segurança

O levantamento original já tinha achado que o histórico de migrations está dessincronizado do schema (só 6 das 14 tabelas de então tinham migration versionada — ver seção 7). Isso muito provavelmente significa que `Cobranca`, `LogIA` e `LeadVendas` (e as tabelas do Receber) já existem no banco real, criadas por fora do histórico de migrations (via `prisma db push` ou direto no Supabase). **Isso importa pra migration nova da `Tarefa` também**, mesmo ela sendo uma tabela nova (sem esse risco de conflito) — porque `prisma migrate deploy` roda migrations em ordem, e se o histórico já estiver "torto", o comando pode reclamar de divergência antes mesmo de chegar na migration da `Tarefa`.

Dois caminhos possíveis — escolha o que já bate com o que vocês normalmente fazem:

- **Se o hábito de vocês é `prisma db push`** (parece ser o caso, dado o histórico): pode continuar assim — rode `npx prisma db push` contra o banco de produção depois de revisar o diff que ele mostra antes de confirmar. Simples, mas não deixa a `Tarefa` registrada no histórico de migrations (mesma situação das outras tabelas que já ficaram de fora).
- **Se preferirem manter o histórico de migrations consistente daqui pra frente**: primeiro rodem `npx prisma migrate status` contra o banco real pra ver exatamente o que está "não aplicado" ou "divergente". Se aparecerem tabelas antigas como não-migradas, uma migration "baseline" (`prisma migrate resolve --applied <nome>`) marca o que já existe como aplicado sem tentar recriar — só depois disso `npx prisma migrate deploy` aplicaria a migration nova da `Tarefa` com segurança.

**Não fizemos nenhuma dessas ações neste ambiente** — não há `DATABASE_URL`/`DIRECT_URL` configurada aqui, e mesmo se houvesse, aplicar migration em produção é uma ação que decidimos não tomar sem você por perto pra confirmar.

### 2. Confirmar `CRON_SECRET`

Os 4 endpoints de cron/broadcast agora logam um aviso (`console.warn`) quando `CRON_SECRET` não está definido, sem mudar nenhum comportamento — só pra ficar visível nos logs da Vercel. Verifique em **Project Settings → Environment Variables** se `CRON_SECRET` está configurado; se estiver, a Vercel já injeta o header `Authorization: Bearer <secret>` sozinha nas chamadas de cron dela.

### 3. Confirmar o plano da Vercel

O cron novo (`/api/cron/tarefas`) está registrado pra rodar de hora em hora (`0 * * * *`). No plano **Hobby (gratuito)** da Vercel, cron jobs só executam **uma vez por dia** independente do `schedule` configurado — o horário configurável por tarefa (`horarioEnvio`) só funciona de verdade no plano **Pro** ou superior. Vale confirmar qual plano está ativo antes de anunciar essa funcionalidade pros usuários.

### 4. Smoke test depois do deploy

Depois de aplicar a migration e confirmar os itens acima, testar num número real (ou no `/testar-funil`, se ele cobrir esse fluxo):
```
lembrete: teste dia 10, R$10
minhas tarefas
concluí teste
```

---

## 9. Dashboard do cliente ("Minha Conta") — Fase 0 + Fase 1 mínima

Pedido em chat: o cliente do Controle não tinha nenhuma tela própria pra ver o que registrou pelo WhatsApp (só existia o painel admin, de uso interno, e o painel `/cobrador`, que é só sobre quem deve pro cliente). Direção de produto também mudou: o QuitaZAP deixa de ser "gerador de plano de quitação" e passa a ser **app de controle de entrada/saída** — dívidas, compras, comprovantes, tudo filtrável por mês.

### O que foi construído e já aplicado no banco real

**Schema:**
- `Divida.totalParcelas` (Int?) — quantidade de parcelas, exibido no dashboard.
- `model Cartao` — nome, dia de fechamento, dia de vencimento, por cliente.
- `model Lancamento` — unifica receita, despesa fixa, despesa variável e compra no cartão numa tabela só, com categoria e data (pro filtro por mês) — substitui o que hoje só existe dentro do JSON de `BotSessao.dividasTemp`. **Fase 2 concluída**: o motor de conversa (`controle-financeiro-flow.ts`) agora também devolve os itens já resolvidos em cada ponto de confirmação (`itensParaPersistir`/`cartaoParaPersistir`, sempre opcional — a função continua pura, sem Prisma) e `controle-financeiro-flow.ts`/`route.ts` gravam via novo `src/lib/controle-financeiro-service.ts`, sempre depois de já ter respondido ao usuário (Next.js `after()`) e só de forma aditiva (erro na gravação nova nunca derruba a resposta nem o `dividasTemp`, que continua sendo a fonte de verdade da conversa).
- Migration aplicada direto no banco de produção nesta sessão (com autorização explícita seção por seção), RLS ligado nas tabelas novas.

**Login do cliente ("Minha Conta"), sem senha:**
- Pedido de acesso por WhatsApp — `POST /api/auth-cliente/solicitar` (telefone → cliente existe? manda link por WhatsApp; resposta sempre genérica pra não vazar quais números são cadastrados).
- Link de acesso curto (15 min) → tela de confirmação em `/minha-conta/entrar?token=...` → clique explícito (POST, não GET) → `POST /api/auth-cliente/confirmar` → cookie de sessão `qz_cliente_auth` (30 dias).
- `src/lib/cliente-auth.ts` — HMAC com tipo embutido na assinatura (token de sessão nunca é aceito como token de acesso, e vice-versa); **sem segredo de fallback** — se `NEXTAUTH_SECRET`/`CRON_SECRET` não estiverem configurados, as rotas de login do cliente falham alto e cedo (erro claro, só nessas rotas) em vez de aceitar um segredo previsível. **Precisa confirmar que `NEXTAUTH_SECRET` está configurado na Vercel** — não consegui verificar isso pelas ferramentas disponíveis nesta sessão.
- `middleware.ts` libera `/minha-conta/*` da senha do admin de propósito — a checagem de verdade acontece no layout (`src/app/minha-conta/(protegido)/layout.tsx`), não no middleware, pra não depender de Node `crypto` rodando em Edge Runtime.
- Passou por 2 rodadas de auditoria própria — achados corrigidos: vazamento de tempo de resposta (dava pra descobrir quais telefones são clientes só medindo quanto a resposta demora — corrigido movendo o envio do WhatsApp pra depois da resposta via `after()`), confirmação em GET que preview de link (WhatsApp Web, scanners) poderia disparar sozinha (trocado por confirmação explícita em duas etapas), segredo de fallback previsível (removido), e duas instâncias do mesmo bug de ordem de expulsão de Map que eu já tinha corrigido antes no dedupe do webhook.

**Dashboard (`/minha-conta`):**
- Resumo: renda mensal, saldo devedor total, contagem de tarefas pendentes.
- Dívidas ativas (credor, tipo, parcelas, vencimento, atraso, saldo).
- Tarefas/lembretes pendentes.
- Últimos 10 pagamentos.
- Ainda mostra só resumo/dívidas/tarefas/pagamentos — a tela não tem, por enquanto, uma lista própria de "lançamentos" (despesas/cartões) nem filtro por mês; os dados já estão sendo gravados em `Lancamento`/`Cartao` desde a Fase 2, falta só a tela ler e mostrar isso.

### O que falta

- **Exibir `Lancamento`/`Cartao` no dashboard**: a Fase 2 já grava os dados (ver abaixo), falta a página `/minha-conta` somar/listar isso — despesas fixas/variáveis, compras por cartão, filtro por mês.
- **Fase 3**: comprovante de compra por foto (extrair "compra" de imagem de recibo, hoje `analisarImagem` só reconhece boleto/fatura/contracheque) e reativar a leitura de contracheque pra virar `Divida` automaticamente.
- Confirmar `NEXTAUTH_SECRET` configurado na Vercel (ver acima).
- Fazer deploy da branch pra esse login/dashboard existir de verdade em produção — está tudo só na branch ainda.

### Fase 2 — persistência de gastos/receitas/cartão em Lancamento/Cartao (concluída)

O motor de conversa (`controle-financeiro-flow.ts`) só gravava em `BotSessao.dividasTemp` (JSON) — nada aparecia no dashboard do cliente. Agora, em cada ponto onde o fluxo já decide "confirmado" (gasto rápido sem pedir "sim", confirmação de lote interpretado pela IA, despesa fixa direta ou confirmada, configuração de cartão), a função pura devolve também os itens já resolvidos (`itensParaPersistir`/`cartaoParaPersistir`), e `route.ts` grava isso via `src/lib/controle-financeiro-service.ts` — sempre depois de responder ao usuário (`after()`), sempre com try/catch que só loga (nunca derruba a resposta nem o `dividasTemp`).

Cobre: gasto/receita/despesa avulsa (caminho rápido e caminho IA), despesa fixa (direta, em lista "frase corrida" e confirmada em duas etapas), compra no cartão (com canonização do nome do cartão pelo mesmo catálogo usado no resto do fluxo), configuração de cartão (fechamento/vencimento).

**Limitação aceita, documentada, não é bug**: no caminho da IA (`salvarItensConfirmadosIA`), o item interpretado não carrega uma data própria do gasto (só existe pro caminho rápido, via `gasto-flow.ts`) — o lançamento é gravado com a data/hora da confirmação, não a data em que o gasto realmente aconteceu. Resolver isso direito exigiria adicionar um campo de data ao schema de interpretação da IA (`financeiro-intent-schema.ts`) — fora de escopo por enquanto.
