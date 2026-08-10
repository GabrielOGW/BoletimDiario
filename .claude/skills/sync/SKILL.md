---
name: sync
description: Fila de saída, push/pull, detecção e resolução de conflito, banco local Dexie, fixação de diária, estados de conectividade, versão de protocolo e Service Worker do Boletim Audiovisual. Use ao mexer em lib/sync/, lib/offline/, app/api/sync/ ou public/sw.js, e para qualquer dúvida sobre offline, conflito ou polling.
---

# Skill: sync

## Responsabilidade

Tudo que fica entre a UI e o servidor: banco local, fila de saída, push/pull, conflitos,
estados de conectividade, versão do protocolo e Service Worker.

## Escopo

**Pode alterar:** `lib/sync/**` · `lib/offline/**` · `app/api/sync/**` · `features/sync/**` ·
`public/sw.js` · scripts de build do SW

**Não deve alterar:** `features/{camera,sound,continuity}/**` · `lib/db/schema/**` ·
`domain/platform/**` · `app/(app)/producoes/**` e demais telas fora da fronteira

## Pré-condições

- Schema estável para as entidades envolvidas (skill `banco` concluída).
- Contratos Zod existentes em `lib/contracts/`.

## A fronteira offline (ADR-016)

O sync cobre **só a superfície de diária**: `ShootingDay` fixada, `Scene`, `Setup`, `Take` e os
`*TakeData`. Produções, membros, auth, catálogo e relatórios são server-oriented e **não passam
por aqui**.

Duas regras verificáveis:

1. Dentro da fronteira **não existe `fetch`** — módulos conhecem só `lib/offline/repos/*`.
2. Fora da fronteira **não existe Dexie**.

## Regras que não se negociam

- **Escrita local e enfileiramento na MESMA transação Dexie.** Se não forem atômicos, existe
  uma janela em que o dado está salvo mas nunca será sincronizado.
- **Delta com os dois valores:** `{ campo: { de, para } }` — ADR-018. O servidor decide campo a
  campo: `atual == de` aplica · `atual == para` ignora · qualquer outra coisa é conflito **só
  daquele campo**.
- **Coalescência:** ao enfileirar update de campo que já tem operação `PENDING`, preserve o
  `de` original e substitua só o `para`.
- **Ids derivados** da chave natural (ADR-019). Criar é `on conflict (id) do nothing`; colisão
  é convergência, não erro. Nunca remapeie id.
- **Conflito converge para o servidor** e o valor do usuário vira `syncConflict` PENDING local
  (ADR-020). `syncConflicts` existe **só no Dexie** — não há tabela no Postgres.
- **Conflito nunca bloqueia**: é de um campo, não de um registro.
- **Soft delete é um campo** — passa pelo mesmo compare-and-set. Editar registro que o outro
  apagou é conflito com opção de restaurar.
- **`id` da operação é a chave de idempotência.** Reenviar após timeout é seguro.
- Fila FIFO **por produção**; produções diferentes em paralelo. Backoff exponencial com teto de
  5 min **e jitter**.
- `FAILED` nunca descarta payload.
- **Polling adaptativo, sem SSE** (ADR-021): 10s ativo · 30s ocioso · 60s fora da diária ·
  **nada com a aba oculta**; pull imediato ao voltar visível, no evento `online` e após push OK.
- **Protocolo versionado** (ADR-026): `426` recusa cliente velho — e o cliente recusado
  **continua editando**, acumulando fila. Sync bloqueia; preenchimento nunca.
- `navigator.onLine` é **gatilho, nunca verdade**. O estado real vem do resultado da última
  requisição.
- Service Worker: `VERSION` e `APP_SHELL` gerados no build; **`/api/**` nunca em cache**.
- **Não existe tabela de blobs.** Não há fotos (ADR-022).

## Testes obrigatórios

Todos os de
[`docs/architecture/synchronization.md §8`](../../../docs/architecture/synchronization.md#8-testes-obrigatórios).
Os quatro que não podem faltar:

- Idempotência: a mesma operação enviada duas vezes aplica uma vez.
- Compare-and-set: campos disjuntos fazem merge; o mesmo campo conflita.
- Conflito em um campo não impede editar os outros campos, takes ou departamentos.
- Offline → 50 operações → volta a rede → todas sincronizam, na ordem.

## Documentação a atualizar

`docs/architecture/synchronization.md` e, quando a fronteira ou o banco local mudarem,
`docs/architecture/offline-first.md` — **no mesmo commit**.

## Critério de conclusão

Dois dispositivos, um deles offline, convergem sem perda; conflito de campo aparece como
pendência resolvível em um toque e não bloqueia o resto da diária.

## Escalar para o agente principal

Qualquer mudança na fronteira offline, no formato do delta, no protocolo ou em
`docs/decisions.md`.
