do $$
declare
  v_table_name text;
  v_function_name text;
  v_unsafe_count integer;
begin
  foreach v_table_name in array array[
    'rooms',
    'room_players',
    'room_games',
    'game_players',
    'game_actions'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = v_table_name
        and relation.relrowsecurity
    ) then
      raise exception 'online contract: RLS missing for public.%', v_table_name;
    end if;
  end loop;

  foreach v_table_name in array array['game_secrets', 'mutation_requests'] loop
    if not exists (
      select 1
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = 'private'
        and relation.relname = v_table_name
        and relation.relrowsecurity
    ) then
      raise exception 'online contract: RLS missing for private.%', v_table_name;
    end if;
  end loop;

  select pg_catalog.count(*)::integer into v_unsafe_count
  from information_schema.role_table_grants as privilege
  where privilege.grantee in ('anon', 'authenticated')
    and privilege.table_schema in ('public', 'private')
    and privilege.table_name in (
      'rooms',
      'room_players',
      'room_games',
      'game_players',
      'game_actions',
      'game_secrets',
      'mutation_requests'
    )
    and privilege.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

  if v_unsafe_count <> 0 then
    raise exception 'online contract: canonical client write grant detected';
  end if;

  if pg_catalog.has_column_privilege(
      'authenticated',
      'public.room_players',
      'auth_user_id',
      'SELECT'
    ) or pg_catalog.has_column_privilege(
      'authenticated',
      'public.room_players',
      'nickname_key',
      'SELECT'
    ) then
    raise exception 'online contract: private room-player column is readable';
  end if;

  if pg_catalog.has_table_privilege(
      'authenticated',
      'private.game_secrets',
      'SELECT'
    ) or pg_catalog.has_table_privilege(
      'authenticated',
      'private.mutation_requests',
      'SELECT'
    ) then
    raise exception 'online contract: private table is readable';
  end if;

  foreach v_function_name in array array[
    'get_room_snapshot',
    'touch_connection',
    'create_room',
    'join_room',
    'update_room_settings',
    'kick_player',
    'leave_room',
    'claim_host',
    'start_game',
    'lock_number',
    'resolve_turn_timeout',
    'finalize_resolution',
    'restart_game',
    'return_to_lobby'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = v_function_name
        and procedure.prosecdef
        and procedure.proconfig is not null
        and exists (
          select 1
          from pg_catalog.unnest(procedure.proconfig) as setting
          where setting in ('search_path=', 'search_path=""')
        )
    ) then
      raise exception 'online contract: unsafe or missing RPC %', v_function_name;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_publication as publication
    where publication.pubname = 'supabase_realtime'
  ) then
    raise exception 'online contract: Realtime publication missing';
  end if;

  foreach v_table_name in array array[
    'rooms',
    'room_players',
    'room_games',
    'game_players'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables as published
      where published.pubname = 'supabase_realtime'
        and published.schemaname = 'public'
        and published.tablename = v_table_name
    ) then
      raise exception 'online contract: % is not published', v_table_name;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_publication_tables as published,
         unnest(published.attnames) as published_column
    where published.pubname = 'supabase_realtime'
      and published.schemaname = 'public'
      and published.tablename = 'room_players'
      and published_column in ('auth_user_id', 'nickname_key')
  ) then
    raise exception 'online contract: private room-player column is published';
  end if;

  if not exists (
    select 1 from cron.job as job
    where job.jobname = 'number-bomb-online-due-sweep'
  ) or not exists (
    select 1 from cron.job as job
    where job.jobname = 'number-bomb-online-expiry-cleanup'
  ) then
    raise exception 'online contract: canonical Cron jobs missing';
  end if;
end;
$$;
