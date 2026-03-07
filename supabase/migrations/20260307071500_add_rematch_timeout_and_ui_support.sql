alter table public.multiplayer_match_players
  add column if not exists rematch_requested_at timestamptz null;

update public.multiplayer_match_players
set rematch_requested_at = now()
where rematch_requested = true
  and rematch_requested_at is null;

create or replace function public.mp_request_rematch(p_match_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.multiplayer_matches%rowtype;
  v_player public.multiplayer_match_players%rowtype;
  v_new_match_id uuid;
  v_requested_count integer := 0;
  v_total_count integer := 0;
  v_seed bigint;
  v_effective_stake integer := 0;
  v_started_at timestamptz;
  v_rematch_expires_at timestamptz;
begin
  if v_uid is null then
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

  if v_match.status <> 'completed' then
    return json_build_object(
      'ok', false,
      'reason', 'match_not_completed',
      'status', v_match.status
    );
  end if;

  update public.multiplayer_match_players
  set rematch_requested = false,
      rematch_requested_at = null,
      rematch_match_id = null
  where match_id = p_match_id
    and status = 'accepted'
    and coalesce(forfeited, false) = false
    and rematch_match_id is null
    and rematch_requested = true
    and rematch_requested_at is not null
    and rematch_requested_at < now() - interval '20 seconds';

  select *
  into v_player
  from public.multiplayer_match_players
  where match_id = p_match_id
    and user_id = v_uid
    and status = 'accepted'
  for update;

  if not found then
    return json_build_object(
      'ok', false,
      'reason', 'not_participant'
    );
  end if;

  if coalesce(v_player.forfeited, false) then
    return json_build_object(
      'ok', false,
      'reason', 'player_forfeited'
    );
  end if;

  if v_player.rematch_match_id is not null then
    return (
      select json_build_object(
        'ok', true,
        'status', 'created',
        'requested_count', (select count(*) from public.multiplayer_match_players where match_id = p_match_id and status = 'accepted' and coalesce(forfeited, false) = false and rematch_requested = true),
        'total_count', (select count(*) from public.multiplayer_match_players where match_id = p_match_id and status = 'accepted' and coalesce(forfeited, false) = false),
        'rematch_match_id', m.id,
        'started_at', m.started_at,
        'expires_at', null,
        'config_seed', m.config_seed,
        'config', m.config,
        'stake', m.stake
      )
      from public.multiplayer_matches m
      where m.id = v_player.rematch_match_id
    );
  end if;

  update public.multiplayer_match_players
  set rematch_requested = true,
      rematch_requested_at = now()
  where id = v_player.id;

  select count(*)::int,
         count(*) filter (where rematch_requested)::int,
         min(rematch_requested_at) + interval '20 seconds'
  into v_total_count, v_requested_count, v_rematch_expires_at
  from public.multiplayer_match_players
  where match_id = p_match_id
    and status = 'accepted'
    and coalesce(forfeited, false) = false;

  if v_requested_count < v_total_count then
    return json_build_object(
      'ok', true,
      'status', 'waiting',
      'requested_count', v_requested_count,
      'total_count', v_total_count,
      'expires_at', v_rematch_expires_at,
      'rematch_match_id', null
    );
  end if;

  select distinct rematch_match_id
  into v_new_match_id
  from public.multiplayer_match_players
  where match_id = p_match_id
    and rematch_match_id is not null
  limit 1;

  if v_new_match_id is not null then
    return (
      select json_build_object(
        'ok', true,
        'status', 'created',
        'requested_count', v_requested_count,
        'total_count', v_total_count,
        'rematch_match_id', m.id,
        'started_at', m.started_at,
        'expires_at', null,
        'config_seed', m.config_seed,
        'config', m.config,
        'stake', m.stake
      )
      from public.multiplayer_matches m
      where m.id = v_new_match_id
    );
  end if;

  v_effective_stake := coalesce(v_match.stake, 0);
  if v_effective_stake > 0 then
    if exists (
      select 1
      from public.multiplayer_match_players p
      join public.profiles pr on pr.id = p.user_id
      where p.match_id = p_match_id
        and p.status = 'accepted'
        and coalesce(p.forfeited, false) = false
        and pr.coins < v_effective_stake
    ) then
      v_effective_stake := 0;
    end if;
  end if;

  if v_effective_stake > 0 then
    update public.profiles pr
    set coins = pr.coins - v_effective_stake,
        updated_at = now()
    where pr.id in (
      select p.user_id
      from public.multiplayer_match_players p
      where p.match_id = p_match_id
        and p.status = 'accepted'
        and coalesce(p.forfeited, false) = false
    );
  end if;

  v_seed := floor(random() * 2147483647)::bigint;
  v_started_at := now() + interval '5 seconds';

  insert into public.multiplayer_matches (
    id,
    host_id,
    game_id,
    stake,
    config_seed,
    config,
    status,
    created_at,
    started_at
  )
  values (
    gen_random_uuid(),
    v_match.host_id,
    v_match.game_id,
    v_effective_stake,
    v_seed,
    coalesce(v_match.config, '{}'::jsonb),
    'starting',
    now(),
    v_started_at
  )
  returning id into v_new_match_id;

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
    submitted_at,
    created_at,
    rematch_requested,
    rematch_requested_at,
    rematch_match_id
  )
  select
    v_new_match_id,
    p.user_id,
    'accepted',
    true,
    now(),
    v_effective_stake,
    false,
    false,
    null,
    null,
    null,
    null,
    now(),
    false,
    null,
    null
  from public.multiplayer_match_players p
  where p.match_id = p_match_id
    and p.status = 'accepted'
    and coalesce(p.forfeited, false) = false;

  update public.multiplayer_match_players
  set rematch_match_id = v_new_match_id
  where match_id = p_match_id
    and status = 'accepted'
    and coalesce(forfeited, false) = false;

  return json_build_object(
    'ok', true,
    'status', 'created',
    'requested_count', v_requested_count,
    'total_count', v_total_count,
    'rematch_match_id', v_new_match_id,
    'started_at', v_started_at,
    'expires_at', null,
    'config_seed', v_seed,
    'config', coalesce(v_match.config, '{}'::jsonb),
    'stake', v_effective_stake
  );
end;
$$;

grant all on function public.mp_request_rematch(uuid) to anon;
grant all on function public.mp_request_rematch(uuid) to authenticated;
grant all on function public.mp_request_rematch(uuid) to service_role;