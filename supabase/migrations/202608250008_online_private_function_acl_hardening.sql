-- Forward-only ACL repair for private routines created after migration 003.
-- PostgreSQL's built-in function default grants EXECUTE to PUBLIC globally;
-- the schema-scoped default-privilege statements in migration 003 could not
-- cancel that global default for functions subsequently created in 004-006.

revoke execute on all functions in schema private
  from public, anon, authenticated;

-- These three routines are the complete dependency chain used by the private
-- Realtime authorization policies on realtime.messages.
grant execute on function private.is_active_room_member(uuid, uuid)
  to authenticated;
grant execute on function private.room_id_from_topic(text)
  to authenticated;
grant execute on function private.is_active_room_topic(text, uuid)
  to authenticated;

-- All Number Bomb private routines are created by postgres. Function EXECUTE
-- defaults are global (not schema-specific), so future postgres-owned routines
-- must start closed and be granted explicitly where a public contract requires it.
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated;

-- Deployment-time catalog postconditions make a partial or silently ineffective
-- ACL repair fail closed. Owner/internal execution remains intact.
do $$
declare
  v_unexpected_authenticated text[];
begin
  if exists (
    select 1
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
  ) then
    raise exception 'NB-3D1: a private function remains executable by PUBLIC';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private'
      and pg_catalog.has_function_privilege('anon', routine.oid, 'EXECUTE')
  ) then
    raise exception 'NB-3D1: a private function remains executable by anon';
  end if;

  select pg_catalog.array_agg(
    pg_catalog.format('%I.%I(%s)', namespace.nspname, routine.proname,
      pg_catalog.pg_get_function_identity_arguments(routine.oid))
    order by routine.proname
  )
  into v_unexpected_authenticated
  from pg_catalog.pg_proc as routine
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = routine.pronamespace
  where namespace.nspname = 'private'
    and pg_catalog.has_function_privilege(
      'authenticated',
      routine.oid,
      'EXECUTE'
    )
    and routine.oid not in (
      'private.is_active_room_member(uuid,uuid)'::regprocedure,
      'private.room_id_from_topic(text)'::regprocedure,
      'private.is_active_room_topic(text,uuid)'::regprocedure
    );

  if v_unexpected_authenticated is not null then
    raise exception
      'NB-3D1: authenticated retains unexpected private EXECUTE: %',
      v_unexpected_authenticated;
  end if;

  if not (
    pg_catalog.has_function_privilege(
      'authenticated',
      'private.is_active_room_member(uuid,uuid)'::regprocedure,
      'EXECUTE'
    )
    and pg_catalog.has_function_privilege(
      'authenticated',
      'private.room_id_from_topic(text)'::regprocedure,
      'EXECUTE'
    )
    and pg_catalog.has_function_privilege(
      'authenticated',
      'private.is_active_room_topic(text,uuid)'::regprocedure,
      'EXECUTE'
    )
  ) then
    raise exception 'NB-3D1: the Realtime helper whitelist is incomplete';
  end if;

  if not exists (
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
  ) then
    raise exception
      'NB-3D1: postgres global default function privileges still grant PUBLIC EXECUTE';
  end if;
end;
$$;
