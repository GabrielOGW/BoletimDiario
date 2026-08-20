---
name: testes
description: Como escrever e rodar testes no Boletim Audiovisual — o harness .mjs com type-stripping do Node, o Vitest sobre IndexedDB real e o Playwright do fluxo offline. Use ao criar ou corrigir teste, ao adicionar suíte ao package.json, ou quando um teste falhar por causa do loader de alias.
---

# Skill: testes

## Responsabilidade

A infraestrutura de teste e a cobertura das regras que não podem regredir.

## Escopo

**Pode alterar:** `test/**` · arquivos `*.test.ts` / `*.spec.ts` · `vitest.config.mts` ·
`playwright.config.ts` · a seção `scripts` do `package.json`

**Não deve alterar:** qualquer código de produção. Teste que precisa de mudança no código de
produção para passar é escalado — nunca é o teste que se ajusta ao bug.

## Os três runners

A lista completa de comandos está no `CLAUDE.md`. O que importa aqui é **qual deles serve para
qual pergunta** — escolher errado é o jeito mais comum de escrever um teste que passa sem
provar nada.

**`.mjs` puro** (`npm test`, nove suítes, 540 asserções) — o domínio, a normalização, as três
folhas e os CSVs. Rodadas direto pelo Node com type-stripping experimental e um loader de
alias `@/` (`test/alias-loader.mjs`), sem runner e sem dependência nenhuma. **É o chão:** o dia
em que exigirem rede é o dia em que param de ser rodadas.

**Vitest** (`npm run test:vitest`, dentro do `npm test`; `vitest.config.mts`, specs em
`test/vitest/`) — o que precisa de **IndexedDB ou de `fetch`**: `lib/offline/outbox.ts`,
`lib/offline/repos/*` e `lib/sync/engine.ts`. `environment: 'node'` com `fake-indexeddb`, que é
implementação real da especificação sobre memória e não dublê — contra dublê, "a escrita local
e a fila saem na mesma transação" passaria sem haver transação.

**Playwright** (`npm run test:e2e`, **fora** do `npm test`; specs em `test/e2e/`) — o ciclo de
vida do PWA e mais de uma página viva. Roda contra o **build de produção**, porque o Service
Worker só é registrado lá. Exige `DATABASE_URL`: cria conta, produção e diária pela interface
(`preparo.ts`) e apaga tudo no fim (`limpeza.ts`).

**Restrição do type-stripping** — vale para todo código alcançável a partir de um teste:

- ❌ `enum`, `namespace`, parameter properties (`constructor(private x)`)
- ✅ `import type` obrigatório para importação só de tipo
- ESLint ignora `test/**`

Se um teste quebrar com erro de resolução de módulo, o suspeito é o loader de alias, não o
código.

## Onde colocar um teste novo

1. É função pura sobre o domínio, a folha ou o CSV? Vai para a suíte `.mjs` que já existe.
2. Precisa de banco local, de transação ou de resposta do servidor? Vitest.
3. Precisa de duas abas, de fechar e reabrir o app, ou do Service Worker? Playwright.

Nenhuma suíte migra para outra. As `.mjs` funcionam sem dependência e não ganham nada indo
para o Vitest; o Vitest não substitui o Playwright porque não tem ciclo de vida de PWA.

## Cobertura que não pode regredir

**Domínio** (`domain/platform/`): herança entre takes, incremento de número e de nome de
arquivo, reset na troca de setup, mapeamento `Boletim` → plataforma, idempotência dos ids
derivados.

**Sync** — a lista completa está em
[`docs/architecture/synchronization.md §8`](../../../docs/architecture/synchronization.md#8-testes-obrigatórios).
Os quatro essenciais: idempotência; merge de campos disjuntos; conflito de mesmo campo que não
bloqueia o resto; 50 operações offline sincronizando na ordem.

**Cliente do sync** (`test/vitest/`): coalescência achando a operação certa pelo índice, a
operação **em voo** que não é tocada, `426` sem gastar tentativa, `401`/`403` virando `FAILED`
com o payload intacto, conflito que converge e vira pendência sem bloquear o resto, cursor que
só avança depois de aplicar, campo com operação na fila que não é sobrescrito — e, a mais
importante, **falhar o enfileiramento desfaz a escrita local**.

**Offline (E2E)**, obrigatório antes de cada release — `npm run test:e2e`:

```
offline → cria take → fecha o PWA → reabre → dado presente
        → volta a rede → sincroniza → outro dispositivo recebe
        → duas abas: liveQuery propaga sem recarregar
```

Cuidado que já custou depuração: a **primeiríssima** navegação de um aparelho acontece antes de
o Service Worker assumir o controle e não entra no cache de runtime. Um E2E offline que não
recarrega a rota antes de cortar a rede cai no app shell e falha por um motivo que não é o que
ele estava testando.

**Timezone:** diária gravada em `America/Sao_Paulo` e lida em UTC continua no mesmo dia civil.

**Câmera:** paridade campo a campo com o editor atual, antes de fechar a Fase 5.

## Princípio

Teste de sync escrito depois de o sync existir é teste que nunca é escrito. A Fase 10 é
**contínua a partir da Fase 4**, não um bloco no fim.

Descrições de teste em **pt-BR**, como todo o resto do produto.

## Documentação a atualizar

`CLAUDE.md` quando um comando novo entrar no `package.json`.

## Critério de conclusão

`npm test` passa, a suíte nova cobre o comportamento e não o formato, e nenhuma das regras
acima ficou sem cobertura.

Antes de declarar pronta uma suíte que passou de primeira: **mute o código de produção** no
ponto que ela alega proteger e confirme que ela quebra. Depois reverta. Teste que passa dos
dois jeitos não é cobertura, é ruído com aparência de segurança.
