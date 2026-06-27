-- HCRR detailed results — stored as a JSONB document on the existing
-- hof_results row for that month (one HCRR per month, matching the HoF model).
-- Run once in the Supabase SQL editor.
--
-- Shape of hcrr_data:
-- {
--   "groups": [
--     {
--       "id": "<local uid>",
--       "stage": "box" | "semi" | "final",
--       "name": "Box 1",
--       "players": [
--         { "pid": "<local uid>", "player_id": "<players.id|null>",
--           "name": "Charlie Motion", "initials": "CM", "hc": -4 }
--       ],
--       "scores": { "<rowPid>": { "<colPid>": 7 } }   -- row player's points vs col player
--     }
--   ]
-- }
--
-- hc is denormalised (frozen) at record time so later handicap changes don't
-- rewrite history.

ALTER TABLE hof_results ADD COLUMN IF NOT EXISTS hcrr_data JSONB;

-- RLS already open on hof_results (hof_select / hof_write, both USING (TRUE)),
-- so the new column inherits those policies — no extra policy needed.
