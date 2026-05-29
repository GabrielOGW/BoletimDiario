import type { BackupFile, Boletim } from '@/types/boletim';
import { SCHEMA_VERSION } from '@/types/boletim';
import { loadAll, replaceAll, upsert } from '@/lib/storage';
import { normalizeBoletim } from '@/lib/normalize';
import { boletimTitle, slugify } from '@/utils/boletim-stats';
import { fileStamp } from '@/utils/date';

function buildBackup(boletins: Boletim[]): BackupFile {
  return {
    app: 'boletim-diario-de-camera',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    boletins,
  };
}

function downloadJSON(filename: string, payload: unknown): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Exporta TODOS os boletins como um único arquivo de backup. */
export function exportAllBoletins(): void {
  const list = loadAll();
  downloadJSON(`boletins-backup_${fileStamp()}.json`, buildBackup(list));
}

/** Exporta um único boletim (também no formato de backup, pronto para reimportar). */
export function exportBoletim(boletim: Boletim): void {
  const name = `boletim_${slugify(boletimTitle(boletim))}_${fileStamp()}.json`;
  downloadJSON(name, buildBackup([boletim]));
}

/** Extrai uma lista de boletins de qualquer formato razoável de JSON. */
function extractBoletins(parsed: unknown): Boletim[] {
  // Envelope de backup { boletins: [...] }
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'boletins' in parsed &&
    Array.isArray((parsed as { boletins: unknown }).boletins)
  ) {
    return (parsed as { boletins: unknown[] }).boletins.map(normalizeBoletim);
  }
  // Array cru de boletins
  if (Array.isArray(parsed)) {
    return parsed.map(normalizeBoletim);
  }
  // Objeto único de boletim
  if (typeof parsed === 'object' && parsed !== null) {
    return [normalizeBoletim(parsed)];
  }
  return [];
}

export interface ImportResult {
  imported: number;
  mode: 'merge' | 'replace';
}

/**
 * Lê um arquivo .json e importa os boletins.
 * - 'merge'  : adiciona/atualiza por id, mantendo os existentes.
 * - 'replace': substitui toda a base pelos boletins do arquivo.
 */
export async function importBackupFile(
  file: File,
  mode: 'merge' | 'replace' = 'merge',
): Promise<ImportResult> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Arquivo inválido: não é um JSON válido.');
  }

  const boletins = extractBoletins(parsed);
  if (boletins.length === 0) {
    throw new Error('Nenhum boletim encontrado no arquivo.');
  }

  if (mode === 'replace') {
    replaceAll(boletins);
  } else {
    // upsert preserva os boletins existentes e sobrescreve por id quando coincide.
    for (const boletim of boletins) upsert(boletim);
  }

  return { imported: boletins.length, mode };
}
