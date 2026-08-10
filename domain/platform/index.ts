/**
 * Ponto de entrada do modelo de domínio compartilhado.
 *
 * Regra: este pacote é PURO — nada aqui pode importar React, Dexie, Drizzle ou
 * qualquer coisa com I/O. É o único código que roda no browser, no route handler e
 * nos scripts de migração ao mesmo tempo (ADR-013).
 */

export * from '@/domain/platform/enums';
export * from '@/domain/platform/types';
export * from '@/domain/platform/factory';
export * from '@/domain/platform/derive-id';
export * from '@/domain/platform/from-boletim';
