# Registro de decisões (ADR)

Decisões arquiteturais com data, alternativas consideradas e razão. Uma decisão revista **não
é reescrita**: ganha um bloco "Revisto em" — a razão original continua sendo informação útil.

---

### ADR-001 · Sala é a projeção de uma Production, não uma entidade

`2026-08-10` · **Aceita**

Uma produção tem exatamente uma sala colaborativa. Uma tabela `rooms` separada criaria de
imediato a pergunta "uma produção pode ter duas salas?" — e no fluxo real de set, duas salas
seriam duas produções. A entidade extra só adicionaria um join e uma classe de bug (dado na
produção errada dentro da sala certa).

**Consequência:** `productions` carrega `join_code` e `join_enabled`; sala é tela, não tabela.

---

### ADR-002 · `Cena + Bloco` → `Scene`; `Plano` → `Setup`

`2026-08-10` · **Aceita**

O modelo atual tem quatro níveis (`Cena → Bloco → Plano → Take`); o alvo tem três
(`Scene → Setup → Take`).

Na claquete, "24" + "A" é lido como **cena 24A** — o par identifica a cena no set, e é
exatamente a "Cena 24B" dos exemplos do briefing. O `Plano`, por sua vez, já carrega câmera,
lente, T-stop e ISO: ele **é** o setup de câmera.

**Alternativas:** manter quatro níveis (Som e Continuidade não usam o quarto); tratar `Bloco`
como `Setup` (perderia a configuração técnica do plano).

**Consequência:** metadados de continuidade da cena (página, story day, INT/EXT) ficam
repetidos entre blocos da mesma cena. Duplicação de metadado descritivo, não de unidade de
gravação — não viola a regra de não-duplicação do §9. A UI edita no nível do `number`.

---

### ADR-003 · Dexie como banco local

`2026-08-10` · **Aceita** · exceção à regra de zero dependências

LocalStorage é síncrono, não guarda binário e tem teto de poucos megabytes — inviável para
fotos e para fila de sync. Entre IndexedDB cru e Dexie, a diferença é upgrade versionado de
schema, transações declarativas, índices compostos e `liveQuery` reativo entre abas.

A regra de zero dependências existe para evitar carregar biblioteca em coisa trivial (ícone,
uuid, `cn`, PDF) e **continua valendo** para esses casos. Um banco local transacional não é
trivial, e errar nele significa perder o boletim de um dia de filmagem.

**Custo aceito:** ~25 kB gzip.

---

### ADR-004 · Better Auth em vez de Auth.js v5

`2026-08-10` · **Aceita**

O `Credentials` provider do Auth.js não gerencia senha: hash, comparação, rate limit, token de
reset e e-mail de recuperação ficam por conta do desenvolvedor. Isso é exatamente a
"autenticação caseira" que o briefing proíbe, com o agravante de parecer coberta. Além disso,
`Credentials` força estratégia JWT, dificultando revogar a sessão de um dispositivo perdido em
set.

Clerk foi descartado por tirar o usuário do Neon: `production_members.user_id` perderia FK e a
query mais executada da plataforma viraria chamada de rede.

**Reavaliar se:** o produto passar a ser majoritariamente OAuth.

---

### ADR-005 · Drizzle em vez de Prisma

`2026-08-10` · **Aceita**

Drizzle é só TypeScript (sem engine binário), tem tipagem inferida do schema sem etapa de
geração e migrations em SQL legível. O ponto decisivo: o pull incremental e a resolução de
conflito por versão são queries que precisam ser **lidas e entendidas** em SQL.

---

### ADR-006 · Cursor `bigserial` (`sync_log`) em vez de `updated_at`

`2026-08-10` · **Aceita**

Relógio de cliente não é confiável e o do servidor pode empatar em milissegundos. Com
`timestamptz` como cursor de pull, duas escritas no mesmo milissegundo fazem a segunda ser
silenciosamente perdida para sempre. Um `bigserial` do próprio banco elimina a classe de falha.

**Custo:** trigger em toda tabela de domínio, e uma tabela que cresce (particionável/podável
por produção quando necessário).

---

### ADR-007 · Delta no payload de sync, não o registro inteiro

`2026-08-10` · **Aceita**

Enviar o objeto completo transforma toda edição concorrente em conflito e faz o dispositivo
sobrescrever campos que nem tocou. Com `{ card: 'A013' }`, quem mexeu só no cartão não pisa no
ISO que outro acabou de mudar.

**Consequência:** o `sync_log` precisa registrar as chaves alteradas em cada operação, para
que o servidor consiga detectar sobreposição de campos entre `baseVersion` e a versão atual.

---

### ADR-008 · Versão otimista + merge por campo, sem CRDT

`2026-08-10` · **Aceita**

CRDT resolveria merge de listas ordenadas, mas cobra um custo alto de complexidade e de
tamanho de payload num domínio onde cada registro tem um dono natural (o departamento) e o
conflito real é raro.

**Limite conhecido e aceito:** listas ordenadas (tracks de som, ordem de setups) usam
último-a-escrever na lista inteira, com aviso na UI. Reavaliar se surgir dor real.

---

### ADR-009 · Realtime por SSE sobre o mesmo cursor de sync

`2026-08-10` · **Aceita**

O driver HTTP do Neon não suporta `LISTEN/NOTIFY`. Pusher/Ably adicionariam vendor, custo,
segredo e mais um modo de falha. Um endpoint SSE que observa o `sync_log` usa **o mesmo
código de aplicação de mudanças** do pull — só muda o gatilho.

**Consequência:** funções da Vercel têm limite de duração; o cliente reconecta e cai para
polling sem diferença visível. Realtime permanece uma camada removível.

---

### ADR-010 · Status compartilhado **e** status por departamento

`2026-08-10` · **Aceita**

`Take.status` é o status da tomada como evento de set (o que a claquete diz).
`camera/sound/continuity_take_data.status` é o julgamento técnico de cada departamento. Ambos
são necessários: é comum um take ser `CIRCLE` para o diretor e `NG` para o som.

`aprovado: boolean` do modelo v2 mapeia para `CIRCLE` **e** é preservado em
`camera_take_data.approved`, para não perder a semântica "aprovado pelo diretor".

**Consequência de UX:** o toggle verde "Aprovado pelo diretor" continua existindo como está —
trocá-lo por um seletor de status seria regressão em nome de pureza de modelo.

---

### ADR-011 · Técnica e óptica migram do Setup para o Take

`2026-08-10` · **Aceita**

No modelo atual, ISO/lente/T-stop vivem no `Plano`. Na prática o foquista troca o T-stop entre
takes do mesmo setup, e hoje o app não registra isso — ou se cria um plano novo (poluindo o
boletim) ou se perde a informação.

**Consequência:** a UI **continua parecendo igual** — o valor é herdado do take anterior e só
é editado quando muda. O `Setup` guarda o valor corrente como padrão de herança.

---

### ADR-012 · Ids UUID gerados no cliente

`2026-08-10` · **Aceita**

Criar entidade offline exige id definitivo no ato. Ids temporários remapeados na
sincronização são a fonte clássica de referência quebrada em sistemas offline.

**Consequência:** o servidor precisa validar formato de UUID e depender de `unique` nas chaves
naturais (`(setup_id, number)`, `(production_id, number, block)`) como defesa contra colisão.
O fallback de `utils/id.ts` precisa ser reforçado — ver R10 em [risks.md](risks.md).

---

### ADR-013 · `domain/` fora de `lib/`

`2026-08-10` · **Aceita**

`domain/platform/` é o único código que roda nos três lugares (browser, route handler, script)
e que **não pode** importar Dexie, Drizzle nem React. Deixá-lo em `lib/` — ao lado de
`lib/db/` e `lib/offline/` — convidaria a acoplar exatamente com o que ele não pode conhecer.

---

### ADR-014 · Manter a impressão nativa para PDF

`2026-08-10` · **Aceita**

Funciona offline, não adiciona dependência, sai bem em A4 e já está validada em produção.
`react-pdf` e `puppeteer` foram descartados: o primeiro obrigaria a reescrever o layout, o
segundo exige servidor — o que quebraria a exportação offline.

---

### ADR-015 · Soft delete em todas as tabelas de domínio

`2026-08-10` · **Aceita**

Um delete físico não tem como ser propagado por um sistema de sync baseado em cursor: o
registro simplesmente some, e os outros dispositivos nunca ficam sabendo.

**Consequência:** toda query precisa filtrar `deleted_at is null`. Purga física é uma rotina
administrativa separada, posterior à confirmação de sincronização.
