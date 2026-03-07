


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."generate_unique_tag"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  new_tag text;
  attempts int := 0;
begin
  -- Bara generera ny tagg om username ändras eller det är ett nytt konto
  if TG_OP = 'INSERT' or NEW.username is distinct from OLD.username then
    loop
      new_tag := lpad(floor(random() * 10000)::text, 4, '0');
      -- Kolla om kombinationen redan finns
      if not exists (
        select 1 from public.profiles
        where username = NEW.username and tag = new_tag and id != NEW.id
      ) then
        NEW.tag := new_tag;
        return NEW;
      end if;
      attempts := attempts + 1;
      if attempts > 50 then
        raise exception 'Kunde inte hitta en ledig tagg för "%"', NEW.username;
      end if;
    end loop;
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."generate_unique_tag"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."matchmake_join"("p_game_id" "text", "p_difficulty" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_queue_id uuid;
  v_match_id uuid;
  v_player_ids uuid[];
  v_config_seed int;
  v_queue_size int;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  -- Cancel stale waiting queue entries for this user+game
  update public.matchmaking_queue
  set status = 'cancelled'
  where user_id = v_user_id
    and game_id = p_game_id
    and status = 'waiting';

  -- Insert new queue entry
  insert into public.matchmaking_queue (user_id, game_id, difficulty)
  values (v_user_id, p_game_id, p_difficulty)
  returning id into v_queue_id;

  -- Lock waiting players (FIFO, up to 5)
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

  -- Queue size after this join
  select count(*)::int
  into v_queue_size
  from public.matchmaking_queue
  where game_id = p_game_id
    and status = 'waiting';

  -- Need at least 2 to form a match
  if array_length(v_player_ids, 1) is null
     or array_length(v_player_ids, 1) < 2 then
    return json_build_object(
      'queued', true,
      'queue_id', v_queue_id,
      'match_id', null,
      'config_seed', null,
      'queue_size', v_queue_size
    );
  end if;

  v_config_seed := floor(random() * 2147483647)::int;

  -- Create match in waiting state
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
  returning id into v_match_id;

  -- Create player rows as neutral matched state
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

  -- Mark queue entries as matched
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
    'queue_size', array_length(v_player_ids, 1)
  );
end;
$$;


ALTER FUNCTION "public"."matchmake_join"("p_game_id" "text", "p_difficulty" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."matchmake_leave"("p_game_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE matchmaking_queue
  SET status = 'cancelled'
  WHERE user_id = auth.uid()
    AND game_id = p_game_id
    AND status = 'waiting';
END;
$$;


ALTER FUNCTION "public"."matchmake_leave"("p_game_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."matchmake_poll"("p_game_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row matchmaking_queue%ROWTYPE;
  v_queue_size int;
  v_config_seed int;
BEGIN
  SELECT * INTO v_row
  FROM matchmaking_queue
  WHERE user_id = v_user_id
    AND game_id = p_game_id
    AND status IN ('waiting', 'matched')
  ORDER BY queued_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'queued', false, 'queue_id', null,
      'match_id', null, 'config_seed', null, 'queue_size', 0
    );
  END IF;

  SELECT count(*)::int INTO v_queue_size
  FROM matchmaking_queue
  WHERE game_id = p_game_id AND status = 'waiting';

  IF v_row.status = 'matched' AND v_row.matched_match_id IS NOT NULL THEN
    SELECT config_seed INTO v_config_seed
    FROM multiplayer_matches WHERE id = v_row.matched_match_id;

    RETURN jsonb_build_object(
      'queued', false,
      'queue_id', v_row.id,
      'match_id', v_row.matched_match_id,
      'config_seed', v_config_seed,
      'queue_size', v_queue_size
    );
  END IF;

  RETURN jsonb_build_object(
    'queued', true,
    'queue_id', v_row.id,
    'match_id', null,
    'config_seed', null,
    'queue_size', v_queue_size
  );
END;
$$;


ALTER FUNCTION "public"."matchmake_poll"("p_game_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mp_accept_invite"("p_match_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_match_status text;
  v_stake integer;
  v_coins integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select m.status, m.stake
  into v_match_status, v_stake
  from public.multiplayer_matches m
  where m.id = p_match_id
  for update;

  if not found then
    raise exception 'Match not found';
  end if;

  if v_match_status <> 'waiting' then
    raise exception 'Match is not waiting';
  end if;

  perform 1
  from public.multiplayer_match_players p
  where p.match_id = p_match_id
    and p.user_id = v_uid
    and p.status = 'invited';

  if not found then
    raise exception 'No active invite found';
  end if;

  if v_stake > 0 then
    select coins into v_coins
    from public.profiles
    where id = v_uid
    for update;

    if v_coins is null then
      raise exception 'Profile not found';
    end if;

    if v_coins < v_stake then
      raise exception 'Insufficient coins';
    end if;

    update public.profiles
    set coins = coins - v_stake,
        updated_at = now()
    where id = v_uid;
  end if;

  update public.multiplayer_match_players
  set status = 'accepted',
      stake_locked = v_stake,
      submitted = false,
      submitted_at = null
  where match_id = p_match_id
    and user_id = v_uid;
end;
$$;


ALTER FUNCTION "public"."mp_accept_invite"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mp_cancel_match"("p_match_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_match record;
begin
  select * into v_match from public.multiplayer_matches where id = p_match_id;
  if not found then
    raise exception 'Match not found';
  end if;

  if v_match.host_id <> auth.uid() then
    raise exception 'Only the host can cancel the match';
  end if;

  if v_match.status not in ('waiting', 'starting') then
    raise exception 'Match can only be cancelled while waiting or starting';
  end if;

  -- Refund locked stakes to all accepted players
  update public.profiles p
  set coins = p.coins + mp.stake_locked
  from public.multiplayer_match_players mp
  where mp.match_id = p_match_id
    and mp.status = 'accepted'
    and mp.stake_locked > 0
    and p.id = mp.user_id;

  -- Mark match as completed with no winner
  update public.multiplayer_matches
  set status = 'completed',
      winner_id = null,
      completed_at = now()
  where id = p_match_id;
end;
$$;


ALTER FUNCTION "public"."mp_cancel_match"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mp_create_match"("p_game_id" "text", "p_stake" integer, "p_invited_ids" "uuid"[], "p_config" "jsonb" DEFAULT '{}'::"jsonb", "p_config_seed" bigint DEFAULT NULL::bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  if p_game_id not in ('sudoku', 'numberpath', 'rytmrush') then
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


ALTER FUNCTION "public"."mp_create_match"("p_game_id" "text", "p_stake" integer, "p_invited_ids" "uuid"[], "p_config" "jsonb", "p_config_seed" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mp_decline_invite"("p_match_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_pending int;
  v_accepted int;
  v_player record;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.multiplayer_match_players
  set status = 'declined'
  where match_id = p_match_id and user_id = v_user_id and status = 'invited';

  if not found then
    raise exception 'Invite not found';
  end if;

  select count(*) into v_pending
  from public.multiplayer_match_players
  where match_id = p_match_id and status = 'invited';

  select count(*) into v_accepted
  from public.multiplayer_match_players
  where match_id = p_match_id and status = 'accepted';

  if v_pending = 0 and v_accepted < 2 then
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


ALTER FUNCTION "public"."mp_decline_invite"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mp_force_cleanup"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match record;
  v_cleaned integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.matchmaking_queue
  SET status = 'cancelled',
      matched_match_id = null
  WHERE user_id = v_user_id
    AND status IN ('waiting', 'matched');

  FOR v_match IN
    SELECT DISTINCT m.id, m.status
    FROM public.multiplayer_match_players mp
    JOIN public.multiplayer_matches m ON m.id = mp.match_id
    WHERE mp.user_id = v_user_id
      AND mp.status IN ('matched', 'accepted', 'invited')
      AND m.status IN ('waiting', 'starting', 'in_progress')
  LOOP
    UPDATE public.multiplayer_match_players
    SET status = 'declined',
        ready = false,
        ready_at = null,
        forfeited = true
    WHERE match_id = v_match.id
      AND user_id = v_user_id
      AND status IN ('matched', 'accepted', 'invited');

    IF v_match.status IN ('waiting', 'starting') THEN
      UPDATE public.multiplayer_matches
      SET status = 'cancelled',
          completed_at = now()
      WHERE id = v_match.id
        AND status IN ('waiting', 'starting');
    ELSIF v_match.status = 'in_progress' THEN
      UPDATE public.multiplayer_matches
      SET status = 'completed',
          completed_at = now()
      WHERE id = v_match.id
        AND status = 'in_progress';
    END IF;

    v_cleaned := v_cleaned + 1;
  END LOOP;

  RETURN v_cleaned;
END;
$$;


ALTER FUNCTION "public"."mp_force_cleanup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mp_forfeit_match"("p_match_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_game_id text;
  v_winner_id uuid;
  v_valid_count integer := 0;
  v_pot integer := 0;
  v_bonus integer := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select m.status, m.game_id
  into v_status, v_game_id
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
      forfeited = true,
      elapsed_seconds = null,
      score = null,
      survived_seconds = null,
      submitted_at = now()
  where p.match_id = p_match_id
    and p.user_id = v_uid
    and p.status = 'accepted'
    and p.submitted = false;

  if not found then
    return;
  end if;

  if exists (
    select 1
    from public.multiplayer_match_players p
    where p.match_id = p_match_id
      and p.status = 'accepted'
      and p.submitted = false
  ) then
    return;
  end if;

  -- Everyone submitted (either result or forfeit). Resolve winner among non-forfeit valid results.
  if v_game_id in ('sudoku', 'numberpath') then
    select p.user_id
    into v_winner_id
    from public.multiplayer_match_players p
    where p.match_id = p_match_id
      and p.status = 'accepted'
      and p.submitted = true
      and coalesce(p.forfeited, false) = false
      and p.elapsed_seconds is not null
    order by p.elapsed_seconds asc, p.submitted_at asc
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
    raise exception 'Invalid game_id';
  end if;

  select count(*)
  into v_valid_count
  from public.multiplayer_match_players p
  where p.match_id = p_match_id
    and p.status = 'accepted'
    and p.submitted = true
    and coalesce(p.forfeited, false) = false;

  if v_valid_count = 0 or v_winner_id is null then
    -- Everyone forfeited / no valid finisher -> refund locked stakes and complete with no winner.
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

  select coalesce(sum(p.stake_locked), 0)::integer
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


ALTER FUNCTION "public"."mp_forfeit_match"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mp_guard_single_active_match"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_status text;
  v_conflict boolean;
begin
  if new.status <> 'accepted' then
    return new;
  end if;

  select m.status into v_status
  from public.multiplayer_matches m
  where m.id = new.match_id;

  if v_status not in ('waiting', 'starting', 'in_progress') then
    return new;
  end if;

  select exists (
    select 1
    from public.multiplayer_match_players p
    join public.multiplayer_matches m on m.id = p.match_id
    where p.user_id = new.user_id
      and p.status = 'accepted'
      and p.match_id <> new.match_id
      and m.status in ('waiting', 'starting', 'in_progress')
  ) into v_conflict;

  if v_conflict then
    raise exception 'User already has an active multiplayer match';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."mp_guard_single_active_match"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mp_is_participant"("p_match_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
begin
  return exists (
    select 1
    from public.multiplayer_match_players p
    where p.match_id = p_match_id
      and p.user_id = auth.uid()
  );
end;
$$;


ALTER FUNCTION "public"."mp_is_participant"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mp_mark_ready"("p_match_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
    and ready = true;

  select count(*)::int
  into v_total_count
  from public.multiplayer_match_players
  where match_id = p_match_id
    and forfeited = false;

  return json_build_object(
    'ok', true,
    'match_id', p_match_id,
    'ready_count', v_ready_count,
    'total_count', v_total_count,
    'all_ready', v_ready_count = v_total_count,
    'host_id', v_match.host_id,
    'status', v_match.status
  );
end;
$$;


ALTER FUNCTION "public"."mp_mark_ready"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mp_ready_state"("p_match_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
    'started_at', v_match.started_at
  );
end;
$$;


ALTER FUNCTION "public"."mp_ready_state"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mp_refund_my_waiting_locks"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_refunded integer := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  with refundable as (
    select p.id as player_row_id,
           p.stake_locked,
           p.match_id
    from public.multiplayer_match_players p
    join public.multiplayer_matches m on m.id = p.match_id
    where p.user_id = v_uid
      and p.stake_locked > 0
      and m.status = 'waiting'
      and p.submitted = false
  ),
  refund_profile as (
    update public.profiles pr
    set coins = pr.coins + coalesce((select sum(r.stake_locked) from refundable r), 0),
        updated_at = now()
    where pr.id = v_uid
    returning pr.id
  ),
  clear_locks as (
    update public.multiplayer_match_players p
    set stake_locked = 0
    where p.id in (select player_row_id from refundable)
    returning p.id
  )
  select coalesce(sum(r.stake_locked), 0)
  into v_refunded
  from refundable r;

  return v_refunded;
end;
$$;


ALTER FUNCTION "public"."mp_refund_my_waiting_locks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mp_start_if_ready"("p_match_id" "uuid", "p_countdown_seconds" integer DEFAULT 5) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_match public.multiplayer_matches%rowtype;
  v_ready_count int;
  v_total_count int;
  v_started_at timestamptz;
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

  select count(*)::int
  into v_total_count
  from public.multiplayer_match_players
  where match_id = p_match_id
    and forfeited = false;

  select count(*)::int
  into v_ready_count
  from public.multiplayer_match_players
  where match_id = p_match_id
    and forfeited = false
    and ready = true;

  if v_total_count < 2 then
    return json_build_object(
      'ok', false,
      'reason', 'not_enough_players',
      'total_count', v_total_count
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
    'total_count', v_total_count
  );
end;
$$;


ALTER FUNCTION "public"."mp_start_if_ready"("p_match_id" "uuid", "p_countdown_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mp_start_match"("p_match_id" "uuid", "p_countdown_seconds" integer DEFAULT 5) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_host_id uuid;
  v_status text;
  v_pending_invites integer;
  v_accepted_count integer;
  v_countdown integer := greatest(2, coalesce(p_countdown_seconds, 5));
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select m.host_id, m.status
  into v_host_id, v_status
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

  select count(*) into v_accepted_count
  from public.multiplayer_match_players p
  where p.match_id = p_match_id
    and p.status = 'accepted';

  if v_accepted_count < 2 then
    raise exception 'Need at least 2 accepted players';
  end if;

  update public.multiplayer_matches
  set status = 'starting',
      started_at = now() + make_interval(secs => v_countdown),
      completed_at = null
  where id = p_match_id;
end;
$$;


ALTER FUNCTION "public"."mp_start_match"("p_match_id" "uuid", "p_countdown_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mp_submit_result"("p_match_id" "uuid", "p_elapsed_seconds" integer, "p_score" integer, "p_survived_seconds" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
      and p.elapsed_seconds is not null
    order by p.elapsed_seconds asc, p.submitted_at asc
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


ALTER FUNCTION "public"."mp_submit_result"("p_match_id" "uuid", "p_elapsed_seconds" integer, "p_score" integer, "p_survived_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mp_tick_match_start"("p_match_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."mp_tick_match_start"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mp_try_resolve_timeout"("p_match_id" "uuid", "p_timeout_seconds" integer DEFAULT 180) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_match   record;
  v_cutoff  timestamptz := now() - (p_timeout_seconds || ' seconds')::interval;
  v_timed_out uuid[];
BEGIN
  SELECT * INTO v_match
    FROM multiplayer_matches
   WHERE id = p_match_id
     AND status = 'in_progress';

  IF v_match IS NULL THEN
    RETURN 'no_match';
  END IF;

  -- Find players who haven't submitted and whose last_seen is too old
  SELECT array_agg(mp.user_id) INTO v_timed_out
    FROM multiplayer_match_players mp
    JOIN profiles pr ON pr.id = mp.user_id
   WHERE mp.match_id = p_match_id
     AND mp.submitted = false
     AND mp.forfeited = false
     AND pr.last_seen < v_cutoff;

  IF v_timed_out IS NULL OR array_length(v_timed_out, 1) = 0 THEN
    RETURN 'no_timeout';
  END IF;

  -- Mark timed-out players as forfeited
  UPDATE multiplayer_match_players
     SET forfeited = true,
         submitted_at = now()
   WHERE match_id = p_match_id
     AND user_id = ANY(v_timed_out);

  -- If everyone is done → finish match
  IF NOT EXISTS (
    SELECT 1 FROM multiplayer_match_players
     WHERE match_id = p_match_id
       AND submitted = false
       AND forfeited = false
  ) THEN
    UPDATE multiplayer_matches
       SET status = 'completed',
           completed_at = now()
     WHERE id = p_match_id;
    RETURN 'resolved:timeout';
  END IF;

  RETURN 'partial_timeout';
END;
$$;


ALTER FUNCTION "public"."mp_try_resolve_timeout"("p_match_id" "uuid", "p_timeout_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "addressee_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "friendships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."friendships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matchmaking_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "game_id" "text" NOT NULL,
    "difficulty" "text",
    "status" "text" DEFAULT 'waiting'::"text" NOT NULL,
    "matched_match_id" "uuid",
    "queued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "matchmaking_queue_status_check" CHECK (("status" = ANY (ARRAY['waiting'::"text", 'matched'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."matchmaking_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."multiplayer_match_players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'invited'::"text" NOT NULL,
    "stake_locked" integer DEFAULT 0 NOT NULL,
    "submitted" boolean DEFAULT false NOT NULL,
    "elapsed_seconds" integer,
    "score" integer,
    "survived_seconds" integer,
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "forfeited" boolean DEFAULT false NOT NULL,
    "ready" boolean DEFAULT false NOT NULL,
    "ready_at" timestamp with time zone,
    CONSTRAINT "multiplayer_match_players_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'invited'::"text", 'matched'::"text", 'accepted'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."multiplayer_match_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."multiplayer_matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "host_id" "uuid" NOT NULL,
    "game_id" "text" NOT NULL,
    "stake" integer NOT NULL,
    "status" "text" DEFAULT 'waiting'::"text" NOT NULL,
    "winner_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "config_seed" bigint,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "multiplayer_matches_stake_check" CHECK (("stake" >= 0)),
    CONSTRAINT "multiplayer_matches_status_check" CHECK (("status" = ANY (ARRAY['waiting'::"text", 'starting'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."multiplayer_matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" DEFAULT 'Spelare'::"text" NOT NULL,
    "avatar_url" "text",
    "coins" integer DEFAULT 0 NOT NULL,
    "level" integer DEFAULT 1 NOT NULL,
    "skin" "text" DEFAULT '🙂'::"text" NOT NULL,
    "is_online" boolean DEFAULT false NOT NULL,
    "last_seen" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tag" "text" DEFAULT "lpad"(("floor"(("random"() * (10000)::double precision)))::"text", 4, '0'::"text") NOT NULL,
    "xp" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."skins" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "emoji" "text" NOT NULL,
    "price" integer DEFAULT 0 NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."skins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_game_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "game_id" "text" NOT NULL,
    "played" integer DEFAULT 0 NOT NULL,
    "won" integer DEFAULT 0 NOT NULL,
    "best_time" integer,
    "best_score" integer,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_game_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_skins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "skin_id" "text" NOT NULL,
    "purchased_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_skins" OWNER TO "postgres";


ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_requester_id_addressee_id_key" UNIQUE ("requester_id", "addressee_id");



ALTER TABLE ONLY "public"."matchmaking_queue"
    ADD CONSTRAINT "matchmaking_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."multiplayer_match_players"
    ADD CONSTRAINT "multiplayer_match_players_match_id_user_id_key" UNIQUE ("match_id", "user_id");



ALTER TABLE ONLY "public"."multiplayer_match_players"
    ADD CONSTRAINT "multiplayer_match_players_match_user_key" UNIQUE ("match_id", "user_id");



ALTER TABLE ONLY "public"."multiplayer_match_players"
    ADD CONSTRAINT "multiplayer_match_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."multiplayer_matches"
    ADD CONSTRAINT "multiplayer_matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."skins"
    ADD CONSTRAINT "skins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_game_stats"
    ADD CONSTRAINT "user_game_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_game_stats"
    ADD CONSTRAINT "user_game_stats_user_id_game_id_key" UNIQUE ("user_id", "game_id");



ALTER TABLE ONLY "public"."user_skins"
    ADD CONSTRAINT "user_skins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_skins"
    ADD CONSTRAINT "user_skins_user_id_skin_id_key" UNIQUE ("user_id", "skin_id");



ALTER TABLE ONLY "public"."user_skins"
    ADD CONSTRAINT "user_skins_user_skin_key" UNIQUE ("user_id", "skin_id");



CREATE INDEX "idx_friendships_addressee" ON "public"."friendships" USING "btree" ("addressee_id");



CREATE INDEX "idx_friendships_requester" ON "public"."friendships" USING "btree" ("requester_id");



CREATE INDEX "idx_mmq_game_status" ON "public"."matchmaking_queue" USING "btree" ("game_id", "status") WHERE ("status" = 'waiting'::"text");



CREATE INDEX "idx_mp_matches_host" ON "public"."multiplayer_matches" USING "btree" ("host_id");



CREATE INDEX "idx_mp_matches_status" ON "public"."multiplayer_matches" USING "btree" ("status");



CREATE INDEX "idx_mp_players_match" ON "public"."multiplayer_match_players" USING "btree" ("match_id");



CREATE INDEX "idx_mp_players_user" ON "public"."multiplayer_match_players" USING "btree" ("user_id");



CREATE INDEX "idx_multiplayer_match_players_match_ready" ON "public"."multiplayer_match_players" USING "btree" ("match_id", "ready");



CREATE INDEX "idx_profiles_online" ON "public"."profiles" USING "btree" ("is_online") WHERE ("is_online" = true);



CREATE UNIQUE INDEX "idx_profiles_username_tag" ON "public"."profiles" USING "btree" ("username", "tag");



CREATE INDEX "idx_user_game_stats_game" ON "public"."user_game_stats" USING "btree" ("game_id");



CREATE INDEX "idx_user_game_stats_user" ON "public"."user_game_stats" USING "btree" ("user_id");



CREATE INDEX "idx_user_skins_user" ON "public"."user_skins" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "trg_generate_tag" BEFORE INSERT OR UPDATE OF "username" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."generate_unique_tag"();



CREATE OR REPLACE TRIGGER "trg_mp_single_active_guard" BEFORE INSERT OR UPDATE OF "status" ON "public"."multiplayer_match_players" FOR EACH ROW EXECUTE FUNCTION "public"."mp_guard_single_active_match"();



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_addressee_id_fkey" FOREIGN KEY ("addressee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matchmaking_queue"
    ADD CONSTRAINT "matchmaking_queue_matched_match_id_fkey" FOREIGN KEY ("matched_match_id") REFERENCES "public"."multiplayer_matches"("id");



ALTER TABLE ONLY "public"."matchmaking_queue"
    ADD CONSTRAINT "matchmaking_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."multiplayer_match_players"
    ADD CONSTRAINT "multiplayer_match_players_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."multiplayer_matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."multiplayer_match_players"
    ADD CONSTRAINT "multiplayer_match_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."multiplayer_matches"
    ADD CONSTRAINT "multiplayer_matches_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."multiplayer_matches"
    ADD CONSTRAINT "multiplayer_matches_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_game_stats"
    ADD CONSTRAINT "user_game_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_skins"
    ADD CONSTRAINT "user_skins_skin_id_fkey" FOREIGN KEY ("skin_id") REFERENCES "public"."skins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_skins"
    ADD CONSTRAINT "user_skins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Friendships: läs egna" ON "public"."friendships" FOR SELECT USING ((("auth"."uid"() = "requester_id") OR ("auth"."uid"() = "addressee_id")));



CREATE POLICY "Friendships: skicka förfrågan" ON "public"."friendships" FOR INSERT WITH CHECK (("auth"."uid"() = "requester_id"));



CREATE POLICY "Friendships: svara på förfrågan" ON "public"."friendships" FOR UPDATE USING (("auth"."uid"() = "addressee_id")) WITH CHECK (("auth"."uid"() = "addressee_id"));



CREATE POLICY "Friendships: ta bort" ON "public"."friendships" FOR DELETE USING ((("auth"."uid"() = "requester_id") OR ("auth"."uid"() = "addressee_id")));



CREATE POLICY "Profiles: läs alla" ON "public"."profiles" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Profiles: skapa egen" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Profiles: uppdatera egen" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Skins: läs alla" ON "public"."skins" FOR SELECT USING (true);



CREATE POLICY "UserGameStats: läs alla" ON "public"."user_game_stats" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "UserGameStats: skapa egen" ON "public"."user_game_stats" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "UserGameStats: uppdatera egen" ON "public"."user_game_stats" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "UserSkins: köp" ON "public"."user_skins" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "UserSkins: läs egna" ON "public"."user_skins" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own queue entries" ON "public"."matchmaking_queue" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."matchmaking_queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mp_matches_select_participants" ON "public"."multiplayer_matches" FOR SELECT TO "authenticated" USING ("public"."mp_is_participant"("id"));



CREATE POLICY "mp_players_select_own_or_same_match" ON "public"."multiplayer_match_players" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."mp_is_participant"("match_id")));



ALTER TABLE "public"."multiplayer_match_players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."multiplayer_matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."skins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_game_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_skins" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."generate_unique_tag"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_unique_tag"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_unique_tag"() TO "service_role";



GRANT ALL ON FUNCTION "public"."matchmake_join"("p_game_id" "text", "p_difficulty" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."matchmake_join"("p_game_id" "text", "p_difficulty" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."matchmake_join"("p_game_id" "text", "p_difficulty" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."matchmake_leave"("p_game_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."matchmake_leave"("p_game_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."matchmake_leave"("p_game_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."matchmake_poll"("p_game_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."matchmake_poll"("p_game_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."matchmake_poll"("p_game_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mp_accept_invite"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mp_accept_invite"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mp_accept_invite"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mp_cancel_match"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mp_cancel_match"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mp_cancel_match"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mp_create_match"("p_game_id" "text", "p_stake" integer, "p_invited_ids" "uuid"[], "p_config" "jsonb", "p_config_seed" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."mp_create_match"("p_game_id" "text", "p_stake" integer, "p_invited_ids" "uuid"[], "p_config" "jsonb", "p_config_seed" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mp_create_match"("p_game_id" "text", "p_stake" integer, "p_invited_ids" "uuid"[], "p_config" "jsonb", "p_config_seed" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."mp_decline_invite"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mp_decline_invite"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mp_decline_invite"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mp_force_cleanup"() TO "anon";
GRANT ALL ON FUNCTION "public"."mp_force_cleanup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mp_force_cleanup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mp_forfeit_match"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mp_forfeit_match"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mp_forfeit_match"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mp_guard_single_active_match"() TO "anon";
GRANT ALL ON FUNCTION "public"."mp_guard_single_active_match"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mp_guard_single_active_match"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mp_is_participant"("p_match_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mp_is_participant"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mp_is_participant"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mp_is_participant"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mp_mark_ready"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mp_mark_ready"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mp_mark_ready"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mp_ready_state"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mp_ready_state"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mp_ready_state"("p_match_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mp_refund_my_waiting_locks"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mp_refund_my_waiting_locks"() TO "anon";
GRANT ALL ON FUNCTION "public"."mp_refund_my_waiting_locks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mp_refund_my_waiting_locks"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mp_start_if_ready"("p_match_id" "uuid", "p_countdown_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."mp_start_if_ready"("p_match_id" "uuid", "p_countdown_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mp_start_if_ready"("p_match_id" "uuid", "p_countdown_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."mp_start_match"("p_match_id" "uuid", "p_countdown_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."mp_start_match"("p_match_id" "uuid", "p_countdown_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mp_start_match"("p_match_id" "uuid", "p_countdown_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."mp_submit_result"("p_match_id" "uuid", "p_elapsed_seconds" integer, "p_score" integer, "p_survived_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."mp_submit_result"("p_match_id" "uuid", "p_elapsed_seconds" integer, "p_score" integer, "p_survived_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mp_submit_result"("p_match_id" "uuid", "p_elapsed_seconds" integer, "p_score" integer, "p_survived_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."mp_tick_match_start"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mp_tick_match_start"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mp_tick_match_start"("p_match_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mp_try_resolve_timeout"("p_match_id" "uuid", "p_timeout_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mp_try_resolve_timeout"("p_match_id" "uuid", "p_timeout_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."mp_try_resolve_timeout"("p_match_id" "uuid", "p_timeout_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mp_try_resolve_timeout"("p_match_id" "uuid", "p_timeout_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


















GRANT ALL ON TABLE "public"."friendships" TO "anon";
GRANT ALL ON TABLE "public"."friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships" TO "service_role";



GRANT ALL ON TABLE "public"."matchmaking_queue" TO "anon";
GRANT ALL ON TABLE "public"."matchmaking_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."matchmaking_queue" TO "service_role";



GRANT ALL ON TABLE "public"."multiplayer_match_players" TO "anon";
GRANT ALL ON TABLE "public"."multiplayer_match_players" TO "authenticated";
GRANT ALL ON TABLE "public"."multiplayer_match_players" TO "service_role";



GRANT ALL ON TABLE "public"."multiplayer_matches" TO "anon";
GRANT ALL ON TABLE "public"."multiplayer_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."multiplayer_matches" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."skins" TO "anon";
GRANT ALL ON TABLE "public"."skins" TO "authenticated";
GRANT ALL ON TABLE "public"."skins" TO "service_role";



GRANT ALL ON TABLE "public"."user_game_stats" TO "anon";
GRANT ALL ON TABLE "public"."user_game_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."user_game_stats" TO "service_role";



GRANT ALL ON TABLE "public"."user_skins" TO "anon";
GRANT ALL ON TABLE "public"."user_skins" TO "authenticated";
GRANT ALL ON TABLE "public"."user_skins" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";


