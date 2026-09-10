# Chat Nativo — Arquitetura e Plano

> Documento de plano, sem código de produto ainda (exceto a Fase 1, aditiva e sem risco ao WhatsApp — ver critério de execução). Escrito em 2026-09-09/10, após o item de analytics de assinante. Decisão original e escopo aprovado por Ibrahim ao longo da conversa — ver [[quitazap-roadmap-fila]] na memória do projeto pra histórico completo da negociação de escopo.

---

## 1. Objetivo

Hoje o QuitaZAP Controle é **só** um bot de WhatsApp. A decisão é adicionar um **segundo canal**: um chat nativo dentro de `/minha-conta` (PWA, sem loja de app), com visual diferenciado, recursos que o WhatsApp não permite (cartão de gasto inline editável, gráfico embutido na própria conversa, busca, simulador de compra) e uma mecânica de hábito diário pra virar rotina do assinante.

**Restrição arquitetural central, pedida pelo Ibrahim:** WhatsApp e chat nativo têm que virar dois **adaptadores** de um mesmo núcleo de processamento — mesma engine de IA, mesma lógica financeira, mesma confirmação, mesma memória. Nunca duas implementações paralelas do "entendimento" de uma mensagem.

---

## 2. Diagnóstico do código atual

Investigação completa em `src/app/api/webhook/zapi/route.ts`, `src/lib/ai-bot.ts`, `src/lib/controle-financeiro-flow.ts` e arquivos irmãos, `prisma/schema.prisma` (model `BotSessao`), e convenções de `/minha-conta`. Resumo dos achados que definem a estratégia:

### 2.1 A lógica de negócio já é canal-agnóstica — boa notícia, muda o escopo do refactor

`controle-financeiro-flow.ts` e todos os arquivos irmãos (`gasto-flow.ts`, `servidor-publico-flow.ts`, `boleto-flow.ts`, `comprovante-foto-flow.ts`, `fatura-cartao-flow.ts`, `tarefa-flow.ts`, `onboarding-controle.ts`) — **zero referência a `telefone` em qualquer um deles.** Operam só sobre `EstadoControleFinanceiro` (objeto em memória) e `Mensagem[]` (histórico abstrato `{role, content}`), retornam `{ resposta, estado, itensParaPersistir?, ... }`. Quem persiste (`*-service.ts`) já recebe `clienteId`, nunca `telefone`.

Isso significa: **o núcleo de decisão financeira não precisa de nenhuma mudança.** O trabalho de extração é outro — ver 2.3.

### 2.2 `ai-bot.ts` não é a engine principal

É o *rescue ladder* — só é chamado quando nenhum resolver determinístico reconhece a mensagem. Sua função pública, `processarMensagemIA(historico, novaMensagem, nomeCliente, clienteId?, gratuito?, telefone?)`, já é reutilizável como está — `telefone` é opcional, só usado pra anexar em `MensagemPendenteRevisao`.

### 2.3 O acoplamento real está em `webhook/zapi/route.ts` (2928 linhas)

O handler `POST` (linhas ~895–2910, ~69% do arquivo) é um if/else de ~40+ ramos de intenção (gasto rápido, consulta de saldo, despesas fixas, fatura de cartão, simulação de parcela, etc.). Cada ramo segue o mesmo padrão repetido: chama um resolver canal-agnóstico → `sendWhatsApp(telefone, resposta)` inline → `prisma.botSessao.updateMany(...)` inline. **~80 pontos de `sendWhatsApp` e um número parecido de updates ao `BotSessao`, um por ramo, nunca centralizados num único passo de "resposta".**

Conclusão prática: o refactor não é "tirar lógica de negócio de dentro de um monólito" (ela já está fora) — é **extrair a orquestração** (qual resolver chamar, o que fazer com o resultado) pra uma função que **retorna** a resposta em vez de **enviar**, deixando `route.ts` e a futura rota do chat nativo como dois adaptadores finos por cima da mesma função.

### 2.4 Sessão (`BotSessao`) pode ser compartilhada entre canais sem mudança de schema

`BotSessao.telefone` é `@unique` e é hoje o único caminho de busca. Mas `Cliente.telefone` já é campo obrigatório — **todo cliente logado em `/minha-conta` já tem telefone cadastrado**, mesmo que nunca tenha usado o WhatsApp. Então dá pra resolver sessão do chat nativo assim, **sem alterar o schema de `BotSessao`**:

```
findFirst({ clienteId })         // reaproveita memória se já existe (de qualquer canal)
  → se não achar: findFirst({ telefone: cliente.telefone })
  → se não achar: create({ telefone: cliente.telefone, clienteId })
```

Isso é uma decisão de produto relevante, não só técnica: **a memória financeira do cliente fica contínua entre WhatsApp e app** — ele pode começar uma conversa no WhatsApp e continuar no chat nativo com o mesmo contexto (renda cadastrada, confirmação pendente, etc.), como um assistente de verdade faria. Vale comunicar isso como diferencial, não só como decisão de engenharia.

Achado colateral (não bloqueia nada, mas vale registrar): `BotSessao.dividasTemp` está sendo usado pra duas coisas diferentes (histórico de conversa + um blob de estado embutido como mensagem `system` prefixada `__CONTROLE_FINANCEIRO__`), sem nenhum cap de tamanho — cresce sem limite a cada turno. Pré-existente, independente desta migração, mas relevante pro custo de token/IA a longo prazo — candidato a item futuro isolado.

### 2.5 Não existe transcript persistido pro Controle — precisa de tabela nova

WhatsApp é sua própria "história" (o cliente rola o próprio app do WhatsApp pra ver o passado); `BotSessao.dividasTemp` é memória de trabalho, não um log pensado pra exibição. Um chat nativo **precisa** de uma tabela append-only por turno pra alimentar o scroll da conversa. O precedente já existe no repo pro funil de vendas: `MensagemLeadVendas` (`{id, leadId, direcao, texto, criadoEm}`, índice `[leadId, criadoEm]`). Vamos replicar esse padrão pro Controle.

### 2.6 Áudio/imagem/PDF já são genéricos

`transcreverAudio(audioUrl)`, `analisarImagem(imageUrl, prompt)`, `extrairPDF(pdfUrl)` — todas recebem URL, devolvem texto, sem nada específico de WhatsApp. O chat nativo só precisa de um fluxo de upload (Supabase Storage, já existe via `supabase-storage.ts`) que produza uma URL pra alimentar as mesmas funções.

### 2.7 Sem infraestrutura de tempo real — e não precisa criar uma

Não há WebSocket/SSE/Supabase Realtime em nenhum lugar do repo. `/minha-conta` já resolve "atualização quase em tempo real" com `AutoRefreshDashboard.tsx`: `router.refresh()` a cada 4s só com a aba visível, pausado durante clique/navegação pra não colidir com a transição do App Router. Reaproveitar o mesmo primitivo (ou uma variante mais leve, fetch direto num endpoint JSON em vez de re-render de página inteira) resolve o chat sem stack nova.

### 2.8 Formatação: pequeno vazamento de WhatsApp na camada de IA

Os resolvers em `src/lib/ia/*` injetam `INSTRUCAO_FORMATACAO_WHATSAPP` (negrito com asterisco simples, itálico com underscore, quebras lideradas por emoji) no prompt do modelo. Duas opções pro chat nativo: (a) renderizar essa mesma sintaxe com um parser leve no cliente (menor esforço), ou (b) criar uma segunda variante de instrução de formatação por canal (mais trabalho, resultado mais nativo). Recomendo (a) pra V1.

### 2.9 Convenções de UI já prontas pra encaixar o chat

`getClienteAtual()`/`getClienteIdDaRequisicao()` cobrem auth sem plumbing novo. `minha-conta.css` já tem primitivos de card/form/botão reutilizáveis. `BottomNav.tsx` tem uma folha "Mais" onde uma nova rota de chat entra de forma aditiva — ou substitui um dos dois slots principais, se o chat virar superfície primária (decisão de produto, não técnica).

---

## 3. Decisão de arquitetura

### 3.1 Núcleo canal-agnóstico

Extrair a orquestração de `webhook/zapi/route.ts` pra uma função nova, ex. `processarMensagemControle()` em `src/lib/controle-orquestrador.ts`:

```ts
async function processarMensagemControle(input: {
  clienteId: string;
  sessao: BotSessao;
  mensagem: string;          // já normalizada (texto puro, ou resultado de transcrição/análise)
  tipoEntrada: "texto" | "audio" | "imagem" | "documento";
}): Promise<{
  resposta: string;
  estadoAtualizado: string;   // novo dividasTemp
  celebrar?: boolean;         // sinaliza payoff de dívida (WhatsApp manda GIF; app pode mandar confete/animação própria)
}>
```

`route.ts` (WhatsApp) e a nova rota do chat (`/api/minha-conta/chat/mensagem`) viram dois adaptadores finos por cima dessa função — cada um cuida só do que é específico do seu canal: parsing do payload de entrada, forma de entregar a resposta (WhatsApp: `sendWhatsApp`; chat: JSON de volta pra UI que já está esperando via fetch), e efeitos colaterais opcionais (GIF só no WhatsApp, por ex.).

### 3.2 Sessão compartilhada entre canais

Sem mudança de schema em `BotSessao` — reaproveitar via `clienteId` primeiro, `telefone` como fallback (ver 2.4).

### 3.3 Nova tabela de transcript

```prisma
model MensagemChat {
  id        String   @id @default(cuid())
  clienteId String
  canal     String   // "WHATSAPP" | "APP" — grava os dois desde o início, mesmo que a Fase 1 só escreva por APP
  direcao   String   // "CLIENTE" | "BOT"
  texto     String
  criadoEm  DateTime @default(now())

  cliente Cliente @relation(fields: [clienteId], references: [id], onDelete: Cascade)

  @@index([clienteId, criadoEm])
}
```

---

## 4. Fases de execução

### Fase 1 — infraestrutura aditiva, zero risco ao WhatsApp ao vivo

**Não toca em `webhook/zapi/route.ts`.** Constrói ao lado:

1. Migration `MensagemChat`.
2. `processarMensagemControle()` cobrindo primeiro os ramos de maior volume/já bem testados (gasto rápido, consulta de saldo/cartões, despesas fixas, fallback pro rescue ladder do `ai-bot.ts` pra tudo que ainda não foi portado). **Não precisa dos ~40 ramos de uma vez** — o rescue ladder já cobre o resto com qualidade menor, mas funcional, enquanto os ramos determinísticos vão sendo portados na Fase 2.
3. Rota `POST /api/minha-conta/chat/mensagem` — resolve `clienteId` via cookie, resolve/cria sessão (3.2), chama `processarMensagemControle()`, grava em `MensagemChat` (cliente e bot), devolve `{resposta}`.
4. UI mínima: página de chat em `/minha-conta/chat` — lista de mensagens (poll a cada alguns segundos, reaproveitando o padrão do `AutoRefreshDashboard`), composer de texto, entrada no `BottomNav`.

**Critério de saída:** um cliente de teste consegue conversar pelo chat nativo (texto) e ver o mesmo tipo de resposta que teria no WhatsApp, sem nenhuma mudança de comportamento no bot do WhatsApp em produção.

### Fase 2 — paridade completa e unificação

- Migrar os ramos restantes do `route.ts` pra chamar `processarMensagemControle()` em vez de duplicar, um de cada vez, com validação a cada ramo migrado (o `route.ts` também passa a logar em `MensagemChat` com `canal: "WHATSAPP"` — memória unificada de verdade).
- Suporte a áudio/imagem/PDF no chat nativo (upload via Supabase Storage → mesmas funções de `openai-client.ts`).
- `route.ts` termina como um adaptador fino — todo o if/else de ramos sai de lá.

### Fase 3 — primeiro pacote de produto (features do chat nativo em si)

Só depois que o chat básico está estável nas Fases 1-2. Ver seção 5.

### Fase 4 — MVP de hábito diário

Ver seção 6.

---

## 5. Primeiro pacote de produto (Fase 3)

- **Cartão de gasto inline editável** — aparece na própria conversa após um lançamento (`itensParaPersistir` já vem estruturado do `controle-financeiro-flow.ts`, é questão de renderizar como componente React em vez de só texto). Editar/dividir/desfazer em 1 toque chama as mesmas rotas de mutação que `/minha-conta/lancamento/[id]/editar` já usa.
- **Gráfico embutido na conversa** — perguntas tipo "quanto gastei com alimentação" já têm resolver determinístico (`consulta-financeira-resolver.ts`); só precisa retornar dado estruturado (não só texto) pra renderizar um `QaTrendChart`/gráfico simples inline em vez de só devolver número em texto.
- **Busca por texto/período/valor no histórico** — consulta direto em `Lancamento` (já tem `categoria`, `valor`, `data`), não depende do chat em si, é uma tela/filtro adicional.
- **Simulador "posso comprar isso?"** — compara valor informado com saldo projetado, contas futuras (`Tarefa`) e limite de cartão (`Cartao.limite`, campo já existe no schema) — lógica nova, mas os dados todos já existem.
- **Metas como cards vivos** — `Meta`/`DepositoMeta` já existem; card mostra progresso, permite aporte de 1 toque direto na conversa.
- **"Simulador de sonho"** — projeção pura em cima de corte de gasto por categoria + valor-alvo informado pelo cliente (ex. entrada de consórcio). **Sem integração real com administradora nenhuma por enquanto** (confirmado com Ibrahim). O card nasce com um **espaço de CTA reservado** (ex. "ver opções de consórcio") — ver 5.1 pra como isso se encaixa com a ideia de indicação genérica.

### 5.1 Mecanismo genérico de "oportunidade de indicação"

Registrado na fila junto com duas ideias de parceria por comissão (consórcio, ligado ao simulador de sonho; contabilidade, pra clientes com renda acima do limite de declaração de IR). Em vez de um componente por parceria, desenhar:

- Uma tabela/config de **regras** (`condição → tipo de card de indicação`), ex.: `{tipo: "CONSORCIO", condicao: "economia_projetada > valorAlvo"}`, `{tipo: "CONTABILIDADE", condicao: "rendaAnual > limiteIR"}`.
- Um **componente de card genérico** taggeado por `tipo`, com CTA reservado (link/parceiro plugável depois, sem redesenho).
- Motor de avaliação roda sobre o estado financeiro já calculado (mesmo `EstadoControleFinanceiro`/dados de `Lancamento`), sem acoplamento a nenhuma parceria específica.

Isso deixa cada parceria nova = 1 regra + 1 variante de card, não um componente do zero.

---

## 6. MVP de hábito diário (Fase 4)

Tom sempre de progresso/controle — **nunca culpa ou punição por ausência** (linha vermelha explícita do Ibrahim, mesma diretriz de tom do `ROTEIRO_BOT.md`).

### 6.1 Regra dura — nunca inventar dado (correção de 2026-09-10, aplica a todo item abaixo)

Sem integração bancária, o QuitaZAP só sabe o que o cliente **registrou manualmente** — nunca sabe o que ele deixou de gastar. Duas consequências não-negociáveis, retroativas a qualquer implementação futura desta fase:

1. **Ausência de lançamento nunca vira "você economizou"/"parabéns".** Não ter um registro de gasto numa categoria não prova que o cliente não gastou — pode só significar que ele parou de registrar. Toda "vitória" ou novidade mostrada tem que vir de uma **mudança verificável nos registros que o cliente de fato fez** (um lançamento novo comparável a um período anterior também registrado, uma meta com aporte de verdade, uma dívida com pagamento confirmado) — nunca de uma inferência sobre o que não está lá. Precisa de uma checagem de "dado suficiente pra comparar" antes de qualquer claim de melhora (mesmo espírito do campo `dadosInsuficientes` que já existe em `SaudeFinanceiraLog`) — sem dado comparável dos dois períodos, não afirma melhora nem piora.
2. **Nunca chamar valor de "protegido"/"guardado" se for só previsto no planejamento.** Um número que sai de uma projeção (ex. "sobra estimada do mês", limite seguro pra gastar hoje) é uma **estimativa futura**, não uma reserva de fato — só vira "guardado" quando existe um `DepositoMeta` real feito pelo cliente. Misturar os dois na linguagem da UI é a mesma família de erro do item 1: apresentar projeção como se fosse fato consumado.
3. **Sem mudança real, mostrar isso explicitamente** — algo como "nenhuma mudança relevante desde sua última visita" em vez de forçar uma novidade artificial só pra ter o que exibir.
4. Toda vitória/novidade exibida deve trazer, ainda que implícito na frase, que está **baseada nos dados que o cliente registrou** — nunca apresentada como se o sistema "soubesse" algo que não foi de fato informado.

### 6.2 Itens do MVP (já com a regra de 6.1 aplicada)

- **"QuitaZAP Hoje"** — briefing curto ao abrir: quanto pode gastar hoje com segurança (reaproveita a mesma lógica de `limite-seguro-resolver.ts` — é uma **estimativa**, nunca apresentar como valor reservado/protegido), próxima conta (`Tarefa` com vencimento próximo), uma vitória (só se houver, ver 6.1), uma pendência pra confirmar. Se nada mudou desde a última visita, dizer isso também.
- **"Desde sua última visita"** — badge só aparece se houve mudança real e verificável nos registros (novo lançamento, parcela paga, aporte em meta) — precisa de um "timestamp da última visita" por cliente, candidato natural: última linha de `MensagemChat` com `direcao: "CLIENTE"`, ou um campo dedicado se isso não for preciso o suficiente.
- **Missão financeira de 1 toque por dia** — resolver uma pendência real (ex. confirmar uma dívida pendente, revisar um gasto sem categoria) — não uma tarefa inventada só pra gerar engajamento.
- **Vitórias detectadas automaticamente** — mesmo motor de detecção de `InsightDetectado`/`deteccao-anomalia.ts` já existente (hoje só detecta anomalia pra cima; adicionar detecção de melhora, ex. "você registrou X% menos gasto com Y essa semana, comparado às últimas N semanas também registradas"). Frase precisa deixar claro que é comparação de **registros**, não de comportamento real — e só dispara com dado suficiente dos dois períodos (ver 6.1.1).

---

## 7. Próxima camada de produto (pós-MVP — Fase 5, registrado em 2026-09-10)

Sem pressa — avaliar só depois que arquitetura + primeiro pacote (Fase 3) + MVP de hábito (Fase 4) estiverem prontos. Três itens priorizados quando chegar a vez:

1. **"Acompanhe isso para mim"** — cliente marca uma simulação/decisão (ex. o card do simulador "posso comprar isso?") pra ser revisitada automaticamente quando os dados dele mudarem, sem precisar perguntar de novo. Precisa de: um registro do que foi marcado (tipo de simulação + parâmetros), um gatilho de reavaliação (rodar de novo quando `Lancamento`/`Divida`/`Meta` relevante mudar — provavelmente um job periódico, não em tempo real) e uma forma de notificar a mudança (ver item 3, push→chat, é o canal natural pra isso).
2. **Radar de parcela terminando** — avisa quando uma parcela cadastrada (`Divida`/`Lancamento` parcelado) chega ao fim, sugerindo redirecionar o valor liberado pra uma meta. Dado já existe (`totalParcelas`, parcelas com status), é questão de detecção + card de sugestão, não infra nova.
3. **Planos pessoais com nome/história** — ex. "Sair do cheque especial", "Viagem" — em vez de só um número abstrato de meta (`Meta.nome` já existe, é mais sobre a apresentação/narrativa desses planos na UI do que schema novo).

### 7.1 Push → chat (confirmado por Ibrahim, sem ambiguidade)

Notificação push do PWA **nunca** abre uma central de mensagens separada — abre direto na mensagem específica dentro do chat nativo, com botões de ação (ex. "Já paguei", "Ver detalhes").

Desenho sugerido:
- Salvar a mensagem em `MensagemChat` **antes** de disparar o push (vinculada ao `clienteId`) — o push carrega o `id` da mensagem + destino, nunca o conteúdo completo (evita duplicar dado e mantém o chat como fonte única da verdade).
- Ao tocar na notificação: deep-link direto pra essa mensagem dentro do chat (preserva o destino mesmo que precise logar antes — redirect pós-login guardando o destino pretendido).
- Marca como lida ao exibir; evita duplicar em reenvio (idempotência por `id` da mensagem, mesmo padrão de dedupe já usado no webhook do WhatsApp via `MensagemProcessada`).
- Mensagem continua disponível no chat **mesmo sem permissão de notificação concedida** — push é só um atalho de entrega, nunca a única forma de ver a mensagem.
- **Importante, não-negociável:** o botão "Já paguei" tem que dar baixa na cobrança/dívida **existente** — nunca criar um lançamento novo. Mesmo cuidado que já existe no fluxo de pagamento do WhatsApp hoje.

---

## 8. IA proativa (Fase 6 — pós-MVP de hábito, registrada em 2026-09-10)

Sem pressa — avaliar só depois do MVP de hábito (Fase 4) estar pronto. Ibrahim quer a IA puxando conversa de verdade no chat, não só respondendo — tipo "Dica do Dia" proativa.

### 8.1 Correção de regra (o ChatGPT corrigiu o exemplo original do Ibrahim — vale como regra geral)

**Trocar um gasto por assumir uma parcela/compromisso NÃO é "economia" — é só trocar de obrigação.** A IA nunca deve apresentar isso como economia nem incentivar dívida automaticamente; só apresenta a possibilidade e pergunta, nunca afirma como ganho. Mesma família de cuidado da regra de dado real da seção 6.1 — não inventar um resultado positivo que não existe de fato.

### 8.2 Cinco tipos de abordagem proativa (base do motor de sugestões)

1. **Descoberta pessoal** — ex. "ainda usa essas 3 assinaturas cadastradas?"
2. **Incentivo ligado a um desejo** — progresso de uma meta que o cliente tem.
3. **Ajuda no aperto** — falta cobrir R$X até a próxima receita prevista, quer revisar?
4. **Reconhecimento real** — parcela quitada, uma obrigação a menos (mesma base de dado verificável da seção 6.1, não inferência).
5. **Retomada combinada** — retomar algo que o cliente pediu pra rever depois (mesmo mecanismo de "Acompanhe isso para mim", seção 7 item 1).

### 8.3 Controles de personalização (o cliente precisa poder ajustar)

- **Estilo da IA**: direto / parceiro / explicativo.
- **Frequência**: diária / semanal / só quando mudar algo importante.
- **"Não sugira isso de novo"** — precisa persistir a preferência (por tipo de sugestão, não só um toggle global).
- **Feedback por sugestão**: `[Foi útil]` / `[Não combina comigo]`, pra calibrar as próximas.

Implica pelo menos duas coisas novas de schema quando essa fase chegar: uma tabela/registro de preferência por cliente (estilo, frequência, tipos silenciados) e um jeito de registrar feedback por sugestão exibida — nenhuma das duas foi desenhada em detalhe ainda, fica pra quando a fase começar de verdade.

### 8.4 Regras técnicas da camada toda (reforça a regra de dado real da seção 6.1)

- **Uma pergunta por vez, nunca despejar relatório.**
- **Nunca inventar sugestão se não há novidade real** — mesma regra de "nenhuma mudança relevante" da seção 6.1.3, aplicada aqui também.
- **Todo cálculo mostrado vem do motor financeiro determinístico** (`controle-financeiro-flow.ts` e irmãos) — a IA só explica/conversa em cima do número, **nunca inventa o número**.

---

## 9. Riscos e itens em aberto

- **Refactor do `route.ts` é o item de maior risco de todo o plano** — é o webhook ao vivo do bot que atende clientes pagantes hoje. A Fase 1 evita esse risco por completo (não toca nele); a Fase 2 precisa de disciplina de migrar ramo a ramo com validação, não big-bang.
- **`dividasTemp` sem cap de tamanho** — achado colateral, não bloqueia este plano, mas vale um item futuro isolado (fora desta fila).
- **Formatação WhatsApp-flavored nos prompts de IA** — decisão de V1 é traduzir no render (opção 5.2.9-a), revisar se ficar ruim na prática.
- **Timestamp de "última visita"** pro badge do hábito diário — decidir na Fase 4 se reaproveita `MensagemChat` ou precisa de campo dedicado.
