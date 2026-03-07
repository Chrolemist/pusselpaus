create or replace function public.mp_submit_result(
  p_match_id uuid,
  p_elapsed_seconds integer,
  p_score integer,
  p_survived_seconds integer
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_game_id text;
  v_status text;
  v_stake integer;
  v_all_submitted boolean;
  v_winner_id uuid;
  v_pot integer := 0;
  v_bonus integer := 0;
  v_valid_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select m.game_id, m.status, m.stake
  into v_game_id, v_status, v_stake
  from public.multiplayer_matches m
  where m.id = p_match_id
  for update;

  if not found then
    raise exception 'Match not found';
  end if;

  if v_status <> 'in_progress' then
    raise exception 'Match is not active';
  end if;

  update public.multiplayer_match_players p
  set submitted = true,
      forfeited = false,
      elapsed_seconds = coalesce(p_elapsed_seconds, p.elapsed_seconds),
      score = coalesce(p_score, p.score),
      survived_seconds = coalesce(p_survived_seconds, p.survived_seconds),
      submitted_at = now()
  where p.match_id = p_match_id
    and p.user_id = v_uid
    and p.status = 'accepted';

  if not found then
    raise exception 'You are not an accepted player in this match';
  end if;

  select bool_and(p.submitted)
  into v_all_submitted
  from public.multiplayer_match_players p
  where p.match_id = p_match_id
    and p.status = 'accepted';

  if not coalesce(v_all_submitted, false) then
    return;
  end if;

  if v_game_id in ('sudoku', 'numberpath') then
    select p.user_id
    into v_winner_id
    from public.multiplayer_match_players p
    where p.match_id = p_match_id
      and p.status = 'accepted'
      and p.submitted = true
      and coalesce(p.forfeited, false) = false
      and p.submitted_at is not null
    order by p.submitted_at asc, p.elapsed_seconds asc nulls last
    limit 1;
  elsif v_game_id = 'rytmrush' then
    select p.user_id
    into v_winner_id
    from public.multiplayer_match_players p
    where p.match_id = p_match_id
      and p.status = 'accepted'
      and p.submitted = true
      and coalesce(p.forfeited, false) = false
    order by coalesce(p.survived_seconds, 0) desc, coalesce(p.score, 0) desc, p.submitted_at asc
    limit 1;
  else
    raise exception 'Invalid game_id in match';
  end if;

  select count(*)
  into v_valid_count
  from public.multiplayer_match_players p
  where p.match_id = p_match_id
    and p.status = 'accepted'
    and p.submitted = true
    and coalesce(p.forfeited, false) = false;

  if v_valid_count = 0 or v_winner_id is null then
    update public.profiles pr
    set coins = pr.coins + src.refund,
        updated_at = now()
    from (
      select p.user_id, coalesce(sum(p.stake_locked), 0)::integer as refund
      from public.multiplayer_match_players p
      where p.match_id = p_match_id
        and p.status = 'accepted'
      group by p.user_id
    ) src
    where pr.id = src.user_id
      and src.refund > 0;

    update public.multiplayer_match_players
    set stake_locked = 0
    where match_id = p_match_id
      and status = 'accepted';

    update public.multiplayer_matches
    set status = 'completed',
        winner_id = null,
        completed_at = now()
    where id = p_match_id;

    return;
  end if;

  select coalesce(sum(p.stake_locked), 0)
  into v_pot
  from public.multiplayer_match_players p
  where p.match_id = p_match_id
    and p.status = 'accepted';

  if v_pot <= 0 then
    v_bonus := case
      when v_game_id = 'sudoku' then 45
      when v_game_id = 'numberpath' then 40
      else 45
    end;

    update public.profiles
    set coins = coins + v_bonus,
        updated_at = now()
    where id = v_winner_id;
  else
    update public.profiles
    set coins = coins + v_pot,
        updated_at = now()
    where id = v_winner_id;
  end if;

  update public.multiplayer_matches
  set status = 'completed',
      winner_id = v_winner_id,
      completed_at = now()
  where id = p_match_id;
end;
$$;
