/**
 * Auditoria de acessibilidade que dá para automatizar (Fase 10).
 *
 * Boa parte de acessibilidade não é automatizável — ordem de leitura, rótulo que faz
 * sentido, se o fluxo dá para ser percorrido só com o dedo. O que **é** automatizável é
 * justamente o que volta sozinho: alguém pega uma classe do arquivo ao lado, e o cinza
 * que falha contraste se espalha de novo pela tela inteira.
 *
 * Não precisa de rede nem de navegador — lê os arquivos e faz contas. Por isso entra em
 * `npm test`.
 *
 * O contexto importa para o número: isto é um telefone segurado ao sol, numa locação, por
 * alguém que precisa ler o cartão da câmera entre dois takes. Contraste aqui não é
 * conformidade, é conseguir trabalhar.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

// ---- Contraste ----

/** Luminância relativa (WCAG 2.1, 1.4.3). */
function luminancia(hex) {
  const canais = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

function contraste(a, b) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

/** Os fundos escuros do tema (`tailwind.config.ts`). */
const FUNDOS = {
  ink: '#08090b',
  surface: '#121317',
  'surface-raised': '#1a1c22',
  'surface-hover': '#22242c',
};

const CINZAS = {
  'zinc-100': '#f4f4f5',
  'zinc-200': '#e4e4e7',
  'zinc-300': '#d4d4d8',
  'zinc-400': '#a1a1aa',
  'zinc-500': '#71717a',
  'zinc-600': '#52525b',
};

/** 4.5:1 é o mínimo de AA para texto pequeno, que é quase todo o texto secundário aqui. */
const AA = 4.5;

// ---- Varredura de arquivos ----

function tsx(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) tsx(caminho, acc);
    else if (nome.endsWith('.tsx')) acc.push(caminho);
  }
  return acc;
}

const arquivos = ['app', 'components', 'features'].flatMap((dir) => tsx(dir));

/**
 * As folhas impressas são **superfície clara** (`bg-white text-zinc-900`).
 *
 * Nelas o mesmo `text-zinc-500` é escuro sobre branco e passa com folga — trocar por um
 * cinza mais claro tornaria o papel ilegível. É o tipo de detalhe que uma substituição
 * cega quebraria em silêncio, e só apareceria na impressora de alguém.
 */
const SUPERFICIE_CLARA = [
  'FolhaCamera.tsx',
  'FolhaSom.tsx',
  'FolhaContinuidade.tsx',
  'FolhaConsolidada.tsx',
  'BoletimView.tsx',
];

const noEscuro = arquivos.filter(
  (caminho) => !SUPERFICIE_CLARA.some((folha) => caminho.endsWith(folha)),
);

function run() {
  // ---- 1. Os cinzas que a interface escura tem direito de usar ----

  const piorFundo = FUNDOS['surface-hover'];

  check(
    'zinc-400 passa AA em todos os fundos escuros',
    Object.values(FUNDOS).every((fundo) => contraste(CINZAS['zinc-400'], fundo) >= AA),
    ` (${contraste(CINZAS['zinc-400'], piorFundo).toFixed(2)}:1 no pior fundo)`,
  );

  // A conta que motivou a varredura: `zinc-500` **não** passa em nenhum deles.
  check(
    'zinc-500 reprova AA — por isso ele não é cor de texto no escuro',
    Object.values(FUNDOS).every((fundo) => contraste(CINZAS['zinc-500'], fundo) < AA),
    ` (${contraste(CINZAS['zinc-500'], FUNDOS.ink).toFixed(2)}:1 até no fundo mais escuro)`,
  );

  check(
    'os cinzas de texto em uso passam AA',
    ['zinc-100', 'zinc-200', 'zinc-300', 'zinc-400'].every((token) =>
      Object.values(FUNDOS).every((fundo) => contraste(CINZAS[token], fundo) >= AA),
    ),
  );

  // ---- 2. Nenhuma tela escura voltou a usar os cinzas que reprovam ----

  const comCinzaFraco = noEscuro.filter((caminho) => {
    const fonte = readFileSync(caminho, 'utf8');
    // `placeholder:` é dica dentro do campo, não conteúdo: sai da conta de propósito.
    const semPlaceholder = fonte.replace(/placeholder:text-zinc-\d{3}/g, '');
    return /text-zinc-(500|600)\b/.test(semPlaceholder);
  });

  check(
    'nenhuma tela de fundo escuro usa cinza que reprova contraste',
    comCinzaFraco.length === 0,
    comCinzaFraco.length ? ` (${comCinzaFraco.join(', ')})` : '',
  );

  // A exceção é declarada, não esquecida: as folhas continuam com o cinza escuro.
  const folhasComCinzaEscuro = arquivos.filter(
    (caminho) =>
      SUPERFICIE_CLARA.some((folha) => caminho.endsWith(folha)) &&
      /text-zinc-500\b/.test(readFileSync(caminho, 'utf8')),
  );

  check(
    'as folhas impressas mantêm o cinza escuro, que é o certo sobre branco',
    folhasComCinzaEscuro.length === SUPERFICIE_CLARA.length,
    ` (${folhasComCinzaEscuro.length} folhas)`,
  );

  check(
    'zinc-500 sobre o branco do papel passa AA',
    contraste(CINZAS['zinc-500'], '#ffffff') >= AA,
    ` (${contraste(CINZAS['zinc-500'], '#ffffff').toFixed(2)}:1)`,
  );

  // ---- 3. Marco de conteúdo em toda tela da plataforma ----

  const telasDaPlataforma = arquivos.filter(
    (caminho) =>
      caminho.includes(join('app', '(app)')) && caminho.endsWith(`${'page'}.tsx`),
  );

  const semMarco = telasDaPlataforma.filter((caminho) => {
    const fonte = readFileSync(caminho, 'utf8');
    return fonte.includes('<PageContainer') && !fonte.includes('as="main"');
  });

  // Sem `<main>`, quem navega por leitor de tela não tem para onde pular: cai no topo e
  // percorre o cabeçalho de novo a cada troca de rota.
  check(
    'toda tela da plataforma marca o conteúdo com <main>',
    semMarco.length === 0,
    semMarco.length ? ` (${semMarco.join(', ')})` : '',
  );
  check('há telas da plataforma para conferir', telasDaPlataforma.length >= 15);

  // ---- 4. Detalhes que somem numa refatoração distraída ----

  const icones = readFileSync(join('components', 'ui', 'icons.tsx'), 'utf8');
  check('os ícones são decorativos e escondidos do leitor de tela', icones.includes('aria-hidden="true"'));

  const css = readFileSync(join('app', 'globals.css'), 'utf8');
  check(
    'quem pede menos movimento recebe menos movimento',
    css.includes('prefers-reduced-motion'),
  );

  const sectionCard = readFileSync(join('components', 'layout', 'SectionCard.tsx'), 'utf8');
  // Cabeçalho por fora, botão por dentro. Ao contrário, o cartão recolhível deixa de ser
  // cabeçalho — e a tela de diária, que é quase só eles, vira uma lista sem estrutura.
  check(
    'cartão recolhível continua sendo um cabeçalho',
    /<h2>\s*<button/.test(sectionCard),
  );

  const indicador = readFileSync(join('features', 'sync', 'SyncIndicator.tsx'), 'utf8');
  check(
    'o estado do sync é anunciado, e sem interromper',
    indicador.includes('role="status"') && indicador.includes('aria-live="polite"'),
  );

  // ---- 5. Alvo de toque: o app é usado em pé, no set, com pressa ----

  const iconButton = readFileSync(join('components', 'ui', 'IconButton.tsx'), 'utf8');
  check('botão de ícone tem 44px', iconButton.includes('h-11 w-11'));

  const searchInput = readFileSync(join('components', 'ui', 'SearchInput.tsx'), 'utf8');
  check('o botão de limpar a busca tem 44px', searchInput.includes('h-11 w-11'));
}

try {
  run();
} catch (error) {
  failed += 1;
  console.error('✗ erro inesperado:', error.message);
}

console.log(`\n${passed}/${passed + failed} checks passaram.`);
process.exit(failed === 0 ? 0 : 1);
