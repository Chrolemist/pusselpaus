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
    set status = 'cancelled',
        started_at = null,
        completed_at = now()
    where id = p_match_id
      and status in ('waiting', 'starting');
  end if;
end;
$$;