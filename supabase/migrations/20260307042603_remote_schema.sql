set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.mp_tick_match_start(p_match_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_started_at timestamptz;
  v_is_participant boolean := false;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  select exists (
    select 1
    from public.multiplayer_match_players p
    where p.match_id = p_match_id
      and p.user_id = v_uid
      and p.forfeited = false
  ) into v_is_participant;

  if not v_is_participant then
    return 'not_participant';
  end if;

  select m.status, m.started_at
  into v_status, v_started_at
  from public.multiplayer_matches m
  where m.id = p_match_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_status <> 'starting' then
    return v_status;
  end if;

  if v_started_at is null then
    update public.multiplayer_matches
    set started_at = now()
    where id = p_match_id;
    v_started_at := now();
  end if;

  if now() >= v_started_at then
    update public.multiplayer_matches
    set status = 'in_progress'
    where id = p_match_id;
    return 'started';
  end if;

  return 'starting';
end;
$function$
;


