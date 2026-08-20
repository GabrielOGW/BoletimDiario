/**
 * Produção grande: 40 diárias, 2000 takes (Fase 10).
 *
 * A pergunta não é "quantos milissegundos" — é **onde a curva vira**. Uma produção de
 * longa-metragem chega a esse tamanho no meio das filmagens, e o que degrada não degrada
 * uniformemente: o que é recortado por diária continua barato para sempre, e o que é
 * recortado por **produção** cresce o filme inteiro. A fixação da diária carrega os dois.
 *
 * Semeia, mede, confere tetos, apaga. Como `test:db` e `test:sala`: exige `DATABASE_URL`,
 * exige `--conditions=react-server` (a camada de query importa `server-only`) e **não**
 * entra em `npm test` — ele mede rede, e teto de tempo com rede no meio é teste que falha
 * por motivo errado numa terça-feira qualquer.
 *
 * Os tetos são generosos de propósito. Eles não existem para cravar desempenho; existem
 * para pegar a **regressão de ordem de grandeza** — o índice que alguém removeu, o `in
 * (subquery)` que virou varredura. Um número apertado aqui vira um teste que se aprende a
 * ignorar.
 */

import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: '.env' });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.log('⏭  DATABASE_URL ausente — verificação de carga pulada.');
  process.exit(0);
}

process.env.DATABASE_URL = url;
const sql = neon(url);

const { loadSnapshot, pullChanges } = await import('@/lib/db/queries/sync-read');
const { searchProduction } = await import('@/lib/db/queries/search');
const { listShootingDays } = await import('@/lib/db/queries/shooting-days');
const { listProductionsForUser, getProduction } = await import(
  '@/lib/db/queries/productions'
);

let passed = 0;
let failed = 0;

function check(label, condition, detalhe = '') {
  if (condition) {
    passed += 1;
    console.log(`✓ ${label}${detalhe}`);
  } else {
    failed += 1;
    console.error(`✗ ${label}${detalhe}`);
  }
}

// ---- Escala ----

const DIARIAS = 40;
const CENAS = 200;
const SETUPS_POR_DIARIA = 12;
const TAKES_POR_SETUP = 5; // 40 × 12 × 5 = 2400 takes
const CAMERAS = 2;
const TRACKS_POR_TAKE = 4;

const dono = { id: randomUUID(), nome: 'Carga (câmera)' };
const productionId = randomUUID();

async function cleanup() {
  await sql`delete from productions where id = ${productionId}`;
  await sql`delete from users where id = ${dono.id}`;
}

/**
 * Mede o pior caso de três execuções, não a média.
 *
 * Média esconde o outlier, e é o outlier que o assistente sente: a fixação que travou
 * naquela vez é a que vira "esse app é lento".
 */
async function mede(rotulo, fn) {
  let pior = 0;
  let resultado;
  for (let i = 0; i < 3; i += 1) {
    const inicio = performance.now();
    resultado = await fn();
    pior = Math.max(pior, performance.now() - inicio);
  }
  return { rotulo, ms: Math.round(pior), resultado };
}

async function semear() {
  await sql`
    insert into users (id, name, email)
    values (${dono.id}, ${dono.nome}, ${`carga-${dono.id}@exemplo.test`})
  `;

  await sql`
    insert into productions (id, name, join_code, created_by, updated_by)
    values (${productionId}, ${'Carga — longa-metragem'},
            ${`CARGA-${productionId.slice(0, 4).toUpperCase()}`}, ${dono.id}, ${dono.id})
  `;

  await sql`
    insert into production_members (id, production_id, user_id, role, department,
                                    created_by, updated_by)
    values (gen_random_uuid(), ${productionId}, ${dono.id}, 'OWNER', 'CAMERA',
            ${dono.id}, ${dono.id})
  `;

  // Diárias: uma por dia a partir de uma segunda-feira qualquer.
  await sql`
    insert into shooting_days (id, production_id, date, day_number, created_by, updated_by)
    select gen_random_uuid(), ${productionId},
           (date '2026-01-05' + (n || ' days')::interval)::date, n::text,
           ${dono.id}, ${dono.id}
      from generate_series(1, ${DIARIAS}) as n
  `;

  await sql`
    insert into scenes (id, production_id, number, block, description, created_by, updated_by)
    select gen_random_uuid(), ${productionId}, n::text, 'A',
           'Cena ' || n || ' — interior, dia', ${dono.id}, ${dono.id}
      from generate_series(1, ${CENAS}) as n
  `;

  await sql`
    insert into camera_units (id, production_id, label, model, created_by, updated_by)
    select gen_random_uuid(), ${productionId}, 'Câmera ' || n, 'Alexa 35',
           ${dono.id}, ${dono.id}
      from generate_series(1, ${CAMERAS}) as n
  `;

  // Setups: doze por diária, distribuídos entre as cenas.
  await sql`
    insert into setups (id, production_id, scene_id, shooting_day_id, code, sort_order,
                        created_by, updated_by)
    select gen_random_uuid(), ${productionId}, cena.id, dia.id, s::text, s,
           ${dono.id}, ${dono.id}
      from (select id, row_number() over (order by date) as pos
              from shooting_days where production_id = ${productionId}) dia
      cross join generate_series(1, ${SETUPS_POR_DIARIA}) as s
      join lateral (
        select id from scenes
         where production_id = ${productionId}
         order by (number::int + dia.pos + s) % ${CENAS}
         limit 1
      ) cena on true
  `;

  await sql`
    insert into takes (id, production_id, setup_id, number, status, created_by, updated_by)
    select gen_random_uuid(), ${productionId}, st.id, n,
           case when n = ${TAKES_POR_SETUP} then 'CIRCLE'::take_status
                else 'RECORDED'::take_status end,
           ${dono.id}, ${dono.id}
      from setups st
      cross join generate_series(1, ${TAKES_POR_SETUP}) as n
     where st.production_id = ${productionId}
  `;

  await sql`
    insert into camera_take_data (id, production_id, take_id, camera_unit_id, lens, t_stop,
                                  card, file_name, created_by, updated_by)
    select gen_random_uuid(), ${productionId}, t.id, c.id, 'Cooke S4 32mm', 'T2.8',
           'A0' || (t.number), 'A012C00' || t.number || '_001', ${dono.id}, ${dono.id}
      from takes t
      cross join (select id from camera_units where production_id = ${productionId}) c
     where t.production_id = ${productionId}
  `;

  await sql`
    insert into sound_take_data (id, production_id, take_id, sound_roll, file_name,
                                 created_by, updated_by)
    select gen_random_uuid(), ${productionId}, id, 'SR01', 'S012T00' || number,
           ${dono.id}, ${dono.id}
      from takes where production_id = ${productionId}
  `;

  await sql`
    insert into sound_take_tracks (id, production_id, take_id, index, name, source,
                                   created_by, updated_by)
    select gen_random_uuid(), ${productionId}, t.id, n, 'CH' || n, 'Boom',
           ${dono.id}, ${dono.id}
      from takes t
      cross join generate_series(1, ${TRACKS_POR_TAKE}) as n
     where t.production_id = ${productionId}
  `;

  await sql`
    insert into continuity_take_data (id, production_id, take_id, action, notes,
                                      created_by, updated_by)
    select gen_random_uuid(), ${productionId}, id,
           'Entra pela porta, senta, pega o copo', 'Sem desvio de roteiro',
           ${dono.id}, ${dono.id}
      from takes where production_id = ${productionId}
  `;

  // As quatro coleções de estado vêm por **cena da produção** no snapshot: são elas que
  // crescem o filme inteiro, e por isso estão aqui.
  for (const [tabela, coluna] of [
    ['continuity_props', 'name'],
    ['continuity_wardrobe', 'character'],
    ['continuity_hair_makeup', 'character'],
    ['continuity_set_dressing', 'element'],
  ]) {
    await sql`
      insert into ${sql.unsafe(tabela)} (id, production_id, scene_id, ${sql.unsafe(coluna)},
                                          notes, created_by, updated_by)
      select gen_random_uuid(), ${productionId}, c.id, 'Item ' || n, 'Estado inicial',
             ${dono.id}, ${dono.id}
        from scenes c
        cross join generate_series(1, 3) as n
       where c.production_id = ${productionId}
    `;
  }
}

async function run() {
  const inicioSemeadura = performance.now();
  await semear();
  console.log(`  (semeadura em ${Math.round(performance.now() - inicioSemeadura)} ms)\n`);

  const [contagem] = await sql`
    select
      (select count(*)::int from shooting_days where production_id = ${productionId}) as diarias,
      (select count(*)::int from takes where production_id = ${productionId}) as takes,
      (select count(*)::int from camera_take_data where production_id = ${productionId}) as camera,
      (select count(*)::int from sound_take_tracks where production_id = ${productionId}) as tracks,
      (select count(*)::int from continuity_props where production_id = ${productionId}) as props,
      (select count(*)::int from sync_log where production_id = ${productionId}) as log
  `;

  check('a produção tem 40 diárias', contagem.diarias === DIARIAS);
  check(
    'a produção passa de 2000 takes',
    contagem.takes >= 2000,
    ` (${contagem.takes})`,
  );
  console.log(
    `  camera_take_data ${contagem.camera} · tracks ${contagem.tracks} · props ${contagem.props} · sync_log ${contagem.log}\n`,
  );

  const [primeiraDiaria] = await sql`
    select id::text as id from shooting_days
     where production_id = ${productionId} order by date limit 1
  `;

  const medidas = [
    // A fixação é a única requisição obrigatória da fronteira: se ela demorar, a diária
    // não abre — e é o pior lugar possível para demorar, porque é o começo do dia.
    await mede('fixação da diária (snapshot)', () =>
      loadSnapshot({ productionId, shootingDayId: primeiraDiaria.id }),
    ),
    // Cursor zerado é o caso do aparelho novo, que é quando o pull é maior.
    await mede('pull do zero (500 mudanças)', () =>
      pullChanges({ productionId, since: 0, limit: 500 }),
    ),
    await mede('pull incremental (cursor quente)', async () => {
      const [topo] = await sql`
        select max(seq)::text as seq from sync_log where production_id = ${productionId}
      `;
      return pullChanges({ productionId, since: Number(topo.seq) - 10, limit: 500 });
    }),
    await mede('busca na produção inteira', () =>
      searchProduction({ productionId, termo: 'Cooke 32mm' }),
    ),
    await mede('lista de diárias da sala', () => listShootingDays(productionId)),
    await mede('lista de produções do usuário', () => listProductionsForUser(dono.id)),
    await mede('dashboard da sala', () => getProduction(productionId)),
  ];

  console.log('  Pior de três execuções:');
  for (const medida of medidas) {
    console.log(`    ${medida.rotulo.padEnd(34)} ${String(medida.ms).padStart(6)} ms`);
  }
  console.log('');

  const tempo = (rotulo) => medidas.find((m) => m.rotulo === rotulo).ms;

  // Tetos de ordem de grandeza, não de desempenho. Estão aqui para pegar o índice que
  // alguém removeu, não para cravar milissegundo.
  check(
    'a fixação sai em menos de 3 s',
    tempo('fixação da diária (snapshot)') < 3000,
    ` (${tempo('fixação da diária (snapshot)')} ms)`,
  );
  check('o pull do zero sai em menos de 3 s', tempo('pull do zero (500 mudanças)') < 3000, ` (${tempo('pull do zero (500 mudanças)')} ms)`);
  /**
   * O que se afirma do pull incremental é o **recorte**, não o relógio.
   *
   * Comparar os dois tempos era a asserção óbvia e não mede nada: nesta escala as duas
   * consultas são dominadas pela ida e volta da rede, então a razão entre elas é ruído —
   * o teste passaria ou falharia conforme a latência do minuto. O que de fato protege o
   * aparelho em set é o cursor trazer poucas linhas; se ele parar de recortar, o sintoma
   * será o pull inteiro a cada dez segundos.
   */
  const doZero = medidas.find((m) => m.rotulo === 'pull do zero (500 mudanças)').resultado;
  const incremental = medidas.find(
    (m) => m.rotulo === 'pull incremental (cursor quente)',
  ).resultado;

  // Menos de 500 com `hasMore`: o lote é de linhas do `sync_log`, e parte delas é de
  // entidade que este protocolo não sincroniza (a diária, os membros). O cursor avança
  // por elas do mesmo jeito — é o que impede a escrita de um departamento futuro de
  // travar o pull de quem está na versão anterior.
  check(
    'o pull do zero enche o lote e avisa que há mais',
    doZero.changes.length > 300 && doZero.hasMore,
    ` (${doZero.changes.length} de 500 linhas de log)`,
  );
  check(
    'o pull incremental traz só o que passou do cursor',
    incremental.changes.length <= 11 && !incremental.hasMore,
    ` (${incremental.changes.length})`,
  );
  check('a busca sai em menos de 3 s', tempo('busca na produção inteira') < 3000, ` (${tempo('busca na produção inteira')} ms)`);
  check('a lista de diárias sai em menos de 1,5 s', tempo('lista de diárias da sala') < 1500, ` (${tempo('lista de diárias da sala')} ms)`);
  check('o dashboard sai em menos de 1,5 s', tempo('dashboard da sala') < 1500, ` (${tempo('dashboard da sala')} ms)`);

  const snapshot = medidas.find((m) => m.rotulo === 'fixação da diária (snapshot)')
    .resultado;

  // O recorte importa tanto quanto o tempo: a fixação traz **a diária**, não a produção.
  // Se um dia ela passar a trazer os 2400 takes do filme, o sintoma será um aparelho
  // ficando sem memória em locação, e não uma consulta lenta no gráfico.
  check(
    'a fixação traz só os takes da diária',
    snapshot.takes.length === SETUPS_POR_DIARIA * TAKES_POR_SETUP,
    ` (${snapshot.takes.length} de ${contagem.takes})`,
  );
  check(
    'a fixação traz só os setups da diária',
    snapshot.setups.length === SETUPS_POR_DIARIA,
  );
  // As cenas e as coleções de estado vêm da produção inteira de propósito (ADR: a
  // continuidade vale por atravessar dias). É o que cresce — e é por isso que se mede.
  check('as cenas vêm da produção inteira', snapshot.scenes.length === CENAS);
  check(
    'as coleções de estado vêm da produção inteira',
    snapshot.continuityProps.length === CENAS * 3,
  );

  /**
   * Aqui **não** se afirma que o plano usa índice.
   *
   * Foi a primeira tentativa, e estava errada: com as 600 linhas de uma produção o
   * planejador escolhe varredura sequencial porque ela é de fato mais barata, e o teste
   * acusaria um defeito que não existe. O que se testa de plano é o que não depende de
   * volume — e a existência do índice é assunto de schema, então mora em
   * `npm run test:db`.
   *
   * O que este arquivo afirma sobre as coleções é o **recorte** e o teto de tempo da
   * fixação inteira, que é onde elas doem se pararem de ser indexáveis.
   */
  const fatiaDaFixacao =
    snapshot.continuityProps.length +
    snapshot.continuityWardrobe.length +
    snapshot.continuityHairMakeup.length +
    snapshot.continuitySetDressing.length;

  check(
    'as quatro coleções cabem na fixação sem dominá-la',
    fatiaDaFixacao === CENAS * 3 * 4,
    ` (${fatiaDaFixacao} itens de estado)`,
  );

  /**
   * A afirmação que vale sobre a fixação é **estrutural**, não cronométrica.
   *
   * Teto de tempo não pega a regressão que importa aqui: se alguém desfizer o `db.batch`
   * e as dezessete consultas voltarem a ir uma de cada vez, o relógio contra um banco
   * próximo mal se mexe — e o aparelho em locação, com 200 ms por ida, passa de três
   * segundos para abrir a diária. Contar as requisições mede a causa; medir o relógio
   * mede a distância até o banco de quem rodou o teste.
   */
  const fetchOriginal = globalThis.fetch;
  let requisicoes = 0;
  globalThis.fetch = (...args) => {
    requisicoes += 1;
    return fetchOriginal(...args);
  };

  try {
    await loadSnapshot({ productionId, shootingDayId: primeiraDiaria.id });
  } finally {
    globalThis.fetch = fetchOriginal;
  }

  check(
    'a fixação inteira sai em UMA requisição ao banco',
    requisicoes === 1,
    ` (${requisicoes})`,
  );
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
