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
