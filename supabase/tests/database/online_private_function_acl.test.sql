begin;

select plan(13);

select cmp_ok(
  (
    select count(*)::integer
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private'
  ),
  '>',
  0,
  'private function inventory is non-empty'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        routine.proacl,
        pg_catalog.acldefault('f', routine.proowner)
      )
    ) as privilege
    where namespace.nspname = 'private'
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  0,
  'no private function grants EXECUTE to PUBLIC'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private'
      and pg_catalog.has_function_privilege('anon', routine.oid, 'EXECUTE')
  ),
  0,
  'anon cannot execute any private function'
);

select set_eq(
  $sql$
    select routine.oid::regprocedure::text
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private'
      and pg_catalog.has_function_privilege(
        'authenticated',
        routine.oid,
        'EXECUTE'
      )
  $sql$,
  array[
    'private.is_active_room_member(uuid,uuid)',
    'private.is_active_room_topic(text,uuid)',
    'private.room_id_from_topic(text)'
  ]::text[],
  'authenticated can execute exactly the three Realtime helpers'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private'
      and routine.oid not in (
        'private.is_active_room_member(uuid,uuid)'::regprocedure,
        'private.is_active_room_topic(text,uuid)'::regprocedure,
        'private.room_id_from_topic(text)'::regprocedure
      )
      and pg_catalog.has_function_privilege(
        'authenticated',
        routine.oid,
        'EXECUTE'
      )
  ),
  0,
  'every private authority engine is denied to authenticated'
);

select set_eq(
  $sql$
    select routine.oid::regprocedure::text
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname in (
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
      )
      and pg_catalog.has_function_privilege(
        'authenticated',
        routine.oid,
        'EXECUTE'
      )
  $sql$,
  array[
    'claim_host(uuid,uuid,bigint,uuid)',
    'create_room(text,smallint,smallint,text,text,boolean,uuid)',
    'finalize_resolution(uuid,uuid,bigint,uuid)',
    'get_room_snapshot(uuid)',
    'join_room(text,text,uuid)',
    'kick_player(uuid,uuid,bigint,uuid)',
    'leave_room(uuid,uuid)',
    'lock_number(uuid,uuid,bigint,smallint,uuid)',
    'resolve_turn_timeout(uuid,uuid,bigint,uuid,uuid)',
    'restart_game(uuid,bigint,uuid)',
    'return_to_lobby(uuid,bigint,uuid)',
    'start_game(uuid,bigint,uuid)',
    'touch_connection(uuid)',
    'update_room_settings(uuid,bigint,smallint,smallint,text,text,boolean,uuid)'
  ]::text[],
  'all 14 public Online RPCs remain executable by authenticated'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname in (
        'get_room_snapshot', 'touch_connection', 'create_room', 'join_room',
        'update_room_settings', 'kick_player', 'leave_room', 'claim_host',
        'start_game', 'lock_number', 'resolve_turn_timeout',
        'finalize_resolution', 'restart_game', 'return_to_lobby'
      )
      and pg_catalog.has_function_privilege('anon', routine.oid, 'EXECUTE')
  ),
  0,
  'anon cannot execute any of the 14 public Online RPCs'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        routine.proacl,
        pg_catalog.acldefault('f', routine.proowner)
      )
    ) as privilege
    where namespace.nspname = 'public'
      and routine.proname in (
        'get_room_snapshot', 'touch_connection', 'create_room', 'join_room',
        'update_room_settings', 'kick_player', 'leave_room', 'claim_host',
        'start_game', 'lock_number', 'resolve_turn_timeout',
        'finalize_resolution', 'restart_game', 'return_to_lobby'
      )
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  0,
  'PUBLIC cannot execute any of the 14 public Online RPCs'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private'
      and relation.relkind in ('r', 'p')
      and (
        pg_catalog.has_table_privilege(
          'anon', relation.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
        )
        or pg_catalog.has_table_privilege(
          'authenticated', relation.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
        )
      )
  ),
  0,
  'private tables remain inaccessible to anon and authenticated'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'realtime'
      and policy.tablename = 'messages'
      and policy.policyname in (
        'online_room_messages_select',
        'online_room_messages_insert'
      )
  ),
  2,
  'both private Realtime authorization policies still exist'
);

select ok(
  (
    select bool_and(
      pg_catalog.strpos(
        coalesce(policy.qual, '') || coalesce(policy.with_check, ''),
        'private.is_active_room_topic'
      ) > 0
    )
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'realtime'
      and policy.tablename = 'messages'
      and policy.policyname in (
        'online_room_messages_select',
        'online_room_messages_insert'
      )
  ),
  'Realtime policies retain the approved private helper dependency'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_default_acl as defaults
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = defaults.defaclrole
    where owner_role.rolname = 'postgres'
      and defaults.defaclnamespace = 0
      and defaults.defaclobjtype = 'f'
      and not exists (
        select 1
        from pg_catalog.aclexplode(defaults.defaclacl) as privilege
        where privilege.grantee = 0
          and privilege.privilege_type = 'EXECUTE'
      )
  ),
  'postgres future function defaults globally deny PUBLIC EXECUTE'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_default_acl as defaults
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = defaults.defaclrole
    where owner_role.rolname = 'postgres'
      and defaults.defaclnamespace = 0
      and defaults.defaclobjtype = 'f'
      and not exists (
        select 1
        from pg_catalog.aclexplode(defaults.defaclacl) as privilege
        join pg_catalog.pg_roles as grantee_role
          on grantee_role.oid = privilege.grantee
        where grantee_role.rolname in ('anon', 'authenticated')
          and privilege.privilege_type = 'EXECUTE'
      )
  ),
  'postgres future function defaults do not explicitly grant client roles'
);

select * from finish();
rollback;
