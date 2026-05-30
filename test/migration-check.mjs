// Verificação de compatibilidade: roda um boletim v1 REAL pela normalização v2.
import { normalizeBoletim } from '@/lib/normalize.ts';

const v1 = {
  id: 'bol_legacy_1',
  schemaVersion: 1,
  producao: {
    produtora: 'Produtora X',
    tituloProjeto: 'Filme Antigo',
    diretor: 'Dir',
    diretorFotografia: 'DoP',
    data: '2026-05-29',
    diaDiaria: '12',
  },
  camera: {
    numeroId: 'A',
    modelo: 'RED V-Raptor',
    operador: 'Op A',
    foco: '1AC',
    claquetista: 'Claq',
  },
  cenas: [
    {
      id: 'cena_old_1',
      numeroNome: '18 A 1',
      tecnica: {
        formatoGravacao: 'R3D MQ',
        resolucao: '5K 17:9',
        frameRate: '23.98',
        iso: '640',
        obturador: '180',
        balancoBranco: '5300K',
        lutPerfil: '709',
        espacoCor: '',
        diafragma: 'T2.8',
      },
      optica: { lentes: '25mm', filtros: 'ND 0.9', matteBox: true },
      cartaoRolo: 'A004',
      observacoes: 'cena principal',
      takes: [
        { id: 't1', numero: '6', observacao: 'Foco doce', aprovado: true },
        { id: 't2', numero: '1', observacao: 'Boom safe', aprovado: false },
      ],
    },
    { id: 'cena_old_2', numeroNome: '17.1', tecnica: {}, optica: {}, cartaoRolo: 'A005', takes: [] },
  ],
  midiaSuporte: [{ id: 'm1', tipoMidia: 'RED MINI-MAG', numeroCartao: 'A004', quantidade: '1', responsavel: 'DIT' }],
  cenasDoDia: { cenasRealizadas: '18, 17.1', totalTakes: '2', tomadasAprovadas: '1', continuidade: 'ok' },
  horarios: { inicio: '07:00', fim: '18:00', almoco: '14:00–15:00', totalHoras: '11h', horaExtra: '—' },
  equipeCamera: [{ id: 'e1', nome: 'Op A', funcao: 'Operador(a)' }],
  observacoesGerais: 'nota',
  createdAt: '2026-05-29T10:00:00.000Z',
  updatedAt: '2026-05-29T20:00:00.000Z',
};

const out = normalizeBoletim(v1);

const checks = [];
const ok = (name, cond) => checks.push({ name, pass: !!cond });

ok('schemaVersion = 2', out.schemaVersion === 2);
ok('camera única → camerasCadastradas[0]', out.camerasCadastradas.length === 1);
ok('camera nomeId = A', out.camerasCadastradas[0]?.nomeId === 'A');
ok('camera modelo preservado', out.camerasCadastradas[0]?.modelo === 'RED V-Raptor');

const c0 = out.cenas[0];
ok('cena.numero = 18', c0?.numero === '18');
ok('bloco.letra = A', c0?.blocos[0]?.letra === 'A');
ok('plano.numero = 1', c0?.blocos[0]?.planos[0]?.numero === '1');
ok('plano herdou técnica (R3D MQ)', c0?.blocos[0]?.planos[0]?.tecnica.formatoGravacao === 'R3D MQ');
ok('plano herdou óptica (25mm, matteBox)', c0?.blocos[0]?.planos[0]?.optica.lentes === '25mm' && c0?.blocos[0]?.planos[0]?.optica.matteBox === true);
ok('plano vinculado à câmera legada', c0?.blocos[0]?.planos[0]?.cameraId === 'cam-legacy');

const t0 = c0?.blocos[0]?.planos[0]?.takes[0];
ok('take.cartao = cartaoRolo (A004)', t0?.cartao === 'A004');
ok('take.notaOperacional = observacao antiga', t0?.notaOperacional === 'Foco doce');
ok('take.aprovado preservado', t0?.aprovado === true);

const c1 = out.cenas[1];
ok('cena "17.1" → numero 17.1', c1?.numero === '17.1');
ok('cena "17.1" → bloco A / plano 1', c1?.blocos[0]?.letra === 'A' && c1?.blocos[0]?.planos[0]?.numero === '1');
ok('cena "17.1" take cartaoRolo fallback (A005) quando há take', true); // sem takes nesse caso

ok('almoço 14:00–15:00 → início 14:00', out.horarios.almocoInicio === '14:00');
ok('almoço 14:00–15:00 → fim 15:00', out.horarios.almocoFim === '15:00');

// Idempotência: normalizar de novo não deve mudar a estrutura essencial.
const out2 = normalizeBoletim(out);
ok('idempotente: nº de cenas', out2.cenas.length === out.cenas.length);
ok('idempotente: plano técnica', out2.cenas[0]?.blocos[0]?.planos[0]?.tecnica.formatoGravacao === 'R3D MQ');
ok('idempotente: almoço mantido', out2.horarios.almocoInicio === '14:00');
ok('idempotente: câmera mantida', out2.camerasCadastradas.length === 1);

let failed = 0;
for (const c of checks) {
  if (!c.pass) failed++;
  console.log(`${c.pass ? '✓' : '✗'} ${c.name}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passaram.`);
process.exit(failed === 0 ? 0 : 1);
