begin;

select plan(28);

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
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp(), clock_timestamp()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp(), clock_timestamp()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp(), clock_timestamp());

set local role authenticated;

create temporary table nb_online_test_state (
  key text primary key,
  payload jsonb not null
) on commit drop;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

insert into nb_online_test_state values (
  'create',
  public.create_room(
    '  Player   One  ',
    2::smallint,
    20::smallint,
    'RANDOM_PICK_WITH_2_STRIKES',
    'FIRST_SEAT',
    true,
    '20000000-0000-4000-8000-000000000001'
  )
);

select is(
  (select payload->>'code' from nb_online_test_state where key = 'create'),
  'OK',
  'host creates a room'
);

select is(
  (select payload->'players'->0->>'nickname' from nb_online_test_state where key = 'create'),
  'Player One',
  'nickname whitespace is normalized server-side'
);

select matches(
  (select payload->'room'->>'code' from nb_online_test_state where key = 'create'),
  '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$',
  'room code uses the canonical alphabet'
);

select is(
  (select payload->>'selfPlayerId' from nb_online_test_state where key = 'create'),
  (select payload->'players'->0->>'id' from nb_online_test_state where key = 'create'),
  'snapshot identifies only the caller canonical player ID'
);

insert into nb_online_test_state values (
  'create_retry',
  public.create_room(
    'Different Name',
    4::smallint,
    30::smallint,
    'SELF_DESTRUCT',
    'RANDOM',
    false,
    '20000000-0000-4000-8000-000000000001'
  )
);

select is(
  (select payload from nb_online_test_state where key = 'create_retry'),
  (select payload from nb_online_test_state where key = 'create'),
  'same operation and request ID returns the exact first response'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);

insert into nb_online_test_state values (
  'join',
  public.join_room(
    (select payload->'room'->>'code' from nb_online_test_state where key = 'create'),
    'Player Two',
    '20000000-0000-4000-8000-000000000002'
  )
);

select is(
  (select payload->>'code' from nb_online_test_state where key = 'join'),
  'OK',
  'second identity joins the room'
);

select is(
  jsonb_array_length((select payload->'players' from nb_online_test_state where key = 'join')),
  2,
  'join snapshot has both active members'
);

insert into nb_online_test_state values (
  'join_again',
  public.join_room(
    (select payload->'room'->>'code' from nb_online_test_state where key = 'create'),
    'Ignored Rename',
    '20000000-0000-4000-8000-000000000003'
  )
);

select is(
  (select payload->>'code' from nb_online_test_state where key = 'join_again'),
  'ALREADY_JOINED',
  'same identity deep-link recovers its existing active seat'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);

insert into nb_online_test_state values (
  'join_full',
  public.join_room(
    (select payload->'room'->>'code' from nb_online_test_state where key = 'create'),
    'Player Three',
    '20000000-0000-4000-8000-000000000004'
  )
);

select is(
  (select payload->>'code' from nb_online_test_state where key = 'join_full'),
  'ROOM_FULL',
  'max-player setting is canonical'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);

insert into nb_online_test_state values (
  'non_host_settings',
  public.update_room_settings(
    ((select payload->'room'->>'id' from nb_online_test_state where key = 'join'))::uuid,
    ((select payload->'room'->>'version' from nb_online_test_state where key = 'join'))::bigint,
    2::smallint,
    20::smallint,
    'RANDOM_PICK',
    'FIRST_SEAT',
    true,
    '20000000-0000-4000-8000-000000000005'
  )
);

select is(
  (select payload->>'code' from nb_online_test_state where key = 'non_host_settings'),
  'NOT_HOST',
  'non-host cannot change settings'
);

insert into nb_online_test_state values (
  'request_reused',
  public.leave_room(
    ((select payload->'room'->>'id' from nb_online_test_state where key = 'join'))::uuid,
    '20000000-0000-4000-8000-000000000002'
  )
);

select is(
  (select payload->>'code' from nb_online_test_state where key = 'request_reused'),
  'REQUEST_ID_REUSED',
  'request ID cannot be reused for another operation'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

insert into nb_online_test_state values (
  'start',
  public.start_game(
    ((select payload->'room'->>'id' from nb_online_test_state where key = 'join'))::uuid,
    ((select payload->'room'->>'version' from nb_online_test_state where key = 'join'))::bigint,
    '20000000-0000-4000-8000-000000000006'
  )
);

select is(
  (select payload->>'code' from nb_online_test_state where key = 'start'),
  'OK',
  'host starts with two durable active members'
);

select is(
  (select payload->'game'->>'phase' from nb_online_test_state where key = 'start'),
  'PLAYING_TURN',
  'new game begins in PLAYING_TURN'
);

select is(
  (select payload->'game'->>'revealedBombNumber' from nb_online_test_state where key = 'start'),
  null,
  'bomb is absent from the public game before finish'
);

select isnt(
  strpos((select payload::text from nb_online_test_state where key = 'start'), 'bomb_number'),
  1,
  'response does not contain a private bomb_number field'
);

reset role;

update private.game_secrets
set bomb_number = 81
where game_id = ((select payload->'game'->>'id' from nb_online_test_state where key = 'start'))::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);

insert into nb_online_test_state values (
  'wrong_turn',
  public.lock_number(
    ((select payload->'room'->>'id' from nb_online_test_state where key = 'start'))::uuid,
    ((select payload->'game'->>'id' from nb_online_test_state where key = 'start'))::uuid,
    ((select payload->'game'->>'version' from nb_online_test_state where key = 'start'))::bigint,
    58::smallint,
    '20000000-0000-4000-8000-000000000007'
  )
);

select is(
  (select payload->>'code' from nb_online_test_state where key = 'wrong_turn'),
  'NOT_YOUR_TURN',
  'only canonical current player can lock'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

insert into nb_online_test_state values (
  'safe_lock',
  public.lock_number(
    ((select payload->'room'->>'id' from nb_online_test_state where key = 'start'))::uuid,
    ((select payload->'game'->>'id' from nb_online_test_state where key = 'start'))::uuid,
    ((select payload->'game'->>'version' from nb_online_test_state where key = 'start'))::bigint,
    58::smallint,
    '20000000-0000-4000-8000-000000000008'
  )
);

select is(
  (select payload->'game'->>'phase' from nb_online_test_state where key = 'safe_lock'),
  'RESOLVING',
  'valid lock enters synchronized RESOLVING'
);

select is(
  (select payload->'game'->'pending'->>'lockedNumber' from nb_online_test_state where key = 'safe_lock'),
  '58',
  'locked candidate is public while outcome remains private'
);

select is(
  (select payload->'game'->>'lastOutcome' from nb_online_test_state where key = 'safe_lock'),
  null,
  'outcome is not exposed during RESOLVING'
);

reset role;
update public.room_games
set resolution_at = clock_timestamp() - interval '1 millisecond'
where id = ((select payload->'game'->>'id' from nb_online_test_state where key = 'start'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);

insert into nb_online_test_state values (
  'safe_finalize',
  public.finalize_resolution(
    ((select payload->'room'->>'id' from nb_online_test_state where key = 'start'))::uuid,
    ((select payload->'game'->>'id' from nb_online_test_state where key = 'start'))::uuid,
    ((select payload->'game'->>'version' from nb_online_test_state where key = 'safe_lock'))::bigint,
    '20000000-0000-4000-8000-000000000009'
  )
);

select is(
  (select payload->'game'->>'lowerCandidate' from nb_online_test_state where key = 'safe_finalize'),
  '59',
  'SAFE commits exact lower bound'
);

select is(
  (select payload->'game'->>'currentPlayerId' from nb_online_test_state where key = 'safe_finalize'),
  (select payload->>'selfPlayerId' from nb_online_test_state where key = 'join'),
  'SAFE rotates to the next immutable seat'
);

reset role;
update public.room_games
set turn_started_at = clock_timestamp() - interval '1 millisecond',
    turn_deadline_at = clock_timestamp() + interval '20 seconds'
where id = ((select payload->'game'->>'id' from nb_online_test_state where key = 'start'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);

insert into nb_online_test_state values (
  'boom_lock',
  public.lock_number(
    ((select payload->'room'->>'id' from nb_online_test_state where key = 'start'))::uuid,
    ((select payload->'game'->>'id' from nb_online_test_state where key = 'start'))::uuid,
    ((select payload->'game'->>'version' from nb_online_test_state where key = 'safe_finalize'))::bigint,
    81::smallint,
    '20000000-0000-4000-8000-000000000010'
  )
);

select is(
  (select payload->'game'->>'revealedBombNumber' from nb_online_test_state where key = 'boom_lock'),
  null,
  'BOOM outcome and bomb remain hidden during resolution delay'
);

reset role;
update public.room_games
set resolution_at = clock_timestamp() - interval '1 millisecond'
where id = ((select payload->'game'->>'id' from nb_online_test_state where key = 'start'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

insert into nb_online_test_state values (
  'boom_finalize',
  public.finalize_resolution(
    ((select payload->'room'->>'id' from nb_online_test_state where key = 'start'))::uuid,
    ((select payload->'game'->>'id' from nb_online_test_state where key = 'start'))::uuid,
    ((select payload->'game'->>'version' from nb_online_test_state where key = 'boom_lock'))::bigint,
    '20000000-0000-4000-8000-000000000011'
  )
);

select is(
  (select payload->'game'->>'phase' from nb_online_test_state where key = 'boom_finalize'),
  'FINISHED',
  'bomb hit finalizes the game'
);

select is(
  (select payload->'game'->>'revealedBombNumber' from nb_online_test_state where key = 'boom_finalize'),
  '81',
  'bomb is revealed only after finalization'
);

select is(
  (select payload->'game'->>'loserPlayerId' from nb_online_test_state where key = 'boom_finalize'),
  (select payload->>'selfPlayerId' from nb_online_test_state where key = 'join'),
  'correct losing player is canonical'
);

select is(
  (select payload->'game'->>'finishReason' from nb_online_test_state where key = 'boom_finalize'),
  'BOMB_HIT',
  'bomb loss records exact finish reason'
);

insert into nb_online_test_state values (
  'restart',
  public.restart_game(
    ((select payload->'room'->>'id' from nb_online_test_state where key = 'boom_finalize'))::uuid,
    ((select payload->'room'->>'version' from nb_online_test_state where key = 'boom_finalize'))::bigint,
    '20000000-0000-4000-8000-000000000012'
  )
);

select is(
  (select payload->'game'->>'roundNumber' from nb_online_test_state where key = 'restart'),
  '2',
  'restart retains history and creates the next round'
);

select is(
  (select count(*)::integer from public.game_actions
   where room_id = ((select payload->'room'->>'id' from nb_online_test_state where key = 'restart'))::uuid),
  6,
  'canonical action history is append-only across replay'
);

select * from finish();
rollback;
