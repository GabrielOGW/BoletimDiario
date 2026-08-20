# Roadmap

Onze fases. Cada uma é **entregável e desligável por feature flag** — nenhuma deixa o app num
estado intermediário quebrado, e nenhuma pode regredir o Boletim de Câmera.

> **Reordenado na rodada 2.** A mudança de fundo: **a sala vem antes do sync, e o sync vem antes
> do câmera**. A sala é server-oriented puro e valida auth, permissões e deploy sem tocar em
> sincronização; o sync ganha um consumidor real e pequeno para se provar; e o Boletim de
> Câmera — o módulo maduro, o que não pode regredir — é reconstruído por último, sobre fundação
> já estável. Razões em [plano-arquitetural-v2.md §I](plano-arquitetural-v2.md#i-roadmap).

Legenda: ✅ concluída · ⏳ em andamento · 📋 planejada

---

## ✅ Fase 1 — Arquitetura

Análise, modelagem, documentação e decisões tecnológicas.

- [x] Análise do repositório — [architecture/current-state.md](architecture/current-state.md)
- [x] Arquitetura proposta — [architecture/overview.md](architecture/overview.md)
- [x] Modelo de dados + DDL de referência — [architecture/database.md](architecture/database.md)
- [x] Autenticação, permissões, offline, sincronização, migração
- [x] Riscos e registro de decisões
- [x] **Código:** modelo de domínio compartilhado, puro e sem dependências —
      [`domain/platform/`](../domain/platform)
- [x] **Código:** regras de set (herança, incremento, reset de take) com teste
- [x] **Código:** mapeador `Boletim` v2 → plataforma com teste

**Não alterou nada do aplicativo existente.**

---

## ⏳ Fase 1.5 — Preparação (rodada 2)

Incorporação das decisões de [risks-response.md](risks-response.md). Documentação e ferramental,
uma única mudança de código.

- [x] [plano-arquitetural-v2.md](plano-arquitetural-v2.md) — decisões finais, A–J
- [x] `decisions.md`: ADR-016…ADR-027 + blocos "Revisto em" em ADR-003, 007, 008, 009, 012
- [x] `risks.md`: matriz refeita (R1 e R5 removidos; R2b, R13–R17 acrescentados)
- [x] Fronteira offline em `offline-first.md` e `overview.md`; fotos removidas de toda a doc
- [x] `synchronization.md`: compare-and-set por campo, polling adaptativo, SSE como upgrade
- [x] `local-to-cloud.md`: reescrito como importação opcional
- [x] `utils/id.ts`: fallback sobre `crypto.getRandomValues` (R10)
- [x] `.claude/skills/{banco,sync,modulo,plataforma,testes}` + `CLAUDE.md`

---

## ✅ Fase 2 — Fundação servidor

Neon, Drizzle, migrations, auth, produções, membros, permissões.

- [x] Projeto Neon + `DATABASE_URL`
- [x] Drizzle: `lib/db/schema/` implementando o DDL de [database.md](architecture/database.md)
- [x] Migrations + triggers de `sync_log` e de `version`, verificados contra o banco real
- [x] Better Auth: cadastro, login, logout, recuperação de senha
- [x] `lib/auth/guards.ts` — `requireMember`, `requireDepartment`
- [x] `lib/contracts/` — schemas Zod compartilhados (inclui validação de UUID)
- [x] `lib/db/queries/` — produções, membros, código de convite (com `import 'server-only'`)
- [x] Rotas `(public)`: login, cadastro, recuperar senha, redefinir senha
- [x] **Deploy na Vercel** — **resolvido em `2026-08-19`**. Ficou falhando de `2026-08-10`
      a `2026-08-19` por uma causa só: o ambiente **Production** do projeto não tinha
      `DATABASE_URL` nem `BETTER_AUTH_SECRET`. Todo deploy de Preview passava e todo
      deploy de Production falhava, sempre no mesmo ponto — o build morria em
      `Failed to collect page data for /api/sync/snapshot`, que **parecia** defeito de
      código. Com as variáveis marcadas para Production no painel e um redeploy, a
      produção subiu e o banco responde. O `prebuild` roda `scripts/check-env.mjs` desde
      `2026-08-11`: se faltar variável de novo, o nome dela aparece no topo do log, e não
      um erro de página.

**Entregue:** cadastro devolve id UUID, sessão de 90 dias, o ciclo completo de reset de senha
funciona, e o id da Better Auth serve de `created_by` no domínio com o trigger de `sync_log`
disparando. Verificado por `npm run test:db` (20 checks) e por exercício HTTP contra o build de
produção.

**Pendências conscientes:**

- Envio de e-mail ([ADR-028](decisions.md#adr-028--recuperação-de-senha-sem-provedor-de-e-mail)):
  o link de redefinição é gerado e registrado no log, não enviado.
- "OWNER redefine a senha de um membro" precisa da tela de membros — entra na Fase 3.
- Deploy: a CLI da Vercel não está instalada neste ambiente.

O app de câmera continua intacto.

---

## ✅ Fase 3 — Sala (sem offline)

Server-oriented puro. Nenhuma linha de Dexie.

- [x] `/producoes` — listar, criar, entrar por código
- [x] Sala da produção: membros, papéis, departamentos, transferência de posse, saída
- [x] Diárias: criar, listar, abrir, editar, excluir (CRUD de `ShootingDay`)
- [x] Dashboard da sala, somente leitura
- [x] Código de convite: visível a todo membro, rotação e fechamento por `ADMIN`+
- [x] Design system: reuso integral; nenhum componente novo além de `SelectField`

**Entregue:** dois usuários, um criando e outro entrando por código, chegam ao papel e ao
departamento corretos; as regras relacionais de papel vivem no servidor e são recusadas lá,
não escondidas na UI. Verificado por `npm run test:sala` (27 checks) e por exercício HTTP
contra o build de produção — sem sessão, toda rota privada responde `307 → /login`; com
sessão de quem não é membro, `/p/<id>` responde **404**, não 403.

**Notas de implementação:**

- Sem `middleware.ts`: o layout de `app/(app)/` resolve a sessão no servidor, e Server
  Component não tem flash de tela privada para evitar. Uma camada a menos
  ([authentication.md §4](architecture/authentication.md#4-proteção-de-rotas)).
- `TextField` e `TextAreaField` ganharam modo **não controlado** (`name`/`defaultValue`) em vez
  de componentes paralelos: nos formulários de Server Action o dono do valor é o `<form>`
  (ADR-024). O modo controlado do boletim não mudou.
- Único componente novo: `SelectField`, `<select>` nativo com a moldura do `TextField`.
- `test/alias-loader.mjs` passou a resolver import relativo sem extensão e pasta com
  `index.ts` — era o que faltava para um teste importar a camada de query.

**Pendências conscientes:**

- Equipamentos, busca global e visão consolidada continuam nas Fases 8–9.
- Convite direto por e-mail e rate limit no resgate do código: Fase 10
  ([permissions.md §4](architecture/permissions.md#4-entrada-na-sala)).
- Deploy na Vercel: resolvido em `2026-08-19` (ver Fase 2). Enquanto esteve pendente, o
  que foi verificado contra o build de produção rodou local.

O app de câmera continua intacto.

---

## ✅ Fase 4 — Superfície offline + sync

O coração técnico. Consumidor: uma tela mínima de takes, não um módulo completo.

- [x] Dexie: `lib/offline/db.ts` + repositório da fronteira (`repos/diaria.ts`)
- [x] Fixação (pin) de diária + `/api/sync/snapshot`
- [x] Outbox com idempotência, ordem, coalescência e backoff com jitter
- [x] `/api/sync/push` com **compare-and-set por campo** e `/api/sync/pull` com cursor
- [x] Ids derivados de chave natural em runtime (ADR-019)
- [x] Polling adaptativo + indicador de conectividade e pendências
- [x] Conflitos: `syncConflicts` local + resolução em um toque
- [x] Versão de protocolo + `VERSION`/`APP_SHELL` gerados no build + aviso de atualização
- [x] Suíte de sync ([synchronization.md §8](architecture/synchronization.md#8-testes-obrigatórios))

**Entregue:** `Scene`, `Setup` e `Take` sincronizam campo a campo. Campos diferentes do mesmo
take fazem merge automático; o mesmo campo vira conflito **daquele campo**, que a tela resolve
em um toque e que não impede editar o resto. Ids derivados fazem dois dispositivos criando "o
take 4 do setup C" convergirem para um take só. Verificado por `npm run test:sync` (25 checks
contra o Neon real) e por exercício HTTP: `426` antes de qualquer consulta, `401` sem sessão,
`404` para não-membro, `422` para payload inválido.

A superfície consumidora é `/p/[id]/diarias/[dayId]/takes` — a **prova do sync**, não o módulo
de câmera. Ela é substituída pelo módulo real na Fase 5.

**Decisões tomadas aqui:**

- Tabela `sync_operations` (migration 0003): a idempotência guarda **o resultado**, não só o
  id. Recalcular no reenvio devolveria "sem conflito" onde houve um.
- `skipWaiting()` saiu do `install` do Service Worker: trocar de versão sozinho recarregaria
  a tela sob os dedos de quem está preenchendo. O usuário decide, pelo aviso.
- O snapshot checa a sessão antes de procurar a diária — senão 404 e 401 distinguiriam
  diária existente de inexistente para quem só tem o id.

**Pendências conscientes:**

- Dois testes exigem IndexedDB real (fechar o PWA e reabrir; duas abas com `liveQuery`) e
  ficam para o Playwright da Fase 10. A lógica pura que os sustenta já está testada.
- Fixação automática da diária de hoje e de amanhã em background: hoje a fixação acontece ao
  abrir a diária com rede.
- `ShootingDay` não entra no pull — chega pela fixação, porque é editado fora da fronteira.

---

## ✅ Fase 5 — Câmera na plataforma

A fase mais sensível: migrar o módulo que está em uso. **Migração, não redesenho.**

> **Fechada em `2026-08-19`** com a última pendência: **Mídia/Suporte**. Ela esperava o
> catálogo de equipamentos da Fase 8 — não era dívida desta fase, era ordem de
> dependência —, e agora existe na tela e na folha, **derivada**: o cartão vem do take,
> onde é anotado no instante em que a câmera roda, e o suporte vem do kit da produção
> alocado na diária. A tabela de quatro campos digitada à mão não voltou, e não vai
> voltar: ela pedia o mesmo número duas vezes
> ([features/camera.md §8](features/camera.md#8-mídiasuporte--fase-5-fechada-em-2026-08-19)).
>
> **`2026-08-11`:** tudo entregue **menos Mídia/Suporte**. Quatro lacunas
> de paridade ficaram com dono declarado em
> [features/camera.md §1](features/camera.md#o-que-falta-e-por-quê): `Plano.tipo` e a
> câmera do plano pedem uma passagem da skill `banco`; autocomplete e duplicação são
> módulos novos, não adaptações.

> **Reforçado em `2026-08-10`**, depois do teste da Fase 4 em set: a superfície mínima de
> takes foi lida como "a área de câmera mudou". Ela não é o módulo de câmera e é provisória
> ([ADR-030](decisions.md#adr-030--o-módulo-de-câmera-reproduz-o-boletim-tela-por-tela)). A
> paridade exigida aqui é **de tela**, não só de campo: Cena → Bloco → **Plano** → Take, os
> mesmos cartões, a mesma ordem de seções, os mesmos gestos, o mesmo toggle verde.

- [x] `features/camera/` sobre o modelo compartilhado e a superfície local
- [x] Paridade **de estrutura de tela**: Cena → Bloco → Plano → Take, cartões colapsáveis,
      auto-save com debounce, toggle verde "Aprovado pelo diretor" intacto
- [x] Câmeras cadastradas, técnica e óptica no cartão do Plano, cartão/clip-sync/nota no take
- [x] Herança entre takes (`inheritCameraFlat`, no domínio e com teste)
- [x] Paridade **campo a campo** — conferida item a item em
      [features/camera.md §1](features/camera.md#conferência-campo-a-campo--2026-08-11).
      Entraram os campos que faltavam: operador/foco/claquetista da câmera, matte box,
      observações do plano, número da cena e letra do bloco editáveis. Quatro lacunas
      ficaram com dono declarado — `Plano.tipo` e a câmera do plano precisam de uma
      passagem de `banco`; autocomplete e duplicação são módulos novos
- [x] Mídia/Suporte — seção própria na tela e na folha, derivada do take (cartão, roll,
      volume, takes sem cartão anotado) e do kit alocado na diária. `resumoDeMidia` em
      [`features/camera/estrutura.ts`](../features/camera/estrutura.ts) é lido pelos dois,
      como o resto do módulo, e coberto por `npm run test:camera`
- [x] Novos campos de [features/camera.md §3](features/camera.md#3-organização-dos-campos-10)
      — focal, aspect ratio, VFX, nº de série do corpo, roll, volume e observações de
      mídia. Falta só `Plano.tipo`, que não tem coluna; os demais itens de §3 não são
      campo de câmera (§3, "Como ficou")
- [x] `TakeStatus` **preservando** o toggle "Aprovado pelo diretor" — o toggle passou a
      gravar `approved` **e** `takes.status = CIRCLE` (ADR-010), e ganhou ao lado uma
      fileira secundária com o julgamento da câmera
      ([features/camera.md §4](features/camera.md#como-ficou-fase-5-1))
- [x] PDF com a mesma qualidade de saída — folha A4 em sobreposição na própria rota da
      diária, com as mesmas classes de impressão e a diferença técnica por take
      ([features/camera.md §6](features/camera.md#como-ficou-fase-5))
- [x] Rotas atuais movidas para `/legado`, ainda funcionando sem conta — `/` continua
      sendo o boletim local, e as URLs antigas seguem navegáveis por rewrite
      ([ADR-032](decisions.md#adr-032--legado-recebe-as-rotas-do-boletim-mas--continua-sendo-o-boletim))
- [x] Importação opcional dos boletins locais em `/legado/importar` — o cliente manda o
      boletim cru, o servidor normaliza, mapeia e insere com `on conflict do nothing`
      ([migrations/local-to-cloud.md §3](migrations/local-to-cloud.md#3-fluxo)); verificada
      por `npm run test:import` (28 checks contra o Neon real)

**Pronta quando:** um usuário atual faz uma diária inteira no módulo novo sem sentir falta de
nada — e o boletim impresso sai igual ou melhor.

---

## ✅ Fase 6 — Som · ✅ Fase 7 — Continuidade

> **Fase 6 fechada em `2026-08-11`**, nas três passagens declaradas: `banco`, `sync` e
> `modulo`. Falta só a integração com equipamentos — os modelos impressos no cabeçalho do
> relatório —, que depende do catálogo da Fase 8 e está marcada como tal em
> [features/sound.md §7](features/sound.md#estado-em-2026-08-11). Não é dívida desta fase: o
> dado ainda não existe para ser impresso.
>
> **O módulo** é `features/sound/`, na rota `/p/[id]/diarias/[dayId]/som`, com o formato do
> Boletim de Câmera (ADR-024): fixação da diária, cartões colapsáveis, auto-save sem botão
> salvar, folha A4 em sobreposição na própria rota. O julgamento do take custa **um toque**;
> roll, arquivo e canais chegam herdados. Natureza (MOS, wild, playback, PU, série, false
> start) escreve no take **compartilhado**, então a Câmera lê sem ninguém avisar.
>
> O layout de canais é herdado **do take anterior**, e não de um template na diária
> ([ADR-033](decisions.md#adr-033--o-layout-de-tracks-é-herdado-do-take-anterior-não-guardado-na-diária)):
> uma lista dentro de um registro não teria merge por campo, e um template retroativo deixaria
> "corrigir" às 18h o que o relatório afirma sobre um take das 9h.
>
> Sound report em **PDF** e **CSV** (colunas espelhando iXML, escape de `;` para o Excel em
> pt-BR, download por `Blob` — sem servidor, porque o fim da diária é quando falta sinal). Tela,
> folha e CSV leem a mesma função. Verificado por `npm run test:som` (63 checks).
>
> **Efeito colateral bom:** `agrupaCenas`, o campo com debounce e a fileira de chips saíram de
> dentro do módulo de Câmera e viraram `features/diaria/cenas.ts`,
> `components/ui/DebouncedTextField.tsx` e `components/ui/OptionChips.tsx` — a Continuidade
> encontra a Fase 7 com metade da tela já construída.

> **A passagem pelo banco (`2026-08-11`)** era a pré-condição declarada. Migrations
> `0005` e `0006` implementam [ADR-029](decisions.md#adr-029--julgamento-e-natureza-do-take-são-eixos-separados):
> `TakeStatus` fica sendo só julgamento (e ganha `HOLD`), a natureza vira `takes.kind` no
> take **compartilhado**, `ng_reason` entra nos três departamentos, e a custódia do áudio
> ganha `tc_jam_at`, `user_bits`, `media_copies` e `media_verified`.
>
> Com isso **MOS existe** — a lacuna que o levantamento chamou de mais séria: dizer que o
> take existe e o som não.
>
> **A passagem de `sync` também está feita:** `soundDayConfig`, `soundTakeData` e
> `soundTakeTrack` entraram no registro, no Dexie (versão 3) e no snapshot de fixação; o
> repositório da fronteira é `lib/offline/repos/som.ts`. Protocolo em **3**, e o motor
> passou a ignorar tipo desconhecido — com isso o próximo departamento entra sem
> incrementar nada.

> **Fase 7 fechada em `2026-08-11`**, nas três passagens. O `banco` foi curto porque o
> schema de continuidade existe desde a Fase 2 — o que faltava era o **Relatório de
> Progresso da Diária** (migration `0007`) e a soma de páginas em oitavos, ambos decididos
> em [ADR-034](decisions.md#adr-034--o-relatório-de-progresso-guarda-só-o-que-exige-mão-humana):
> só o que exige mão humana tem coluna, e os oitavos são função pura, não coluna.
>
> **`sync`:** seis entidades novas — a continuidade de ação, as quatro coleções de estado e
> o relatório — com o protocolo **parado em 3**. É a primeira prova da tolerância que a
> Fase 6 criou: um cliente antigo ignora o que não conhece e continua sincronizando o
> resto. Primeiro recorte de snapshot que **não** é a diária: as coleções de estado vêm por
> cena da produção, porque o valor da continuidade é atravessar dias.
>
> **`modulo`:** o cartão do take custa **um toque** no veredito (print · hold · NG) e mostra
> lente, T-stop e roll **lidos** de Câmera e Som — a continuísta não redigita, e redigitar é
> onde o erro acontece. Os metadados da cena são preenchidos aqui e propagam para todos os
> blocos. O estado do set tem herança de exibição: o item da cena aparece no take sem virar
> linha, e só vira registro próprio quando muda.
>
> **O Relatório de Progresso existe.** Metade dele já vem contada — cenas, planos, takes,
> prints, páginas, cartões e rolls saem dos registros dos três departamentos. Verificado por
> `npm run test:continuidade` (45 checks), incluindo a armadilha de somar a mesma página de
> roteiro duas vezes porque a cena tem dois blocos.

> **Levantamento de `2026-08-10`** contra a prática real do setor — as lacunas concretas estão
> em [features/sound.md §5](features/sound.md#5-o-que-a-prática-exige--levantamento) e
> [features/continuity.md §7](features/continuity.md#7-o-que-a-prática-exige--levantamento).
> As duas mais importantes: **MOS** (hoje não há como dizer que o take existe e o som não) e o
> **Relatório de Progresso da Diária**, um entregável diário que o modelo não contemplava.

**Som (entregue):** configuração de som da diária · tracks dinâmicas com herança entre takes ·
status rápidos e natureza do take (wild, room tone, MOS, playback, PU, série, false start) ·
motivo de NG · timecode com jam e user bits · sound report em PDF e **CSV** com colunas
espelhando iXML. Equipamentos ficaram para a Fase 8, junto com o catálogo.

**Continuidade (entregue):** metadados de cena · setup (tamanho, ângulo, movimento, eyeline) ·
continuidade de ação no take · três vereditos (print/hold/NG com motivo) · props, figurino,
cabelo/maquiagem, cenografia · PDF · **Relatório de Progresso da Diária** (contagens, páginas
em oitavos, minutagem, cobertura, cartões e rolls do dia).
**Sem fotografias** ([ADR-022](decisions.md#adr-022--sem-fotografias-na-v1)).

## ✅ Fase 8 — Integração

- [x] Câmera ↔ Som, Câmera ↔ Continuidade, Som ↔ Continuidade — a junção é por `take_id`,
      então integrar é **consultar**, não conciliar. A Continuidade lê lente, T-stop e roll
      dos outros dois no cartão de cada take; a visão consolidada mostra os três lado a lado.
- [x] Visão consolidada da diária — `/p/[id]/diarias/[dayId]/consolidado`, dentro da
      fronteira e somente leitura. Inclui **o que falta**: takes sem som, sem câmera, sem
      continuidade. MOS não conta como lacuna.
- [x] "O que estamos usando hoje" entre departamentos — catálogo em `/p/[id]/equipamentos`
      e alocação por diária. Com ele fechou a última pendência da Fase 6: o cabeçalho do
      sound report imprime os modelos do dia.
- [x] **Busca global e filtros** — `2026-08-19`. A busca **da diária** é local (cada palavra
      do termo precisa aparecer); a da **produção inteira** entrou em `/p/[id]/busca`, no
      servidor, alcançando o que este aparelho nunca baixou. Os dois alcances **não viram
      uma lista só** ([ADR-036](decisions.md#adr-036--a-busca-tem-dois-alcances-declarados-e-eles-não-viram-uma-lista-só)):
      uma lista com metade offline encolheria em silêncio quando o sinal caísse. O que é
      fundido é a semântica — e cada uma leva à outra com o termo na mão

**Verificado por** `npm run test:consolidado` (31 checks) e `npm run test:sala` (38, +11,
contra o Neon real). A fronteira offline **não mudou**: o equipamento chega às folhas
impressas como props resolvidas no servidor, pela mesma via de produção, horários e equipe.

## ✅ Fase 9 — Relatórios

> **Fechada em `2026-08-19`.** Três entregáveis, três leitores diferentes: a **folha** é
> para o set, o **CSV** é para a pós e o **JSON** é para guardar. Nenhum deles passa pelo
> servidor — fechar a diária é justamente o momento em que a locação está sem sinal.

- [x] **PDF dos três módulos e consolidado por cena/setup/take.** As três folhas de
      departamento existem desde as Fases 5–7; o que faltava era a que **nenhuma delas
      pode dar sozinha**: `features/diaria/FolhaConsolidada.tsx`, take a take, os três
      departamentos na mesma linha, com as lacunas do dia no cabeçalho. Em sobreposição na
      própria rota `/consolidado`, como as outras
- [x] **CSV.** O do som já existia (Fase 6, prioritário); entrou o de **câmera para a pós**
      — `features/camera/csv.ts`, lido de `linhasDoBoletim`. As colunas técnicas saem de
      `CAMPOS_TECNICOS`, a mesma lista que desenha a linha do plano na tela e na folha:
      acrescentar campo técnico passa a dar a coluna de graça. A linha do arquivo é
      **completa** (valor herdado por extenso em cada take), ao contrário da folha, que é
      diferencial — numa planilha, célula vazia lê-se como "ninguém anotou"
- [x] **Export JSON da diária.** `features/diaria/export.ts`, no botão da tela consolidada:
      entidades **cruas** dos três departamentos (mais tracks, coleções de estado e o
      relatório de progresso), sem os campos de sincronização. Exportar o resumo seria
      exportar uma interpretação — interpretação se refaz, dado perdido não

**Verificado por** `npm run test:camera` (85 checks, +25) e `npm run test:consolidado`
(56, +25). A fronteira offline **não mudou**: os três arquivos são gerados no cliente, do
banco local, por `Blob` — a única função de download da plataforma agora mora em
[`utils/download.ts`](../utils/download.ts), porque três cópias dela seriam três chances de
uma delas esquecer o BOM que o Excel em pt-BR exige.

**Pendência consciente:** CSV de continuidade. A continuidade entrega **texto** — ação,
desvio de roteiro, estado do set —, e texto em planilha é onde ele deixa de ser lido. O
relatório de progresso e a folha continuam sendo a entrega dela. Entra se alguém pedir.

## ✅ Fase 10 — Hardening

Contínua **a partir da Fase 4**, não um bloco no fim: teste de sync escrito depois de o sync
existir é teste que nunca é escrito.

- [x] **Vitest** cobrindo o cliente do sync — `2026-08-20`
- [x] **Playwright** incluindo o fluxo offline completo — `2026-08-20`
- [x] Rate limit, sessões por dispositivo, avaliação de RLS — `2026-08-20`
- [x] Performance com produção grande (40 diárias, 2000 takes) — `2026-08-20`
- [x] Auditoria de PWA, acessibilidade e UX mobile — `2026-08-20`

> **Os dois runners entraram em `2026-08-20`**, e o recorte de cada um foi escolhido pelo
> buraco que existia, não pelo que dá um número bonito de cobertura.
>
> **Vitest (57 testes, `npm run test:vitest`, dentro do `npm test`).** As nove suítes `.mjs`
> provam o domínio puro e as três folhas; `npm run test:sync` prova o que o **servidor**
> decide, contra o Neon real. Ninguém provava **o que o cliente faz com a resposta** — e é ali
> que o erro é mudo, porque quase todo defeito termina do mesmo jeito: a fila esvazia sem o
> dado ter chegado, ou o dado chega e some da tela. Entraram a fila de saída contra IndexedDB
> de verdade (`fake-indexeddb`, não dublê), o repositório da fronteira e o motor inteiro —
> `426` sem gastar tentativa, `401`/`403` virando `FAILED` com o payload intacto, o conflito
> que converge e vira pendência, o cursor que só avança depois de aplicar, o campo com
> operação na fila que não é sobrescrito.
>
> A prova mais importante do lote é a menor: **falhar o enfileiramento desfaz a escrita
> local**. É a regra do ADR-016 que, quebrada, não faz barulho nenhum — a tela mostra o dado,
> o assistente segue anotando, e a falta só aparece na montagem no dia seguinte.
>
> **Playwright (`npm run test:e2e`, fora do `npm test`).** Fecha as duas últimas caixas de
> [synchronization.md §8](architecture/synchronization.md#8-testes-obrigatórios), abertas desde
> a Fase 4 por um motivo honesto: exigem IndexedDB real e mais de uma página viva. Roda contra
> o **build de produção**, porque o Service Worker só é registrado lá e sem ele a navegação
> offline não tem o que servir; cria conta, produção e diária **pela interface** e apaga tudo
> no fim.
>
> Ele encontrou uma coisa que o teste manual esconde: a **primeiríssima** navegação de um
> aparelho acontece antes de o Service Worker assumir o controle, então ela não entra no cache
> de runtime. Quem abre a diária e vai direto para o modo avião cai no app shell — que é o
> boletim local, não a diária. Na prática o segundo acesso resolve, e é isso que o teste
> reproduz; mas está escrito, e não descoberto de novo em locação.
>
> As três suítes foram conferidas por mutação: cortar a proteção de campo pendente no `pull`,
> baixar o limiar de "servidor inalcançável" para uma falha e remover o `runtime.put` do
> Service Worker derrubam exatamente o teste que deveriam derrubar.

> **Rate limit, dispositivos e RLS em `2026-08-20`**
> ([ADR-038](decisions.md#adr-038--o-limite-de-tentativas-mora-no-banco-rls-fica-de-fora-e-a-sessão-longa-se-paga-com-revogação)),
> em duas passagens: `banco` (migration `0008`, tabela `rate_limits`) e `plataforma`.
>
> **O rate limit da Better Auth existia e quase não valia.** O padrão dela conta em memória, e
> em memória o limite é **por instância** num deploy serverless: "cinco por minuto" vira cinco
> por minuto vezes o número de instâncias, e quem está adivinhando ganha o paralelismo de
> graça. Com `storage: 'database'` o contador é um só. Verificado contra o build de produção:
> a sexta tentativa de entrar responde `429`, e a linha aparece em `rate_limits`.
>
> **O resgate do código de convite** — a pendência registrada lá na Fase 3 — não passa por rota
> da Better Auth e era o alvo que mais compensava: quatro caracteres sobre um alfabeto de 32,
> com o prefixo saindo do nome da produção. Agora são 10 tentativas por hora **por usuário**
> (por IP puniria a equipe inteira atrás do roteador da base), cobradas depois da validação de
> formato, porque código malformado não é tentativa de adivinhar.
>
> **RLS foi avaliada e recusada, com o motivo escrito.** Ela protege contra uma conexão que
> chega ao banco com identidade de usuário, e não é o que existe aqui — o driver serverless usa
> uma conexão de aplicação única e o `user_id` chega como argumento da query. Ligá-la assim
> daria uma política que aceita tudo: segurança de fachada, que é pior que nenhuma porque muda
> o que as pessoas acham que está protegido.
>
> **`/conta` é a contrapartida da sessão de 90 dias.** A sessão longa não é folga, é o que
> sustenta o offline — sessão expirada em locação sem sinal não tem como ser renovada. O preço
> é o telefone perdido que continua entrando por três meses, e a resposta não é encurtar a
> sessão de todo mundo por causa do aparelho de um: é poder derrubar aquele. Só é possível
> porque a sessão vive no banco e não num JWT — uma capacidade que o schema já tinha e que não
> tinha tela.
>
> **Dois achados da revisão, e os dois do tipo que não dá sintoma.**
>
> O primeiro é o mais grave da fase: **dividir `rate_limits` com a Better Auth quase anulou os
> limites de uma hora.** Ela poda a tabela sozinha, e o corte é
> `agora - max(rateLimit.window, 10, 60)` — sobre **todas** as linhas, sem olhar a chave e sem
> consultar as janelas de `customRules`. Com a janela global em 60 s, qualquer rolagem de
> janela de login apagava a tabela inteira a cada minuto, e as regras de uma hora valiam um
> minuto: sessenta vezes mais fracas do que o escrito, com os testes passando e o `429`
> aparecendo na hora certa dentro do minuto. A janela global passou a ser a maior janela em
> uso, e `npm run test:sala` guarda a invariante — conferido por mutação.
>
> O segundo: a Better Auth exige
> sessão "fresca" para **listar** sessões, e o padrão dela de frescor é 24 h. Com sessão de 90
> dias que nunca é reverificada, isso significa que `/conta` funcionaria só no primeiro dia de
> cada login — a tela que existe para derrubar um telefone perdido seria justamente a que não
> abre. Nenhum teste tinha pegado porque a conta do E2E nasce segundos antes de ser usada.
> Agora `test/e2e/conta.spec.ts` envelhece a sessão no banco antes de abrir a tela, e
> `freshAge: 0` está no config com o motivo escrito.
>
> **Verificado por** `npm run test:db` (41, +6), `npm run test:sala` (62, +11) e o E2E da conta,
> além de exercício HTTP contra o build de produção.

> **Produção grande em `2026-08-20`** — `npm run test:carga`: 40 diárias, 200 cenas, 2400
> takes, 4800 linhas de câmera, 9600 tracks e 24 mil linhas de `sync_log`, semeadas, medidas e
> apagadas. A pergunta não era "quantos milissegundos" e sim **onde a curva vira**: o que é
> recortado por diária continua barato para sempre, e o que é recortado por produção cresce o
> filme inteiro. A fixação carrega os dois.
>
> **Três achados, e nenhum deles era o esperado.**
>
> 1. **As quatro coleções de estado da continuidade não tinham índice nenhum além da PK.**
>    Nasceram na Fase 7 com a `check` de escopo e nada mais, e o snapshot as lê por
>    `production_id` + escopo — no caminho da fixação, que é a primeira coisa que acontece de
>    manhã e a única requisição obrigatória da fronteira offline. Migration `0009`.
> 2. **A fixação fazia dezessete idas ao banco, uma de cada vez.** As consultas sempre foram
>    independentes; só faltava mandá-las juntas. 613 ms com o banco a 40 ms de distância — e
>    esse número é aritmética de **latência**, não de dados: com os 200 ms de um 4G fraco de
>    locação as mesmas dezessete idas passariam de três segundos para abrir a diária. Com
>    `db.batch`, uma requisição e 253 ms.
> 3. **Dois testes meus mediam a coisa errada, e o teste é que estava errado.** O primeiro
>    comparava o tempo do pull incremental com o do pull do zero: nesta escala as duas
>    consultas são dominadas pela ida e volta, então a razão entre elas é ruído de latência —
>    passaria ou falharia conforme o minuto. O segundo exigia que o plano de execução usasse
>    índice: com as 600 linhas de **uma** produção o planejador escolhe varredura porque ela é
>    de fato mais barata, e o teste acusaria um defeito inexistente. Viraram, respectivamente,
>    uma afirmação sobre o **recorte** do cursor e uma sobre a **existência** do índice (esta
>    em `test:db`, onde não depende de volume).
>
> O que a suíte afirma da fixação passou a ser **estrutural**: ela conta as requisições ao
> banco e exige **uma**. Teto de tempo não pegaria a regressão que importa — desfazer o
> `db.batch` mal mexe no relógio de quem está perto do banco, e triplica o tempo de quem está
> na serra.
>
> O resto não precisou de nada: busca na produção inteira 114 ms, lista de diárias 29 ms,
> dashboard 26 ms, pull incremental 70 ms. E a fixação continua trazendo **60 takes de 2400** —
> o recorte por diária é o que impede o aparelho de baixar o filme inteiro para anotar um dia.

> **Auditoria de PWA, acessibilidade e UX mobile em `2026-08-20`** — a última da fase.
>
> **O PWA já estava certo** e não precisou de nada: manifesto completo, ícones maskable,
> `start_url` que abre sem rede, atalhos do ícone (Fase 11), `viewport-fit=cover`,
> `theme-color`, Service Worker com aviso de atualização em vez de troca sob os dedos. Os
> ícones já vinham com `aria-hidden`, o `IconButton` já tinha 44 px, o `Toggle` já tinha a
> linha inteira como alvo de toque, e os campos já associavam erro por `aria-describedby`.
>
> **O achado grande foi contraste, e ele não é conformidade — é conseguir ler.** O cinza
> dominante do texto secundário (`zinc-500`, 218 ocorrências) dá **3,2:1 a 4,1:1** sobre os
> fundos do tema. O mínimo de AA para texto pequeno é 4,5:1, e o contexto aqui é um telefone
> segurado ao sol, numa locação, por quem precisa ler o cartão da câmera entre dois takes.
> Passou a `zinc-400` — 6,0:1 a 7,8:1 — e a hierarquia continua de pé, porque ela nunca
> dependeu de apagar o texto: depende de tamanho, peso e do branco dos títulos.
>
> **A armadilha, que quase custou caro:** as folhas impressas são superfície **clara**
> (`bg-white text-zinc-900`). Nelas o mesmo `zinc-500` é escuro sobre branco e passa com
> folga (4,83:1); uma substituição cega teria deixado o papel ilegível — e o defeito só
> apareceria na impressora de alguém, no fim de uma diária. As cinco folhas ficaram de fora,
> e o teste guarda **as duas** regras: nada de cinza fraco no escuro, e as folhas mantendo o
> cinza escuro.
>
> **O resto dos consertos**, todos pequenos e todos reais:
>
> - **`<main>` em toda tela da plataforma.** As telas do boletim legado sempre tiveram; as da
>   plataforma nasceram sem, e sem elas quem navega por leitor de tela cai no topo e percorre
>   o cabeçalho de novo a cada troca de rota.
> - **Cartão recolhível voltou a ser cabeçalho.** `<h2>` não cabe dentro de `<button>`, e a
>   solução tinha sido trocar por `<span>` — com isso a tela de diária, que é quase só cartões
>   recolhíveis, virava uma lista sem estrutura. O padrão certo é o inverso: cabeçalho por
>   fora, botão por dentro.
> - **O indicador de sync passou a ser anunciado** (`role="status"`, `aria-live="polite"` — e
>   não `alert`, que interromperia a leitura no meio de um take para dizer que o Wi-Fi caiu).
>   Os símbolos `● ▲ ⟳ ✕ ⬆` ganharam `aria-hidden`: sem isso o leitor de tela lê "círculo
>   preto pequeno sincronizado", com o enfeite na frente da informação.
> - **`prefers-reduced-motion`**, que não existia. Para parte das pessoas as transições não
>   são polimento, são enjoo.
> - **O botão de limpar a busca** tinha 36 px, contra os 44 px que a regra do projeto exige e
>   que o resto da interface cumpre.
> - **"Pular para o conteúdo"**, visível só quando recebe foco. Sem ele, quem navega por
>   teclado atravessa "voltar", "conta" e "sair" de novo a cada rota para chegar sempre no
>   mesmo lugar.
>
> **Não mexido, e de propósito:** os tamanhos `sm` de `Button` (38 px) e `OptionChips` (32 px).
> São controles densos e secundários de uma tela validada em set, e a regra dos 44 px foi
> escrita para os alvos principais — que a cumprem. Subi-los mudaria a densidade de uma
> interface que funciona.
>
> **Verificado por** `npm run test:acessibilidade` (15 checks, dentro do `npm test`): ele
> calcula os contrastes, varre os `.tsx` atrás de cinza reprovado fora das folhas, confere o
> `<main>` em todas as telas e trava os quatro detalhes que somem numa refatoração distraída.
> E olhado nas duas superfícies — a tela escura e a folha branca. A regra das duas
> superfícies virou [ADR-039](decisions.md#adr-039--o-design-system-tem-duas-superfícies-e-o-cinza-que-serve-numa-cega-a-outra),
> porque é o tipo de armadilha que só se evita se estiver escrita.

---

## ✅ Fase 11 — Caminho curto até a anotação

Do login até marcar um take: `produções → produção → diárias → diária → anotação`. **Cinco
toques**, todo dia, para chegar no único lugar onde o trabalho acontece. Em set isso não é
incômodo de UX: é o motivo pelo qual alguém volta para o caderno.

A fase é deliberadamente tardia porque cada atalho depende de saber **qual** é a diária ativa —
e isso só é confiável depois que produções, diárias e sync existem. Atalho construído cedo
adivinha; construído aqui, ele sabe.

> **Fechada em `2026-08-20`** ([ADR-037](decisions.md#adr-037--o-caminho-curto-é-o-atalho-que-lembra-e--continua-sendo-o-boletim)).
> A saída óbvia — fazer `/` decidir pela sessão — está errada: `/` é o `start_url` do PWA e
> **precisa abrir sem rede**, e usar o boletim sem conta continua sendo um modo suportado.
> Então `/` continua sendo o boletim local e **ganha em cima um botão que só existe quando há
> para onde voltar**.

- [x] **Diária de hoje é o destino padrão.** `/hoje` resolve e **redireciona** para o módulo
      do departamento da pessoa quando há uma diária hoje; havendo duas produções, pergunta.
      A data vem do relógio do aparelho (`?d=`), nunca do banco — às 21h de Brasília o
      servidor já está no dia seguinte, e o atalho abriria o dia errado (R9)
- [x] **"Continuar de onde parei"** — `lib/atalhos.ts` guarda produção, diária, módulo e os
      rótulos no `localStorage`; aparece em `/`, em `/producoes` e na barra da sala, **sem
      rede** e sem consultar nada. Envelhece em sete dias: depois disso vira palpite
- [x] **Atalhos do PWA** — "Diária de hoje" (`/hoje`) e "Continuar de onde parei"
      (`/continuar`) no menu longo do ícone. `/continuar` é estática e entra no `APP_SHELL`:
      o atalho que existe para funcionar sem rede não pode ser o único que exige rede
- [x] **Fixação automática** de hoje e amanhã ao abrir a sala, a partir da lista de diárias
      que a página já carregou — a pendência registrada na Fase 4
- [x] **Barra de diária ativa** na sala, que some sozinha quando já se está na diária e
      quando a última diária é de outra produção
- [x] **Medido:**

| Caminho                                     | Antes        | Depois                                      |
| ------------------------------------------- | ------------ | ------------------------------------------- |
| Abrir o app → anotar (diária já aberta)     | **5 toques** | **1 toque**                                 |
| Ícone do app → anotar (primeira vez no dia) | 5 toques     | **1 toque** (menu longo → "Diária de hoje") |
| Sala → voltar para a anotação               | 3 toques     | **1 toque**                                 |

Os cinco toques de antes: "trabalhar com a equipe" → produção → Diárias → a diária → o
módulo. Nenhum deles deixou de existir — a lista de produções, a de diárias e a navegação
da sala continuam inteiras. Atalho que esconde o caminho longo vira armadilha no dia em que
o caminho longo é o certo.

**Pronta quando:** um assistente que abre o app em locação chega à tela de anotação em **um
toque**, offline, sem passar por nenhuma lista. ✅ — com uma ressalva honesta: o **primeiro**
dia num aparelho novo continua custando o caminho completo, porque não há o que lembrar antes
de a pessoa ter estado em algum lugar.

**Verificado por** `npm run test:atalhos` (29 checks): a rota de cada departamento, a virada
de mês e de ano na fixação, o atalho que envelhece e o `localStorage` corrompido que **não**
pode quebrar a tela inicial.

---

## Regras que valem em todas as fases

1. **O Boletim de Câmera não regride** — nem em campo, nem em toques, nem em PDF.
2. **Nada dentro da fronteira offline exige rede para editar**
   ([ADR-016](decisions.md#adr-016--fronteira-offline-explícita)).
3. **Toda fase é desligável** por feature flag em produção.
4. **Design system único** — nenhum módulo novo inventa componente que já existe
   ([ADR-024](decisions.md#adr-024--design-system-único-o-do-boletim-de-câmera)).
5. **Documentação junto com o código**, no mesmo commit.
6. **Uma skill por vez**, respeitando as pré-condições declaradas
   ([ADR-027](decisions.md#adr-027--skills-sobre-subagentes--cinco-não-onze)).
7. **Nada de reescrita.** Cada fase reaproveita o máximo do que já existe.
