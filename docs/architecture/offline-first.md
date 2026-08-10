# Offline-first

O app **já é** offline-first. O risco desta evolução é perder isso ao introduzir um banco
remoto. Este documento existe para tornar essa perda impossível por construção.

> **Invariante:** nenhuma interação de preenchimento em set pode depender de rede.
> Se a única cópia de um dado estiver no servidor, o design está errado.

---

## 1. Banco local

### Avaliação

| Opção               | Volume | Blobs | Índice | Transação | Reativo            | Peso      |
| ------------------- | ------ | ----- | ------ | --------- | ------------------ | --------- |
| LocalStorage (hoje) | ~5 MB  | ❌    | ❌     | ❌        | via evento próprio | 0         |
| IndexedDB cru       | GBs    | ✅    | ✅     | ✅        | ❌ manual          | 0         |
| `idb` (wrapper)     | GBs    | ✅    | ✅     | ✅        | ❌                 | ~1 kB     |
| **Dexie**           | GBs    | ✅    | ✅     | ✅        | ✅ `liveQuery`     | ~25 kB gz |

LocalStorage está descartado por três motivos independentes, qualquer um deles fatal: é
síncrono (trava a UI ao escrever a base inteira), não guarda binário (fotos são requisito §13)
e tem teto de poucos megabytes.

Entre IndexedDB cru e Dexie: a diferença não é "açúcar sintático". É **upgrade versionado de
schema**, **transações declarativas**, **consultas por índice composto** e, principalmente,
`liveQuery` — observabilidade reativa que já funciona **entre abas**. Sem isso, seria preciso
reimplementar à mão exatamente o que `lib/storage.ts` faz hoje com `CustomEvent`, só que
sobre uma API assíncrona bem mais hostil, e com fotos e fila de sync no mesmo banco.

### Decisão

> **Dexie** (+ `dexie-react-hooks` para `useLiveQuery`).

Isto é uma **exceção consciente** à regra de zero dependências de runtime, registrada em
[decisions.md](../decisions.md). A regra vale para o que é trivial de escrever (ícones, uuid,
`cn`, PDF). Um banco local transacional com migração de schema não é trivial, e errar nele
significa **perder o boletim de um dia de filmagem** — o pior modo de falha do produto.

### Schema local

Banco `bdc-platform`. Espelha o modelo remoto, mais três coleções de infraestrutura:

```ts
// lib/offline/db.ts (Fase 3)
productions        id, joinCode, name, updatedAt, _dirty
productionMembers  id, productionId, userId, role, department
shootingDays       id, productionId, date
scenes             id, productionId, [number+block]
setups             id, productionId, sceneId, shootingDayId, sortOrder
takes              id, productionId, setupId, [setupId+number]
cameraTakeData     id, productionId, takeId, [takeId+cameraUnitId]
soundTakeData      id, productionId, takeId
soundTakeTracks    id, productionId, takeId, [takeId+index]
continuityTakeData id, productionId, takeId
continuityProps / Wardrobe / HairMakeup / SetDressing
cameraUnits · equipment · equipmentAssignments · photos

── infraestrutura ──
outbox     id, userId, productionId, status, createdAt   ← fila de sync (§18)
blobs      id (photoId), blob, uploadedAt                ← binários das fotos
meta       key                                           ← cursores, identidade, flags
```

Regras:

- **Ids são UUID gerados no cliente.** Um take criado offline já nasce com o id definitivo;
  não existe id temporário nem remapeamento na sincronização — que é a fonte clássica de
  referência quebrada em sistemas offline.
- Toda entidade guarda `version`, `updatedAt`, `updatedBy` e `_dirty` (há mudança local
  ainda não confirmada pelo servidor).
- Soft delete local também (`deletedAt`), pelo mesmo motivo do servidor: um delete precisa
  ser propagável.
- Os binários ficam em tabela **separada** de `photos`. Assim uma consulta de metadados nunca
  arrasta megabytes de imagem para a memória.

### Repositórios

`lib/offline/repos/*.ts` é a única camada que toca no Dexie — mesmo papel que `lib/storage.ts`
tem hoje. Nenhum componente chama `db.takes.put()` diretamente.

Toda escrita passa por uma transação única que faz **as duas coisas juntas**:

```ts
await db.transaction('rw', db.takes, db.outbox, async () => {
  await db.takes.put(next); // 1. estado local
  await enqueue('UPDATE', 'take', next); // 2. intenção de sync
});
```

Isso não é detalhe de implementação: se a escrita local e o enfileiramento não forem atômicos,
existe uma janela em que o dado está salvo mas nunca será sincronizado — e ninguém percebe
até o fim da diária.

---

## 2. Reatividade

`useLiveQuery` substitui o `subscribe()` atual. Ganho direto: já funciona entre abas e entre
janelas do PWA, sem o `CustomEvent` + evento `storage` que existe hoje.

O contrato do `useBoletim` (auto-save com debounce de 500 ms, flush no unmount, estado
`idle/saving/saved`) é **preservado**; muda só o destino da escrita. Isso importa porque esse
contrato é o que faz o app não ter botão salvar — comportamento validado em set.

---

## 3. Fotografias

Requisito §13: funcionam offline. Fotos de continuidade são tiradas exatamente onde não há
sinal.

```
Foto tirada (input capture / câmera)
        │
        ├─► redimensiona e comprime no cliente (canvas → WebP/JPEG, lado maior ~2000px)
        │
        ├─► db.blobs.put({ id, blob })            ← binário, local
        ├─► db.photos.put({ id, …metadados, storageKey: null })
        └─► outbox: CREATE photo  +  UPLOAD blob
                    │
              (quando online)
                    ├─ 1. upload do binário → Vercel Blob → storageKey/remoteUrl
                    └─ 2. PATCH photo com a chave
```

Decisões:

- **Binário nunca vai para o Postgres.** Blob storage guarda o arquivo; o Postgres guarda a
  chave. Postgres com imagens vira backup caro, lento e difícil de replicar.
- **Compressão antes de guardar**, não antes de subir. Um iPhone gera 4–8 MB por foto; uma
  diária de continuidade passa fácil de 200 fotos. Comprimir na captura mantém o banco local
  em dezenas de megabytes em vez de gigabytes.
- **Upload é operação separada da criação do registro.** A foto aparece na UI imediatamente
  (via `URL.createObjectURL` do blob local), independentemente do upload.
- **O blob local só é descartado** após confirmação do upload **e** apenas sob pressão de
  cota — enquanto houver espaço, a cópia local fica, porque é ela que serve offline.
- **Cota**: `navigator.storage.estimate()` monitorado; aviso ao usuário em ~80 % e sugestão de
  exportar a diária. `navigator.storage.persist()` solicitado no primeiro login para reduzir
  risco de despejo pelo navegador.

---

## 4. Modos de operação

| Modo                    | Condição                       | Comportamento                                           |
| ----------------------- | ------------------------------ | ------------------------------------------------------- |
| **LOCAL**               | sem conta                      | Idêntico à v1. Sem sala, sem sync. Backup JSON funciona |
| **OFFLINE AUTENTICADO** | conta + sem rede               | Tudo editável; outbox acumula; indicador "pendências"   |
| **ONLINE**              | conta + rede                   | Push/pull ativos; realtime quando disponível            |
| **SÓ LEITURA**          | `VIEWER`, ou permissão perdida | Edição desabilitada; leitura offline mantida            |

Trocar de modo **nunca** apaga dado local. Ir de LOCAL para ONLINE é uma migração aditiva
(ver [local-to-cloud.md](../migrations/local-to-cloud.md)).

---

## 5. PWA

O Service Worker atual é bom e **permanece escrito à mão**. Ajustes necessários:

| Ajuste                                                         | Motivo                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Gerar o `APP_SHELL` no build em vez de enumerar rotas à mão    | Rotas dinâmicas (`/p/[id]/…`) e chunks não podem ser listados manualmente |
| **Nunca** cachear `/api/**`                                    | Resposta de sync em cache é dado corrompido silencioso                    |
| Bump de `VERSION` automatizado no build                        | Hoje é manual; um esquecimento serve app velho indefinidamente            |
| Rota de fallback para `/p/**` offline                          | Navegação direta para uma produção sem rede precisa abrir                 |
| Manter navegação network-first + assets stale-while-revalidate | Estratégia atual está correta                                             |

**O que o Service Worker não faz:** guardar dado de produção. §27 é explícito — dado de
produção vive no IndexedDB, estruturado. Cache HTTP guarda **casca**, nunca conteúdo.

### Indicador de conectividade

`useOnlineStatus` já existe e vira a base de um estado mais rico, exibido no header e no
dashboard (§24):

```
ONLINE · OFFLINE · SINCRONIZANDO · PENDÊNCIAS (n) · CONFLITO (n) · ERRO
```

`navigator.onLine` é notoriamente otimista (rede de set com captive portal ou Teradek reporta
"online" sem internet). O estado real vem de **o último push/pull ter tido sucesso**, com
`navigator.onLine` apenas como gatilho para tentar.

---

## 6. Durabilidade

Camadas de proteção contra perda de dado, da mais frequente para a mais rara:

1. Escrita local **imediata e transacional** a cada alteração.
2. Flush no `unmount` e em `visibilitychange` (usuário fecha o PWA no meio da diária).
3. Outbox persistida — sobrevive a fechar o app, reiniciar o aparelho e ficar dias sem rede.
4. `bdc:boletins:v1` do LocalStorage **preservado** como snapshot pré-migração.
5. Export JSON manual continua disponível offline (rede de segurança do usuário).
6. Servidor, quando alcançável.

Cenário de teste obrigatório (§39), a rodar antes de cada release:

```
offline → cria take → fecha o PWA → reabre → dado presente
        → volta a rede → sincroniza → outro dispositivo recebe
```
