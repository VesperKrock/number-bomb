create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  status text not null default 'LOBBY',
  host_player_id uuid not null,
  max_players smallint not null default 4,
  turn_timeout_seconds smallint not null default 20,
  timeout_policy text not null default 'RANDOM_PICK_WITH_2_STRIKES',
  starter_mode text not null default 'FIRST_SEAT',
  show_live_selection boolean not null default true,
  version bigint not null default 1,
  last_activity_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '24 hours'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint rooms_code_format_check
    check (code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$'),
  constraint rooms_status_check
    check (status in ('LOBBY', 'PLAYING', 'FINISHED', 'CLOSED')),
  constraint rooms_max_players_check
    check (max_players between 2 and 4),
  constraint rooms_turn_timeout_seconds_check
    check (turn_timeout_seconds between 15 and 30),
  constraint rooms_timeout_policy_check
    check (timeout_policy in (
      'SELF_DESTRUCT',
      'RANDOM_PICK',
      'RANDOM_PICK_WITH_2_STRIKES'
    )),
  constraint rooms_starter_mode_check
    check (starter_mode in ('FIRST_SEAT', 'RANDOM')),
  constraint rooms_version_check
    check (version > 0),
  constraint rooms_code_key unique (code),
  constraint rooms_id_host_key unique (id, host_player_id)
);

create table public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  auth_user_id uuid not null,
  nickname text not null,
  nickname_key text not null,
  seat smallint not null,
  membership_status text not null default 'ACTIVE',
  joined_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  left_at timestamptz,

  constraint room_players_room_fk
    foreign key (room_id) references public.rooms(id) on delete cascade,
  constraint room_players_auth_user_fk
    foreign key (auth_user_id) references auth.users(id) on delete restrict,
  constraint room_players_room_player_key unique (room_id, id),
  constraint room_players_room_auth_key unique (room_id, auth_user_id),
  constraint room_players_seat_check check (seat between 1 and 4),
  constraint room_players_status_check
    check (membership_status in ('ACTIVE', 'LEFT', 'KICKED')),
  constraint room_players_nickname_length_check
    check (char_length(nickname) between 1 and 20),
  constraint room_players_nickname_trimmed_check
    check (nickname = btrim(nickname)),
  constraint room_players_nickname_spacing_check
    check (nickname !~ '  +'),
  constraint room_players_nickname_control_check
    check (nickname !~ '[[:cntrl:]]'),
  constraint room_players_nickname_key_check
    check (nickname_key = lower(nickname)),
  constraint room_players_left_at_check
    check (
      (membership_status = 'ACTIVE' and left_at is null)
      or (membership_status in ('LEFT', 'KICKED') and left_at is not null)
    )
);

alter table public.rooms
  add constraint rooms_host_player_fk
  foreign key (id, host_player_id)
  references public.room_players(room_id, id)
  on delete no action
  deferrable initially deferred;

create table public.room_games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  round_number integer not null,
  phase text not null default 'PLAYING_TURN',
  lower_candidate smallint not null default 1,
  upper_candidate smallint not null default 99,
  current_player_id uuid not null,
  starting_player_id uuid not null,
  turn_number integer not null default 1,
  version bigint not null default 1,
  turn_started_at timestamptz not null,
  turn_deadline_at timestamptz not null,
  pending_locked_number smallint,
  pending_actor_player_id uuid,
  pending_action_origin text,
  resolution_at timestamptz,
  last_locked_number smallint,
  last_actor_player_id uuid,
  last_action_origin text,
  last_outcome text,
  loser_player_id uuid,
  finish_reason text,
  revealed_bomb_number smallint,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,

  constraint room_games_room_fk
    foreign key (room_id) references public.rooms(id) on delete cascade,
  constraint room_games_room_round_key unique (room_id, round_number),
  constraint room_games_id_room_key unique (id, room_id),
  constraint room_games_phase_check
    check (phase in ('PLAYING_TURN', 'RESOLVING', 'FINISHED')),
  constraint room_games_bounds_check check (
    lower_candidate between 1 and 99
    and upper_candidate between 1 and 99
    and lower_candidate <= upper_candidate
  ),
  constraint room_games_turn_check check (turn_number > 0),
  constraint room_games_version_check check (version > 0),
  constraint room_games_deadline_check check (turn_deadline_at > turn_started_at),
  constraint room_games_pending_origin_check check (
    pending_action_origin is null
    or pending_action_origin in (
      'PLAYER_LOCK',
      'TIMEOUT_RANDOM',
      'TIMEOUT_SELF_DESTRUCT',
      'TIMEOUT_STRIKES_EXCEEDED'
    )
  ),
  constraint room_games_last_origin_check check (
    last_action_origin is null
    or last_action_origin in (
      'PLAYER_LOCK',
      'TIMEOUT_RANDOM',
      'TIMEOUT_SELF_DESTRUCT',
      'TIMEOUT_STRIKES_EXCEEDED'
    )
  ),
  constraint room_games_outcome_check check (
    last_outcome is null or last_outcome in ('SAFE', 'BOOM', 'TIMEOUT_LOSS')
  ),
  constraint room_games_finish_reason_check check (
    finish_reason is null
    or finish_reason in (
      'BOMB_HIT',
      'TIMEOUT_SELF_DESTRUCT',
      'TIMEOUT_STRIKES_EXCEEDED'
    )
  ),
  constraint room_games_number_fields_check check (
    (pending_locked_number is null or pending_locked_number between 1 and 99)
    and (last_locked_number is null or last_locked_number between 1 and 99)
    and (revealed_bomb_number is null or revealed_bomb_number between 1 and 99)
  ),
  constraint room_games_resolving_shape_check check (
    (
      phase = 'RESOLVING'
      and pending_actor_player_id is not null
      and pending_action_origin is not null
      and resolution_at is not null
      and (
        (pending_action_origin in ('PLAYER_LOCK', 'TIMEOUT_RANDOM')
          and pending_locked_number is not null
          and pending_locked_number between lower_candidate and upper_candidate)
        or
        (pending_action_origin in ('TIMEOUT_SELF_DESTRUCT', 'TIMEOUT_STRIKES_EXCEEDED')
          and pending_locked_number is null)
      )
    )
    or
    (
      phase <> 'RESOLVING'
      and pending_actor_player_id is null
      and pending_action_origin is null
      and pending_locked_number is null
      and resolution_at is null
    )
  ),
  constraint room_games_finished_shape_check check (
    (
      phase = 'FINISHED'
      and loser_player_id is not null
      and finish_reason is not null
      and revealed_bomb_number is not null
      and finished_at is not null
      and last_outcome in ('BOOM', 'TIMEOUT_LOSS')
    )
    or
    (
      phase <> 'FINISHED'
      and loser_player_id is null
      and finish_reason is null
      and revealed_bomb_number is null
      and finished_at is null
    )
  )
);

create table public.game_players (
  game_id uuid not null,
  room_id uuid not null,
  player_id uuid not null,
  seat smallint not null,
  timeout_strikes smallint not null default 0,
  participation_status text not null default 'ACTIVE',
  created_at timestamptz not null default clock_timestamp(),

  constraint game_players_pkey primary key (game_id, player_id),
  constraint game_players_game_room_fk
    foreign key (game_id, room_id)
    references public.room_games(id, room_id)
    on delete cascade,
  constraint game_players_room_player_fk
    foreign key (room_id, player_id)
    references public.room_players(room_id, id)
    on delete no action
    deferrable initially deferred,
  constraint game_players_game_seat_key unique (game_id, seat),
  constraint game_players_seat_check check (seat between 1 and 4),
  constraint game_players_strikes_check check (timeout_strikes between 0 and 2),
  constraint game_players_status_check
    check (participation_status in ('ACTIVE', 'LEFT'))
);

alter table public.room_games
  add constraint room_games_current_player_fk
  foreign key (id, current_player_id)
  references public.game_players(game_id, player_id)
  on delete no action
  deferrable initially deferred,
  add constraint room_games_starting_player_fk
  foreign key (id, starting_player_id)
  references public.game_players(game_id, player_id)
  on delete no action
  deferrable initially deferred,
  add constraint room_games_pending_actor_fk
  foreign key (id, pending_actor_player_id)
  references public.game_players(game_id, player_id)
  on delete no action
  deferrable initially deferred,
  add constraint room_games_last_actor_fk
  foreign key (id, last_actor_player_id)
  references public.game_players(game_id, player_id)
  on delete no action
  deferrable initially deferred,
  add constraint room_games_loser_fk
  foreign key (id, loser_player_id)
  references public.game_players(game_id, player_id)
  on delete no action
  deferrable initially deferred;

create table public.game_actions (
  id bigint generated always as identity primary key,
  room_id uuid not null,
  game_id uuid not null,
  game_version bigint not null,
  turn_number integer not null,
  actor_player_id uuid,
  requested_by_player_id uuid,
  action_type text not null,
  action_origin text not null,
  selected_number smallint,
  outcome text,
  finish_reason text,
  lower_before smallint not null,
  upper_before smallint not null,
  lower_after smallint not null,
  upper_after smallint not null,
  strike_count_after smallint,
  request_id uuid,
  created_at timestamptz not null default clock_timestamp(),

  constraint game_actions_game_room_fk
    foreign key (game_id, room_id)
    references public.room_games(id, room_id)
    on delete cascade,
  constraint game_actions_actor_fk
    foreign key (game_id, actor_player_id)
    references public.game_players(game_id, player_id)
    on delete no action
    deferrable initially deferred,
  constraint game_actions_requester_fk
    foreign key (game_id, requested_by_player_id)
    references public.game_players(game_id, player_id)
    on delete no action
    deferrable initially deferred,
  constraint game_actions_game_version_key unique (game_id, game_version),
  constraint game_actions_version_check check (game_version > 0),
  constraint game_actions_turn_check check (turn_number > 0),
  constraint game_actions_type_check check (
    action_type in (
      'GAME_STARTED',
      'NUMBER_LOCKED',
      'TURN_TIMEOUT',
      'RESOLUTION_FINALIZED'
    )
  ),
  constraint game_actions_origin_check check (
    action_origin in (
      'HOST_START',
      'PLAYER_LOCK',
      'TIMEOUT_RANDOM',
      'TIMEOUT_FIRST_STRIKE',
      'TIMEOUT_SELF_DESTRUCT',
      'TIMEOUT_STRIKES_EXCEEDED',
      'FINALIZE'
    )
  ),
  constraint game_actions_outcome_check check (
    outcome is null or outcome in ('SAFE', 'BOOM', 'TIMEOUT_LOSS')
  ),
  constraint game_actions_finish_reason_check check (
    finish_reason is null
    or finish_reason in (
      'BOMB_HIT',
      'TIMEOUT_SELF_DESTRUCT',
      'TIMEOUT_STRIKES_EXCEEDED'
    )
  ),
  constraint game_actions_numbers_check check (
    lower_before between 1 and 99
    and upper_before between 1 and 99
    and lower_before <= upper_before
    and lower_after between 1 and 99
    and upper_after between 1 and 99
    and lower_after <= upper_after
    and (selected_number is null or selected_number between 1 and 99)
    and (strike_count_after is null or strike_count_after between 0 and 2)
  )
);

create table private.game_secrets (
  game_id uuid primary key,
  bomb_number smallint not null,
  pending_outcome text,
  pending_next_lower smallint,
  pending_next_upper smallint,
  pending_next_player_id uuid,
  pending_loser_player_id uuid,
  pending_finish_reason text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint game_secrets_game_fk
    foreign key (game_id) references public.room_games(id) on delete cascade,
  constraint game_secrets_bomb_check check (bomb_number between 1 and 99),
  constraint game_secrets_outcome_check check (
    pending_outcome is null or pending_outcome in ('SAFE', 'BOOM', 'TIMEOUT_LOSS')
  ),
  constraint game_secrets_finish_reason_check check (
    pending_finish_reason is null
    or pending_finish_reason in (
      'BOMB_HIT',
      'TIMEOUT_SELF_DESTRUCT',
      'TIMEOUT_STRIKES_EXCEEDED'
    )
  ),
  constraint game_secrets_pending_bounds_check check (
    (pending_next_lower is null or pending_next_lower between 1 and 99)
    and (pending_next_upper is null or pending_next_upper between 1 and 99)
    and (
      (pending_next_lower is null and pending_next_upper is null)
      or (pending_next_lower is not null and pending_next_upper is not null
        and pending_next_lower <= pending_next_upper)
    )
  ),
  constraint game_secrets_pending_shape_check check (
    (pending_outcome is null
      and pending_next_lower is null
      and pending_next_upper is null
      and pending_next_player_id is null
      and pending_loser_player_id is null
      and pending_finish_reason is null)
    or
    (pending_outcome = 'SAFE'
      and pending_next_lower is not null
      and pending_next_upper is not null
      and pending_next_player_id is not null
      and pending_loser_player_id is null
      and pending_finish_reason is null)
    or
    (pending_outcome in ('BOOM', 'TIMEOUT_LOSS')
      and pending_next_lower is null
      and pending_next_upper is null
      and pending_next_player_id is null
      and pending_loser_player_id is not null
      and pending_finish_reason is not null)
  ),
  constraint game_secrets_next_player_fk
    foreign key (game_id, pending_next_player_id)
    references public.game_players(game_id, player_id)
    on delete no action
    deferrable initially deferred,
  constraint game_secrets_loser_fk
    foreign key (game_id, pending_loser_player_id)
    references public.game_players(game_id, player_id)
    on delete no action
    deferrable initially deferred
);

create table private.mutation_requests (
  auth_user_id uuid not null,
  request_id uuid not null,
  operation text not null,
  room_id uuid,
  game_id uuid,
  response jsonb,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '48 hours'),

  constraint mutation_requests_pkey primary key (auth_user_id, request_id),
  constraint mutation_requests_room_fk
    foreign key (room_id) references public.rooms(id) on delete cascade,
  constraint mutation_requests_game_fk
    foreign key (game_id) references public.room_games(id) on delete cascade,
  constraint mutation_requests_operation_check check (operation in (
    'CREATE_ROOM',
    'JOIN_ROOM',
    'UPDATE_ROOM_SETTINGS',
    'KICK_PLAYER',
    'LEAVE_ROOM',
    'CLAIM_HOST',
    'START_GAME',
    'LOCK_NUMBER',
    'RESOLVE_TURN_TIMEOUT',
    'FINALIZE_RESOLUTION',
    'RESTART_GAME',
    'RETURN_TO_LOBBY'
  )),
  constraint mutation_requests_response_check
    check (response is null or jsonb_typeof(response) = 'object')
);

comment on table private.game_secrets is
  'Never expose through Data API, Realtime, logs, or client grants.';

comment on column public.room_games.revealed_bomb_number is
  'Must remain null until the canonical game phase is FINISHED.';
