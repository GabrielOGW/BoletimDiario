import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * O runner da Fase 10.
 *
 * Ele **não substitui** as suítes `.mjs`: aquelas provam o domínio puro e a folha sem
 * depender de nada, e migrá-las só trocaria um comando que funciona por outro. O Vitest
 * existe para o que elas não alcançam — o que precisa de IndexedDB e de `fetch`: a fila
 * de saída, o repositório da fronteira e o motor de sync inteiro.
 *
 * `environment: 'node'` de propósito. O que se testa aqui não tem DOM; o único global de
 * navegador que falta é o `indexedDB`, e ele entra pelo `setup.ts`, não por um jsdom
 * inteiro que traria mil APIs para dar suporte a duas.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/vitest/**/*.test.ts'],
    setupFiles: ['./test/vitest/setup.ts'],
    // Cada arquivo num worker próprio: `getDb()` é um singleton de módulo, e dois
    // arquivos compartilhando a instância dariam falha dependente de ordem — o tipo de
    // teste que ninguém confia e todo mundo aprende a ignorar.
    isolate: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
