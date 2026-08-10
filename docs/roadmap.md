# Roadmap

Dez fases. Cada uma é **entregável e desligável por feature flag** — nenhuma deixa o app num
estado intermediário quebrado, e nenhuma pode regredir o Boletim de Câmera.

> **Reordenado na rodada 2.** A mudança de fundo: **a sala vem antes do sync, e o sync vem antes
> do câmera**. A sala é server-oriented puro e valida auth, permissões e deploy sem tocar em
> sincronização; o sync ganha um consumidor real e pequeno para se provar; e o Boletim de
> Câmera — o módulo maduro, o que não pode regredir — é reconstruído por último, sobre fundação
> já estável. Razões em [plano-arquitetural-v2.md §I](plano-arquitetural-v2.md#i-roadmap).

Legenda: ✅ concluída · ⏳ em andamento · 📋 planejada

---

## ✅ Fase 1 — Arquitetura

Análise, modelagem, documentação e decisões tecnológicas.

- [x] Análise do repositório — [architecture/current-state.md](architecture/current-state.md)
- [x] Arquitetura proposta — [architecture/overview.md](architecture/overview.md)
- [x] Modelo de dados + DDL de referência — [architecture/database.md](architecture/database.md)
- [x] Autenticação, permissões, offline, sincronização, migração
- [x] Riscos e registro de decisões
- [x] **Código:** modelo de domínio compartilhado, puro e sem dependências —
      [`domain/platform/`](../domain/platform)
- [x] **Código:** regras de set (herança, incremento, reset de take) com teste
- [x] **Código:** mapeador `Boletim` v2 → plataforma com teste

**Não alterou nada do aplicativo existente.**

---

## ⏳ Fase 1.5 — Preparação (rodada 2)

Incorporação das decisões de [risks-response.md](risks-response.md). Documentação e ferramental,
uma única mudança de código.

- [x] [plano-arquitetural-v2.md](plano-arquitetural-v2.md) — decisões finais, A–J
- [x] `decisions.md`: ADR-016…ADR-027 + blocos "Revisto em" em ADR-003, 007, 008, 009, 012
- [x] `risks.md`: matriz refeita (R1 e R5 removidos; R2b, R13–R17 acrescentados)
- [x] Fronteira offline em `offline-first.md` e `overview.md`; fotos removidas de toda a doc
- [x] `synchronization.md`: compare-and-set por campo, polling adaptativo, SSE como upgrade
- [x] `local-to-cloud.md`: reescrito como importação opcional
- [x] `utils/id.ts`: fallback sobre `crypto.getRandomValues` (R10)
- [x] `.claude/skills/{banco,sync,modulo,plataforma,testes}` + `CLAUDE.md`

---

## 📋 Fase 2 — Fundação servidor

Neon, Drizzle, migrations, auth, produções, membros, permissões.

- [ ] Projeto Neon + `DATABASE_URL` (com branch de preview)
- [ ] Drizzle: `lib/db/schema/` implementando o DDL de [database.md](architecture/database.md)
- [ ] Primeira migration + trigger de `sync_log` e de `version`
- [ ] Better Auth: cadastro, login, logout, recuperação de senha
- [ ] `lib/auth/guards.ts` — `requireMember`, `requireDepartment`
- [ ] `lib/contracts/` — schemas Zod compartilhados (inclui validação de UUID)
- [ ] `lib/db/queries/` — produções, membros, código de convite (com `import 'server-only'`)
- [ ] Rotas `(public)`: login, cadastro, recuperar senha
- [ ] Deploy na Vercel com as variáveis de ambiente

**Pronta quando:** dois usuários criam conta, um cria produção, o outro entra por código, e as
permissões são aplicadas **no servidor**. O app de câmera continua intacto.

---

## 📋 Fase 3 — Sala (sem offline)

Server-oriented puro. Nenhuma linha de Dexie.

- [ ] `/producoes` — listar, criar, entrar por código
- [ ] Sala da produção: membros, papéis, departamentos
- [ ] Diárias: criar, listar, abrir (CRUD de `ShootingDay`)
- [ ] Dashboard da sala, somente leitura
- [ ] Design system: inventário dos componentes existentes e reuso (ADR-024)

**Pronta quando:** a sala funciona de ponta a ponta contra o servidor, com permissões, e nenhuma
tela precisou de sincronização para existir.

---

## 📋 Fase 4 — Superfície offline + sync

O coração técnico. Consumidor: uma tela mínima de takes, não um módulo completo.

- [ ] Dexie: `lib/offline/db.ts` + repositórios da fronteira
- [ ] Fixação (pin) de diária + `/api/sync/snapshot`
- [ ] Outbox com idempotência, ordem, coalescência e backoff com jitter
- [ ] `/api/sync/push` com **compare-and-set por campo** e `/api/sync/pull` com cursor
- [ ] Ids derivados de chave natural em runtime (ADR-019)
- [ ] Polling adaptativo + indicador de conectividade e pendências
- [ ] Conflitos: `syncConflicts` local + resolução em UI
- [ ] Versão de protocolo + `VERSION`/`APP_SHELL` gerados no build + aviso de atualização
- [ ] Suíte de testes de sync ([synchronization.md §8](architecture/synchronization.md#8-testes-obrigatórios))

**Pronta quando:** dois dispositivos, um deles offline, criam e editam takes e convergem sem
perda; conflito de campo vira pendência resolvível que **não bloqueia** o resto da diária.

---

## 📋 Fase 5 — Câmera na plataforma

A fase mais sensível: migrar o módulo que está em uso. **Migração, não redesenho.**

- [ ] `features/camera/` sobre o modelo compartilhado e a superfície local
- [ ] Paridade **campo a campo** com o editor atual (checklist de
      [features/camera.md §1](features/camera.md#1-o-que-existe-hoje))
- [ ] Novos campos de [features/camera.md §3](features/camera.md#3-organização-dos-campos-10)
- [ ] `TakeStatus` **preservando** o toggle "Aprovado pelo diretor"
- [ ] PDF com a mesma qualidade de saída (comparação lado a lado)
- [ ] Rotas atuais movidas para `/legado`, ainda funcionando sem conta
- [ ] Importação opcional dos boletins locais ([migrations/local-to-cloud.md](migrations/local-to-cloud.md))

**Pronta quando:** um usuário atual faz uma diária inteira no módulo novo sem sentir falta de
nada — e o boletim impresso sai igual ou melhor.

---

## 📋 Fase 6 — Som · 📋 Fase 7 — Continuidade

Independentes entre si; podem correr em paralelo depois da Fase 5.

**Som:** configuração de som da diária · tracks dinâmicas com herança entre takes · status
rápidos e flags (wild, room tone, wild lines, false start) · equipamentos · sound report em PDF
e **CSV**.

**Continuidade:** metadados de cena · setup (tamanho, ângulo, movimento, eyeline) · continuidade
de ação no take · props, figurino, cabelo/maquiagem, cenografia · PDF.
**Sem fotografias** ([ADR-022](decisions.md#adr-022--sem-fotografias-na-v1)).

## 📋 Fase 8 — Integração

- [ ] Câmera ↔ Som, Câmera ↔ Continuidade, Som ↔ Continuidade
- [ ] Visão consolidada da diária
- [ ] Busca global e filtros
- [ ] "O que estamos usando hoje" entre departamentos

## 📋 Fase 9 — Relatórios

- [ ] PDF dos três módulos e consolidado por cena/setup/take
- [ ] CSV (som prioritário, câmera para a pós)
- [ ] Export JSON da diária

## 📋 Fase 10 — Hardening

Contínua **a partir da Fase 4**, não um bloco no fim: teste de sync escrito depois de o sync
existir é teste que nunca é escrito.

- [ ] **Vitest** cobrindo domínio, sync e conflitos
- [ ] **Playwright** incluindo o fluxo offline completo
- [ ] Rate limit, sessões por dispositivo, avaliação de RLS
- [ ] Performance com produção grande (40 diárias, 2000 takes)
- [ ] Auditoria de PWA, acessibilidade e UX mobile

---

## Regras que valem em todas as fases

1. **O Boletim de Câmera não regride** — nem em campo, nem em toques, nem em PDF.
2. **Nada dentro da fronteira offline exige rede para editar**
   ([ADR-016](decisions.md#adr-016--fronteira-offline-explícita)).
3. **Toda fase é desligável** por feature flag em produção.
4. **Design system único** — nenhum módulo novo inventa componente que já existe
   ([ADR-024](decisions.md#adr-024--design-system-único-o-do-boletim-de-câmera)).
5. **Documentação junto com o código**, no mesmo commit.
6. **Uma skill por vez**, respeitando as pré-condições declaradas
   ([ADR-027](decisions.md#adr-027--skills-sobre-subagentes--cinco-não-onze)).
7. **Nada de reescrita.** Cada fase reaproveita o máximo do que já existe.
