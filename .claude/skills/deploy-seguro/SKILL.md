---
name: deploy-seguro
description: Passo a passo para publicar no QuitaZAP (push em main = deploy de produção na Vercel) com checagem de divergência, testes, build e verificação do deploy. Use antes de qualquer commit/push.
---

# Deploy seguro

Push em `main` publica em produção (quitazap.com.br) automaticamente. Crons registrados em `vercel.json` passam a rodar junto, e o Sentinela manda WhatsApp a clientes reais.

1. **Divergência:** `git fetch` e `git log HEAD..origin/main`. O Ibrahim roda sessão paralela; se houver commit novo, integre antes.
2. **Verificação:** `npx tsc --noEmit` → `npm test` → `npm run build`. Restaure `git checkout -- next-env.d.ts` depois do build.
3. **Banco:** o Prisma lê todas as colunas do schema. **Mudança de `schema.prisma` só vai ao ar com a coluna/tabela já criada em produção** (migrações são manuais no Supabase `quitazap`) e DDL em produção exige autorização explícita do Ibrahim. Prefira soluções sem schema novo.
4. **Segredos e flags:** nada de chave no commit. Flags de agentes: `AGENTES_DESLIGADOS`, `QUITA_AGENTE_ATIVO`, `SENTINELA_ANOMALIA_ATIVA`.
5. **Commits:** em português, o porquê no corpo, atribuição do assistente no fim. Apague temporários (`_*.mjs`, `_dev.log`) antes do `git add`.
6. **Depois do push:** confira o deploy (Vercel MCP: `list_deployments` → `get_deployment` até `READY`) e `get_runtime_errors` da última hora. Mudou agente ou cron? Abra `/agentes` no admin.
