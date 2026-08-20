/**
 * A busca da **produção inteira** — o último item da Fase 8.
 *
 * A busca da diária já existia e é local (`features/diaria/consolidado.ts`): funciona sem
 * rede e responde a cada tecla, porque a diária fixada está no aparelho. Esta é a outra:
 * alcança toda diária da produção, inclusive as que este celular nunca baixou — e por isso
 * **exige rede**, como o resto da sala (ADR-016).
 *
 * As duas respondem igual de propósito ([ADR-036](../../../docs/decisions.md)): cada palavra
 * do termo precisa aparecer, e o resultado é sempre cena · plano · take mais onde bateu.
 * Quem aprende uma sabe usar a outra.
 *
 * ## Por que `ilike`, e não `to_tsvector`
 *
 * O índice `scenes_search` (migration `0001`) é full-text em português sobre a cena, e
 * continua servindo à descrição de cena. Mas o que se procura aqui, na esmagadora maioria
 * das vezes, é **identificador**: `A023`, `A023C012_001`, `008_012`, `24B`. Full-text
 * tokeniza `A023C012_001` como um lexema só — procurar `A023` **não acharia**, que é
 * exatamente o sintoma que faz alguém dizer "a busca não acha nada". Trecho é o que este
 * domínio precisa.
 *
 * O custo é varredura sem índice. Numa produção inteira — dezenas de diárias, milhares de
 * takes — isso é barato; se um dia deixar de ser, a resposta é um índice `pg_trgm` sobre as
 * mesmas colunas, não trocar a semântica que as pessoas já aprenderam.
 */

import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

export interface SearchHit {
  takeId: string;
  shootingDayId: string | null;
  /** Dia civil `YYYY-MM-DD` — a diária é dia, não instante (R9). */
  date: string | null;
  dayNumber: string | null;
  cena: string;
  bloco: string | null;
  plano: string;
  take: number;
  /** O que a Câmera tem deste take, resumido: cartão, roll, arquivo. */
  camera: string | null;
  /** O que o Som tem: roll e arquivo. */
  som: string | null;
  /** A nota que bateu com o termo — de qualquer um dos três, ou do próprio take. */
  nota: string | null;
}

/** Quantos resultados uma busca devolve antes de pedir um termo melhor. */
export const LIMITE_DE_BUSCA = 60;

/**
 * As palavras do termo, sem as vazias.
 *
 * Exportada porque a tela precisa saber se sobrou alguma antes de consultar: buscar por
 * espaço em branco devolveria a produção inteira, e isso não é resultado, é despejo.
 */
export function palavrasDoTermo(termo: string): string[] {
  return termo
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((palavra) => palavra.length > 0);
}

export async function searchProduction(input: {
  productionId: string;
  termo: string;
  limite?: number;
}): Promise<SearchHit[]> {
  const palavras = palavrasDoTermo(input.termo);
  if (palavras.length === 0) return [];

  /**
   * O texto pesquisável de uma linha, montado uma vez e comparado inteiro.
   *
   * Concatenar antes de comparar é o que faz "24 boom" achar o take da cena 24 com nota de
   * boom, em vez de exigir que as duas palavras estejam no mesmo campo. É a mesma regra da
   * busca local, onde o índice por linha é pré-calculado pelo mesmo motivo.
   */
  const texto = sql`lower(concat_ws(' ',
    sc.number, sc.block, sc.description, sc.location, sc.story_day,
    st.code, st.name, st.kind, st.description,
    t.number::text, t.notes, t.kind::text, t.status::text,
    ctd.card, ctd.roll, ctd.volume, ctd.file_name, ctd.lens, ctd.notes, ctd.media_notes,
    std.sound_roll, std.file_name, std.notes,
    kd.action, kd.notes,
    d.date::text, d.day_number
  ))`;

  // Cada palavra precisa aparecer: digitar mais restringe, nunca amplia.
  const condicoes = palavras.map((palavra) => sql`${texto} like ${`%${palavra}%`}`);

  const { rows } = await db.execute<{
    take_id: string;
    shooting_day_id: string | null;
    date: string | null;
    day_number: string | null;
    cena: string;
    bloco: string | null;
    plano: string;
    take: number;
    camera: string | null;
    som: string | null;
    nota: string | null;
  }>(sql`
    select
      t.id::text                                   as take_id,
      d.id::text                                   as shooting_day_id,
      d.date::text                                 as date,
      d.day_number                                 as day_number,
      sc.number                                    as cena,
      sc.block                                     as bloco,
      st.code                                      as plano,
      t.number                                     as take,
      nullif(concat_ws(' · ', ctd.card, ctd.roll, ctd.file_name), '')  as camera,
      nullif(concat_ws(' · ', std.sound_roll, std.file_name), '')      as som,
      nullif(concat_ws(' · ', t.notes, ctd.notes, std.notes, kd.action), '') as nota
      from takes t
      join setups st on st.id = t.setup_id
      join scenes sc on sc.id = st.scene_id
      left join shooting_days d on d.id = st.shooting_day_id
      -- Multicam tem uma linha por câmera; a busca é por take, então a primeira serve de
      -- rótulo. Quem quer as duas abre a diária consolidada, que mostra as duas.
      left join lateral (
        select * from camera_take_data c
         where c.take_id = t.id and c.deleted_at is null
         order by c.created_at limit 1
      ) ctd on true
      left join sound_take_data std on std.take_id = t.id and std.deleted_at is null
      left join continuity_take_data kd on kd.take_id = t.id and kd.deleted_at is null
     where t.production_id = ${input.productionId}
       and t.deleted_at is null
       and st.deleted_at is null
       and sc.deleted_at is null
       and ${sql.join(condicoes, sql` and `)}
     -- Diária mais recente primeiro (é onde se procura), e dentro dela a ordem do dia.
     -- A cena ordena pelo número **como número**: em texto, a cena 105 viria antes da 24.
     order by d.date desc nulls last,
              nullif(regexp_replace(sc.number, '\\D', '', 'g'), '')::bigint nulls last,
              sc.number, sc.block nulls first, st.code, t.number
     limit ${input.limite ?? LIMITE_DE_BUSCA}
  `);

  return rows.map((linha) => ({
    takeId: linha.take_id,
    shootingDayId: linha.shooting_day_id,
    date: linha.date,
    dayNumber: linha.day_number,
    cena: linha.cena,
    bloco: linha.bloco,
    plano: linha.plano,
    take: Number(linha.take),
    camera: linha.camera,
    som: linha.som,
    nota: linha.nota,
  }));
}
