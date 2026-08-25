begin;

select plan(38);

insert into auth.users (
  id,
  aud,
  role,
  raw_app_meta_data,
  raw_user_meta_data,
  is_anonymous,
  created_at,
  updated_at
) values
  ('30000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp(), clock_timestamp()),
  ('30000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp(), clock_timestamp()),
  ('30000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp(), clock_timestamp()),
  ('30000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp(), clock_timestamp());

set local role authenticated;

create temporary table nb_timeout_state (
  key text primary key,
  payload jsonb not null
) on commit drop;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
insert into nb_timeout_state values (
  'create_self',
  public.create_room(
    'Lease Host',
    4::smallint,
    15::smallint,
    'SELF_DESTRUCT',
    'FIRST_SEAT',
    true,
    '40000000-0000-4000-8000-000000000001'
  )
);

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
insert into nb_timeout_state values (
  'join_self',
  public.join_room(
    (select payload->'room'->>'code' from nb_timeout_state where key = 'create_self'),
    'Lease Peer',
    '40000000-0000-4000-8000-000000000002'
  )
);

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);

select is(
  (select count(*)::integer
   from public.rooms
   where id = ((select payload->'room'->>'id' from nb_timeout_state where key = 'create_self'))::uuid),
  0,
  'RLS hides a room from a non-member'
);

select throws_ok(
  $$insert into public.rooms (code, host_player_id) values ('ABCDE', gen_random_uuid())$$,
  '42501',
  'permission denied for table rooms',
  'authenticated clients have no direct canonical INSERT'
);

select throws_ok(
  $$select bomb_number from private.game_secrets$$,
  '42501',
  'permission denied for table game_secrets',
  'authenticated clients cannot read private bombs'
);

select throws_ok(
  $$select auth_user_id from public.room_players$$,
  '42501',
  'permission denied for table room_players',
  'another player Auth UID cannot be selected'
);

reset role;
update public.room_players
set last_seen_at = clock_timestamp() - interval '46 seconds'
where id = ((select payload->'room'->>'hostPlayerId' from nb_timeout_state where key = 'join_self'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);

insert into nb_timeout_state values (
  'claim_host',
  public.claim_host(
    ((select payload->'room'->>'id' from nb_timeout_state where key = 'join_self'))::uuid,
    ((select payload->'room'->>'hostPlayerId' from nb_timeout_state where key = 'join_self'))::uuid,
    ((select payload->'room'->>'version' from nb_timeout_state where key = 'join_self'))::bigint,
    '40000000-0000-4000-8000-000000000003'
  )
);

select is(
  (select payload->>'code' from nb_timeout_state where key = 'claim_host'),
  'OK',
  'active peer claims host after the exact durable lease'
);

select is(
  (select payload->'room'->>'hostPlayerId' from nb_timeout_state where key = 'claim_host'),
  (select payload->>'selfPlayerId' from nb_timeout_state where key = 'claim_host'),
  'host migration selects the lowest recently seen active seat'
);

insert into nb_timeout_state values (
  'claim_stale',
  public.claim_host(
    ((select payload->'room'->>'id' from nb_timeout_state where key = 'join_self'))::uuid,
    ((select payload->'room'->>'hostPlayerId' from nb_timeout_state where key = 'join_self'))::uuid,
    ((select payload->'room'->>'version' from nb_timeout_state where key = 'join_self'))::bigint,
    '40000000-0000-4000-8000-000000000004'
  )
);

select is(
  (select payload->>'code' from nb_timeout_state where key = 'claim_stale'),
  'STALE_ROOM_VERSION',
  'concurrent host claims converge by room version'
);

insert into nb_timeout_state values (
  'start_self',
  public.start_game(
    ((select payload->'room'->>'id' from nb_timeout_state where key = 'claim_host'))::uuid,
    ((select payload->'room'->>'version' from nb_timeout_state where key = 'claim_host'))::bigint,
    '40000000-0000-4000-8000-000000000005'
  )
);

select is(
  (select payload->>'code' from nb_timeout_state where key = 'start_self'),
  'OK',
  'migrated host can start the game'
);

reset role;
update public.room_games
set turn_deadline_at = clock_timestamp() - interval '1 millisecond',
    turn_started_at = clock_timestamp() - interval '16 seconds'
where id = ((select payload->'game'->>'id' from nb_timeout_state where key = 'start_self'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);

insert into nb_timeout_state values (
  'timeout_self',
  public.resolve_turn_timeout(
    ((select payload->'room'->>'id' from nb_timeout_state where key = 'start_self'))::uuid,
    ((select payload->'game'->>'id' from nb_timeout_state where key = 'start_self'))::uuid,
    ((select payload->'game'->>'version' from nb_timeout_state where key = 'start_self'))::bigint,
    ((select payload->'game'->>'currentPlayerId' from nb_timeout_state where key = 'start_self'))::uuid,
    '40000000-0000-4000-8000-000000000006'
  )
);

select is(
  (select payload->>'code' from nb_timeout_state where key = 'timeout_self'),
  'OK',
  'any active member can trigger a due timeout'
);

select is(
  (select payload->'game'->'pending'->>'origin' from nb_timeout_state where key = 'timeout_self'),
  'TIMEOUT_SELF_DESTRUCT',
  'SELF_DESTRUCT enters its exact pending origin'
);

select is(
  (select payload->'game'->'pending'->>'lockedNumber' from nb_timeout_state where key = 'timeout_self'),
  null,
  'SELF_DESTRUCT does not pretend a number was selected'
);

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
insert into nb_timeout_state values (
  'late_lock',
  public.lock_number(
    ((select payload->'room'->>'id' from nb_timeout_state where key = 'start_self'))::uuid,
    ((select payload->'game'->>'id' from nb_timeout_state where key = 'start_self'))::uuid,
    ((select payload->'game'->>'version' from nb_timeout_state where key = 'start_self'))::bigint,
    50::smallint,
    '40000000-0000-4000-8000-000000000007'
  )
);

select is(
  (select payload->>'code' from nb_timeout_state where key = 'late_lock'),
  'STALE_GAME_VERSION',
  'timeout-v-lock race loser receives canonical stale state'
);

insert into nb_timeout_state values (
  'early_finalize',
  public.finalize_resolution(
    ((select payload->'room'->>'id' from nb_timeout_state where key = 'timeout_self'))::uuid,
    ((select payload->'game'->>'id' from nb_timeout_state where key = 'timeout_self'))::uuid,
    ((select payload->'game'->>'version' from nb_timeout_state where key = 'timeout_self'))::bigint,
    '40000000-0000-4000-8000-000000000008'
  )
);

select is(
  (select payload->>'code' from nb_timeout_state where key = 'early_finalize'),
  'TOO_EARLY',
  'resolution cannot reveal before server resolution_at'
);

reset role;
update public.room_games
set resolution_at = clock_timestamp() - interval '1 millisecond'
where id = ((select payload->'game'->>'id' from nb_timeout_state where key = 'timeout_self'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);

insert into nb_timeout_state values (
  'final_self',
  public.finalize_resolution(
    ((select payload->'room'->>'id' from nb_timeout_state where key = 'timeout_self'))::uuid,
    ((select payload->'game'->>'id' from nb_timeout_state where key = 'timeout_self'))::uuid,
    ((select payload->'game'->>'version' from nb_timeout_state where key = 'timeout_self'))::bigint,
    '40000000-0000-4000-8000-000000000009'
  )
);

select is(
  (select payload->'game'->>'phase' from nb_timeout_state where key = 'final_self'),
  'FINISHED',
  'SELF_DESTRUCT finalizes the round'
);

select is(
  (select payload->'game'->>'finishReason' from nb_timeout_state where key = 'final_self'),
  'TIMEOUT_SELF_DESTRUCT',
  'SELF_DESTRUCT uses timeout-specific result copy contract'
);

select is(
  (select payload->'game'->>'loserPlayerId' from nb_timeout_state where key = 'final_self'),
  (select payload->'game'->>'startingPlayerId' from nb_timeout_state where key = 'start_self'),
  'SELF_DESTRUCT records the timed-out player as loser'
);

insert into nb_timeout_state values (
  'final_retry',
  public.finalize_resolution(
    ((select payload->'room'->>'id' from nb_timeout_state where key = 'timeout_self'))::uuid,
    ((select payload->'game'->>'id' from nb_timeout_state where key = 'timeout_self'))::uuid,
    ((select payload->'game'->>'version' from nb_timeout_state where key = 'timeout_self'))::bigint,
    '40000000-0000-4000-8000-000000000009'
  )
);

select is(
  (select payload from nb_timeout_state where key = 'final_retry'),
  (select payload from nb_timeout_state where key = 'final_self'),
  'finalization retry returns the exact first response'
);

insert into nb_timeout_state values (
  'final_race_loser',
  public.finalize_resolution(
    ((select payload->'room'->>'id' from nb_timeout_state where key = 'timeout_self'))::uuid,
    ((select payload->'game'->>'id' from nb_timeout_state where key = 'timeout_self'))::uuid,
    ((select payload->'game'->>'version' from nb_timeout_state where key = 'timeout_self'))::bigint,
    '40000000-0000-4000-8000-000000000010'
  )
);

select is(
  (select payload->>'code' from nb_timeout_state where key = 'final_race_loser'),
  'ALREADY_RESOLVED',
  'later finalization contender is harmless'
);

insert into nb_timeout_state values (
  'to_lobby',
  public.return_to_lobby(
    ((select payload->'room'->>'id' from nb_timeout_state where key = 'final_self'))::uuid,
    ((select payload->'room'->>'version' from nb_timeout_state where key = 'final_self'))::bigint,
    '40000000-0000-4000-8000-000000000011'
  )
);

select is(
  (select payload->'room'->>'status' from nb_timeout_state where key = 'to_lobby'),
  'LOBBY',
  'host can return a finished room to lobby'
);

insert into nb_timeout_state values (
  'set_random',
  public.update_room_settings(
    ((select payload->'room'->>'id' from nb_timeout_state where key = 'to_lobby'))::uuid,
    ((select payload->'room'->>'version' from nb_timeout_state where key = 'to_lobby'))::bigint,
    4::smallint,
    15::smallint,
    'RANDOM_PICK',
    'FIRST_SEAT',
    true,
    '40000000-0000-4000-8000-000000000012'
  )
);

select is(
  (select payload->'room'->'settings'->>'timeoutPolicy' from nb_timeout_state where key = 'set_random'),
  'RANDOM_PICK',
  'timeout policy is mutable only back in lobby'
);

insert into nb_timeout_state values (
  'start_random',
  public.start_game(
    ((select payload->'room'->>'id' from nb_timeout_state where key = 'set_random'))::uuid,
    ((select payload->'room'->>'version' from nb_timeout_state where key = 'set_random'))::bigint,
    '40000000-0000-4000-8000-000000000013'
  )
);

select is(
  (select payload->'game'->>'roundNumber' from nb_timeout_state where key = 'start_random'),
  '2',
  'new lobby start creates the next retained round'
);

reset role;
update public.room_games
set turn_deadline_at = clock_timestamp() - interval '1 millisecond',
    turn_started_at = clock_timestamp() - interval '16 seconds'
where id = ((select payload->'game'->>'id' from nb_timeout_state where key = 'start_random'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);

insert into nb_timeout_state values (
  'timeout_random',
  public.resolve_turn_timeout(
    ((select payload->'room'->>'id' from nb_timeout_state where key = 'start_random'))::uuid,
    ((select payload->'game'->>'id' from nb_timeout_state where key = 'start_random'))::uuid,
    ((select payload->'game'->>'version' from nb_timeout_state where key = 'start_random'))::bigint,
    ((select payload->'game'->>'currentPlayerId' from nb_timeout_state where key = 'start_random'))::uuid,
    '40000000-0000-4000-8000-000000000014'
  )
);

select is(
  (select payload->>'code' from nb_timeout_state where key = 'timeout_random'),
  'OK',
  'RANDOM_PICK resolves due turn server-side'
);

select ok(
  ((select payload->'game'->'pending'->>'lockedNumber' from nb_timeout_state where key = 'timeout_random'))::integer
    between 1 and 99,
  'timeout random pick is inside exact canonical bounds'
);

select is(
  (select payload->'game'->'pending'->>'origin' from nb_timeout_state where key = 'timeout_random'),
  'TIMEOUT_RANDOM',
  'RANDOM_PICK exposes only canonical pending origin and candidate'
);

select is(
  (select payload->'game'->>'revealedBombNumber' from nb_timeout_state where key = 'timeout_random'),
  null,
  'random timeout does not reveal its outcome early'
);

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
insert into nb_timeout_state values (
  'create_strikes',
  public.create_room(
    'Strike Host',
    2::smallint,
    15::smallint,
    'RANDOM_PICK_WITH_2_STRIKES',
    'FIRST_SEAT',
    false,
    '40000000-0000-4000-8000-000000000015'
  )
);

select is(
  (select payload->>'code' from nb_timeout_state where key = 'create_strikes'),
  'OK',
  'strike-policy room can be created independently'
);

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000004', true);
insert into nb_timeout_state values (
  'join_strikes',
  public.join_room(
    (select payload->'room'->>'code' from nb_timeout_state where key = 'create_strikes'),
    'Strike Peer',
    '40000000-0000-4000-8000-000000000016'
  )
);

select is(
  (select payload->>'code' from nb_timeout_state where key = 'join_strikes'),
  'OK',
  'second strike-policy participant joins'
);

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
insert into nb_timeout_state values (
  'start_strikes',
  public.start_game(
    ((select payload->'room'->>'id' from nb_timeout_state where key = 'join_strikes'))::uuid,
    ((select payload->'room'->>'version' from nb_timeout_state where key = 'join_strikes'))::bigint,
    '40000000-0000-4000-8000-000000000017'
  )
);

select is(
  (select payload->>'code' from nb_timeout_state where key = 'start_strikes'),
  'OK',
  'strike-policy game starts'
);

reset role;
update public.room_games
set turn_deadline_at = clock_timestamp() - interval '1 millisecond',
    turn_started_at = clock_timestamp() - interval '16 seconds'
where id = ((select payload->'game'->>'id' from nb_timeout_state where key = 'start_strikes'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000004', true);

insert into nb_timeout_state values (
  'strike_one',
  public.resolve_turn_timeout(
    ((select payload->'room'->>'id' from nb_timeout_state where key = 'start_strikes'))::uuid,
    ((select payload->'game'->>'id' from nb_timeout_state where key = 'start_strikes'))::uuid,
    ((select payload->'game'->>'version' from nb_timeout_state where key = 'start_strikes'))::bigint,
    ((select payload->'game'->>'currentPlayerId' from nb_timeout_state where key = 'start_strikes'))::uuid,
    '40000000-0000-4000-8000-000000000018'
  )
);

select is(
  (select payload->>'code' from nb_timeout_state where key = 'strike_one'),
  'OK',
  'first strike performs a server random pick'
);

select is(
  (select payload->'gamePlayers'->0->>'timeoutStrikes' from nb_timeout_state where key = 'strike_one'),
  '1',
  'first timeout persists one round-scoped strike'
);

select is(
  (select payload->'action'->>'origin' from nb_timeout_state where key = 'strike_one'),
  'TIMEOUT_FIRST_STRIKE',
  'first-strike audit origin is exact'
);

reset role;
do $$
declare
  v_game_id uuid := ((select payload->'game'->>'id' from nb_timeout_state where key = 'strike_one'))::uuid;
  v_selected smallint := ((select payload->'game'->'pending'->>'lockedNumber' from nb_timeout_state where key = 'strike_one'))::smallint;
  v_next_player uuid;
begin
  select participant.player_id into v_next_player
  from public.game_players as participant
  where participant.game_id = v_game_id
    and participant.seat = 2;

  update private.game_secrets
  set pending_outcome = 'SAFE',
      pending_next_lower = case when v_selected < 99 then v_selected + 1 else 1 end,
      pending_next_upper = case when v_selected < 99 then 99 else 98 end,
      pending_next_player_id = v_next_player,
      pending_loser_player_id = null,
      pending_finish_reason = null
  where game_id = v_game_id;

  update public.room_games
  set resolution_at = clock_timestamp() - interval '1 millisecond'
  where id = v_game_id;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000004', true);

insert into nb_timeout_state values (
  'strike_safe',
  public.finalize_resolution(
    ((select payload->'room'->>'id' from nb_timeout_state where key = 'strike_one'))::uuid,
    ((select payload->'game'->>'id' from nb_timeout_state where key = 'strike_one'))::uuid,
    ((select payload->'game'->>'version' from nb_timeout_state where key = 'strike_one'))::bigint,
    '40000000-0000-4000-8000-000000000019'
  )
);

select is(
  (select payload->>'code' from nb_timeout_state where key = 'strike_safe'),
  'OK',
  'first-strike SAFE finalization keeps the game active'
);

reset role;
update public.room_games
set current_player_id = ((select payload->'game'->>'startingPlayerId' from nb_timeout_state where key = 'start_strikes'))::uuid,
    turn_started_at = clock_timestamp() - interval '16 seconds',
    turn_deadline_at = clock_timestamp() - interval '1 millisecond'
where id = ((select payload->'game'->>'id' from nb_timeout_state where key = 'start_strikes'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000004', true);

insert into nb_timeout_state values (
  'strike_two',
  public.resolve_turn_timeout(
    ((select payload->'room'->>'id' from nb_timeout_state where key = 'strike_safe'))::uuid,
    ((select payload->'game'->>'id' from nb_timeout_state where key = 'strike_safe'))::uuid,
    ((select payload->'game'->>'version' from nb_timeout_state where key = 'strike_safe'))::bigint,
    ((select payload->'game'->>'startingPlayerId' from nb_timeout_state where key = 'start_strikes'))::uuid,
    '40000000-0000-4000-8000-000000000020'
  )
);

select is(
  (select payload->>'code' from nb_timeout_state where key = 'strike_two'),
  'OK',
  'same player second timeout resolves canonically'
);

select is(
  (select payload->'game'->'pending'->>'origin' from nb_timeout_state where key = 'strike_two'),
  'TIMEOUT_STRIKES_EXCEEDED',
  'second strike becomes exact timeout-loss origin'
);

select is(
  (select payload->'game'->'pending'->>'lockedNumber' from nb_timeout_state where key = 'strike_two'),
  null,
  'second strike does not fabricate a random candidate'
);

select is(
  (select payload->'gamePlayers'->0->>'timeoutStrikes' from nb_timeout_state where key = 'strike_two'),
  '2',
  'second timeout persists strike count two'
);

reset role;
update public.room_games
set resolution_at = clock_timestamp() - interval '1 millisecond'
where id = ((select payload->'game'->>'id' from nb_timeout_state where key = 'strike_two'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000004', true);

insert into nb_timeout_state values (
  'strike_finish',
  public.finalize_resolution(
    ((select payload->'room'->>'id' from nb_timeout_state where key = 'strike_two'))::uuid,
    ((select payload->'game'->>'id' from nb_timeout_state where key = 'strike_two'))::uuid,
    ((select payload->'game'->>'version' from nb_timeout_state where key = 'strike_two'))::bigint,
    '40000000-0000-4000-8000-000000000021'
  )
);

select is(
  (select payload->'game'->>'finishReason' from nb_timeout_state where key = 'strike_finish'),
  'TIMEOUT_STRIKES_EXCEEDED',
  'second strike finalizes with timeout-specific reason'
);

select is(
  (select payload->'game'->>'loserPlayerId' from nb_timeout_state where key = 'strike_finish'),
  (select payload->'game'->>'startingPlayerId' from nb_timeout_state where key = 'start_strikes'),
  'second strike records the correct victim'
);

select * from finish();
rollback;
