-- Seed test challenges — all 8 status combos
-- Safe: does NOT modify ladder_positions
-- Run in Supabase SQL editor

DO $$
DECLARE
  ids UUID[];
BEGIN
  DELETE FROM ladder_challenges;

  SELECT ARRAY(
    SELECT player_id FROM ladder_positions ORDER BY position LIMIT 10
  ) INTO ids;

  -- 1. pending (⏳) — challenger issued, no response yet
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, message)
  VALUES (ids[4], ids[1], 'pending', NOW() - INTERVAL '2 days', 'Time to settle this on court!');

  -- 2. accepted / game on (⚔️) — challenged accepted
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, message)
  VALUES (ids[5], ids[2], 'accepted', NOW() - INTERVAL '5 days', NOW() - INTERVAL '3 days', 'Ready to buy me a beer?');

  -- 3. completed — challenger wins (🍺/😢)
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (ids[6], ids[3], 'completed', NOW() - INTERVAL '14 days', NOW() - INTERVAL '13 days', NOW() - INTERVAL '8 days', ids[6], 3, 1);

  -- 4. completed — challenged wins (🍺/😢)
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (ids[8], ids[5], 'completed', NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days', NOW() - INTERVAL '4 days', ids[5], 0, 1);

  -- 5. declined — penalty (🐔) loser drops 1
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, loser_pos_change)
  VALUES (ids[7], ids[4], 'declined', NOW() - INTERVAL '6 days', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days', 1);

  -- 6. declined_injury — no penalty (shown in Me tile only, not home tile)
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at)
  VALUES (ids[9], ids[6], 'declined_injury', NOW() - INTERVAL '3 days', NOW() - INTERVAL '1 day');

  -- 7. forfeited — no reply, challenged drops several places (👻)
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (ids[10], ids[7], 'forfeited', NOW() - INTERVAL '20 days', NOW() - INTERVAL '6 days', ids[10], 0, 3);

  -- 8. withdrawn — challenger pulled out (not shown in home tile)
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at)
  VALUES (ids[3], ids[1], 'withdrawn', NOW() - INTERVAL '1 day', NOW() - INTERVAL '12 hours');

END $$;
