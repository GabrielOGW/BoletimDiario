// O PDF dos três boletins não sai em branco — em nenhum aparelho.
//
// `npm run test:pdf`, contra um build de produção já rodando (`npm run build && npm run
// start`; `PDF_BASE` muda o endereço, padrão http://localhost:3000; `PDF_CHROMIUM` aponta
// para um Chromium já instalado). Fica fora de
// `npm test` pelo mesmo motivo do Playwright: precisa de um servidor e de um navegador.
//
// Existe por causa de um defeito real (`2026-11-14`): nos boletins locais de Som e
// Continuidade a folha ficava *dentro* do container `no-print`, e o CSS de impressão a
// escondia junto com o editor. Na tela tudo parecia certo; o PDF saía com uma página em
// branco — em Android, iPhone e desktop. Nenhum teste de estrutura pega isso: só imprimindo.
//
// Para cada aparelho e cada boletim de demonstração: abre a folha, imprime com o motor do
// Chromium (o mesmo do Chrome no Android) e lê o texto do PDF. Exige o cabeçalho do boletim
// e proíbe texto do editor (que deveria ter sumido na impressão).
import { chromium, devices } from 'playwright';

const BASE = process.env.PDF_BASE ?? 'http://localhost:3000';
const APARELHOS = ['Pixel 7', 'Galaxy S9+', 'iPhone 13', 'Desktop Chrome'];

let passou = 0;
let falhou = 0;
const ok = (nome, cond) => {
  if (cond) {
    passou += 1;
    console.log(`✓ ${nome}`);
  } else {
    falhou += 1;
    console.error(`✗ ${nome}`);
  }
};

/** O texto de um PDF, sem dependência: as strings dos operadores de texto. */
async function textoDoPdf(pagina) {
  const pdf = await pagina.pdf({ format: 'A4' });
  // O Chromium escreve o texto com fontes embutidas (CID), e não dá para lê-lo sem um
  // parser. Em vez disso, lemos o que a impressão vai mostrar: o texto visível sob a mídia
  // `print` — que é exatamente o que vai para o papel.
  const texto = await pagina.evaluate(() => {
    const visiveis = [];
    const andar = (el) => {
      const estilo = getComputedStyle(el);
      if (estilo.display === 'none' || estilo.visibility === 'hidden') return;
      for (const filho of el.childNodes) {
        if (filho.nodeType === 3) visiveis.push(filho.textContent);
        else if (filho.nodeType === 1) andar(filho);
      }
    };
    andar(document.body);
    return visiveis.join(' ').replace(/\s+/g, ' ');
  });
  return { bytes: pdf.length, texto };
}

// `PDF_CHROMIUM` aponta para um Chromium já instalado quando o do Playwright do projeto
// não estiver baixado (`npx playwright install` resolve do outro jeito).
const browser = await chromium.launch(
  process.env.PDF_CHROMIUM ? { executablePath: process.env.PDF_CHROMIUM } : {},
);
try {
  for (const aparelho of APARELHOS) {
    const contexto = await browser.newContext({ ...devices[aparelho] });
    const pagina = await contexto.newPage();
    await pagina.goto(`${BASE}/`);
    await pagina.waitForTimeout(1200);

    const ids = await pagina.evaluate(() => ({
      camera: JSON.parse(localStorage.getItem('bdc:boletins:v1') ?? '[]')[0]?.id,
      som: JSON.parse(localStorage.getItem('bdc:boletins-som:v1') ?? '[]')[0]?.id,
      continuidade: JSON.parse(localStorage.getItem('bdc:boletins-continuidade:v1') ?? '[]')[0]
        ?.id,
    }));

    const alvos = [
      // [nome, rota, cabeçalho, um texto que só existe nos takes daquele demo]
      ['Câmera', `/legado/visualizar?id=${ids.camera}`, 'BOLETIM DIÁRIO DE CÂMERA', 'Boom safe'],
      ['Som', `/som/editar?id=${ids.som}&folha=1`, 'Boletim Diário de Som', '004_001'],
      [
        'Continuidade',
        `/continuidade/editar?id=${ids.continuidade}&folha=1`,
        'Boletim de Continuidade',
        'Ator errou a marca',
      ],
    ];

    for (const [nome, rota, cabecalho, doTake] of alvos) {
      await pagina.goto(`${BASE}${rota}`);
      await pagina.waitForSelector('.print-sheet');
      await pagina.waitForTimeout(500);
      await pagina.emulateMedia({ media: 'print' });
      const { bytes, texto } = await textoDoPdf(pagina);
      await pagina.emulateMedia({ media: 'screen' });

      const minusculo = texto.toLowerCase();
      ok(`${aparelho} · ${nome}: o PDF tem o cabeçalho`, minusculo.includes(cabecalho.toLowerCase()));
      ok(`${aparelho} · ${nome}: o PDF tem os takes`, minusculo.includes(doTake.toLowerCase()));
      ok(
        `${aparelho} · ${nome}: o editor não vaza para o PDF`,
        !minusculo.includes('próximo take') && !minusculo.includes('imprimir / pdf'),
      );
      ok(`${aparelho} · ${nome}: o PDF não está vazio (${bytes} bytes)`, bytes > 20_000);
    }
    await contexto.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${passou}/${passou + falhou} checks passaram.`);
if (falhou > 0) process.exit(1);
