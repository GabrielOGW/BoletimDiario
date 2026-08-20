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

> **Revisto em `2026-08-10`** ([ADR-016](#adr-016--fronteira-offline-explícita), ADR-022) — a
> justificativa "fotos" caiu com a decisão de não ter fotos na v1, e o banco local passa a
> cobrir **só a superfície de diária**, não a plataforma inteira. A decisão **permanece**: o
> que a sustenta sozinho é a fila de sync transacional (escrita local e enfileiramento na mesma
> transação) e o `liveQuery` entre abas. LocalStorage continua inviável para os dois.

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

> **Revisto em `2026-08-10`** — confirmada na implementação, com dois ajustes obrigatórios
> registrados em [authentication.md §2](architecture/authentication.md#2-decisão):
> `advanced.database.generateId: 'uuid'` (sem isso as FKs de auditoria do domínio quebram) e
> sessão de **90 dias** em vez de 30 (sessão expirada em locação sem sinal não tem como ser
> renovada). O envio de e-mail fica pendente — ver
> [ADR-028](#adr-028--recuperação-de-senha-sem-provedor-de-e-mail).

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

> **Revisto em `2026-08-10`** ([ADR-018](#adr-018--conflito-por-compare-and-set-de-campo)) — o
> delta **permanece**, e é o que faz o merge por campo existir. A consequência acima **cai**: o
> delta passa a carregar `{ de, para }` por campo, então o servidor detecta sobreposição
> comparando com o valor atual, sem precisar ler histórico nenhum. O `sync_log` volta a ser só
> cursor.

---

### ADR-008 · Versão otimista + merge por campo, sem CRDT

`2026-08-10` · **Aceita**

CRDT resolveria merge de listas ordenadas, mas cobra um custo alto de complexidade e de
tamanho de payload num domínio onde cada registro tem um dono natural (o departamento) e o
conflito real é raro.

**Limite conhecido e aceito:** listas ordenadas (tracks de som, ordem de setups) usam
último-a-escrever na lista inteira, com aviso na UI. Reavaliar se surgir dor real.

> **Revisto em `2026-08-10`** ([ADR-018](#adr-018--conflito-por-compare-and-set-de-campo)) — a
> recusa ao CRDT e o merge por campo **permanecem**; muda o mecanismo de detecção, que deixa de
> ser a comparação de `version` e passa a ser o compare-and-set por campo. `version` continua
> existindo para depuração e para o cliente reconhecer o eco do próprio push.

---

### ADR-009 · Realtime por SSE sobre o mesmo cursor de sync

`2026-08-10` · **Aceita**

O driver HTTP do Neon não suporta `LISTEN/NOTIFY`. Pusher/Ably adicionariam vendor, custo,
segredo e mais um modo de falha. Um endpoint SSE que observa o `sync_log` usa **o mesmo
código de aplicação de mudanças** do pull — só muda o gatilho.

**Consequência:** funções da Vercel têm limite de duração; o cliente reconecta e cai para
polling sem diferença visível. Realtime permanece uma camada removível.

> **Revisto em `2026-08-10` · Superada por
> [ADR-021](#adr-021--polling-adaptativo-sem-sse-na-v1)** — se o fallback para polling já é
> obrigatório e indistinguível, então o polling é o produto e o SSE é o extra. A v1 implementa
> só o polling. A análise acima continua válida como caminho de upgrade: o SSE observa o
> **mesmo** cursor e reusa o **mesmo** código de aplicação de mudanças — troca só o gatilho.

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

> **Revisto em `2026-08-10`** ([ADR-019](#adr-019--ids-determinísticos-por-chave-natural)) — o
> id continua nascendo no cliente, mas **deixa de ser aleatório** onde há chave natural
> (Scene, Setup, Take, `*TakeData`): passa a ser derivado dela. Dois dispositivos offline
> criando o mesmo take produzem o mesmo id, e a colisão vira convergência em vez de erro. O
> fallback de `utils/id.ts` **já foi reforçado** com `crypto.getRandomValues`.

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

---

## Rodada 2 — decisões do proprietário (ADR-016 … ADR-027)

As decisões abaixo nascem de [risks-response.md](risks-response.md) e estão desenvolvidas em
[plano-arquitetural-v2.md](plano-arquitetural-v2.md). Elas revisam parte das anteriores; as
revisões estão registradas nos blocos "Revisto em" acima, não por reescrita.

---

### ADR-016 · Fronteira offline explícita

`2026-08-10` · **Aceita** · revisa a estratégia offline-first de ADR-002/ADR-003

Offline-first foi aplicado ao aplicativo inteiro. A pergunta certa não é "o app funciona
offline?", é **"o que precisa funcionar offline?"** — e a resposta é uma só coisa: preencher a
diária. Login, criar produção, entrar por código, gerenciar membros e ler relatório de produção
encerrada são operações de **preparação**, feitas com sinal e sentado, nunca com a claquete
batendo.

O banco local é fonte de verdade apenas da **superfície de diária**: `ShootingDay` fixada,
`Scene`, `Setup`, `Take` e os `*TakeData` dos três departamentos. Todo o resto é Next.js comum
lendo Drizzle no servidor.

**Alternativa descartada:** espelhar tudo no Dexie — paga sync em dados que ninguém edita em
set.

**Consequências:** o Dexie cai de ~20 para ~9 tabelas de domínio; a regra de revisão fica
verificável (**`fetch` é proibido dentro da fronteira e normal fora dela**); e surge um risco
novo, "chegar na locação sem a diária baixada", tratado por fixação automática (R2b).

---

### ADR-017 · Opção B — banco local + Sync Layer, restrita à fronteira

`2026-08-10` · **Aceita**

A opção server-oriented (UI → servidor, com fila só para offline) parece mais simples porque
esconde a pergunta "de onde vem a **leitura** quando não há rede?". A resposta honesta é: de um
cache de respostas HTTP sobre o qual é preciso reaplicar a fila pendente, na ordem, a cada
leitura e a cada boot. É o mesmo problema do banco local, resolvido por acidente, sem transação
e sem índice — e regride o Boletim de Câmera, que hoje não precisa de rede para nada.

O que a opção A tinha de bom — não sincronizar o que não precisa — [ADR-016](#adr-016--fronteira-offline-explícita)
já entrega. Fora da fronteira, aliás, a opção A **é** o padrão.

---

### ADR-018 · Conflito por compare-and-set de campo

`2026-08-10` · **Aceita** · revisa ADR-007 e ADR-008

O delta passa a carregar os dois valores de cada campo alterado:

```jsonc
{ "fields": { "lens": { "de": "35mm", "para": "50mm" } } }
```

O servidor decide campo a campo: `atual == de` aplica; `atual == para` ignora (já é o valor);
qualquer outra coisa é **conflito só daquele campo**. Sem histórico de chaves alteradas, sem
leitura de log, sem `version` no caminho crítico.

**Alternativa descartada:** comparar `baseVersion` com a versão atual e consultar no `sync_log`
quais chaves mudaram no intervalo — mais peças móveis para o mesmo resultado.

**Consequências:** merge automático de campos disjuntos sai de graça; o conflito é sempre de um
campo, nunca de um registro, então nunca bloqueia o resto do take, da diária ou do outro
departamento; e o soft delete, sendo apenas o campo `deletedAt`, herda o mesmo tratamento — o
que resolve o conflito edição×exclusão sem mecanismo novo.

**Requisito de implementação:** ao enfileirar `UPDATE` de um campo que já tem operação
`PENDING`, o `de` original é preservado e só o `para` é substituído. Sem essa coalescência, um
campo digitado com debounce de 500 ms gera uma dezena de operações e a primeira vence com um
`de` obsoleto.

---

### ADR-019 · Ids determinísticos por chave natural

`2026-08-10` · **Aceita** · complementa ADR-012

Dois dispositivos offline criando "Take 4 do Setup C" com UUID aleatório geram dois ids; o
servidor rejeita o segundo por `unique (setup_id, number)`; e o cliente perdedor precisa
descobrir o id vencedor e **reparentar** o que já escreveu. Remapeamento de id é exatamente a
classe de bug que ADR-012 queria evitar.

[`domain/platform/derive-id.ts`](../domain/platform/derive-id.ts) — escrito para a migração ser
reexecutável — **passa a valer em runtime** para as entidades com chave natural:

```ts
scene.id = deriveId(productionId, 'scene', number, block);
setup.id = deriveId(sceneId, 'setup', shootingDayId, code);
take.id = deriveId(setupId, 'take', String(number));
cameraTakeData.id = deriveId(takeId, 'camera', cameraUnitId);
```

Mesma chave natural ⇒ mesmo id. A criação vira `insert … on conflict (id) do nothing` e a
colisão deixa de ser erro para virar convergência. `crypto.randomUUID` permanece para o que não
tem chave natural (produção, membro, operação de outbox, unidade de câmera).

**Limite aceito:** renumerar um take depois de criado desfaz a relação id ↔ chave natural. É
raro (o número é automático) e cai no caminho de conflito normal, com mensagem própria — R13.

---

### ADR-020 · No conflito, a tela converge para o servidor

`2026-08-10` · **Aceita**

Dois aparelhos exibindo valores diferentes para o mesmo take é pior que uma pendência: alguém
lê o número errado em voz alta e ninguém sabe qual tela está certa. O registro local adota o
valor do servidor, e o valor do usuário vira uma pendência visível no próprio campo,
resolvível em um toque.

**Alternativa descartada:** manter o valor local até o usuário decidir — preserva a digitação,
mas mantém divergência aberta por tempo indeterminado, no meio de uma diária.

**Consequência:** nada se perde — `syncConflicts` guarda o valor do usuário, e "usar o meu"
apenas reenfileira um `{ de: <atual>, para: <meu> }`, sem caminho de código especial.

---

### ADR-021 · Polling adaptativo, sem SSE na v1

`2026-08-10` · **Aceita** · supera ADR-009

Se o fallback para polling já era obrigatório e indistinguível na experiência, então o polling
é o produto. A colaboração aqui é "a continuísta ver o take que a câmera acabou de registrar" —
tolerância de dezenas de segundos.

| Estado da tela                    | Intervalo   |
| --------------------------------- | ----------- |
| Diária aberta, mudança há < 2 min | 10 s        |
| Diária aberta, ociosa             | 30 s        |
| Outra tela da produção            | 60 s        |
| Aba oculta / app em background    | **não faz** |

Mais pull imediato ao voltar a ficar visível, ao evento `online` e após push bem-sucedido. Um
pull sem novidade é `where seq > $cursor limit 1` — índice puro. Parar com a aba oculta é o que
impede a conta de crescer com o aparelho no bolso.

---

### ADR-022 · Sem fotografias na v1

`2026-08-10` · **Aceita**

Decisão do proprietário. Fotos saem de requisitos, modelo, storage, sincronização, UX e gestão
de cota. Some a tabela `photos`, some `db.blobs`, some o Vercel Blob, some o monitoramento de
`storage.estimate()` e some o risco de despejo do IndexedDB (R5).

O modelo continua extensível — `subject_type` + `subject_id` é o formato natural quando/se
voltar —, mas **nada é implementado agora**. O objetivo é manter o app leve, rápido e barato.

---

### ADR-023 · A migração vira importação opcional

`2026-08-10` · **Aceita** · supera [migrations/local-to-cloud.md](migrations/local-to-cloud.md) na forma

Não há dado real de produção a preservar. Snapshot obrigatório, prévia não pulável,
verificação de contagens, estado `NEEDS_REVIEW` e reversibilidade em seis etapas resolviam um
problema que não existe — e cobravam complexidade permanente por isso.

Fica: o mapeador `from-boletim.ts` (já pronto e testado) exposto como uma ação
**"importar boletins deste aparelho"**, best-effort, repetível (ids derivados ⇒ sem duplicata),
que não bloqueia nada se falhar. `bdc:boletins:v1` continua sem ser apagado — isso é grátis.

**Consequência:** as boas práticas de migração de **schema** permanecem (upgrade versionado do
Dexie, migrations do Drizzle). O que sai é a cerimônia de migração de **dados**.

---

### ADR-024 · Design system único, o do Boletim de Câmera

`2026-08-10` · **Aceita**

Não existe "design do módulo de Som". Existe o design da plataforma, que é o do Boletim de
Câmera — já validado em set, mobile-first, dark, alvos ≥ 44 px, sem botão salvar. Som,
Continuidade, login, sala, dashboard, membros e configurações herdam componentes, padrões de
interação e linguagem visual.

**Sem exceção:** onde o formato do dado pedir outra tela (tracks de som, por exemplo), adapta-se
a apresentação do dado ao padrão — não o contrário. Um design system com dialetos deixa de ser
um design system.

**Consequência:** a Fase 5 é migração de módulo, não redesenho. Reescrever UI madura sem
necessidade é como se perde detalhe validado em set (R3).

---

### ADR-025 · Conta obrigatória na plataforma; legado sem conta

`2026-08-10` · **Aceita** · revisa overview.md §8.2 (modo LOCAL)

Sem conta não há sala, membro, permissão nem autoria de campo — e o fluxo do produto começa em
"entrar na sala". Manter um modo local **dentro** da plataforma significaria dois caminhos de
dados permanentes (com e sem sync) em cada módulo, para sempre.

Como não há dado real em produção, a decisão é barata: **a plataforma exige conta**, e o
aplicativo atual permanece intacto em `/legado` — sem conta, sem rede, com PDF. O login exige
rede **uma vez**; a sessão persiste no aparelho e nunca é reverificada para editar.

**Risco aceito:** quem quer só preencher um boletim avulso passa a usar o legado (R14).

---

### ADR-026 · Três versões encadeadas

`2026-08-10` · **Aceita**

```
APP VERSION       (build)    → dispara o aviso "Atualizar agora"
DB SCHEMA VERSION (Dexie)    → upgrade versionado, nunca destrutivo
SYNC PROTOCOL     (inteiro)  → enviado em todo push/pull; incompatível = 426
```

A regra que amarra as três: **uma versão antiga do app nunca escreve no servidor com regra
antiga.** É o protocolo, não a versão do app, que autoriza a sincronizar. Um cliente recusado
continua editando e acumulando fila — o bloqueio é da sincronização, nunca do preenchimento.

**Consequência:** `VERSION` do `public/sw.js` (hoje `'v1'` manual) passa a ser gerado no build,
junto com o `APP_SHELL`; `/api/**` nunca entra em cache; e `registration.waiting` alimenta um
aviso de atualização com ação explícita.

---

### ADR-027 · Skills sobre subagentes — cinco, não onze

`2026-08-10` · **Aceita**

O que decide: **subagente não herda contexto**. Cada um parte frio, redescobre o repositório,
refaz as mesmas leituras — e pode contradizer o outro, porque nenhum viu o que o outro fez. Uma
skill é instrução carregada sob demanda **no mesmo agente**, que continua sabendo de tudo, e já
expressa o contrato pedido (responsabilidade, escopo, arquivos permitidos, pré-condições,
testes, documentação, conclusão).

Onze skills reproduziriam na ferramenta a sobre-engenharia que estas decisões estão removendo
da arquitetura. Câmera, Som e Continuidade têm o **mesmo formato** — mesma superfície local,
mesmo design system, mesmo `Take` — e merecem uma skill, não três.

```
banco · sync · modulo · plataforma · testes
```

Documentação não é skill: é regra do agente principal (doc no mesmo commit). Autenticação é
trabalho de uma fase e cabe em `plataforma`. PWA são cinco arquivos e cabem em `sync`, que é
onde a versão do protocolo mora.

**Limite:** nenhuma skill altera `domain/platform/`, `docs/decisions.md` ou contrato entre
módulos por conta própria — isso é escalado para o agente principal. Subagente permanece útil
para trabalho **paralelo e somente-leitura** (varrer o repositório atrás de ocorrências), nunca
para escrever código de produção.

---

### ADR-028 · Recuperação de senha sem provedor de e-mail

`2026-08-10` · **Aceita**

A plataforma precisa de e-mail em **um** lugar: recuperação de senha. Cadastro, login, entrada
por código e o preenchimento da diária não dependem disso — e a sessão de 90 dias, que nunca é
reverificada para editar, faz o esquecimento ser raro: ninguém digita senha em locação.

Provisionar um provedor agora exigiria um **domínio verificado**, que não existe (o projeto usa
o subdomínio da Vercel). Sem ele, o remetente não é verificável e a entrega vai para spam — o
que é pior do que não ter, porque aparenta funcionar.

**Decisão:** o fluxo de reset é implementado por inteiro; o envio fica atrás da interface
`Mailer` ([lib/auth/mailer.ts](../lib/auth/mailer.ts)), com uma implementação que registra a
mensagem no log do servidor. Ligar um provedor depois é escrever um segundo `Mailer` e trocar
uma linha — nada do fluxo muda.

**Alternativas descartadas:** provisionar Resend agora (entrega ruim sem domínio); não ter
recuperação nenhuma (ponto sem saída num aparelho novo); trocar senha por login com Google
(exclui quem não tem conta Google e amarra o login a um terceiro).

**Consequências:**

- Verificação de e-mail fica **desligada**: exigi-la sem envio trancaria todo mundo do lado de
  fora.
- A UI não mente: a confirmação diz que o link foi **gerado**, não enviado, e orienta a falar
  com quem administra a produção.
- Enquanto isso, quem esquece a senha depende de um administrador. A ação de "OWNER redefine a
  senha de um membro" entra junto com a tela de membros, na Fase 3.

**Reavaliar quando:** houver domínio próprio — aí o provedor entra e a verificação de e-mail
volta a ser avaliada.

---

### ADR-029 · Julgamento e natureza do take são eixos separados

`2026-08-10` · **Aceita** · revisa o enum de [ADR-010](#adr-010--status-compartilhado-e-status-por-departamento)

Levantamento da prática de som e de continuidade mostrou que `TakeStatus` mistura duas coisas
que não são a mesma:

```
RECORDED · CIRCLE · NG · PARTIAL   → JULGAMENTO: o take presta?
WILD · ROOM_TONE · FALSE_START     → NATUREZA:  que tipo de take é este?
```

Um wild track pode ser circled. Um pick-up pode ser NG. Um take MOS tem julgamento de câmera e
nenhum de som. Com um enum só, cada combinação dessas obriga a escolher qual informação perder
— e a que se perde é sempre a que o outro departamento precisava.

O levantamento também mostrou o que falta nos dois eixos:

| Eixo           | Falta hoje                                                           |
| -------------- | -------------------------------------------------------------------- |
| **Julgamento** | `HOLD` — "bom, mas não perfeito", o terceiro veredito clássico       |
| **Julgamento** | motivo do `NG`: na prática, "NG sem motivo" é anotação inútil na pós |
| **Natureza**   | `MOS` (rodado sem som), `PLAYBACK`, `PICKUP` (PU), `SERIES` (SER)    |

**Decisão:** `TakeStatus` fica sendo **só julgamento** (`RECORDED`, `CIRCLE`, `HOLD`, `NG`,
`PARTIAL`) e ganha um eixo irmão `TakeKind` para a natureza (`SYNC`, `MOS`, `WILD`,
`ROOM_TONE`, `PLAYBACK`, `PICKUP`, `SERIES`, `FALSE_START`). `NG` ganha um campo de motivo em
texto livre, por departamento.

**Consequência de UX, e ela é inegociável:** o toggle "Aprovado pelo diretor" do Boletim de
Câmera **continua exatamente como está** — a mesma consequência que ADR-010 já fixava. A
natureza do take é um seletor secundário, com `SYNC` por padrão; ninguém em set escolhe
"SYNC" a cada tomada.

**Custo:** dois valores novos no enum de julgamento, um enum novo, uma coluna nova por
`*_take_data`. Nada disso quebra dado existente — `RECORDED` continua sendo o padrão e
`WILD`/`ROOM_TONE`/`FALSE_START` migram de eixo com um `update` determinístico.

**Quando entra:** Fase 6 (Som), que é quem primeiro precisa dos dois eixos ao mesmo tempo.
Antes disso, nada muda.

---

### ADR-030 · O módulo de Câmera reproduz o boletim, tela por tela

`2026-08-10` · **Aceita** · reforça [ADR-024](#adr-024--design-system-único-o-do-boletim-de-câmera) e a regra de não-regressão

A superfície de diária da Fase 4 (`/p/[id]/diarias/[dayId]/takes`) apresenta `Cena → Setup →
Take` diretamente, porque o objetivo dela era **provar o sync** com o menor consumidor
possível. Vista por quem usa o Boletim de Câmera, ela parece o módulo de câmera — e não é.

O feedback do proprietário foi direto: a área de câmera mudou demais.

**Decisão:** o módulo de Câmera da Fase 5 reproduz o boletim atual **na estrutura de tela**,
não só na lista de campos:

- a hierarquia visível continua sendo **Cena → Bloco → Plano → Take**, com os mesmos cartões,
  a mesma ordem de seções e os mesmos gestos (duplicar, mover, colapsar);
- `Setup` continua sendo o nome do conceito **no modelo**; na tela de câmera, ele se chama
  **Plano**, como sempre se chamou;
- auto-save com debounce e "Salvando… / Salvo", sem botão salvar;
- as seções Mídia/Suporte, Cenas do Dia, Horários, Equipe e Observações Gerais permanecem;
- o toggle "Aprovado pelo diretor" permanece verde e no mesmo lugar.

**Consequência:** a tela da Fase 4 é **provisória**. Ela não é o módulo de câmera, não deve
ser divulgada como tal, e sai de cena quando a Fase 5 entrega o módulo real. Enquanto isso,
Som e Continuidade a usam como base — para eles não há "como era antes" a preservar.

**O que isso não é:** não é congelar o modelo. Herança de técnica/óptica por take (ADR-011),
`TakeKind` (ADR-029) e os campos novos de [features/camera.md §3](features/camera.md#3-organização-dos-campos-10)
continuam entrando. A regra é sobre **o que o usuário vê e os dedos fazem**, não sobre o que o
banco guarda.

---

### ADR-031 · Departamento sem módulo entra para gestão, não para anotação

`2026-08-10` · **Aceita** · complementa [ADR-016](#adr-016--fronteira-offline-explícita) e a matriz de [permissions.md §2](architecture/permissions.md#2-departamentos)

`Department` tem onze valores; três têm módulo (`CAMERA`, `SOUND`, `CONTINUITY`). Um membro de
Direção, Produção ou Elétrica entra na sala legitimamente — para criar diária, administrar
equipe, acompanhar o dia — mas não tem **nada** para anotar.

A matriz de permissões diz que dado compartilhado (`scenes`, `setups`, `takes`) é gravável por
qualquer `MEMBER`+, independentemente do departamento. Levada ao pé da letra, ela abriria a
tela de anotação para quem não tem o que anotar: um formulário vazio, num aplicativo que se
propõe a ser mais rápido que um caderno.

**Decisão:** a superfície de anotação é **somente leitura** para quem não tem nenhum
departamento ativo, com o motivo dito na tela — _"cadastrado apenas para gestão; ainda não é
possível fazer anotações do seu departamento no app"_. Vale para qualquer papel, `OWNER`
inclusive.

**Por que não abrir exceção para `ADMIN`/`OWNER`:** já existe o caminho certo para isso.
`production_member_departments` permite acrescentar `CAMERA` a quem precisa corrigir dado de
câmera — explícito, visível na tela de equipe, e reversível. Uma exceção por papel seria
invisível e transformaria "sou dono" em "posso preencher o boletim dos outros".

**O que isto não restringe:** leitura, que continua livre para todo membro, sempre — é a razão
de a plataforma existir. Gestão da sala, diárias, equipamentos e relatórios também não são
afetados.

**Consequência quando um módulo novo nascer:** basta entrar em `ACTIVE_DEPARTMENTS`. A tela
deixa de ser somente leitura para aquele departamento sem nenhuma outra mudança.

---

### ADR-032 · `/legado` recebe as rotas do boletim, mas `/` continua sendo o boletim

`2026-08-11` · **Aceita** · fecha um item da [Fase 5](roadmap.md#-fase-5--câmera-na-plataforma) · complementa [ADR-030](#adr-030--o-módulo-de-câmera-reproduz-o-boletim-tela-por-tela)

O roadmap pedia "rotas atuais movidas para `/legado`, ainda funcionando sem conta". Movê-las é
direto; o que não é direto é **o que fica em `/`**.

`/` é o `start_url` e o `scope` do manifesto — é o que abre no aparelho de quem já instalou o
app e usa em set. Apontá-lo para a plataforma cobraria um toque a mais, todo dia, de quem só
quer os boletins que já estão no aparelho, e cobraria conta de quem não tem. As duas coisas
contrariam regras já escritas: "o Boletim de Câmera não regride, nem em toques" (roadmap §1) e
"uso sem conta continua sendo um modo suportado, não uma versão degradada"
([features/camera.md §7](features/camera.md#7-compatibilidade)).

**Decisão:**

1. O editor local mora em `/legado`, `/legado/novo`, `/legado/editar`, `/legado/visualizar`.
   Todo link interno do boletim aponta para lá.
2. **`/` renderiza a mesma lista.** É a casa de quem não tem conta, e continua sendo.
3. `/novo`, `/editar` e `/visualizar` continuam navegáveis por **rewrite**.
4. A lista local ganha uma porta visível para a plataforma; a plataforma já tinha a porta de
   volta.

**Por que rewrite e não redirect** — a parte que não é estética. As três URLs antigas estão no
precache do Service Worker e nos favoritos de quem usa o app. Uma resposta com a marca de
redirecionamento, guardada em cache e devolvida depois para uma navegação, é **recusada pelo
navegador**. O sintoma seria o app parar de abrir offline exatamente em quem criou o atalho —
uma quebra silenciosa, só em produção, só para os usuários mais antigos. O rewrite é invisível:
a URL não muda e a resposta é comum.

**O que fica em aberto, de propósito:** `/` ser sensível à sessão — abrir na diária de hoje
para quem tem conta — é assunto da [Fase 11](roadmap.md#-fase-11--caminho-curto-até-a-anotação),
que existe justamente para o caminho curto até a anotação. Decidir isso agora seria adivinhar
qual é a diária ativa antes de haver como saber.

**Consequência para a importação:** a tela de importação dos boletins locais
([local-to-cloud.md](migrations/local-to-cloud.md)) nasce em `/legado`, ao lado dos boletins que
ela importa, e não na sala — quem tem o que importar está aqui.

---

### ADR-033 · O layout de tracks é herdado do take anterior, não guardado na diária

`2026-08-11` · **Aceita** · fecha um item da [Fase 6](roadmap.md#-fase-6--som--fase-7--continuidade) · revisita [features/sound.md §2](features/sound.md#2-dados) · complementa [ADR-019](#adr-019--ids-determinísticos-por-chave-natural)

[sound.md §2](features/sound.md#2-dados) dizia que o layout de tracks é "configurado uma vez na
diária e herdado por todo take novo", e `SoundDayConfig.trackTemplate` existia no modelo de
domínio para guardá-lo. Na hora de implementar o módulo, esse campo não tem coluna no Postgres,
não está no registro de sync e não está no Dexie — a herança precisava nascer de algum lugar.

Havia duas saídas: criar `sound_day_config.track_template` (jsonb) ou herdar do take anterior.

**Decisão: herdar do take anterior.** `ensureSoundTracks` copia índice, nome e fonte do último
take que teve canais — o anterior do mesmo plano, ou o último do dia na ordem de leitura. As
`notes` não são herdadas: "lav estalando" é daquele take.

**Por que não a coluna jsonb**, que era o caminho aparentemente mais direto:

1. **Seria uma segunda verdade sobre o mesmo dado.** As tracks já existem como linhas, com id
   derivado de `(take, índice)`. Um template paralelo obrigaria a decidir, a cada leitura, qual
   dos dois manda — e a resposta seria diferente para o take de ontem e o de agora.
2. **Lista dentro de registro não tem merge por campo.** É exatamente o motivo pelo qual as
   tracks são tabela e não array ([contracts/sync.ts](../lib/contracts/sync.ts)): duas pessoas
   mexendo em canais diferentes do mesmo take conflitariam sem motivo. Um `track_template` jsonb
   reintroduziria esse conflito no nível da diária, que é pior — todo mundo edita a diária.
3. **Custódia.** Um template retroativo permitiria "corrigir" o layout às 18h e mudar o que o
   relatório afirma sobre um take gravado às 9h. O sound report é cadeia de custódia: cada take
   tem de guardar o que ele **realmente teve**.
4. Herdando, o layout se propaga sozinho e o dia continua tendo um layout — só que ele é um
   fato observado, não uma declaração à parte.

**Consequência prática:** o mixer digita os canais **uma vez**, no primeiro take, e nunca mais.
Trocar o canal 3 no take 7 vale do 7 em diante. É o mesmo contrato de herança do roll e do nome
de arquivo (§30), aplicado ao layout — um mecanismo, não dois.

**O que fica pendente:** `SoundDayConfig.trackTemplate` e `tracksFromTemplate()` continuam em
`domain/platform/` sem persistência. Não são usados pelo módulo e devem ser removidos, ou ganhar
persistência, quando a Fase 8 ligar o Som ao catálogo de equipamentos — a decisão de mexer em
`domain/platform/` não é do módulo.

---

### ADR-034 · O Relatório de Progresso guarda só o que exige mão humana

`2026-08-11` · **Aceita** · abre a [Fase 7](roadmap.md#-fase-6--som--fase-7--continuidade) · implementa [features/continuity.md §7](features/continuity.md#7-o-que-a-prática-exige--levantamento) · revisita a frase "guardar o total em oitavos como inteiro" do mesmo §7

O levantamento de `2026-08-10` descobriu que faltava um documento inteiro: o **Relatório de
Progresso da Diária**, que a produção consome todo dia e que o modelo não contemplava em lugar
nenhum. Ele não é um relatório de takes — é o balanço do dia: horários, contagens, páginas em
oitavos, cobertura, mídia e observações.

Ao implementá-lo aparecem duas perguntas que o §7 deixou em aberto.

#### 1. O que tem coluna

**Decisão: só o que exige mão humana.** `daily_progress_report` guarda `first_take_at`,
`pages_shot`, `estimated_minutes`, as quatro listas de cobertura, `notes` e `signed_by`. Uma
linha por diária, id derivado da diária (ADR-019).

Cenas rodadas, setups, takes, cartões e rolls **não têm coluna**: saem dos registros que já
existem. Guardá-los criaria dois números para o mesmo fato — e o guardado estaria sempre um
pouco mais velho que o verdadeiro, porque a diária continua sendo preenchida depois de alguém
abrir o relatório. Um relatório que discorda da diária que o gerou é pior que nenhum relatório.

**A cobertura é texto**, em lista de números de cena ("24, 25A, 31"), e não uma tabela
cena×diária. É assim que o formulário de papel funciona, é o que sai impresso, e uma tabela
obrigaria a continuísta a marcar cena por cena exatamente na hora do wrap — o pior momento do
dia para pedir precisão de banco de dados. Se a busca por "que dias cobriram a cena 24" virar
necessidade real, a tabela nasce então, alimentada por este texto.

#### 2. Páginas em oitavos: função, não coluna

O §7 dizia que `scenes.page`, sendo texto livre, "precisa aceitar `2 4/8` e guardar o total em
oitavos como inteiro". **Fica só a primeira metade.** A conversão é
[`domain/platform/paginas.ts`](../domain/platform/paginas.ts) — pura, testada, sem coluna nova.

Guardar o inteiro ao lado do texto é manter um cache do dado ao lado do próprio dado, e cache
do que está na linha de cima envelhece calado: bastaria uma escrita por um caminho que
esquecesse de recalcular — a importação de boletins, uma migration, um cliente de versão
anterior — para o total passar a mentir sem nenhum sintoma. O parser precisa existir de todo
jeito para preencher a coluna; a coluna é que não precisa existir.

O que a coluna compraria seria agregação em SQL, e não é onde a soma acontece: o relatório é
fechado no wrap, **dentro da fronteira offline** (ADR-016), somando algumas dezenas de cenas no
próprio aparelho. Uma soma que precisasse do servidor seria uma soma que não acontece em
locação.

**Consequência que vale mais que a economia de coluna:** `paginaEmOitavos` devolve `null` — e
não `0` — para o que não dá para somar, e `somaPaginas` devolve os valores recusados. O
relatório mostra "2 4/8 (+1 sem soma: 'meia')" em vez de fingir um total completo. Errar para
menos em silêncio, num número que a produção lê no fim do dia, é o defeito que ninguém
descobre.

---

### ADR-035 · A folha impressa é diferencial: o que se repete o dia inteiro vira "padrão da diária"

`2026-08-19` · **Aceita** · revisita [ADR-014](#adr-014--manter-a-impressão-nativa-para-pdf) · vale também para [ADR-030](#adr-030--o-módulo-de-câmera-reproduz-o-boletim-tela-por-tela)

Duas diárias reais de _Amigo Gay_ saíram do `/legado/visualizar`: a de 15/08 com 4 cenas, 21
planos e 51 takes gerou **8 páginas**; a de 16/08, com 15 planos e 30 takes, gerou **6**. Postas
ao lado da OD correspondente — uma página por diária, com o dia inteiro em uma tabela — a
diferença não era de conteúdo, era de repetição.

O que ocupava as páginas:

1. **A configuração técnica reimpressa em cada plano.** Todo plano herda o anterior, então
   `opengate · 6K 4:3 · 24 fps · ISO 400 · 180° · T2.9 · 5600K · Matte Box · sem filtro`
   aparecia 21 vezes. Em 231 chips impressos, uns 30 eram informação nova.
2. **Uma tabela de takes por plano**, com o cabeçalho `# · CAM · CARTÃO · CLIP/SYNC · NOTA ·
STATUS` repetido 21 vezes, e as colunas `CARTÃO`/`CLIP/SYNC`/`NOTA` vazias em 48 dos 51
   takes — 144 células com um travessão dentro.
3. **A coluna `CAM`** com "Black Magic" em todas as 51 linhas, numa diária de uma câmera só.
4. **Uma faixa `BLOCO X · 1 plano`** para cada bloco. No set real o bloco quase sempre tem um
   plano: 15 blocos com 15 planos na diária 02, 17 com 21 na diária 01. A faixa era um título
   para uma linha.

**Decisão: a folha passa a ser diferencial.** [`features/boletins/folha.ts`](../features/boletins/folha.ts)
lê a diária uma vez e produz três coisas que não existiam:

- **O padrão da diária** — para cada campo técnico, o valor que a **maioria** dos planos usa.
  Impresso uma vez, no alto. Cada plano imprime apenas o que difere dele.
- **A régua de takes** — todo take vira um quadradinho numerado, o aprovado em verde. Um plano
  de seis takes cabe em uma linha. Só o take que tem cartão, clip/sync ou nota ganha linha
  própria, com o texto que alguém de fato escreveu.
- **A identificação curta** — dentro da cena, o que é igual na cena inteira sai da linha e vai
  para o cabeçalho dela. Uma cena cujos blocos são todos "A" mostra `BLOCO A` no cabeçalho e
  os números dos planos na coluna; uma cena com blocos A/D/C/E/F-H/J e todos "plano 2" mostra
  só as letras. É como a OD escreve: `1.2 - A`.

**Maioria, e não "o valor mais comum".** Se o dia se divide ao meio entre 24 e 48 fps, não
existe padrão de fps e os dois valores continuam impressos plano a plano. Um "padrão" que
descreve 40% da diária faria o leitor assumir errado nos outros 60% — e um boletim é lido
justamente por quem não estava lá.

**Campo vazio não imprime nada.** O travessão de ausência foi metade do volume: ausência de
anotação não é decisão de câmera. A exceção é o booleano com padrão contrário — num dia que
usa matte box, o plano _sem_ matte box imprime "sem Matte Box", porque aí a ausência é a
decisão.

**Consequências:**

- A mesma diária de 21 planos e 51 takes cabe em **duas páginas** sem perder um dado: tudo que
  foi digitado continua impresso, uma vez cada.
- A tela de visualização e o PDF são a mesma leitura — `montaFolha()` é a única —, então não
  existe "sai diferente na impressão".
- `npm run test:folha` (62 checks) trava as regras que o papel depende: que a maioria não
  invente padrão, que campo vazio não vire linha, que nenhum plano fique sem identificação.
- **O modelo de dados não mudou.** Bloco continua existindo; a folha é que parou de dar a ele
  um título quando ele não separa nada. Anotar continua como está — a bagunça de entrada é
  legítima, é o relatório que precisava ser escrito.

**Não decidido aqui:** a mesma inversão para a folha do módulo de Câmera da plataforma
([`features/camera/estrutura.ts`](../features/camera/estrutura.ts)), que tem o mesmo problema em
menor escala. Fica para quando o módulo imprimir uma diária real.

---

### ADR-036 · A busca tem dois alcances declarados, e eles não viram uma lista só

`2026-08-19` · **Aceita** · fecha a [Fase 8](roadmap.md#-fase-8--integração) · revisita
["os dois caminhos entregam o mesmo formato de resultado"](features/production-room.md#5-busca-8-do-roadmap),
que a Fase 8 deixou escrito como se o resultado devesse ser **um só**

A busca **da diária** já existia desde a Fase 8: local, sobre a diária fixada, respondendo a
cada tecla e sem rede. Faltava a busca **da produção inteira** — a que alcança o que este
aparelho nunca baixou. O plano dizia "fundir os dois caminhos num resultado só". Ao
implementar, essa fusão se revela a pior das opções disponíveis.

**Decisão: dois alcances, cada um dizendo qual é o seu, e um levando ao outro com o termo na
mão.**

- **Diária** — `filtraLinhas` sobre o banco local. Instantânea, offline, alcança um dia.
- **Produção** — [`lib/db/queries/search.ts`](../lib/db/queries/search.ts), Server Component
  em `/p/[id]/busca`. Alcança toda diária da produção e **exige rede**, como o resto da sala
  (ADR-016).

**Por que não uma lista só.** Uma lista misturada seria composta de duas metades com
disponibilidade diferente: a local sempre existe, a do servidor some quando o sinal cai. O
sintoma seria uma busca que **encolhe em silêncio** — o mesmo termo, o mesmo aparelho, menos
resultados, sem nada na tela explicando por quê. Numa busca, isso não é degradação: é a
pessoa concluindo "esse take não existe" e refazendo trabalho que já estava feito. Duas
listas rotuladas dizem a verdade sobre o que cada uma cobre.

**O que é fundido de verdade é a semântica.** As duas exigem que **cada palavra do termo
apareça** ("24 boom" é o take da cena 24 com nota de boom, não tudo que tem 24 ou boom), as
duas concatenam o texto pesquisável antes de comparar — para que as palavras possam vir de
campos diferentes — e as duas devolvem o mesmo formato: cena · plano · take, mais onde bateu.
Quem aprende uma sabe usar a outra, que é o que "um resultado só" queria dizer.

E as duas se entregam o termo: a diária oferece "procurar em todas as diárias" quando há
termo digitado, e o resultado da produção abre a diária com `?q=` já preenchido. Procurar
duas vezes a mesma coisa é onde a pessoa desiste.

**`ilike`, e não `to_tsvector`.** O índice `scenes_search` (migration `0001`) é full-text em
português sobre a cena e continua servindo à descrição. Mas o que se procura aqui é quase
sempre **identificador**: `A023`, `A023C012_001`, `008_012`, `24B`. Full-text trata
`A023C012_001` como um lexema só — buscar `A023` **não acharia**, que é exatamente o sintoma
de "a busca não acha nada". Trecho é o que este domínio pede. O preço é varredura sem índice;
numa produção — dezenas de diárias, milhares de takes — é barato, e se um dia deixar de ser,
a resposta é um índice `pg_trgm` sobre as mesmas colunas, não trocar a semântica que as
pessoas já aprenderam.

**Consequências:**

- A fronteira offline **não muda**: nada é escrito na busca, nenhuma entidade nova entra no
  sync, e a tela de produção é sala comum — Server Component lendo Drizzle.
- Multicam devolve **um resultado por take**, com a primeira câmera como rótulo. A busca
  responde "onde está"; quem quer as duas câmeras abre a diária consolidada, que mostra as
  duas.
- O resultado tem teto (`LIMITE_DE_BUSCA`, 60) e a tela diz quando bateu nele. Uma lista sem
  fim é uma lista que ninguém lê — e o remédio, acrescentar uma palavra, é a mesma regra que
  a busca já ensina.

---

### ADR-037 · O caminho curto é o atalho que lembra, e `/` continua sendo o boletim

`2026-08-20` · **Aceita** · implementa a [Fase 11](roadmap.md#-fase-11--caminho-curto-até-a-anotação) ·
**revisita** [ADR-032](#adr-032--legado-recebe-as-rotas-do-boletim-mas--continua-sendo-o-boletim),
que previa "quando `/` passar a ser sensível à sessão, será na Fase 11"

Do ícone do app até marcar um take eram **cinco toques**: abrir, "trabalhar com a equipe",
produção, diárias, a diária, o departamento. Todo dia. Em set isso não é incômodo de
interface — é o motivo pelo qual alguém volta para o caderno.

A saída óbvia seria fazer `/` decidir para onde ir conforme a sessão. **Ela está errada por
dois motivos**, e os dois só aparecem quando se olha o aparelho de verdade:

1. `/` é o `start_url` do PWA instalado e **precisa abrir sem rede**. Uma raiz sensível à
   sessão é uma raiz que consulta o servidor: em modo avião ela cairia no `/offline`, e o
   app que se vende como offline-first passaria a não abrir justamente onde precisa.
2. Usar o boletim **sem conta** continua sendo um modo suportado (ADR-025 / camera.md §7).
   Redirecionar `/` para a plataforma cobraria um toque a mais, todo dia, de quem só quer
   os boletins que já estão no aparelho — a regressão que a regra número um do roadmap
   proíbe.

**Decisão: `/` continua sendo o Boletim de Câmera local, e ganha em cima um botão que só
existe quando há para onde voltar.** Quem nunca abriu uma diária vê a tela de sempre, sem
um pixel a mais.

#### O ponteiro mora no `localStorage`

`lib/atalhos.ts` guarda produção, diária, módulo e os **rótulos** — e é lido por `/`, pela
barra da sala e pela rota `/continuar`.

- **Não é do servidor.** "Onde eu estava" é fato deste aparelho, não da produção: o
  continuísta que abre o celular não quer voltar para onde o assistente de câmera parou.
- **Não é do Dexie.** É lido em `/`, que é o boletim local, não conhece a camada da
  plataforma e precisa abrir instantaneamente; abrir o IndexedDB para ler seis campos
  custaria um `await` antes do primeiro pixel.
- **Os rótulos vão junto** porque quem lê o atalho pode estar sem rede — a tela inicial
  escreve "Diária 12 · 19/08/2026" sem perguntar nada.
- **Envelhece em sete dias.** Depois disso o atalho vira palpite: a diária acabou, a
  produção virou outra, e o botão levaria alguém para um dia encerrado achando que é o de
  hoje. Some sozinho em vez de mentir.

#### Quem sabe que dia é hoje é o aparelho

`/hoje` é a outra ponta — o atalho do ícone do app — e **exige rede**, porque é a primeira
porta do dia, quando ainda se está saindo de casa. Ela recebe a data por `?d=`, preenchida
pelo relógio do celular, e nunca pergunta `current_date` ao banco: a diária é dia civil e
nunca vira UTC (R9), e às 21h de Brasília o servidor já está no dia seguinte. Uma diária a
mais de distância, e o atalho abriria o dia errado — em que alguém anotaria o take de hoje.

Havendo **uma** diária hoje, `/hoje` não é uma tela: redireciona direto para o módulo do
departamento da pessoa. Havendo duas, pergunta — escolher errado por conta do app é pior do
que escolher na mão.

#### A fixação automática é a condição, não o enfeite

Sem fixar hoje e amanhã em segundo plano, o atalho levaria a uma tela que **precisa de
rede** — e quem usa o atalho está saindo às 5h para uma locação sem cobertura. A fixação
acontece ao abrir a sala, a partir da lista de diárias que a página já carregou, escolhendo
hoje e amanhã pelo relógio do aparelho. É a ponte entre a sala e a fronteira offline, e por
isso mora em `features/diaria/`: a sala continua sem depender de Dexie para desenhar o que
mostra, e se a fixação falhar nada na tela muda.

**Consequências:**

- Os toques caíram de **cinco para um** no caminho diário (medição em
  [roadmap §Fase 11](roadmap.md#-fase-11--caminho-curto-até-a-anotação)), e de três para um
  no "voltar da sala para a anotação".
- **Nada foi removido.** A lista de produções, a lista de diárias e a navegação da sala
  continuam inteiras: atalho que esconde o caminho longo vira armadilha no dia em que o
  caminho longo é o certo.
- O primeiro dia num aparelho novo continua custando o caminho completo — não há o que
  lembrar antes de a pessoa ter estado em algum lugar. É o preço de não adivinhar.

---

### ADR-038 · O limite de tentativas mora no banco; RLS fica de fora, e a sessão longa se paga com revogação

`2026-08-20` · **Aceita** · implementa a [Fase 10](roadmap.md#-fase-10--hardening) ·
**revisita** [ADR-025](#adr-025--conta-obrigatória-na-plataforma-legado-sem-conta) e o item 4 da
[§7 de database.md](architecture/database.md#7-segurança), que prometia "avaliar RLS na Fase 10"

Três perguntas de endurecimento que pareciam independentes e não são: as três são sobre o que
acontece quando o atacante tem **tempo**, e as três respondem à mesma pressão vinda do
offline-first.

#### O contador do rate limit é tabela, não memória

A Better Auth já limita `/api/auth/**`. O padrão dela é contar **em memória** — e em memória o
limite quase não existe num deploy serverless: cada instância tem o seu contador, então "cinco
tentativas por minuto" vira cinco por minuto **por instância**. Quem está adivinhando ganha o
paralelismo de graça, e o gráfico de segurança fica bonito enquanto a porta está aberta.

**Decisão: `storage: 'database'`**, tabela `rate_limits` (migration `0008`). O contador é um só,
e é um lugar só para olhar quando alguém reclamar de ter sido barrado.

O resgate do **código de convite** não passa por rota da Better Auth — é Server Action — e ficou
de fora até aqui. É o alvo que mais compensa: o código tem quatro caracteres sobre um alfabeto
de 32 e o prefixo vem do nome da produção, que quem quer entrar geralmente conhece. Entra em
`lib/auth/limite.ts`, **na mesma tabela**: duas tabelas de contador seriam dois lugares para
esquecer de limpar.

A chave é o **usuário**, não o IP. A ação exige sessão, então ganhar paralelismo custa muitas
contas — e criar conta já é limitado. Por IP puniria a equipe inteira atrás do roteador da base,
que é o caso normal e não o suspeito.

#### RLS: **não** entra, e a razão não é preguiça

Row Level Security do Postgres protege contra uma conexão que chega ao banco com identidade de
usuário. **Não é o que existe aqui**: o driver serverless usa uma conexão de aplicação única, e
o `user_id` não atravessa a conexão — chega como argumento da query. Ligar RLS assim significa
ou rodar `set local app.user_id` a cada requisição (que o driver HTTP, sem transação interativa,
não sustenta), ou uma política que aceita tudo — segurança de fachada, que é pior que nenhuma
porque muda o que as pessoas acham que está protegido.

**Decisão: a autorização continua sendo da aplicação**, em `lib/db/queries` e `lib/auth/guards`,
onde ela é legível, testável (`npm run test:sala`) e já cobre a regra que RLS não expressaria de
qualquer jeito — "não é membro recebe 404, não 403".

RLS volta à mesa no dia em que houver acesso direto ao banco por identidade: cliente falando com
o Postgres, ou uma segunda aplicação com credencial própria. Nenhum dos dois está no roadmap.

#### A sessão de 90 dias se paga com revogação, não com expiração curta

A sessão longa não é folga: é o que sustenta o offline (ADR-025). Em locação sem sinal, sessão
expirada não tem como ser renovada — e o assistente fica sem preencher a diária, que é a única
coisa que o produto promete nunca acontecer.

O preço é real: um telefone perdido continua entrando na produção por três meses. **A resposta
não é encurtar a sessão** — encurtar quebra o offline para todo mundo por causa do aparelho de
um. A resposta é **poder revogar**, e isso só existe porque a sessão vive no banco e não num
JWT: um JWT não tem como ser cancelado antes de expirar. Era uma capacidade que o schema já
tinha e que não tinha tela.

`/conta` lista os aparelhos conectados — navegador, sistema, IP e desde quando — e derruba
qualquer um deles, ou todos os outros de uma vez. O aparelho atual **não** tem botão de
desconectar: ele tem "Sair", que é outra coisa, e misturar os dois faria alguém se deslogar
tentando derrubar o outro.

**Consequências:**

- Uma migration nova (`0008`) e uma tabela que **não** segue as convenções de domínio: sem
  `production_id`, sem auditoria, sem soft delete, sem `version`, sem trigger de `sync_log`. É
  schema da Better Auth, como `sessions` — e contador de tentativa não sincroniza para aparelho
  nenhum.
- O limite passa a valer em produção e **não** em desenvolvimento (o padrão da biblioteca), o
  que é deliberado: um limite que dispara no `npm run dev` é um limite que se aprende a
  contornar.
- Quem for barrado vê "tente de novo em 12 minutos", não "espere 743 segundos". Mensagem que
  não é acionável vira ticket de suporte.
- A tabela ganha **poda**: é uma linha por chave e chave nova a cada IP, então sem limpeza ela
  só cresce. Some o que passou de 24 h, junto do resgate de código — operação rara, faxina
  fora do caminho quente. Não é cron porque não precisa ser ainda; quando precisar, é cron, e
  não uma poda mais agressiva por requisição.
- A §7 de `database.md` deixa de prometer RLS e passa a explicar por que não.
