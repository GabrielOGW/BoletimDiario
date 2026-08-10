# Plano arquitetural v2 — decisões finais

Resposta ao [risks-response.md](risks-response.md). Este documento é o **critério de aceite do
§28**: A decisões finais · B decisões rejeitadas · C arquitetura · D banco · E sync · F
conflitos · G offline · H skills · I roadmap · J riscos.

> **Precedência:** onde este documento conflitar com
> [architecture/](architecture/), [roadmap.md](roadmap.md), [risks.md](risks.md) ou
> [decisions.md](decisions.md), **ele vence** — e os outros são corrigidos na etapa de
> atualização documental (ver [§I.0](#0-preparação--o-que-muda-antes-de-qualquer-código)).
> Nada foi implementado. Nenhum arquivo de aplicação foi tocado.

---

# A. Decisões finais

| #     | Decisão                                                                                | Substitui                     |
| ----- | -------------------------------------------------------------------------------------- | ----------------------------- |
| D-01  | **Fronteira offline explícita** — local é fonte de verdade só da _superfície de diária_ | offline-first absoluto        |
| D-02  | **Opção B** (local + Sync Layer), restrita a essa superfície                            | —                             |
| D-03  | **Conflito por _compare-and-set_ de campo** (`{de, para}`), sem histórico de chaves     | ADR-007 (consequência)        |
| D-04  | **Ids determinísticos por chave natural** em Scene/Setup/Take                            | ADR-012 (complementa)         |
| D-05  | **Convergência para o servidor + pendência explícita** no conflito                       | risks.md §R4 ("meu continua") |
| D-06  | **Polling adaptativo. Sem SSE na v1**                                                    | ADR-009                       |
| D-07  | **Sem fotografias** em nenhuma camada                                                    | offline-first.md §3           |
| D-08  | **Migração vira importação opcional**                                                    | migrations/local-to-cloud.md  |
| D-09  | **Design system único**, o do Boletim de Câmera, obrigatório para todo módulo novo       | —                             |
| D-10  | **Conta obrigatória na plataforma**; app atual preservado sem conta em `/legado`         | overview.md §8.2 (modo LOCAL) |
| D-11  | `date` para diária, `timestamptz` para auditoria                                         | confirma R9                   |
| D-12  | **Três versões encadeadas**: app → schema local → protocolo de sync                      | —                             |
| D-13  | **Auditoria mínima**: `createdBy/At`, `updatedBy/At`, `sync_log`                          | confirma §9                   |
| D-14  | **Skills (Opção B), cinco**, com agente principal como autoridade arquitetural            | —                             |

## D-01 · A fronteira offline

O erro que a versão anterior cometeu não foi escolher offline-first: foi aplicá-lo ao
**aplicativo inteiro**. Espelhar produções, membros, permissões, catálogo e relatórios no
Dexie é o que fazia a arquitetura custar caro.

A pergunta certa não é "o app funciona offline?", é **"o que precisa funcionar offline?"**. A
resposta é uma só coisa: **preencher a diária**. Login, criar produção, entrar por código,
gerenciar membros e ler relatório de produção encerrada são operações de **preparação**, que
acontecem com sinal, sentado, antes ou depois — nunca com a claquete batendo.

Daí a fronteira:

```
┌─ SUPERFÍCIE DE DIÁRIA ────────────────┐   ┌─ RESTO DA PLATAFORMA ──────────┐
│ fonte de verdade: BANCO LOCAL          │   │ fonte de verdade: SERVIDOR      │
│                                        │   │                                 │
│ ShootingDay (fixadas)                  │   │ auth / sessão                   │
│ Scene · Setup · Take                   │   │ Production · membros · papéis   │
│ CameraTakeData                         │   │ criar produção · entrar por     │
│ SoundTakeData · SoundTakeTrack         │   │   código · convites             │
│ ContinuityTakeData (+ props, figurino, │   │ catálogo de equipamento (edição)│
│   cabelo/maquiagem, cenografia)        │   │ relatórios de diárias fechadas  │
│ CameraUnit da produção  (leitura)      │   │ busca global                    │
│ catálogo de equipamento (leitura)      │   │ configurações                   │
│                                        │   │                                 │
│ escreve offline · outbox · sync        │   │ fetch normal · exige rede       │
└────────────────────────────────────────┘   └─────────────────────────────────┘
```

Consequências práticas, e são grandes:

- O Dexie tem **~9 tabelas de domínio**, não ~20. O schema local, o pull, o snapshot e a
  resolução de conflito encolhem na mesma proporção.
- Telas fora da fronteira são Next.js comum — Server Components lendo Drizzle. Sem outbox, sem
  cursor, sem `_dirty`, sem merge. **A maior parte da plataforma volta a ser um CRUD.**
- A regra de revisão fica objetiva e verificável: **`fetch` é proibido dentro dos módulos de
  departamento**; lá dentro só existem repositórios locais. Fora deles, `fetch` é normal.

O que essa fronteira introduz de risco novo — chegar na locação sem sinal e sem a diária
carregada — está tratado em [§G.3](#3-fixação-pin-da-diária) e é o risco **R2b** da matriz.

## D-02 · Opção B, não Opção A

| Critério                | A — Server-oriented                                                            | **B — Local + Sync Layer**                              |
| ----------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Complexidade _aparente_ | menor                                                                          | maior                                                   |
| Complexidade _real_     | **alta**: leitura offline exige cache + replay da fila sobre ele                | concentrada em uma camada, com contrato claro           |
| Latência de digitação   | rede no caminho da escrita, ou otimismo por cima do cache                      | zero — escrita local sempre                             |
| Reabrir o app offline   | precisa que o cache tenha sobrevivido **e** a fila seja reaplicada na ordem     | trivial: o banco local é o estado                       |
| Conflito                | mesmo problema, resolvido no mesmo lugar                                       | idem                                                    |
| Custo Vercel/Neon       | uma query por leitura de tela                                                  | um snapshot + pulls incrementais vazios                 |
| Regressão do câmera     | **sim** — hoje ele não precisa de rede para nada                               | não                                                     |

A Opção A parece mais simples porque esconde a pergunta "de onde vem a leitura quando não há
rede?". A resposta honesta é: de um cache de respostas HTTP, sobre o qual é preciso **reaplicar
a fila de mutações pendentes na ordem correta, a cada leitura e a cada boot**. Isso é o mesmo
problema do banco local, só que resolvido por acidente, sem transação e sem índice.

O que a Opção A tem de bom — não sincronizar o que não precisa — a fronteira D-01 já entrega.
**Escolhida a Opção B, aplicada só dentro da fronteira.** A Opção A vale, e é o padrão, para
tudo fora dela.

## D-03 · Conflito por compare-and-set de campo

A versão anterior detectava conflito comparando `baseVersion` com a versão atual e lendo, no
`sync_log`, **quais chaves** mudaram no intervalo. Funciona, mas obriga o log a guardar a lista
de campos de toda operação e obriga o servidor a percorrer o histórico a cada push.

Há um jeito mais simples de obter exatamente a mesma semântica: **o delta carrega os dois
valores**.

```jsonc
{ "entity": "cameraTakeData", "id": "…",
  "fields": { "lens": { "de": "35mm", "para": "50mm" } } }
```

O servidor, campo a campo:

| Situação                        | Ação                                     |
| ------------------------------- | ---------------------------------------- |
| `atual == de`                   | aplica (`para`)                          |
| `atual == para`                 | ninguém mexeu de verdade — ignora        |
| `atual != de` e `atual != para` | **conflito só desse campo**; não aplica |

Sem histórico, sem `version` no caminho crítico, sem leitura de log. É comparação e escrita, e
entrega os três níveis do §6 do seu retorno de graça:

- Nível 1 (entidades diferentes) → nem chega perto: linhas distintas.
- Nível 2 (mesma entidade, campos diferentes) → todos os campos passam no teste `atual == de`.
  **Merge automático.**
- Nível 3 (mesmo campo) → só aquele campo falha. Os outros do mesmo push **são aplicados**.

`version` continua existindo (é barata e útil para depuração e para o cliente detectar eco do
próprio push), mas deixa de ser o mecanismo de detecção.

## D-04 · Ids determinísticos por chave natural

Dois dispositivos offline criam o "Take 4 do Setup C". Com UUID aleatório, nascem dois ids
diferentes e o servidor rejeita o segundo por `unique (setup_id, number)`. O cliente perdedor
então precisa **descobrir o id do vencedor e reparentar os dados que já escreveu** — remapeamento
de id, exatamente a classe de bug que ADR-012 queria evitar.

O repositório já tem a ferramenta: [`domain/platform/derive-id.ts`](../domain/platform/derive-id.ts),
escrito para a migração ser reexecutável. **Passa a valer em runtime**, para as entidades que
têm chave natural:

```ts
scene.id = deriveId(productionId, 'scene', number, block);
setup.id = deriveId(sceneId, 'setup', shootingDayId, code);
take.id  = deriveId(setupId, 'take', String(number));
cameraTakeData.id = deriveId(takeId, 'camera', cameraUnitId);
```

Os dois dispositivos produzem **o mesmo id**. A criação vira `insert … on conflict (id) do
nothing` e a colisão deixa de ser um erro para virar convergência. Nenhum remapeamento existe
porque nunca há dois ids.

`crypto.randomUUID` continua para o que não tem chave natural (produção, membro, operação de
outbox, unidade de câmera), com o fallback corrigido — ver [§A/D-12](#d-12--as-três-versões) e R10.

**Limite aceito:** renumerar um take depois de criado desfaz a relação id ↔ chave natural. É
raro (o número é automático) e, quando acontece, cai no caminho de conflito normal com mensagem
específica. Risco R13.

## D-05 · Convergência, com a pendência preservada

Quando o campo conflita, existem dois desenhos possíveis:

1. **Divergir** — o local continua mostrando o meu valor até eu decidir.
2. **Convergir** — o local adota o valor do servidor; o meu vira uma pendência visível.

Escolhida a **2**. Em set, dois aparelhos mostrando valores diferentes para o mesmo take é pior
que uma pendência: alguém lê em voz alta o número errado e ninguém sabe qual tela está certa.
Convergindo, existe **um valor na tela e uma decisão pendente**, não dois valores concorrentes.

O meu valor não se perde — vai para `syncConflicts` (local), aparece como selo no próprio campo
e a resolução é um toque. Enquanto não for resolvida, a pendência **não bloqueia nada**: nem o
resto do take, nem os outros takes, nem os outros departamentos.

## D-06 · Polling adaptativo, sem SSE

Confirmado o §17. A colaboração aqui é "a continuísta ver o take que a câmera acabou de
registrar" — tolerância de dezenas de segundos, não de milissegundos.

| Estado da tela                          | Intervalo   |
| --------------------------------------- | ----------- |
| Diária aberta, houve mudança há < 2 min | **10 s**    |
| Diária aberta, ociosa                   | **30 s**    |
| Outra tela da produção                  | 60 s        |
| Aba oculta / app em background          | **não faz** |
| Volta a ficar visível, `online`, ou push bem-sucedido | pull imediato |

Um pull sem novidade é `select … where seq > $cursor limit 1` — índice puro, resposta vazia,
custo desprezível. Parar quando a aba está oculta é o que impede a conta de crescer com aparelho
no bolso. SSE fica documentado como upgrade, não como plano (R15, `DEFERRED`).

## D-10 · Conta obrigatória, legado preservado

O fluxo do seu §30 começa em "entrar na sala" — sem conta não há sala, nem membro, nem
permissão, nem autoria de campo. Manter um "modo LOCAL sem conta" **dentro** da plataforma
significaria manter dois caminhos de dados para sempre, e é justamente o tipo de complexidade
que o §11 pede para evitar.

Como não há dado real em produção (§1), a decisão fica barata: **a plataforma exige conta**, e o
aplicativo atual — LocalStorage, sem conta, sem rede — **permanece intacto** em `/legado`. Quem
quiser abrir e preencher um boletim avulso continua podendo. O login exige rede **uma vez**; a
sessão persiste no aparelho e não é reverificada para editar.

---

# B. Decisões rejeitadas

| Rejeitado                                    | Por quê                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Offline-first absoluto (espelhar tudo)       | Custo de sync em dados que ninguém edita em set. Substituído pela fronteira D-01                |
| Opção A — server-oriented                    | Esconde a leitura offline num cache + replay de fila; regride o câmera                          |
| SSE na v1                                    | Limite de duração de função + reconexão, para ganhar segundos que o produto não precisa         |
| CRDT                                         | Custo alto num domínio onde cada registro tem dono natural e o conflito real é raro             |
| Último-a-escrever puro                       | Perda silenciosa — o pior modo de falha possível aqui                                           |
| `sync_log` com lista de chaves alteradas     | Substituído pelo `{de, para}` do D-03, que não precisa de histórico                             |
| Divergência local após conflito              | Duas telas com valores diferentes é pior que uma pendência explícita                            |
| Fotografias                                  | Decisão do §10. Sai de requisitos, modelo, storage, sync, UX e cota                             |
| Migração com `NEEDS_REVIEW`, snapshot e verificação de contagens | Não há dado real a preservar (§1)                                            |
| Modo LOCAL como modo de primeira classe      | Dois caminhos de dados permanentes; o legado cobre o caso                                       |
| 11 skills / subagentes por domínio           | Reproduz na ferramenta a complexidade que a arquitetura está removendo — ver [§H](#h-skills)    |
| Histórico "de → para" por campo              | `createdBy/updatedBy` + `sync_log` respondem "quem e quando" (§9)                               |
| Tabela `sync_conflicts` no Postgres          | Conflito é pendência **daquele dispositivo**; ninguém mais precisa vê-la. Fica só no Dexie      |

---

# C. Arquitetura

```
                                  VERCEL · Next.js App Router
                                              │
        ┌─────────────────────────────────────┴──────────────────────────────────────┐
        │                                                                             │
   FORA DA FRONTEIRA (server-oriented)                DENTRO DA FRONTEIRA (local + sync)
        │                                                                             │
  app/(app)/producoes                                  app/(app)/p/[id]/diaria/[dayId]/*
  app/(app)/p/[id]/{membros,equipamentos,relatorios}          │
        │                                                      │  lê/escreve
        │  Server Component / Server Action                     ▼
        ▼                                              lib/offline  (Dexie)
  lib/auth ── guards ──► lib/db (Drizzle)                        │  ← useLiveQuery
        │                     │                                  │  enfileira (mesma transação)
        │                     │                                  ▼
        │                     │                          lib/sync  (outbox · cursor · merge)
        │                     │                                  │  HTTP
        │                     │                                  ▼
        │                     │                        app/api/sync/{snapshot,push,pull}
        │                     │                                  │
        └─────────────────────┴──────────────────────────────────┘
                                       │
                              Neon PostgreSQL
```

Duas regras duras, ambas verificáveis em revisão:

1. **Dentro da fronteira não existe `fetch`.** Módulos de departamento conhecem apenas
   `lib/offline/repos/*`. Quem fala com o servidor é `lib/sync`.
2. **Fora da fronteira não existe Dexie.** Aquelas telas são Next.js comum e podem exigir rede.

`domain/platform/` continua puro e continua sendo o único código que roda nos três lugares
(browser, route handler, script) — ADR-013 permanece.

## Estrutura de pastas (delta sobre overview.md §3)

```
lib/
├── db/          Drizzle: schema, client Neon, queries   (server-only)
├── auth/        Better Auth: config, guardas, sessão
├── contracts/   Zod compartilhado (cliente + servidor)
├── offline/     Dexie: schema local, repos, pin de diária
├── sync/        outbox, snapshot, pull, merge, conflitos, protocolo
└── (storage · normalize · factory · backup · seed)   ← ATUAIS, intocados (legado)

features/
├── camera/ sound/ continuity/     ← dentro da fronteira
├── production/                    ← fora
└── sync/                          ← indicador, tela de pendências e conflitos
```

Some de overview.md: `lib/offline/photos`, `db.blobs`, Vercel Blob e tudo de `photo`.

---

# D. Banco

Modelo relacional inalterado em relação a
[architecture/database.md](architecture/database.md), **menos** o que segue:

| Mudança                                                      | Motivo |
| ------------------------------------------------------------ | ------ |
| Removidas `photos` e toda coluna/enum relacionada            | D-07   |
| `sync_log` **não** guarda lista de chaves alteradas          | D-03   |
| Nenhuma tabela `sync_conflicts` no servidor                  | B      |
| `shooting_days.date` é `date`; todo o resto é `timestamptz`  | D-11   |
| PK `uuid` continua vinda do cliente, mas **derivada** quando há chave natural | D-04 |

Chaves naturais que sustentam a convergência:

```sql
unique (production_id, number, block)          -- scenes
unique (scene_id, shooting_day_id, code)       -- setups
unique (setup_id, number)                      -- takes
unique (take_id, camera_unit_id)               -- camera_take_data
unique (take_id)                               -- sound_take_data, continuity_take_data
```

## Banco local (Dexie `bdc-platform`)

```
── domínio (espelho parcial, só o que está fixado) ──
shootingDays        id, productionId, date
scenes              id, productionId, [number+block]
setups              id, productionId, sceneId, shootingDayId, sortOrder
takes               id, productionId, setupId, [setupId+number]
cameraTakeData      id, productionId, takeId, [takeId+cameraUnitId]
soundTakeData       id, productionId, takeId
soundTakeTracks     id, productionId, takeId, [takeId+index]
continuityTakeData  id, productionId, takeId
continuityDetails   id, productionId, takeId, kind      ← props/figurino/cabelo/cenografia

── referência somente leitura, vinda do snapshot ──
refs                key                                  ← cameraUnits, equipamento, membros

── infraestrutura ──
outbox          id, productionId, status, createdAt, [entityType+entityId]
syncConflicts   id, productionId, status, entityId, [entityType+entityId+field]
meta            key                                      ← cursor, pins, versões, identidade
```

Toda entidade local carrega `version`, `updatedAt`, `updatedBy`, `deletedAt` e `_dirty`.
Não existe `blobs`.

---

# E. Sync — fluxo completo

## E.1 Protocolo

```
POST /api/sync/push       { protocol: 1, productionId, operations: [ … ] }
GET  /api/sync/pull       ?productionId=…&since=<seq>&limit=500
GET  /api/sync/snapshot   ?shootingDayId=…              (primeira abertura da diária)
```

Toda resposta traz `protocol`. Divergência de protocolo → `426` e a UI mostra
**"Atualize o app para continuar sincronizando"** com botão de recarregar. Nenhuma versão antiga
escreve com regra antiga (D-12).

## E.2 Operação de outbox

```ts
interface SyncOperation {
  id: string;              // UUID — chave de idempotência
  productionId: string;
  entityType: string;      // 'take' | 'cameraTakeData' | …
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  fields: Record<string, { de: unknown; para: unknown }>;   // ← D-03
  createdAt: string;
  attempts: number;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
}
```

**Coalescência:** ao enfileirar `UPDATE` de um campo que já tem operação `PENDING` na mesma
entidade, o `de` original é preservado e só o `para` é substituído. Sem isso, digitar um campo
com debounce de 500 ms geraria uma dezena de operações e a primeira delas venceria o teste de
compare-and-set com um `de` obsoleto.

## E.3 CREATE

```
id derivado da chave natural (D-04)
        ↓
grava local + enfileira  ── MESMA transação Dexie
        ↓
push → insert … on conflict (id) do nothing
        ↓
200 · ack → _dirty = false
```

Já existir no servidor **não é erro**: é o outro dispositivo tendo criado o mesmo take. O
cliente segue para os campos, que passam pelo compare-and-set normal.

## E.4 UPDATE

```
escrita local imediata (sem espera)
        ↓
enfileira delta {de, para}, coalescendo
        ↓
push → por campo: aplica · ignora · conflita
        ↓
resposta { applied: [...], conflicts: [{field, atual, atualPor, atualEm}] }
        ↓
applied  → _dirty = false
conflicts→ adota `atual` no local  +  cria syncConflict PENDING com o meu valor
```

## E.5 DELETE

Soft delete é **um campo** (`deletedAt`) e passa pelo mesmo compare-and-set. Isso resolve o §27
sem nenhum mecanismo novo:

| Caso                                                        | Resultado                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| A apaga, ninguém tocou                                      | aplica                                                               |
| A apaga; B editou campos depois da base de A                | os campos de B permanecem; `deletedAt` aplica → registro apagado com o conteúdo preservado |
| A edita; B já apagou                                        | `atual.deletedAt != null` → **conflito**: "João apagou o Take 5 que você editou" → `[Manter apagado]` `[Restaurar]` |

Nada de coleta de lixo agressiva: registros apagados ficam no Postgres e no Dexie. Purga física
é rotina administrativa posterior, fora da v1 (ADR-015 permanece).

## E.6 Pull

`sync_log (seq bigserial)` continua sendo o cursor — ADR-006 permanece válido e é a única peça
de infraestrutura de sync que este plano **não** simplifica: relógio de cliente não serve de
cursor, e empate de milissegundo perde escrita para sempre.

```
GET /api/sync/pull?productionId&since=<seq>
    → { changes: [{entityType, entityId, operation, version, data}], cursor, hasMore }
```

- Autorização por `production_members` **antes** de qualquer leitura.
- Aplicação em transação; cursor gravado só no fim. Interrupção reprocessa o lote — as
  aplicações são idempotentes por `(entityId, version)`.
- Mudanças de diária **não fixada** são descartadas pelo cliente; o cursor avança do mesmo jeito.
- Mudança que o próprio dispositivo originou volta no pull e é reconhecida pela `version`.
- Campo com conflito `PENDING` não é sobrescrito por pull — ele já está convergido.

## E.7 Gatilhos

`online` · `visibilitychange` → visível · timer adaptativo (D-06) · imediatamente após cada
escrita quando já online. Retry com backoff exponencial com teto de 5 min **e jitter** — a
equipe inteira reconecta no mesmo instante quando o Wi-Fi da base volta.

`FAILED` nunca descarta payload: fica na tela de sincronização, com o erro, reenviável e
exportável.

---

# F. Conflitos — exemplos reais

### 1 · Departamentos diferentes, mesmo take → sem conflito

Câmera grava `lens`, Som grava `soundRoll`, Continuidade grava `note`. Três **linhas**
diferentes (`camera_take_data`, `sound_take_data`, `continuity_take_data`). O conflito não é
resolvido: ele não existe.

### 2 · Mesmo departamento, campos diferentes → merge automático

```
Gabriel:  Take 5 · ISO 800        push { iso: {de:'400', para:'800'} }
João:     Take 5 · FPS 24         push { fps: {de:'25',  para:'24' } }
```

Ambos passam no teste `atual == de`. Resultado: `ISO 800 · FPS 24`. Ninguém é notificado —
notificar aqui seria a caixa de diálogo no meio da filmagem que o §16 proíbe.

### 3 · Mesmo campo → conflito real

```
Gabriel (offline, 14:02):  lens 35mm → 50mm
João    (online,  14:03):  lens 35mm → 40mm   ✔ aplicado

14:07 — Gabriel volta a ter rede:
  push { lens: {de:'35mm', para:'50mm'} }
  atual = '40mm'  ≠ de  ≠ para   → CONFLITO
```

Tela do Gabriel:

```
Cena 24B · Setup C · Take 5 · Câmera

  Lente   40mm    ⚠ conflito
          ├ seu valor:   50mm      (você, 14:02, offline)
          └ valor atual: 40mm      (João, 14:03)

          [ Usar 50mm ]   [ Manter 40mm ]   [ Editar ]
```

`Usar 50mm` reenfileira `{de:'40mm', para:'50mm'}` — compare-and-set de novo, sem caminho
especial. `Manter 40mm` fecha a pendência. **O Take 6 nunca foi bloqueado; o Som nunca soube
que existiu conflito.**

### 4 · Dois dispositivos criam o Take 4 do mesmo setup

Mesma chave natural → mesmo id (D-04) → um único take. Não há conflito nem take duplicado.

### 5 · Edição × exclusão

Ver [E.5](#e5-delete).

## Modelo local do conflito

```ts
interface SyncConflict {
  id: string;
  productionId: string;
  entityType: string;
  entityId: string;
  field: string;
  meuValor: unknown;
  valorRemoto: unknown;
  remotoPor: string;     // nome do membro, já resolvido no servidor
  remotoEm: string;
  detectadoEm: string;
  status: 'PENDING' | 'RESOLVED';
  resolucao?: 'MEU' | 'REMOTO' | 'EDITADO';
  resolvidoEm?: string;
}
```

Vive **só no Dexie**. `PENDING` e `RESOLVED` bastam, como você definiu no §8.

---

# G. Offline

## G.1 Estados

Três eixos independentes, um único indicador (§25):

```
NETWORK          navigator.onLine        → apenas GATILHO, nunca verdade
SERVER_REACHABLE último push/pull        → ALCANÇÁVEL após sucesso;
                                           INALCANÇÁVEL após 2 falhas seguidas
SYNC             fila + conflitos        → IDLE · SYNCING · PENDING(n) · CONFLICT(n) · ERROR
```

`navigator.onLine` é otimista demais: Teradek e captive portal de locação reportam "online" sem
internet. A verdade é **o resultado da última requisição**; o próprio pull periódico serve de
sonda, sem endpoint de heartbeat.

| Indicador                | Significado                                  |
| ------------------------ | -------------------------------------------- |
| ● Sincronizado           | fila vazia, servidor alcançável              |
| ⟳ Sincronizando          | push ou pull em andamento                    |
| ● Pendências (n)         | online, n operações na fila                  |
| ○ Offline · n pendências | sem servidor; edição normal                  |
| ▲ Conflitos (n)          | n campos aguardando decisão                  |
| ✕ Erro de sincronização  | falhas persistentes → tela de diagnóstico    |
| ⬆ Atualize o app         | protocolo incompatível — só este bloqueia sync |

**Nenhum estado bloqueia o preenchimento.** Nem o último: com protocolo incompatível a edição
local continua e a fila acumula.

## G.2 Comportamento

| Situação                      | Online                                    | Offline                                                   |
| ----------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| Abrir a diária **fixada**     | snapshot/pull incremental                 | abre do local, instantâneo                                |
| Abrir diária **não fixada**   | snapshot + fixa                           | **não abre** — ver G.3                                    |
| Criar cena/setup/take         | local + push imediato                     | local + fila                                              |
| Editar campo                  | local + push com debounce                 | local + fila coalescida                                   |
| Ver o que outro departamento fez | atualiza no polling                     | mostra o último estado conhecido, com selo de defasagem   |
| PDF da diária                 | funciona                                  | **funciona** (impressão nativa, ADR-014)                  |
| Entrar em produção por código | funciona                                  | não — operação de preparação                              |
| Criar produção / convidar     | funciona                                  | não                                                       |

## G.3 Fixação (pin) da diária

É o que impede a fronteira D-01 de virar armadilha:

- Ao abrir uma diária, ela é **fixada** — snapshot completo no Dexie, permanente.
- Estando online, a produção ativa fixa **automaticamente** a diária de hoje e a de amanhã, em
  background. Chegar na locação sem sinal com a diária já baixada é o caso normal, não a sorte.
- **Criar diária offline funciona**: id derivado de `(productionId, date)`, sincroniza depois e
  converge com a que outro dispositivo tiver criado para o mesmo dia.
- Diária não fixada e sem rede mostra estado explícito: _"Esta diária ainda não foi baixada.
  Conecte-se uma vez para trabalhar nela offline."_ — não uma tela de erro.
- Desfixar é manual e só é oferecido depois de a fila estar vazia.

## G.4 PWA e versões

Ver D-12 e R11. Ajustes no Service Worker atual (que permanece escrito à mão):

| Ajuste                                                | Motivo                                            |
| ----------------------------------------------------- | ------------------------------------------------- |
| `VERSION` gerado no build (`prebuild` → sha + versão) | Hoje é `'v1'` manual em `public/sw.js:4`          |
| `APP_SHELL` gerado no build                           | Rotas dinâmicas e chunks não se enumeram à mão    |
| **Nunca** cachear `/api/**`                           | Resposta de sync em cache é corrupção silenciosa  |
| `registration.waiting` → aviso "Atualizar agora"      | Usuário não pode ficar preso em versão antiga     |
| Fallback de navegação para `/p/**`                    | Abrir uma produção direto, sem rede               |

## D-12 · As três versões

```
APP VERSION      (build)   → dispara o aviso de atualização
DB SCHEMA VERSION (Dexie)  → upgrade versionado; nunca destrutivo
SYNC PROTOCOL     (inteiro)→ enviado em todo push/pull; incompatível = 426
```

A regra que amarra as três: **uma versão antiga do app nunca escreve no servidor com regra
antiga.** É o protocolo, não a versão do app, que autoriza a sincronizar.

---

# H. Skills

## Avaliação honesta das quatro opções

| Opção                                    | Custo de contexto                          | Risco de edição concorrente | Coerência arquitetural | Veredito |
| ---------------------------------------- | ------------------------------------------ | --------------------------- | ---------------------- | -------- |
| **A** — agente único, sem estrutura      | carrega tudo sempre; degrada com 4.300 linhas de doc | nenhum            | alta                   | insuficiente |
| **B** — agente principal + skills        | carrega **só a skill da vez**              | nenhum (mesmo agente)       | alta                   | **escolhida** |
| **C** — agente principal + subagentes    | cada subagente **parte do zero** e redescobre o repositório | médio        | média                  | pontual |
| **D** — agentes independentes por domínio | idem, sem autoridade central              | **alto**                    | baixa                  | rejeitada |

O ponto que decide entre B e C: **subagente não herda contexto**. Cada um recomeça frio,
relê os documentos, refaz as mesmas descobertas — e ainda assim pode contradizer o outro,
porque nenhum viu o que o outro fez. Uma skill é o oposto: é instrução carregada sob demanda
**no mesmo agente**, que continua sabendo de tudo. Ela entrega exatamente o que o seu §13 pede
(responsabilidade, escopo, arquivos permitidos, testes, doc, critério de conclusão) sem pagar
por partida a frio nem abrir a porta para edição concorrente.

Subagente continua útil para o que é **paralelo e só de leitura** — varrer o repositório atrás
de todos os pontos que citam foto, por exemplo. Não para escrever código de produção.

## Cinco skills, não onze

A lista do seu §12 tem onze itens. Onze skills reproduziriam na ferramenta a mesma
sobre-engenharia que este plano está removendo da arquitetura — e várias delas seriam quase
idênticas. Câmera, Som e Continuidade têm o **mesmo formato**: um módulo de departamento,
mesmo design system, mesma superfície local, mesmo `Take`. Merecem uma skill, não três.

```
AGENTE PRINCIPAL  (autoridade arquitetural — CLAUDE.md)
      ├── banco          schema Drizzle, migrations, convenções, timezone
      ├── sync           outbox, push/pull, conflitos, protocolo, offline
      ├── modulo         qualquer módulo de departamento (câmera/som/continuidade)
      ├── plataforma     telas fora da fronteira: auth, sala, membros, permissões
      └── testes         harness .mjs atual, Vitest e Playwright futuros
```

Documentação **não é skill**: é regra do agente principal — doc e código no mesmo commit.
Autenticação é trabalho de uma fase só; cabe em `plataforma` + o documento que já existe.
PWA são cinco arquivos; cabe em `sync` (é lá que a versão do protocolo mora).

## Contrato de cada skill

Todas declaram os oito campos do §13. Exemplo completo:

```yaml
skill: sync
responsabilidade: >
  Fila de saída, push/pull, detecção e resolução de conflito, estados de conectividade,
  versão do protocolo, Service Worker.
escopo:
  pode alterar:    lib/sync/**  lib/offline/**  app/api/sync/**  features/sync/**  public/sw.js
  não deve alterar: features/{camera,sound,continuity}/**  lib/db/schema/**  domain/**
pré-condições:
  - schema do banco estável (skill `banco` concluída para as entidades envolvidas)
  - contrato Zod existente em lib/contracts/
testes obrigatórios:
  - idempotência: mesma operação enviada duas vezes aplica uma vez
  - compare-and-set: campos disjuntos fazem merge; mesmo campo conflita
  - pull interrompido no meio do lote retoma sem duplicar
  - offline → 50 operações → volta a rede → todas sincronizam na ordem
documentação: docs/architecture/synchronization.md  ·  docs/decisions.md (se mudar decisão)
conclusão: >
  Dois dispositivos, um offline, convergem sem perda; conflito de campo aparece como
  pendência resolvível e não bloqueia o resto da diária.
```

Resumo das outras quatro:

| Skill        | Pode alterar                                                       | Não deve alterar                        | Doc obrigatória            |
| ------------ | ------------------------------------------------------------------ | --------------------------------------- | -------------------------- |
| `banco`      | `lib/db/**`, migrations                                            | `lib/sync/**`, `features/**`            | `architecture/database.md` |
| `modulo`     | `features/{camera,sound,continuity}/**`, `app/(app)/p/**/diaria/**` | `lib/sync/**`, `lib/db/**`, `domain/**` | `features/*.md`            |
| `plataforma` | `app/(public)/**`, `app/(app)/{producoes,p/[id]}/**`, `lib/auth/**` | `features/{camera,sound,continuity}/**` | `architecture/{authentication,permissions}.md` |
| `testes`     | `test/**`, arquivos `*.test.ts`, config de Playwright               | qualquer código de produção             | `CLAUDE.md` (comandos)     |

## Agente principal e sequência

O agente principal (regras no `CLAUDE.md` do repositório) mantém arquitetura, contratos entre
módulos, consistência do banco, segurança e aprovação final. **Nenhuma skill altera
`domain/platform/`, `docs/decisions.md` ou o contrato entre módulos por conta própria** — isso
é escalado.

Sobre o §15: a sequência é imposta pelas **fases** e pelas pré-condições declaradas. Uma skill
por vez; `sync` não começa antes de `banco` fechar as entidades que ela move.

---

# I. Roadmap

Reordenado. A mudança de fundo: **a sala vem antes do sync**, e o **sync vem antes do câmera**.
Motivo — a sala é server-oriented puro e valida auth, permissões e deploy sem tocar em
sincronização; o sync ganha um consumidor real e pequeno para se provar; e o Boletim de Câmera,
que é o módulo maduro e o que não pode regredir, é reconstruído por último, sobre fundação já
estável.

## 0. Preparação — o que muda antes de qualquer código

| Ação                                                                          |
| ----------------------------------------------------------------------------- |
| `decisions.md`: ADR-016…ADR-024 novos; blocos "Revisto em" em ADR-007, 009, 012 |
| `risks.md`: substituído pela matriz [§J](#j-nova-matriz-de-risco)              |
| `architecture/offline-first.md`: fronteira D-01; **§3 (fotos) removido**       |
| `architecture/synchronization.md`: compare-and-set; polling; SSE → "upgrade"   |
| `architecture/overview.md`: §2 (regra dura), §3 (pastas), §7 (tabela), §8.2    |
| `architecture/database.md`: sem `photos`; `sync_log` sem chaves; ids derivados |
| `features/continuity.md`: fotos removidas                                      |
| `migrations/local-to-cloud.md`: reescrito como importação opcional             |
| `roadmap.md` e `README.md`: esta ordem                                         |
| `.claude/skills/{banco,sync,modulo,plataforma,testes}/SKILL.md`: criadas       |
| `CLAUDE.md`: fronteira offline, autoridade do agente principal, quando usar cada skill |
| `utils/id.ts`: fallback com `crypto.getRandomValues` (R10) — única mudança de código |

## Fases

| Fase | Entrega | Pronta quando |
| ---- | ------- | ------------- |
| **2 · Fundação servidor** | Neon + Drizzle + schema + migrations + Better Auth + produções/membros/permissões + deploy | Dois usuários criam conta; um cria produção, o outro entra por código; permissão aplicada **no servidor** |
| **3 · Sala** (sem offline) | `/producoes`, sala, membros, diárias (CRUD), dashboard somente-leitura | A sala funciona de ponta a ponta, server-oriented, sem uma linha de Dexie |
| **4 · Superfície offline + sync** | Dexie da fronteira, pin/snapshot, outbox, push/pull, compare-and-set, polling, indicador, conflitos em UI, protocolo, SW automatizado | Dois dispositivos, um offline, criam e editam takes numa tela mínima e convergem; conflito de campo vira pendência resolvível |
| **5 · Câmera na plataforma** | `features/camera/` sobre o modelo compartilhado; paridade campo a campo; PDF idêntico; rotas atuais → `/legado` | Uma diária inteira no módulo novo sem sentir falta de nada, e o boletim impresso sai igual ou melhor |
| **6 · Som** · **7 · Continuidade** | Paralelas após a 5. Continuidade **sem fotos** | Cada módulo entrega diária completa + relatório |
| **8 · Integração** | Consolidado da diária, cruzamentos entre departamentos, busca | — |
| **9 · Relatórios** | PDF dos três + CSV + consolidado + export JSON | — |
| **10 · Hardening** | Contínua a partir da 4: Vitest, Playwright (inclui offline), rate limit, performance com produção grande | — |

## Regras que valem em todas as fases

1. **O Boletim de Câmera não regride** — nem em campo, nem em toques, nem em PDF.
2. **Nada dentro da fronteira exige rede para editar.**
3. **Toda fase é desligável** por feature flag.
4. **Design system único**: nenhum módulo novo inventa componente que já existe (D-09).
5. **Documentação no mesmo commit** que o código.
6. **Uma skill por vez**, respeitando pré-condições.

---

# J. Nova matriz de risco

| #    | Risco | Impacto | Prob. | Decisão | Mitigação | Status |
| ---- | ----- | ------- | ----- | ------- | --------- | ------ |
| R1   | ~~Perda de dado na migração do LocalStorage~~ | — | — | Não há dado real (§1) | Importação opcional, best-effort; `bdc:boletins:v1` nunca é apagado | **REMOVIDO** |
| R1b  | Perda de dado local no aparelho (Dexie) | catastrófico | baixa | Manter | Escrita local + outbox na **mesma transação**; export JSON offline; `storage.persist()` | MITIGATED |
| R2   | Rede virar requisito para preencher | catastrófico | média | Fronteira D-01 | `fetch` proibido dentro da fronteira (revisão + lint); E2E offline obrigatório por release | MITIGATED |
| R2b  | **Fronteira mal desenhada** — algo essencial em set ficou do lado servidor | alto | média | Aceitar com defesa | Pin automático de hoje/amanhã; criação de diária offline; estado explícito em vez de erro | MITIGATED |
| R3   | Regressão no Boletim de Câmera | alto | média | Fase 5, por último | Checklist campo a campo; reuso de componentes (D-09); `/legado` vivo; PDF comparado lado a lado | MITIGATED |
| R4   | Conflito mal resolvido / perda silenciosa | alto | **baixa** | Compare-and-set (D-03) + ids derivados (D-04) | Merge por campo; conflito nunca resolve sozinho; pendência isolada e não bloqueante | MITIGATED |
| R5   | ~~Cota estourada por fotos~~ | — | — | Sem fotos (§10) | — | **REMOVIDO** |
| R6   | Complexidade acima da capacidade de manutenção | alto | **média-baixa** | Reduzida por decisão | Fronteira D-01; sem SSE, sem fotos, sem CRDT, sem histórico; 5 skills com escopo declarado | MITIGATED |
| R7   | UX de set degradada | alto | baixa | Critério de aceite | Teto de toques por take; sem modal, sem salvar, sem espera; validação em diária real | MITIGATED |
| R8   | Custo/limites Vercel + Neon | médio | baixa | Polling (D-06) | Polling adaptativo; para com aba oculta; pull vazio é índice puro; sem função de longa duração | MITIGATED |
| R9   | Timezone / data da diária | médio | média | `date` × `timestamptz` (D-11) | Regra no schema; nunca converter a diária para UTC; teste com fuso deslocado | MITIGATED |
| R10  | `crypto.randomUUID` indisponível | médio | baixa | Corrigir agora | Fallback com `getRandomValues`; validação de UUID no servidor; `unique` de chave natural | MITIGATED |
| R11  | Service Worker servindo versão velha | alto | média | Versões encadeadas (D-12) | `VERSION` no build; aviso "Atualizar agora"; `/api/**` nunca em cache; protocolo rejeita cliente velho | MITIGATED |
| R12  | Divergência doc × código | médio | média | Regra de commit | Doc no mesmo commit; cada skill declara a doc que atualiza; migrations do Drizzle são a fonte executável | MITIGATED |
| R13  | Renumerar take quebra o id determinístico | baixo | baixa | Aceitar | Renumeração é rara; colisão vira conflito explícito com mensagem própria | ACCEPTED |
| R14  | Conta obrigatória afasta uso avulso | baixo | média | Aceitar (D-10) | `/legado` permanece sem conta, offline, com PDF | ACCEPTED |
| R15  | Polling insuficiente para colaboração | baixo | baixa | Adiar | SSE documentado como upgrade sobre o **mesmo** cursor; troca só o gatilho | DEFERRED |
| R16  | Listas ordenadas sem merge por campo | baixo | baixa | Aceitar | Último-a-escrever na lista, com aviso na UI | ACCEPTED |
| R17  | Metadado de cena duplicado entre blocos | baixo | alta | Aceitar (ADR-002) | Metadado descritivo, não unidade de gravação; UI edita no nível do `number` | ACCEPTED |

---

## Aprovação

**Aprovado em `2026-08-10`.** Os três pontos que estavam em aberto foram confirmados pelo
proprietário:

| Ponto     | Decisão confirmada                                                                      |
| --------- | ---------------------------------------------------------------------------------------- |
| **D-10**  | Conta obrigatória na plataforma; app atual preservado em `/legado`, sem conta            |
| **D-05**  | No conflito, a tela **converge** para o valor do servidor; o valor do usuário vira pendência |
| **D-09**  | Design system único, **sem exceção**, mesmo onde o formato do dado pedir outra tela      |

E a ordem de partida: **Preparação (§I.0) completa → Fase 2**.

A Preparação está **concluída** — ver [roadmap.md](roadmap.md#-fase-15--preparação-rodada-2).
Todas as decisões deste documento estão registradas em [decisions.md](decisions.md) como
ADR-016 … ADR-027, com blocos "Revisto em" nas decisões que elas revisam.

Próximo passo: **Fase 2 — Fundação servidor** (Neon, Drizzle, migrations, Better Auth,
produções, membros, permissões, deploy), conduzida pelas skills `banco` e `plataforma`, nessa
ordem.
