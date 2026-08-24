create unique index room_players_active_seat_key
  on public.room_players (room_id, seat)
  where membership_status = 'ACTIVE';

create unique index room_players_active_nickname_key
  on public.room_players (room_id, nickname_key)
  where membership_status = 'ACTIVE';

create index room_players_auth_user_idx
  on public.room_players (auth_user_id);

create index room_players_active_last_seen_idx
  on public.room_players (room_id, last_seen_at)
  where membership_status = 'ACTIVE';

create index rooms_finished_expiry_idx
  on public.rooms (expires_at)
  where status in ('FINISHED', 'CLOSED');

create index rooms_last_activity_idx
  on public.rooms (last_activity_at);

create index room_games_room_round_idx
  on public.room_games (room_id, round_number desc);

create unique index room_games_one_open_round_key
  on public.room_games (room_id)
  where phase <> 'FINISHED';

create index room_games_due_turn_idx
  on public.room_games (turn_deadline_at)
  where phase = 'PLAYING_TURN';

create index room_games_due_resolution_idx
  on public.room_games (resolution_at)
  where phase = 'RESOLVING';

create index game_players_room_game_idx
  on public.game_players (room_id, game_id);

create index game_actions_game_order_idx
  on public.game_actions (game_id, id);

create index game_actions_room_history_idx
  on public.game_actions (room_id, created_at desc);

create unique index game_actions_request_key
  on public.game_actions (game_id, request_id)
  where request_id is not null;

create index mutation_requests_expiry_idx
  on private.mutation_requests (expires_at);
