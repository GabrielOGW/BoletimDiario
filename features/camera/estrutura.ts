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
