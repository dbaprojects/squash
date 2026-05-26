-- Add loser_pos_change column to ladder_challenges
-- Records how many places the loser dropped:
--   1 for normal losses (completed, declined)
--   N for forfeits (challenged drops to just below challenger — may be several places)

ALTER TABLE ladder_challenges
  ADD COLUMN IF NOT EXISTS loser_pos_change INTEGER;
