alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players (
  id,
  room_id,
  nickname,
  seat,
  membership_status,
  joined_at,
  last_seen_at,
  left_at
);
alter publication supabase_realtime add table public.room_games;
alter publication supabase_realtime add table public.game_players;

grant select, insert on table realtime.messages to authenticated;

create policy online_room_messages_select
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and private.is_active_room_topic(
      (select realtime.topic()),
      (select auth.uid())
    )
  );

create policy online_room_messages_insert
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and private.is_active_room_topic(
      (select realtime.topic()),
      (select auth.uid())
    )
  );

create or replace function private.sweep_due_online_games(p_limit integer default 100)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_due record;
  v_action_id bigint;
  v_processed integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'invalid sweep limit';
  end if;

  for v_due in
    select game.id as game_id,
           game.room_id,
           game.phase
    from public.room_games as game
    join public.rooms as room on room.id = game.room_id
    where (
      game.phase = 'PLAYING_TURN'
      and game.turn_deadline_at <= pg_catalog.clock_timestamp()
    ) or (
      game.phase = 'RESOLVING'
      and game.resolution_at <= pg_catalog.clock_timestamp()
    )
    order by case
      when game.phase = 'PLAYING_TURN' then game.turn_deadline_at
      else game.resolution_at
    end
    limit p_limit
    for update of room, game skip locked
  loop
    if v_due.phase = 'PLAYING_TURN' then
      v_action_id := private.resolve_online_timeout_engine(
        v_due.room_id,
        v_due.game_id,
        null,
        null
      );
    else
      v_action_id := private.finalize_online_resolution_engine(
        v_due.room_id,
        v_due.game_id,
        null,
        null
      );
    end if;

    if v_action_id is not null then
      v_processed := v_processed + 1;
    end if;
  end loop;

  return v_processed;
end;
$$;

create or replace function private.cleanup_expired_online_data(p_limit integer default 500)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted_requests integer := 0;
  v_deleted_rooms integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 2000 then
    raise exception 'invalid cleanup limit';
  end if;

  with expired_requests as (
    select request.auth_user_id, request.request_id
    from private.mutation_requests as request
    where request.expires_at <= pg_catalog.clock_timestamp()
    order by request.expires_at
    limit p_limit
    for update skip locked
  ), deleted as (
    delete from private.mutation_requests as request
    using expired_requests
    where request.auth_user_id = expired_requests.auth_user_id
      and request.request_id = expired_requests.request_id
    returning 1
  )
  select pg_catalog.count(*)::integer into v_deleted_requests from deleted;

  with expired_rooms as (
    select room.id
    from public.rooms as room
    where room.expires_at <= pg_catalog.clock_timestamp()
    order by room.expires_at
    limit p_limit
    for update skip locked
  ), deleted as (
    delete from public.rooms as room
    using expired_rooms
    where room.id = expired_rooms.id
    returning 1
  )
  select pg_catalog.count(*)::integer into v_deleted_rooms from deleted;

  return v_deleted_requests + v_deleted_rooms;
end;
$$;

create or replace function private.cleanup_orphaned_anonymous_users(p_limit integer default 200)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid auth cleanup limit';
  end if;

  with orphaned_users as (
    select account.id
    from auth.users as account
    where account.is_anonymous is true
      and account.created_at <= pg_catalog.clock_timestamp() - interval '30 days'
      and not exists (
        select 1
        from public.room_players as player
        where player.auth_user_id = account.id
      )
    order by account.created_at
    limit p_limit
    for update skip locked
  ), deleted as (
    delete from auth.users as account
    using orphaned_users
    where account.id = orphaned_users.id
    returning 1
  )
  select pg_catalog.count(*)::integer into v_deleted from deleted;

  return v_deleted;
end;
$$;

revoke execute on function private.sweep_due_online_games(integer)
  from public, anon, authenticated;
revoke execute on function private.cleanup_expired_online_data(integer)
  from public, anon, authenticated;
revoke execute on function private.cleanup_orphaned_anonymous_users(integer)
  from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select job.jobid
    from cron.job as job
    where job.jobname in (
      'number-bomb-online-due-sweep',
      'number-bomb-online-expiry-cleanup',
      'number-bomb-online-anonymous-cleanup'
    )
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'number-bomb-online-due-sweep',
    '1 second',
    'select private.sweep_due_online_games(100)'
  );

  perform cron.schedule(
    'number-bomb-online-expiry-cleanup',
    '17 * * * *',
    'select private.cleanup_expired_online_data(500)'
  );

  perform cron.schedule(
    'number-bomb-online-anonymous-cleanup',
    '31 3 * * 0',
    'select private.cleanup_orphaned_anonymous_users(200)'
  );
end;
$$;
