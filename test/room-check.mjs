/**
 * Verificação da sala contra o banco real (Fase 3).
 *
 * Como `db-schema-check`, não entra em `npm test`: exige rede e `DATABASE_URL`. Prova as
 * regras que só existem no servidor — as que a interface esconde mas nunca decide.
 *
 * Roda com `--conditions=react-server` porque a camada de query importa `server-only`,
 * que **falha de propósito** fora do servidor. A condição é exatamente a que o Next usa
 * nos Server Components; sem ela, o import morre antes do primeiro check.
 *
 * Tudo acontece dentro de uma produção descartável, apagada no fim mesmo se algo falhar.
 */

import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: '.env' });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.log('⏭  DATABASE_URL ausente — verificação da sala pulada.');
  process.exit(0);
}

// O cliente do Drizzle lê `DATABASE_URL` no import; o dotenv precisa vir antes dele.
process.env.DATABASE_URL = url;

const sql = neon(url);

const { createProduction, joinProductionByCode, setJoinEnabled, rotateJoinCode } =
  await import('@/lib/db/queries/productions');
const { listMembers, updateMember, removeMember, leaveProduction, transferOwnership } =
  await import('@/lib/db/queries/members');
const { createShootingDay, listShootingDays, deleteShootingDay } = await import(
  '@/lib/db/queries/shooting-days'
);
const {
  assignEquipment,
  createEquipment,
  deleteEquipment,
  listAssignments,
  listEquipment,
} = await import('@/lib/db/queries/equipment');
const { descreveEquipamento } = await import('@/features/production/labels');
const { searchProduction } = await import('@/lib/db/queries/search');

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

const dono = { id: randomUUID(), nome: 'Dona da Produção' };
const membro = { id: randomUUID(), nome: 'Assistente de Câmera' };
const terceiro = { id: randomUUID(), nome: 'Continuísta' };
let productionId = null;

async function cleanup() {
  if (productionId) await sql`delete from productions where id = ${productionId}`;
  for (const pessoa of [dono, membro, terceiro]) {
    await sql`delete from users where id = ${pessoa.id}`;
  }
}

async function run() {
  for (const pessoa of [dono, membro, terceiro]) {
    await sql`
      insert into users (id, name, email)
      values (${pessoa.id}, ${pessoa.nome}, ${`sala-${pessoa.id}@exemplo.test`})
    `;
  }

  // ---- Criar e entrar ----

  const criada = await createProduction({
    name: 'Filme de Verificação',
    department: 'CAMERA',
    userId: dono.id,
    userName: dono.nome,
  });
  productionId = criada.id;

  check('quem cria a produção vira OWNER', await papel(dono.id) === 'OWNER');
  check('o código de convite tem o formato PREFIXO-XXXX', /^[A-Z0-9]{2,10}-[A-Z0-9]{4}$/.test(criada.joinCode));

  const entrada = await joinProductionByCode({
    joinCode: criada.joinCode,
    department: 'SOUND',
    jobTitle: 'Técnico de som direto',
    userId: membro.id,
    userName: membro.nome,
  });

  check('entrar por código funciona', entrada.status === 'JOINED');
  check('quem entra por código entra como MEMBER', await papel(membro.id) === 'MEMBER');
  check(
    'o departamento escolhido na entrada é respeitado',
    await departamento(membro.id) === 'SOUND',
  );

  const repetida = await joinProductionByCode({
    joinCode: criada.joinCode,
    department: 'SOUND',
    userId: membro.id,
    userName: membro.nome,
  });
  check('entrar de novo não duplica o vínculo', repetida.status === 'ALREADY_MEMBER');

  const inexistente = await joinProductionByCode({
    joinCode: 'NAOEXI-STE1',
    department: 'CAMERA',
    userId: terceiro.id,
    userName: terceiro.nome,
  });
  check('código inexistente é recusado', inexistente.status === 'NOT_FOUND');

  // ---- Sala fechada ----

  await setJoinEnabled({ productionId, enabled: false, userId: dono.id });
  const fechada = await joinProductionByCode({
    joinCode: criada.joinCode,
    department: 'CONTINUITY',
    userId: terceiro.id,
    userName: terceiro.nome,
  });
  check('sala fechada recusa entrada (join_enabled = false)', fechada.status === 'CLOSED');

  await setJoinEnabled({ productionId, enabled: true, userId: dono.id });

  const codigoNovo = await rotateJoinCode({
    productionId,
    name: 'Filme de Verificação',
    userId: dono.id,
  });
  check('rotacionar gera um código diferente', codigoNovo !== criada.joinCode);

  const codigoAntigo = await joinProductionByCode({
    joinCode: criada.joinCode,
    department: 'CONTINUITY',
    userId: terceiro.id,
    userName: terceiro.nome,
  });
  check('o código anterior deixa de valer', codigoAntigo.status === 'NOT_FOUND');

  const comCodigoNovo = await joinProductionByCode({
    joinCode: codigoNovo,
    department: 'CONTINUITY',
    userId: terceiro.id,
    userName: terceiro.nome,
  });
  check('o código novo vale', comCodigoNovo.status === 'JOINED');

  // ---- Papéis: o que o guarda de papel mínimo não cobre ----

  const membros = await listMembers(productionId);
  const idDe = (userId) => membros.find((m) => m.userId === userId)?.id;
  const [idDono, idMembro, idTerceiro] = [dono.id, membro.id, terceiro.id].map(idDe);

  check('a sala lista os três membros', membros.length === 3);

  const promocao = await updateMember({
    productionId,
    memberId: idMembro,
    role: 'ADMIN',
    department: 'SOUND',
    actor: { role: 'OWNER', userId: dono.id },
  });
  check('OWNER promove a ADMIN', promocao.status === 'OK' && (await papel(membro.id)) === 'ADMIN');

  const adminNoDono = await updateMember({
    productionId,
    memberId: idDono,
    role: 'MEMBER',
    department: 'CAMERA',
    actor: { role: 'ADMIN', userId: membro.id },
  });
  check(
    'ADMIN não altera o papel do OWNER',
    adminNoDono.status === 'FORBIDDEN' && (await papel(dono.id)) === 'OWNER',
  );

  const viraDono = await updateMember({
    productionId,
    memberId: idTerceiro,
    role: 'OWNER',
    department: 'CONTINUITY',
    actor: { role: 'OWNER', userId: dono.id },
  });
  check(
    'promover a OWNER pela edição de membro é recusado',
    viraDono.status === 'FORBIDDEN' && (await papel(terceiro.id)) === 'MEMBER',
  );

  const adminRemoveAdmin = await removeMember({
    productionId,
    memberId: idMembro,
    actor: { role: 'ADMIN', userId: terceiro.id },
  });
  check('ADMIN não remove outro ADMIN', adminRemoveAdmin.status === 'FORBIDDEN');

  const removeDono = await removeMember({
    productionId,
    memberId: idDono,
    actor: { role: 'OWNER', userId: dono.id },
  });
  check('o OWNER não é removível', removeDono.status === 'FORBIDDEN');

  const saidaDoDono = await leaveProduction({
    productionId,
    memberId: idDono,
    role: 'OWNER',
    userId: dono.id,
  });
  check('OWNER não sai sem transferir a posse', saidaDoDono.status === 'FORBIDDEN');

  // ---- Transferência ----

  await transferOwnership({
    productionId,
    fromMemberId: idDono,
    toMemberId: idMembro,
    userId: dono.id,
  });
  check(
    'transferir posse troca OWNER por ADMIN, sem sala sem dono',
    (await papel(membro.id)) === 'OWNER' && (await papel(dono.id)) === 'ADMIN',
  );

  const saidaDepois = await leaveProduction({
    productionId,
    memberId: idDono,
    role: 'ADMIN',
    userId: dono.id,
  });
  const restantes = await listMembers(productionId);
  check(
    'depois de transferir, o ex-dono sai',
    saidaDepois.status === 'OK' && restantes.length === 2,
  );

  const [donos] = await sql`
    select count(*)::int as total from production_members
    where production_id = ${productionId} and role = 'OWNER' and deleted_at is null
  `;
  check('a produção tem exatamente um dono', donos.total === 1);

  // ---- Diárias ----

  const dia = { date: '2026-08-10', dayNumber: '12', unit: null, location: 'Estúdio 3',
    callTime: '07:00', wrapTime: null, lunchStart: null, lunchEnd: null, notes: null };

  const idDia = await createShootingDay({ productionId, data: dia, userId: membro.id });
  const idRepetido = await createShootingDay({
    productionId,
    data: { ...dia, location: 'Estúdio 4' },
    userId: membro.id,
  });

  check('criar a mesma diária duas vezes não duplica (id derivado)', idDia === idRepetido);

  const diarias = await listShootingDays(productionId);
  check(
    'a diária guarda o dia civil como está',
    diarias.length === 1 && diarias[0].date === '2026-08-10',
  );
  check('a segunda criação atualiza os dados', diarias[0].location === 'Estúdio 4');

  const outraUnidade = await createShootingDay({
    productionId,
    data: { ...dia, unit: '2ª unidade' },
    userId: membro.id,
  });
  check(
    'mesma data em outra unidade é outra diária',
    outraUnidade !== idDia && (await listShootingDays(productionId)).length === 2,
  );

  await deleteShootingDay({ productionId, dayId: idDia, userId: membro.id });
  check('excluir some da lista (soft delete)', (await listShootingDays(productionId)).length === 1);

  const [apagada] = await sql`
    select deleted_at from shooting_days where id = ${idDia}
  `;
  check('o registro excluído continua no banco', apagada?.deleted_at !== null);

  // ---- Equipamentos e "o que estamos usando hoje" (Fase 8) ----

  const microfone = randomUUID();
  await createEquipment({
    id: microfone,
    productionId,
    department: 'SOUND',
    category: 'MICROPHONE',
    manufacturer: 'Sennheiser',
    model: 'MKH 416',
    serialNumber: '416-0421',
    actorId: membro.id,
  });

  const corpo = randomUUID();
  await createEquipment({
    id: corpo,
    productionId,
    department: 'CAMERA',
    category: 'CAMERA',
    model: 'Alexa 35',
    nickname: 'A CAM',
    actorId: membro.id,
  });

  const catalogo = await listEquipment(productionId);
  check('o catálogo lista o que foi cadastrado', catalogo.length === 2);
  // Equipamento é dado compartilhado: quem chega com o kit não é sempre quem administra a
  // sala, e um catálogo que só o ADMIN preenche nasce vazio (permissions.md §3).
  check(
    'MEMBER cadastra equipamento de qualquer departamento',
    catalogo.some((item) => item.department === 'SOUND') &&
      catalogo.some((item) => item.department === 'CAMERA'),
  );

  check(
    'a descrição impressa junta apelido, modelo e série',
    descreveEquipamento(catalogo.find((item) => item.id === microfone)) ===
      'Sennheiser MKH 416 · s/n 416-0421',
  );
  check(
    'o apelido vem na frente quando existe',
    descreveEquipamento(catalogo.find((item) => item.id === corpo)) ===
      'A CAM · Alexa 35',
  );

  await assignEquipment({
    id: randomUUID(),
    productionId,
    equipmentId: microfone,
    shootingDayId: outraUnidade,
    // O departamento vem do equipamento, não de quem aloca.
    department: 'SOUND',
    label: 'Boom principal',
    actorId: membro.id,
  });

  const doDia = await listAssignments({ productionId, shootingDayId: outraUnidade });
  check('a alocação aparece na diária', doDia.length === 1);
  check(
    'a alocação resolve o equipamento junto',
    doDia[0].model === 'MKH 416' && doDia[0].label === 'Boom principal',
  );
  // É a consulta que responde "hoje o som está com MKH 416" para a continuísta.
  check('a alocação carrega o departamento do equipamento', doDia[0].department === 'SOUND');

  const outroDia = await createShootingDay({
    productionId,
    data: { ...dia, date: '2026-09-02', unit: null },
    userId: membro.id,
  });
  check(
    'a alocação não vaza para outra diária',
    (await listAssignments({ productionId, shootingDayId: outroDia })).length === 0,
  );

  // Exclusão lógica: o boletim de três meses atrás não pode passar a dizer que o take foi
  // gravado com nada (ADR-015).
  await deleteEquipment({ id: microfone, productionId, actorId: membro.id });
  check(
    'equipamento removido sai do catálogo',
    (await listEquipment(productionId)).length === 1,
  );
  const [linhaApagada] = await sql`
    select deleted_at from equipment where id = ${microfone}
  `;
  check('equipamento removido continua no banco', linhaApagada?.deleted_at !== null);
  check(
    'a alocação de equipamento removido some da diária',
    (await listAssignments({ productionId, shootingDayId: outraUnidade })).length === 0,
  );

  // ---- Busca da produção (Fase 8, ADR-036) ----
  //
  // A busca da diária é local e já tem teste; esta é a outra metade — a que varre todas as
  // diárias e por isso vive no servidor. O que se procura aqui é quase sempre
  // identificador, e é isso que o teste guarda.

  const cenaId = randomUUID();
  const planoId = randomUUID();
  const takeUm = randomUUID();
  const takeDois = randomUUID();

  await sql`
    insert into scenes (id, production_id, number, block, description, created_by)
    values (${cenaId}, ${productionId}, '24', 'A', 'João atravessa o galpão', ${membro.id})
  `;
  await sql`
    insert into setups (id, production_id, scene_id, shooting_day_id, code, sort_order, created_by)
    values (${planoId}, ${productionId}, ${cenaId}, ${idDia}, '1', 0, ${membro.id})
  `;
  await sql`
    insert into takes (id, production_id, setup_id, number, created_by)
    values (${takeUm}, ${productionId}, ${planoId}, 1, ${membro.id}),
           (${takeDois}, ${productionId}, ${planoId}, 2, ${membro.id})
  `;
  await sql`
    insert into camera_take_data (id, production_id, take_id, card, roll, file_name, notes, created_by)
    values (${randomUUID()}, ${productionId}, ${takeUm}, 'A023', 'R1', 'A023C012_001', 'estourou o fundo', ${membro.id}),
           (${randomUUID()}, ${productionId}, ${takeDois}, 'A023', 'R1', 'A023C012_002', null, ${membro.id})
  `;
  await sql`
    insert into sound_take_data (id, production_id, take_id, sound_roll, file_name, notes, created_by)
    values (${randomUUID()}, ${productionId}, ${takeUm}, '008', '008_012', 'avião', ${membro.id})
  `;

  const porCartao = await searchProduction({ productionId, termo: 'A023' });
  check('a busca acha os takes pelo cartão', porCartao.length === 2);

  // Full-text trataria `A023C012_001` como um lexema só e não acharia "A023" dentro dele.
  // É o motivo de a busca ser por trecho (ADR-036).
  const porTrechoDeArquivo = await searchProduction({ productionId, termo: 'C012_001' });
  check('a busca acha um trecho no meio do nome do arquivo', porTrechoDeArquivo.length === 1);

  check(
    'a busca é insensível a maiúsculas',
    (await searchProduction({ productionId, termo: 'a023c012_002' })).length === 1,
  );

  // Digitar mais restringe, nunca amplia — a mesma regra da busca local.
  const duasPalavras = await searchProduction({ productionId, termo: '24 avião' });
  check('cada palavra do termo precisa aparecer', duasPalavras.length === 1);
  check(
    'as palavras podem vir de departamentos diferentes',
    duasPalavras[0]?.takeId === takeUm,
  );
  check(
    'palavra que não existe zera o resultado',
    (await searchProduction({ productionId, termo: '24 helicóptero' })).length === 0,
  );

  const umTake = porTrechoDeArquivo[0];
  check('o resultado diz de que diária é', umTake?.shootingDayId === idDia);
  check('o resultado localiza cena, plano e take', umTake?.cena === '24' && umTake?.plano === '1' && umTake?.take === 1);
  check('o resultado traz o rótulo da câmera', (umTake?.camera ?? '').includes('A023C012_001'));
  check('o resultado traz o do som quando existe', (umTake?.som ?? '').includes('008_012'));

  // Buscar por espaço em branco devolveria a produção inteira: isso não é resultado.
  check(
    'termo vazio não devolve nada',
    (await searchProduction({ productionId, termo: '   ' })).length === 0,
  );

  // A busca é da produção de quem pergunta — nunca de outra.
  check(
    'a busca não atravessa produção',
    (await searchProduction({ productionId: randomUUID(), termo: 'A023' })).length === 0,
  );

  // Take apagado não volta pela busca: soft delete é o modo de apagar (ADR-015).
  await sql`update takes set deleted_at = now() where id = ${takeDois}`;
  check(
    'take apagado não aparece na busca',
    (await searchProduction({ productionId, termo: 'A023' })).length === 1,
  );
}

async function papel(userId) {
  const [row] = await sql`
    select role from production_members
    where production_id = ${productionId} and user_id = ${userId} and deleted_at is null
  `;
  return row?.role ?? null;
}

async function departamento(userId) {
  const [row] = await sql`
    select department from production_members
    where production_id = ${productionId} and user_id = ${userId} and deleted_at is null
  `;
  return row?.department ?? null;
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
