// A folha impressa do boletim legado: padrão da diária, ajustes por plano,
// identificação curta e a régua de takes.
//
// O que está sendo testado é uma promessa de papel: nada do que foi anotado some,
// e nada que se repete o dia inteiro é impresso duas vezes. Uma diária real de 21
// planos saía em oito páginas porque cada plano reimprimia a mesma configuração.
import {
  ajustesDoPlano,
  identDoPlano,
  montaFolha,
  padraoDaDiaria,
  padraoImpresso,
  valorDoCampo,
} from '@/features/boletins/folha.ts';

const checks = [];
const ok = (name, cond) => checks.push({ name, pass: !!cond });

let seq = 0;
const uid = () => `id${++seq}`;

const TECNICA = {
  formatoGravacao: 'opengate',
  resolucao: '6K 4:3',
  frameRate: '24',
  iso: '400',
  obturador: '180',
  balancoBranco: '5600K',
  lutPerfil: 'tnb 2',
  espacoCor: '',
  diafragma: 'T2.9',
};
const OPTICA = { lentes: '35mm', filtros: '', matteBox: true };

const plano = ({ tecnica, optica, ...over } = {}) => ({
  id: uid(),
  numero: '',
  tipo: 'Normal',
  cameraId: '',
  cameraNome: 'Black Magic',
  tecnica: { ...TECNICA, ...tecnica },
  optica: { ...OPTICA, ...optica },
  observacoes: '',
  takes: [],
  ...over,
});

const take = (numero, over = {}) => ({
  id: uid(),
  numero,
  cartao: '',
  clipSync: '',
  notaOperacional: '',
  aprovado: false,
  ...over,
});

const boletim = (cenas, over = {}) => ({
  id: 'bol',
  schemaVersion: 2,
  producao: {
    produtora: '',
    tituloProjeto: 'Amigo Gay',
    diretor: '',
    diretorFotografia: '',
    data: '2026-08-15',
    diaDiaria: '01',
  },
  camerasCadastradas: [],
  cenas,
  midiaSuporte: [],
  cenasDoDia: {
    cenasRealizadas: '',
    totalTakes: '',
    tomadasAprovadas: '',
    continuidade: '',
  },
  horarios: {
    inicio: '',
    fim: '',
    almocoInicio: '',
    almocoFim: '',
    almoco: '',
    totalHoras: '',
    horaExtra: '',
  },
  equipeCamera: [],
  observacoesGerais: '',
  createdAt: '',
  updatedAt: '',
  ...over,
});

const cena = (numero, blocos) => ({ id: uid(), numero, blocos });
const bloco = (letra, planos) => ({ id: uid(), letra, planos });

// ---- Leitura crua dos campos ----

const base = plano();
ok('campo técnico simples é lido', valorDoCampo(base, 'frameRate') === '24');
ok('lente vem da óptica', valorDoCampo(base, 'lentes') === '35mm');
ok('matte box vira sim/nao comparável', valorDoCampo(base, 'matteBox') === 'sim');
ok(
  'campo em branco é string vazia, não espaço',
  valorDoCampo(plano({ tecnica: { iso: '   ' } }), 'iso') === '',
);

// ---- Padrão da diária ----

const cinco = [
  plano(),
  plano(),
  plano(),
  plano({ tecnica: { frameRate: '48' } }),
  plano({ tecnica: { frameRate: '48' } }),
];
const padraoCinco = padraoDaDiaria(cinco);
ok('a maioria define o padrão de fps', padraoCinco.get('frameRate') === '24');
ok('campo idêntico em todos entra no padrão', padraoCinco.get('iso') === '400');
// Se o dia se divide ao meio, não existe "padrão" — dizer que existe seria mentir
// sobre metade da diária.
const meioAMeio = padraoDaDiaria([
  plano({ tecnica: { frameRate: '24' } }),
  plano({ tecnica: { frameRate: '48' } }),
]);
ok('empate não gera padrão', meioAMeio.has('frameRate') === false);
ok('empate não contamina os outros campos', meioAMeio.get('iso') === '400');
// Um único plano não tem do que ser exceção.
ok('diária de um plano não tem padrão', padraoDaDiaria([plano()]).size === 0);
ok('diária vazia não tem padrão', padraoDaDiaria([]).size === 0);
// Campo que ninguém preencheu não vira linha de padrão.
ok('campo vazio em todos fica fora do padrão', padraoCinco.has('espacoCor') === false);
// Dois planos com o mesmo valor entre cinco não são maioria.
const minoria = padraoDaDiaria([
  plano({ optica: { lentes: '35mm' } }),
  plano({ optica: { lentes: '35mm' } }),
  plano({ optica: { lentes: '50mm' } }),
  plano({ optica: { lentes: '75mm' } }),
  plano({ optica: { lentes: '18mm' } }),
]);
ok('valor mais comum sem maioria não vira padrão', minoria.has('lentes') === false);

const impresso = padraoImpresso(padraoCinco);
const textos = impresso.map((c) => c.texto);
ok('fps é impresso com unidade', textos.includes('24 fps'));
ok('iso é impresso com rótulo', textos.includes('ISO 400'));
ok('obturador é impresso em graus', textos.includes('180°'));
ok('matte box entra como marca positiva', textos.includes('Matte Box'));
// "sem", sozinho numa lista de valores técnicos, não diz sem o quê.
ok(
  'filtro ausente é escrito por extenso',
  padraoImpresso(padraoDaDiaria([plano({ optica: { filtros: 'sem' } }), plano({ optica: { filtros: 'sem' } })]))
    .map((c) => c.texto)
    .includes('sem filtro'),
);
ok(
  'nome de filtro é impresso como está',
  ajustesDoPlano(plano({ optica: { filtros: 'gg1/4' } }), new Map()).includes('gg1/4'),
);
// A ordem é a da conferência de câmera, não a do formulário.
ok(
  'o padrão sai na ordem de leitura da câmera',
  textos.indexOf('opengate') < textos.indexOf('24 fps') &&
    textos.indexOf('24 fps') < textos.indexOf('ISO 400') &&
    textos.indexOf('ISO 400') < textos.indexOf('35mm'),
);

// ---- Ajustes por plano ----

ok(
  'plano igual ao padrão não imprime nada',
  ajustesDoPlano(plano(), padraoCinco).length === 0,
);
ok(
  'só o campo que difere é impresso',
  ajustesDoPlano(plano({ tecnica: { frameRate: '48' } }), padraoCinco).join('|') ===
    '48 fps',
);
ok(
  'dois campos diferentes saem juntos',
  ajustesDoPlano(
    plano({ tecnica: { frameRate: '48', obturador: '270' } }),
    padraoCinco,
  ).join(' · ') === '48 fps · 270°',
);
// O travessão em campo vazio foi o que encheu as oito páginas.
ok(
  'campo em branco não vira ajuste',
  ajustesDoPlano(plano({ tecnica: { iso: '' } }), padraoCinco).length === 0,
);
// Tirar o matte box num dia que usa matte box é decisão de câmera e precisa aparecer.
ok(
  'ausência de matte box aparece quando o padrão é ter',
  ajustesDoPlano(plano({ optica: { matteBox: false } }), padraoCinco).join('|') ===
    'sem Matte Box',
);
// Sem padrão para comparar, "sem Matte Box" em toda linha seria ruído.
ok(
  'sem padrão, matte box ausente fica calado',
  ajustesDoPlano(plano({ optica: { matteBox: false } }), new Map()).includes(
    'sem Matte Box',
  ) === false,
);
ok(
  'sem padrão, tudo que está preenchido é impresso',
  ajustesDoPlano(plano(), new Map()).join(' · ') ===
    'opengate · 6K 4:3 · 24 fps · 180° · ISO 400 · T2.9 · 5600K · 35mm · Matte Box · tnb 2',
);

// ---- Identificação curta ----

ok('letra e número aparecem juntos', identDoPlano('A', '3', null, null, 1) === 'A · 3');
// Repetir "Bloco A" em treze planos de uma cena que só tem o bloco A não separa nada.
ok(
  'a letra some quando a cena inteira é do mesmo bloco',
  identDoPlano('A', '1.11', 'A', null, 1) === '1.11',
);
// Idem para o número: se todo bloco da cena tem o "plano 2", quem separa é a letra.
ok(
  'o número some quando é o mesmo em toda a cena',
  identDoPlano('D', '2', null, '2', 1) === 'D',
);
ok('sem número, resta a letra', identDoPlano('B', '', null, null, 1) === 'B');
ok('número igual à letra não é duplicado', identDoPlano('A', 'A', null, null, 1) === 'A');
// Nenhum plano fica sem identificação: a posição é o último recurso.
ok('sem letra e sem número, vale a posição', identDoPlano('', '', null, null, 4) === '#4');
ok(
  'espaços em branco não viram identificação',
  identDoPlano('  ', '  ', null, null, 2) === '#2',
);

// ---- A folha completa ----

const diaria = boletim([
  cena('2.1', [
    bloco('A', [
      plano({ numero: '1', takes: [take('1'), take('2', { aprovado: true })] }),
      plano({
        numero: '2',
        optica: { lentes: '50mm' },
        takes: [take('1', { notaOperacional: 'estava sem slow' })],
      }),
    ]),
  ]),
  cena('1.2', [
    bloco('A', [plano({ numero: '1.1', takes: [take('1', { cartao: 'B007' })] })]),
    bloco('B', [plano({ numero: '1.2', takes: [] })]),
  ]),
]);
const folha = montaFolha(diaria);

// A ordem de preenchimento é a ordem de filmagem; reordenar por número diria que a
// diária aconteceu de outro jeito.
ok(
  'as cenas saem na ordem de filmagem',
  folha.cenas.map((c) => c.numero).join(',') === '2.1,1.2',
);
ok('cena com um bloco só anuncia o bloco no cabeçalho', folha.cenas[0].blocoUnico === 'A');
ok('cena com blocos diferentes não anuncia bloco', folha.cenas[1].blocoUnico === null);
ok(
  'com bloco único a identificação é só o número do plano',
  folha.cenas[0].itens.map((i) => i.ident).join(',') === '1,2',
);
ok(
  'com blocos diferentes a letra volta',
  folha.cenas[1].itens.map((i) => i.ident).join(',') === 'A · 1.1,B · 1.2',
);
// A cena real: seis blocos distintos, todos com o mesmo "plano 2" — a OD escreve
// "1.2 - A", não "1.2 - A - 2".
const mesmoNumero = montaFolha(
  boletim([
    cena('1.2', [
      bloco('A', [plano({ numero: '2' })]),
      bloco('D', [plano({ numero: '2' })]),
      bloco('J', [plano({ numero: '2' })]),
    ]),
  ]),
);
ok(
  'número repetido na cena inteira sai da identificação',
  mesmoNumero.cenas[0].itens.map((i) => i.ident).join(',') === 'A,D,J',
);
// Com bloco único e número único a identificação sumiria por inteiro.
const tudoIgual = montaFolha(
  boletim([
    cena('9', [bloco('A', [plano({ numero: '2' }), plano({ numero: '2' })])]),
  ]),
);
ok(
  'com bloco e número iguais o número é mantido',
  tudoIgual.cenas[0].itens.map((i) => i.ident).join(',') === '2,2',
);

ok('planos são contados por cena', folha.cenas[0].planos === 2);
ok('takes são contados por cena', folha.cenas[0].takes === 3);
ok('aprovados são contados por cena', folha.cenas[0].aprovados === 1);
ok('totais da diária batem', folha.totalPlanos === 4 && folha.totalTakes === 4);
ok('aprovados da diária batem', folha.totalAprovados === 1);

// Câmera única não se repete em 51 linhas de take.
ok('câmera única vira cabeçalho', folha.cameraUnica === 'Black Magic');
ok(
  'com câmera única o plano não repete o nome dela',
  folha.cenas[0].itens.every((i) => i.camera === null),
);
const multicam = montaFolha(
  boletim([
    cena('1', [
      bloco('A', [plano({ cameraNome: 'A' }), plano({ cameraNome: 'B' })]),
    ]),
  ]),
);
ok('multicam não tem câmera única', multicam.cameraUnica === null);
ok(
  'em multicam a câmera aparece no plano',
  multicam.cenas[0].itens.map((i) => i.camera).join(',') === 'A,B',
);

// Só take com conteúdo vira linha própria; o resto é a régua.
ok('take sem nada não gera detalhe', folha.cenas[0].itens[0].detalhes.length === 0);
ok('take com nota gera detalhe', folha.cenas[0].itens[1].detalhes.length === 1);
ok(
  'o detalhe carrega a nota',
  folha.cenas[0].itens[1].detalhes[0].nota === 'estava sem slow',
);
ok(
  'todo take entra na régua, com ou sem detalhe',
  folha.cenas[0].itens[0].takes.length === 2,
);
ok('o aprovado é marcado na régua', folha.cenas[0].itens[0].takes[1].aprovado === true);
ok('plano sem take não quebra', folha.cenas[1].itens[1].takes.length === 0);

// O cartão anotado no take precisa chegar ao inventário do dia.
ok('cartão do take entra na lista de cartões', folha.cartoes.join(',') === 'B007');
const comMidia = montaFolha(
  boletim(diaria.cenas, {
    midiaSuporte: [
      { id: 'm1', tipoMidia: 'CFX', numeroCartao: 'A001', quantidade: '1', responsavel: '' },
      { id: 'm2', tipoMidia: 'CFX', numeroCartao: 'B007', quantidade: '1', responsavel: '' },
    ],
  }),
);
ok('cartão do inventário se junta ao dos takes', comMidia.cartoes.join(',') === 'A001,B007');
ok('cartão repetido não é listado duas vezes', comMidia.cartoes.length === 2);

// Tipo de captação: "Normal" é o padrão de todo plano e não vira marca.
ok('tipo Normal não vira marca', folha.cenas[0].itens[0].tipo === null);
const serie = montaFolha(
  boletim([cena('1', [bloco('A', [plano({ tipo: 'Série' }), plano()])])]),
);
ok('tipo diferente de Normal vira marca', serie.cenas[0].itens[0].tipo === 'Série');

ok('diária vazia gera folha vazia', montaFolha(boletim([])).cenas.length === 0);
ok('diária vazia não inventa padrão', montaFolha(boletim([])).padrao.length === 0);

let failed = 0;
for (const c of checks) {
  if (!c.pass) failed++;
  console.log(`${c.pass ? '✓' : '✗'} ${c.name}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passaram.`);
process.exit(failed === 0 ? 0 : 1);
