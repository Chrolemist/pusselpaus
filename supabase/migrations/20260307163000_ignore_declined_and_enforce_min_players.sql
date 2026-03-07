create or replace function public.mp_required_player_count(p_game_id text)
returns integer
language plpgsql
immutable
as $$
begin
  return case p_game_id
    when 'pingpong' then 2
    when 'sudoku' then 2
    when 'numberpath' then 2
    when 'rytmrush' then 2
    else 2
  end;
end;
$$;

create or replace function public.mp_decline_invite(p_match_id uuid)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_pending int;
  v_active_count int;
  v_min_players int;
  v_player record;
  v_match public.multiplayer_matches%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_match
  from public.multiplayer_matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match not found';
  end if;

  update public.multiplayer_match_players
  set status = 'declined',
      ready = false,
      ready_at = null
  where match_id = p_match_id and user_id = v_user_id and status = 'invited';

  if not found then
    raise exception 'Invite not found';
  end if;

  v_min_players := public.mp_required_player_count(v_match.game_id);

  select count(*) into v_pending
  from public.multiplayer_match_players
  where match_id = p_match_id and status = 'invited';

  select count(*) into v_active_count
  from public.multiplayer_match_players
  where match_id = p_match_id
    and status in ('accepted', 'matched')
    and coalesce(forfeited, false) = false;

  if v_pending = 0 and v_active_count < v_min_players then
    for v_player in
      select user_id, stake_locked
      from public.multiplayer_match_players
      where match_id = p_match_id and stake_locked > 0
    loop
      update public.profiles
      set coins = coins + v_player.stake_locked
      where id = v_player.user_id;
    end loop;

    update public.multiplayer_matches
    set status = 'cancelled', completed_at = now()
    where id = p_match_id and status = 'waiting';
  end if;
end;
$$;

create or replace function public.mp_mark_ready(p_match_id uuid)
returns json
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.multiplayer_matches%rowtype;
  v_player public.multiplayer_match_players%rowtype;
  v_ready_count int;
  v_total_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select *
  into v_match
  from public.multiplayer_matches
  where id = p_match_id;

  if not found then
    raise exception 'match not found';
  end if;

  if v_match.status <> 'waiting' then
    return json_build_object(
      'ok', false,
      'reason', 'match_not_waiting',
      'status', v_match.status
    );
  end if;

  select *
  into v_player
  from public.multiplayer_match_players
  where match_id = p_match_id
    and user_id = v_uid;

  if not found then
    raise exception 'player not in match';
  end if;

  if v_player.forfeited then
    return json_build_object(
      'ok', false,
      'reason', 'player_forfeited'
    );
  end if;

  update public.multiplayer_match_players
  set status = case
                 when status in ('pending', 'invited', 'matched') then 'accepted'
                 else status
               end,
      ready = true,
      ready_at = now()
  where id = v_player.id;

  select count(*)::int
  into v_ready_count
  from public.multiplayer_match_players
  where match_id = p_match_id
    and forfeited = false
    and status in ('accepted', 'matched')
    and ready = true;

  select count(*)::int
  into v_total_count
  from public.multiplayer_match_players
  where match_id = p_match_id
    and forfeited = false
    and status in ('accepted', 'matched');

  return json_build_object(
    'ok', true,
    'match_id', p_match_id,
    'ready_count', v_ready_count,
    'total_count', v_total_count,
    'all_ready', v_total_count > 0 and v_ready_count = v_total_count,
    'host_id', v_match.host_id,
    'status', v_match.status
  );
end;
$$;

create or replace function public.mp_ready_state(p_match_id uuid)
returns json
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.multiplayer_matches%rowtype;
  v_ready_count int;
  v_total_count int;
  v_me_ready boolean := false;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_match
  from public.multiplayer_matches
  where id = p_match_id;

  if not found then
    raise exception 'match not found';
  end if;

  if not exists (
    select 1
    from public.multiplayer_match_players p
    where p.match_id = p_match_id
      and p.user_id = v_uid
  ) then
    raise exception 'player not in match';
  end if;

  select count(*)::int into v_total_count
  from public.multiplayer_match_players
  where match_id = p_match_id
    and forfeited = false
    and status in ('accepted', 'matched');

  select count(*)::int into v_ready_count
  from public.multiplayer_match_players
  where match_id = p_match_id
    and forfeited = false
    and status in ('accepted', 'matched')
    and ready = true;

  select coalesce(ready, false) into v_me_ready
  from public.multiplayer_match_players
  where match_id = p_match_id
    and user_id = v_uid
  limit 1;

  return json_build_object(
    'ok', true,
    'match_id', p_match_id,
    'status', v_match.status,
    'host_id', v_match.host_id,
    'ready_count', v_ready_count,
    'total_count', v_total_count,
    'all_ready', v_total_count > 0 and v_ready_count = v_total_count,
    'me_ready', v_me_ready,
    'started_at', v_match.started_at
  );
end;
$$;

create or replace function public.mp_start_if_ready(p_match_id uuid, p_countdown_seconds integer default 5)
returns json
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.multiplayer_matches%rowtype;
  v_ready_count int;
  v_total_count int;
  v_started_at timestamptz;
  v_min_players int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select *
  into v_match
  from public.multiplayer_matches
  where id = p_match_id;

  if not found then
    raise exception 'match not found';
  end if;

  if v_match.host_id <> v_uid then
    return json_build_object(
      'ok', false,
      'reason', 'not_host',
      'status', v_match.status
    );
  end if;

  if v_match.status in ('starting', 'in_progress') then
    return json_build_object(
      'ok', true,
      'started', true,
      'reason', 'already_started',
      'status', v_match.status,
      'started_at', v_match.started_at
    );
  end if;

  if v_match.status <> 'waiting' then
    return json_build_object(
      'ok', false,
      'reason', 'invalid_status',
      'status', v_match.status
    );
  end if;

  v_min_players := public.mp_required_player_count(v_match.game_id);

  select count(*)::int
  into v_total_count
  from public.multiplayer_match_players
  where match_id = p_match_id
    and forfeited = false
    and status in ('accepted', 'matched');

  select count(*)::int
  into v_ready_count
  from public.multiplayer_match_players
  where match_id = p_match_id
    and forfeited = false
    and status in ('accepted', 'matched')
    and ready = true;

  if v_total_count < v_min_players then
    return json_build_object(
      'ok', false,
      'reason', 'not_enough_players',
      'total_count', v_total_count,
      'min_players', v_min_players
    );
  end if;

  if v_ready_count <> v_total_count then
    return json_build_object(
      'ok', false,
      'reason', 'not_all_ready',
      'ready_count', v_ready_count,
      'total_count', v_total_count
    );
  end if;

  v_started_at := now() + make_interval(
    secs => greatest(1, least(coalesce(p_countdown_seconds, 5), 20))
  );

  update public.multiplayer_matches
  set status = 'starting',
      started_at = v_started_at
  where id = p_match_id
    and status = 'waiting';

  return json_build_object(
    'ok', true,
    'started', true,
    'status', 'starting',
    'started_at', v_started_at,
    'ready_count', v_ready_count,
    'total_count', v_total_count,
    'min_players', v_min_players
  );
end;
$$;

create or replace function public.mp_start_match(p_match_id uuid, p_countdown_seconds integer default 5)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_host_id uuid;
  v_status text;
  v_pending_invites integer;
  v_active_count integer;
  v_countdown integer := greatest(2, coalesce(p_countdown_seconds, 5));
  v_game_id text;
  v_min_players integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select m.host_id, m.status, m.game_id
  into v_host_id, v_status, v_game_id
  from public.multiplayer_matches m
  where m.id = p_match_id
  for update;

  if not found then
    raise exception 'Match not found';
  end if;

  if v_host_id <> v_uid then
    raise exception 'Only host can start match';
  end if;

  if v_status <> 'waiting' then
    raise exception 'Match is not waiting';
  end if;

  select count(*) into v_pending_invites
  from public.multiplayer_match_players p
  where p.match_id = p_match_id
    and p.status = 'invited';

  if v_pending_invites > 0 then
    raise exception 'All invited players must accept first';
  end if;

  v_min_players := public.mp_required_player_count(v_game_id);

  select count(*) into v_active_count
  from public.multiplayer_match_players p
  where p.match_id = p_match_id
    and p.status in ('accepted', 'matched')
    and coalesce(p.forfeited, false) = false;

  if v_active_count < v_min_players then
    raise exception 'Need at least % accepted players', v_min_players;
  end if;

  update public.multiplayer_matches
  set status = 'starting',
      started_at = now() + make_interval(secs => v_countdown),
      completed_at = null
  where id = p_match_id;
end;
$$;

grant all on function public.mp_required_player_count(text) to anon;
grant all on function public.mp_required_player_count(text) to authenticated;
grant all on function public.mp_required_player_count(text) to service_role;
