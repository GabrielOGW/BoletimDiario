# Roadmap

Dez fases. Cada uma é **entregável e desligável por feature flag** — nenhuma deixa o app num
estado intermediário quebrado, e nenhuma pode regredir o Boletim de Câmera.

Legenda: ✅ concluída · ⏳ próxima · 📋 planejada

---

## ✅ Fase 1 — Arquitetura

Análise, modelagem, documentação e decisões tecnológicas.

**Entregue:**

- [x] Análise completa do repositório — [architecture/current-state.md](architecture/current-state.md)
- [x] Arquitetura proposta — [architecture/overview.md](architecture/overview.md)
- [x] Modelo de dados + DDL de referência — [architecture/database.md](architecture/database.md)
- [x] Decisão de autenticação — [architecture/authentication.md](architecture/authentication.md)
- [x] Permissões (papel × departamento) — [architecture/permissions.md](architecture/permissions.md)
- [x] Estratégia offline-first — [architecture/offline-first.md](architecture/offline-first.md)
- [x] Estratégia de sincronização — [architecture/synchronization.md](architecture/synchronization.md)
- [x] Plano de migração — [migrations/local-to-cloud.md](migrations/local-to-cloud.md)
- [x] Riscos técnicos — [risks.md](risks.md)
- [x] Registro de decisões — [decisions.md](decisions.md)
- [x] **Código:** modelo de domínio compartilhado, puro e sem dependências —
      [`domain/platform/`](../domain/platform)
- [x] **Código:** regras de set (herança, incremento, reset de take) com teste
- [x] **Código:** mapeador `Boletim` v2 → plataforma com teste (`npm run test:platform`)

**Não alterou nada do aplicativo existente.**

---

## ⏳ Fase 2 — Backend

Neon, Drizzle, migrations, usuários, produção, membros, permissões.

- [ ] Projeto Neon + `DATABASE_URL` (com branch de preview)
- [ ] Drizzle: `lib/db/schema/` implementando o DDL de [database.md](architecture/database.md)
- [ ] Primeira migration + trigger de `sync_log` e de `version`
- [ ] Better Auth: cadastro, login, logout, recuperação de senha
- [ ] `lib/auth/guards.ts` — `requireMember`, `requireDepartment`
- [ ] `lib/contracts/` — schemas Zod compartilhados
- [ ] `lib/db/queries/` — produções, membros, código de convite (com `import 'server-only'`)
- [ ] Rotas `(public)`: login, cadastro, recuperar senha
- [ ] Deploy na Vercel com as variáveis de ambiente

**Pronta quando:** dois usuários criam conta, um cria produção, o outro entra por código, e as
permissões são aplicadas **no servidor**. O app de câmera continua intacto.

---

## 📋 Fase 3 — Offline

Banco local, fila de sync, migração do armazenamento atual, sincronização básica.

- [ ] Dexie: `lib/offline/db.ts` + repositórios
- [ ] Outbox (§18) com idempotência, ordem e backoff
- [ ] `/api/sync/push` e `/api/sync/pull` com cursor
- [ ] Migração LocalStorage → Dexie ([local-to-cloud.md](migrations/local-to-cloud.md) etapas 0–4)
- [ ] Indicador de conectividade e de pendências
- [ ] Testes de offline → reabrir → sincronizar

**Pronta quando:** criar dado offline, fechar o PWA, reabrir, voltar a rede e ver o dado
aparecer em outro dispositivo.

---

## 📋 Fase 4 — Sala colaborativa

- [ ] `/producoes`, criar produção, entrar por código
- [ ] Membros, papéis, departamentos
- [ ] Dashboard da sala (§24) com estado de sync
- [ ] Presença (membros online)
- [ ] SSE + fallback para polling

---

## 📋 Fase 5 — Câmera na plataforma

A fase mais sensível: migrar o módulo que já está em produção.

- [ ] `features/camera/` sobre o modelo compartilhado
- [ ] Paridade **campo a campo** com o editor atual (checklist de
      [features/camera.md §1](features/camera.md#1-o-que-existe-hoje))
- [ ] Novos campos de [features/camera.md §3](features/camera.md#3-organização-dos-campos-10)
- [ ] `TakeStatus` **preservando** o toggle "Aprovado pelo diretor"
- [ ] Relatório PDF com a mesma qualidade de saída
- [ ] Rotas legadas movidas para `/legado`, ainda funcionando

**Pronta quando:** um usuário atual faz uma diária inteira no módulo novo sem sentir falta de
nada — e o boletim impresso sai igual ou melhor.

---

## 📋 Fase 6 — Som

- [ ] Configuração de som da diária
- [ ] Tracks dinâmicas com herança entre takes
- [ ] Take com status rápidos e flags (wild, room tone, wild lines, false start)
- [ ] Equipamentos de som
- [ ] Sound report em PDF e **CSV**

## 📋 Fase 7 — Continuidade

- [ ] Metadados de cena (página, story day, INT/EXT, personagens)
- [ ] Setup de continuidade (tamanho, ângulo, movimento, eyeline)
- [ ] Take: continuidade de ação
- [ ] Props, figurino, cabelo/maquiagem, cenografia
- [ ] **Fotografias offline** com upload diferido
- [ ] Relatório em PDF

## 📋 Fase 8 — Integração

- [ ] Câmera ↔ Som (§33), Câmera ↔ Continuidade (§34), Som ↔ Continuidade
- [ ] Visão consolidada da diária
- [ ] Busca global (§35) e filtros (§36)
- [ ] "O que estamos usando hoje" entre departamentos (§23)

## 📋 Fase 9 — Relatórios

- [ ] PDF dos três módulos
- [ ] CSV (som prioritário, câmera para a pós)
- [ ] Relatório consolidado por cena/setup/take
- [ ] Export JSON e ZIP da diária (§26)

## 📋 Fase 10 — Hardening

- [ ] **Vitest** + cobertura de domínio, sync e conflitos
- [ ] **Playwright** com o E2E do §39, incluindo o fluxo offline
- [ ] Resolução de conflito em UI, com testes
- [ ] Rate limit, sessões por dispositivo, avaliação de RLS
- [ ] Performance com produção grande (40 diárias, 2000 takes, 500 fotos)
- [ ] Auditoria de PWA, acessibilidade e UX mobile

---

## Regras que valem em todas as fases

1. **O Boletim de Câmera não regride.** Nenhuma fase pode remover funcionalidade existente.
2. **Offline-first não é negociável.** Nenhuma fase pode tornar a rede necessária para editar.
3. **Toda fase é desligável** por feature flag em produção.
4. **Documentação junto com o código**, não depois. Se o comportamento divergir do documento,
   os dois são corrigidos no mesmo commit.
5. **Nada de reescrita.** Cada fase reaproveita o máximo do que já existe.

## Sequenciamento

Fases 6 e 7 (Som e Continuidade) são **independentes entre si** e podem correr em paralelo
depois da Fase 5 — dependem apenas do `Take` compartilhado estar estável. Fases 8 e 9
dependem de ambas. A Fase 10 é contínua a partir da Fase 3, não um bloco no fim: teste de
sync escrito depois de o sync existir é teste que nunca é escrito.
