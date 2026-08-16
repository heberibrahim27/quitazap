# CONTINUIDADE.md

> Documento de continuidade para a próxima feature do QuitaZAP: **registro de tarefas e pagamentos por áudio/texto via WhatsApp**.
> Base: `LEVANTAMENTO-QUITAZAP.md` (raio-x read-only de 2026-08-15).
> Decisão de escopo confirmada em chat: **a feature entra somente no QuitaZAP Controle** (schema legado `Cliente`/`Divida`/`BotSessao` + webhook Z-API já ativo). O QuitaZAP Receber (`Usuario`/`Pendencia`) fica de fora — módulo futuro separado, sem integração com esta etapa.

---

## 1. Objetivo da feature

Permitir que o usuário do QuitaZAP Controle registre, por **áudio ou texto** no WhatsApp:
- **Tarefas** — algo a fazer/lembrar (ex.: "lembrar de pagar a luz dia 10", "renovar o seguro do carro").
- **Pagamentos** — confirmação de que algo foi pago (ex.: "paguei a fatura do nubank", "quitei o boleto da faculdade").

E que o bot organize isso de forma confiável, avise nos momentos certos, e (quando fizer sentido) conecte com o que já existe em `Divida`/`Parcela` no fluxo de controle financeiro.

---

## 2. Escopo confirmado

**Dentro do escopo:**
- Webhook `POST /api/webhook/zapi` e tudo que já roda sobre `Cliente` / `BotSessao` / `Divida` / `Parcela`.
- Reaproveitamento do padrão de interpretação local-first + IA fallback (`financeiro-intent-resolver.ts`) e do padrão de confirmação (prévia → "1 confirma / 2 cancela").
- Transcrição de áudio via Whisper, já implementada e funcionando (`transcreverAudio`).

**Fora do escopo (explicitamente adiado):**
- QuitaZAP Receber (`Usuario`, `Pendencia`, `ContatoReceber`, `EnvioBot`, `/dashboard`) — módulo futuro, sem qualquer integração nesta etapa.
- Leitura automática de PDF de contracheque — continua pausada como está, a menos que o usuário decida reativar separadamente.
- Correção de bugs não relacionados à feature (ex.: cookie `qz_auth`/`qz-auth`, rota `/api/usuario/whatsapp` quebrada) — esses bugs vivem no sistema Receber/dashboard, que está fora de escopo aqui. Não bloqueiam esta feature e não serão tocados salvo pedido explícito.

---

## 3. O que já existe e será reaproveitado

Do levantamento, estas peças do QuitaZAP Controle já resolvem parte do problema e não precisam ser reconstruídas:

| Peça | Onde | Reaproveitamento |
|---|---|---|
| Recepção de áudio + transcrição Whisper | `transcreverAudio()` em `src/app/api/webhook/zapi/route.ts` | Entrada de voz para tarefas/pagamentos usa o mesmo caminho já usado para lançamentos financeiros. |
| Interpretador de intenção local-first + IA | `src/lib/ia/financeiro-intent-resolver.ts` | Padrão de "tenta regex primeiro, só chama IA se ficar em escopo e vazio" pode ser estendido com novos tipos de intent (`tarefa`, `pagamento`) em vez de recriar do zero. |
| Fluxo de confirmação (prévia + 1/2) | `criarEstadoComConfirmacaoInterpretacaoFinanceira`, `formatarPreviaIntentFinanceiro` (`controle-financeiro-flow.ts` / `financeiro-intent-resolver.ts`) | Mesma UX de "aqui está o que entendi, confirma?" pode ser reaproveitada para tarefas/pagamentos. |
| Resolução de sessão por telefone | `BotSessao` (única por `telefone`) | Continua sendo o ponto de entrada de identidade do usuário no bot. |
| Categorização por palavra-chave | `src/lib/gasto-flow.ts` | Mesmo princípio pode inspirar uma categorização simples de tarefas, se fizer sentido no produto. |
| Comandos rápidos existentes | `detectarComando()` no webhook | Já existe um padrão pronto de detecção de comando por regex (`RESUMO_MES`, `PAGUEI`, etc.) — novos comandos como "minhas tarefas" ou "concluí X" entram no mesmo padrão. |
| Suíte de regressão | `tests/regressao-servidor-publico.test.mjs` (~89 casos) | Mostra que esse fluxo é tratado como crítico e testado de verdade — a nova feature deveria seguir o mesmo padrão de cobertura, não ficar sem teste. |

---

## 4. Lacunas que afetam diretamente esta feature

Do levantamento, os pontos de dívida técnica com impacto direto no desenho desta feature:

1. **Não existe tabela relacional para lançamentos do dia a dia hoje.** Tudo do fluxo "Controle" (gastos, despesas fixas, cartões) vive serializado dentro de `BotSessao.dividasTemp` (um JSON de histórico de conversa). Se "tarefas" e "pagamentos" seguirem esse mesmo padrão, ficam frágeis (sem índice, sem consulta estruturada, sem cron de lembrete confiável) — **recomendação: criar tabela(s) relacionais dedicadas desde já**, em vez de estender o JSON.
2. **A cascata de `if`s no webhook já está grande** (~1900 linhas em `route.ts`, ~2160 em `controle-financeiro-flow.ts`). Adicionar mais um domínio direto nessa cascata sem uma camada de roteamento de intents mais explícita tende a piorar a manutenibilidade — vale pelo menos isolar a lógica nova em módulo(s) próprio(s) (`tarefa-flow.ts`, por exemplo), no padrão já usado por `gasto-flow.ts`.
3. **Dedupe de mensagens em memória** (`Set` de até 500 `messageId`s, não sobrevive a cold start/múltiplas instâncias serverless). Não é um problema novo desta feature, mas registrar pagamento por áudio duplicado (ex.: reentrega de webhook) tem custo maior que um lançamento comum — vale considerar dedupe mais robusto (ex.: unique constraint no banco) se a feature for sensível a duplicidade.
4. **Não há hoje nenhum cron de lembrete de tarefa** — os crons existentes (`/api/cron/lembretes`, `/api/cron/cobrador`) são específicos de `Pendencia` (Receber, fora de escopo) e `Divida`/`Cobranca`. Um lembrete de tarefa (“lembrar de pagar a luz dia 10”) precisa de um novo cron ou de extensão de um existente.
5. **Cron sem autenticação garantida se `CRON_SECRET` não estiver setado** — se o novo cron de tarefas seguir o mesmo padrão dos crons atuais, herda esse comportamento fail-open. Vale decidir se este é o momento de também endurecer isso, ou se fica para depois.

---

## 5. Proposta de modelo de dados (para validação, não implementado)

Sugestão de uma tabela nova, no mesmo espírito do schema legado (`Cliente`-cêntrico), para não misturar com o schema Receber:

```prisma
// Tarefa/pagamento registrado via WhatsApp (QuitaZAP Controle)
model Tarefa {
  id           String    @id @default(cuid())
  clienteId    String
  tipo         String    // LEMBRETE | PAGAMENTO
  descricao    String
  valor        Float?    // preenchido quando tipo = PAGAMENTO ou quando a tarefa tem valor associado
  vencimento   DateTime? // data-alvo do lembrete/pagamento, se houver
  status       String    @default("PENDENTE") // PENDENTE | CONCLUIDA | CANCELADA
  origem       String    @default("TEXTO")    // TEXTO | AUDIO
  dividaId     String?   // vínculo opcional com Divida/Parcela existente, se o pagamento quitar algo já rastreado
  concluidaEm  DateTime?
  criadoEm     DateTime  @default(now())
  atualizadoEm DateTime  @updatedAt

  cliente Cliente @relation(fields: [clienteId], references: [id], onDelete: Cascade)
  divida  Divida? @relation(fields: [dividaId], references: [id], onDelete: SetNull)
}
```

Pontos que **precisam de decisão de produto antes de fechar o schema** (não são verificáveis por código, e mudam o desenho):

- Tarefas recorrentes existem (ex.: "lembrar de pagar a luz todo dia 10") ou toda tarefa é pontual?
- Quando o usuário diz "paguei a luz", isso deveria automaticamente marcar uma `Parcela`/`Divida` existente como paga (se houver uma correspondente), ou "pagamento" aqui é um conceito solto, sem tentar casar com dívidas já cadastradas?
- Tarefas são só financeiras (lembrete de pagar algo) ou genéricas (qualquer lembrete, tipo "ligar pro médico")? Isso muda se o campo `valor` é opcional de verdade ou se na prática a feature é 100% financeira.
- Quem recebe o lembrete e em que horário — mesmo horário fixo dos crons atuais (11h/12h UTC) ou configurável por tarefa?

---

## 6. Proposta de fluxo no webhook (alto nível)

1. **Entrada** (texto ou áudio transcrito) chega no webhook, já normalizada — reaproveita 100% o que existe hoje (nenhuma mudança na captação).
2. **Novo passo de detecção de intent** antes/ao lado do `resolverIntencaoFinanceiraIA` atual: reconhecer se a mensagem é uma tarefa/lembrete ou uma confirmação de pagamento, usando o mesmo padrão local-first + fallback IA.
3. **Prévia + confirmação** no mesmo formato já usado (`1 confirma / 2 cancela`), guardando o item pendente do mesmo jeito que hoje (estado serializado na sessão até a confirmação — igual ao padrão atual de lançamentos).
4. **Persistência** na tabela `Tarefa` (proposta acima) na confirmação — não mais só no JSON da sessão.
5. **Comandos de consulta**: "minhas tarefas", "o que falta pagar", "concluí [tarefa]" — no mesmo padrão de `detectarComando()`.
6. **Lembrete automático**: novo cron (`/api/cron/tarefas`, por exemplo) rodando diariamente, no mesmo padrão de autenticação dos crons existentes, avisando tarefas com vencimento próximo.

---

## 7. Plano de implementação sugerido (fases)

1. **Fechar decisões de produto** da seção 5 (recorrência, vínculo com dívida, escopo financeiro vs. genérico, horário de lembrete).
2. **Schema + migration** da tabela `Tarefa` (migration versionada de verdade, diferente do que aconteceu com o restante do schema — ver achado de migrations dessincronizadas no levantamento).
3. **Módulo de interpretação** (`tarefa-flow.ts` ou extensão do intent resolver) com parsing local-first + fallback IA, seguindo o padrão de `financeiro-intent-resolver.ts`.
4. **Integração no webhook**: novo bloco na cascata do `route.ts`, isolado em módulo próprio (não espalhado inline).
5. **Comandos de consulta e conclusão de tarefa.**
6. **Cron de lembrete** de tarefas (novo endpoint + entrada em `vercel.json`).
7. **Testes de regressão** cobrindo os casos principais (registro por texto, por áudio, confirmação, cancelamento, consulta, conclusão, lembrete), no padrão de `tests/regressao-servidor-publico.test.mjs`.

---

## 8. Decisões de produto pendentes (bloqueiam o desenho fino, não o início do trabalho)

- Tarefas recorrentes: sim ou não nesta primeira versão?
- Pagamento confirmado casa automaticamente com `Divida`/`Parcela` existente, ou é um registro independente?
- Tarefa é conceito só financeiro ou genérico?
- Horário/regra de lembrete (fixo como os crons atuais, ou configurável)?
- Nome de tabela/domínio: mantém `Tarefa` genérico cobrindo os dois tipos (`LEMBRETE`/`PAGAMENTO`), ou vale separar em duas tabelas desde já?

Essas decisões não impedem começar (schema pode ser ajustado antes da migration final), mas o ideal é fechá-las antes de escrever o parsing de intenção, porque mudam a estrutura dos dados capturados.
