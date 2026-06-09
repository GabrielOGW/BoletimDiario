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
npm run test:migration # run a real v1 boletim through v2 normalization (22 assertions)
```

There is no unit/e2e test runner — `test:migration` is the only test. It runs the `.mjs` file directly through Node's experimental TS type-stripping with a custom `@/`-alias loader (`test/alias-loader.mjs`); ESLint ignores `test/**`. To test offline behavior: `npm run build && npm run start`, load the app once online, then go airplane mode and reload.

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
**Every read passes through `normalizeBoletim()`** — `loadAll()` maps it over the parsed array. This is a defensive, no-`any` coercion that turns *any* JSON (partial, v1, or already-v2) into a complete valid `Boletim`. It is **idempotent** and performs the v1→v2 migration: `numeroNome "18 A 1"` → Cena 18 / Bloco A / Plano 1; single `camera` → `camerasCadastradas[]` (and links migrated planos to it); `cartaoRolo` → `Take.cartao`; `observacao` → `notaOperacional`; lunch `"14:00–15:00"` → `almocoInicio/almocoFim`. Because reads always normalize, nothing would break without the migration step — [lib/migrate.ts](lib/migrate.ts) just does a one-time proactive rewrite (gated by the `bdc:migrated:v2` flag) so the stored base is upgraded once instead of re-coerced on every read.

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
- **Zero runtime dependencies** beyond `next`/`react`/`react-dom` — icons are inline SVG ([components/ui/icons.tsx](components/ui/icons.tsx)), ids via `crypto.randomUUID` ([utils/id.ts](utils/id.ts)), no PDF/state/UI libraries.
- **Dark-mode, mobile-first** (built for use on phones in the field); touch targets ≥ 44px, `aria-*` on interactive controls.

### Adding a field to the domain model
Touch these in order, or migration/persistence will silently drop it:
1. [types/boletim.ts](types/boletim.ts) — the interface (+ bump comments if schema-affecting).
2. [lib/factory.ts](lib/factory.ts) — empty value in the `create*`, and copy it in the matching `duplicate*`.
3. [lib/normalize.ts](lib/normalize.ts) — coerce it in the matching `normalize*` (and add a v1→v2 fallback if the old schema stored it differently).
4. [lib/suggestions.ts](lib/suggestions.ts) — only if the field should feed autocomplete (add to `Suggestions`, `FIELDS`, `PRESET_BY_FIELD`, and `collectSuggestions`).
5. Extend [test/migration-check.mjs](test/migration-check.mjs) if it affects migration, then `npm run test:migration`.
