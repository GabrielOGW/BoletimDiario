/**
 * A estrutura do boletim de câmera, sem React.
 *
 * Existe porque a **tela** e a **folha impressa** precisam ler os mesmos dados do mesmo
 * jeito. Duplicar o agrupamento de cena/bloco ou a ordem dos campos técnicos nos dois
 * lugares significaria, mais cedo ou mais tarde, um PDF que mostra a diária diferente do
 * que a tela mostrou — e o PDF é o que sai do set.
 *
 * O que é apresentação **do módulo de Câmera** mora aqui: a linha técnica, as diferenças
 * por take, a assinatura de agrupamento. O agrupamento Cena → Bloco saiu na Fase 6 para
 * `features/diaria/cenas.ts` — ele é das entidades compartilhadas, não deste módulo, e o
 * Som lê as mesmas cenas. Continua reexportado daqui para quem já o importava.
 */

import {
  suportesDeMidia,
  type EquipamentoDaDiaria,
} from '@/features/diaria/equipamentos';
import type { LocalCameraTakeData } from '@/lib/offline/db';

export { agrupaCenas, type CenaAgrupada } from '@/features/diaria/cenas';

type CampoTecnico = {
  field: keyof LocalCameraTakeData;
  /** Como o valor aparece impresso — "800" vira "ISO 800", como no boletim de hoje. */
  rotulo: (valor: string) => string;
};

/**
 * Os campos técnicos na ordem em que o boletim sempre os imprimiu.
 *
 * A mesma lista do cartão de Plano (`PlanoCard`), acrescida do que o modelo novo ganhou.
 */
export const CAMPOS_TECNICOS: CampoTecnico[] = [
  { field: 'codec', rotulo: (v) => v },
  { field: 'resolution', rotulo: (v) => v },
  { field: 'fps', rotulo: (v) => `${v} fps` },
  { field: 'iso', rotulo: (v) => `ISO ${v}` },
  { field: 'shutter', rotulo: (v) => v },
  { field: 'whiteBalance', rotulo: (v) => v },
  { field: 'lut', rotulo: (v) => v },
  { field: 'colorSpace', rotulo: (v) => v },
  { field: 'lens', rotulo: (v) => v },
  { field: 'focalLength', rotulo: (v) => v },
  { field: 'filter', rotulo: (v) => v },
  { field: 'tStop', rotulo: (v) => v },
  { field: 'aspectRatio', rotulo: (v) => v },
  { field: 'vfx', rotulo: (v) => `VFX: ${v}` },
];

const texto = (
  dados: LocalCameraTakeData | undefined,
  field: keyof LocalCameraTakeData,
) => String(dados?.[field] ?? '').trim();

/** A linha técnica de um plano, só com o que está preenchido. */
export function partesTecnicas(dados: LocalCameraTakeData | undefined): string[] {
  if (!dados) return [];

  const partes = CAMPOS_TECNICOS.flatMap(({ field, rotulo }) => {
    const valor = texto(dados, field);
    return valor ? [rotulo(valor)] : [];
  });

  if (dados.matteBox) partes.push('Matte Box');
  return partes;
}

/**
 * O que este take tem de diferente do plano.
 *
 * No modelo antigo a técnica morava no plano e não havia como registrar que o foquista
 * abriu meio ponto no take 3. Agora há (ADR-011) — e o papel precisa mostrar, senão o
 * dado existe e ninguém vê. Comparado com o **primeiro** take, não com o anterior: assim
 * o take 4, que herdou o valor novo do take 3, também aparece com ele.
 */
export function diferencasDoPlano(
  dados: LocalCameraTakeData | undefined,
  base: LocalCameraTakeData | undefined,
): string[] {
  if (!dados || !base || dados.id === base.id) return [];

  return CAMPOS_TECNICOS.flatMap(({ field, rotulo }) => {
    const valor = texto(dados, field);
    if (!valor || valor === texto(base, field)) return [];
    return [rotulo(valor)];
  });
}

/**
 * O julgamento **da câmera** sobre o take, quando há um (ADR-010).
 *
 * É outro eixo que a aprovação do diretor: um take pode ser aprovado e ser NG para a
 * câmera, e a pós precisa saber. `RECORDED` é o padrão de todo take e não vira marca no
 * papel — imprimir "OK" em cada linha gastaria tinta e atenção. `CIRCLE` também não: a
 * aprovação já tem selo próprio, e repetir a mesma informação com dois nomes confunde.
 *
 * Só o eixo de julgamento aparece aqui. `WILD`, `ROOM_TONE` e `FALSE_START` mudam para
 * `TakeKind` na Fase 6 (ADR-029) e ganham apresentação própria quando isso acontecer.
 */
const JULGAMENTO_IMPRESSO: Record<string, string> = { NG: 'NG', PARTIAL: 'Parcial' };

export function rotuloDoJulgamento(status: string | null | undefined): string | null {
  return status ? (JULGAMENTO_IMPRESSO[status] ?? null) : null;
}

/**
 * O tipo de captação, quando não é o padrão.
 *
 * `Normal` não é impresso: é o que quase todo plano é, e repeti-lo em cada linha só
 * afastaria o olho do que muda — a mesma regra que o boletim já aplicava ao badge.
 */
export function rotuloDoTipo(kind: string | null | undefined): string | null {
  const valor = (kind ?? '').trim();
  return valor && valor !== 'Normal' ? valor : null;
}

/**
 * Assinatura técnica de um plano — planos consecutivos iguais são impressos como um só.
 *
 * `groupPlanos` do boletim atual, mesma intenção: uma diária de dez planos idênticos não
 * pode virar dez repetições da mesma linha.
 */
export function assinaturaDoPlano(
  camera: string,
  dados: LocalCameraTakeData | undefined,
  kind?: string | null,
): string {
  return JSON.stringify([camera, rotuloDoTipo(kind), partesTecnicas(dados)]);
}

// ---- Mídia / Suporte ----

/** Um cartão que gravou hoje, com o quanto gravou e em que rolls apareceu. */
export interface CartaoUsado {
  cartao: string;
  takes: number;
  rolls: string[];
}

/**
 * A seção **Mídia/Suporte** do boletim, reconstruída na plataforma.
 *
 * No boletim local ela era uma tabela digitada à mão (tipo de mídia, número do cartão,
 * quantidade, responsável) — e digitada duas vezes, porque o número do cartão também ia
 * no take. Aqui as duas metades vêm de onde já existem: o **suporte** é o catálogo de
 * equipamentos da produção alocado nesta diária (Fase 8), e o **uso** é derivado dos
 * takes, que é onde o cartão é anotado no momento em que a câmera roda.
 *
 * O resultado é o que a antiga tabela tentava dizer, sem ninguém redigitar: quais cartões
 * gravaram, quanto cada um gravou, em que roll, e quantos takes ainda estão sem cartão —
 * a pergunta que o DIT faz no fim do dia e que a tabela manual nunca respondia.
 */
export interface ResumoDeMidia {
  cartoes: CartaoUsado[];
  rolls: string[];
  volumes: string[];
  /** O suporte alocado na diária, vindo da sala. Vazio numa produção sem catálogo. */
  suportes: EquipamentoDaDiaria[];
  /** Takes anotados sem cartão — lacuna, não erro: some quando alguém preenche. */
  takesSemCartao: number;
}

const ordemNatural = (a: string, b: string) =>
  a.localeCompare(b, 'pt-BR', { numeric: true });

export function resumoDeMidia(
  dadosCamera: readonly LocalCameraTakeData[],
  equipamentos?: readonly EquipamentoDaDiaria[],
): ResumoDeMidia {
  const porCartao = new Map<string, { takes: number; rolls: Set<string> }>();
  const rolls = new Set<string>();
  const volumes = new Set<string>();
  let takesSemCartao = 0;

  for (const dados of dadosCamera) {
    const cartao = texto(dados, 'card');
    const roll = texto(dados, 'roll');
    const volume = texto(dados, 'volume');

    if (roll) rolls.add(roll);
    if (volume) volumes.add(volume);

    if (!cartao) {
      takesSemCartao++;
      continue;
    }

    const entrada = porCartao.get(cartao) ?? { takes: 0, rolls: new Set<string>() };
    entrada.takes++;
    if (roll) entrada.rolls.add(roll);
    porCartao.set(cartao, entrada);
  }

  return {
    cartoes: [...porCartao.entries()]
      .map(([cartao, { takes, rolls: rollsDoCartao }]) => ({
        cartao,
        takes,
        rolls: [...rollsDoCartao].sort(ordemNatural),
      }))
      .sort((a, b) => ordemNatural(a.cartao, b.cartao)),
    rolls: [...rolls].sort(ordemNatural),
    volumes: [...volumes].sort(ordemNatural),
    suportes: suportesDeMidia(equipamentos),
    takesSemCartao,
  };
}
