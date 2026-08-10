# Sincronização

Como as mudanças saem do dispositivo, chegam ao Neon e voltam para os outros dispositivos —
sem perder dado, sem sobrescrever ninguém em silêncio e sem exigir rede para trabalhar.

```
        ┌──────────────┐
        │ Neon Postgres│
        └──────┬───────┘
               │  push (outbox)  ·  pull (cursor)  ·  stream (SSE)
          ┌────┴─────┐
          │Sync Layer│
          └────┬─────┘
     ┌─────────┴─────────┐
Dispositivo A       Dispositivo B
   Dexie                Dexie
```

---

## 1. Modelo

Três mecanismos, independentes e degradáveis:

| Mecanismo        | Direção          | Falha isolada causa                                |
| ---------------- | ---------------- | -------------------------------------------------- |
| **Push**         | local → servidor | Mudanças ficam na fila; nada se perde              |
| **Pull**         | servidor → local | Dispositivo fica com dado velho; edita normalmente |
| **Stream (SSE)** | servidor → local | Cai para pull periódico; nada quebra               |

Cada um pode falhar sem derrubar os outros, e **nenhum** é requisito para o app funcionar.

---

## 2. Push — a fila (§18)

```ts
interface SyncOperation {
  id: string; // UUID — também é a CHAVE DE IDEMPOTÊNCIA
  userId: string; // fila particionada por usuário
  productionId: string;
  entityType: string; // 'take' | 'cameraTakeData' | 'photo' | …
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: unknown; // apenas os CAMPOS ALTERADOS (não o registro inteiro)
  baseVersion: number; // versão sobre a qual a edição foi feita
  createdAt: string;
  attempts: number;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CONFLICT';
  lastError?: string;
}
```

Duas escolhas fazem a diferença entre uma fila que funciona e uma que corrompe dados:

**`payload` é o delta, não o registro inteiro.** Enviar o objeto completo transforma toda
edição concorrente em conflito e faz o dispositivo sobrescrever campos que ele nem tocou.
Enviando `{ card: 'A013' }`, um dispositivo que mexeu só no cartão não pisa no `iso` que outro
acabou de mudar.

**`id` é a chave de idempotência.** O servidor guarda os ids já aplicados; reenviar após um
timeout é seguro. Sem isso, uma resposta perdida na rede de set vira take duplicado.

### Ciclo

```
enqueue()  ── na MESMA transação Dexie da escrita local
    ↓
processa em lotes por produção, ORDEM DE CRIAÇÃO preservada
    ↓
POST /api/sync/push  { operations: [...] }
    ↓
por operação: 200 SYNCED · 409 CONFLICT · 403/422 FAILED · 5xx retry
    ↓
SYNCED → remove da fila + aplica a versão devolvida no registro local
```

Ordem importa: `CREATE setup` precisa chegar antes de `CREATE take` que o referencia. A fila é
FIFO **por produção**; produções diferentes sincronizam em paralelo.

Gatilhos: evento `online`, `visibilitychange` para visível, timer (~30 s com pendências),
e imediatamente após cada escrita quando já está online.

Retry com backoff exponencial e teto (2s, 4s, 8s, … máx. 5 min), com jitter — a equipe inteira
reconecta ao mesmo tempo quando o Wi-Fi da base volta, e sem jitter todo mundo bate no
servidor no mesmo instante.

`FAILED` **nunca** descarta o payload: fica visível na tela de sincronização, com o erro, e
pode ser reenviado ou exportado.

---

## 3. Pull — cursor incremental

O `sync_log` (`seq bigserial`) é o cursor.

```
GET /api/sync/pull?productionId=…&since=<seq>&limit=500
    → { changes: [ {entityType, entityId, operation, version, data} ],
        cursor: <novo seq>, hasMore: bool }
```

- O servidor autoriza por `production_members` **antes** de qualquer leitura.
- O cliente aplica em transação e só então grava o novo cursor em `meta`. Interrupção no meio
  reprocessa o lote — as aplicações são idempotentes por `(entityId, version)`.
- **Primeiro pull** de uma produção é um _snapshot_ (`since=0`), paginado.
- Uma mudança que o próprio dispositivo originou volta no pull; é reconhecida por `version` já
  presente localmente e ignorada.

Por que cursor de sequência e não `updated_at > X`: relógio de servidor pode empatar em
milissegundos e o de cliente não é confiável. Com `timestamptz` como cursor, duas escritas no
mesmo milissegundo fazem a segunda ser **silenciosamente perdida** para sempre. Um
`bigserial` do próprio banco não tem essa classe de falha.

---

## 4. Conflitos (§19)

### O que a arquitetura já elimina

Antes de qualquer estratégia de resolução: **a modelagem faz a maioria dos conflitos não
existir.**

| Situação                                                      | Conflito?                                                         |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| Câmera e Som editam o mesmo take                              | ❌ tabelas diferentes                                             |
| Duas pessoas criam o take 4 do mesmo setup                    | ❌ `unique (setup_id, number)` — o segundo relê e usa o existente |
| Continuidade e Câmera criam a cena 24B                        | ❌ `unique (production_id, number, block)`                        |
| Dois membros de Câmera editam campos diferentes do mesmo take | ❌ merge por campo                                                |
| Dois membros de Câmera editam **o mesmo campo**               | ✅ conflito real                                                  |

O que sobra é raro e intra-departamental. É esse caso que a estratégia abaixo trata.

### Estratégia

**Versão otimista + merge por campo + escalada explícita.**

```
cliente envia:  { entityId, baseVersion: 7, payload: { card: 'A013' } }

servidor:
  version atual == 7?  → aplica, version = 8, grava sync_log        → 200
  version atual  > 7?  → o payload toca campos alterados desde a v7?
        ├─ NÃO  → MERGE automático (campos disjuntos), version++    → 200 merged
        └─ SIM  → 409 + { current, conflictingFields }
```

O merge automático de campos disjuntos é o que evita transformar "eu mudei o cartão enquanto
ele mudava o ISO" em uma caixa de diálogo no meio da filmagem.

Para saber quais campos mudaram desde a `baseVersion`, o `sync_log` guarda as chaves alteradas
em cada operação — leitura barata e limitada às poucas versões entre `baseVersion` e a atual.

### Resolução do conflito real

Operação vai para `CONFLICT` (nunca descartada), **a edição local continua visível** e a
UI oferece:

```
Cena 24B · Setup C · Take 4 · Câmera → Cartão

  seu valor:     A013        (você, há 2 min, offline)
  valor atual:   A014        (Maria, há 30 s)

  [ Manter o meu ]   [ Aceitar o do servidor ]
```

Sem resolução automática por "quem escreveu por último". Em set, o último a sincronizar é
frequentemente quem estava com o pior sinal, não quem tem a informação certa.

**Limite conhecido:** listas ordenadas (tracks de som, ordem de setups) não têm merge por
campo. A v1 usa último-a-escrever na lista inteira, com aviso na UI. CRDT resolveria isso e
foi descartado: ganho pequeno diante do custo, num domínio onde cada registro tem um dono
natural. Reavaliar se surgir dor real.

### DELETE

Soft delete propagado como qualquer campo. `DELETE` contra registro já modificado por outro
usuário **é conflito** e pergunta — apagar em silêncio o trabalho de alguém é o pior resultado
possível aqui.

---

## 5. Realtime

Objetivo (§20): Câmera registra o take 5, o dispositivo da continuísta mostra sem recarregar.
**Otimização, jamais dependência** — offline não pode depender disso.

### Avaliação

| Opção                             | Prós                                         | Contras                                                     |
| --------------------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| Polling do `/pull` (15–30 s)      | Zero infra, já implementado                  | Latência; requests ociosos                                  |
| **SSE lendo o `sync_log`**        | Zero vendor; mesmo caminho de código do pull | Limite de duração de função na Vercel → reconexão           |
| Postgres `LISTEN/NOTIFY`          | Push real                                    | Driver HTTP do Neon não suporta; exige conexão persistente  |
| Pusher / Ably / Supabase Realtime | Robusto, escala                              | Vendor extra, custo, mais um segredo, mais um modo de falha |

### Decisão

> **SSE** (`GET /api/sync/stream?productionId=…&since=<seq>`), com **fallback automático para
> polling**.

O servidor observa o `sync_log` da produção e empurra os `seq` novos. O cliente reage
exatamente como reage ao pull — **é o mesmo código de aplicação de mudanças**, só muda o
gatilho. Se o SSE cair (limite de duração da função, rede instável, proxy que não suporta
streaming), o cliente volta a polling sem nenhuma diferença de comportamento visível.

Isso mantém o realtime como uma **camada removível**: se ele nunca funcionar, o produto ainda
está correto — só mais lento para propagar.

Pusher/Ably ficam documentados como caminho de upgrade se o número de conexões simultâneas
por produção justificar. Presença de membros online (§24) usa `production_members.last_seen_at`
atualizado no heartbeat do SSE/pull, não um canal separado.

---

## 6. Estado visível

O usuário precisa saber, sempre, se o trabalho dele saiu do aparelho.

| Estado           | Significado                                      |
| ---------------- | ------------------------------------------------ |
| `ONLINE`         | Fila vazia, último pull recente                  |
| `SINCRONIZANDO`  | Push ou pull em andamento                        |
| `PENDÊNCIAS (n)` | n operações na fila aguardando rede              |
| `OFFLINE`        | Sem rede; edição normal                          |
| `CONFLITO (n)`   | n conflitos aguardando decisão                   |
| `ERRO`           | Falhas persistentes — abre a tela de diagnóstico |

Regra de UX: o indicador **informa**, nunca bloqueia. Não existe spinner que impeça digitar, e
não existe "aguarde sincronizar" antes de criar o próximo take.

---

## 7. Testes obrigatórios

Da Fase 3 em diante, nenhuma dessas pode regredir:

- [ ] Offline → cria take → fecha o PWA → reabre → dado presente
- [ ] Offline → 50 operações → volta a rede → todas sincronizam, na ordem
- [ ] Mesma operação enviada duas vezes → aplicada uma vez (idempotência)
- [ ] Dois dispositivos, campos diferentes do mesmo take → merge automático, ninguém perde
- [ ] Dois dispositivos, **mesmo** campo → 409 → resolução explícita
- [ ] Dois dispositivos criam o take 4 do mesmo setup → um único take
- [ ] Pull interrompido no meio do lote → retoma sem duplicar
- [ ] Sessão expirada durante o push → fila preservada, nada perdido
- [ ] Perda de permissão com fila pendente → `FAILED` com motivo, conteúdo exportável
