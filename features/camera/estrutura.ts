/**
 * A estrutura do boletim de câmera, sem React.
 *
 * Existe porque a **tela** e a **folha impressa** precisam ler os mesmos dados do mesmo
 * jeito. Duplicar o agrupamento de cena/bloco ou a ordem dos campos técnicos nos dois
 * lugares significaria, mais cedo ou mais tarde, um PDF que mostra a diária diferente do
 * que a tela mostrou — e o PDF é o que sai do set.
 *
 * Não é domínio compartilhado: nada aqui vale para Som ou Continuidade. É apresentação
 * do módulo de Câmera, e por isso mora em `features/camera/`.
 */

import type { LocalCameraTakeData, LocalScene } from '@/lib/offline/db';

export interface CenaAgrupada {
  numero: string;
  /** Os blocos daquele número — no modelo, uma `Scene` por letra (ADR-002). */
  blocos: LocalScene[];
}

/**
 * Cena e Bloco são uma `Scene` só no modelo; na tela e no papel voltam a ser dois níveis.
 *
 * É assim que a claquete fala, e mudar o vocabulário do set para agradar ao modelo seria
 * a regressão que ADR-030 proíbe.
 */
export function agrupaCenas(cenas: LocalScene[]): CenaAgrupada[] {
  const porNumero = new Map<string, LocalScene[]>();

  for (const cena of cenas) {
    const lista = porNumero.get(cena.number) ?? [];
    lista.push(cena);
    porNumero.set(cena.number, lista);
  }

  return [...porNumero.keys()]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
    .map((numero) => ({
      numero,
      blocos: [...(porNumero.get(numero) ?? [])].sort((a, b) =>
        (a.block ?? '').localeCompare(b.block ?? ''),
      ),
    }));
}

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
 * Assinatura técnica de um plano — planos consecutivos iguais são impressos como um só.
 *
 * `groupPlanos` do boletim atual, mesma intenção: uma diária de dez planos idênticos não
 * pode virar dez repetições da mesma linha.
 */
export function assinaturaDoPlano(
  camera: string,
  dados: LocalCameraTakeData | undefined,
): string {
  return JSON.stringify([camera, partesTecnicas(dados)]);
}
