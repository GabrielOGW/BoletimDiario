-- Triggers de auditoria e de sincronização.
--
-- Escrito à mão porque o Drizzle não modela função nem trigger. É a única parte do
-- schema que não sai do TypeScript — e é a parte que o sistema de sync inteiro depende
-- de estar correta.

-- ---------------------------------------------------------------------------
-- 1. touch_row() — updated_at e version
-- ---------------------------------------------------------------------------
-- O incremento de `version` é do BANCO, não da aplicação. Deixá-lo a cargo do cliente
-- significa confiar que todo caminho de escrita se lembrou de incrementar — e um único
-- esquecimento produz duas versões iguais com conteúdos diferentes.

create or replace function touch_row() returns trigger as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- 2. write_sync_log() — o cursor do pull incremental
-- ---------------------------------------------------------------------------
-- Genérico via `to_jsonb(new)`: uma função só serve as 18 tabelas de domínio, em vez de
-- 18 funções que precisariam ser mantidas em sincronia entre si.
--
-- `entity_type` guarda o NOME DA TABELA (`camera_take_data`), não o nome da entidade no
-- cliente (`cameraTakeData`). A tradução é do cliente: o banco não deve conhecer a
-- convenção de nomes do TypeScript.
--
-- Soft delete é um UPDATE que preenche `deleted_at`. Registrá-lo como `UPDATE` faria os
-- outros dispositivos nunca saberem que o registro foi apagado — daí a detecção da
-- transição null → não-null.

create or replace function write_sync_log() returns trigger as $$
declare
  payload   jsonb := to_jsonb(new);
  target    uuid;
  op        sync_op;
  row_ver   integer;
  actor     uuid;
begin
  if tg_table_name = 'productions' then
    target := new.id;
  else
    target := (payload ->> 'production_id')::uuid;
  end if;

  row_ver := coalesce((payload ->> 'version')::integer, 1);
  actor := nullif(coalesce(payload ->> 'updated_by', payload ->> 'created_by'), '')::uuid;

  if tg_op = 'INSERT' then
    op := 'CREATE';
  elsif (to_jsonb(old) ->> 'deleted_at') is null and (payload ->> 'deleted_at') is not null then
    op := 'DELETE';
  else
    op := 'UPDATE';
  end if;

  insert into sync_log (production_id, entity_type, entity_id, operation, version, actor_id)
  values (target, tg_table_name, new.id, op, row_ver, actor);

  return null;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- 3. Aplicação nas tabelas de domínio
-- ---------------------------------------------------------------------------
-- Em laço, e não em 36 comandos repetidos: a lista fica em um lugar só, e esquecer uma
-- tabela vira uma linha faltando numa lista visível em vez de um trigger ausente que
-- ninguém nota até um dispositivo não receber a mudança.
--
-- Ficam de fora, de propósito:
--   users                          — não pertence a nenhuma produção
--   production_member_departments  — tabela de ligação, sincroniza com o membro
--   sync_log                       — é o log

do $$
declare
  t text;
  domain_tables text[] := array[
    'productions',
    'production_members',
    'shooting_days',
    'scenes',
    'setups',
    'takes',
    'camera_units',
    'camera_take_data',
    'sound_day_config',
    'sound_take_data',
    'sound_take_tracks',
    'continuity_take_data',
    'continuity_props',
    'continuity_wardrobe',
    'continuity_hair_makeup',
    'continuity_set_dressing',
    'equipment',
    'equipment_assignments'
  ];
begin
  foreach t in array domain_tables loop
    execute format(
      'create trigger %I before update on %I for each row execute function touch_row()',
      t || '_touch', t
    );
    execute format(
      'create trigger %I after insert or update on %I for each row execute function write_sync_log()',
      t || '_sync_log', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Busca global
-- ---------------------------------------------------------------------------
-- Índice de expressão: fora do alcance do Drizzle, então mora aqui.

create index scenes_search on scenes using gin (
  to_tsvector(
    'portuguese',
    coalesce(number, '') || ' ' || coalesce(block, '') || ' ' || coalesce(description, '')
  )
);
