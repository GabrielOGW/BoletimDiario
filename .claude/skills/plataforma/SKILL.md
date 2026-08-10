---
name: plataforma
description: Telas fora da fronteira offline do Boletim Audiovisual — autenticação, produções, sala, membros, papéis, permissões, equipamentos e relatórios. Use ao mexer em app/(public), app/(app)/producoes, app/(app)/p/[id] fora da diária, lib/auth ou features/production.
---

# Skill: plataforma

## Responsabilidade

Tudo que fica **fora da fronteira offline**: autenticação, lista de produções, sala, membros,
papéis, departamentos, código de convite, equipamentos e relatórios de produção encerrada.

## Escopo

**Pode alterar:** `app/(public)/**` · `app/(app)/producoes/**` · `app/(app)/p/[productionId]/**`
exceto `diaria/**` · `lib/auth/**` · `features/production/**` · `app/api/auth/**`

**Não deve alterar:** `features/{camera,sound,continuity}/**` · `lib/sync/**` ·
`lib/offline/**` · `lib/db/schema/**` · `domain/platform/**`

## Pré-condições

- Schema e migrations aplicados (skill `banco`).
- Better Auth configurada, para o que depender de sessão.

## A regra número um

> Estas telas são **Next.js comum**: Server Components lendo Drizzle, Server Actions para
> mutação. **Nenhuma delas usa Dexie, outbox ou cursor** — e todas podem exigir rede.

São operações de **preparação**, feitas com sinal e sentado, nunca com a claquete batendo
(ADR-016). Não invente offline aqui: é complexidade sem uso.

## Regras que não se negociam

- **A plataforma exige conta** (ADR-025). O app antigo permanece em `/legado`, sem conta,
  offline. O login precisa de rede uma vez; a sessão persiste e **nunca é reverificada para
  editar**.
- **Autorização acontece no servidor**, sempre. Guarda antes de qualquer leitura — a checagem
  de cliente é só feedback.
- Sala **não é tabela**: é a projeção de uma `Production` (ADR-001). `join_code` e
  `join_enabled` vivem em `productions`.
- **Papel e departamento são coisas separadas** — ver
  [`docs/architecture/permissions.md`](../../../docs/architecture/permissions.md).
- Dashboard da sala é **somente leitura**. A edição acontece dentro do módulo de cada
  departamento; isso evita a pior classe de erro: editar dado de outro departamento por engano
  de toque.
- Nada de senha caseira: hash, rate limit, reset e recuperação são da Better Auth (ADR-004).
- **Mesmo design system do Boletim de Câmera** (ADR-024) — login e sala inclusive.

## Testes obrigatórios

- Dois usuários: um cria produção, o outro entra por código e recebe o papel correto.
- Permissão negada é aplicada **no servidor**, não só escondida na UI.
- Código de convite desabilitado (`join_enabled = false`) recusa entrada.
- `OWNER` não consegue sair sem transferir a propriedade.
- Nenhuma rota privada renderiza sem sessão válida.

## Documentação a atualizar

`docs/architecture/authentication.md` · `docs/architecture/permissions.md` ·
`docs/features/production-room.md` — **no mesmo commit**.

## Critério de conclusão

A sala funciona de ponta a ponta contra o servidor, com permissões aplicadas no servidor, e
nenhuma tela precisou de sincronização para existir.

## Escalar para o agente principal

Qualquer coisa que exija dado do servidor **durante a diária** — isso muda a fronteira offline,
e a fronteira é decisão de arquitetura.
