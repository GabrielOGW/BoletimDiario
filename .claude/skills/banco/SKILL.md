---
name: banco
description: Schema Drizzle, migrations e convenções do Postgres (Neon) da plataforma Boletim Audiovisual. Use ao criar ou alterar tabelas, enums, índices, triggers de sync_log/version, ou ao mexer em lib/db/. Também para dúvidas sobre timezone (date × timestamptz), soft delete, auditoria e chaves naturais.
---

# Skill: banco

## Responsabilidade

O schema do Postgres e tudo que o define: tabelas, enums, índices, constraints, triggers de
`sync_log` e de `version`, migrations do Drizzle e a camada de queries de servidor.

## Escopo

**Pode alterar:** `lib/db/**` · `drizzle/**` (migrations) · `drizzle.config.ts` ·
`lib/contracts/**` (schemas Zod derivados do schema)

**Não deve alterar:** `lib/sync/**` · `lib/offline/**` · `features/**` · `domain/platform/**` ·
`app/**`

## Pré-condições

- A entidade existe em [`domain/platform/types.ts`](../../../domain/platform/types.ts) e em
  [`docs/architecture/database.md`](../../../docs/architecture/database.md). Se não existir, o
  modelo vem primeiro — e alterar `domain/platform/` é decisão do agente principal.

## Regras que não se negociam

Todas as tabelas de domínio (não as da Better Auth):

- **PK `uuid` vinda do cliente.** Onde há chave natural, o id é **derivado** dela — ADR-019.
  O servidor nunca gera id de entidade de domínio.
- `production_id` em **toda** tabela de conteúdo, mesmo quando redundante: é o eixo de toda
  autorização e de todo pull incremental.
- Auditoria: `created_at`, `updated_at`, `created_by`, `updated_by`. **Sem histórico campo a
  campo** — ADR-013 da rodada 2 (§9 do risks-response).
- **Soft delete** (`deleted_at`, `deleted_by`) — ADR-015. Delete físico não sincroniza. Toda
  query filtra `deleted_at is null`.
- `version integer not null default 1`, incrementado a cada UPDATE.
- **`date` para `shooting_days.date`** (dia civil), `timestamptz` para o resto. A data da
  diária **nunca** é convertida para UTC — ela entra na derivação de id, então tratá-la como
  instante duplica diárias.
- `text` sempre, nunca `varchar(n)`: o app é deliberadamente de campo livre.
- Enums nativos do Postgres espelhando `domain/platform/enums.ts`.
- **Chaves naturais únicas** — são elas que fazem a convergência do sync funcionar:
  `unique (production_id, number, block)` · `unique (scene_id, shooting_day_id, code)` ·
  `unique (setup_id, number)` · `unique (take_id, camera_unit_id)`.
- `sync_log` é **só cursor** (`seq bigserial`). Não guarda lista de chaves alteradas — ADR-018.
- **Não existe tabela `photos`** — ADR-022.
- `lib/db/**` carrega `import 'server-only'`. `DATABASE_URL` nunca com prefixo `NEXT_PUBLIC_`.

## Testes obrigatórios

- Migration aplica e reverte num branch de preview do Neon, sem perda.
- Trigger de `sync_log` dispara em insert, update e soft delete de toda tabela de domínio.
- Trigger de `version` incrementa em todo update.
- Chave natural duplicada é rejeitada pelo banco (não só pela aplicação).
- Teste com fuso deslocado: diária gravada em `America/Sao_Paulo` lida em UTC continua no
  mesmo dia civil.

## Documentação a atualizar

`docs/architecture/database.md` — **no mesmo commit**. As migrations do Drizzle são a fonte
executável; o DDL do documento é explicativo e subordinado a elas.

## Critério de conclusão

A migration está aplicada, o documento reflete o schema real, os triggers estão testados e
nenhuma tabela de domínio ficou sem `production_id`, auditoria, soft delete ou `version`.

## Escalar para o agente principal

Mudança em `domain/platform/`, em `docs/decisions.md`, ou qualquer alteração que mude o
contrato entre módulos.
