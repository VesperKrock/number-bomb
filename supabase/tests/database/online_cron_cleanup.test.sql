begin;

select plan(19);

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
  ('50000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp(), clock_timestamp()),
  ('50000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp(), clock_timestamp()),
  ('50000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp() - interval '31 days', clock_timestamp()),
  ('50000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', '{}', '{}', true, clock_timestamp() - interval '31 days', clock_timestamp());

create temporary table nb_cron_state (
  key text primary key,
  payload jsonb not null
) on commit drop;

grant all on table nb_cron_state to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);

insert into nb_cron_state values (
  'create',
  public.create_room(
    'Cron Host',
    2::smallint,
    15::smallint,
    'SELF_DESTRUCT',
    'FIRST_SEAT',
    true,
    '60000000-0000-4000-8000-000000000001'
  )
);

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000002', true);
insert into nb_cron_state values (
  'join',
  public.join_room(
    (select payload->'room'->>'code' from nb_cron_state where key = 'create'),
    'Cron Peer',
    '60000000-0000-4000-8000-000000000002'
  )
);

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
insert into nb_cron_state values (
  'start',
  public.start_game(
    ((select payload->'room'->>'id' from nb_cron_state where key = 'join'))::uuid,
    ((select payload->'room'->>'version' from nb_cron_state where key = 'join'))::bigint,
    '60000000-0000-4000-8000-000000000003'
  )
);

reset role;
update public.room_games
set turn_deadline_at = clock_timestamp() - interval '1 millisecond'
where id = ((select payload->'game'->>'id' from nb_cron_state where key = 'start'))::uuid;

select is(
  private.sweep_due_online_games(10),
  1,
  'Cron sweep claims and processes one due turn'
);

select is(
  (select phase from public.room_games
   where id = ((select payload->'game'->>'id' from nb_cron_state where key = 'start'))::uuid),
  'RESOLVING',
  'Cron timeout enters the synchronized resolving phase'
);

select is(
  (select pending_action_origin from public.room_games
   where id = ((select payload->'game'->>'id' from nb_cron_state where key = 'start'))::uuid),
  'TIMEOUT_SELF_DESTRUCT',
  'Cron preserves the configured timeout policy'
);

select is(
  (select pending_locked_number from public.room_games
   where id = ((select payload->'game'->>'id' from nb_cron_state where key = 'start'))::uuid),
  null::smallint,
  'SELF_DESTRUCT Cron resolution does not fabricate a selected number'
);

select ok(
  (select requested_by_player_id is null and request_id is null
   from public.game_actions
   where game_id = ((select payload->'game'->>'id' from nb_cron_state where key = 'start'))::uuid
     and action_type = 'TURN_TIMEOUT'),
  'Cron action is canonical without impersonating a player request'
);

select is(
  private.sweep_due_online_games(10),
  0,
  'Cron does not finalize before the canonical resolution timestamp'
);

update public.room_games
set resolution_at = clock_timestamp() - interval '1 millisecond'
where id = ((select payload->'game'->>'id' from nb_cron_state where key = 'start'))::uuid;

select is(
  private.sweep_due_online_games(10),
  1,
  'Cron finalizes one due resolution'
);

select is(
  (select phase from public.room_games
   where id = ((select payload->'game'->>'id' from nb_cron_state where key = 'start'))::uuid),
  'FINISHED',
  'Cron finalization closes the round'
);

select is(
  (select finish_reason from public.room_games
   where id = ((select payload->'game'->>'id' from nb_cron_state where key = 'start'))::uuid),
  'TIMEOUT_SELF_DESTRUCT',
  'Cron finalization records the timeout-specific finish reason'
);

select ok(
  (select revealed_bomb_number between 1 and 99 from public.room_games
   where id = ((select payload->'game'->>'id' from nb_cron_state where key = 'start'))::uuid),
  'Cron reveals the server bomb only after FINISHED'
);

select is(
  private.sweep_due_online_games(10),
  0,
  'Repeated Cron sweeps are idempotent'
);

insert into private.mutation_requests (
  auth_user_id,
  request_id,
  operation,
  response,
  expires_at
) values (
  '50000000-0000-4000-8000-000000000003',
  '60000000-0000-4000-8000-000000000004',
  'CREATE_ROOM',
  '{}'::jsonb,
  clock_timestamp() - interval '1 millisecond'
);

select is(
  private.cleanup_expired_online_data(10),
  1,
  'Cleanup removes an expired idempotency record'
);

select is(
  (select count(*)::integer from private.mutation_requests
   where request_id = '60000000-0000-4000-8000-000000000004'),
  0,
  'Expired idempotency data is gone'
);

update public.rooms
set expires_at = clock_timestamp() - interval '1 millisecond'
where id = ((select payload->'room'->>'id' from nb_cron_state where key = 'start'))::uuid;

select is(
  private.cleanup_expired_online_data(10),
  1,
  'Cleanup removes one expired room root'
);

select is(
  (select count(*)::integer from public.rooms
   where id = ((select payload->'room'->>'id' from nb_cron_state where key = 'start'))::uuid),
  0,
  'Expired room data is removed'
);

select is(
  (select count(*)::integer from private.game_secrets
   where game_id = ((select payload->'game'->>'id' from nb_cron_state where key = 'start'))::uuid),
  0,
  'Room cleanup cascades through private game secrets'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000004', true);
insert into nb_cron_state values (
  'guard_room',
  public.create_room(
    'Guarded User',
    2::smallint,
    20::smallint,
    'RANDOM_PICK',
    'RANDOM',
    false,
    '60000000-0000-4000-8000-000000000005'
  )
);

reset role;

select is(
  private.cleanup_orphaned_anonymous_users(10),
  1,
  'Anonymous cleanup removes one old orphan account'
);

select is(
  (select count(*)::integer from auth.users
   where id = '50000000-0000-4000-8000-000000000003'),
  0,
  'Old anonymous account without membership is removed'
);

select is(
  (select count(*)::integer from auth.users
   where id = '50000000-0000-4000-8000-000000000004'),
  1,
  'Anonymous account referenced by membership is retained'
);

select * from finish();
rollback;
