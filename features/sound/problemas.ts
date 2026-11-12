/**
 * Problemas de captação e tipos de captação do Som (ADR-041) — sem React, sem Dexie.
 *
 * A lista é um **acelerador**, não um limite: o mixer marca num toque o que acontece todo
 * dia, e escreve o resto no campo livre (`issueNotes`). Código desconhecido — vindo de uma
 * versão futura, ou digitado por quem mexeu no banco — é preservado e impresso como veio:
 * descartá-lo seria apagar o aviso de alguém em silêncio.
 *
 * O formato guardado é texto: códigos separados por vírgula, em ordem canônica (a ordem
 * desta lista). Canônica para que marcar A depois B e B depois A produza o **mesmo**
 * valor — senão o compare-and-set veria uma mudança onde não houve nenhuma.
 */

export const PROBLEMAS_DE_SOM = [
  { codigo: 'RUIDO_EXTERNO', rotulo: 'Ruído externo' },
  { codigo: 'INTERFERENCIA', rotulo: 'Interferência' },
  { codigo: 'MICROFONE', rotulo: 'Problema de microfone' },
  { codigo: 'SATURADO', rotulo: 'Áudio saturado' },
  { codigo: 'FALHA_GRAVACAO', rotulo: 'Falha de gravação' },
  { codigo: 'INAUDIVEL', rotulo: 'Diálogo inaudível' },
  { codigo: 'RUIDO_EQUIPAMENTO', rotulo: 'Ruído de equipamento' },
  { codigo: 'WILD_TRACK', rotulo: 'Precisa de wild track' },
  { codigo: 'ROOM_TONE', rotulo: 'Precisa de room tone' },
  { codigo: 'ADR', rotulo: 'Precisa de ADR / dublagem' },
] as const;

export type CodigoDeProblema = (typeof PROBLEMAS_DE_SOM)[number]['codigo'];

const ORDEM = new Map<string, number>(
  PROBLEMAS_DE_SOM.map((problema, indice) => [problema.codigo, indice]),
);

const ROTULO = new Map<string, string>(
  PROBLEMAS_DE_SOM.map((problema) => [problema.codigo, problema.rotulo]),
);

/** `"ADR, RUIDO_EXTERNO"` → `['RUIDO_EXTERNO', 'ADR']`, sem repetição e em ordem. */
export function leProblemas(valor: string | null | undefined): string[] {
  const codigos = String(valor ?? '')
    .split(',')
    .map((parte) => parte.trim())
    .filter(Boolean);

  return [...new Set(codigos)].sort(
    (a, b) =>
      (ORDEM.get(a) ?? Number.MAX_SAFE_INTEGER) -
        (ORDEM.get(b) ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b),
  );
}

/** A lista de volta ao texto guardado. Vazia vira `null` — ausência, não string vazia. */
export function escreveProblemas(codigos: readonly string[]): string | null {
  const canonico = leProblemas(codigos.join(','));
  return canonico.length > 0 ? canonico.join(',') : null;
}

/** Marca ou desmarca um código — o gesto do chip. */
export function alternaProblema(valor: string | null | undefined, codigo: string) {
  const atuais = leProblemas(valor);
  return escreveProblemas(
    atuais.includes(codigo)
      ? atuais.filter((atual) => atual !== codigo)
      : [...atuais, codigo],
  );
}

/** Rótulos para a tela e a folha. Código desconhecido sai como veio. */
export function rotulosDosProblemas(valor: string | null | undefined): string[] {
  return leProblemas(valor).map((codigo) => ROTULO.get(codigo) ?? codigo);
}

/**
 * Tipos de captação do canal. Também é acelerador: o campo aceita qualquer texto, e um
 * valor fora da lista ("Plant no carro") aparece selecionado como texto livre.
 */
export const CAPTACOES = ['Boom', 'Lapela', 'Plant', 'Ambiente', 'Linha'] as const;
