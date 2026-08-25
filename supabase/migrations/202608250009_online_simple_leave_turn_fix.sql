-- Friends-room departure semantics:
-- active friends keep playing (including one-player wraparound), while an
-- empty room closes immediately and is ignored by gameplay schedulers.

create or replace function private.next_online_player_id(
  p_game_id uuid,
  p_current_player_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_current_seat smallint;
  v_next_player_id uuid;
begin
  select participant.seat
    into v_current_seat
  from public.game_players as participant
  where participant.game_id = p_game_id
    and participant.player_id = p_current_player_id;

  select participant.player_id
    into v_next_player_id
  from public.game_players as participant
  where participant.game_id = p_game_id
    and participant.participation_status = 'ACTIVE'
    and participant.seat > v_current_seat
  order by participant.seat
  limit 1;

  if v_next_player_id is null then
    select participant.player_id
      into v_next_player_id
    from public.game_players as participant
    where participant.game_id = p_game_id
      and participant.participation_status = 'ACTIVE'
    order by participant.seat
    limit 1;
  end if;

  return v_next_player_id;
end;
$$;

create or replace function public.leave_room(
  p_room_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_claim jsonb;
  v_response jsonb;
  v_room public.rooms%rowtype;
  v_game public.room_games%rowtype;
  v_player_id uuid;
  v_next_host_id uuid;
  v_next_player_id uuid;
  v_active_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  v_claim := private.claim_online_mutation(v_user_id, p_request_id, 'LEAVE_ROOM');
  if v_claim is not null then return v_claim; end if;

  select room.* into v_room
  from public.rooms as room
  where room.id = p_room_id
  for update;

  select player.id into v_player_id
  from public.room_players as player
  where player.room_id = p_room_id
    and player.auth_user_id = v_user_id
    and player.membership_status = 'ACTIVE'
  for update;

  if v_room.id is null then
    v_response := private.online_result('ROOM_NOT_FOUND');
    return private.complete_online_mutation(v_user_id, p_request_id, p_room_id, null, v_response);
  elsif v_player_id is null then
    v_response := private.online_room_snapshot(p_room_id, 'NOT_ROOM_MEMBER', false);
    return private.complete_online_mutation(v_user_id, p_request_id, p_room_id, null, v_response);
  end if;

  select game.* into v_game
  from public.room_games as game
  where game.room_id = p_room_id
  order by game.round_number desc
  limit 1
  for update;

  update public.room_players as player
  set membership_status = 'LEFT',
      left_at = v_now
  where player.id = v_player_id;

  if v_game.id is not null then
    update public.game_players as participant
    set participation_status = 'LEFT'
    where participant.game_id = v_game.id
      and participant.player_id = v_player_id;
  end if;

  select pg_catalog.count(*)::integer into v_active_count
  from public.room_players as player
  where player.room_id = p_room_id
    and player.membership_status = 'ACTIVE';

  if v_active_count = 0 then
    update public.rooms as room
    set status = 'CLOSED',
        version = room.version + 1,
        last_activity_at = v_now,
        expires_at = v_now + interval '1 hour',
        updated_at = v_now
    where room.id = p_room_id;
  else
    if v_room.host_player_id = v_player_id then
      select player.id into v_next_host_id
      from public.room_players as player
      where player.room_id = p_room_id
        and player.membership_status = 'ACTIVE'
      order by player.seat
      limit 1
      for update;
    else
      v_next_host_id := v_room.host_player_id;
    end if;

    if v_game.id is not null
       and v_game.phase = 'PLAYING_TURN'
       and v_game.current_player_id = v_player_id then
      v_next_player_id := private.next_online_player_id(v_game.id, v_player_id);

      if v_next_player_id is null then
        raise exception 'active room has no active game participant';
      end if;

      update public.room_games as game
      set current_player_id = v_next_player_id,
          turn_number = game.turn_number + 1,
          version = game.version + 1,
          turn_started_at = v_now,
          turn_deadline_at = v_now
            + pg_catalog.make_interval(secs => v_room.turn_timeout_seconds),
          updated_at = v_now
      where game.id = v_game.id;
    end if;

    update public.rooms as room
    set host_player_id = v_next_host_id,
        version = room.version + 1,
        last_activity_at = v_now,
        updated_at = v_now
    where room.id = p_room_id;
  end if;

  v_response := private.online_room_snapshot(p_room_id, 'OK', true);
  return private.complete_online_mutation(
    v_user_id,
    p_request_id,
    p_room_id,
    v_game.id,
    v_response
  );
exception when others then
  return private.online_result('ONLINE_UNAVAILABLE');
end;
$$;

create or replace function private.resolve_online_timeout_engine(
  p_room_id uuid,
  p_game_id uuid,
  p_requested_by_player_id uuid,
  p_request_id uuid
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_game public.room_games%rowtype;
  v_strikes smallint;
  v_selected_number smallint;
  v_pending_origin text;
  v_action_origin text;
  v_strike_after smallint;
  v_current_is_active boolean;
begin
  select room.* into v_room
  from public.rooms as room
  where room.id = p_room_id
  for update;

  select game.* into v_game
  from public.room_games as game
  where game.id = p_game_id
    and game.room_id = p_room_id
  for update;

  select participant.participation_status = 'ACTIVE'
    into v_current_is_active
  from public.game_players as participant
  where participant.game_id = p_game_id
    and participant.player_id = v_game.current_player_id
  for update;

  if v_room.id is null
     or v_room.status <> 'PLAYING'
     or v_game.id is null
     or v_game.phase <> 'PLAYING_TURN'
     or v_current_is_active is distinct from true
     or pg_catalog.clock_timestamp() < v_game.turn_deadline_at then
    return null;
  end if;

  select participant.timeout_strikes into v_strikes
  from public.game_players as participant
  where participant.game_id = p_game_id
    and participant.player_id = v_game.current_player_id
  for update;

  if v_room.timeout_policy = 'SELF_DESTRUCT' then
    v_pending_origin := 'TIMEOUT_SELF_DESTRUCT';
    v_action_origin := 'TIMEOUT_SELF_DESTRUCT';
  elsif v_room.timeout_policy = 'RANDOM_PICK_WITH_2_STRIKES' and v_strikes >= 1 then
    v_strike_after := 2;
    update public.game_players as participant
    set timeout_strikes = v_strike_after
    where participant.game_id = p_game_id
      and participant.player_id = v_game.current_player_id;
    v_pending_origin := 'TIMEOUT_STRIKES_EXCEEDED';
    v_action_origin := 'TIMEOUT_STRIKES_EXCEEDED';
  else
    v_selected_number := private.secure_random_int(
      v_game.lower_candidate,
      v_game.upper_candidate
    )::smallint;
    v_pending_origin := 'TIMEOUT_RANDOM';

    if v_room.timeout_policy = 'RANDOM_PICK_WITH_2_STRIKES' then
      v_strike_after := 1;
      update public.game_players as participant
      set timeout_strikes = v_strike_after
      where participant.game_id = p_game_id
        and participant.player_id = v_game.current_player_id;
      v_action_origin := 'TIMEOUT_FIRST_STRIKE';
    else
      v_action_origin := 'TIMEOUT_RANDOM';
    end if;
  end if;

  return private.enter_online_resolution_engine(
    p_room_id,
    p_game_id,
    v_game.current_player_id,
    v_pending_origin,
    v_action_origin,
    v_selected_number,
    p_requested_by_player_id,
    p_request_id,
    v_strike_after
  );
end;
$$;

create or replace function private.finalize_online_resolution_engine(
  p_room_id uuid,
  p_game_id uuid,
  p_requested_by_player_id uuid,
  p_request_id uuid
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_game public.room_games%rowtype;
  v_secret private.game_secrets%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_next_started_at timestamptz;
  v_next_player_id uuid;
  v_active_count integer;
  v_action_id bigint;
  v_lower_after smallint;
  v_upper_after smallint;
begin
  select room.* into v_room
  from public.rooms as room
  where room.id = p_room_id
  for update;

  select game.* into v_game
  from public.room_games as game
  where game.id = p_game_id
    and game.room_id = p_room_id
  for update;

  if v_game.id is null
     or v_game.phase <> 'RESOLVING'
     or v_now < v_game.resolution_at then
    return null;
  end if;

  select secret.* into v_secret
  from private.game_secrets as secret
  where secret.game_id = p_game_id
  for update;

  select pg_catalog.count(*)::integer into v_active_count
  from public.game_players as participant
  where participant.game_id = p_game_id
    and participant.participation_status = 'ACTIVE';

  -- With nobody left, leave the already-canonical pending resolution intact.
  -- The CLOSED room is non-playable and expires through its normal lifecycle.
  if v_active_count = 0 or v_room.status = 'CLOSED' then
    return null;
  end if;

  if v_secret.pending_outcome = 'SAFE' then
    v_next_player_id := private.next_online_player_id(
      p_game_id,
      v_game.pending_actor_player_id
    );

    if v_next_player_id is null then
      raise exception 'safe resolution has no active next participant';
    end if;

    v_next_started_at := v_now + interval '520 milliseconds';
    v_lower_after := v_secret.pending_next_lower;
    v_upper_after := v_secret.pending_next_upper;

    update public.room_games as game
    set phase = 'PLAYING_TURN',
        lower_candidate = v_secret.pending_next_lower,
        upper_candidate = v_secret.pending_next_upper,
        current_player_id = v_next_player_id,
        turn_number = game.turn_number + 1,
        version = game.version + 1,
        turn_started_at = v_next_started_at,
        turn_deadline_at = v_next_started_at
          + pg_catalog.make_interval(secs => v_room.turn_timeout_seconds),
        pending_locked_number = null,
        pending_actor_player_id = null,
        pending_action_origin = null,
        resolution_at = null,
        last_locked_number = v_game.pending_locked_number,
        last_actor_player_id = v_game.pending_actor_player_id,
        last_action_origin = v_game.pending_action_origin,
        last_outcome = 'SAFE',
        updated_at = v_now
    where game.id = p_game_id;
  else
    v_lower_after := v_game.lower_candidate;
    v_upper_after := v_game.upper_candidate;

    update public.room_games as game
    set phase = 'FINISHED',
        version = game.version + 1,
        pending_locked_number = null,
        pending_actor_player_id = null,
        pending_action_origin = null,
        resolution_at = null,
        last_locked_number = v_game.pending_locked_number,
        last_actor_player_id = v_game.pending_actor_player_id,
        last_action_origin = v_game.pending_action_origin,
        last_outcome = v_secret.pending_outcome,
        loser_player_id = v_secret.pending_loser_player_id,
        finish_reason = v_secret.pending_finish_reason,
        revealed_bomb_number = v_secret.bomb_number,
        updated_at = v_now,
        finished_at = v_now
    where game.id = p_game_id;

    update public.rooms as room
    set status = 'FINISHED',
        version = room.version + 1,
        last_activity_at = v_now,
        expires_at = v_now + interval '24 hours',
        updated_at = v_now
    where room.id = p_room_id
      and room.status <> 'CLOSED';
  end if;

  insert into public.game_actions (
    room_id,
    game_id,
    game_version,
    turn_number,
    actor_player_id,
    requested_by_player_id,
    action_type,
    action_origin,
    selected_number,
    outcome,
    finish_reason,
    lower_before,
    upper_before,
    lower_after,
    upper_after,
    request_id
  ) values (
    p_room_id,
    p_game_id,
    v_game.version + 1,
    v_game.turn_number,
    v_game.pending_actor_player_id,
    p_requested_by_player_id,
    'RESOLUTION_FINALIZED',
    'FINALIZE',
    v_game.pending_locked_number,
    v_secret.pending_outcome,
    v_secret.pending_finish_reason,
    v_game.lower_candidate,
    v_game.upper_candidate,
    v_lower_after,
    v_upper_after,
    p_request_id
  )
  returning id into v_action_id;

  update private.game_secrets as secret
  set pending_outcome = null,
      pending_next_lower = null,
      pending_next_upper = null,
      pending_next_player_id = null,
      pending_loser_player_id = null,
      pending_finish_reason = null,
      updated_at = v_now
  where secret.game_id = p_game_id;

  if v_secret.pending_outcome = 'SAFE' then
    update public.rooms as room
    set last_activity_at = v_now,
        updated_at = v_now
    where room.id = p_room_id;
  end if;

  return v_action_id;
end;
$$;

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
    where room.status = 'PLAYING'
      and (
        (
          game.phase = 'PLAYING_TURN'
          and game.turn_deadline_at <= pg_catalog.clock_timestamp()
        ) or (
          game.phase = 'RESOLVING'
          and game.resolution_at <= pg_catalog.clock_timestamp()
        )
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

-- Repair any still-live turn that was stranded by the pre-009 leave contract.
-- This is forward-only state convergence: historical participants/actions stay
-- intact, and every replacement receives the room's configured normal timer.
do $$
declare
  v_stranded record;
  v_next_player_id uuid;
  v_now timestamptz;
begin
  for v_stranded in
    select game.id as game_id,
           game.current_player_id,
           room.turn_timeout_seconds
    from public.room_games as game
    join public.rooms as room on room.id = game.room_id
    join public.game_players as current_participant
      on current_participant.game_id = game.id
     and current_participant.player_id = game.current_player_id
    where room.status = 'PLAYING'
      and game.phase = 'PLAYING_TURN'
      and current_participant.participation_status = 'LEFT'
    for update of room, game
  loop
    v_next_player_id := private.next_online_player_id(
      v_stranded.game_id,
      v_stranded.current_player_id
    );

    if v_next_player_id is not null then
      v_now := pg_catalog.clock_timestamp();
      update public.room_games as game
      set current_player_id = v_next_player_id,
          turn_number = game.turn_number + 1,
          version = game.version + 1,
          turn_started_at = v_now,
          turn_deadline_at = v_now
            + pg_catalog.make_interval(secs => v_stranded.turn_timeout_seconds),
          updated_at = v_now
      where game.id = v_stranded.game_id;
    end if;
  end loop;

  update public.rooms as room
  set status = 'CLOSED',
      version = room.version + 1,
      last_activity_at = pg_catalog.clock_timestamp(),
      expires_at = pg_catalog.clock_timestamp() + interval '1 hour',
      updated_at = pg_catalog.clock_timestamp()
  where room.status <> 'CLOSED'
    and not exists (
      select 1
      from public.room_players as player
      where player.room_id = room.id
        and player.membership_status = 'ACTIVE'
    );
end;
$$;

-- Reassert the migration-008 client boundary after replacing routines.
revoke execute on function private.next_online_player_id(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.resolve_online_timeout_engine(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.finalize_online_resolution_engine(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.sweep_due_online_games(integer)
  from public, anon, authenticated;
revoke execute on function public.leave_room(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.leave_room(uuid, uuid) to authenticated;
