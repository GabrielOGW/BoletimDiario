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
- [ ] **Deploy na Vercel** — pendente: exige a CLI da Vercel e as variáveis no projeto

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
- Deploy na Vercel segue pendente desde a Fase 2.

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

## 📋 Fase 5 — Câmera na plataforma

A fase mais sensível: migrar o módulo que está em uso. **Migração, não redesenho.**

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
- [ ] Paridade **campo a campo** — conferir o checklist de
      [features/camera.md §1](features/camera.md#1-o-que-existe-hoje) item a item
- [ ] Mídia/Suporte (depende de equipamentos, Fase 8)
- [ ] Novos campos de [features/camera.md §3](features/camera.md#3-organização-dos-campos-10)
- [ ] `TakeStatus` **preservando** o toggle "Aprovado pelo diretor"
- [x] PDF com a mesma qualidade de saída — folha A4 em sobreposição na própria rota da
      diária, com as mesmas classes de impressão e a diferença técnica por take
      ([features/camera.md §6](features/camera.md#como-ficou-fase-5))
- [ ] Rotas atuais movidas para `/legado`, ainda funcionando sem conta
- [ ] Importação opcional dos boletins locais ([migrations/local-to-cloud.md](migrations/local-to-cloud.md))

**Pronta quando:** um usuário atual faz uma diária inteira no módulo novo sem sentir falta de
nada — e o boletim impresso sai igual ou melhor.

---

## 📋 Fase 6 — Som · 📋 Fase 7 — Continuidade

Independentes entre si; podem correr em paralelo depois da Fase 5.

> **Levantamento de `2026-08-10`** contra a prática real do setor — as lacunas concretas estão
> em [features/sound.md §5](features/sound.md#5-o-que-a-prática-exige--levantamento) e
> [features/continuity.md §7](features/continuity.md#7-o-que-a-prática-exige--levantamento).
> As duas mais importantes: **MOS** (hoje não há como dizer que o take existe e o som não) e o
> **Relatório de Progresso da Diária**, um entregável diário que o modelo não contemplava.

**Som:** configuração de som da diária · tracks dinâmicas com herança entre takes · status
rápidos e natureza do take (wild, room tone, MOS, playback, PU, série, false start) · motivo
de NG · timecode com jam e user bits · equipamentos · sound report em PDF e **CSV** com colunas
espelhando iXML.

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
