// Os três departamentos principais (ADR-040, ADR-041, ADR-042) — o que é regra e não tela.
//
// O que este arquivo segura:
//  - a escolha de "Novo boletim" oferece exatamente Câmera, Continuidade e Som, cada um
//    com nome por extenso (a cor nunca é o único rótulo);
//  - os outros setores somem das opções **sem** reescrever quem já os tem;
//  - os problemas de captação têm forma canônica (senão o compare-and-set vê mudança onde
//    não houve) e não perdem código desconhecido;
//  - rolos, canais, raccord, pendências e diálogo saem da mesma leitura que a tela usa;
//  - o contrato de sync conhece as três entidades novas, e a migração é só aditiva.
import { readFileSync } from 'node:fs';

import {
  DEPARTAMENTOS_PRINCIPAIS,
  definicaoDoModulo,
  editorLocalDoModulo,
  moduloValido,
} from '@/features/diaria/departamentos.ts';
import { proximoCodigoDePlano } from '@/features/diaria/cenas.ts';
import {
  DEPARTMENT_OPTIONS,
  EQUIPMENT_DEPARTMENT_OPTIONS,
  MOSTRAR_OUTROS_SETORES,
  departmentOptionsFor,
  equipmentDepartmentOptionsFor,
} from '@/features/production/options.ts';
import {
  CAPTACOES,
  PROBLEMAS_DE_SOM,
  alternaProblema,
  escreveProblemas,
  leProblemas,
  rotulosDosProblemas,
} from '@/features/sound/problemas.ts';
import {
  canaisDoDia,
  linhasDoRelatorio,
  resumoDoDia,
  rolosDoDia,
} from '@/features/sound/estrutura.ts';
import { montaCSV } from '@/features/sound/csv.ts';
import {
  alteracoesDeDialogo,
  contagensDoDia,
  enquadramentoDoPlano,
  linhasDaContinuidade,
  pendenciasDoDia,
  raccordDoDia,
} from '@/features/continuity/estrutura.ts';
import {
  nivelDoEscopo,
  rotuloDaCategoriaDeFoto,
  rotuloDaCategoriaDeNota,
} from '@/features/continuity/raccord.ts';
import { dimensoesAlvo } from '@/utils/imagem.ts';
import {
  ENTITY_BY_TABLE,
  FOTO_MAX_BYTES,
  SYNC_ENTITIES,
  SYNC_PROTOCOL,
} from '@/lib/contracts/sync.ts';

const checks = [];
const ok = (name, cond) => checks.push({ name, pass: !!cond });

// ---- A escolha de "Novo boletim" (ADR-040) ----

ok(
  'Novo boletim oferece exatamente os três departamentos, nesta ordem',
  DEPARTAMENTOS_PRINCIPAIS.map((d) => d.modulo).join(',') === 'camera,continuidade,som',
);
ok(
  'cada departamento tem nome por extenso e descrição — a cor nunca é o rótulo',
  DEPARTAMENTOS_PRINCIPAIS.every(
    (d) => d.nome.startsWith('Boletim de ') && d.descricao.length > 20,
  ),
);
ok(
  'as cores sugeridas: câmera amarela (brand), continuidade azul, som verde',
  definicaoDoModulo('camera').cor.texto === 'text-brand' &&
    definicaoDoModulo('continuidade').cor.texto.includes('sky') &&
    definicaoDoModulo('som').cor.texto.includes('emerald'),
);
ok(
  'cada departamento tem uma cor diferente',
  new Set(DEPARTAMENTOS_PRINCIPAIS.map((d) => d.cor.faixa)).size === 3,
);
ok(
  'os módulos apontam para os departamentos certos do enum',
  definicaoDoModulo('som').departamento === 'SOUND' &&
    definicaoDoModulo('continuidade').departamento === 'CONTINUITY' &&
    definicaoDoModulo('camera').departamento === 'CAMERA',
);
ok('?dep= aceita só os três módulos', moduloValido('som') === 'som');
ok('?dep= recusa setor escondido', moduloValido('arte') === null);
ok('?dep= recusa vazio e lixo', moduloValido('') === null && moduloValido(null) === null);

// ADR-043: os três abrem um editor **local** — nenhum passa por produção ou diária.
ok('Câmera abre o editor de sempre', editorLocalDoModulo('camera', 'b1') === '/legado/editar?id=b1');
ok('Som abre o editor local de som', editorLocalDoModulo('som', 'som_1') === '/som/editar?id=som_1');
ok(
  'Continuidade abre o editor local de continuidade',
  editorLocalDoModulo('continuidade', 'c1') === '/continuidade/editar?id=c1',
);
ok(
  'nenhum destino exige diária',
  ['camera', 'som', 'continuidade'].every((m) => !editorLocalDoModulo(m, 'x').includes('/diarias/')),
);

// ---- Plano criado fora da Câmera ----

ok('primeiro plano do bloco é o 1', proximoCodigoDePlano([]) === '1');
ok(
  'segue a numeração da Câmera: maior código + 1',
  proximoCodigoDePlano([{ code: '1' }, { code: '3' }, { code: '2' }]) === '4',
);
ok(
  'wild e códigos com letra não entram na conta',
  proximoCodigoDePlano([{ code: 'WILD' }, { code: '2B' }, { code: '1' }]) === '2',
);

// ---- Os outros setores, escondidos (ADR-040) ----

ok('os outros setores estão desligados', MOSTRAR_OUTROS_SETORES === false);
const valores = DEPARTMENT_OPTIONS.map((o) => o.value);
ok(
  'as três primeiras opções são os três departamentos com boletim',
  valores.slice(0, 3).join(',') === 'CAMERA,SOUND,CONTINUITY',
);
ok('sobra só uma opção de gestão — quatro no total', DEPARTMENT_OPTIONS.length === 4);
ok(
  'arte, figurino, direção… não aparecem como opção',
  ['ART', 'WARDROBE', 'DIRECTION', 'LIGHTING', 'DIT', 'MAKEUP', 'EDITORIAL'].every(
    (d) => !valores.includes(d),
  ),
);
ok(
  'a opção de gestão não se apresenta como um setor',
  DEPARTMENT_OPTIONS[3].label.toLowerCase().includes('gestão'),
);
ok(
  'membro antigo de Arte continua de Arte: a opção dele é preservada',
  departmentOptionsFor('ART').some((o) => o.value === 'ART') &&
    departmentOptionsFor('ART').length === 5,
);
ok(
  'membro de departamento visível não ganha opção extra',
  departmentOptionsFor('SOUND').length === 4,
);
ok(
  'equipamento novo só pode ser de um dos três departamentos',
  EQUIPMENT_DEPARTMENT_OPTIONS.map((o) => o.value).join(',') === 'CAMERA,SOUND,CONTINUITY',
);
ok(
  'equipamento antigo de Elétrica mantém o departamento ao ser editado',
  equipmentDepartmentOptionsFor('LIGHTING').some((o) => o.value === 'LIGHTING'),
);

// ---- Problemas de captação (ADR-041) ----

ok('a lista cobre os problemas pedidos', PROBLEMAS_DE_SOM.length >= 10);
ok(
  'ADR, room tone e wild track estão na lista',
  ['ADR', 'ROOM_TONE', 'WILD_TRACK'].every((c) => PROBLEMAS_DE_SOM.some((p) => p.codigo === c)),
);
ok(
  'a ordem guardada é canônica: marcar B depois A dá o mesmo valor',
  escreveProblemas(['ADR', 'RUIDO_EXTERNO']) === escreveProblemas(['RUIDO_EXTERNO', 'ADR']),
);
ok('repetição não duplica', leProblemas('ADR,ADR, ADR').length === 1);
ok('lista vazia é ausência, não string vazia', escreveProblemas([]) === null);
ok('o chip marca', alternaProblema(null, 'SATURADO') === 'SATURADO');
ok('o chip desmarca', alternaProblema('SATURADO,ADR', 'SATURADO') === 'ADR');
ok('desmarcar o último volta a null', alternaProblema('ADR', 'ADR') === null);
ok(
  'código desconhecido é preservado, e vai para o fim',
  leProblemas('XPTO,ADR').join(',') === 'ADR,XPTO',
);
ok(
  'código desconhecido é impresso como veio, não descartado',
  rotulosDosProblemas('XPTO,INAUDIVEL').join('|') === 'Diálogo inaudível|XPTO',
);
ok('captação tem boom, lapela e ambiente', ['Boom', 'Lapela', 'Ambiente'].every((c) => CAPTACOES.includes(c)));

// ---- Rolos, canais, problemas no sound report (ADR-041) ----

const base = { productionId: 'p', version: 0, _dirty: 0 };
const cena = (id, number, block, extra = {}) => ({ ...base, id, number, block, ...extra });
const plano = (id, sceneId, code, extra = {}) => ({
  ...base,
  id,
  sceneId,
  shootingDayId: 'd',
  code,
  sortOrder: 0,
  ...extra,
});
const take = (id, setupId, number) => ({ ...base, id, setupId, number, status: 'RECORDED', kind: 'SYNC' });
const som = (takeId, extra = {}) => ({ ...base, id: `s-${takeId}`, takeId, circled: false, ...extra });
const track = (takeId, index, name, source, pickup) => ({
  ...base,
  id: `t-${takeId}-${index}`,
  takeId,
  index,
  name,
  source,
  pickup,
});

const linhasSom = linhasDoRelatorio({
  cenas: [cena('c1', '1', 'A')],
  setups: [plano('p1', 'c1', '1')],
  takes: [take('t1', 'p1', 1), take('t2', 'p1', 2), take('t3', 'p1', 3)],
  dados: [
    som('t1', { soundRoll: '004', fileName: '004_001', issues: 'ADR,RUIDO_EXTERNO' }),
    som('t2', { soundRoll: '004', fileName: '004_002', circled: true }),
    som('t3', { soundRoll: '005', fileName: '005_001', issueNotes: 'lapela raspando' }),
  ],
  tracks: [
    track('t1', 1, 'Boom', 'MKH 416', 'Boom'),
    track('t1', 2, 'João', 'COS-11', 'Lapela'),
    track('t2', 1, 'Boom', 'MKH 416', 'Boom'),
    track('t2', 2, 'João', 'COS-11', 'Lapela'),
    track('t3', 1, 'Boom', 'MKH 416', 'Boom'),
    track('t3', 2, 'Maria', 'COS-11', 'Lapela'),
  ],
});

ok(
  'os problemas chegam à linha em rótulo e em ordem canônica',
  linhasSom[0].problemas.join('|') === 'Ruído externo|Precisa de ADR / dublagem',
);
ok('o detalhe livre chega à linha', linhasSom[2].obsProblemas === 'lapela raspando');
ok('o resumo conta take com problema marcado ou descrito', resumoDoDia(linhasSom).comProblema === 2);
ok('a captação chega à track', linhasSom[0].tracks[1].captacao === 'Lapela');

const rolos = rolosDoDia(linhasSom, [
  { ...base, id: 'r4', shootingDayId: 'd', label: '004', media: 'SD #1', recorder: '833' },
  { ...base, id: 'r9', shootingDayId: 'd', label: '009', media: 'SD #9 formatado' },
]);
ok('rolos = cadastrados ∪ citados pelos takes', rolos.map((r) => r.rotulo).join(',') === '004,005,009');
ok('os arquivos do roll são derivados dos takes, na ordem', rolos[0].arquivos.map((l) => l.arquivo).join(',') === '004_001,004_002');
ok('o cadastro do roll chega: mídia e equipamento', rolos[0].midia === 'SD #1' && rolos[0].gravador === '833');
ok('roll só citado nos takes aparece, sem cadastro', rolos[1].id === null && rolos[1].arquivos.length === 1);
ok('roll cadastrado sem arquivo também aparece (custódia)', rolos[2].arquivos.length === 0);
ok(
  'roll "004" do cadastro e "004 " do take são o mesmo',
  rolosDoDia(linhasSom, [{ ...base, id: 'x', shootingDayId: 'd', label: ' 004 ' }]).length === 2,
);

const canais = canaisDoDia(linhasSom);
ok('uma linha por configuração distinta de canal, não por take', canais.length === 3);
ok('o boom do dia aparece uma vez, com a contagem de takes', canais[0].nome === 'Boom' && canais[0].takes === 3);
ok('a troca do canal 2 (João → Maria) salta aos olhos', canais.filter((c) => c.index === 2).length === 2);

const csv = montaCSV(linhasSom, { projeto: 'X', data: '2026-11-12' });
const cabecalhoCSV = csv.split('\r\n')[0].split(',');
ok('o CSV ganha problemas e obs_problemas', cabecalhoCSV.includes('problemas') && cabecalhoCSV.includes('obs_problemas'));
ok('as colunas novas vêm antes das tracks', cabecalhoCSV.indexOf('obs_problemas') < cabecalhoCSV.indexOf('track_1'));
ok('a captação vai na célula da track', csv.includes('João · COS-11 (Lapela)'));

// ---- Continuidade: problema, enquadramento, raccord (ADR-042) ----

const cenasC = [cena('c24a', '24', 'A'), cena('c24b', '24', 'B'), cena('c30', '30', 'A')];
const setupsC = [
  plano('s1', 'c24a', '1', { shotSize: 'Close', angle: 'Plongée', description: 'João no sofá' }),
  plano('s2', 'c24b', '1'),
];
const takesC = [take('k1', 's1', 1), take('k2', 's1', 2), take('k3', 's2', 1)];
const dadosC = [
  { ...base, id: 'd1', takeId: 'k1', selected: true, status: 'CIRCLE', hasIssue: true, issue: 'Copo na mão esquerda', dialogueChanges: 'Cortou a última fala' },
  { ...base, id: 'd2', takeId: 'k2', selected: false, hasIssue: true },
  { ...base, id: 'd3', takeId: 'k3', selected: false, issue: 'Relógio sumiu' },
];
const fonteC = { cenas: cenasC, setups: setupsC, takes: takesC, dados: dadosC, camera: [], som: [] };
const linhasC = linhasDaContinuidade(fonteC);

ok('o take com problema é marcado', linhasC[0].problema && linhasC[0].problemaDescricao === 'Copo na mão esquerda');
ok('descrição sem a marca não conta: desmarcar tira do relatório', !linhasC[2].problema);
ok('take sem nada não tem problema', linhasDaContinuidade({ ...fonteC, dados: [] }).every((l) => !l.problema));
ok('o print continua independente do problema', linhasC[0].print && linhasC[0].problema);
ok('o enquadramento sai do plano', linhasC[0].enquadramento === 'Close · Plongée — João no sofá');
ok('plano sem descrição não imprime travessão sozinho', enquadramentoDoPlano(setupsC[1]) === '');
ok('as contagens contam takes com problema', contagensDoDia(fonteC).comProblema === 2);

const pendencias = pendenciasDoDia(linhasC);
ok('pendências: uma por take com problema', pendencias.length === 2);
ok('problema sem descrição vira aviso explícito', pendencias[1].texto.includes('sem descrição'));

const notas = [
  { ...base, id: 'n1', sceneId: 'c24a', category: 'OLHAR', note: 'Olha para a janela' },
  { ...base, id: 'n2', takeId: 'k2', category: 'DIALOGO', note: 'Trocou "nunca" por "jamais"' },
  { ...base, id: 'n3', setupId: 's1', category: 'ATORES', note: 'Maria à esquerda' },
  { ...base, id: 'n4', sceneId: 'c30', category: 'OUTRO', note: 'Cena de outra diária' },
  { ...base, id: 'n5', sceneId: 'c24a', category: 'OUTRO', note: 'apagada', deletedAt: '2026-11-12T10:00:00Z' },
  { ...base, id: 'n6', sceneId: 'c24a', category: 'OUTRO', note: '   ' },
];
const fotos = [
  { ...base, id: 'f1', takeId: 'k1', category: 'OBJETOS', caption: 'Copo' },
  { ...base, id: 'f2', sceneId: 'c24b', category: 'FIGURINO', caption: '' },
];
const estado = [
  {
    titulo: 'Figurino',
    chave: 'character',
    campos: ['outfit', 'state'],
    itens: [{ ...base, id: 'w1', sceneId: 'c24a', character: 'João', outfit: 'Camisa azul', notes: 'manga dobrada' }],
  },
];

const raccord = raccordDoDia({ cenas: cenasC, setups: setupsC, takes: takesC, notas, fotos, estado });
ok('raccord só das cenas desta diária', raccord.length === 1 && raccord[0].cena === '24');
ok('nota apagada e nota vazia não entram', raccord[0].notas.length === 3);
ok('a nota da cena vem antes da do plano, e a do plano antes da do take', raccord[0].notas.map((n) => n.id).join(',') === 'n1,n3,n2');
ok('o "onde" diz o nível e o caminho', raccord[0].notas[2].onde === 'Take 24A/1/2' && raccord[0].notas[1].onde === 'Plano 24A/1');
ok('a categoria sai em rótulo', raccord[0].notas[0].categoria === 'Direção do olhar');
ok('foto do bloco B entra na mesma cena 24', raccord[0].fotos.length === 2);
ok('o estado do set entra em texto', raccord[0].estado[0].texto === 'João: Camisa azul · manga dobrada');

const dialogos = alteracoesDeDialogo(linhasC, raccord);
ok('alterações de diálogo: as do take e as das notas', dialogos.length === 2);
ok('a do take leva o rótulo do campo', dialogos[0].texto.startsWith('Alterações de diálogo:'));

ok('nível do escopo: take ganha de plano e de cena', nivelDoEscopo({ sceneId: 'a', takeId: 'b' }) === 'TAKE');
ok('categoria desconhecida sai como veio', rotuloDaCategoriaDeNota('XPTO') === 'XPTO');
ok('sem categoria é dito', rotuloDaCategoriaDeFoto(null) === 'Sem categoria');

// ---- Fotos: compressão (ADR-042) ----

const alvo = dimensoesAlvo(4032, 3024);
ok('foto de celular cai para 1600 no lado maior', alvo.largura === 1600 && alvo.altura === 1200);
ok('retrato também', dimensoesAlvo(3024, 4032).altura === 1600);
ok('foto pequena nunca é ampliada', dimensoesAlvo(800, 600).largura === 800);
ok('dimensão inválida não explode', dimensoesAlvo(0, 100).largura === 0);
ok('o teto do servidor é folgado para 1600 px, apertado para foto crua', FOTO_MAX_BYTES >= 1_000_000 && FOTO_MAX_BYTES < 4_000_000);

// ---- Contrato de sync e migração ----

// Precedente da Fase 7 (synchronization.md §2): entidade nova não incrementa — o cliente
// antigo ignora o tipo e a refixação recupera o resto. Incrementar travaria quem está em set.
ok('o protocolo não incrementa por entidade nova', SYNC_PROTOCOL === 3);
ok(
  'as três entidades novas estão no registro, com as tabelas certas',
  SYNC_ENTITIES.soundRoll.table === 'sound_rolls' &&
    SYNC_ENTITIES.continuityNote.table === 'continuity_notes' &&
    SYNC_ENTITIES.continuityPhoto.table === 'continuity_photos',
);
ok('o pull reconhece as tabelas novas', ENTITY_BY_TABLE.sound_rolls === 'soundRoll' && ENTITY_BY_TABLE.continuity_photos === 'continuityPhoto');
ok(
  'os campos novos sincronizam',
  SYNC_ENTITIES.soundTakeData.fields.issues === 'text' &&
    SYNC_ENTITIES.soundTakeTrack.fields.pickup === 'text' &&
    SYNC_ENTITIES.continuityTakeData.fields.hasIssue === 'bool' &&
    SYNC_ENTITIES.soundDayConfig.fields.recorder === 'text',
);
ok('os bytes da foto não são campo sincronizável', !('dataBase64' in SYNC_ENTITIES.continuityPhoto.fields));
ok('a blob da foto não está no registro', !ENTITY_BY_TABLE.continuity_photo_blobs);

const migracao = readFileSync('drizzle/0010_tres_departamentos.sql', 'utf8');
// "ON DELETE cascade" das FKs é cláusula de constraint, não instrução — o que não pode
// existir é DROP de qualquer coisa ou um DELETE/TRUNCATE começando instrução.
ok(
  'a migração não apaga nada',
  !/\bDROP\b/i.test(migracao) && !/(^|;|\n)\s*(DELETE|TRUNCATE)\b/i.test(migracao),
);
ok('a migração não muda o tipo de coluna existente', !/ALTER COLUMN/i.test(migracao));
ok('coluna NOT NULL nova nasce com default', /"has_issue" boolean DEFAULT false NOT NULL/.test(migracao));
ok(
  'as três tabelas sincronizáveis têm trigger de sync_log',
  ['sound_rolls', 'continuity_notes', 'continuity_photos'].every((t) =>
    migracao.includes(`"${t}_sync_log"`),
  ),
);
ok('os bytes da foto ficam sem trigger', !migracao.includes('continuity_photo_blobs_sync_log'));

// ---- Resultado ----

let falhas = 0;
for (const check of checks) {
  if (check.pass) console.log(`✓ ${check.name}`);
  else {
    falhas += 1;
    console.error(`✗ ${check.name}`);
  }
}
console.log(`\n${checks.length - falhas}/${checks.length} checks passaram.`);
if (falhas > 0) process.exit(1);
