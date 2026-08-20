# Banco de dados — Neon PostgreSQL

Modelo relacional da plataforma, DDL de referência e a camada de acesso.

> **Status: implementado.** O schema vive em [`lib/db/schema/`](../../lib/db/schema) e as
> migrations em [`drizzle/`](../../drizzle) — **elas são a fonte executável**. Este documento
> é explicativo e subordinado a elas: se os dois divergirem, é este que está errado, e a
> correção sai no mesmo commit da migration.
>
> Verificado contra o banco real por `npm run test:db` (20 checks: tipo de coluna, triggers,
> chaves naturais, escopo de continuidade, fuso e monotonicidade do cursor).

---

## 1. Escolhas

### Neon

- Postgres gerenciado, serverless, com **branching** — cada preview da Vercel pode ter seu
  próprio branch de banco, o que torna migration testável sem tocar em produção.
- Driver `@neondatabase/serverless`: HTTP para queries avulsas (ideal para route handlers
  curtos na Vercel) e WebSocket quando houver transação de várias instruções.
- `DATABASE_URL` **nunca** com prefixo `NEXT_PUBLIC_`; só é lida em código de servidor
  (`lib/db/`), que nunca é importado por componente cliente. Ver [§7](#7-segurança).

### Drizzle ORM

Escolhido sobre Prisma:

| Critério           | Drizzle                                            | Prisma                                 |
| ------------------ | -------------------------------------------------- | -------------------------------------- |
| Runtime na Vercel  | Só TypeScript; funciona em edge e node             | Engine binário; pesado, atrito em edge |
| Tipagem            | Inferida do schema, sem geração de cliente         | Requer `prisma generate` no build      |
| Proximidade do SQL | Alta — importa para as queries de sync incremental | Abstrai; escapar para SQL cru é comum  |
| Migrations         | `drizzle-kit generate` → SQL versionado e legível  | Boas, porém opacas                     |
| Peso               | Coerente com a cultura de zero-dependência do repo | Ordens de grandeza maior               |

O ponto decisivo é o terceiro: o pull incremental e a resolução de conflito por versão são
queries que a gente quer **ler e entender** em SQL, não deduzir de um query builder mágico.

### Validação — Zod

Schemas em `lib/contracts/`, importados pelos **três** pontos:

```
cliente (antes de gravar no Dexie)  ──┐
route handler (antes de tocar no DB) ─┼──→ lib/contracts/*.ts  (fonte única)
teste                                 ─┘
```

`drizzle-zod` deriva o schema base das tabelas; os refinamentos de negócio (formato de
timecode, `number ≥ 1`, `joinCode` normalizado) são escritos à mão sobre ele.
**Validação de servidor nunca confia na de cliente** — a de cliente existe só para dar
feedback imediato offline.

---

## 2. Convenções

Valem para **todas** as tabelas de domínio (não para as de autenticação, que seguem o schema
da Better Auth):

| Convenção       | Regra                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chave primária  | `uuid` gerado **no cliente** — indispensável para criar offline. **Derivado da chave natural** onde ela existe (ADR-019); `crypto.randomUUID` no resto |
| Nomenclatura    | `snake_case` no banco, `camelCase` no TypeScript                                                                                                       |
| Escopo          | Toda tabela de conteúdo carrega `production_id`, mesmo quando redundante — é o eixo de toda autorização e de todo pull incremental                     |
| Auditoria (§21) | `created_at`, `updated_at`, `created_by`, `updated_by` obrigatórios                                                                                    |
| Exclusão        | **Soft delete**: `deleted_at`, `deleted_by`. Delete físico não sincroniza                                                                              |
| Concorrência    | `version integer not null default 1`, incrementado a cada UPDATE                                                                                       |
| Ordenação       | `sort_order integer` onde a ordem é definida pelo usuário (setups, tracks, membros)                                                                    |
| Texto livre     | `text` (nunca `varchar(n)`) — o app é deliberadamente de campo livre                                                                                   |
| Enums           | Enum nativo do Postgres, espelhando `domain/platform/enums.ts`                                                                                         |
| Timestamps      | `timestamptz`. Datas de diária são `date` (a diária é um dia civil, não um instante) e **nunca** são convertidas para UTC                              |

### Enums

```sql
create type department        as enum ('CAMERA','SOUND','CONTINUITY','DIRECTION','PRODUCTION',
                                       'DIT','LIGHTING','ART','WARDROBE','MAKEUP','EDITORIAL');
create type member_role       as enum ('OWNER','ADMIN','MEMBER','VIEWER');
-- Os dois eixos do take (ADR-029, migration 0005). Julgamento e natureza eram um enum só
-- até a Fase 6; com um enum só, um wild circled ou um pick-up NG obrigavam a escolher qual
-- informação perder — e a perdida era sempre a que o outro departamento precisava.
create type take_status       as enum ('RECORDED','CIRCLE','HOLD','NG','PARTIAL');
create type take_kind         as enum ('SYNC','MOS','WILD','ROOM_TONE','WILD_LINES',
                                       'PLAYBACK','PICKUP','SERIES','FALSE_START');
create type equipment_category as enum ('CAMERA','LENS','FILTER','RECORDER','MIXER','MICROPHONE',
                                        'WIRELESS','TIMECODE','MONITOR','OTHER');
create type int_ext           as enum ('INT','EXT','INT_EXT');
create type day_night         as enum ('DAY','NIGHT','DAWN','DUSK');
create type sync_op           as enum ('CREATE','UPDATE','DELETE');
```

Os departamentos futuros (§4 do briefing) **já entram no enum agora**. Adicionar valor a enum
Postgres é barato, mas exige migration; deixá-los prontos custa nada e evita que a
arquitetura precise mudar para incluí-los depois. O que não existe ainda é **UI** para eles.

---

## 3. Diagrama de entidades

```
                    users  (Better Auth)
                      │
                      ▼
           production_members ──────► productions ◄──── camera_units
                      │                    │                  │
                      │                    ├──► shooting_days │
                      │                    │         │        │
                      │                    ├──► scenes        │
                      │                    │         │        │
                      │                    │         ▼        │
                      │                    │      setups ◄────┘
                      │                    │         │
                      │                    │         ▼
                      │                    │      takes
                      │                    │    ┌────┼────┐
                      │                    │    ▼    ▼    ▼
                      │                    │ camera  sound  continuity
                      │                    │ _take_  _take_ _take_data
                      │                    │  data    data       │
                      │                    │           │         ├─ continuity_props
                      │                    │           ▼         ├─ continuity_wardrobe
                      │                    │    sound_take_      ├─ continuity_hair_makeup
                      │                    │       tracks        └─ continuity_set_dressing
                      │                    │
                      └──► equipment_assignments ◄── equipment
                                           │
                                                        sync_log
```

---

## 4. DDL de referência

Escrito para leitura, não para copiar e colar — a migration real sai do Drizzle.
Colunas de auditoria abreviadas como `<audit>`:

```sql
-- macro conceitual, expandido em toda tabela de domínio:
-- <audit> ≡ created_at timestamptz not null default now(),
--           updated_at timestamptz not null default now(),
--           created_by uuid references users(id),
--           updated_by uuid references users(id),
--           deleted_at timestamptz,
--           deleted_by uuid references users(id),
--           version    integer not null default 1
```

### 4.1 Produção e sala

```sql
create table productions (
  id            uuid primary key,
  name          text not null,             -- "Filme X"
  company       text,                      -- produtora
  director      text,
  dop           text,                      -- diretor de fotografia
  join_code     text not null unique,      -- "FILMEX-8K2P"
  join_enabled  boolean not null default true,
  archived_at   timestamptz,
  <audit>
);

create table production_members (
  id            uuid primary key,
  production_id uuid not null references productions(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  role          member_role not null default 'MEMBER',   -- papel na sala
  department    department  not null,                    -- departamento (independente!)
  display_name  text,                                    -- nome usado nos boletins
  job_title     text,                                    -- "1º AC", "Boom Operator"
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz,                             -- presença no dashboard
  <audit>,
  unique (production_id, user_id)
);

-- Departamentos adicionais de um mesmo membro (raro, mas real: DIT que também é 2º AC).
create table production_member_departments (
  member_id  uuid not null references production_members(id) on delete cascade,
  department department not null,
  primary key (member_id, department)
);

create table shooting_days (
  id            uuid primary key,
  production_id uuid not null references productions(id) on delete cascade,
  date          date not null,
  day_number    text,                      -- "12" — texto: existe "12A", "12B"
  unit          text,                      -- unidade (1ª, 2ª, splinter)
  location      text,
  call_time     time, wrap_time time,
  lunch_start   time, lunch_end time,
  notes         text,
  <audit>,
  unique (production_id, date, unit)
);
```

### 4.2 Unidade compartilhada — Cena, Setup, Take

O coração do §9 (não duplicar dados).

```sql
create table scenes (
  id            uuid primary key,
  production_id uuid not null references productions(id) on delete cascade,
  number        text not null,             -- "24"
  block         text,                      -- "B"  → rótulo de set: "24B"
  page          text,                      -- "12 3/8"
  story_day     text,
  int_ext       int_ext,
  day_night     day_night,
  location      text,
  description   text,
  characters    text[],
  <audit>,
  unique (production_id, number, block)
);

create table setups (
  id              uuid primary key,
  production_id   uuid not null references productions(id) on delete cascade,
  scene_id        uuid not null references scenes(id) on delete cascade,
  shooting_day_id uuid references shooting_days(id),  -- em que diária foi rodado
  code            text not null,           -- "A", "B", "C" · ou "1", "2"
  name            text,                    -- "Master", "Close João"
  -- Tipo de captação: Normal, Série, Insert, Pickup, Drone. `text` livre e não enum: é o
  -- `Plano.tipo` do boletim, que sempre aceitou valor digitado ("Dolly de aproximação"),
  -- e um enum transformaria isso em perda de dado na importação (migration 0004).
  kind            text,
  shot_size       text,                    -- PA, PM, PP, CLOSE…
  angle           text,
  movement        text,                    -- fixo, travelling, grua, mão
  screen_direction text,
  eyeline         text,
  description     text,
  sort_order      integer not null default 0,
  <audit>,
  -- A diária entra na chave de propósito: a mesma cena remontada no dia seguinte é
  -- genuinamente outro setup (luz desmontada, câmera reposicionada). Sem isso, uma
  -- cena gravada em dois dias perderia a associação de um deles.
  unique (scene_id, shooting_day_id, code)
);

create table takes (
  id            uuid primary key,
  production_id uuid not null references productions(id) on delete cascade,
  setup_id      uuid not null references setups(id) on delete cascade,
  number        integer not null,          -- inteiro de verdade: ordena e incrementa
  -- Os DOIS eixos do take (ADR-029, migration 0005). `status` responde "o take presta?" e
  -- `kind` responde "que tipo de take é este?". `kind` fica aqui, no take compartilhado,
  -- porque um take MOS é MOS para todo mundo.
  status        take_status not null default 'RECORDED',
  kind          take_kind not null default 'SYNC',
  duration_sec  integer,
  started_at    timestamptz,
  notes         text,
  <audit>,
  unique (setup_id, number)
);
```

> `unique (setup_id, number)` é o que torna a criação de take **idempotente** e resolve a
> corrida "Câmera e Continuidade criam o take 4 ao mesmo tempo": o segundo `INSERT` colide,
> o cliente relê e passa a escrever no take existente. É a garantia de não-duplicação
> aplicada pelo banco, não pela boa vontade do cliente.

### 4.3 Dados por departamento

```sql
-- CÂMERA — uma linha POR CÂMERA por take (multicam real).
create table camera_units (            -- generaliza CameraCadastrada
  id            uuid primary key,
  production_id uuid not null references productions(id) on delete cascade,
  label         text not null,         -- "A", "B"
  model         text,
  body_serial   text,
  equipment_id  uuid references equipment(id),
  operator      text, focus_puller text, clapper text,
  <audit>,
  unique (production_id, label)
);

create table camera_take_data (
  id              uuid primary key,
  production_id   uuid not null references productions(id) on delete cascade,
  take_id         uuid not null references takes(id) on delete cascade,
  camera_unit_id  uuid references camera_units(id),
  status          take_status,
  approved        boolean not null default false,   -- "aprovado pelo diretor" (v2)
  -- mídia
  card            text, roll text, volume text, file_name text, media_notes text,
  -- óptica
  lens            text, focal_length text, t_stop text, filter text, matte_box boolean,
  -- configuração
  iso             text, fps text, shutter text, white_balance text,
  resolution      text, codec text, aspect_ratio text, lut text, color_space text,
  vfx             text,
  notes           text,
  <audit>,
  unique (take_id, camera_unit_id)
);

-- SOM
create table sound_day_config (        -- configuração da diária (§11)
  id              uuid primary key,
  production_id   uuid not null references productions(id) on delete cascade,
  shooting_day_id uuid not null references shooting_days(id) on delete cascade,
  sample_rate     text, bit_depth text, frame_rate text,
  timecode_source text, drop_frame boolean,
  file_format     text,                -- WAV/BWF
  poly            boolean,             -- poly (true) / mono (false)
  media           text, roll text,
  sound_mixer     text, boom_operator text,
  -- Custódia do áudio (migration 0005): o que o sound report precisa dizer sobre o dia
  -- além da configuração — de onde veio o TC, o que os user bits carregam, e para onde a
  -- mídia foi copiada.
  tc_jam_at       timestamptz,         -- hora do jam; explica deriva ao longo do dia
  user_bits       text,                -- UBITS: carregam data e roll
  media_copies    text,                -- "cartão → LaCie → nuvem", texto livre
  media_verified  boolean not null default false,
  <audit>,
  unique (shooting_day_id)
);

create table sound_take_data (
  id            uuid primary key,
  production_id uuid not null references productions(id) on delete cascade,
  take_id       uuid not null references takes(id) on delete cascade,
  status        take_status,
  ng_reason     text,                  -- "NG" sem motivo é anotação inútil na pós
  circled       boolean not null default false,
  sound_roll    text, file_name text,
  tc_start      text, tc_end text, duration_sec integer,
  -- wild / room_tone / wild_lines / false_start SAÍRAM daqui na migration 0006: viraram
  -- `takes.kind`. A natureza é do take, não do som (ADR-029).
  notes         text,
  <audit>,
  unique (take_id)
);

create table sound_take_tracks (       -- tracks dinâmicas, SEM limite de 4 (§11)
  id            uuid primary key,
  production_id uuid not null references productions(id) on delete cascade,
  take_id       uuid not null references takes(id) on delete cascade,
  index         integer not null,      -- 1..N
  name          text,                  -- "Boom", "João"
  source        text,                  -- "Lav", "Boom", "Plant"
  equipment_id  uuid references equipment(id),   -- "MKH 416"
  notes         text,
  <audit>,
  unique (take_id, index)
);

-- CONTINUIDADE
create table continuity_take_data (
  id               uuid primary key,
  production_id    uuid not null references productions(id) on delete cascade,
  take_id          uuid not null references takes(id) on delete cascade,
  status           take_status,
  selected         boolean not null default false,   -- circled da continuísta
  duration_sec     integer,
  start_position   text, end_position text,
  action           text, movement text, direction text,
  entrances_exits  text, eyeline text,
  object_interaction text, character_interaction text,
  dialogue_changes text, improvisation text, script_deviation text,
  notes            text,
  <audit>,
  unique (take_id)
);
```

Os quatro blocos de continuidade de estado (props, figurino, cabelo/maquiagem, cenografia)
compartilham a mesma forma e o mesmo escopo flexível — podem estar presos a uma cena, a um
setup ou a um take:

```sql
create table continuity_props (
  id            uuid primary key,
  production_id uuid not null references productions(id) on delete cascade,
  scene_id      uuid references scenes(id) on delete cascade,
  setup_id      uuid references setups(id) on delete cascade,
  take_id       uuid references takes(id) on delete cascade,
  name          text not null,   -- "Copo"
  position      text,            -- "Mesa lado direito"
  state         text,            -- "50% cheio"
  quantity      text,
  interaction   text,            -- "Ator segura na mão direita"
  notes         text,
  <audit>,
  check (num_nonnulls(scene_id, setup_id, take_id) >= 1)
);

create table continuity_wardrobe (       -- character, outfit, accessories, state, notes
  ... mesma forma ...
);
create table continuity_hair_makeup (    -- character, state, changes, notes
  ... mesma forma ...
);
create table continuity_set_dressing (   -- element, position, state, notes
  ... mesma forma ...
);
```

### 4.3.1 Relatório de Progresso da Diária (migration `0007`)

O balanço do dia que a produção consome — o documento que o levantamento de `2026-08-10`
descobriu faltando por inteiro ([continuity.md §7](../features/continuity.md#7-o-que-a-prática-exige--levantamento)).

**Só o que exige mão humana tem coluna** ([ADR-034](../decisions.md#adr-034--o-relatório-de-progresso-guarda-só-o-que-exige-mão-humana)).
Cenas rodadas, setups, takes, cartões e rolls são derivados dos registros do dia; guardá-los
aqui daria dois números para o mesmo fato, e o guardado seria sempre o mais velho.

```sql
create table daily_progress_report (
  id                uuid primary key,          -- derivado da diária (ADR-019)
  production_id     uuid not null references productions(id) on delete cascade,
  shooting_day_id   uuid not null references shooting_days(id) on delete cascade,
  first_take_at     time,        -- ninguém preenche takes.started_at em set; isto sim
  pages_shot        text,        -- "2 4/8" — a soma vive no domínio, pura
  estimated_minutes text,        -- "3:20"
  scenes_covered    text,        -- "24, 25A, 31" — cobertura em lista, não em tabela
  scenes_partial    text,
  scenes_skipped    text,
  scenes_added      text,
  notes             text,
  signed_by         text,
  <audit>,
  unique (shooting_day_id)       -- uma diária tem um balanço, não dois
);
```

**Páginas em oitavos não têm coluna.** `scenes.page` continua texto livre ("2 4/8"), e a
conversão é [`domain/platform/paginas.ts`](../../domain/platform/paginas.ts) — puro e testado.
Um inteiro guardado ao lado do texto seria cache do dado ao lado do próprio dado, e a soma
acontece no wrap, dentro da fronteira offline, sobre algumas dezenas de cenas (ADR-034).

### 4.4 Equipamentos

```sql
create table equipment (
  id            uuid primary key,
  production_id uuid not null references productions(id) on delete cascade,
  department    department not null,
  category      equipment_category not null,
  manufacturer  text, model text, serial_number text, nickname text, notes text,
  <audit>
);

-- "O que estamos usando hoje?" (§23)
create table equipment_assignments (
  id              uuid primary key,
  production_id   uuid not null references productions(id) on delete cascade,
  equipment_id    uuid not null references equipment(id) on delete cascade,
  shooting_day_id uuid references shooting_days(id) on delete cascade,
  member_id       uuid references production_members(id),
  department      department not null,
  label           text,        -- "Boom principal", "A CAM body"
  notes           text,
  <audit>
);
```

### 4.5 Fotografias — não existem na v1

A tabela `photos` foi **removida** desta especificação
([ADR-022](../decisions.md#adr-022--sem-fotografias-na-v1)). Não há tabela, não há coluna, não
há blob storage e não há upload. Quando/se voltar, o formato natural é `subject_type` +
`subject_id` sobre cena/setup/take — mas nada disso é implementado agora.

### 4.6 Log de sincronização

```sql
create table sync_log (
  seq           bigserial primary key,      -- cursor monotônico do pull incremental
  production_id uuid not null references productions(id) on delete cascade,
  entity_type   text not null,
  entity_id     uuid not null,
  operation     sync_op not null,
  version       integer not null,
  actor_id      uuid references users(id),
  at            timestamptz not null default now()
);
create index on sync_log (production_id, seq);
```

Escrito por trigger em todas as tabelas de domínio. É a espinha dorsal do pull incremental —
detalhes em [synchronization.md](synchronization.md).

### Os dois triggers

Implementados em [`drizzle/0001_triggers.sql`](../../drizzle/0001_triggers.sql), única parte do
schema escrita à mão (o Drizzle não modela função nem trigger):

| Trigger             | Quando                   | Faz                                                |
| ------------------- | ------------------------ | -------------------------------------------------- |
| `<tabela>_touch`    | `before update`          | `updated_at = now()` e `version = old.version + 1` |
| `<tabela>_sync_log` | `after insert or update` | grava a linha do cursor                            |

Três decisões dentro deles:

- **O incremento de `version` é do banco.** Deixá-lo a cargo da aplicação é confiar que todo
  caminho de escrita se lembrou — e um único esquecimento produz duas versões iguais com
  conteúdos diferentes.
- **`entity_type` guarda o nome da tabela** (`camera_take_data`), não o nome da entidade no
  cliente (`cameraTakeData`). A tradução é do cliente; o banco não conhece a convenção de nomes
  do TypeScript.
- **Soft delete vira `DELETE` no log**, detectado pela transição `deleted_at` null → não-null.
  Registrá-lo como `UPDATE` faria os outros dispositivos nunca saberem que o registro sumiu.

Aplicados em laço sobre uma lista de **19** tabelas — 18 da `0001` mais
`daily_progress_report`, ligada à mão na `0007`. Ficam de fora, de propósito: `users` (não
pertence a produção), `production_member_departments` (tabela de ligação, sincroniza com o
membro) e o próprio `sync_log`.

> Tabela de domínio nova **precisa** dos dois triggers na mesma migration que a cria. Sem
> `write_sync_log`, o registro grava localmente, entra na fila, sobe para o servidor e nunca
> volta para os outros dispositivos — e o sintoma é cruel, porque funciona perfeitamente no
> aparelho de quem escreveu. `npm run test:db` conta os triggers justamente por isso.

> **Rodada 2:** o `sync_log` **não** guarda a lista de chaves alteradas por operação. A versão
> anterior precisava disso para detectar sobreposição de campos; com o delta `{ de, para }` do
> [ADR-018](../decisions.md#adr-018--conflito-por-compare-and-set-de-campo), o servidor compara
> com o valor atual e o log volta a ser **só cursor**.

> **Por que `bigserial` e não `updated_at`:** relógio de cliente não é confiável, e mesmo o do
> servidor pode empatar em milissegundos. Um cursor monotônico do próprio banco elimina a
> classe inteira de bug "mudança perdida porque dois updates caíram no mesmo timestamp".

### 4.7 Índices que não são opcionais

```sql
create index on production_members (user_id);            -- "minhas produções"
create index on scenes  (production_id, number, block);
create index on setups  (production_id, shooting_day_id);
create index on takes   (production_id, setup_id, number);
create index on camera_take_data     (production_id, take_id);
create index on sound_take_data      (production_id, take_id);
create index on continuity_take_data (production_id, take_id);
-- busca global (§35)
create index on scenes using gin (to_tsvector('portuguese',
        coalesce(number,'')||' '||coalesce(block,'')||' '||coalesce(description,'')));
```

### 4.8 Contador de rate limit (migration `0008`, Fase 10)

```sql
create table rate_limits (
  id            uuid primary key default gen_random_uuid(),
  key           text    not null unique,
  count         integer not null,
  last_request  bigint  not null      -- epoch em milissegundos
);
create index on rate_limits (last_request);
```

**Por que tabela e não memória.** O padrão da Better Auth é contar em memória, e em memória
o limite praticamente não existe aqui: cada instância serverless tem a sua, então "cinco
tentativas por minuto" vira cinco por minuto **por instância** — e quem está adivinhando um
código de convite ganha o paralelismo de graça. Com uma tabela o contador é um só, e é um só
lugar para olhar quando alguém reclamar de ter sido barrado.

Ela **não é tabela de domínio**, e nada das convenções da §2 se aplica: sem `production_id`,
sem auditoria, sem soft delete, sem `version` e sem trigger de `sync_log` — contador de
tentativa não sincroniza para aparelho nenhum. É schema da Better Auth, como `sessions` e
`verifications`, e a única coisa acrescentada é o índice em `last_request`, para a limpeza
periódica não varrer a tabela inteira.

`last_request` é `bigint` e não `timestamptz` porque é o que a biblioteca grava e lê;
traduzir nos dois sentidos a cada requisição só criaria uma chance de erro. `integer` não
serve: epoch em milissegundos estoura o `int4` desde 1970.

A unicidade de `key` não é enfeite — sem ela, duas requisições simultâneas criam duas linhas
para a mesma chave e o limite passa a valer o dobro exatamente sob carga, que é quando ele
precisa valer. Verificado por `npm run test:db`.

**Poda.** É uma linha por chave, e chave nova a cada IP: sem limpeza a tabela só cresce.
`lib/auth/limite.ts` apaga o que passou de 24 h junto do resgate de código de convite — uma
operação rara, então a faxina não mora num caminho quente, e o `delete` é a varredura de
índice que o `last_request` existe para servir. Vinte e quatro horas cobrem com folga a janela
mais longa em uso (uma hora), e quem foi podado já teria recomeçado a contagem de qualquer
jeito. Se um dia isso não bastar, o lugar certo é um cron, não uma poda mais agressiva no
caminho da requisição.

---

## 5. Camada de acesso

```
lib/db/
├── client.ts        # conexão Neon (server-only)
├── schema/          # tabelas Drizzle, um arquivo por agregado
│   ├── auth.ts  production.ts  shooting.ts
│   └── camera.ts  sound.ts  continuity.ts  equipment.ts  sync.ts
└── queries/         # funções tipadas — ÚNICO lugar com SQL
    ├── productions.ts  members.ts  takes.ts  sync.ts …
```

Regras:

- `lib/db/**` começa com `import 'server-only'`. Se um componente cliente importar por
  engano, o build **falha** — a proteção é estrutural, não disciplinar.
- **Nenhum componente React importa `lib/db`.** Nem server component. Server components
  chamam `lib/db/queries/*`.
- Toda função de `queries/` recebe o **contexto de autorização** (`userId`, `productionId`)
  como parâmetro obrigatório e filtra por ele. Não existe query "sem escopo".
- Não existe `select *` que atravesse produção: todo `where` começa por `production_id`.

---

## 6. Migrations

```
drizzle/                 # SQL versionado, gerado por drizzle-kit e commitado
drizzle.config.ts
```

`drizzle-kit generate` no desenvolvimento; `drizzle-kit migrate` no deploy (etapa de build da
Vercel ou job separado). Cada migration é revisada como código — nenhuma é aplicada
automaticamente contra produção sem passar por um branch do Neon antes.

---

## 7. Segurança

Detalhe em [permissions.md](permissions.md). O que é responsabilidade **do banco**:

1. `DATABASE_URL` só existe no ambiente de servidor; nunca `NEXT_PUBLIC_`.
2. `on delete cascade` em tudo que pende de `productions` — sair de uma produção não deixa
   órfão.
3. Toda tabela carrega `production_id` para que **qualquer** query possa ser filtrada por
   escopo em um único predicado — inclusive as de sync.
4. A autorização é aplicada na camada `lib/db/queries` (checagem de `production_members`
   antes de qualquer leitura/escrita), e **fica lá**. Row Level Security foi avaliada na
   Fase 10 e **recusada** ([ADR-038](../decisions.md#adr-038--o-limite-de-tentativas-mora-no-banco-rls-fica-de-fora-e-a-sessão-longa-se-paga-com-revogação)):
   RLS protege contra uma conexão que chega ao banco **com identidade de usuário**, e não
   é o que existe aqui — o driver serverless usa uma conexão de aplicação única e o
   `user_id` chega como argumento da query, não pela conexão. Ligá-la assim daria ou um
   `set local` por requisição, que o driver HTTP não sustenta sem transação interativa, ou
   uma política que aceita tudo: segurança de fachada, pior que nenhuma, porque muda o que
   as pessoas acham que está protegido. Volta à mesa se algum dia houver acesso direto ao
   banco por identidade.
5. O limite de tentativas é do banco, não da memória do processo — §4.8 e ADR-038.
