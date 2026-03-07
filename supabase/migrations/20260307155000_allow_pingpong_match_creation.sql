create or replace function public.mp_create_match(
  p_game_id text,
  p_stake integer,
  p_invited_ids uuid[],
  p_config jsonb default '{}'::jsonb,
  p_config_seed bigint default null::bigint
) returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_match_id uuid;
  v_invited_id uuid;
  v_host_coins integer;
  v_invited_unique uuid[];
  v_seed bigint;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_game_id not in ('sudoku', 'numberpath', 'rytmrush', 'pingpong') then
    raise exception 'Invalid game_id';
  end if;

  if p_stake is null or p_stake < 0 then
    raise exception 'Stake must be >= 0';
  end if;

  if p_invited_ids is null or coalesce(array_length(p_invited_ids, 1), 0) = 0 then
    raise exception 'At least one invited user is required';
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
  into v_invited_unique
  from unnest(p_invited_ids) as x
  where x is not null and x <> v_uid;

  if coalesce(array_length(v_invited_unique, 1), 0) = 0 then
    raise exception 'No valid invited users';
  end if;

  if p_stake > 0 then
    select coins into v_host_coins
    from public.profiles
    where id = v_uid
    for update;

    if v_host_coins is null then
      raise exception 'Host profile not found';
    end if;

    if v_host_coins < p_stake then
      raise exception 'Insufficient coins';
    end if;

    update public.profiles
    set coins = coins - p_stake,
        updated_at = now()
    where id = v_uid;
  end if;

  v_seed := coalesce(p_config_seed, floor(random() * 2000000000)::bigint);

  insert into public.multiplayer_matches (
    id,
    host_id,
    game_id,
    stake,
    config_seed,
    config,
    status,
    created_at
  )
  values (
    gen_random_uuid(),
    v_uid,
    p_game_id,
    p_stake,
    v_seed,
    coalesce(p_config, '{}'::jsonb),
    'waiting',
    now()
  )
  returning id into v_match_id;

  insert into public.multiplayer_match_players (
    match_id,
    user_id,
    status,
    stake_locked,
    submitted,
    created_at
  )
  values (
    v_match_id,
    v_uid,
    'accepted',
    p_stake,
    false,
    now()
  );

  foreach v_invited_id in array v_invited_unique loop
    insert into public.multiplayer_match_players (
      match_id,
      user_id,
      status,
      stake_locked,
      submitted,
      created_at
    )
    values (
      v_match_id,
      v_invited_id,
      'invited',
      0,
      false,
      now()
    )
    on conflict (match_id, user_id) do nothing;
  end loop;
end;
$$;

grant all on function public.mp_create_match(text, integer, uuid[], jsonb, bigint) to anon;
grant all on function public.mp_create_match(text, integer, uuid[], jsonb, bigint) to authenticated;
grant all on function public.mp_create_match(text, integer, uuid[], jsonb, bigint) to service_role;