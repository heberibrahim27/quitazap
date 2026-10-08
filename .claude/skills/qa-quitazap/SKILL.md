---
name: qa-quitazap
description: QA ponta a ponta do QuitaZAP com conta de teste isolada — chat nativo, WhatsApp (webhook com envio simulado), páginas web, crons e limpeza. Use ao validar qualquer mudança em fluxo financeiro, agentes ou crons antes de publicar.
---

# QA do QuitaZAP

O banco local **é o de produção** (Supabase `quitazap`). Por isso o QA só roda com conta `isTeste` criada pelo script e **sempre** limpa no fim. Nunca rode cron sem `?clienteId=` a partir da máquina local: atingiria clientes reais.

## Roteiro

1. Servidor local com WhatsApp simulado (log `[EVO MOCK]`):
   ```bash
   rm -rf .next/dev
   CRON_SECRET=qa-cron ZAPI_WEBHOOK_SECRET=qa-wh WHATSAPP_PROVIDER=evolution EVO_URL= NEXTAUTH_SECRET=qa-local-secret npx next dev -p 3100 > _dev.log 2>&1 &
   ```
   Aguarde ~15s. Se `/api` devolver 404 ou 500 depois de um build, apague `.next/dev` e reinicie.
2. `node .claude/skills/qa-quitazap/qa.mjs setup` cria a conta de teste.
3. Fluxos (sempre os dois canais com o mesmo cenário e compare o EFEITO NO BANCO, não o texto):
   - `chat "gastei 80 no mercado" "desfazer"` · `whats "gastei 80 no mercado" "desfazer"`
   - `sql` lista lançamentos, tarefas e cartões da conta
   - `page /minha-conta/despesas` (use `MSYS_NO_PATHCONV=1` no Git Bash por causa do `/`)
   - `cron sentinela "dryRun=1&agora=2026-10-05T11:30:00Z"` e `cron recorrencias`
4. O webhook do WhatsApp exige sessão do bot: mande uma mensagem pelo `chat` antes do primeiro `whats`.
5. Respostas simuladas do WhatsApp: `grep -a -A6 "EVO MOCK" _dev.log`.
6. **Limpeza obrigatória:** `node .claude/skills/qa-quitazap/qa.mjs limpar`, apagar `_dev.log` e `.qa-sessao.txt`, parar o servidor, `git checkout -- next-env.d.ts`.

## Armadilhas já vistas
- Página de formulário (client component) sem reagir ao clique: chunk de dev velho; recarregue a página.
- `\b` do JS não trata "ã" como letra (use lookahead); `new Date()` no servidor Vercel é UTC (use sempre fuso de Brasília).
- Hora atual pode estar no silêncio do Sentinela (21h–8h): passe `agora=` ISO ao ensaiar.
- `type` no navegador do ChatGPT trava o renderizador, mas o texto entra.
