begin;

select no_plan();

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
  ('71000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp(), clock_timestamp()),
  ('71000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp(), clock_timestamp()),
  ('71000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp(), clock_timestamp()),
  ('71000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp(), clock_timestamp()),
  ('71000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp(), clock_timestamp()),
  ('71000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp(), clock_timestamp()),
  ('71000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp(), clock_timestamp()),
  ('71000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp(), clock_timestamp());

set local role authenticated;

create temporary table nb_leave_state (
  key text primary key,
  payload jsonb not null
) on commit drop;

-- Four friends: a non-current departure, then host/current departure.
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
insert into nb_leave_state values (
  'four_create',
  public.create_room(
    'P1 Host',
    4::smallint,
    27::smallint,
    'SELF_DESTRUCT',
    'FIRST_SEAT',
    true,
    '72000000-0000-4000-8000-000000000001'
  )
);

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
insert into nb_leave_state values (
  'four_join_2',
  public.join_room(
    (select payload->'room'->>'code' from nb_leave_state where key = 'four_create'),
    'P2 Friend',
    '72000000-0000-4000-8000-000000000002'
  )
);

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000003', true);
insert into nb_leave_state values (
  'four_join_3',
  public.join_room(
    (select payload->'room'->>'code' from nb_leave_state where key = 'four_create'),
    'P3 Friend',
    '72000000-0000-4000-8000-000000000003'
  )
);

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000004', true);
insert into nb_leave_state values (
  'four_join_4',
  public.join_room(
    (select payload->'room'->>'code' from nb_leave_state where key = 'four_create'),
    'P4 Friend',
    '72000000-0000-4000-8000-000000000004'
  )
);

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
insert into nb_leave_state values (
  'four_start',
  public.start_game(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'four_join_4'))::uuid,
    ((select payload->'room'->>'version' from nb_leave_state where key = 'four_join_4'))::bigint,
    '72000000-0000-4000-8000-000000000005'
  )
);

reset role;
update private.game_secrets
set bomb_number = 81
where game_id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid;
set local role authenticated;

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000004', true);
insert into nb_leave_state values (
  'four_leave_4',
  public.leave_room(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    '72000000-0000-4000-8000-000000000006'
  )
);

reset role;

select is(
  (select participation_status from public.game_players
   where game_id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid
     and seat = 4),
  'LEFT',
  'non-current P4 becomes a historical LEFT game participant'
);

select is(
  (select current_player_id from public.room_games
   where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid),
  ((select payload->'game'->>'currentPlayerId' from nb_leave_state where key = 'four_start'))::uuid,
  'non-current departure leaves the current actor unchanged'
);

select is(
  private.next_online_player_id(
    ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    (select player_id from public.game_players
     where game_id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid
       and seat = 3)
  ),
  (select player_id from public.game_players
   where game_id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid
     and seat = 1),
  'rotation wraps from P3 to P1 and permanently skips LEFT P4'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
insert into nb_leave_state values (
  'four_leave_1',
  public.leave_room(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    '72000000-0000-4000-8000-000000000007'
  )
);

reset role;

select is(
  (select current_player_id from public.room_games
   where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid),
  (select player_id from public.game_players
   where game_id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid
     and seat = 2),
  'current P1 departure atomically advances to active P2'
);

select is(
  (select host_player_id from public.rooms
   where id = ((select payload->'room'->>'id' from nb_leave_state where key = 'four_start'))::uuid),
  (select player_id from public.game_players
   where game_id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid
     and seat = 2),
  'host/current departure migrates host authority to lowest active seat'
);

select is(
  (select turn_number from public.room_games
   where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid),
  2,
  'current departure advances the canonical turn number exactly once'
);

select is(
  (select version from public.room_games
   where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid),
  2::bigint,
  'current departure advances the canonical game version exactly once'
);

select is(
  (select extract(epoch from (turn_deadline_at - turn_started_at))::integer
   from public.room_games
   where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid),
  27,
  'replacement current player receives the configured normal timeout'
);

select ok(
  (select turn_started_at >= clock_timestamp() - interval '2 seconds'
   from public.room_games
   where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid),
  'replacement current player receives a fresh server start timestamp'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
insert into nb_leave_state values (
  'replacement_lock',
  public.lock_number(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    (select version from public.room_games
     where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid),
    25::smallint,
    '72000000-0000-4000-8000-000000000008'
  )
);

reset role;

select is(
  (select payload->>'code' from nb_leave_state where key = 'replacement_lock'),
  'OK',
  'replacement current player can lock a valid SAFE candidate'
);

update public.room_games
set resolution_at = clock_timestamp() - interval '1 millisecond'
where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
insert into nb_leave_state values (
  'replacement_safe',
  public.finalize_resolution(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    ((select payload->'game'->>'version' from nb_leave_state where key = 'replacement_lock'))::bigint,
    '72000000-0000-4000-8000-000000000009'
  )
);

reset role;

select is(
  (select payload->'game'->>'currentPlayerId' from nb_leave_state where key = 'replacement_safe'),
  (select player_id::text from public.game_players
   where game_id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid
     and seat = 3),
  'SAFE rotation after departures selects the next ACTIVE participant'
);

-- Shrink repeatedly to one participant, then prove one-player wraparound.
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000003', true);
insert into nb_leave_state values (
  'four_leave_3',
  public.leave_room(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    '72000000-0000-4000-8000-000000000010'
  )
);

reset role;

select is(
  (select current_player_id from public.room_games
   where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid),
  (select player_id from public.game_players
   where game_id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid
     and seat = 2),
  'three-to-one shrink keeps the sole ACTIVE participant current'
);

select is(
  private.next_online_player_id(
    ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    (select player_id from public.game_players
     where game_id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid
       and seat = 2)
  ),
  (select player_id from public.game_players
   where game_id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid
     and seat = 2),
  'one-player next authority wraps to the same sole ACTIVE participant'
);

reset role;
update public.room_games
set turn_started_at = clock_timestamp() - interval '1 second',
    turn_deadline_at = clock_timestamp() + interval '26 seconds'
where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
insert into nb_leave_state values (
  'solo_lock',
  public.lock_number(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    (select version from public.room_games
     where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid),
    40::smallint,
    '72000000-0000-4000-8000-000000000011'
  )
);

reset role;
update public.room_games
set resolution_at = clock_timestamp() - interval '1 millisecond'
where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
insert into nb_leave_state values (
  'solo_safe',
  public.finalize_resolution(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    ((select payload->'game'->>'version' from nb_leave_state where key = 'solo_lock'))::bigint,
    '72000000-0000-4000-8000-000000000012'
  )
);

reset role;

select is(
  (select payload->'game'->>'currentPlayerId' from nb_leave_state where key = 'solo_safe'),
  (select payload->>'selfPlayerId' from nb_leave_state where key = 'solo_safe'),
  'solo SAFE returns the next turn to the same remaining friend'
);

select is(
  extract(epoch from (
    ((select payload->'game'->>'turnDeadlineAt' from nb_leave_state where key = 'solo_safe'))::timestamptz
      - ((select payload->'game'->>'turnStartedAt' from nb_leave_state where key = 'solo_safe'))::timestamptz
  ))::integer,
  27,
  'solo SAFE refreshes the configured normal timeout without hardcoding 20 seconds'
);

update public.room_games
set turn_started_at = clock_timestamp() - interval '28 seconds',
    turn_deadline_at = clock_timestamp() - interval '1 second'
where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
insert into nb_leave_state values (
  'solo_timeout',
  public.resolve_turn_timeout(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    ((select payload->'game'->>'version' from nb_leave_state where key = 'solo_safe'))::bigint,
    ((select payload->'game'->>'currentPlayerId' from nb_leave_state where key = 'solo_safe'))::uuid,
    '72000000-0000-4000-8000-000000000013'
  )
);

select is(
  (select payload->'game'->'pending'->>'origin' from nb_leave_state where key = 'solo_timeout'),
  'TIMEOUT_SELF_DESTRUCT',
  'solo timeout follows the room existing timeout policy'
);

reset role;
update public.room_games
set resolution_at = clock_timestamp() - interval '1 millisecond'
where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
insert into nb_leave_state values (
  'solo_timeout_finish',
  public.finalize_resolution(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    ((select payload->'game'->>'version' from nb_leave_state where key = 'solo_timeout'))::bigint,
    '72000000-0000-4000-8000-000000000014'
  )
);

reset role;

select is(
  (select payload->'game'->>'phase' from nb_leave_state where key = 'solo_timeout_finish'),
  'FINISHED',
  'solo timeout completes through the existing FINISHED lifecycle'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
insert into nb_leave_state values (
  'solo_leave_last',
  public.leave_room(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    '72000000-0000-4000-8000-000000000015'
  )
);
insert into nb_leave_state values (
  'solo_leave_last_retry',
  public.leave_room(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'four_start'))::uuid,
    '72000000-0000-4000-8000-000000000015'
  )
);

reset role;

select is(
  (select status from public.rooms
   where id = ((select payload->'room'->>'id' from nb_leave_state where key = 'four_start'))::uuid),
  'CLOSED',
  'last ACTIVE friend leaving closes the room immediately'
);

select is(
  (select payload from nb_leave_state where key = 'solo_leave_last_retry'),
  (select payload from nb_leave_state where key = 'solo_leave_last'),
  'duplicate leave request is idempotent'
);

select is(
  (select finish_reason from public.room_games
   where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'four_start'))::uuid),
  'TIMEOUT_SELF_DESTRUCT',
  'leaving after FINISHED does not rewrite the historical result'
);

-- Leave during RESOLVING: a stale pending next player is recomputed from ACTIVE rows.
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000005', true);
insert into nb_leave_state values (
  'resolve_create',
  public.create_room(
    'Resolve Host', 2::smallint, 23::smallint, 'RANDOM_PICK', 'FIRST_SEAT', true,
    '72000000-0000-4000-8000-000000000016'
  )
);
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000006', true);
insert into nb_leave_state values (
  'resolve_join',
  public.join_room(
    (select payload->'room'->>'code' from nb_leave_state where key = 'resolve_create'),
    'Resolve Peer',
    '72000000-0000-4000-8000-000000000017'
  )
);
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000005', true);
insert into nb_leave_state values (
  'resolve_start',
  public.start_game(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'resolve_join'))::uuid,
    ((select payload->'room'->>'version' from nb_leave_state where key = 'resolve_join'))::bigint,
    '72000000-0000-4000-8000-000000000018'
  )
);
reset role;
update private.game_secrets
set bomb_number = 81
where game_id = ((select payload->'game'->>'id' from nb_leave_state where key = 'resolve_start'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000005', true);
insert into nb_leave_state values (
  'resolve_lock',
  public.lock_number(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'resolve_start'))::uuid,
    ((select payload->'game'->>'id' from nb_leave_state where key = 'resolve_start'))::uuid,
    ((select payload->'game'->>'version' from nb_leave_state where key = 'resolve_start'))::bigint,
    25::smallint,
    '72000000-0000-4000-8000-000000000019'
  )
);

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000006', true);
insert into nb_leave_state values (
  'resolve_peer_leave',
  public.leave_room(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'resolve_start'))::uuid,
    '72000000-0000-4000-8000-000000000020'
  )
);

reset role;
update public.room_games
set resolution_at = clock_timestamp() - interval '1 millisecond'
where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'resolve_start'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000005', true);
insert into nb_leave_state values (
  'resolve_finalize',
  public.finalize_resolution(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'resolve_start'))::uuid,
    ((select payload->'game'->>'id' from nb_leave_state where key = 'resolve_start'))::uuid,
    ((select payload->'game'->>'version' from nb_leave_state where key = 'resolve_lock'))::bigint,
    '72000000-0000-4000-8000-000000000021'
  )
);

reset role;

select is(
  (select payload->'game'->>'currentPlayerId' from nb_leave_state where key = 'resolve_finalize'),
  (select payload->>'selfPlayerId' from nb_leave_state where key = 'resolve_finalize'),
  'SAFE finalization with one participant recomputes next player to the sole ACTIVE friend'
);

select is(
  extract(epoch from (
    ((select payload->'game'->>'turnDeadlineAt' from nb_leave_state where key = 'resolve_finalize'))::timestamptz
      - ((select payload->'game'->>'turnStartedAt' from nb_leave_state where key = 'resolve_finalize'))::timestamptz
  ))::integer,
  23,
  'SAFE after a resolving departure preserves the configured room timer'
);

-- If everybody leaves during RESOLVING, preserve the pending canonical result
-- but close the room and keep the scheduler from creating another turn.
reset role;
update public.room_games
set turn_started_at = clock_timestamp() - interval '1 second',
    turn_deadline_at = clock_timestamp() + interval '22 seconds'
where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'resolve_start'))::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000005', true);
insert into nb_leave_state values (
  'resolve_zero_lock',
  public.lock_number(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'resolve_start'))::uuid,
    ((select payload->'game'->>'id' from nb_leave_state where key = 'resolve_start'))::uuid,
    ((select payload->'game'->>'version' from nb_leave_state where key = 'resolve_finalize'))::bigint,
    30::smallint,
    '72000000-0000-4000-8000-000000000022'
  )
);
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000005', true);
insert into nb_leave_state values (
  'resolve_zero_leave',
  public.leave_room(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'resolve_start'))::uuid,
    '72000000-0000-4000-8000-000000000023'
  )
);

reset role;
update public.room_games
set resolution_at = clock_timestamp() - interval '1 millisecond'
where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'resolve_start'))::uuid;

select is(
  (select status from public.rooms
   where id = ((select payload->'room'->>'id' from nb_leave_state where key = 'resolve_start'))::uuid),
  'CLOSED',
  'zero ACTIVE participants during RESOLVING closes the room'
);

select is(
  private.sweep_due_online_games(20),
  0,
  'due sweep ignores a CLOSED empty room even when its resolution is due'
);

select is(
  (select phase from public.room_games
   where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'resolve_start'))::uuid),
  'RESOLVING',
  'empty-room close preserves the already-canonical pending resolution without a new phase'
);

select is(
  (select revealed_bomb_number from public.room_games
   where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'resolve_start'))::uuid),
  null::smallint,
  'empty-room close does not reveal a private pending outcome'
);

-- A separate PLAYING_TURN empty room cannot receive a dangling timeout mutation.
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000007', true);
insert into nb_leave_state values (
  'empty_create',
  public.create_room(
    'Empty Host', 2::smallint, 19::smallint, 'SELF_DESTRUCT', 'FIRST_SEAT', true,
    '72000000-0000-4000-8000-000000000024'
  )
);
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000008', true);
insert into nb_leave_state values (
  'empty_join',
  public.join_room(
    (select payload->'room'->>'code' from nb_leave_state where key = 'empty_create'),
    'Empty Peer',
    '72000000-0000-4000-8000-000000000025'
  )
);
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000007', true);
insert into nb_leave_state values (
  'empty_start',
  public.start_game(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'empty_join'))::uuid,
    ((select payload->'room'->>'version' from nb_leave_state where key = 'empty_join'))::bigint,
    '72000000-0000-4000-8000-000000000026'
  )
);
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000008', true);
insert into nb_leave_state values (
  'empty_peer_leave',
  public.leave_room(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'empty_start'))::uuid,
    '72000000-0000-4000-8000-000000000027'
  )
);
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000007', true);
insert into nb_leave_state values (
  'empty_host_leave',
  public.leave_room(
    ((select payload->'room'->>'id' from nb_leave_state where key = 'empty_start'))::uuid,
    '72000000-0000-4000-8000-000000000028'
  )
);

reset role;
update public.room_games
set turn_started_at = clock_timestamp() - interval '20 seconds',
    turn_deadline_at = clock_timestamp() - interval '1 second'
where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'empty_start'))::uuid;

select is(
  private.sweep_due_online_games(20),
  0,
  'closed PLAYING_TURN room produces no timeout action'
);

select is(
  (select phase from public.room_games
   where id = ((select payload->'game'->>'id' from nb_leave_state where key = 'empty_start'))::uuid),
  'PLAYING_TURN',
  'closed empty room receives no further playable phase mutation'
);

select is(
  (select count(*)::integer from public.game_actions
   where game_id = ((select payload->'game'->>'id' from nb_leave_state where key = 'empty_start'))::uuid),
  1,
  'closed empty room retains only its historical GAME_STARTED action'
);

select * from finish();
rollback;
