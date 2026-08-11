-- A natureza do take sai do Som e vira `takes.kind` (ADR-029).
--
-- Migration separada da 0005 de propósito: a 0005 **lê** estas quatro colunas para mover
-- o dado. Apagá-las no mesmo arquivo seria apagar a origem antes de conferir o destino, e
-- não haveria como rodar só metade se algo desse errado no meio.
--
-- Confere antes de apagar: se sobrar linha marcada cuja natureza não chegou ao take, a
-- migration falha em vez de perder o dado em silêncio. Um `raise exception` aqui custa
-- nada e é a diferença entre "a migration recusou" e "sumiu um room tone".

DO $$
DECLARE
  perdidas integer;
BEGIN
  SELECT count(*) INTO perdidas
    FROM sound_take_data s
    JOIN takes t ON t.id = s.take_id
   WHERE (s.wild OR s.room_tone OR s.wild_lines OR s.false_start)
     AND t.kind = 'SYNC';

  IF perdidas > 0 THEN
    RAISE EXCEPTION 'A natureza de % take(s) não chegou em takes.kind — rode a 0005 antes.', perdidas;
  END IF;
END $$;--> statement-breakpoint

ALTER TABLE "sound_take_data" DROP COLUMN "wild";--> statement-breakpoint
ALTER TABLE "sound_take_data" DROP COLUMN "room_tone";--> statement-breakpoint
ALTER TABLE "sound_take_data" DROP COLUMN "wild_lines";--> statement-breakpoint
ALTER TABLE "sound_take_data" DROP COLUMN "false_start";
