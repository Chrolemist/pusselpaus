-- ============================================================
-- mp_force_cleanup
--
-- Rensa ALLA aktiva matcher för den inloggade användaren.
-- Kör denna SQL i Supabase Dashboard → SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION mp_force_cleanup()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER          -- Kringgår RLS
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match   record;
  v_cleaned integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Hitta alla matcher där användaren har en aktiv player-rad
  -- och matchen inte är finished/cancelled
  FOR v_match IN
    SELECT m.id, m.status, m.host_id
    FROM multiplayer_match_players mp
    JOIN multiplayer_matches m ON m.id = mp.match_id
    WHERE mp.user_id = v_user_id
      AND mp.status IN ('accepted', 'invited')
      AND m.status IN ('waiting', 'starting', 'in_progress')
  LOOP
    -- Markera min player-rad som forfeited
    UPDATE multiplayer_match_players
    SET status = 'forfeited', forfeited = true
    WHERE match_id = v_match.id
      AND user_id = v_user_id;

    -- Om matchen fortfarande är i waiting/starting, avbryt den
    IF v_match.status IN ('waiting', 'starting') THEN
      UPDATE multiplayer_matches
      SET status = 'cancelled'
      WHERE id = v_match.id
        AND status IN ('waiting', 'starting');
    END IF;

    -- Om matchen är in_progress markeras den som completed
    -- (motståndaren vinner automatiskt via trigger/resolve)
    IF v_match.status = 'in_progress' THEN
      -- Markera matchen så att resolve-logiken kan avgöra vinnare
      UPDATE multiplayer_matches
      SET status = 'completed'
      WHERE id = v_match.id
        AND status = 'in_progress';
    END IF;

    v_cleaned := v_cleaned + 1;
  END LOOP;

  RETURN v_cleaned;
END;
$$;

-- Ge alla autentiserade användare tillgång
GRANT EXECUTE ON FUNCTION mp_force_cleanup() TO authenticated;
