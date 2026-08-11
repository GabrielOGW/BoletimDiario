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
