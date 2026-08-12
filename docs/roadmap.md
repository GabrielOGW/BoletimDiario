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
- [ ] **Deploy na Vercel** — **falhando desde `2026-08-10`**, e a causa está diagnosticada:
      o ambiente **Production** do projeto não tem `DATABASE_URL` nem `BETTER_AUTH_SECRET`.
      Todo deploy de Preview passa e todo deploy de Production falha, sempre no mesmo
      ponto. Reproduzido localmente escondendo o `.env`: o build morre em
      `Failed to collect page data for /api/sync/snapshot`, que **parece** defeito de
      código. Desde `2026-08-11` o `prebuild` roda `scripts/check-env.mjs` e a falta
      aparece no topo do log, com o nome da variável. Resolver exige marcar as variáveis
      para Production no painel da Vercel — é ação de quem tem a conta.

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
- Deploy na Vercel segue pendente desde a Fase 2 — causa diagnosticada, ver Fase 2.

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

## ⏳ Fase 5 — Câmera na plataforma

A fase mais sensível: migrar o módulo que está em uso. **Migração, não redesenho.**

> **`2026-08-11`:** tudo entregue **menos Mídia/Suporte**, que depende do catálogo de
> equipamentos da Fase 8 — não é dívida desta fase, é ordem de dependência. Quatro lacunas
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
- [ ] Mídia/Suporte (depende de equipamentos, Fase 8)
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

## ✅ Fase 6 — Som · 📋 Fase 7 — Continuidade

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

A **Continuidade** é independente do Som e pode correr em paralelo — a Fase 6 deixou pronta a
parte que as duas dividem.

> **Levantamento de `2026-08-10`** contra a prática real do setor — as lacunas concretas estão
> em [features/sound.md §5](features/sound.md#5-o-que-a-prática-exige--levantamento) e
> [features/continuity.md §7](features/continuity.md#7-o-que-a-prática-exige--levantamento).
> As duas mais importantes: **MOS** (hoje não há como dizer que o take existe e o som não) e o
> **Relatório de Progresso da Diária**, um entregável diário que o modelo não contemplava.

**Som (entregue):** configuração de som da diária · tracks dinâmicas com herança entre takes ·
status rápidos e natureza do take (wild, room tone, MOS, playback, PU, série, false start) ·
motivo de NG · timecode com jam e user bits · sound report em PDF e **CSV** com colunas
espelhando iXML. Equipamentos ficaram para a Fase 8, junto com o catálogo.

**Continuidade:** metadados de cena · setup (tamanho, ângulo, movimento, eyeline) · continuidade
de ação no take · três vereditos (print/hold/NG com motivo) · props, figurino, cabelo/maquiagem,
cenografia · PDF · **Relatório de Progresso da Diária** (contagens, páginas em oitavos,
minutagem, cobertura, cartões e rolls do dia).
**Sem fotografias** ([ADR-022](decisions.md#adr-022--sem-fotografias-na-v1)).

## 📋 Fase 8 — Integração

- [ ] Câmera ↔ Som, Câmera ↔ Continuidade, Som ↔ Continuidade
- [ ] Visão consolidada da diária
- [ ] Busca global e filtros
- [ ] "O que estamos usando hoje" entre departamentos

## 📋 Fase 9 — Relatórios

- [ ] PDF dos três módulos e consolidado por cena/setup/take
- [ ] CSV (som prioritário, câmera para a pós)
- [ ] Export JSON da diária

## 📋 Fase 10 — Hardening

Contínua **a partir da Fase 4**, não um bloco no fim: teste de sync escrito depois de o sync
existir é teste que nunca é escrito.

- [ ] **Vitest** cobrindo domínio, sync e conflitos
- [ ] **Playwright** incluindo o fluxo offline completo
- [ ] Rate limit, sessões por dispositivo, avaliação de RLS
- [ ] Performance com produção grande (40 diárias, 2000 takes)
- [ ] Auditoria de PWA, acessibilidade e UX mobile

---

## 📋 Fase 11 — Caminho curto até a anotação

Hoje, do login até marcar um take: `produções → produção → diárias → diária → anotação`.
**Quatro toques**, todo dia, para chegar no único lugar onde o trabalho acontece. Em set isso
não é incômodo de UX: é o motivo pelo qual alguém volta para o caderno.

A fase é deliberadamente tardia porque cada atalho depende de saber **qual** é a diária ativa —
e isso só é confiável depois que produções, diárias e sync existem. Atalho construído cedo
adivinha; construído aqui, ele sabe.

- [ ] **Diária de hoje é o destino padrão.** Havendo uma única produção ativa com diária para
      hoje, `/` e `/producoes` levam direto à anotação. Um toque.
- [ ] **"Continuar de onde parei"** — a última diária aberta, com o departamento certo já
      selecionado, mesmo sem rede
- [ ] **Atalhos do PWA** (`shortcuts` no manifesto): "Diária de hoje" e "Última diária" no
      menu longo do ícone, sem abrir o app antes
- [ ] **Fixação automática** da diária de hoje e de amanhã em background — a pendência
      registrada na Fase 4; sem ela o atalho leva a uma tela que precisa de rede
- [ ] **Barra de diária ativa** persistente na sala, para voltar de qualquer tela
- [ ] Medir: contar os toques antes e depois, e registrar o número no fim da fase

**Pronta quando:** um assistente que abre o app em locação chega à tela de anotação em **um
toque**, offline, sem passar por nenhuma lista.

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
