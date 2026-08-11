/**
 * Verificação da importação dos boletins locais contra o banco real (Fase 5).
 *
 * Como `room-check` e `sync-check`, não entra em `npm test`: exige rede e `DATABASE_URL`,
 * e roda com `--conditions=react-server` porque a camada de query importa `server-only`.
 *
 * A promessa que esta suíte existe para provar é uma só e é a que substitui toda a
 * maquinaria de reversibilidade que a rodada 1 previa: **importar duas vezes não duplica
 * nada e não sobrescreve nada** (local-to-cloud.md §5).
 *
 * Tudo acontece em produções descartáveis, apagadas no fim mesmo se algo falhar.
 */

import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: '.env' });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.log('⏭  DATABASE_URL ausente — verificação da importação pulada.');
  process.exit(0);
}

process.env.DATABASE_URL = url;

const sql = neon(url);

const { importBoletins } = await import('@/lib/db/queries/import');

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`✓ ${label}`);
  } else {
    failed += 1;
    console.error(`✗ ${label}`);
  }
}

const ana = { id: randomUUID(), nome: 'Ana Importadora' };
const beto = { id: randomUUID(), nome: 'Beto Importador' };
const criadas = new Set();

async function cleanup() {
  for (const id of criadas) await sql`delete from productions where id = ${id}`;
  for (const pessoa of [ana, beto]) {
    await sql`delete from users where id = ${pessoa.id}`;
  }
}

async function criaUsuario(pessoa) {
  await sql`
    insert into users (id, name, email, email_verified, created_at, updated_at)
    values (${pessoa.id}, ${pessoa.nome}, ${`${pessoa.id}@teste.local`}, false, now(), now())
  `;
}

/**
 * Um boletim cru, como sai do `LocalStorage` — parcial de propósito.
 *
 * O importador recebe exatamente isto e passa por `normalizeBoletim`. Se a suíte mandasse
 * um `Boletim` completo, ela estaria testando o caminho fácil e não o real.
 */
function boletimCru(overrides = {}) {
  return {
    id: 'bol_import_1',
    producao: {
      tituloProjeto: 'Filme de Importação',
      produtora: 'Produtora Teste',
      diretor: 'Ana Cruz',
      diretorFotografia: 'Beto Lima',
      data: '2026-08-11',
      diaDiaria: '7',
    },
    horarios: { inicio: '07:00', fim: '19:30' },
    camerasCadastradas: [
      { id: 'cam_a', nomeId: 'A', modelo: 'Alexa 35', operador: 'Marina' },
    ],
    cenas: [
      {
        id: 'cena_1',
        numero: '24',
        blocos: [
          {
            id: 'bloco_a',
            letra: 'A',
            planos: [
              {
                id: 'plano_1',
                numero: '1',
                cameraId: 'cam_a',
                tecnica: { iso: '800', frameRate: '24', diafragma: 'T2.8' },
                optica: { lentes: 'Cooke 32mm' },
                takes: [
                  { id: 'take_1', numero: '1', cartao: 'A012', aprovado: false },
                  { id: 'take_2', numero: '2', cartao: 'A012', aprovado: true },
                ],
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

async function conta(tabela, productionId) {
  const [row] = await sql`
    select count(*)::int as total from ${sql.unsafe(tabela)}
     where production_id = ${productionId}
  `;
  return row.total;
}

async function run() {
  await criaUsuario(ana);
  await criaUsuario(beto);

  // ---- Primeira importação ----

  const primeira = await importBoletins({
    boletins: [boletimCru()],
    userId: ana.id,
    userName: ana.nome,
    department: 'CAMERA',
  });

  check('a importação responde OK', primeira.status === 'OK');
  if (primeira.status !== 'OK') return;
  criadas.add(primeira.productionId);

  check('a produção é criada', primeira.criada === true);
  check('a produção é nomeada pelo título', primeira.productionName === 'Filme de Importação');
  check('a diária entra', primeira.inseridos.shootingDays === 1);
  check('a cena entra', primeira.inseridos.scenes === 1);
  check('o plano entra', primeira.inseridos.setups === 1);
  check('os dois takes entram', primeira.inseridos.takes === 2);
  check('a câmera cadastrada entra', primeira.inseridos.cameraUnits === 1);
  check('os dados de câmera entram', primeira.inseridos.cameraTakeData === 2);

  const [dono] = await sql`
    select role, department from production_members
     where production_id = ${primeira.productionId} and user_id = ${ana.id}
  `;
  check('quem importa vira OWNER', dono?.role === 'OWNER');
  check('quem importa entra na câmera', dono?.department === 'CAMERA');

  const [aprovado] = await sql`
    select count(*)::int as total from camera_take_data
     where production_id = ${primeira.productionId} and approved = true
  `;
  check('o take aprovado continua aprovado', aprovado.total === 1);

  const [take] = await sql`
    select status from takes t
      join setups s on s.id = t.setup_id
     where t.production_id = ${primeira.productionId} and t.number = 2
  `;
  check('aprovado pelo diretor vira CIRCLE no take', take?.status === 'CIRCLE');

  // ---- Reimportação: a promessa central ----

  const segunda = await importBoletins({
    boletins: [boletimCru()],
    userId: ana.id,
    userName: ana.nome,
    department: 'CAMERA',
  });

  check('reimportar responde OK', segunda.status === 'OK');
  if (segunda.status !== 'OK') return;

  check('reimportar cai na mesma produção', segunda.productionId === primeira.productionId);
  check('reimportar não cria produção de novo', segunda.criada === false);
  check(
    'reimportar não insere nada',
    Object.values(segunda.inseridos).every((valor) => valor === 0),
  );
  check('não há diária duplicada', (await conta('shooting_days', primeira.productionId)) === 1);
  check('não há cena duplicada', (await conta('scenes', primeira.productionId)) === 1);
  check('não há take duplicado', (await conta('takes', primeira.productionId)) === 2);

  // ---- Reimportação não sobrescreve o que já foi digitado ----

  await sql`
    update camera_take_data set card = 'DIGITADO À MÃO'
     where production_id = ${primeira.productionId}
  `;

  await importBoletins({
    boletins: [boletimCru()],
    userId: ana.id,
    userName: ana.nome,
    department: 'CAMERA',
  });

  const [intacto] = await sql`
    select count(*)::int as total from camera_take_data
     where production_id = ${primeira.productionId} and card = 'DIGITADO À MÃO'
  `;
  check('reimportar não sobrescreve o que alguém editou', intacto.total === 2);

  // ---- Duas pessoas, o mesmo projeto ----

  const deBeto = await importBoletins({
    boletins: [boletimCru()],
    userId: beto.id,
    userName: beto.nome,
    department: 'CAMERA',
  });

  check('a importação de outra pessoa responde OK', deBeto.status === 'OK');
  if (deBeto.status !== 'OK') return;
  criadas.add(deBeto.productionId);

  // Sem o id salgado por quem importa, esta seria a produção da Ana — e o Beto estaria
  // escrevendo numa sala de que nem é membro.
  check(
    'o mesmo projeto de outra pessoa vira outra produção',
    deBeto.productionId !== primeira.productionId,
  );
  check('a segunda pessoa é dona da própria', deBeto.criada === true);

  const [semAna] = await sql`
    select count(*)::int as total from production_members
     where production_id = ${deBeto.productionId} and user_id = ${ana.id}
  `;
  check('a primeira pessoa não entra na produção da segunda', semAna.total === 0);

  // ---- Payload inútil ----

  const vazio = await importBoletins({
    boletins: [],
    userId: ana.id,
    userName: ana.nome,
    department: 'CAMERA',
  });
  check('lista vazia responde VAZIO', vazio.status === 'VAZIO');

  const lixo = await importBoletins({
    boletins: 'não é uma lista',
    userId: ana.id,
    userName: ana.nome,
    department: 'CAMERA',
  });
  check('payload que não é lista responde VAZIO, não quebra', lixo.status === 'VAZIO');

  // Um boletim quase vazio ainda é um boletim: `normalizeBoletim` completa o resto.
  const minimo = await importBoletins({
    boletins: [{ id: 'bol_minimo', producao: { tituloProjeto: 'Só o Título' } }],
    userId: ana.id,
    userName: ana.nome,
    department: 'CAMERA',
  });
  check('boletim quase vazio ainda importa', minimo.status === 'OK');
  if (minimo.status === 'OK') criadas.add(minimo.productionId);
}

try {
  await run();
} catch (error) {
  failed += 1;
  console.error('✗ erro inesperado:', error.message);
} finally {
  await cleanup();
}

console.log(`\n${passed}/${passed + failed} checks passaram.`);
process.exit(failed === 0 ? 0 : 1);
