/**
 * Baixar um arquivo sem servidor e sem biblioteca.
 *
 * `Blob` + `createObjectURL` é o que funciona **offline**: qualquer rota de download
 * passaria pelo servidor, e o fim da diária é exatamente quando a locação está sem sinal.
 *
 * Nasceu dentro de `SomDiaria`, quando o CSV do sound report era o único arquivo que o app
 * gerava. Com o CSV de câmera e o JSON da diária (Fase 9) passaram a ser três, e três
 * cópias desta função seriam três chances de uma delas esquecer o BOM ou o `revokeObjectURL`.
 */

/** O BOM que faz o Excel em pt-BR abrir "avião" como "avião", e não como "aviÃ£o". */
const BOM = String.fromCharCode(0xfeff);

export function baixaArquivo(partes: BlobPart[], nome: string, tipo: string): void {
  const url = URL.createObjectURL(new Blob(partes, { type: tipo }));

  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

/** CSV com BOM — sem ele, acento vira caractere estranho na planilha de quem recebe. */
export function baixaCSV(conteudo: string, nome: string): void {
  baixaArquivo([BOM, conteudo], nome, 'text/csv;charset=utf-8');
}

/** JSON identado: o arquivo é lido por gente e por máquina, e diff de backup importa. */
export function baixaJSON(dados: unknown, nome: string): void {
  baixaArquivo([JSON.stringify(dados, null, 2)], nome, 'application/json');
}
