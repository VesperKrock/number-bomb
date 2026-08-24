create or replace function private.online_result(
  p_code text,
  p_ok boolean default false
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', p_ok,
    'code', p_code,
    'serverNow', pg_catalog.clock_timestamp(),
    'selfPlayerId', null,
    'room', null,
    'players', '[]'::jsonb,
    'game', null,
    'gamePlayers', '[]'::jsonb,
    'action', null
  );
$$;

create or replace function private.normalize_online_nickname(p_nickname text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_nickname is null then null
    else pg_catalog.regexp_replace(
      pg_catalog.btrim(p_nickname),
      '[[:space:]]+',
      ' ',
      'g'
    )
  end;
$$;

create or replace function private.normalize_online_room_code(p_code text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_code is null then null
    else pg_catalog.upper(pg_catalog.btrim(p_code))
  end;
$$;

create or replace function private.online_settings_are_valid(
  p_max_players smallint,
  p_turn_timeout_seconds smallint,
  p_timeout_policy text,
  p_starter_mode text
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    p_max_players between 2 and 4
    and p_turn_timeout_seconds between 15 and 30
    and p_timeout_policy in (
      'SELF_DESTRUCT',
      'RANDOM_PICK',
      'RANDOM_PICK_WITH_2_STRIKES'
    )
    and p_starter_mode in ('FIRST_SEAT', 'RANDOM');
$$;

create or replace function private.secure_random_int(
  p_min integer,
  p_max integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_span bigint;
  v_limit bigint;
  v_sample bigint;
  v_bytes bytea;
begin
  if p_min is null or p_max is null or p_min > p_max then
    raise exception 'invalid secure random bounds';
  end if;

  v_span := p_max::bigint - p_min::bigint + 1;
  if v_span > 4294967296 then
    raise exception 'secure random span is too large';
  end if;

  v_limit := 4294967296 - (4294967296 % v_span);

  loop
    v_bytes := extensions.gen_random_bytes(4);
    v_sample :=
      (pg_catalog.get_byte(v_bytes, 0)::bigint << 24)
      | (pg_catalog.get_byte(v_bytes, 1)::bigint << 16)
      | (pg_catalog.get_byte(v_bytes, 2)::bigint << 8)
      | pg_catalog.get_byte(v_bytes, 3)::bigint;

    if v_sample < v_limit then
      return p_min + (v_sample % v_span)::integer;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function private.generate_online_room_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code text := '';
  v_index integer;
begin
  for v_position in 1..5 loop
    v_index := private.secure_random_int(1, pg_catalog.char_length(v_alphabet));
    v_code := v_code || pg_catalog.substr(v_alphabet, v_index, 1);
  end loop;
  return v_code;
end;
$$;

create or replace function private.claim_online_mutation(
  p_auth_user_id uuid,
  p_request_id uuid,
  p_operation text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_operation text;
  v_response jsonb;
begin
  if p_auth_user_id is null then
    return private.online_result('UNAUTHENTICATED');
  end if;

  if p_request_id is null then
    return private.online_result('REQUEST_ID_REUSED');
  end if;

  insert into private.mutation_requests (
    auth_user_id,
    request_id,
    operation
  ) values (
    p_auth_user_id,
    p_request_id,
    p_operation
  )
  on conflict (auth_user_id, request_id) do nothing;

  if found then
    return null;
  end if;

  select request.operation, request.response
    into v_operation, v_response
  from private.mutation_requests as request
  where request.auth_user_id = p_auth_user_id
    and request.request_id = p_request_id
  for update;

  if v_operation is distinct from p_operation then
    return private.online_result('REQUEST_ID_REUSED');
  end if;

  if v_response is not null then
    return v_response;
  end if;

  return private.online_result('ONLINE_UNAVAILABLE');
end;
$$;

create or replace function private.complete_online_mutation(
  p_auth_user_id uuid,
  p_request_id uuid,
  p_room_id uuid,
  p_game_id uuid,
  p_response jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update private.mutation_requests as request
  set room_id = p_room_id,
      game_id = p_game_id,
      response = p_response
  where request.auth_user_id = p_auth_user_id
    and request.request_id = p_request_id;

  return p_response;
end;
$$;

create or replace function private.online_room_snapshot(
  p_room_id uuid,
  p_code text default 'OK',
  p_ok boolean default true,
  p_action_id bigint default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_self_player_id uuid;
  v_is_active boolean := false;
  v_room jsonb;
  v_players jsonb := '[]'::jsonb;
  v_game jsonb;
  v_game_id uuid;
  v_game_players jsonb := '[]'::jsonb;
  v_action jsonb;
begin
  select player.id,
         player.membership_status = 'ACTIVE'
    into v_self_player_id, v_is_active
  from public.room_players as player
  where player.room_id = p_room_id
    and player.auth_user_id = v_user_id;

  select jsonb_build_object(
           'id', room.id,
           'code', room.code,
           'status', room.status,
           'hostPlayerId', room.host_player_id,
           'settings', jsonb_build_object(
             'maxPlayers', room.max_players,
             'turnTimeoutSeconds', room.turn_timeout_seconds,
             'timeoutPolicy', room.timeout_policy,
             'starterMode', room.starter_mode,
             'showLiveSelection', room.show_live_selection
           ),
           'version', room.version,
           'lastActivityAt', room.last_activity_at,
           'expiresAt', room.expires_at
         )
    into v_room
  from public.rooms as room
  where room.id = p_room_id;

  if v_room is null then
    return private.online_result(p_code, p_ok);
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', player.id,
             'roomId', player.room_id,
             'nickname', player.nickname,
             'seat', player.seat,
             'membershipStatus', player.membership_status,
             'joinedAt', player.joined_at,
             'lastSeenAt', player.last_seen_at
           ) order by player.seat
         ), '[]'::jsonb)
    into v_players
  from public.room_players as player
  where player.room_id = p_room_id
    and (v_is_active or player.auth_user_id = v_user_id);

  if v_is_active then
    select game.id,
           jsonb_build_object(
             'id', game.id,
             'roomId', game.room_id,
             'roundNumber', game.round_number,
             'phase', game.phase,
             'lowerCandidate', game.lower_candidate,
             'upperCandidate', game.upper_candidate,
             'currentPlayerId', game.current_player_id,
             'startingPlayerId', game.starting_player_id,
             'turnNumber', game.turn_number,
             'version', game.version,
             'turnStartedAt', game.turn_started_at,
             'turnDeadlineAt', game.turn_deadline_at,
             'pending', case
               when game.phase = 'RESOLVING' then jsonb_build_object(
                 'lockedNumber', game.pending_locked_number,
                 'actorPlayerId', game.pending_actor_player_id,
                 'origin', game.pending_action_origin,
                 'resolutionAt', game.resolution_at
               )
               else null
             end,
             'lastLockedNumber', game.last_locked_number,
             'lastActorPlayerId', game.last_actor_player_id,
             'lastActionOrigin', game.last_action_origin,
             'lastOutcome', game.last_outcome,
             'loserPlayerId', game.loser_player_id,
             'finishReason', game.finish_reason,
             'revealedBombNumber', game.revealed_bomb_number,
             'updatedAt', game.updated_at,
             'finishedAt', game.finished_at
           )
      into v_game_id, v_game
    from public.room_games as game
    where game.room_id = p_room_id
    order by game.round_number desc
    limit 1;

    if v_game_id is not null then
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'gameId', participant.game_id,
                 'playerId', participant.player_id,
                 'seat', participant.seat,
                 'timeoutStrikes', participant.timeout_strikes,
                 'participationStatus', participant.participation_status
               ) order by participant.seat
             ), '[]'::jsonb)
        into v_game_players
      from public.game_players as participant
      where participant.game_id = v_game_id;

      select jsonb_build_object(
               'id', action.id,
               'gameId', action.game_id,
               'gameVersion', action.game_version,
               'turnNumber', action.turn_number,
               'actorPlayerId', action.actor_player_id,
               'type', action.action_type,
               'origin', action.action_origin,
               'selectedNumber', action.selected_number,
               'outcome', action.outcome,
               'finishReason', action.finish_reason,
               'createdAt', action.created_at
             )
        into v_action
      from public.game_actions as action
      where action.game_id = v_game_id
        and (p_action_id is null or action.id = p_action_id)
      order by action.id desc
      limit 1;
    end if;
  end if;

  return jsonb_build_object(
    'ok', p_ok,
    'code', p_code,
    'serverNow', pg_catalog.clock_timestamp(),
    'selfPlayerId', v_self_player_id,
    'room', v_room,
    'players', v_players,
    'game', v_game,
    'gamePlayers', v_game_players,
    'action', v_action
  );
end;
$$;

create or replace function public.get_room_snapshot(p_room_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
begin
  if v_user_id is null then
    return private.online_result('UNAUTHENTICATED');
  end if;

  select player.membership_status
    into v_status
  from public.room_players as player
  where player.room_id = p_room_id
    and player.auth_user_id = v_user_id;

  if v_status is null then
    return private.online_result('NOT_ROOM_MEMBER');
  elsif v_status = 'KICKED' then
    return private.online_room_snapshot(p_room_id, 'KICKED', false);
  elsif v_status <> 'ACTIVE' then
    return private.online_room_snapshot(p_room_id, 'NOT_ROOM_MEMBER', false);
  end if;

  return private.online_room_snapshot(p_room_id);
exception
  when others then
    return private.online_result('ONLINE_UNAVAILABLE');
end;
$$;

create or replace function public.touch_connection(p_room_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return private.online_result('UNAUTHENTICATED');
  end if;

  update public.room_players as player
  set last_seen_at = pg_catalog.clock_timestamp()
  where player.room_id = p_room_id
    and player.auth_user_id = v_user_id
    and player.membership_status = 'ACTIVE';

  if not found then
    return private.online_result('NOT_ROOM_MEMBER');
  end if;

  return private.online_room_snapshot(p_room_id);
exception
  when others then
    return private.online_result('ONLINE_UNAVAILABLE');
end;
$$;

create or replace function public.create_room(
  p_nickname text,
  p_max_players smallint,
  p_turn_timeout_seconds smallint,
  p_timeout_policy text,
  p_starter_mode text,
  p_show_live_selection boolean,
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
  v_nickname text := private.normalize_online_nickname(p_nickname);
  v_room_id uuid := extensions.gen_random_uuid();
  v_player_id uuid := extensions.gen_random_uuid();
  v_code text;
  v_created boolean := false;
begin
  v_claim := private.claim_online_mutation(v_user_id, p_request_id, 'CREATE_ROOM');
  if v_claim is not null then
    return v_claim;
  end if;

  if v_nickname is null
     or pg_catalog.char_length(v_nickname) not between 1 and 20
     or v_nickname ~ '[[:cntrl:]]' then
    v_response := private.online_result('INVALID_NICKNAME');
    return private.complete_online_mutation(v_user_id, p_request_id, null, null, v_response);
  end if;

  if not private.online_settings_are_valid(
    p_max_players,
    p_turn_timeout_seconds,
    p_timeout_policy,
    p_starter_mode
  ) or p_show_live_selection is null then
    v_response := private.online_result('INVALID_SETTINGS');
    return private.complete_online_mutation(v_user_id, p_request_id, null, null, v_response);
  end if;

  for v_attempt in 1..8 loop
    v_code := private.generate_online_room_code();
    begin
      insert into public.rooms (
        id,
        code,
        host_player_id,
        max_players,
        turn_timeout_seconds,
        timeout_policy,
        starter_mode,
        show_live_selection
      ) values (
        v_room_id,
        v_code,
        v_player_id,
        p_max_players,
        p_turn_timeout_seconds,
        p_timeout_policy,
        p_starter_mode,
        p_show_live_selection
      );
      v_created := true;
      exit;
    exception
      when unique_violation then
        v_created := false;
    end;
  end loop;

  if not v_created then
    v_response := private.online_result('ROOM_CODE_EXHAUSTED');
    return private.complete_online_mutation(v_user_id, p_request_id, null, null, v_response);
  end if;

  insert into public.room_players (
    id,
    room_id,
    auth_user_id,
    nickname,
    nickname_key,
    seat
  ) values (
    v_player_id,
    v_room_id,
    v_user_id,
    v_nickname,
    pg_catalog.lower(v_nickname),
    1
  );

  v_response := private.online_room_snapshot(v_room_id);
  return private.complete_online_mutation(
    v_user_id,
    p_request_id,
    v_room_id,
    null,
    v_response
  );
exception
  when others then
    return private.online_result('ONLINE_UNAVAILABLE');
end;
$$;

create or replace function public.join_room(
  p_room_code text,
  p_nickname text,
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
  v_code text := private.normalize_online_room_code(p_room_code);
  v_nickname text := private.normalize_online_nickname(p_nickname);
  v_room public.rooms%rowtype;
  v_existing public.room_players%rowtype;
  v_active_count integer;
  v_seat smallint;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  v_claim := private.claim_online_mutation(v_user_id, p_request_id, 'JOIN_ROOM');
  if v_claim is not null then
    return v_claim;
  end if;

  if v_code is null or v_code !~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$' then
    v_response := private.online_result('INVALID_ROOM_CODE');
    return private.complete_online_mutation(v_user_id, p_request_id, null, null, v_response);
  end if;

  if v_nickname is null
     or pg_catalog.char_length(v_nickname) not between 1 and 20
     or v_nickname ~ '[[:cntrl:]]' then
    v_response := private.online_result('INVALID_NICKNAME');
    return private.complete_online_mutation(v_user_id, p_request_id, null, null, v_response);
  end if;

  select room.*
    into v_room
  from public.rooms as room
  where room.code = v_code
  for update;

  if v_room.id is null then
    v_response := private.online_result('ROOM_NOT_FOUND');
    return private.complete_online_mutation(v_user_id, p_request_id, null, null, v_response);
  end if;

  select player.*
    into v_existing
  from public.room_players as player
  where player.room_id = v_room.id
    and player.auth_user_id = v_user_id
  for update;

  if v_existing.id is not null and v_existing.membership_status = 'ACTIVE' then
    v_response := private.online_room_snapshot(v_room.id, 'ALREADY_JOINED', true);
    return private.complete_online_mutation(v_user_id, p_request_id, v_room.id, null, v_response);
  elsif v_existing.id is not null and v_existing.membership_status = 'KICKED' then
    v_response := private.online_room_snapshot(v_room.id, 'KICKED', false);
    return private.complete_online_mutation(v_user_id, p_request_id, v_room.id, null, v_response);
  end if;

  if v_room.status = 'CLOSED' or v_room.expires_at <= v_now then
    v_response := private.online_result('ROOM_EXPIRED');
    return private.complete_online_mutation(v_user_id, p_request_id, v_room.id, null, v_response);
  elsif v_room.status <> 'LOBBY' then
    v_response := private.online_result('ROOM_ALREADY_PLAYING');
    return private.complete_online_mutation(v_user_id, p_request_id, v_room.id, null, v_response);
  end if;

  select pg_catalog.count(*)::integer
    into v_active_count
  from public.room_players as player
  where player.room_id = v_room.id
    and player.membership_status = 'ACTIVE';

  if v_active_count >= v_room.max_players then
    v_response := private.online_result('ROOM_FULL');
    return private.complete_online_mutation(v_user_id, p_request_id, v_room.id, null, v_response);
  end if;

  if exists (
    select 1
    from public.room_players as player
    where player.room_id = v_room.id
      and player.membership_status = 'ACTIVE'
      and player.nickname_key = pg_catalog.lower(v_nickname)
  ) then
    v_response := private.online_result('NICKNAME_TAKEN');
    return private.complete_online_mutation(v_user_id, p_request_id, v_room.id, null, v_response);
  end if;

  select seat_number::smallint
    into v_seat
  from pg_catalog.generate_series(1, v_room.max_players) as seat_number
  where not exists (
    select 1
    from public.room_players as player
    where player.room_id = v_room.id
      and player.seat = seat_number
      and player.membership_status = 'ACTIVE'
  )
  order by seat_number
  limit 1;

  if v_existing.id is null then
    insert into public.room_players (
      room_id,
      auth_user_id,
      nickname,
      nickname_key,
      seat
    ) values (
      v_room.id,
      v_user_id,
      v_nickname,
      pg_catalog.lower(v_nickname),
      v_seat
    );
  else
    update public.room_players as player
    set nickname = v_nickname,
        nickname_key = pg_catalog.lower(v_nickname),
        seat = v_seat,
        membership_status = 'ACTIVE',
        joined_at = v_now,
        last_seen_at = v_now,
        left_at = null
    where player.id = v_existing.id;
  end if;

  update public.rooms as room
  set version = room.version + 1,
      last_activity_at = v_now,
      expires_at = v_now + interval '24 hours',
      updated_at = v_now
  where room.id = v_room.id;

  v_response := private.online_room_snapshot(v_room.id);
  return private.complete_online_mutation(v_user_id, p_request_id, v_room.id, null, v_response);
exception
  when unique_violation then
    v_response := private.online_result('NICKNAME_TAKEN');
    return private.complete_online_mutation(v_user_id, p_request_id, v_room.id, null, v_response);
  when others then
    return private.online_result('ONLINE_UNAVAILABLE');
end;
$$;

create or replace function public.update_room_settings(
  p_room_id uuid,
  p_expected_room_version bigint,
  p_max_players smallint,
  p_turn_timeout_seconds smallint,
  p_timeout_policy text,
  p_starter_mode text,
  p_show_live_selection boolean,
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
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  v_claim := private.claim_online_mutation(v_user_id, p_request_id, 'UPDATE_ROOM_SETTINGS');
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
  elsif v_room.status <> 'LOBBY' then
    v_response := private.online_room_snapshot(p_room_id, 'ROOM_ALREADY_PLAYING', false);
  elsif v_room.version <> p_expected_room_version then
    v_response := private.online_room_snapshot(p_room_id, 'STALE_ROOM_VERSION', false);
  elsif not private.online_settings_are_valid(
      p_max_players,
      p_turn_timeout_seconds,
      p_timeout_policy,
      p_starter_mode
    ) or p_show_live_selection is null then
    v_response := private.online_room_snapshot(p_room_id, 'INVALID_SETTINGS', false);
  else
    select pg_catalog.count(*)::integer into v_active_count
    from public.room_players as player
    where player.room_id = p_room_id
      and player.membership_status = 'ACTIVE';

    if p_max_players < v_active_count then
      v_response := private.online_room_snapshot(p_room_id, 'INVALID_SETTINGS', false);
    else
      update public.rooms as room
      set max_players = p_max_players,
          turn_timeout_seconds = p_turn_timeout_seconds,
          timeout_policy = p_timeout_policy,
          starter_mode = p_starter_mode,
          show_live_selection = p_show_live_selection,
          version = room.version + 1,
          last_activity_at = v_now,
          expires_at = v_now + interval '24 hours',
          updated_at = v_now
      where room.id = p_room_id;
      v_response := private.online_room_snapshot(p_room_id);
    end if;
  end if;

  return private.complete_online_mutation(v_user_id, p_request_id, p_room_id, null, v_response);
exception when others then
  return private.online_result('ONLINE_UNAVAILABLE');
end;
$$;

create or replace function public.kick_player(
  p_room_id uuid,
  p_target_player_id uuid,
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
  v_target_status text;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  v_claim := private.claim_online_mutation(v_user_id, p_request_id, 'KICK_PLAYER');
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

  select player.membership_status into v_target_status
  from public.room_players as player
  where player.room_id = p_room_id
    and player.id = p_target_player_id
  for update;

  if v_room.id is null then
    v_response := private.online_result('ROOM_NOT_FOUND');
  elsif v_player_id is null then
    v_response := private.online_result('NOT_ROOM_MEMBER');
  elsif v_room.host_player_id <> v_player_id then
    v_response := private.online_room_snapshot(p_room_id, 'NOT_HOST', false);
  elsif v_room.status <> 'LOBBY' then
    v_response := private.online_room_snapshot(p_room_id, 'ROOM_ALREADY_PLAYING', false);
  elsif v_room.version <> p_expected_room_version then
    v_response := private.online_room_snapshot(p_room_id, 'STALE_ROOM_VERSION', false);
  elsif p_target_player_id = v_room.host_player_id or v_target_status is distinct from 'ACTIVE' then
    v_response := private.online_room_snapshot(p_room_id, 'NOT_ROOM_MEMBER', false);
  else
    update public.room_players as player
    set membership_status = 'KICKED',
        left_at = v_now
    where player.room_id = p_room_id
      and player.id = p_target_player_id;

    update public.rooms as room
    set version = room.version + 1,
        last_activity_at = v_now,
        updated_at = v_now
    where room.id = p_room_id;

    v_response := private.online_room_snapshot(p_room_id);
  end if;

  return private.complete_online_mutation(v_user_id, p_request_id, p_room_id, null, v_response);
exception when others then
  return private.online_result('ONLINE_UNAVAILABLE');
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
  v_player_id uuid;
  v_next_host_id uuid;
  v_active_count integer;
  v_game_id uuid;
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

  update public.room_players as player
  set membership_status = 'LEFT',
      left_at = v_now
  where player.id = v_player_id;

  select game.id into v_game_id
  from public.room_games as game
  where game.room_id = p_room_id
    and game.phase <> 'FINISHED'
  order by game.round_number desc
  limit 1
  for update;

  if v_game_id is not null then
    update public.game_players as participant
    set participation_status = 'LEFT'
    where participant.game_id = v_game_id
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
  elsif v_room.host_player_id = v_player_id then
    select player.id into v_next_host_id
    from public.room_players as player
    where player.room_id = p_room_id
      and player.membership_status = 'ACTIVE'
    order by player.seat
    limit 1
    for update;

    update public.rooms as room
    set host_player_id = v_next_host_id,
        version = room.version + 1,
        last_activity_at = v_now,
        updated_at = v_now
    where room.id = p_room_id;
  else
    update public.rooms as room
    set version = room.version + 1,
        last_activity_at = v_now,
        updated_at = v_now
    where room.id = p_room_id;
  end if;

  v_response := private.online_room_snapshot(p_room_id, 'OK', true);
  return private.complete_online_mutation(v_user_id, p_request_id, p_room_id, v_game_id, v_response);
exception when others then
  return private.online_result('ONLINE_UNAVAILABLE');
end;
$$;

create or replace function public.claim_host(
  p_room_id uuid,
  p_expected_host_player_id uuid,
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
  v_host_last_seen_at timestamptz;
  v_next_host_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  v_claim := private.claim_online_mutation(v_user_id, p_request_id, 'CLAIM_HOST');
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
  elsif v_room.version <> p_expected_room_version
      or v_room.host_player_id <> p_expected_host_player_id then
    v_response := private.online_room_snapshot(p_room_id, 'STALE_ROOM_VERSION', false);
  else
    select player.last_seen_at into v_host_last_seen_at
    from public.room_players as player
    where player.room_id = p_room_id
      and player.id = v_room.host_player_id
    for update;

    if v_host_last_seen_at > v_now - interval '45 seconds' then
      v_response := private.online_room_snapshot(p_room_id, 'HOST_STILL_ACTIVE', false);
    else
      select player.id into v_next_host_id
      from public.room_players as player
      where player.room_id = p_room_id
        and player.membership_status = 'ACTIVE'
        and player.last_seen_at > v_now - interval '45 seconds'
      order by player.seat
      limit 1
      for update;

      if v_next_host_id is null then
        v_response := private.online_room_snapshot(p_room_id, 'NO_HOST_CANDIDATE', false);
      else
        update public.rooms as room
        set host_player_id = v_next_host_id,
            version = room.version + 1,
            last_activity_at = v_now,
            updated_at = v_now
        where room.id = p_room_id;
        v_response := private.online_room_snapshot(p_room_id);
      end if;
    end if;
  end if;

  return private.complete_online_mutation(v_user_id, p_request_id, p_room_id, null, v_response);
exception when others then
  return private.online_result('ONLINE_UNAVAILABLE');
end;
$$;

revoke execute on function public.get_room_snapshot(uuid) from public, anon, authenticated;
revoke execute on function public.touch_connection(uuid) from public, anon, authenticated;
revoke execute on function public.create_room(text, smallint, smallint, text, text, boolean, uuid) from public, anon, authenticated;
revoke execute on function public.join_room(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.update_room_settings(uuid, bigint, smallint, smallint, text, text, boolean, uuid) from public, anon, authenticated;
revoke execute on function public.kick_player(uuid, uuid, bigint, uuid) from public, anon, authenticated;
revoke execute on function public.leave_room(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.claim_host(uuid, uuid, bigint, uuid) from public, anon, authenticated;

grant execute on function public.get_room_snapshot(uuid) to authenticated;
grant execute on function public.touch_connection(uuid) to authenticated;
grant execute on function public.create_room(text, smallint, smallint, text, text, boolean, uuid) to authenticated;
grant execute on function public.join_room(text, text, uuid) to authenticated;
grant execute on function public.update_room_settings(uuid, bigint, smallint, smallint, text, text, boolean, uuid) to authenticated;
grant execute on function public.kick_player(uuid, uuid, bigint, uuid) to authenticated;
grant execute on function public.leave_room(uuid, uuid) to authenticated;
grant execute on function public.claim_host(uuid, uuid, bigint, uuid) to authenticated;
