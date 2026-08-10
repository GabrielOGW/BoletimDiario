# Sincronização

Como as mudanças saem do dispositivo, chegam ao Neon e voltam para os outros dispositivos — sem
perder dado, sem sobrescrever ninguém em silêncio e sem exigir rede para trabalhar.

> **Revisado na rodada 2.** A detecção de conflito passou a ser **compare-and-set por campo**
> ([ADR-018](../decisions.md#adr-018--conflito-por-compare-and-set-de-campo)) e o realtime da v1
> passou a ser **polling adaptativo**, sem SSE
> ([ADR-021](../decisions.md#adr-021--polling-adaptativo-sem-sse-na-v1)).

```
        ┌──────────────┐
        │ Neon Postgres│
        └──────┬───────┘
               │  push (outbox)  ·  pull (cursor)  ·  snapshot (pin)
          ┌────┴─────┐
          │Sync Layer│
          └────┬─────┘
     ┌─────────┴─────────┐
Dispositivo A       Dispositivo B
   Dexie                Dexie
```

O escopo do que sincroniza é a **superfície de diária** — ver
[offline-first.md §1](offline-first.md#1-a-fronteira). Nada fora dela passa por aqui.

---

## 1. Modelo

Três mecanismos, independentes e degradáveis:

| Mecanismo    | Direção          | Falha isolada causa                                   |
| ------------ | ---------------- | ----------------------------------------------------- |
| **Push**     | local → servidor | Mudanças ficam na fila; nada se perde                 |
| **Pull**     | servidor → local | Dispositivo fica com dado velho; edita normalmente    |
| **Snapshot** | servidor → local | Diária não fixada não abre offline (estado explícito) |

Nenhum é requisito para preencher a diária já fixada.

---

## 2. Protocolo

```
GET  /api/sync/snapshot ?shootingDayId=…            primeira abertura (fixação)
POST /api/sync/push     { protocol, productionId, operations: [ … ] }
GET  /api/sync/pull     ?productionId=…&since=<seq>&limit=500
```

Toda requisição e toda resposta carregam `protocol` (inteiro). Divergência ⇒ `426` e a UI mostra
**"Atualize o app para continuar sincronizando"**, com ação de recarregar. Nenhuma versão antiga
escreve no servidor com regra antiga — e o cliente recusado **continua editando**, acumulando
fila ([ADR-026](../decisions.md#adr-026--três-versões-encadeadas)).

---

## 3. Push — a fila

```ts
interface SyncOperation {
  id: string; // UUID — também é a CHAVE DE IDEMPOTÊNCIA
  productionId: string;
  entityType: string; // 'take' | 'cameraTakeData' | …
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  fields: Record<string, { de: unknown; para: unknown }>; // delta com os DOIS valores
  createdAt: string;
  attempts: number;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
}
```

Três escolhas fazem a diferença entre uma fila que funciona e uma que corrompe dados:

**O payload é o delta, não o registro inteiro.** Enviar o objeto completo transforma toda edição
concorrente em conflito e faz o dispositivo sobrescrever campos que nem tocou.

**O delta carrega `de` e `para`.** É o que permite ao servidor decidir campo a campo sem
consultar histórico nenhum — ver [§5](#5-conflitos).

**`id` é a chave de idempotência.** O servidor guarda os ids já aplicados; reenviar após timeout
é seguro. Sem isso, uma resposta perdida na rede de set vira take duplicado.

### Coalescência

Ao enfileirar `UPDATE` de um campo que já tem operação `PENDING` na mesma entidade, o `de`
original é **preservado** e só o `para` é substituído. Sem isso, um campo digitado com debounce
de 500 ms gera uma dezena de operações e a primeira vence o compare-and-set com um `de` obsoleto.

### Ciclo

```
enqueue()  ── na MESMA transação Dexie da escrita local
    ↓
processa em lotes por produção, ORDEM DE CRIAÇÃO preservada
    ↓
POST /api/sync/push  { operations: [...] }
    ↓
por operação: APPLIED · PARTIAL (alguns campos em conflito) · FAILED · retry (5xx)
    ↓
APPLIED → remove da fila, _dirty = false
PARTIAL → campos aplicados saem da fila; campos em conflito viram syncConflict PENDING
```

Ordem importa: `CREATE setup` precisa chegar antes de `CREATE take` que o referencia. A fila é
FIFO **por produção**; produções diferentes sincronizam em paralelo.

Gatilhos: evento `online`, `visibilitychange` para visível, timer adaptativo ([§6](#6-polling)),
e imediatamente após cada escrita quando já está online.

Retry com backoff exponencial e teto (2s, 4s, 8s… máx. 5 min), **com jitter** — a equipe inteira
reconecta ao mesmo tempo quando o Wi-Fi da base volta, e sem jitter todo mundo bate no servidor
no mesmo instante.

`FAILED` **nunca** descarta o payload: fica visível na tela de sincronização, com o erro,
reenviável e exportável.

---

## 4. Operações

### CREATE

```
id derivado da chave natural (ADR-019)
    ↓
grava local + enfileira  ── MESMA transação
    ↓
push → insert … on conflict (id) do nothing
    ↓
ack → _dirty = false
```

Já existir no servidor **não é erro**: é o outro dispositivo tendo criado o mesmo take, com o
mesmo id. O cliente segue para os campos, que passam pelo compare-and-set normal.

### UPDATE

```
escrita local imediata (sem espera)
    ↓
enfileira delta {de, para}, coalescendo
    ↓
push → por campo: aplica · ignora · conflita
    ↓
{ applied: [...], conflicts: [{ field, atual, atualPor, atualEm }] }
    ↓
applied   → _dirty = false
conflicts → adota `atual` no local + cria syncConflict PENDING com o valor do usuário
```

### DELETE

Soft delete é **um campo** (`deletedAt`) e passa pelo mesmo compare-and-set. Isso resolve o
conflito edição×exclusão sem mecanismo novo:

| Caso                                         | Resultado                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| A apaga, ninguém tocou                       | aplica                                                                     |
| A apaga; B editou campos depois da base de A | os campos de B permanecem; `deletedAt` aplica — o conteúdo não se perde    |
| A edita; B já apagou                         | `atual.deletedAt != null` ⇒ **conflito**: `[Manter apagado]` `[Restaurar]` |

Sem coleta de lixo agressiva na v1: registros apagados ficam no Postgres e no Dexie. Purga
física é rotina administrativa posterior ([ADR-015](../decisions.md#adr-015--soft-delete-em-todas-as-tabelas-de-domínio)).

---

## 5. Conflitos

### O que a arquitetura já elimina

Antes de qualquer estratégia de resolução: **a modelagem faz a maioria dos conflitos não
existir.**

| Situação                                                      | Conflito?                                       |
| ------------------------------------------------------------- | ----------------------------------------------- |
| Câmera e Som editam o mesmo take                              | ❌ tabelas diferentes                           |
| Duas pessoas criam o take 4 do mesmo setup                    | ❌ mesma chave natural ⇒ **mesmo id** ⇒ um take |
| Continuidade e Câmera criam a cena 24B                        | ❌ idem                                         |
| Dois membros de Câmera editam campos diferentes do mesmo take | ❌ merge por campo                              |
| Dois membros de Câmera editam **o mesmo campo**               | ✅ conflito real                                |

O que sobra é raro e intra-departamental.

### Estratégia — compare-and-set por campo

O delta traz os dois valores. O servidor decide campo a campo:

| Situação                        | Ação                                    |
| ------------------------------- | --------------------------------------- |
| `atual == de`                   | aplica (`para`)                         |
| `atual == para`                 | ninguém mexeu de verdade — ignora       |
| `atual != de` e `atual != para` | **conflito só desse campo**; não aplica |

Sem histórico, sem leitura de log, sem `version` no caminho crítico. `version` continua
existindo para depuração e para o cliente reconhecer o eco do próprio push.

Os três níveis pedidos saem de graça: entidades diferentes nem se encontram; campos diferentes
da mesma entidade passam todos no teste (**merge automático**, sem diálogo no meio da
filmagem); e no mesmo campo só aquele campo falha — **os demais do mesmo push são aplicados**.

### Resolução

O registro local **converge para o valor do servidor**, e o valor do usuário vira pendência
visível no próprio campo ([ADR-020](../decisions.md#adr-020--no-conflito-a-tela-converge-para-o-servidor)):

```
Cena 24B · Setup C · Take 5 · Câmera

  Lente   40mm    ⚠ conflito
          ├ seu valor:   50mm      (você, 14:02, offline)
          └ valor atual: 40mm      (João, 14:03)

          [ Usar 50mm ]   [ Manter 40mm ]   [ Editar ]
```

`Usar 50mm` reenfileira `{ de: '40mm', para: '50mm' }` — compare-and-set de novo, sem caminho
de código especial. Sem resolução automática por "quem escreveu por último": em set, o último a
sincronizar é frequentemente quem estava com o pior sinal, não quem tem a informação certa.

**O conflito nunca bloqueia.** É de um campo, não de um registro: o Take 6 continua, o Som nunca
soube que existiu.

### Modelo local

```ts
interface SyncConflict {
  id: string;
  productionId: string;
  entityType: string;
  entityId: string;
  field: string;
  meuValor: unknown;
  valorRemoto: unknown;
  remotoPor: string; // nome do membro, já resolvido no servidor
  remotoEm: string;
  detectadoEm: string;
  status: 'PENDING' | 'RESOLVED';
  resolucao?: 'MEU' | 'REMOTO' | 'EDITADO';
  resolvidoEm?: string;
}
```

Vive **só no Dexie**: o conflito é pendência daquele dispositivo, e nenhum outro precisa vê-la.
Não há tabela correspondente no Postgres.

**Limite conhecido:** listas ordenadas (tracks de som, ordem de setups) não têm merge por campo.
A v1 usa último-a-escrever na lista inteira, com aviso na UI. CRDT resolveria e foi descartado —
ganho pequeno diante do custo, num domínio onde cada registro tem dono natural (R16).

---

## 6. Polling

O `sync_log` (`seq bigserial`) é o cursor — ver
[ADR-006](../decisions.md#adr-006--cursor-bigserial-sync_log-em-vez-de-updated_at). Relógio de
cliente não serve de cursor, e empate de milissegundo perde escrita para sempre.

```
GET /api/sync/pull?productionId=…&since=<seq>&limit=500
    → { changes: [ {entityType, entityId, operation, version, data} ],
        cursor: <novo seq>, hasMore: bool }
```

- O servidor autoriza por `production_members` **antes** de qualquer leitura.
- O cliente aplica em transação e só então grava o cursor em `meta`. Interrupção no meio
  reprocessa o lote — as aplicações são idempotentes por `(entityId, version)`.
- Mudanças de diária **não fixada** são descartadas pelo cliente; o cursor avança do mesmo jeito.
- Mudança originada pelo próprio dispositivo volta no pull e é reconhecida pela `version`.
- Campo com conflito `PENDING` não é sobrescrito — ele já está convergido.

### Cadência adaptativa

| Estado da tela                              | Intervalo     |
| ------------------------------------------- | ------------- |
| Diária aberta, mudança há < 2 min           | **10 s**      |
| Diária aberta, ociosa                       | **30 s**      |
| Outra tela da produção                      | 60 s          |
| Aba oculta / app em background              | **não faz**   |
| Voltou a ficar visível · `online` · push OK | pull imediato |

Um pull sem novidade é `where seq > $cursor limit 1` — índice puro, resposta vazia, custo
desprezível. Parar com a aba oculta é o que impede a conta de crescer com o aparelho no bolso.

**SSE fica como upgrade documentado, não como plano** (R15): ele observaria o mesmo cursor e
reusaria o mesmo código de aplicação de mudanças — troca só o gatilho. Pusher/Ably continuam
descartados: vendor extra, custo, mais um segredo e mais um modo de falha.

Presença de membros online usa `production_members.last_seen_at`, atualizado no próprio pull —
não um canal separado.

---

## 7. Estado visível

O usuário precisa saber, sempre, se o trabalho dele saiu do aparelho. A tabela de estados e a
regra "informa, nunca bloqueia" estão em
[offline-first.md §6](offline-first.md#6-estado-de-conectividade).

---

## 8. Testes obrigatórios

Da Fase 4 em diante, nenhuma dessas pode regredir:

- [ ] Offline → cria take → fecha o PWA → reabre → dado presente
- [ ] Offline → 50 operações → volta a rede → todas sincronizam, na ordem
- [ ] Mesma operação enviada duas vezes → aplicada uma vez (idempotência)
- [ ] Dois dispositivos, campos diferentes do mesmo take → merge automático, ninguém perde
- [ ] Dois dispositivos, **mesmo** campo → conflito de campo, resolução explícita
- [ ] Conflito em um campo **não** impede editar os outros campos, takes ou departamentos
- [ ] Dois dispositivos criam o take 4 do mesmo setup → um único take (id derivado)
- [ ] Campo digitado com debounce → operações coalescidas, `de` original preservado
- [ ] Editar registro que o outro apagou → conflito com opção de restaurar
- [ ] Pull interrompido no meio do lote → retoma sem duplicar
- [ ] Sessão expirada durante o push → fila preservada, nada perdido
- [ ] Protocolo incompatível → sync recusado, **edição local segue normal**
- [ ] Perda de permissão com fila pendente → `FAILED` com motivo, conteúdo exportável
