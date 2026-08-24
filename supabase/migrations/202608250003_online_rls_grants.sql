create or replace function private.is_active_room_member(
  p_room_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.room_players as player
    where player.room_id = p_room_id
      and player.auth_user_id = p_user_id
      and player.membership_status = 'ACTIVE'
  );
$$;

create or replace function private.room_id_from_topic(p_topic text)
returns uuid
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_topic is null or p_topic !~ '^room:[0-9a-fA-F-]{36}$' then
    return null;
  end if;

  return pg_catalog.substr(p_topic, 6)::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function private.is_active_room_topic(
  p_topic text,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_room_member(
    private.room_id_from_topic(p_topic),
    p_user_id
  );
$$;

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_actions enable row level security;
alter table private.game_secrets enable row level security;
alter table private.mutation_requests enable row level security;

revoke all on table public.rooms from public, anon, authenticated;
revoke all on table public.room_players from public, anon, authenticated;
revoke all on table public.room_games from public, anon, authenticated;
revoke all on table public.game_players from public, anon, authenticated;
revoke all on table public.game_actions from public, anon, authenticated;
revoke all on table private.game_secrets from public, anon, authenticated;
revoke all on table private.mutation_requests from public, anon, authenticated;
revoke all on sequence public.game_actions_id_seq from public, anon, authenticated;

grant select on table public.rooms to authenticated;
grant select on table public.room_games to authenticated;
grant select on table public.game_players to authenticated;
grant select on table public.game_actions to authenticated;

grant select (
  id,
  room_id,
  nickname,
  seat,
  membership_status,
  joined_at,
  last_seen_at,
  left_at
) on table public.room_players to authenticated;

create policy rooms_select_active_member
  on public.rooms
  for select
  to authenticated
  using (
    private.is_active_room_member(id, (select auth.uid()))
  );

create policy room_players_select_room_or_self
  on public.room_players
  for select
  to authenticated
  using (
    auth_user_id = (select auth.uid())
    or private.is_active_room_member(room_id, (select auth.uid()))
  );

create policy room_games_select_active_member
  on public.room_games
  for select
  to authenticated
  using (
    private.is_active_room_member(room_id, (select auth.uid()))
  );

create policy game_players_select_active_member
  on public.game_players
  for select
  to authenticated
  using (
    private.is_active_room_member(room_id, (select auth.uid()))
  );

create policy game_actions_select_active_member
  on public.game_actions
  for select
  to authenticated
  using (
    private.is_active_room_member(room_id, (select auth.uid()))
  );

revoke execute on function private.is_active_room_member(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.room_id_from_topic(text)
  from public, anon, authenticated;
revoke execute on function private.is_active_room_topic(text, uuid)
  from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.is_active_room_member(uuid, uuid)
  to authenticated;
grant execute on function private.room_id_from_topic(text)
  to authenticated;
grant execute on function private.is_active_room_topic(text, uuid)
  to authenticated;

alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from public, anon, authenticated;

alter default privileges in schema private
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private
  revoke all on tables from public, anon, authenticated;
