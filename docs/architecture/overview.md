# Arquitetura proposta

Como o _Boletim Diário de Câmera_ (PWA local, single-user) se torna o **Boletim Audiovisual**
— uma plataforma colaborativa de documentação de diária audiovisual — sem regredir em
funcionalidade e sem que a rede vire requisito para preencher.

Pré-requisito de leitura: [current-state.md](current-state.md). Decisões da rodada 2 (fronteira
offline, conflitos, polling, sem fotos): [plano-arquitetural-v2.md](../plano-arquitetural-v2.md).

---

## 1. Princípio arquitetural central

> **Não são três aplicativos. É uma plataforma com três módulos sobre a mesma diária.**

Câmera, Som e Continuidade compartilham **uma única** unidade de produção:

```
Cena → Setup → Take
```

Cada departamento **anexa seus dados a esse mesmo Take**; nenhum departamento cria a sua
própria cópia de cena/take. Concretamente:

```
Take (compartilhado)
├── CameraTakeData      ← escrito pelo departamento de Câmera (1 por câmera, multicam)
├── SoundTakeData       ← escrito pelo departamento de Som
└── ContinuityTakeData  ← escrito pela Continuidade
```

Três consequências que valem mais que a regra em si:

1. **A duplicação some por construção**, não por convenção. Não existe caminho no código em
   que Som crie uma cena "24B" própria — ele só pode escrever em um `Take` que já existe.
2. **A maior parte dos conflitos some junto.** Departamentos escrevem em tabelas disjuntas;
   Câmera e Som editando o mesmo take simultaneamente não conflitam. O que sobra é conflito
   _dentro_ de um departamento — muito mais raro e tratável.
3. **Quem cria o Take é quem chegar primeiro.** Normalmente Câmera ou Continuidade, mas a
   operação é a mesma para os três, e é idempotente por `(setupId, number)`.

---

## 2. Camadas

```
                            VERCEL
                              │
                    ┌─────────┴─────────┐
                    │   Next.js App     │
                    └─────────┬─────────┘
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   Route Handlers        Server Actions          UI / PWA
   (/api/sync/*)         (mutações simples)      (client components)
        │                     │                     │
        └──────────┬──────────┘                     │
                   │                                │
            lib/auth  ·  lib/db (Drizzle)      lib/offline (Dexie)
                   │                                │
                   │                          lib/sync (outbox)
                   │                                │
                   └────────── Sync Layer ──────────┘
                                   │
                          Neon PostgreSQL
```

**Regra dura, delimitada pela fronteira offline**
([ADR-016](../decisions.md#adr-016--fronteira-offline-explícita)): a UI **nunca** contém SQL, e
**dentro da superfície de diária** ela também nunca fala com o servidor.

```
DENTRO DA FRONTEIRA                          FORA DA FRONTEIRA
(diária: cena, setup, take, *TakeData)       (auth, produções, membros, relatórios)

Componente React                             Server Component / Server Action
      ↓ (lê/escreve)                                ↓
lib/offline  (Dexie)  ← fonte de verdade      lib/auth  →  lib/db (Drizzle)
      ↓ (enfileira, mesma transação)                ↓
lib/sync     (outbox + pull por cursor)        Neon Postgres
      ↓ (HTTP)
/api/sync    (autoriza, valida, resolve conflito)
      ↓
lib/db (Drizzle)  →  Neon Postgres
```

Duas regras verificáveis em revisão de PR:

1. **Dentro da fronteira não existe `fetch`** — os módulos de departamento conhecem apenas
   `lib/offline/repos/*`.
2. **Fora da fronteira não existe Dexie** — aquelas telas são Next.js comum e podem exigir rede.

Isso é o que garante o requisito que importa: **rede nunca é necessária para preencher**. Se a
Sync Layer nunca conseguir subir nada, a diária continua sendo preenchida do começo ao fim.

---

## 3. Estrutura de pastas

Mantém a organização atual (`app/`, `components/`, `features/`, `hooks/`, `lib/`, `utils/`) —
nada é movido para `src/`, porque isso quebraria todos os imports `@/…` sem ganho real.
O que entra é aditivo:

```
app/
├── (public)/                  # login, cadastro, recuperação de senha
├── (app)/                     # rotas privadas (layout com guarda de sessão)
│   ├── producoes/             # minhas produções
│   ├── p/[productionId]/
│   │   ├── sala/              # dashboard da sala           §15 §24
│   │   ├── diaria/[dayId]/
│   │   │   ├── camera/        # Boletim de Câmera
│   │   │   ├── som/           # Boletim de Som
│   │   │   ├── continuidade/  # Boletim de Continuidade
│   │   │   └── consolidado/   # visão integrada da diária   §33 §34
│   │   ├── equipamentos/
│   │   ├── buscar/            # busca global na produção    §35
│   │   └── membros/
│   └── legado/                # boletins locais não migrados (compatibilidade)
├── api/
│   ├── auth/[...all]/         # handler da lib de auth
│   └── sync/                  # snapshot · push · pull
├── editar · visualizar · novo # ROTAS ATUAIS — preservadas
└── offline/

domain/                        # ⬅ modelo compartilhado, PURO (sem I/O, sem React, sem deps)
└── platform/
    ├── enums.ts               # Department, MemberRole, TakeStatus, EquipmentCategory…
    ├── types.ts               # Production, ShootingDay, Scene, Setup, Take, *TakeData…
    ├── factory.ts             # criação + herança + incremento + reset de take
    └── from-boletim.ts        # Boletim v2 → modelo da plataforma

features/
├── camera/                    # ← features/boletins atual, migrado na Fase 5   ┐
├── sound/                                                                      ├ dentro
├── continuity/                                                                 ┘ da fronteira
├── production/                # sala, membros, dashboard, equipamentos  ← fora
├── sync/                      # indicador, pendências, conflitos
└── backup/

lib/
├── db/                        # Drizzle: schema, client Neon, queries (server-only)
├── auth/                      # config, guardas de servidor, helpers de sessão
├── contracts/                 # schemas Zod compartilhados (cliente + servidor)
├── offline/                   # Dexie: schema local, repositórios, fixação de diária
├── sync/                      # outbox, snapshot, pull, merge, conflitos, protocolo
├── reports/                   # geração de PDF/CSV por módulo + consolidado
└── (storage · normalize · factory · backup · seed)   ← ATUAIS, intocados (legado)
```

Não existe `lib/offline/photos` nem tabela de blobs: não há fotos na v1
([ADR-022](../decisions.md#adr-022--sem-fotografias-na-v1)).

Por que `domain/` fora de `lib/`: é o único código que roda **nos três lugares** (browser,
route handler, script de migração) e que **não pode** importar nem Dexie, nem Drizzle, nem
React. Deixá-lo em `lib/` convidaria a acoplar. Ele é a fronteira semântica do produto.

---

## 4. Conceito de Sala

**Decisão: `Sala` não é uma entidade separada. Sala é a projeção colaborativa de uma
`Production`.** Uma produção tem exatamente uma sala; a "sala" é a tela, não a tabela.

Motivo: criar `Room` ao lado de `Production` produziria imediatamente a pergunta "uma produção
pode ter duas salas?" — e a resposta, no fluxo real de set, é não. Duas salas seriam duas
produções. Modelar isso como uma entidade extra só adicionaria um join e uma classe de bug
(dados na produção errada dentro da sala certa).

O que a sala exige da `Production`:

| Campo         | Uso                                                           |
| ------------- | ------------------------------------------------------------- |
| `joinCode`    | `FILMEX-8K2P` — código curto de convite, rotacionável         |
| `joinEnabled` | permite fechar a sala sem trocar o código                     |
| `members[]`   | `ProductionMember` com **papel** e **departamento** separados |

Entrar/sair/listar membros é operação sobre `production_members`.
Detalhes em [permissions.md](permissions.md).

---

## 5. Cena, Setup e Take — a decisão de modelagem mais importante

O app atual tem **quatro** níveis: `Cena → Bloco(letra) → Plano → Take`.
O modelo alvo tem **três**: `Scene → Setup → Take`.

O mapeamento não é óbvio, então fica registrado:

| Atual                         | Novo                             | Por quê                                                                                                                                          |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Cena.numero` + `Bloco.letra` | **`Scene`** (`number` + `block`) | Na claquete, "24" + "B" é lido como **cena 24B** — é esse par que identifica a cena no set, e é exatamente a "Cena 24B" dos exemplos do briefing |
| `Plano`                       | **`Setup`**                      | O `Plano` já carrega câmera, lente, T-stop, ISO, fps — ele **é** o setup de câmera                                                               |
| `Take`                        | **`Take`**                       | 1:1                                                                                                                                              |

Portanto `Cena 24` com blocos A/B/C vira três `Scene` (`24A`, `24B`, `24C`) que compartilham
`number = "24"`. A UI agrupa por `number` quando quiser mostrar "Cena 24" inteira.

**Tradeoff aceito:** metadados de continuidade que pertencem à cena como um todo (página,
story day, INT/EXT) ficam repetidos entre os blocos da mesma cena. É duplicação de _metadado
descritivo_, não de _unidade de gravação_ — não gera a inconsistência que o §9 do briefing
proíbe, e evita um quarto nível que os outros dois departamentos não usam.

Uma cena gravada em dois dias **não** é duplicada: `Scene` pertence à produção, e é o `Setup`
que pertence à diária (`shootingDayId`). Isso resolve corretamente o caso "cena 24B continua
amanhã".

O modelo em código: [`domain/platform/types.ts`](../../domain/platform/types.ts).
O mapeamento executável e testado: [`domain/platform/from-boletim.ts`](../../domain/platform/from-boletim.ts).

---

## 6. Status do take

Um enum **compartilhado** (`TakeStatus`) no `Take`, e **status próprio por departamento** nos
dados de cada um:

```
TakeStatus = RECORDED · CIRCLE · NG · PARTIAL · WILD · ROOM_TONE · FALSE_START
```

`camera_take_data.status`, `sound_take_data.status` e `continuity_take_data.status` usam o
mesmo enum, mas são **independentes**: Câmera marcar `CIRCLE` não marca Som como `CIRCLE`.
O `Take.status` é o status da tomada como evento de set (o que a claquete diz); o status por
departamento é o julgamento técnico de cada um. Ambos são necessários — é comum um take ser
`CIRCLE` para o diretor e `NG` para o som.

`aprovado: boolean` do modelo atual mapeia para `CIRCLE` (e é preservado no campo
`camera_take_data.approved` para não perder a semântica "aprovado pelo diretor").

---

## 7. Decisões tecnológicas

Cada decisão tem documento próprio; o resumo e a justificativa curta:

| Área         | Escolha                                 | Alternativas descartadas                   | Documento                                         |
| ------------ | --------------------------------------- | ------------------------------------------ | ------------------------------------------------- |
| Banco remoto | **Neon Postgres** (serverless driver)   | —                                          | [database.md](database.md)                        |
| ORM          | **Drizzle**                             | Prisma (peso no edge), SQL cru (sem tipos) | [database.md](database.md)                        |
| Autenticação | **Better Auth** (e-mail+senha, Drizzle) | Auth.js v5, Clerk                          | [authentication.md](authentication.md)            |
| Banco local  | **Dexie**, só na superfície de diária   | LocalStorage, IDB cru, `idb`               | [offline-first.md](offline-first.md)              |
| Validação    | **Zod** em `lib/contracts/`             | validação manual                           | [database.md](database.md#validação)              |
| Sync         | Outbox + pull por cursor + **compare-and-set por campo** | CRDT, LWW puro, versão+histórico de chaves | [synchronization.md](synchronization.md)  |
| Realtime     | **Polling adaptativo**                  | SSE (adiado), Pusher/Ably, LISTEN/NOTIFY   | [synchronization.md](synchronization.md#6-polling) |
| Fotos        | **Fora da v1**                          | IndexedDB + Vercel Blob, base64 no Postgres | [ADR-022](../decisions.md#adr-022--sem-fotografias-na-v1) |
| PDF          | **Mantém** impressão nativa + CSS A4    | react-pdf, puppeteer                       | [features/camera.md](../features/camera.md)       |

Sobre a regra de **zero dependências de runtime**: ela é mantida como princípio, mas passa a
ter exceções **registradas**. A regra existe para evitar carregar biblioteca por preguiça em
coisa trivial (ícone, uuid, classnames, PDF) — e isso continua valendo. Não se aplica a
infraestrutura que seria irresponsável reimplementar: banco local transacional, autenticação e
ORM. Cada exceção está em [decisions.md](../decisions.md) com a razão.

---

## 8. Compatibilidade e evolução incremental

O app está em produção. Nada abaixo pode ser quebrado em nenhum momento do roadmap:

1. **As rotas atuais continuam existindo.** `/`, `/novo`, `/editar?id=`, `/visualizar?id=`
   seguem funcionando sobre LocalStorage e, a partir da Fase 5, passam a viver em `/legado` —
   ainda editáveis, ainda offline, ainda com PDF.
2. **A plataforma exige conta; o legado não**
   ([ADR-025](../decisions.md#adr-025--conta-obrigatória-na-plataforma-legado-sem-conta)). Sem
   conta não há sala, membro, permissão nem autoria de campo, e o produto começa em "entrar na
   sala". Quem quiser só preencher um boletim avulso usa o legado. O login exige rede **uma
   vez**; a sessão persiste e nunca é reverificada para editar.
3. **Nenhuma migração destrutiva.** `bdc:boletins:v1` **não é apagado**. A importação para a
   plataforma é opcional e repetível — ver
   [migrations/local-to-cloud.md](../migrations/local-to-cloud.md) e
   [ADR-023](../decisions.md#adr-023--a-migração-vira-importação-opcional).
4. **Feature flags** (`NEXT_PUBLIC_PLATFORM_*`) mantêm cada fase desligável em produção.
5. **Backup JSON continua funcionando** em ambos os formatos.
6. **Design system único** — nenhum módulo novo inventa componente que já existe
   ([ADR-024](../decisions.md#adr-024--design-system-único-o-do-boletim-de-câmera)).

---

## 9. UX de set

Restrições que valem como requisito arquitetural, não como enfeite (§28):

- Toda escrita é **local e imediata**. Nenhuma interação de preenchimento espera rede.
  Indicador de sync é informativo — **nunca** bloqueia a digitação.
- **Sem botão salvar** em lugar nenhum — o padrão do `useBoletim` atual é a referência.
- **Herança e incremento automáticos** entre takes (§29/§30) são regra de domínio, não de UI:
  ficam em `domain/platform/factory.ts`, com teste, e valem para os três módulos.
- Ações rápidas de status (`OK`/`CIRCLE`/`NG`/`WILD`/`RT`) são **um toque**, sem modal,
  sem confirmação.
- Confirmação só para operações destrutivas irreversíveis (excluir cena/setup com takes).

---

## 10. Ordem de implementação

Ver [roadmap.md](../roadmap.md). A Fase 1 (esta) entregou análise, modelagem, documentação e
decisões — e, em código, o `domain/platform/` puro com o mapeador do formato atual, sem tocar
em nada do aplicativo existente.
