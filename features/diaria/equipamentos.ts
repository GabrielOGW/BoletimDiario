/**
 * O equipamento alocado na diária, como os três módulos o leem — sem React.
 *
 * O catálogo e a alocação vivem **fora da fronteira offline** (ADR-016): são preparação,
 * feita sentada e com sinal. O que chega aqui já veio resolvido do servidor, junto com a
 * página, em texto puro — do mesmo jeito que produção, horários e equipe. Nenhuma consulta
 * acontece durante a diária, que é exatamente o que faz a folha continuar imprimindo em
 * locação sem sinal.
 *
 * Mora em `features/diaria/` e não dentro de um módulo porque a alocação é da **diária**,
 * não de um departamento: Câmera, Som e Continuidade recebem a mesma lista e cada um lê a
 * fatia que lhe interessa. Três filtros copiados seriam três respostas diferentes para
 * "o que estamos usando hoje".
 */

/** Uma linha de `equipment_assignments` já descrita em texto (`descreveEquipamento`). */
export interface EquipamentoDaDiaria {
  id: string;
  /** `Department` da alocação — quem está com o item hoje. */
  departamento: string;
  /** `EquipmentCategory` do item no catálogo. */
  categoria: string;
  descricao: string;
}

/** A fatia de um departamento — o boom não interessa ao cabeçalho da câmera. */
export function equipamentosDoDepartamento(
  lista: readonly EquipamentoDaDiaria[] | undefined,
  departamento: string,
): EquipamentoDaDiaria[] {
  return (lista ?? []).filter((item) => item.departamento === departamento);
}

/**
 * Os departamentos cujo suporte de mídia sai no boletim de câmera.
 *
 * Cartão e SSD costumam estar cadastrados no DIT, não na Câmera — mas é o boletim de
 * câmera que responde por eles no fim do dia. O cartão do gravador de som fica de fora
 * pelo mesmo motivo: ele responde pelo sound report.
 */
const DEPARTAMENTOS_DE_MIDIA = ['CAMERA', 'DIT'];

/** O suporte de mídia do dia: o `Mídia/Suporte` do boletim, agora vindo do catálogo. */
export function suportesDeMidia(
  lista: readonly EquipamentoDaDiaria[] | undefined,
  departamentos: readonly string[] = DEPARTAMENTOS_DE_MIDIA,
): EquipamentoDaDiaria[] {
  return (lista ?? []).filter(
    (item) => item.categoria === 'MEDIA' && departamentos.includes(item.departamento),
  );
}
