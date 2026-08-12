/**
 * Schema do Postgres — ponto único de importação.
 *
 * As **migrations do Drizzle são a fonte executável** do banco;
 * `docs/architecture/database.md` é explicativo e subordinado a elas. Se os dois
 * divergirem, o documento é corrigido no mesmo commit, nunca depois.
 *
 * Não existe tabela `photos` (ADR-022).
 */

export * from './enums';
export * from './auth';
export * from './production';
export * from './shared';
export * from './equipment';
export * from './camera';
export * from './sound';
export * from './continuity';
export * from './reports';
export * from './sync';
