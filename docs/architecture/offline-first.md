# Offline — fronteira, banco local e PWA

> **Revisado na rodada 2.** A estratégia deixou de ser "offline-first absoluto" e passou a ser
> **offline capable + synchronization**, delimitada por uma fronteira explícita
> ([ADR-016](../decisions.md#adr-016--fronteira-offline-explícita)). O capítulo de fotografias
> foi **removido** ([ADR-022](../decisions.md#adr-022--sem-fotografias-na-v1)).

---

## 1. A fronteira

A pergunta não é "o app funciona offline?". É **"o que precisa funcionar offline?"** — e a
resposta é uma só: **preencher a diária**. Login, criar produção, entrar por código, gerenciar
membros e ler relatório de produção encerrada são operações de preparação, feitas com sinal e
sentado, nunca com a claquete batendo.

```
┌─ SUPERFÍCIE DE DIÁRIA ─────────────────┐   ┌─ RESTO DA PLATAFORMA ───────────┐
│ fonte de verdade: BANCO LOCAL           │   │ fonte de verdade: SERVIDOR       │
│                                         │   │                                  │
│ ShootingDay (fixadas)                   │   │ auth / sessão                    │
│ Scene · Setup · Take                    │   │ Production · membros · papéis    │
│ CameraTakeData                          │   │ criar produção · entrar por      │
│ SoundTakeData · SoundTakeTrack          │   │   código · convites              │
│ ContinuityTakeData (+ props, figurino,  │   │ catálogo de equipamento (edição) │
│   cabelo/maquiagem, cenografia)         │   │ relatórios de diárias fechadas   │
│ CameraUnit e equipamento (leitura)      │   │ busca global · configurações     │
│                                         │   │                                  │
│ escreve offline · outbox · sync         │   │ fetch normal · exige rede        │
└─────────────────────────────────────────┘   └──────────────────────────────────┘
```

> **Invariante:** nenhuma interação de **preenchimento** pode depender de rede. Fora da
> fronteira, depender de rede é normal e esperado.

Duas regras duras, ambas verificáveis em revisão de PR:

1. **Dentro da fronteira não existe `fetch`.** Os módulos de departamento conhecem apenas
   `lib/offline/repos/*`; quem fala com o servidor é `lib/sync`.
2. **Fora da fronteira não existe Dexie.** Aquelas telas são Next.js comum — Server Components
   lendo Drizzle — e podem exigir rede.

O ganho não é ideológico: o Dexie cai de ~20 para ~9 tabelas de domínio, e o schema local, o
snapshot, o pull e a resolução de conflito encolhem na mesma proporção. **A maior parte da
plataforma volta a ser um CRUD.**

---

## 2. Banco local

### Avaliação

| Opção               | Volume | Índice | Transação | Reativo            | Peso      |
| ------------------- | ------ | ------ | --------- | ------------------ | --------- |
| LocalStorage (hoje) | ~5 MB  | ❌     | ❌        | via evento próprio | 0         |
| IndexedDB cru       | GBs    | ✅     | ✅        | ❌ manual          | 0         |
| `idb` (wrapper)     | GBs    | ✅     | ✅        | ❌                 | ~1 kB     |
| **Dexie**           | GBs    | ✅     | ✅        | ✅ `liveQuery`     | ~25 kB gz |

LocalStorage está descartado por ser síncrono (trava a UI ao escrever a base inteira) e por não
suportar transação — e é a transação que sustenta a garantia mais importante do sistema (§2.2).

Entre IndexedDB cru e Dexie, a diferença não é açúcar sintático: é **upgrade versionado de
schema**, **transações declarativas**, **índices compostos** e `liveQuery` — reatividade que já
funciona **entre abas**. Sem isso seria preciso reimplementar à mão o que `lib/storage.ts` faz
hoje com `CustomEvent`, só que sobre uma API assíncrona bem mais hostil e com a fila de sync no
mesmo banco.

### Decisão

> **Dexie** (+ `dexie-react-hooks` para `useLiveQuery`), aplicado **só dentro da fronteira**.

Exceção consciente à regra de zero dependências, registrada em
[ADR-003](../decisions.md#adr-003--dexie-como-banco-local). A regra vale para o que é trivial
(ícone, uuid, `cn`, PDF) e continua valendo. Um banco local transacional não é trivial, e errar
nele significa perder o boletim de um dia de filmagem.

### Schema local

Banco `bdc-platform`:

```ts
// lib/offline/db.ts (Fase 4)
── domínio (espelho parcial: só o que está fixado) ──
shootingDays        id, productionId, date
scenes              id, productionId, [number+block]
setups              id, productionId, sceneId, shootingDayId, sortOrder
takes               id, productionId, setupId, [setupId+number]
cameraTakeData      id, productionId, takeId, [takeId+cameraUnitId]
soundTakeData       id, productionId, takeId
soundTakeTracks     id, productionId, takeId, [takeId+index]
continuityTakeData  id, productionId, takeId
continuityDetails   id, productionId, takeId, kind   ← props/figurino/cabelo/cenografia

── referência somente leitura, vinda do snapshot ──
refs                key                              ← cameraUnits, equipamento, membros

── infraestrutura ──
outbox          id, productionId, status, createdAt, [entityType+entityId]
syncConflicts   id, productionId, status, [entityType+entityId+field]
meta            key                                  ← cursor, pins, versões, identidade
```

Regras:

- **Ids vêm do cliente** e são definitivos. Onde há chave natural (cena, setup, take,
  `*TakeData`), são **derivados** dela — ver
  [ADR-019](../decisions.md#adr-019--ids-determinísticos-por-chave-natural). Não existe id
  temporário nem remapeamento na sincronização, que é a fonte clássica de referência quebrada.
- Toda entidade guarda `version`, `updatedAt`, `updatedBy`, `deletedAt` e `_dirty`.
- Soft delete local também, pelo mesmo motivo do servidor: um delete precisa ser propagável.
- **Não existe tabela de blobs.** Não há fotos na v1.

### Repositórios

`lib/offline/repos/*.ts` é a única camada que toca no Dexie — mesmo papel de `lib/storage.ts`
hoje. Nenhum componente chama `db.takes.put()` diretamente.

Toda escrita passa por uma transação única que faz **as duas coisas juntas**:

```ts
await db.transaction('rw', db.takes, db.outbox, async () => {
  await db.takes.put(next); // 1. estado local
  await enqueue('UPDATE', 'take', delta); // 2. intenção de sync
});
```

Isso não é detalhe de implementação: se a escrita local e o enfileiramento não forem atômicos,
existe uma janela em que o dado está salvo mas nunca será sincronizado — e ninguém percebe até
o fim da diária.

---

## 3. Fixação (pin) da diária

É o que impede a fronteira de virar armadilha (risco R2b).

- Abrir uma diária a **fixa**: snapshot completo no Dexie, permanente.
- Estando online, a produção ativa fixa **automaticamente** a diária de hoje e a de amanhã, em
  background. Chegar na locação com a diária baixada é o caso normal, não a sorte.
- **Criar diária offline funciona**: o id é derivado de `(productionId, date)`, então sincroniza
  depois e converge com a que outro dispositivo tiver criado para o mesmo dia.
- Diária não fixada e sem rede mostra estado explícito — _"Esta diária ainda não foi baixada.
  Conecte-se uma vez para trabalhar nela offline."_ — e não uma tela de erro.
- Desfixar é manual e só é oferecido com a fila vazia.

---

## 4. Reatividade

`useLiveQuery` substitui o `subscribe()` atual. Ganho direto: já funciona entre abas e entre
janelas do PWA, sem o `CustomEvent` + evento `storage` de hoje.

O contrato do `useBoletim` (auto-save com debounce de 500 ms, flush no unmount, estado
`idle/saving/saved`) é **preservado**; muda só o destino da escrita. Isso importa porque é esse
contrato que faz o app não ter botão salvar — comportamento validado em set.

---

## 5. Modos de operação

| Modo                    | Condição                       | Comportamento                                              |
| ----------------------- | ------------------------------ | ---------------------------------------------------------- |
| **LEGADO**              | `/legado`, sem conta           | O app de hoje, intacto: LocalStorage, offline, PDF, backup |
| **OFFLINE AUTENTICADO** | conta + diária fixada          | Tudo editável; outbox acumula; indicador de pendências     |
| **ONLINE**              | conta + rede                   | Push/pull ativos; polling adaptativo                       |
| **SÓ LEITURA**          | `VIEWER`, ou permissão perdida | Edição desabilitada; leitura local mantida                 |

A plataforma **exige conta** ([ADR-025](../decisions.md#adr-025--conta-obrigatória-na-plataforma-legado-sem-conta));
o login precisa de rede uma vez, e a sessão persiste — nunca é reverificada para editar.
Trocar de modo nunca apaga dado local.

---

## 6. Estado de conectividade

Três eixos independentes, um indicador só:

```
NETWORK           navigator.onLine   → apenas GATILHO, nunca verdade
SERVER_REACHABLE  último push/pull   → ALCANÇÁVEL após sucesso; INALCANÇÁVEL após 2 falhas
SYNC              fila + conflitos   → IDLE · SYNCING · PENDING(n) · CONFLICT(n) · ERROR
```

`navigator.onLine` é notoriamente otimista: Teradek e captive portal de locação reportam
"online" sem internet. A verdade é **o resultado da última requisição**, e o próprio pull
periódico serve de sonda — não há endpoint de heartbeat.

| Indicador                | Significado                                 |
| ------------------------ | ------------------------------------------- |
| ● Sincronizado           | fila vazia, servidor alcançável             |
| ⟳ Sincronizando          | push ou pull em andamento                   |
| ● Pendências (n)         | online, n operações na fila                 |
| ○ Offline · n pendências | sem servidor; edição normal                 |
| ▲ Conflitos (n)          | n campos aguardando decisão                 |
| ✕ Erro de sincronização  | falhas persistentes → tela de diagnóstico   |
| ⬆ Atualize o app         | protocolo incompatível — bloqueia só o sync |

**Regra de UX: o indicador informa, nunca bloqueia.** Não existe spinner que impeça digitar,
nem "aguarde sincronizar" antes de criar o próximo take. Nem o último estado da tabela bloqueia
o preenchimento: a edição continua e a fila acumula.

---

## 7. PWA

O Service Worker atual é bom e **permanece escrito à mão**. Ajustes necessários
([ADR-026](../decisions.md#adr-026--três-versões-encadeadas)):

| Ajuste                                                         | Motivo                                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------- |
| `VERSION` gerado no build (`prebuild`)                         | Hoje é `'v1'` manual em `public/sw.js`; esquecer serve app velho |
| `APP_SHELL` gerado no build em vez de enumerado à mão          | Rotas dinâmicas (`/p/[id]/…`) e chunks não se listam à mão       |
| **Nunca** cachear `/api/**`                                    | Resposta de sync em cache é dado corrompido silencioso           |
| `registration.waiting` → aviso "Atualizar agora"               | Usuário não pode ficar preso em versão antiga                    |
| Rota de fallback para `/p/**` offline                          | Navegação direta para uma produção sem rede precisa abrir        |
| Manter navegação network-first + assets stale-while-revalidate | Estratégia atual está correta                                    |

**O que o Service Worker não faz:** guardar dado de produção. Dado de produção vive no
IndexedDB, estruturado. Cache HTTP guarda **casca**, nunca conteúdo.

---

## 8. Durabilidade

Camadas de proteção contra perda de dado, da mais frequente para a mais rara:

1. Escrita local **imediata e transacional** a cada alteração.
2. Flush no `unmount` e em `visibilitychange` (usuário fecha o PWA no meio da diária).
3. Outbox persistida — sobrevive a fechar o app, reiniciar o aparelho e dias sem rede.
4. `navigator.storage.persist()` solicitado no primeiro login.
5. Export JSON manual, offline — rede de segurança do usuário.
6. Servidor, quando alcançável.

Cenário de teste obrigatório, antes de cada release:

```
offline → cria take → fecha o PWA → reabre → dado presente
        → volta a rede → sincroniza → outro dispositivo recebe
```
