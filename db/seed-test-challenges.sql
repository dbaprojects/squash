-- Seed 6 test challenges covering all visible status combos
-- Safe: does NOT modify ladder_positions
-- Run in Supabase SQL editor

DO $$
DECLARE
  ids UUID[];
BEGIN

  delete from ladder_challenges;
  
  SELECT ARRAY(
    SELECT player_id FROM ladder_positions ORDER BY position LIMIT 8
  ) INTO ids;

  -- 1. pending (⏳)
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, message)
  VALUES (ids[2], ids[1], 'pending', NOW() - INTERVAL '2 days', 'Time to settle this on court!');

  -- 2. accepted / game on (🎾)
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, message)
  VALUES (ids[4], ids[3], 'accepted', NOW() - INTERVAL '5 days', NOW() - INTERVAL '3 days', 'Ready to buy me a beer?');

  -- 3. completed — challenger wins (🍺/😢)
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change)
  VALUES (ids[5], ids[4], 'completed', NOW() - INTERVAL '14 days', NOW() - INTERVAL '13 days', NOW() - INTERVAL '8 days', ids[5], 1);

  -- 4. completed — challenged wins (🍺/😢)
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change)
  VALUES (ids[7], ids[6], 'completed', NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days', NOW() - INTERVAL '4 days', ids[6], 1);

  -- 5. declined — penalty (🐔)
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at)
  VALUES (ids[6], ids[5], 'declined', NOW() - INTERVAL '6 days', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days');

  -- 6. forfeited — no response (🏳️)
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, completed_at, winner_id, winner_pos_change)
  VALUES (ids[8], ids[7], 'forfeited', NOW() - INTERVAL '20 days', NOW() - INTERVAL '6 days', ids[8], 1);
END $$;
