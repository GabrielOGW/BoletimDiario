---
name: testes
description: Como escrever e rodar testes no Boletim Audiovisual — o harness .mjs atual com type-stripping do Node, e o Vitest/Playwright que entram a partir da Fase 4. Use ao criar ou corrigir teste, ao adicionar suíte ao package.json, ou quando um teste falhar por causa do loader de alias.
---

# Skill: testes

## Responsabilidade

A infraestrutura de teste e a cobertura das regras que não podem regredir.

## Escopo

**Pode alterar:** `test/**` · arquivos `*.test.ts` / `*.spec.ts` · `vitest.config.ts` ·
`playwright.config.ts` · a seção `scripts` do `package.json`

**Não deve alterar:** qualquer código de produção. Teste que precisa de mudança no código de
produção para passar é escalado — nunca é o teste que se ajusta ao bug.

## O harness de hoje

Três suítes em `.mjs` puro, rodadas direto pelo Node com type-stripping experimental e um
loader de alias `@/` (`test/alias-loader.mjs`). **Não há runner.**

```bash
npm test               # as três (161 asserts)
npm run test:migration # boletim v1 real através da normalização v2 (22)
npm run test:platform  # regras de set: herança, numeração de take (56)
npm run test:mapping   # Boletim v2 → plataforma, e v1→v2→plataforma ponta a ponta (83)
```

**Restrição do type-stripping** — vale para todo código alcançável a partir de um teste:

- ❌ `enum`, `namespace`, parameter properties (`constructor(private x)`)
- ✅ `import type` obrigatório para importação só de tipo
- ESLint ignora `test/**`

Se um teste quebrar com erro de resolução de módulo, o suspeito é o loader de alias, não o
código.

## O que entra a partir da Fase 4

- **Vitest** para domínio, sync e conflitos.
- **Playwright** para E2E, incluindo o fluxo offline.
- As suítes `.mjs` **permanecem** — elas testam a migração e o domínio puro, funcionam sem
  dependência nenhuma, e migrá-las não traz ganho.

## Cobertura que não pode regredir

**Domínio** (`domain/platform/`): herança entre takes, incremento de número e de nome de
arquivo, reset na troca de setup, mapeamento `Boletim` → plataforma, idempotência dos ids
derivados.

**Sync** — a lista completa está em
[`docs/architecture/synchronization.md §8`](../../../docs/architecture/synchronization.md#8-testes-obrigatórios).
Os quatro essenciais: idempotência; merge de campos disjuntos; conflito de mesmo campo que não
bloqueia o resto; 50 operações offline sincronizando na ordem.

**Offline (E2E)**, obrigatório antes de cada release:

```
offline → cria take → fecha o PWA → reabre → dado presente
        → volta a rede → sincroniza → outro dispositivo recebe
```

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
