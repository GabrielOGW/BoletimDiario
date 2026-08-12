# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Boletim Diário de Câmera** — an offline-first PWA for creating, editing, and exporting daily camera reports ("boletins") on audiovisual film sets. There is **no backend, no database, no auth, no external API**. All state lives in the browser's LocalStorage; everything (open, edit, PDF, backup) works with no network. The codebase and all UI/comments are in **Portuguese (pt-BR)**.

## Commands

```bash
npm install
npm run dev            # http://localhost:3000 (Service Worker NOT registered in dev)
npm run build
npm run start          # serve the production build — REQUIRED to test PWA/offline
npm run lint           # ESLint (no-explicit-any and no-unused-vars are errors)
npm run format         # Prettier --write
npm run format:check
npm run icons          # regenerate PWA PNG icons from public/icons/icon.svg
npm run check:env      # what the build needs before it starts (runs on prebuild)
npm test               # all five check suites below (280 assertions)
npm run test:migration # a real v1 boletim through v2 normalization (22 assertions)
npm run test:platform  # domain/platform set rules: inheritance, take axes, numbering (70)
npm run test:mapping   # Boletim v2 → platform model, v1→v2→platform end-to-end (87)
npm run test:camera    # camera sheet structure: grouping, print line, take judgment (38)
npm run test:som       # sound report: ordering, MOS, day summary, CSV escaping (63)
npm run test:db        # schema/triggers/enums against the real Neon (28) — needs DATABASE_URL
npm run test:sala      # room rules against the real Neon (27) — needs DATABASE_URL
npm run test:sync      # compare-and-set, idempotency, cursor, registry (45) — needs DATABASE_URL
npm run test:import    # local-boletim import: idempotency, ownership (29) — needs DATABASE_URL
```

There is no unit/e2e test runner. All suites are plain `.mjs` files run directly through Node's experimental TS type-stripping with a custom loader (this is why `features/camera/estrutura.ts` and `features/sound/{estrutura,csv}.ts` — the structures the screen, the printed sheet and the CSV share — are plain modules with type-only imports: they are testable without React or Dexie) (`test/alias-loader.mjs`, which resolves `@/`, extensionless relative imports and `index.ts` folders); ESLint ignores `test/**`. `test:db`, `test:sala`, `test:sync` and `test:import` need a real database and are **not** part of `npm test` — the day the main suite needs a network is the day it stops being run. `test:sala`, `test:sync` and `test:import` also need `--conditions=react-server`, because the query layer imports `server-only`, which fails by design outside the server. Because of type-stripping, code reachable from a test may not use `enum`, `namespace`, or parameter properties, and type-only imports must use `import type`. To test offline behavior: `npm run build && npm run start`, load the app once online, then go airplane mode and reload.

## Architecture

### Single source of truth: the domain model

[types/boletim.ts](types/boletim.ts) defines the entire domain. Everything is JSON-serializable (only strings/booleans/arrays) so it persists to LocalStorage and exports to backup with zero transformation. The hierarchy mirrors real set workflow:

```
Boletim → Producao + camerasCadastradas[] (multicam)
        → Cena → Bloco (letra) → Plano → Take
```

The **Plano** is the primary unit of data entry (technical config, optics, camera reference). The **Take** holds card/clip-sync/operational-note and the key `aprovado` (director-approved) flag.

### Persistence + reactivity ([lib/storage.ts](lib/storage.ts))

The only I/O layer. All functions are SSR-safe (guard on `window`). LocalStorage key is `bdc:boletins:v1` (`STORAGE_KEY` in [lib/constants.ts](lib/constants.ts) — note this key is versioned **separately** from the schema, which is v2). Writes dispatch a `bdc:store-change` CustomEvent; `subscribe()` listens to both that (same tab) and the native `storage` event (other tabs), so all open screens stay in sync.

### Read-time normalization & migration ([lib/normalize.ts](lib/normalize.ts))

**Every read passes through `normalizeBoletim()`** — `loadAll()` maps it over the parsed array. This is a defensive, no-`any` coercion that turns _any_ JSON (partial, v1, or already-v2) into a complete valid `Boletim`. It is **idempotent** and performs the v1→v2 migration: `numeroNome "18 A 1"` → Cena 18 / Bloco A / Plano 1; single `camera` → `camerasCadastradas[]` (and links migrated planos to it); `cartaoRolo` → `Take.cartao`; `observacao` → `notaOperacional`; lunch `"14:00–15:00"` → `almocoInicio/almocoFim`. Because reads always normalize, nothing would break without the migration step — [lib/migrate.ts](lib/migrate.ts) just does a one-time proactive rewrite (gated by the `bdc:migrated:v2` flag) so the stored base is upgraded once instead of re-coerced on every read.

### Editing & auto-save ([hooks/useBoletim.ts](hooks/useBoletim.ts))

Loads one boletim by id and auto-saves with a 500ms debounce, plus an immediate flush on unmount (no lost keystrokes). UI never calls a "save" button — `update(prev => next)` is the only mutation path. [features/boletins/BoletimEditor.tsx](features/boletins/BoletimEditor.tsx) is the orchestrator: it owns all the add/change/remove/duplicate/move handlers and renders the section components.

### Suggestions / autocomplete ([lib/suggestions.ts](lib/suggestions.ts) + [hooks/useSuggestions.ts](hooks/useSuggestions.ts))

All inputs are free text; `<datalist>` presets just accelerate entry. Suggestions = values actually used across prior boletins (collected by walking the whole tree) merged ahead of fixed `PRESETS`. Delivered to deep components via `EditorMetaContext` (also carries the registered cameras) to avoid prop-drilling — read it with `useEditorMeta()`.

### Entity creation/duplication ([lib/factory.ts](lib/factory.ts))

All new entities and all clones come from here. **Duplication regenerates every nested id** (`duplicateCena`/`duplicateBloco`/`duplicatePlano`/`duplicateBoletim`) to avoid id collisions — except camera ids, which are kept so plano→camera links survive.

### Routes ([app/](app/))

`/` list · `/novo` (creates a blank boletim then `router.replace`s to the editor) · `/editar?id=` · `/visualizar?id=` (A4 print/PDF sheet) · `/offline` (SW fallback). The editor/view pages are client components reading `?id=` via `useSearchParams`, wrapped in `<Suspense>`. PDF export is the browser's native print dialog against print CSS in `app/globals.css` — no PDF library.

### PWA ([public/sw.js](public/sw.js))

Hand-written service worker, **registered only in production** ([components/pwa/ServiceWorkerRegister.tsx](components/pwa/ServiceWorkerRegister.tsx)) so it doesn't fight dev hot-reload. Navigations are network-first (falling back to cached `/` or `/offline`); other assets are stale-while-revalidate. [components/AppBootstrap.tsx](components/AppBootstrap.tsx) runs `runMigrations()` then `ensureSeed()` (demo boletim on first visit) on mount. `next.config.mjs` sends `no-cache` headers for `/sw.js`.

## Conventions

- **Path alias:** `@/*` → repo root (e.g. `@/lib/storage`, `@/types/boletim`).
- **TypeScript strict, no `any`** (ESLint error). Strong domain typing throughout.
- **Zero runtime dependencies for the camera app** beyond `next`/`react`/`react-dom` — icons are inline SVG ([components/ui/icons.tsx](components/ui/icons.tsx)), ids via `crypto.randomUUID` ([utils/id.ts](utils/id.ts)), no PDF/state/UI libraries. The platform adds exactly four, each a registered exception: `drizzle-orm` + `@neondatabase/serverless` (ADR-005), `better-auth` (ADR-004), `zod` (contracts) and `dexie` (ADR-003). State stays library-free: `useSyncExternalStore` and `useLiveQuery`.
- **Dark-mode, mobile-first** (built for use on phones in the field); touch targets ≥ 44px, `aria-*` on interactive controls.

### Adding a field to the domain model

Touch these in order, or migration/persistence will silently drop it:

1. [types/boletim.ts](types/boletim.ts) — the interface (+ bump comments if schema-affecting).
2. [lib/factory.ts](lib/factory.ts) — empty value in the `create*`, and copy it in the matching `duplicate*`.
3. [lib/normalize.ts](lib/normalize.ts) — coerce it in the matching `normalize*` (and add a v1→v2 fallback if the old schema stored it differently).
4. [lib/suggestions.ts](lib/suggestions.ts) — only if the field should feed autocomplete (add to `Suggestions`, `FIELDS`, `PRESET_BY_FIELD`, and `collectSuggestions`).
5. Extend [test/migration-check.mjs](test/migration-check.mjs) if it affects migration, then `npm run test:migration`.
6. If the field should survive into the platform model, map it in [domain/platform/from-boletim.ts](domain/platform/from-boletim.ts) and extend [test/platform-mapping-check.mjs](test/platform-mapping-check.mjs).

## In-flight: evolution into a collaborative platform

The project is being evolved from this single-user local PWA into **Boletim Audiovisual** — a
multi-user platform where **Camera, Sound and Continuity share one `Scene → Setup → Take`**,
with Neon Postgres, auth, rooms and sync. Everything described above still runs untouched; the
evolution is strictly additive and phased.

**Read [docs/](docs/) before making architectural changes.** Start with
[docs/plano-arquitetural-v2.md](docs/plano-arquitetural-v2.md) — **the decisions that are
current** — then [docs/architecture/current-state.md](docs/architecture/current-state.md)
(analysis of this codebase) and [docs/roadmap.md](docs/roadmap.md) (phase order).
[docs/decisions.md](docs/decisions.md) records every decision already made — don't re-litigate
one without adding a "Revisto em" block to it. **Where an older document conflicts with the v2
plan, the v2 plan wins.**

### The offline boundary — the single most load-bearing rule

Offline-first is **not** applied to the whole app. The local database is the source of truth
only for the **shooting-day surface**: pinned `ShootingDay`, `Scene`, `Setup`, `Take` and the
three `*TakeData`. Everything else — auth, productions, members, invites, equipment catalog,
reports — is ordinary Next.js reading Drizzle on the server (ADR-016).

Two rules, both checkable in review:

1. **No `fetch` inside the boundary.** Department modules and shooting-day screens know only
   `lib/offline/repos/*`; `lib/sync` is what talks to the server.
2. **No Dexie outside the boundary.** Those screens may require the network.

### The room — outside the boundary (Phase 3, done)

`app/(app)/` + `features/production/` are **ordinary Next.js**: Server Components reading
Drizzle, Server Actions for mutation, no Dexie, no outbox, no cursor. Routes: `/producoes`
(list, create, join by code) and `/p/[productionId]` (dashboard · `membros` · `diarias`).

- Session is required once, in [app/(app)/layout.tsx](<app/(app)/layout.tsx>); membership in
  the room layout. There is **no `middleware.ts`** — Server Components have no private-screen
  flash to prevent.
- `requireMember`/`requireDepartment` answer "is this role high enough?". The **relational**
  rules — ADMIN can't touch the OWNER, promoting to OWNER only via transfer, the OWNER can't
  leave without transferring — live in `lib/db/queries/members.ts` next to the write, and
  return `{ status: 'FORBIDDEN', reason }` instead of throwing.
- Non-member → **404, never 403** (`NotAMemberError`): 403 would confirm the production exists.
- Forms are uncontrolled: `TextField`/`TextAreaField` accept `name`/`defaultValue` and the
  `<form>` owns the value. Keep it that way here; the boletim editor stays controlled.

### The shooting-day surface — inside the boundary (Phase 4, done)

`lib/offline/` (Dexie) + `lib/sync/` (engine) + `app/api/sync/` (protocol). The consumer is
`/p/[id]/diarias/[dayId]/takes` — the **proof of sync**, replaced by the camera module in
Phase 5. Syncs `Scene`, `Setup`, `Take`; the `*TakeData` arrive with their modules, and adding
one is **one line in `SYNC_ENTITIES`**, not a new code path.

- [lib/contracts/sync.ts](lib/contracts/sync.ts) is the shared contract — protocol number,
  entity/field registry, value normalization. Client and server import the _same_ file; two
  copies would drift silently and the symptom would be "this field just doesn't sync".
- Writes go through `lib/offline/repos/diaria.ts`, which puts the local write **and** the
  outbox enqueue in one Dexie transaction. Split them and there is a window where data is
  saved but never syncs.
- Conflict detection is compare-and-set per field with `{de, para}` — never version-based.
  A conflict is one field: it converges to the server, the user's value becomes a pending
  `syncConflict`, and nothing blocks.
- No `fetch` inside the boundary; no Dexie outside it. Both are review-checkable.
- Anything that changes the boundary, the delta format or the protocol number is escalated,
  not decided inside a skill.

### The department modules (Camera, Phase 5 · Sound, Phase 6 — both done)

`features/camera/` (`/p/[id]/diarias/[dayId]/camera`) and `features/sound/`
(`…/som`) are the same shape: pin the day, live-query Dexie, collapsible cards, 500 ms
auto-save with no save button, an A4 sheet overlaid **on the same route** (navigating would
need the network, and the sheet is printed when the location has no signal).

- What the two departments **share** lives outside both: `features/diaria/cenas.ts`
  (`agrupaCenas` — Cena → Bloco is `Scene`, ADR-002), `features/diaria/NovaCena.tsx`,
  `components/ui/DebouncedTextField.tsx` (the auto-save contract) and
  `components/ui/OptionChips.tsx` (one-tap judgment row). Continuity inherits all of it —
  copy any of them into a third module and the same day starts rendering differently per
  department.
- `features/sound/estrutura.ts` is the **single read** of the day: screen, sheet and CSV all
  call `linhasDoRelatorio()`. Three readings would be three truths about one day.
- Sound writes `take.kind` (the shared take, ADR-029) and its own `sound_take_data.status`
  — never `take.status`, which is the camera's per-department judgment (ADR-010).
- Track layout is inherited from the previous take, not stored as a day template
  ([ADR-033](docs/decisions.md)).

### `domain/platform/` — the shared domain model (Phase 1, done)

Pure TypeScript, **no I/O, no React, no Dexie, no Drizzle** — it is the only code that runs in
the browser, in route handlers and in migration scripts at once (ADR-013). The room reads its
enums and `deriveId`; the camera app still doesn't import it.

- [enums.ts](domain/platform/enums.ts) — `Department`, `MemberRole`, `TakeStatus`, … as
  `as const` arrays + union types (never TS `enum`, which type-stripping rejects).
- [types.ts](domain/platform/types.ts) — the entity model; every entity carries the `Audited`
  fields (`createdBy`/`updatedBy`/`deletedAt`/`version`) that sync and auditing need.
- [factory.ts](domain/platform/factory.ts) — creation **plus the set rules**: take
  inheritance, file-name auto-increment, take reset on setup change. These are domain rules,
  not UI handlers, because all three modules need identical behavior.
- [derive-id.ts](domain/platform/derive-id.ts) — deterministic ids, which is what makes the
  data migration re-runnable without duplicating anything.
- [from-boletim.ts](domain/platform/from-boletim.ts) — `Boletim` v2 → platform model, grouping
  boletins into productions. Runs on the output of `normalizeBoletim()`.

Two invariants hold across the whole roadmap: **the camera module never regresses**, and
**nothing may make the network required in order to fill in a shooting day**.

### Skills — scoped work, one at a time

Five skills in `.claude/skills/`, each carrying its own contract (scope, files it may and may
not touch, preconditions, required tests, docs it must update, completion criteria). Load the
one that matches the work instead of re-deriving the rules (ADR-027):

| Skill        | Use it for                                                              |
| ------------ | ----------------------------------------------------------------------- |
| `banco`      | Drizzle schema, migrations, enums, triggers, `lib/db/`                  |
| `sync`       | `lib/sync/`, `lib/offline/`, `app/api/sync/`, `public/sw.js`, conflicts |
| `modulo`     | `features/{camera,sound,continuity}/`, shooting-day screens             |
| `plataforma` | auth, productions, room, members, permissions — outside the boundary    |
| `testes`     | the `.mjs` harness, and the Vitest/Playwright suites from Phase 4 on    |

**This agent stays the architectural authority.** No skill changes `domain/platform/`,
`docs/decisions.md`, the offline boundary, the sync protocol, or a contract between modules on
its own — that is escalated. Respect the declared preconditions: `banco` before `sync`, `sync`
before `modulo`. Don't run two skills over the same files at once.

Documentation is not a skill — it's a rule: **doc and code in the same commit**.

### Design system

The Boletim de Câmera **is** the platform's design system (ADR-024). Sound, Continuity, login,
room and dashboard reuse its components, interaction patterns and visual language — without
exception. Look for the existing component in `components/` before writing a new one.
