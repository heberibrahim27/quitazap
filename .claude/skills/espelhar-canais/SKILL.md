---
name: espelhar-canais
description: Checklist "mexeu num canal, confira o outro" para o chat nativo (controle-orquestrador.ts) e o webhook do WhatsApp (api/webhook/zapi/route.ts). Use ao alterar qualquer fluxo de mensagem, comando, consulta ou lançamento.
---

# Espelhar os dois canais

O QuitaZAP tem **duas cascatas de mensagem separadas**: `src/lib/controle-orquestrador.ts` (chat nativo, etapas 1–13) e `src/app/api/webhook/zapi/route.ts` (WhatsApp, ~2900 linhas). Quase todo bug do QA de 04/10/2026 existia nos dois ao mesmo tempo.

## Antes de editar
1. A capacidade já existe no **registro de skills** (`src/lib/agentes/skills`)? Então altere a skill/serviço, não o canal.
2. Se for nova e valer pros dois canais, **crie a skill** e chame via `skillRegistry.run(...)` nos dois. Não copie lógica.
3. O que ainda é cópia (cascata antiga) precisa ser editado **nos dois arquivos**, no mesmo ponto lógico da ordem das etapas.

## Ordem que não pode quebrar (nos dois canais)
feedback de alerta → comandos de tarefa/desfazer → lembrete natural → consulta de fatura → consultas (saldo, Skill Analista, Quita agente) → gerenciamento de despesas fixas/cartão → IA de intenção financeira → escopo.

## Depois de editar
- `npm test` (inclui `tests/regressao-paridade-canais.test.mjs`, que falha se um canal reimplementar skill por fora).
- Rode o mesmo cenário nos dois canais com a skill `qa-quitazap` e compare o **efeito no banco** (`sql`), não o texto.
- Lembre: o webhook precisa de sessão do bot (`BotSessao`); o chat cria sozinho.
