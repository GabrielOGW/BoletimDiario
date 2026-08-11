/**
 * Confere as variáveis de ambiente **antes** do build começar.
 *
 * Sem isto, faltar `DATABASE_URL` no ambiente derruba o build lá dentro, na coleta de
 * dados de página de uma rota de API — e o log da Vercel mostra
 * `Failed to collect page data for /api/sync/snapshot` como se o defeito fosse do código.
 * Foi exatamente o que aconteceu: os deploys de Production falharam desde a Fase 2, um
 * atrás do outro, enquanto os de Preview passavam, porque só o Preview tinha as
 * variáveis. A causa estava no log, enterrada; o que faltava era ela estar em cima.
 *
 * A checagem não substitui os `throw` de `lib/db/client.ts` e `lib/auth/config.ts`: eles
 * protegem o runtime, este script protege o diagnóstico. Nenhum valor é impresso.
 */

import { existsSync, readFileSync } from 'node:fs';

/**
 * Quem carrega `.env` é o Next, e ele só faz isso **depois** do `prebuild`.
 *
 * Sem esta leitura o script acusaria falta no ambiente local, onde as variáveis existem
 * em arquivo — e um alarme que dispara sozinho é um alarme que se aprende a ignorar. Na
 * Vercel não há arquivo nenhum: as variáveis chegam pelo ambiente e a leitura não acha
 * nada, que é o certo.
 *
 * Só a **presença** da chave interessa. Nenhum valor é guardado nem impresso.
 */
function chavesEmArquivo() {
  const chaves = new Set();

  // A mesma precedência do Next: `.env.local` sobrepõe `.env`. Para presença, tanto faz.
  for (const arquivo of ['.env.local', '.env']) {
    if (!existsSync(arquivo)) continue;
    for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
      const chave = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*\S/)?.[1];
      if (chave) chaves.add(chave);
    }
  }

  return chaves;
}

const emArquivo = chavesEmArquivo();
const definida = (nome) => Boolean(process.env[nome]) || emArquivo.has(nome);

/** O que a plataforma exige para sequer compilar. */
const OBRIGATORIAS = [
  {
    nome: 'DATABASE_URL',
    porque: 'Neon Postgres. Lida por lib/db/client.ts, que lança sem ela.',
  },
  {
    nome: 'BETTER_AUTH_SECRET',
    porque:
      'Assina os cookies de sessão. Lida por lib/auth/config.ts, que lança sem ela.',
  },
];

/** O que não quebra o build, mas quebra o produto de um jeito difícil de perceber. */
const RECOMENDADAS = [
  {
    nome: 'BETTER_AUTH_URL',
    porque:
      'Base dos links de redefinição de senha. Sem ela em produção, o link sai com o domínio do deploy, que muda.',
  },
];

const faltando = OBRIGATORIAS.filter(({ nome }) => !definida(nome));
const ausentes = RECOMENDADAS.filter(({ nome }) => !definida(nome));

for (const { nome, porque } of ausentes) {
  console.warn(`⚠  ${nome} não definida — ${porque}`);
}

if (faltando.length > 0) {
  const ambiente = process.env.VERCEL_ENV ?? 'local';

  console.error(
    `\n✗ Faltam ${faltando.length} variável(is) de ambiente para compilar (ambiente: ${ambiente}):\n`,
  );
  for (const { nome, porque } of faltando) {
    console.error(`  ${nome}\n    ${porque}\n`);
  }
  console.error(
    'Na Vercel, confira se elas estão marcadas para o ambiente **Production**, e não\n' +
      'só para Preview e Development — é o engano que este script existe para apontar.\n' +
      'Localmente: copie .env.example para .env e preencha.\n',
  );

  process.exit(1);
}

console.log(`ambiente conferido (${OBRIGATORIAS.length} variáveis obrigatórias).`);
