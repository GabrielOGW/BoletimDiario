'use server';

/**
 * A importação dos boletins locais — fora da fronteira offline (ADR-016).
 *
 * É uma operação feita sentado, com sinal, uma vez. Pode exigir rede sem prejuízo nenhum,
 * e por isso não passa por outbox nem por cursor: escreve direto nas tabelas, com
 * `on conflict do nothing`, e o `sync_log` avisa os outros dispositivos como avisaria de
 * qualquer escrita.
 *
 * O payload é **o conteúdo bruto do `LocalStorage`**. Ele não é validado campo a campo
 * aqui de propósito: `normalizeBoletim()`, dentro de `importBoletins`, já transforma
 * qualquer JSON num `Boletim` válido, e é ele quem faz a fronteira de confiança.
 */

import { requireUser } from '@/lib/auth/session';
import { importBoletins, type ImportResult } from '@/lib/db/queries/import';

export type ImportarResposta =
  | ImportResult
  | { status: 'GRANDE_DEMAIS' }
  | { status: 'ERRO'; motivo: string };

/**
 * Limite de segurança do payload.
 *
 * Uma base local realista tem dezenas de boletins e algumas centenas de KB. Muito acima
 * disso é engano ou abuso, e recusar cedo é melhor do que descobrir no meio da inserção.
 */
const LIMITE_BYTES = 4 * 1024 * 1024;

export async function importarBoletinsAction(
  boletins: unknown,
): Promise<ImportarResposta> {
  const user = await requireUser('/legado/importar');

  if (JSON.stringify(boletins ?? null).length > LIMITE_BYTES) {
    return { status: 'GRANDE_DEMAIS' };
  }

  try {
    return await importBoletins({
      boletins,
      userId: user.id,
      userName: user.name,
      // Quem importa um boletim de câmera é da câmera. O papel na sala é `OWNER`; o
      // departamento é ajustável na tela de equipe, como qualquer outro.
      department: 'CAMERA',
    });
  } catch (erro) {
    return {
      status: 'ERRO',
      motivo: erro instanceof Error ? erro.message : 'Falha ao importar.',
    };
  }
}
