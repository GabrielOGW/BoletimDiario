# Arquitetura proposta

Como o _Boletim Diário de Câmera_ (PWA local, single-user) se torna o **Boletim Audiovisual**
— uma plataforma colaborativa de documentação de diária audiovisual — sem regredir em
funcionalidade e sem perder o offline-first.

Pré-requisito de leitura: [current-state.md](current-state.md).

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

**Regra dura:** a UI nunca fala com o servidor diretamente e **nunca** contém SQL.
A UI só conhece o banco local. Quem conversa com o servidor é a Sync Layer.

```
Componente React
      ↓ (lê/escreve)
lib/offline  (Dexie)  ←── única fonte de verdade da UI
      ↓ (enfileira)
lib/sync     (outbox + pull incremental)
      ↓ (HTTP)
/api/sync    (autoriza, valida, resolve conflito)
      ↓
lib/db       (Drizzle)
      ↓
Neon Postgres
```

Isso é o que garante o requisito §16: **o banco remoto não é requisito para funcionar**.
Se a Sync Layer nunca conseguir subir nada, o app continua sendo exatamente o que é hoje.

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
│   └── sync/                  # push · pull · stream (SSE)
├── editar · visualizar · novo # ROTAS ATUAIS — preservadas
└── offline/

domain/                        # ⬅ modelo compartilhado, PURO (sem I/O, sem React, sem deps)
└── platform/
    ├── enums.ts               # Department, MemberRole, TakeStatus, EquipmentCategory…
    ├── types.ts               # Production, ShootingDay, Scene, Setup, Take, *TakeData…
    ├── factory.ts             # criação + herança + incremento + reset de take
    └── from-boletim.ts        # Boletim v2 → modelo da plataforma

features/
├── camera/                    # ← features/boletins atual, migrado na Fase 5
├── sound/
├── continuity/
├── production/                # sala, membros, dashboard, equipamentos
└── backup/

lib/
├── db/                        # Drizzle: schema, client Neon, queries por entidade
├── auth/                      # config, guardas de servidor, helpers de sessão
├── contracts/                 # schemas Zod compartilhados (cliente + servidor)
├── offline/                   # Dexie: schema local, repositórios, fotos
├── sync/                      # outbox, pull, merge, resolução de conflito
├── reports/                   # geração de PDF/CSV por módulo + consolidado
└── (storage · normalize · factory · backup · seed)   ← ATUAIS, preservados
```

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
| Banco local  | **Dexie** (IndexedDB)                   | LocalStorage, IDB cru, `idb`               | [offline-first.md](offline-first.md)              |
| Validação    | **Zod** em `lib/contracts/`             | validação manual                           | [database.md](database.md#validação)              |
| Sync         | Outbox + pull por cursor + versão       | CRDT, LWW puro                             | [synchronization.md](synchronization.md)          |
| Realtime     | SSE sobre o mesmo cursor de sync        | Pusher/Ably, LISTEN/NOTIFY                 | [synchronization.md](synchronization.md#realtime) |
| Fotos        | Blob no IndexedDB → Vercel Blob         | base64 no Postgres                         | [offline-first.md](offline-first.md#fotografias)  |
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
   seguem funcionando sobre LocalStorage até a Fase 5, e depois continuam disponíveis em
   modo somente-leitura sobre os dados já migrados.
2. **Modo local (sem conta) é um modo de primeira classe, não um degradado.** Quem não quiser
   criar conta continua usando o app como hoje. A conta habilita sala e sincronização — não é
   pedágio para abrir o próprio boletim.
3. **Nenhuma migração destrutiva.** `bdc:boletins:v1` **não é apagado** pela migração para o
   banco local; vira snapshot de recuperação. Ver
   [migrations/local-to-cloud.md](../migrations/local-to-cloud.md).
4. **Feature flags** (`NEXT_PUBLIC_PLATFORM_*`) mantêm cada fase desligável em produção.
5. **Backup JSON continua funcionando** em ambos os formatos.

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
