create or replace function public.matchmake_join(p_game_id text, p_difficulty text default null::text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_queue_id uuid;
  v_match_id uuid;
  v_player_ids uuid[];
  v_config_seed int;
  v_queue_size int;
  v_match_created_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  update public.matchmaking_queue
  set status = 'cancelled'
  where user_id = v_user_id
    and game_id = p_game_id
    and status = 'waiting';

  insert into public.matchmaking_queue (user_id, game_id, difficulty)
  values (v_user_id, p_game_id, p_difficulty)
  returning id into v_queue_id;

  select array_agg(sub.user_id order by sub.queued_at)
  into v_player_ids
  from (
    select user_id, queued_at
    from public.matchmaking_queue
    where game_id = p_game_id
      and status = 'waiting'
    order by queued_at
    limit 5
    for update skip locked
  ) sub;

  select count(*)::int
  into v_queue_size
  from public.matchmaking_queue
  where game_id = p_game_id
    and status = 'waiting';

  if array_length(v_player_ids, 1) is null
     or array_length(v_player_ids, 1) < 2 then
    return json_build_object(
      'queued', true,
      'queue_id', v_queue_id,
      'match_id', null,
      'config_seed', null,
      'queue_size', v_queue_size,
      'match_created_at', null,
      'server_now', now()
    );
  end if;

  v_config_seed := floor(random() * 2147483647)::int;

  insert into public.multiplayer_matches (
    game_id,
    host_id,
    config_seed,
    config,
    status,
    stake,
    started_at
  )
  values (
    p_game_id,
    v_player_ids[1],
    v_config_seed,
    json_build_object('difficulty', coalesce(p_difficulty, 'medium')),
    'waiting',
    0,
    null
  )
  returning id, created_at into v_match_id, v_match_created_at;

  insert into public.multiplayer_match_players (
    match_id,
    user_id,
    status,
    ready,
    ready_at,
    stake_locked,
    submitted,
    forfeited,
    elapsed_seconds,
    score,
    survived_seconds,
    submitted_at
  )
  select
    v_match_id,
    player_id,
    'matched',
    false,
    null,
    0,
    false,
    false,
    null,
    null,
    null,
    null
  from unnest(v_player_ids) as player_id;

  update public.matchmaking_queue
  set status = 'matched',
      matched_match_id = v_match_id
  where game_id = p_game_id
    and status = 'waiting'
    and user_id = any(v_player_ids);

  return json_build_object(
    'queued', false,
    'queue_id', v_queue_id,
    'match_id', v_match_id,
    'config_seed', v_config_seed,
    'queue_size', array_length(v_player_ids, 1),
    'match_created_at', v_match_created_at,
    'server_now', now()
  );
end;
$$;

create or replace function public.matchmake_poll(p_game_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
  v_row matchmaking_queue%rowtype;
  v_queue_size int;
  v_config_seed int;
  v_match_created_at timestamptz;
begin
  select * into v_row
  from matchmaking_queue
  where user_id = v_user_id
    and game_id = p_game_id
    and status in ('waiting', 'matched')
  order by queued_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'queued', false,
      'queue_id', null,
      'match_id', null,
      'config_seed', null,
      'queue_size', 0,
      'match_created_at', null,
      'server_now', now()
    );
  end if;

  select count(*)::int into v_queue_size
  from matchmaking_queue
  where game_id = p_game_id and status = 'waiting';

  if v_row.status = 'matched' and v_row.matched_match_id is not null then
    select config_seed, created_at
    into v_config_seed, v_match_created_at
    from multiplayer_matches
    where id = v_row.matched_match_id;

    return jsonb_build_object(
      'queued', false,
      'queue_id', v_row.id,
      'match_id', v_row.matched_match_id,
      'config_seed', v_config_seed,
      'queue_size', v_queue_size,
      'match_created_at', v_match_created_at,
      'server_now', now()
    );
  end if;

  return jsonb_build_object(
    'queued', true,
    'queue_id', v_row.id,
    'match_id', null,
    'config_seed', null,
    'queue_size', v_queue_size,
    'match_created_at', null,
    'server_now', now()
  );
end;
$$;

create or replace function public.mp_ready_state(p_match_id uuid)
returns json
language plpgsql
security definer
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
    and forfeited = false;

  select count(*)::int into v_ready_count
  from public.multiplayer_match_players
  where match_id = p_match_id
    and forfeited = false
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
    'all_ready', v_ready_count = v_total_count,
    'me_ready', v_me_ready,
    'started_at', v_match.started_at,
    'server_now', now()
  );
end;
$$;