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
const {
  consomeTentativa,
  chaveDeEntrada,
  emLinguagemDeGente,
  esqueceTentativas,
  LIMITE_DE_ENTRADA,
} = await import('@/lib/auth/limite');
const { auth } = await import('@/lib/auth/config');
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
    await sql`delete from rate_limits where key = ${chaveDeEntrada(pessoa.id)}`;
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

  // ---- Fase 10: o limite de tentativas no resgate de código ----

  // O código tem quatro caracteres sobre um alfabeto de 32 e o prefixo vem do nome da
  // produção. Sem limite, o espaço inteiro cabe numa tarde.
  const regra = { janelaSegundos: 3600, maximo: 3 };
  const chave = chaveDeEntrada(terceiro.id);

  const vereditos = [];
  for (let i = 0; i < 5; i += 1) {
    vereditos.push(await consomeTentativa(chave, regra));
  }

  check(
    'as três primeiras tentativas passam',
    vereditos.slice(0, 3).every((veredito) => veredito.permitido),
  );
  check(
    'da quarta em diante é barrado',
    vereditos.slice(3).every((veredito) => !veredito.permitido),
  );
  check(
    'quem foi barrado sabe quanto esperar',
    vereditos[3].esperarSegundos > 0 && vereditos[3].esperarSegundos <= 3600,
  );

  const [linhaDoLimite] = await sql`
    select count from rate_limits where key = ${chave}
  `;
  // A contagem mora no banco, não em memória: em serverless, memória é por instância —
  // e o limite passaria a valer por instância, que é o mesmo que não valer.
  check('a contagem fica no banco', Number(linhaDoLimite?.count) === 5);

  const deOutraPessoa = await consomeTentativa(chaveDeEntrada(membro.id), regra);
  check('o limite é por pessoa, não global', deOutraPessoa.permitido);

  // Janela vencida recomeça do zero: quem esperou não continua de castigo.
  await sql`
    update rate_limits set last_request = ${Date.now() - 3600 * 1000 - 1}
     where key = ${chave}
  `;
  const depoisDaJanela = await consomeTentativa(chave, regra);
  const [recontado] = await sql`select count from rate_limits where key = ${chave}`;
  check('janela vencida recomeça a contagem', depoisDaJanela.permitido);
  check('e a contagem volta a 1', Number(recontado?.count) === 1);

  check('90 segundos viram "2 minutos"', emLinguagemDeGente(90) === '2 minutos');
  check('40 segundos continuam segundos', emLinguagemDeGente(40) === '40 segundos');

  // Uma linha por chave e chave nova a cada IP: sem poda, a tabela só cresce.
  await sql`
    insert into rate_limits (key, count, last_request)
    values (${'fossil-de-ontem'}, 9, ${Date.now() - 25 * 3600 * 1000})
  `;
  // A poda anda junto da **abertura** de janela, não de toda tentativa: presa à
  // tentativa, quem está sendo barrado faria o servidor varrer a tabela a cada batida.
  // Por isso o gatilho aqui é uma chave nova, e não mais uma tentativa da mesma.
  await consomeTentativa(chaveDeEntrada(dono.id), regra);
  const [fossil] = await sql`
    select count(*)::int as total from rate_limits where key = ${'fossil-de-ontem'}
  `;
  check('linha vencida há mais de um dia é podada', fossil.total === 0);

  const [viva] = await sql`
    select count(*)::int as total from rate_limits where key = ${chave}
  `;
  check('a poda não leva junto quem ainda está na janela', viva.total === 1);

  // Acertar o código zera a cota: quem entra em cinco salas numa tarde não é quem o
  // limite existe para pegar, e um acerto encerra a adivinhação em vez de continuá-la.
  await consomeTentativa(chave, regra);
  await esqueceTentativas(chave);
  const [aposAcerto] = await sql`
    select count(*)::int as total from rate_limits where key = ${chave}
  `;
  check('acertar o código zera a cota', aposAcerto.total === 0);
  check(
    'e a tentativa seguinte recomeça permitida',
    (await consomeTentativa(chave, regra)).permitido,
  );

  /**
   * A armadilha que a revisão pegou, e que não tem sintoma nenhum quando volta.
   *
   * A Better Auth poda `rate_limits` sozinha, e o corte dela é
   * `agora - max(rateLimit.window, 10, 60)` — aplicado a **todas** as linhas, sem olhar a
   * chave, e sem consultar as janelas de `customRules`. Se a janela global for menor que
   * qualquer janela em uso, as linhas dessas regras são apagadas antes de a janela delas
   * fechar: o limite de uma hora passa a valer o tamanho da janela global.
   *
   * Era o caso com `window: 60`. As regras de uma hora valiam um minuto — sessenta vezes
   * mais fracas do que o que estava escrito, sem nada quebrar.
   */
  const limiteConfigurado = auth.options.rateLimit;
  const janelasEmUso = [
    ...Object.values(limiteConfigurado.customRules ?? {}).map((r) => r.window),
    LIMITE_DE_ENTRADA.janelaSegundos,
  ];

  check(
    'a janela global cobre a maior janela em uso',
    limiteConfigurado.window >= Math.max(...janelasEmUso),
    ` (global ${limiteConfigurado.window}s vs maior ${Math.max(...janelasEmUso)}s)`,
  );
  check('o contador do rate limit mora no banco', limiteConfigurado.storage === 'database');
  // Frescor de sessão desligado: com 90 dias sem reverificação, exigir sessão "fresca"
  // fecharia justamente a tela que derruba um aparelho perdido.
  check('a sessão não precisa ser fresca', auth.options.session.freshAge === 0);

  await sql`delete from rate_limits where key like ${'entrar-por-codigo:%'}`;
  await sql`delete from rate_limits where key = ${'fossil-de-ontem'}`;
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
