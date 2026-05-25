-- Seed ladder positions from physical whiteboard (May 2026)
-- Run AFTER schema-ladder.sql
-- Div 1-3: 9 players each; Div 4: 10 players (positions 28-37)

DELETE FROM ladder_positions;

WITH placements (pos, fn, ln) AS (VALUES
  -- Division 1
  ( 1, 'Ben',       'C%'),
  ( 2, 'Terr%',    'T%'),
  ( 3, 'James',     'B%'),
  ( 4, 'Showbihk',  'Kalra'),
  ( 5, 'Jamie',     'S%'),
  ( 6, 'Rahul',     'Ghosh'),
  ( 7, 'Aiden',     'Arnold'),
  ( 8, 'David',     'Barkess'),
  ( 9, 'Andrew',    'M%'),
  -- Division 2
  (10, 'Kenzie',    'W%'),
  (11, 'Leo',       'P%'),
  (12, 'Ray%',     'K%'),
  (13, 'Kevin',     'W%'),
  (14, 'Nick',      'F%'),
  (15, 'Sander',    'H%'),
  (16, 'Yomi',      'B%'),
  (17, 'Alex',      'W%'),
  (18, 'Phil',      'D%'),
  -- Division 3
  (19, 'Mark',      'M%'),
  (20, 'Ben',       'K%'),
  (21, 'David',     'C%'),
  (22, 'Andrew',    'V%'),
  (23, 'Alex',      'K%'),
  (24, 'Ross',      'K%'),
  (25, 'Ben',       'Chandler'),
  (26, 'Ragnar',    'B%'),
  (27, 'Richard',   'O%'),
  -- Division 4
  (28, 'Sebastien', 'Bruggeman'),
  (29, 'Andy',      'G%'),
  (30, 'Ashley',    'N%'),
  (31, 'Sa%ed',     'Radaideh'),
  (32, 'Ganapat%',  'V%'),
  (33, 'Matt',      'S%'),
  (34, 'Stuart',    'L%'),
  (35, 'Peter',     'Moore'),
  (36, 'Soumit',    'Goswa%'),
  (37, 'Shane',     'M%')
)
INSERT INTO ladder_positions (player_id, position, updated_at)
SELECT DISTINCT ON (pl.pos) p.id, pl.pos, NOW()
FROM placements pl
JOIN players p
  ON p.first_name ILIKE pl.fn
 AND p.last_name  ILIKE pl.ln
 AND p.active = TRUE
ORDER BY pl.pos;

-- Verify: show what was inserted (and what positions are missing)
SELECT
  lp.position,
  p.first_name || ' ' || p.last_name AS name,
  p.current_handicap AS hc
FROM ladder_positions lp
JOIN players p ON p.id = lp.player_id
ORDER BY lp.position;
