// Os boletins locais de Som e Continuidade (ADR-043): sem conta, sem produção, sem diária.
//
// O que este arquivo segura:
//  - a normalização transforma qualquer JSON num boletim válido, é idempotente e não perde
//    campo — é o que protege o dado guardado no aparelho de uma versão futura do app;
//  - o take de som nasce preenchido (rolo, arquivo incrementado, canais herdados) e o de
//    continuidade nasce vazio;
//  - os dois boletins são lidos pelas **mesmas** estruturas da plataforma — rolos, canais,
//    problemas, raccord, pendências — e o CSV sai do mesmo `montaCSV`;
//  - as chaves de armazenamento não colidem com a do Boletim de Câmera.
import { readFileSync } from 'node:fs';

import {
  criaBoletimSom,
  criaCanal,
  criaCena,
  criaPlano,
  criaRolo,
  normalizaBoletimSom,
  proximoCodigoPlano,
  proximoTake,
  resumoSom,
} from '@/lib/local/som.ts';
import {
  criaBoletimContinuidade,
  criaCenaContinuidade,
  criaNota,
  criaPlanoContinuidade,
  idsDasFotos,
  normalizaBoletimContinuidade,
  proximoTakeContinuidade,
  resumoContinuidade,
} from '@/lib/local/continuidade.ts';
import { hojeISO, tituloDoBoletim } from '@/lib/local/comum.ts';
import { fonteDoBoletimSom } from '@/features/boletim-som/relatorio.ts';
import { leituraDoBoletimContinuidade } from '@/features/boletim-continuidade/relatorio.ts';
import {
  canaisDoDia,
  linhasDoRelatorio,
  resumoDoDia,
  rolosDoDia,
} from '@/features/sound/estrutura.ts';
import { montaCSV } from '@/features/sound/csv.ts';
import { alteracoesDeDialogo, pendenciasDoDia } from '@/features/continuity/estrutura.ts';

const checks = [];
const ok = (name, cond) => checks.push({ name, pass: !!cond });
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- Armazenamento ----

const store = readFileSync('lib/local/store.ts', 'utf8');
const constantes = readFileSync('lib/constants.ts', 'utf8');
const chaveCamera = constantes.match(/STORAGE_KEY = '([^']+)'/)?.[1];
const chaves = [...store.matchAll(/CHAVE_\w+ = '([^']+)'/g)].map((m) => m[1]);
ok('som e continuidade têm chave própria', chaves.length === 2 && chaves[0] !== chaves[1]);
ok(
  'nenhuma colide com a do Boletim de Câmera (normalizeBoletim viraria tudo câmera)',
  chaveCamera && !chaves.includes(chaveCamera),
);

// ---- Som: criação e normalização ----

const novo = criaBoletimSom();
ok('o boletim de som nasce com a data de hoje do aparelho', novo.producao.data === hojeISO());
ok('nasce com 48 kHz / 24 bits sugeridos', novo.tecnica.sampleRate === '48 kHz' && novo.tecnica.bitDepth === '24 bits');
ok('nasce sem cenas — sem produção, sem diária', novo.cenas.length === 0 && !('productionId' in novo));
ok('título vazio vira "Sem título"', tituloDoBoletim(novo) === 'Sem título');

const lixo = normalizaBoletimSom({ cenas: [{ planos: [{ takes: [{ canais: [{}], problemas: ['ADR', 3, ''] }] }] }], rolos: 'x' });
ok('JSON parcial vira boletim válido', lixo.cenas[0].planos[0].takes[0].numero === '1');
ok('lixo em lista vira lista vazia', igual(lixo.rolos, []));
ok('problema inválido é descartado, válido fica', igual(lixo.cenas[0].planos[0].takes[0].problemas, ['ADR', '3']));
ok('canal sem índice ganha o da posição', lixo.cenas[0].planos[0].takes[0].canais[0].indice === '1');
ok('normalizar é idempotente', igual(normalizaBoletimSom(lixo), lixo));
ok('null não explode', normalizaBoletimSom(null).cenas.length === 0);

// ---- Som: o take nasce preenchido ----

const som = criaBoletimSom();
som.producao.tituloProjeto = 'Filme X';
som.rolos = [{ ...criaRolo('004'), midia: 'SD #1', equipamento: '833' }];
const cena = criaCena('24A');
const plano = criaPlano('1');
cena.planos = [plano];
som.cenas = [cena];

const t1 = proximoTake(som, plano);
ok('o primeiro take é o 1', t1.numero === '1');
ok('sem take anterior, o rolo é o último cadastrado', t1.rolo === '004');
t1.arquivo = '004_001';
t1.canais = [
  { ...criaCanal(1), nome: 'Boom', microfone: 'MKH 416', captacao: 'Boom' },
  { ...criaCanal(2), nome: 'João', microfone: 'COS-11', captacao: 'Lapela' },
];
t1.julgamento = 'CIRCLE';
t1.problemas = ['ADR', 'RUIDO_EXTERNO'];
t1.obsProblemas = 'avião aos 20 s';
plano.takes.push(t1);

const t2 = proximoTake(som, plano);
ok('o próximo take é o 2', t2.numero === '2');
ok('herda o rolo', t2.rolo === '004');
ok('o arquivo vem incrementado', t2.arquivo === '004_002');
ok('herda os canais: nome, microfone e captação', igual(t2.canais.map((c) => [c.nome, c.microfone, c.captacao]), [['Boom', 'MKH 416', 'Boom'], ['João', 'COS-11', 'Lapela']]));
ok('os canais herdados são registros novos', t2.canais[0].id !== t1.canais[0].id);
ok('não herda julgamento nem problemas', t2.julgamento === '' && t2.problemas.length === 0 && !t2.obsProblemas);
t2.rolo = '005';
t2.arquivo = '005_001';
t2.natureza = 'MOS';
plano.takes.push(t2);

const plano2 = criaPlano(proximoCodigoPlano(cena));
ok('o próximo plano segue a numeração', plano2.codigo === '2');
const t3 = proximoTake(som, plano2);
ok('plano novo herda do último take do boletim', t3.rolo === '005' && t3.arquivo === '005_002');

const resumo = resumoSom(som);
ok('o resumo da lista conta takes, circled e problemas', resumo.takes === 2 && resumo.circled === 1 && resumo.comProblema === 1);

// ---- Som: a mesma leitura do sound report ----

const fonte = fonteDoBoletimSom(som);
const linhas = linhasDoRelatorio(fonte.fonte);
ok('uma linha por take, na ordem', linhas.length === 2 && linhas[0].take === 1);
ok('a cena "24A" sai inteira, sem bloco duplicado', linhas[0].cena === '24A' && linhas[0].bloco === '');
ok('circled chega ao relatório', linhas[0].circled && !linhas[1].circled);
ok('MOS chega ao relatório', linhas[1].mos);
ok('problemas chegam em rótulo e ordem canônica', linhas[0].problemas.join('|') === 'Ruído externo|Precisa de ADR / dublagem');
ok('o detalhe do problema chega', linhas[0].obsProblemas === 'avião aos 20 s');
ok('o resumo conta take com problema', resumoDoDia(linhas).comProblema === 1);

const rolos = rolosDoDia(linhas, fonte.rolls);
ok('rolos: o cadastrado e o só citado no take', rolos.map((r) => r.rotulo).join(',') === '004,005');
ok('o cadastro do rolo chega com mídia e equipamento', rolos[0].midia === 'SD #1' && rolos[0].gravador === '833');
ok('os arquivos do rolo vêm dos takes', rolos[0].arquivos.map((l) => l.arquivo).join(',') === '004_001');

const canais = canaisDoDia(linhas);
ok('a distribuição de canais junta os takes iguais', canais.length === 2 && canais.every((c) => c.takes === 2));
ok('microfone e captação chegam ao quadro de canais', canais[1].microfone === 'COS-11' && canais[1].captacao === 'Lapela');

const csv = montaCSV(linhas, { projeto: tituloDoBoletim(som), data: som.producao.data });
ok('o CSV sai do mesmo montaCSV, com problemas', csv.split('\r\n')[0].includes('problemas') && csv.includes('avião aos 20 s'));
ok('o cabeçalho impresso leva projeto e mixer', fonte.cabecalho.producao.name === 'Filme X');
ok('a técnica do boletim vira a configuração impressa', fonte.config.sampleRate === '48 kHz' && fonte.config.recorder === null);

// ---- Continuidade ----

const cont = criaBoletimContinuidade();
ok('o boletim de continuidade nasce sem cenas e com a data de hoje', cont.cenas.length === 0 && cont.producao.data === hojeISO());
cont.producao.tituloProjeto = 'Filme X';
cont.continuista = 'Ana';
const c24 = criaCenaContinuidade('24');
c24.notas = [criaNota('OLHAR', 'Olha para a janela')];
c24.fotos = [{ id: 'f1', categoria: 'FIGURINO', legenda: 'Camisa azul', largura: '1600', altura: '1200' }];
const p1 = criaPlanoContinuidade('1');
p1.tamanho = 'Close';
p1.descricao = 'João no sofá';
c24.planos = [p1];
cont.cenas = [c24];

const k1 = proximoTakeContinuidade(p1);
k1.veredito = 'CIRCLE';
k1.duracao = '00:42';
k1.acao.dialogueChanges = 'Cortou a última fala';
k1.fotos = [{ id: 'f2', categoria: 'OBJETOS', legenda: 'Copo', largura: '', altura: '' }];
p1.takes.push(k1);
const k2 = proximoTakeContinuidade(p1);
ok('o take de continuidade nasce vazio — nada herdado', k2.numero === '2' && !k2.veredito && !k2.duracao && k2.notas.length === 0);
k2.veredito = 'NG';
k2.motivoNG = 'Errou a marca';
k2.problema = true;
k2.problemaDescricao = 'Copo na mão esquerda';
k2.notas = [criaNota('DIALOGO', 'Trocou "nunca" por "jamais"')];
p1.takes.push(k2);
const k3 = proximoTakeContinuidade(p1);
k3.problemaDescricao = 'texto sem marca';
p1.takes.push(k3);

ok('normalizar continuidade é idempotente', igual(normalizaBoletimContinuidade(cont), cont));
ok('JSON parcial de continuidade vira boletim válido', normalizaBoletimContinuidade({ cenas: [{ planos: [{ takes: [{}] }] }] }).cenas[0].planos[0].takes[0].acao.action === '');
ok('foto sem id é descartada na normalização', normalizaBoletimContinuidade({ cenas: [{ fotos: [{ legenda: 'x' }] }] }).cenas[0].fotos.length === 0);
ok('todas as fotos do boletim são encontradas (para apagar os bytes)', idsDasFotos(cont).join(',') === 'f1,f2');
const rc = resumoContinuidade(cont);
ok('o resumo da lista conta takes, prints, problemas e fotos', rc.takes === 3 && rc.prints === 1 && rc.comProblema === 1 && rc.fotos === 2);

const leitura = leituraDoBoletimContinuidade(cont);
ok('uma linha por take', leitura.linhas.length === 3);
ok('o print chega', leitura.linhas[0].print && leitura.linhas[0].veredito === 'Print');
ok('a duração vira segundos e volta formatada', leitura.linhas[0].duracaoSeg === 42 && leitura.linhas[0].duracao === '00:42');
ok('o enquadramento do plano chega', leitura.linhas[0].enquadramento === 'Close — João no sofá');
ok('o NG chega com motivo', leitura.linhas[1].veredito === 'NG' && leitura.linhas[1].motivoNG === 'Errou a marca');
ok('o problema marcado chega', leitura.linhas[1].problema && leitura.linhas[1].problemaDescricao === 'Copo na mão esquerda');
ok('texto de problema sem a marca não vira pendência', !leitura.linhas[2].problema);
ok('pendências: só o take marcado', pendenciasDoDia(leitura.linhas).length === 1);
ok('raccord da cena: nota da cena e do take', leitura.raccord[0].notas.length === 2);
ok('fotos da cena e do take no raccord', leitura.raccord[0].fotos.map((f) => f.id).join(',') === 'f1,f2');
ok('o "onde" da foto do take aponta o take', leitura.raccord[0].fotos[1].onde === 'Take 24/1/1');
const dialogos = alteracoesDeDialogo(leitura.linhas, leitura.raccord);
ok('alterações de diálogo: do campo do take e da nota', dialogos.length === 2);
ok('a continuísta vai para o cabeçalho', leitura.cabecalho.equipe[0]?.nome === 'Ana');
ok('as contagens do dia saem da mesma estrutura', leitura.contagens.takes === 3 && leitura.contagens.prints === 1 && leitura.contagens.comProblema === 1);

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
