create or replace function private.online_resolution_delay_ms(p_candidate_count integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_candidate_count between 31 and 99 then
    return private.secure_random_int(450, 550);
  elsif p_candidate_count between 16 and 30 then
    return private.secure_random_int(520, 640);
  elsif p_candidate_count between 8 and 15 then
    return private.secure_random_int(600, 740);
  elsif p_candidate_count between 4 and 7 then
    return private.secure_random_int(700, 860);
  elsif p_candidate_count between 1 and 3 then
    return private.secure_random_int(820, 1000);
  end if;

  raise exception 'invalid candidate count';
end;
$$;

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
    and participant.seat > v_current_seat
  order by participant.seat
  limit 1;

  if v_next_player_id is null then
    select participant.player_id
      into v_next_player_id
    from public.game_players as participant
    where participant.game_id = p_game_id
    order by participant.seat
    limit 1;
  end if;

  return v_next_player_id;
end;
$$;

create or replace function private.start_online_round_engine(
  p_room_id uuid,
  p_requested_by_player_id uuid,
  p_request_id uuid
)
returns table(game_id uuid, action_id bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_game_id uuid := extensions.gen_random_uuid();
  v_round_number integer;
  v_starting_player_id uuid;
  v_participant_count integer;
  v_random_offset integer;
  v_bomb_number smallint;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_action_id bigint;
begin
  select room.*
    into v_room
  from public.rooms as room
  where room.id = p_room_id
  for update;

  select pg_catalog.count(*)::integer
    into v_participant_count
  from public.room_players as player
  where player.room_id = p_room_id
    and player.membership_status = 'ACTIVE';

  if v_participant_count not between 2 and 4
     or v_participant_count > v_room.max_players then
    raise exception 'invalid online participant count';
  end if;

  select coalesce(pg_catalog.max(game.round_number), 0) + 1
    into v_round_number
  from public.room_games as game
  where game.room_id = p_room_id;

  if v_room.starter_mode = 'RANDOM' then
    v_random_offset := private.secure_random_int(0, v_participant_count - 1);
  else
    v_random_offset := 0;
  end if;

  select player.id
    into v_starting_player_id
  from public.room_players as player
  where player.room_id = p_room_id
    and player.membership_status = 'ACTIVE'
  order by player.seat
  offset v_random_offset
  limit 1;

  v_bomb_number := private.secure_random_int(1, 99)::smallint;

  insert into public.room_games (
    id,
    room_id,
    round_number,
    current_player_id,
    starting_player_id,
    turn_started_at,
    turn_deadline_at
  ) values (
    v_game_id,
    p_room_id,
    v_round_number,
    v_starting_player_id,
    v_starting_player_id,
    v_now,
    v_now + pg_catalog.make_interval(secs => v_room.turn_timeout_seconds)
  );

  insert into public.game_players (
    game_id,
    room_id,
    player_id,
    seat
  )
  select
    v_game_id,
    p_room_id,
    player.id,
    player.seat
  from public.room_players as player
  where player.room_id = p_room_id
    and player.membership_status = 'ACTIVE'
  order by player.seat;

  insert into private.game_secrets (game_id, bomb_number)
  values (v_game_id, v_bomb_number);

  insert into public.game_actions (
    room_id,
    game_id,
    game_version,
    turn_number,
    actor_player_id,
    requested_by_player_id,
    action_type,
    action_origin,
    lower_before,
    upper_before,
    lower_after,
    upper_after,
    request_id
  ) values (
    p_room_id,
    v_game_id,
    1,
    1,
    v_starting_player_id,
    p_requested_by_player_id,
    'GAME_STARTED',
    'HOST_START',
    1,
    99,
    1,
    99,
    p_request_id
  )
  returning id into v_action_id;

  update public.rooms as room
  set status = 'PLAYING',
      version = room.version + 1,
      last_activity_at = v_now,
      expires_at = v_now + interval '24 hours',
      updated_at = v_now
  where room.id = p_room_id;

  return query select v_game_id, v_action_id;
end;
$$;

create or replace function private.enter_online_resolution_engine(
  p_room_id uuid,
  p_game_id uuid,
  p_actor_player_id uuid,
  p_pending_origin text,
  p_action_origin text,
  p_selected_number smallint,
  p_requested_by_player_id uuid,
  p_request_id uuid,
  p_strike_count_after smallint default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_game public.room_games%rowtype;
  v_secret private.game_secrets%rowtype;
  v_outcome text;
  v_next_lower smallint;
  v_next_upper smallint;
  v_next_player_id uuid;
  v_loser_player_id uuid;
  v_finish_reason text;
  v_delay_ms integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_action_id bigint;
  v_action_type text;
begin
  select game.* into v_game
  from public.room_games as game
  where game.id = p_game_id
    and game.room_id = p_room_id
  for update;

  select secret.* into v_secret
  from private.game_secrets as secret
  where secret.game_id = p_game_id
  for update;

  if p_pending_origin in ('TIMEOUT_SELF_DESTRUCT', 'TIMEOUT_STRIKES_EXCEEDED') then
    v_outcome := 'TIMEOUT_LOSS';
    v_loser_player_id := p_actor_player_id;
    v_finish_reason := case p_pending_origin
      when 'TIMEOUT_SELF_DESTRUCT' then 'TIMEOUT_SELF_DESTRUCT'
      else 'TIMEOUT_STRIKES_EXCEEDED'
    end;
  elsif p_selected_number = v_secret.bomb_number then
    v_outcome := 'BOOM';
    v_loser_player_id := p_actor_player_id;
    v_finish_reason := 'BOMB_HIT';
  elsif p_selected_number < v_secret.bomb_number then
    v_outcome := 'SAFE';
    v_next_lower := (p_selected_number + 1)::smallint;
    v_next_upper := v_game.upper_candidate;
    v_next_player_id := private.next_online_player_id(p_game_id, p_actor_player_id);
  else
    v_outcome := 'SAFE';
    v_next_lower := v_game.lower_candidate;
    v_next_upper := (p_selected_number - 1)::smallint;
    v_next_player_id := private.next_online_player_id(p_game_id, p_actor_player_id);
  end if;

  v_delay_ms := private.online_resolution_delay_ms(
    v_game.upper_candidate - v_game.lower_candidate + 1
  );

  update private.game_secrets as secret
  set pending_outcome = v_outcome,
      pending_next_lower = v_next_lower,
      pending_next_upper = v_next_upper,
      pending_next_player_id = v_next_player_id,
      pending_loser_player_id = v_loser_player_id,
      pending_finish_reason = v_finish_reason,
      updated_at = v_now
  where secret.game_id = p_game_id;

  update public.room_games as game
  set phase = 'RESOLVING',
      pending_locked_number = p_selected_number,
      pending_actor_player_id = p_actor_player_id,
      pending_action_origin = p_pending_origin,
      resolution_at = v_now + (v_delay_ms::text || ' milliseconds')::interval,
      version = game.version + 1,
      updated_at = v_now
  where game.id = p_game_id;

  v_action_type := case
    when p_pending_origin = 'PLAYER_LOCK' then 'NUMBER_LOCKED'
    else 'TURN_TIMEOUT'
  end;

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
    lower_before,
    upper_before,
    lower_after,
    upper_after,
    strike_count_after,
    request_id
  ) values (
    p_room_id,
    p_game_id,
    v_game.version + 1,
    v_game.turn_number,
    p_actor_player_id,
    p_requested_by_player_id,
    v_action_type,
    p_action_origin,
    p_selected_number,
    v_game.lower_candidate,
    v_game.upper_candidate,
    v_game.lower_candidate,
    v_game.upper_candidate,
    p_strike_count_after,
    p_request_id
  )
  returning id into v_action_id;

  update public.rooms as room
  set last_activity_at = v_now,
      updated_at = v_now
  where room.id = p_room_id;

  return v_action_id;
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
     or v_game.phase <> 'PLAYING_TURN'
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

  if v_secret.pending_outcome = 'SAFE' then
    v_next_started_at := v_now + interval '520 milliseconds';
    v_lower_after := v_secret.pending_next_lower;
    v_upper_after := v_secret.pending_next_upper;

    update public.room_games as game
    set phase = 'PLAYING_TURN',
        lower_candidate = v_secret.pending_next_lower,
        upper_candidate = v_secret.pending_next_upper,
        current_player_id = v_secret.pending_next_player_id,
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
    where room.id = p_room_id;
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

create or replace function public.start_game(
  p_room_id uuid,
  p_expected_room_version bigint,
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
  v_player_id uuid;
  v_active_count integer;
  v_game_id uuid;
  v_action_id bigint;
begin
  v_claim := private.claim_online_mutation(v_user_id, p_request_id, 'START_GAME');
  if v_claim is not null then return v_claim; end if;

  select room.* into v_room
  from public.rooms as room
  where room.id = p_room_id
  for update;

  select player.id into v_player_id
  from public.room_players as player
  where player.room_id = p_room_id
    and player.auth_user_id = v_user_id
    and player.membership_status = 'ACTIVE';

  select pg_catalog.count(*)::integer into v_active_count
  from public.room_players as player
  where player.room_id = p_room_id
    and player.membership_status = 'ACTIVE';

  if v_room.id is null then
    v_response := private.online_result('ROOM_NOT_FOUND');
  elsif v_player_id is null then
    v_response := private.online_result('NOT_ROOM_MEMBER');
  elsif v_room.host_player_id <> v_player_id then
    v_response := private.online_room_snapshot(p_room_id, 'NOT_HOST', false);
  elsif v_room.status <> 'LOBBY' then
    v_response := private.online_room_snapshot(p_room_id, 'INVALID_PHASE', false);
  elsif v_room.version <> p_expected_room_version then
    v_response := private.online_room_snapshot(p_room_id, 'STALE_ROOM_VERSION', false);
  elsif v_active_count not between 2 and 4 or v_active_count > v_room.max_players then
    v_response := private.online_room_snapshot(p_room_id, 'NOT_ENOUGH_PLAYERS', false);
  else
    select started.game_id, started.action_id
      into v_game_id, v_action_id
    from private.start_online_round_engine(
      p_room_id,
      v_player_id,
      p_request_id
    ) as started;
    v_response := private.online_room_snapshot(p_room_id, 'OK', true, v_action_id);
  end if;

  return private.complete_online_mutation(v_user_id, p_request_id, p_room_id, v_game_id, v_response);
exception when others then
  return private.online_result('ONLINE_UNAVAILABLE');
end;
$$;

create or replace function public.lock_number(
  p_room_id uuid,
  p_game_id uuid,
  p_expected_game_version bigint,
  p_selected_number smallint,
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
  v_game public.room_games%rowtype;
  v_player_id uuid;
  v_action_id bigint;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  v_claim := private.claim_online_mutation(v_user_id, p_request_id, 'LOCK_NUMBER');
  if v_claim is not null then return v_claim; end if;

  perform 1 from public.rooms as room where room.id = p_room_id for update;

  select player.id into v_player_id
  from public.room_players as player
  where player.room_id = p_room_id
    and player.auth_user_id = v_user_id
    and player.membership_status = 'ACTIVE';

  select game.* into v_game
  from public.room_games as game
  where game.id = p_game_id
    and game.room_id = p_room_id
  for update;

  if v_player_id is null then
    v_response := private.online_result('NOT_ROOM_MEMBER');
  elsif v_game.id is null then
    v_response := private.online_room_snapshot(p_room_id, 'GAME_NOT_FOUND', false);
  elsif v_game.version <> p_expected_game_version then
    v_response := private.online_room_snapshot(p_room_id, 'STALE_GAME_VERSION', false);
  elsif v_game.phase <> 'PLAYING_TURN' then
    v_response := private.online_room_snapshot(p_room_id, 'INVALID_PHASE', false);
  elsif v_game.current_player_id <> v_player_id then
    v_response := private.online_room_snapshot(p_room_id, 'NOT_YOUR_TURN', false);
  elsif v_now < v_game.turn_started_at then
    v_response := private.online_room_snapshot(p_room_id, 'TOO_EARLY', false);
  elsif v_now >= v_game.turn_deadline_at then
    v_response := private.online_room_snapshot(p_room_id, 'DEADLINE_PASSED', false);
  elsif p_selected_number is null
      or p_selected_number < v_game.lower_candidate
      or p_selected_number > v_game.upper_candidate then
    v_response := private.online_room_snapshot(p_room_id, 'INVALID_CANDIDATE', false);
  else
    v_action_id := private.enter_online_resolution_engine(
      p_room_id,
      p_game_id,
      v_player_id,
      'PLAYER_LOCK',
      'PLAYER_LOCK',
      p_selected_number,
      v_player_id,
      p_request_id
    );
    v_response := private.online_room_snapshot(p_room_id, 'OK', true, v_action_id);
  end if;

  return private.complete_online_mutation(v_user_id, p_request_id, p_room_id, p_game_id, v_response);
exception when others then
  return private.online_result('ONLINE_UNAVAILABLE');
end;
$$;

create or replace function public.resolve_turn_timeout(
  p_room_id uuid,
  p_game_id uuid,
  p_expected_game_version bigint,
  p_expected_current_player_id uuid,
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
  v_game public.room_games%rowtype;
  v_requester_player_id uuid;
  v_action_id bigint;
begin
  v_claim := private.claim_online_mutation(v_user_id, p_request_id, 'RESOLVE_TURN_TIMEOUT');
  if v_claim is not null then return v_claim; end if;

  perform 1 from public.rooms as room where room.id = p_room_id for update;

  select player.id into v_requester_player_id
  from public.room_players as player
  where player.room_id = p_room_id
    and player.auth_user_id = v_user_id
    and player.membership_status = 'ACTIVE';

  select game.* into v_game
  from public.room_games as game
  where game.id = p_game_id
    and game.room_id = p_room_id
  for update;

  if v_requester_player_id is null then
    v_response := private.online_result('NOT_ROOM_MEMBER');
  elsif v_game.id is null then
    v_response := private.online_room_snapshot(p_room_id, 'GAME_NOT_FOUND', false);
  elsif v_game.phase <> 'PLAYING_TURN' then
    v_response := private.online_room_snapshot(p_room_id, 'ALREADY_RESOLVED', false);
  elsif v_game.version <> p_expected_game_version
      or v_game.current_player_id <> p_expected_current_player_id then
    v_response := private.online_room_snapshot(p_room_id, 'STALE_GAME_VERSION', false);
  elsif pg_catalog.clock_timestamp() < v_game.turn_deadline_at then
    v_response := private.online_room_snapshot(p_room_id, 'TOO_EARLY', false);
  else
    v_action_id := private.resolve_online_timeout_engine(
      p_room_id,
      p_game_id,
      v_requester_player_id,
      p_request_id
    );
    v_response := private.online_room_snapshot(p_room_id, 'OK', true, v_action_id);
  end if;

  return private.complete_online_mutation(v_user_id, p_request_id, p_room_id, p_game_id, v_response);
exception when others then
  return private.online_result('ONLINE_UNAVAILABLE');
end;
$$;

create or replace function public.finalize_resolution(
  p_room_id uuid,
  p_game_id uuid,
  p_expected_game_version bigint,
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
  v_game public.room_games%rowtype;
  v_requester_player_id uuid;
  v_action_id bigint;
begin
  v_claim := private.claim_online_mutation(v_user_id, p_request_id, 'FINALIZE_RESOLUTION');
  if v_claim is not null then return v_claim; end if;

  perform 1 from public.rooms as room where room.id = p_room_id for update;

  select player.id into v_requester_player_id
  from public.room_players as player
  where player.room_id = p_room_id
    and player.auth_user_id = v_user_id
    and player.membership_status = 'ACTIVE';

  select game.* into v_game
  from public.room_games as game
  where game.id = p_game_id
    and game.room_id = p_room_id
  for update;

  if v_requester_player_id is null then
    v_response := private.online_result('NOT_ROOM_MEMBER');
  elsif v_game.id is null then
    v_response := private.online_room_snapshot(p_room_id, 'GAME_NOT_FOUND', false);
  elsif v_game.phase <> 'RESOLVING' then
    v_response := private.online_room_snapshot(p_room_id, 'ALREADY_RESOLVED', false);
  elsif v_game.version <> p_expected_game_version then
    v_response := private.online_room_snapshot(p_room_id, 'STALE_GAME_VERSION', false);
  elsif pg_catalog.clock_timestamp() < v_game.resolution_at then
    v_response := private.online_room_snapshot(p_room_id, 'TOO_EARLY', false);
  else
    v_action_id := private.finalize_online_resolution_engine(
      p_room_id,
      p_game_id,
      v_requester_player_id,
      p_request_id
    );
    v_response := private.online_room_snapshot(p_room_id, 'OK', true, v_action_id);
  end if;

  return private.complete_online_mutation(v_user_id, p_request_id, p_room_id, p_game_id, v_response);
exception when others then
  return private.online_result('ONLINE_UNAVAILABLE');
end;
$$;

create or replace function public.restart_game(
  p_room_id uuid,
  p_expected_room_version bigint,
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
  v_player_id uuid;
  v_active_count integer;
  v_game_id uuid;
  v_action_id bigint;
begin
  v_claim := private.claim_online_mutation(v_user_id, p_request_id, 'RESTART_GAME');
  if v_claim is not null then return v_claim; end if;

  select room.* into v_room
  from public.rooms as room
  where room.id = p_room_id
  for update;

  select player.id into v_player_id
  from public.room_players as player
  where player.room_id = p_room_id
    and player.auth_user_id = v_user_id
    and player.membership_status = 'ACTIVE';

  select pg_catalog.count(*)::integer into v_active_count
  from public.room_players as player
  where player.room_id = p_room_id
    and player.membership_status = 'ACTIVE';

  if v_room.id is null then
    v_response := private.online_result('ROOM_NOT_FOUND');
  elsif v_player_id is null then
    v_response := private.online_result('NOT_ROOM_MEMBER');
  elsif v_room.host_player_id <> v_player_id then
    v_response := private.online_room_snapshot(p_room_id, 'NOT_HOST', false);
  elsif v_room.status <> 'FINISHED' then
    v_response := private.online_room_snapshot(p_room_id, 'INVALID_PHASE', false);
  elsif v_room.version <> p_expected_room_version then
    v_response := private.online_room_snapshot(p_room_id, 'STALE_ROOM_VERSION', false);
  elsif v_active_count not between 2 and 4 or v_active_count > v_room.max_players then
    v_response := private.online_room_snapshot(p_room_id, 'NOT_ENOUGH_PLAYERS', false);
  else
    select started.game_id, started.action_id
      into v_game_id, v_action_id
    from private.start_online_round_engine(
      p_room_id,
      v_player_id,
      p_request_id
    ) as started;
    v_response := private.online_room_snapshot(p_room_id, 'OK', true, v_action_id);
  end if;

  return private.complete_online_mutation(v_user_id, p_request_id, p_room_id, v_game_id, v_response);
exception when others then
  return private.online_result('ONLINE_UNAVAILABLE');
end;
$$;

create or replace function public.return_to_lobby(
  p_room_id uuid,
  p_expected_room_version bigint,
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
  v_player_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  v_claim := private.claim_online_mutation(v_user_id, p_request_id, 'RETURN_TO_LOBBY');
  if v_claim is not null then return v_claim; end if;

  select room.* into v_room
  from public.rooms as room
  where room.id = p_room_id
  for update;

  select player.id into v_player_id
  from public.room_players as player
  where player.room_id = p_room_id
    and player.auth_user_id = v_user_id
    and player.membership_status = 'ACTIVE';

  if v_room.id is null then
    v_response := private.online_result('ROOM_NOT_FOUND');
  elsif v_player_id is null then
    v_response := private.online_result('NOT_ROOM_MEMBER');
  elsif v_room.host_player_id <> v_player_id then
    v_response := private.online_room_snapshot(p_room_id, 'NOT_HOST', false);
  elsif v_room.status <> 'FINISHED' then
    v_response := private.online_room_snapshot(p_room_id, 'INVALID_PHASE', false);
  elsif v_room.version <> p_expected_room_version then
    v_response := private.online_room_snapshot(p_room_id, 'STALE_ROOM_VERSION', false);
  else
    update public.rooms as room
    set status = 'LOBBY',
        version = room.version + 1,
        last_activity_at = v_now,
        expires_at = v_now + interval '24 hours',
        updated_at = v_now
    where room.id = p_room_id;
    v_response := private.online_room_snapshot(p_room_id);
  end if;

  return private.complete_online_mutation(v_user_id, p_request_id, p_room_id, null, v_response);
exception when others then
  return private.online_result('ONLINE_UNAVAILABLE');
end;
$$;

revoke execute on function public.start_game(uuid, bigint, uuid) from public, anon, authenticated;
revoke execute on function public.lock_number(uuid, uuid, bigint, smallint, uuid) from public, anon, authenticated;
revoke execute on function public.resolve_turn_timeout(uuid, uuid, bigint, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.finalize_resolution(uuid, uuid, bigint, uuid) from public, anon, authenticated;
revoke execute on function public.restart_game(uuid, bigint, uuid) from public, anon, authenticated;
revoke execute on function public.return_to_lobby(uuid, bigint, uuid) from public, anon, authenticated;

grant execute on function public.start_game(uuid, bigint, uuid) to authenticated;
grant execute on function public.lock_number(uuid, uuid, bigint, smallint, uuid) to authenticated;
grant execute on function public.resolve_turn_timeout(uuid, uuid, bigint, uuid, uuid) to authenticated;
grant execute on function public.finalize_resolution(uuid, uuid, bigint, uuid) to authenticated;
grant execute on function public.restart_game(uuid, bigint, uuid) to authenticated;
grant execute on function public.return_to_lobby(uuid, bigint, uuid) to authenticated;
