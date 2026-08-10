# Análise do estado atual

Levantamento completo do repositório **antes** de qualquer alteração arquitetural.
Base analisada: `main` @ `7071738`, versão `1.0.1`.

---

## 1. Stack e configuração

| Item              | Valor                                                                          |
| ----------------- | ------------------------------------------------------------------------------ |
| Framework         | **Next.js 15.1** (App Router, `reactStrictMode`)                               |
| UI                | **React 19**                                                                   |
| Linguagem         | **TypeScript 5.7**, `strict: true`, `noUnusedLocals`, `noUnusedParameters`     |
| Estilo            | **Tailwind CSS 3.4**, `darkMode: 'class'`, `hoverOnlyWhenSupported`            |
| Lint/format       | ESLint 8 (`next/core-web-vitals` + `next/typescript` + `prettier`), Prettier 3 |
| Alias             | `@/*` → raiz do repositório                                                    |
| Deps de runtime   | **Apenas** `next`, `react`, `react-dom` — zero bibliotecas de terceiros        |
| Backend           | **Nenhum**. Sem API routes, sem banco, sem auth, sem chamada externa           |
| Variáveis de amb. | **Nenhuma** (`.env.example` documenta explicitamente que não há)               |
| Renderização      | Todas as telas relevantes são `'use client'`; SSR só monta a casca             |

Restrições autoimpostas que valem registro (constam no `CLAUDE.md` e no `README.md`):

- **Zero dependências de runtime** — ícones são SVG inline (`components/ui/icons.tsx`),
  IDs vêm de `crypto.randomUUID` (`utils/id.ts`), PDF é a impressão nativa do navegador.
- **Sem `any`** — `@typescript-eslint/no-explicit-any` é erro.
- **pt-BR** em todo o código, comentários e UI.
- **Mobile-first / dark-mode**, alvos de toque ≥ 44px, `aria-*` nos controles.

### Comandos disponíveis

```
npm run dev · build · start · lint · format · format:check · icons · test:migration
```

Não há test runner (Vitest/Jest/Playwright). `test:migration` é o **único** teste: um `.mjs`
executado direto pelo Node com _type-stripping_ experimental e um loader de alias caseiro
(`test/alias-loader.mjs`). ESLint ignora `test/**`.

---

## 2. Modelo de dados atual

Fonte única: [`types/boletim.ts`](../../types/boletim.ts). Tudo é serializável em JSON
(somente `string`, `boolean` e arrays — **nenhum número, nenhuma data nativa**), o que
permite persistir no LocalStorage e exportar backup sem transformação alguma.

```
Boletim
├── schemaVersion: 2
├── producao          { produtora, tituloProjeto, diretor, diretorFotografia, data, diaDiaria }
├── camerasCadastradas[]  { id, nomeId, modelo, operador, foco, claquetista }   ← multicam
├── cenas[]
│   └── Cena          { id, numero }
│       └── blocos[]  Bloco { id, letra }
│           └── planos[]  Plano { id, numero, tipo, cameraId, cameraNome,
│                                 tecnica{9 campos}, optica{lentes,filtros,matteBox},
│                                 observacoes }
│               └── takes[]  Take { id, numero, cartao, clipSync,
│                                   notaOperacional, aprovado }
├── midiaSuporte[]    { id, tipoMidia, numeroCartao, quantidade, responsavel }
├── cenasDoDia        { cenasRealizadas, totalTakes, tomadasAprovadas, continuidade }
├── horarios          { inicio, fim, almocoInicio, almocoFim, almoco(legado),
│                       totalHoras, horaExtra }
├── equipeCamera[]    { id, nome, funcao }
├── observacoesGerais
└── createdAt · updatedAt
```

Observações importantes para a modelagem nova:

- **`ConfiguracoesTecnicas` e `Optica` vivem no `Plano`**, não na cena e não no take. Ou seja:
  o `Plano` já é, na prática, o **setup de câmera** — é ele que carrega lente, T-stop, ISO, fps,
  obturador, WB, LUT, espaço de cor, formato e resolução.
- **`Take` carrega mídia** (`cartao`, `clipSync`) e o único flag de aprovação (`aprovado`).
  Não há um enum de status — aprovado é booleano.
- **`Bloco`** é uma letra que subdivide a cena (`Cena 24` → `Bloco A`, `B`, `C`).
  Na claquete isso se lê como **"24A"**, **"24B"** — ou seja, o par (cena, bloco) é o
  identificador real da cena no set.
- **`camerasCadastradas` + `Plano.cameraId`** já implementam multicam corretamente:
  o vínculo é por id, com `cameraNome` como fallback de texto livre.
- Um `Boletim` = **uma diária**. Não existe entidade "Produção" persistente: os dados de
  produção são repetidos (denormalizados) dentro de cada boletim.

### Onde os dados moram hoje

| Chave LocalStorage | Conteúdo                                             |
| ------------------ | ---------------------------------------------------- |
| `bdc:boletins:v1`  | `Boletim[]` serializado — **toda a base do usuário** |
| `bdc:migrated:v2`  | Flag da migração proativa v1 → v2                    |
| `bdc:seeded:v1`    | Flag do boletim demo semeado no primeiro acesso      |

> A chave é versionada **separadamente** do schema (chave `v1`, schema `v2`) — descasamento
> conhecido e intencional, documentado no `CLAUDE.md`.

Não há IndexedDB. Não há Cache Storage de dados (só de assets, via Service Worker).

---

## 3. Camadas existentes

### 3.1 Persistência — `lib/storage.ts`

Única camada de I/O do app. Todas as funções são seguras para SSR (checam `window`).

```
loadAll()  →  JSON.parse(localStorage) → .map(normalizeBoletim)
persist()  →  localStorage.setItem + dispatchEvent('bdc:store-change')
subscribe(cb) → escuta 'bdc:store-change' (mesma aba) + 'storage' (outras abas)
```

`upsert()` carimba `updatedAt` a cada escrita. `subscribe()` é o mecanismo de reatividade —
todas as telas abertas se atualizam sozinhas.

**Custo estrutural:** cada escrita reserializa **a base inteira** (`loadAll → mutar → persist`).
Com uma produção real de 40 diárias isso vira um gargalo — é O(base) por tecla digitada
(mitigado hoje pelo debounce de 500ms).

### 3.2 Normalização e migração — `lib/normalize.ts`

**Toda leitura passa por `normalizeBoletim()`.** É uma coerção defensiva sem `any` que
transforma _qualquer_ JSON (parcial, v1, ou já v2) num `Boletim` completo e válido, e é
**idempotente**. Faz a migração v1 → v2 em memória:

| v1                              | v2                                          |
| ------------------------------- | ------------------------------------------- |
| `Cena.numeroNome` `"18 A 1"`    | Cena `18` → Bloco `A` → Plano `1`           |
| `Boletim.camera` (única)        | `camerasCadastradas[]` + vínculo nos planos |
| `Cena.cartaoRolo`               | `Take.cartao` (fallback)                    |
| `Take.observacao`               | `Take.notaOperacional`                      |
| `Horarios.almoco "14:00–15:00"` | `almocoInicio` / `almocoFim`                |

`lib/migrate.ts` só faz a reescrita proativa uma vez (flag `bdc:migrated:v2`). Como a leitura
sempre normaliza, **nada quebraria sem essa etapa** — ela apenas evita recoerção a cada leitura.

> Este é o ativo mais valioso do repositório para a evolução: é a prova de que o projeto já
> sabe migrar schema sem perder dado de usuário, e o padrão será reaproveitado.

### 3.3 Edição e auto-save — `hooks/useBoletim.ts`

Carrega um boletim por id, debounce de 500 ms, **flush imediato no unmount**. Não existe
botão "salvar" — `update(prev => next)` é o único caminho de mutação. Estado de salvamento
exposto como `'idle' | 'saving' | 'saved'` (badge no header).

`features/boletins/BoletimEditor.tsx` (285 linhas) é o orquestrador: concentra todos os
handlers de add/change/remove/duplicate/move e renderiza as seções.

### 3.4 Sugestões — `lib/suggestions.ts` + `hooks/useSuggestions.ts`

Todos os inputs são texto livre; os `<datalist>` só aceleram. As sugestões são os valores
**realmente usados** em boletins anteriores (varredura da árvore inteira) mesclados à frente
dos `PRESETS` fixos. Entregues via `EditorMetaContext` (que também carrega as câmeras
cadastradas) para evitar prop-drilling.

### 3.5 Fábrica — `lib/factory.ts`

Todas as entidades novas e todos os clones nascem aqui. A duplicação **regenera todos os ids
aninhados** — exceto ids de câmera, que são preservados para não quebrar `plano.cameraId`.

### 3.6 Automações de set já existentes

| Automação                               | Onde                                                                  |
| --------------------------------------- | --------------------------------------------------------------------- |
| Novo take herda o **cartão** anterior   | `PlanoCard.addTake()`                                                 |
| Novo take **auto-incrementa Clip/Sync** | `utils/sequence.ts` → `incrementSuffix()` (`A005_C009` → `A005_C010`) |
| Número do take = `takes.length + 1`     | `PlanoCard.addTake()`                                                 |
| Total de takes / aprovados calculados   | `utils/boletim-stats.ts` → `computeStats()`                           |
| Plano vazio abre expandido              | `PlanoCard.isEmptyPlano()`                                            |

### 3.7 Relatório / PDF — `features/boletins/BoletimView.tsx`

537 linhas. Renderiza uma **folha A4** em HTML/Tailwind e usa `window.print()` contra o CSS de
impressão em `app/globals.css` (`@page { size: A4; margin: 13mm }`, `break-inside: avoid` por
plano, `thead` repetido, `print-color-adjust: exact`). **Não há biblioteca de PDF.**

Detalhe relevante: `groupPlanos()` agrupa planos consecutivos com a mesma assinatura técnica
(`camera + tipo + tecnica + optica`) para não repetir o setup a cada linha — é lógica de
apresentação que vale reaproveitar nos relatórios de Som e Continuidade.

### 3.8 Backup — `lib/backup.ts`

Exporta/importa o envelope `BackupFile { app, schemaVersion, exportedAt, boletins[] }`.
O import aceita envelope, array cru ou objeto único, sempre passando por `normalizeBoletim`.
Dois modos: `merge` (upsert por id) e `replace`.

### 3.9 PWA — `public/sw.js`

Service Worker escrito à mão, **registrado só em produção**
(`components/pwa/ServiceWorkerRegister.tsx`), para não brigar com o HMR do `next dev`.

- **Navegações:** network-first, com fallback para o cache e depois `/` ou `/offline`.
- **Demais assets:** stale-while-revalidate.
- Precache do app shell (`/`, `/novo`, `/editar`, `/visualizar`, `/offline`, manifest, ícones).
- `next.config.mjs` envia `no-cache` para `/sw.js`.

`components/AppBootstrap.tsx` roda `runMigrations()` e depois `ensureSeed()` na montagem.

### 3.10 Rotas

| Rota              | Tipo          | Função                                                    |
| ----------------- | ------------- | --------------------------------------------------------- |
| `/`               | server→client | Lista de boletins (`BoletimListView`)                     |
| `/novo`           | client        | Cria boletim em branco e `router.replace` para o editor   |
| `/editar?id=`     | client        | Editor (lê `?id=` com `useSearchParams`, em `<Suspense>`) |
| `/visualizar?id=` | client        | Folha A4 para impressão/PDF                               |
| `/offline`        | server        | Fallback do Service Worker                                |

---

## 4. O que pode ser reaproveitado

Classificado por esforço de adaptação.

### Reuso direto (praticamente sem mudança)

| Ativo                                                              | Por quê                                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Todo o `components/ui/*` e `components/layout/*`                   | Design system pronto, acessível, mobile-first, sem dependências        |
| `components/ui/icons.tsx`                                          | 245 linhas de SVG inline; basta acrescentar ícones de som/continuidade |
| `utils/cn.ts`, `utils/id.ts`, `utils/date.ts`, `utils/sequence.ts` | Utilitários puros, agnósticos de domínio                               |
| CSS de impressão A4 (`app/globals.css`)                            | Serve aos três boletins e ao relatório consolidado                     |
| `components/pwa/*`, `hooks/useOnlineStatus`, `useMounted`          | Base do indicador de conectividade exigido no dashboard                |
| Tema Tailwind (`ink`/`surface`/`brand`/`approved`)                 | Identidade visual já validada em set                                   |

### Reuso conceitual (o padrão vale, a implementação muda)

| Ativo                          | Como evolui                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/normalize.ts`             | O padrão "toda leitura normaliza, coerção idempotente sem `any`" vira a defesa do banco local e do payload de sync                              |
| `lib/factory.ts`               | Vira `domain/platform/factory.ts`, agora com herança explícita entre takes                                                                      |
| `lib/suggestions.ts`           | Passa a coletar da produção inteira (não só dos boletins locais) e ganha campos de som/continuidade                                             |
| `hooks/useBoletim.ts`          | O contrato (`update`, debounce, flush no unmount, `saveState`) é mantido; o destino da escrita muda de LocalStorage para o banco local + outbox |
| `lib/storage.ts` `subscribe()` | Substituído pelo `liveQuery` do Dexie, que já é reativo entre abas                                                                              |
| `BoletimView` `groupPlanos()`  | Agrupamento por assinatura técnica serve aos três relatórios                                                                                    |
| `utils/boletim-stats.ts`       | Vira estatística por diária/produção, alimentando o dashboard                                                                                   |

### Preservar como está (compatibilidade)

`lib/backup.ts` e o formato `BackupFile` **devem continuar funcionando**: é a rede de segurança
de quem já usa o app e o caminho de recuperação se a sincronização falhar em set.

---

## 5. O que precisa ser refatorado

| #   | Ponto                                       | Problema                                                                                                                                                       | Direção                                                                                                        |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | **`Boletim` como raiz agregada**            | O documento inteiro é lido, mutado e reescrito por tecla. Não dá para sincronizar em granularidade útil, nem para dois departamentos escreverem ao mesmo tempo | Quebrar em entidades independentes com id próprio (Scene, Setup, Take, …), cada uma sincronizável isoladamente |
| 2   | **Produção denormalizada dentro da diária** | `produtora/diretor/DoP` repetidos em cada boletim; não existe "minhas produções"                                                                               | Entidade `Production` de primeira classe; `ShootingDay` referencia a produção                                  |
| 3   | **LocalStorage como banco**                 | Síncrono, sem índice, sem transação, limite ~5 MB, string única. Não suporta fotos nem fila de sync                                                            | IndexedDB (Dexie) — ver [offline-first.md](offline-first.md)                                                   |
| 4   | **Sem identidade**                          | Nenhum registro sabe quem criou ou alterou                                                                                                                     | `createdBy` / `updatedBy` / `version` / `deletedAt` em toda entidade                                           |
| 5   | **`aprovado: boolean`**                     | Não expressa NG, série, false start, wild, parcial — e mistura "aprovado pelo diretor" com status técnico                                                      | Enum `TakeStatus` compartilhado + status próprio por departamento                                              |
| 6   | **Números como string**                     | `Take.numero: string` impede ordenar, incrementar e comparar corretamente                                                                                      | `takeNumber: number` no modelo novo; `string` só onde o valor é genuinamente livre                             |
| 7   | **Datas como string livre**                 | Sem timezone, sem validação                                                                                                                                    | ISO-8601 UTC nos timestamps de sistema; `YYYY-MM-DD` só na data da diária                                      |
| 8   | **`BoletimEditor` monolítico**              | 285 linhas concentrando todos os handlers de uma árvore de 4 níveis                                                                                            | Handlers descem para hooks por entidade (`useScene`, `useSetup`, `useTake`)                                    |
| 9   | **Zero validação**                          | `normalize` coage, mas não rejeita nada. Sem servidor, isso bastava; com API pública, não                                                                      | Schemas Zod compartilhados no contrato cliente↔servidor                                                        |
| 10  | **Cobertura de teste quase nula**           | 22 asserts de migração; nenhum teste de regra de negócio, sync ou UI                                                                                           | Test runner de verdade (Vitest) + Playwright, ver [roadmap.md](roadmap.md#fase-10)                             |
| 11  | **Precache do SW enumerado à mão**          | `APP_SHELL` fixo não cobre rotas novas nem os chunks do build                                                                                                  | Manter SW próprio, mas gerar o manifesto de precache no build                                                  |
| 12  | **`import` de backup faz `replaceAll`**     | Em modo multiusuário, apagar a base local seria destrutivo                                                                                                     | Import passa a criar produção local nova, nunca sobrescrever                                                   |

### O que é específico de câmera × o que é infraestrutura compartilhada

| Específico de Câmera                                                                 | Infraestrutura compartilhada                                                 |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `ConfiguracoesTecnicas` (ISO, obturador, WB, LUT, espaço de cor, formato, resolução) | Hierarquia **Cena → Setup → Take**                                           |
| `Optica` (lentes, filtros, matte box)                                                | Produção, diária, membros, papéis, departamentos                             |
| `CameraCadastrada`, `Plano.cameraId`                                                 | Persistência local, fila de sync, resolução de conflito                      |
| `Take.cartao`, `Take.clipSync`                                                       | Sugestões/autocomplete, presets                                              |
| `MidiaSuporte`                                                                       | Equipamentos e atribuição por diária                                         |
| Seções e layout do boletim de câmera                                                 | Design system, PWA, impressão A4, backup/exportação, busca e filtros         |
| `PRESETS` de câmera                                                                  | Mecanismo de presets (a estrutura é genérica, os valores é que são do dept.) |

---

## 6. Conclusão da análise

O projeto está **bem construído para o que se propôs** e não precisa de reescrita. As
fronteiras já estão nos lugares certos: existe uma única camada de I/O, uma única fonte de
verdade de tipos, uma normalização defensiva na leitura e uma fábrica central de entidades.
São exatamente os pontos de corte necessários para trocar o motor por baixo.

Três mudanças são estruturais e inevitáveis:

1. **Quebrar o agregado `Boletim`** em entidades sincronizáveis com id próprio — sem isso não
   existe colaboração nem sync incremental.
2. **Trocar LocalStorage por IndexedDB** — sem isso não existem fotos, fila de sync nem volume.
3. **Introduzir identidade e versão** em cada registro — sem isso não existe autoria nem
   detecção de conflito.

Tudo o mais é evolução incremental sobre o que já existe.

O plano completo está em [overview.md](overview.md); a sequência, em [roadmap.md](roadmap.md).
