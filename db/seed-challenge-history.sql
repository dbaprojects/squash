-- Seed ~50 historical ladder challenges spread across all divisions.
-- Uses position-based subqueries — no hardcoded UUIDs.
-- Does NOT change ladder_positions.
-- Run in Supabase SQL editor.

DO $$
DECLARE
  p1  UUID; p2  UUID; p3  UUID; p4  UUID; p5  UUID;
  p6  UUID; p7  UUID; p8  UUID; p9  UUID; p10 UUID;
  p11 UUID; p12 UUID; p13 UUID; p14 UUID; p15 UUID;
  p16 UUID; p17 UUID; p18 UUID; p19 UUID; p20 UUID;
  p21 UUID; p22 UUID; p23 UUID; p24 UUID; p25 UUID;
  p26 UUID; p27 UUID; p28 UUID; p29 UUID; p30 UUID;
  p31 UUID; p32 UUID; p33 UUID; p34 UUID; p35 UUID;
  p36 UUID; p37 UUID;
BEGIN
  SELECT player_id INTO p1  FROM ladder_positions WHERE position = 1;
  SELECT player_id INTO p2  FROM ladder_positions WHERE position = 2;
  SELECT player_id INTO p3  FROM ladder_positions WHERE position = 3;
  SELECT player_id INTO p4  FROM ladder_positions WHERE position = 4;
  SELECT player_id INTO p5  FROM ladder_positions WHERE position = 5;
  SELECT player_id INTO p6  FROM ladder_positions WHERE position = 6;
  SELECT player_id INTO p7  FROM ladder_positions WHERE position = 7;
  SELECT player_id INTO p8  FROM ladder_positions WHERE position = 8;
  SELECT player_id INTO p9  FROM ladder_positions WHERE position = 9;
  SELECT player_id INTO p10 FROM ladder_positions WHERE position = 10;
  SELECT player_id INTO p11 FROM ladder_positions WHERE position = 11;
  SELECT player_id INTO p12 FROM ladder_positions WHERE position = 12;
  SELECT player_id INTO p13 FROM ladder_positions WHERE position = 13;
  SELECT player_id INTO p14 FROM ladder_positions WHERE position = 14;
  SELECT player_id INTO p15 FROM ladder_positions WHERE position = 15;
  SELECT player_id INTO p16 FROM ladder_positions WHERE position = 16;
  SELECT player_id INTO p17 FROM ladder_positions WHERE position = 17;
  SELECT player_id INTO p18 FROM ladder_positions WHERE position = 18;
  SELECT player_id INTO p19 FROM ladder_positions WHERE position = 19;
  SELECT player_id INTO p20 FROM ladder_positions WHERE position = 20;
  SELECT player_id INTO p21 FROM ladder_positions WHERE position = 21;
  SELECT player_id INTO p22 FROM ladder_positions WHERE position = 22;
  SELECT player_id INTO p23 FROM ladder_positions WHERE position = 23;
  SELECT player_id INTO p24 FROM ladder_positions WHERE position = 24;
  SELECT player_id INTO p25 FROM ladder_positions WHERE position = 25;
  SELECT player_id INTO p26 FROM ladder_positions WHERE position = 26;
  SELECT player_id INTO p27 FROM ladder_positions WHERE position = 27;
  SELECT player_id INTO p28 FROM ladder_positions WHERE position = 28;
  SELECT player_id INTO p29 FROM ladder_positions WHERE position = 29;
  SELECT player_id INTO p30 FROM ladder_positions WHERE position = 30;
  SELECT player_id INTO p31 FROM ladder_positions WHERE position = 31;
  SELECT player_id INTO p32 FROM ladder_positions WHERE position = 32;
  SELECT player_id INTO p33 FROM ladder_positions WHERE position = 33;
  SELECT player_id INTO p34 FROM ladder_positions WHERE position = 34;
  SELECT player_id INTO p35 FROM ladder_positions WHERE position = 35;
  SELECT player_id INTO p36 FROM ladder_positions WHERE position = 36;
  SELECT player_id INTO p37 FROM ladder_positions WHERE position = 37;

  -- ── Division 1 ─────────────────────────────────────────────────────────────
  -- pos4 challenged pos2 → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change, message)
  VALUES (p4, p2, 'completed', NOW()-'90 days'::interval, NOW()-'89 days'::interval, NOW()-'87 days'::interval, p4, 2, 1, 'Let''s settle this over a beer after.');

  -- pos5 challenged pos3 → challenged won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p5, p3, 'completed', NOW()-'88 days'::interval, NOW()-'87 days'::interval, NOW()-'85 days'::interval, p3, 0, 1);

  -- pos6 challenged pos4 → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change, message)
  VALUES (p6, p4, 'completed', NOW()-'86 days'::interval, NOW()-'85 days'::interval, NOW()-'83 days'::interval, p6, 2, 1, 'Coming for you next!');

  -- pos7 challenged pos5 → declined (chicken!)
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change, message)
  VALUES (p7, p5, 'declined', NOW()-'83 days'::interval, NOW()-'82 days'::interval, NOW()-'82 days'::interval, p7, 0, 1, 'I dare you.');

  -- pos8 challenged pos6 → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p8, p6, 'completed', NOW()-'80 days'::interval, NOW()-'79 days'::interval, NOW()-'77 days'::interval, p8, 2, 1);

  -- pos9 challenged pos7 → forfeited (ghosted)
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p9, p7, 'forfeited', NOW()-'78 days'::interval, NULL, NOW()-'71 days'::interval, p9, 0, 1);

  -- pos3 challenged pos1 → challenged won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change, message)
  VALUES (p3, p1, 'completed', NOW()-'75 days'::interval, NOW()-'74 days'::interval, NOW()-'72 days'::interval, p1, 0, 1, 'Top spot is mine. Come at me.');

  -- pos5 challenged pos2 → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p5, p2, 'completed', NOW()-'72 days'::interval, NOW()-'71 days'::interval, NOW()-'69 days'::interval, p5, 3, 1);

  -- pos4 challenged pos1 → declined_injury
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p4, p1, 'declined_injury', NOW()-'70 days'::interval, NOW()-'69 days'::interval, NOW()-'69 days'::interval, NULL, NULL, NULL);

  -- pos6 challenged pos3 → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p6, p3, 'completed', NOW()-'68 days'::interval, NOW()-'67 days'::interval, NOW()-'65 days'::interval, p6, 3, 1);

  -- pos7 challenged pos4 → challenged won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change, message)
  VALUES (p7, p4, 'completed', NOW()-'65 days'::interval, NOW()-'64 days'::interval, NOW()-'62 days'::interval, p4, 0, 1, 'Not today mate.');

  -- pos8 challenged pos5 → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p8, p5, 'completed', NOW()-'62 days'::interval, NOW()-'61 days'::interval, NOW()-'59 days'::interval, p8, 3, 1);

  -- pos9 challenged pos6 → declined
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p9, p6, 'declined', NOW()-'60 days'::interval, NOW()-'59 days'::interval, NOW()-'59 days'::interval, p9, 0, 1);

  -- ── Division 2 ─────────────────────────────────────────────────────────────
  -- pos13 challenged pos11 → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change, message)
  VALUES (p13, p11, 'completed', NOW()-'58 days'::interval, NOW()-'57 days'::interval, NOW()-'55 days'::interval, p13, 2, 1, 'That racket needs replacing mate.');

  -- pos14 challenged pos12 → challenged won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p14, p12, 'completed', NOW()-'56 days'::interval, NOW()-'55 days'::interval, NOW()-'53 days'::interval, p12, 0, 1);

  -- pos15 challenged pos13 → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p15, p13, 'completed', NOW()-'54 days'::interval, NOW()-'53 days'::interval, NOW()-'51 days'::interval, p15, 2, 1);

  -- pos16 challenged pos14 → declined
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p16, p14, 'declined', NOW()-'52 days'::interval, NOW()-'51 days'::interval, NOW()-'51 days'::interval, p16, 0, 1);

  -- pos11 challenged pos10 → challenged won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change, message)
  VALUES (p11, p10, 'completed', NOW()-'50 days'::interval, NOW()-'49 days'::interval, NOW()-'47 days'::interval, p10, 0, 1, 'Division 2 crown stays with me.');

  -- pos12 challenged pos10 → forfeited
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p12, p10, 'forfeited', NOW()-'48 days'::interval, NULL, NOW()-'41 days'::interval, p12, 0, 1);

  -- pos17 challenged pos15 → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p17, p15, 'completed', NOW()-'44 days'::interval, NOW()-'43 days'::interval, NOW()-'41 days'::interval, p17, 2, 1);

  -- pos18 challenged pos16 → declined_injury
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p18, p16, 'declined_injury', NOW()-'42 days'::interval, NOW()-'41 days'::interval, NOW()-'41 days'::interval, NULL, NULL, NULL);

  -- pos14 challenged pos11 → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change, message)
  VALUES (p14, p11, 'completed', NOW()-'40 days'::interval, NOW()-'39 days'::interval, NOW()-'37 days'::interval, p14, 3, 1, 'Beers are on the loser.');

  -- pos15 challenged pos12 → challenged won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p15, p12, 'completed', NOW()-'38 days'::interval, NOW()-'37 days'::interval, NOW()-'35 days'::interval, p12, 0, 1);

  -- pos13 challenged pos10 → declined
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p13, p10, 'declined', NOW()-'36 days'::interval, NOW()-'35 days'::interval, NOW()-'35 days'::interval, p13, 0, 1);

  -- ── Division 3 ─────────────────────────────────────────────────────────────
  -- pos22 challenged pos20 → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p22, p20, 'completed', NOW()-'36 days'::interval, NOW()-'35 days'::interval, NOW()-'33 days'::interval, p22, 2, 1);

  -- pos23 challenged pos21 → challenged won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change, message)
  VALUES (p23, p21, 'completed', NOW()-'34 days'::interval, NOW()-'33 days'::interval, NOW()-'31 days'::interval, p21, 0, 1, 'Nice try. Not quite.');

  -- pos24 challenged pos22 → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p24, p22, 'completed', NOW()-'32 days'::interval, NOW()-'31 days'::interval, NOW()-'29 days'::interval, p24, 2, 1);

  -- pos25 challenged pos23 → declined
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p25, p23, 'declined', NOW()-'30 days'::interval, NOW()-'29 days'::interval, NOW()-'29 days'::interval, p25, 0, 1);

  -- pos20 challenged pos19 → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change, message)
  VALUES (p20, p19, 'completed', NOW()-'28 days'::interval, NOW()-'27 days'::interval, NOW()-'25 days'::interval, p20, 1, 1, 'Division 3 is mine now.');

  -- pos21 challenged pos19 → forfeited
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p21, p19, 'forfeited', NOW()-'26 days'::interval, NULL, NOW()-'19 days'::interval, p21, 0, 1);

  -- pos26 challenged pos24 → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p26, p24, 'completed', NOW()-'24 days'::interval, NOW()-'23 days'::interval, NOW()-'21 days'::interval, p26, 2, 1);

  -- pos27 challenged pos25 → declined_injury
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p27, p25, 'declined_injury', NOW()-'22 days'::interval, NOW()-'21 days'::interval, NOW()-'21 days'::interval, NULL, NULL, NULL);

  -- pos22 challenged pos19 → challenged won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p22, p19, 'completed', NOW()-'20 days'::interval, NOW()-'19 days'::interval, NOW()-'17 days'::interval, p19, 0, 1);

  -- pos23 challenged pos20 → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change, message)
  VALUES (p23, p20, 'completed', NOW()-'18 days'::interval, NOW()-'17 days'::interval, NOW()-'15 days'::interval, p23, 3, 1, 'Squash is a cruel game.');

  -- pos24 challenged pos21 → challenged won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p24, p21, 'completed', NOW()-'16 days'::interval, NOW()-'15 days'::interval, NOW()-'13 days'::interval, p21, 0, 1);

  -- ── Division 4 ─────────────────────────────────────────────────────────────
  -- pos31 challenged pos29 → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p31, p29, 'completed', NOW()-'14 days'::interval, NOW()-'13 days'::interval, NOW()-'11 days'::interval, p31, 2, 1);

  -- pos32 challenged pos30 → challenged won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change, message)
  VALUES (p32, p30, 'completed', NOW()-'13 days'::interval, NOW()-'12 days'::interval, NOW()-'10 days'::interval, p30, 0, 1, 'Not moving without a fight.');

  -- pos33 challenged pos31 → forfeited
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p33, p31, 'forfeited', NOW()-'12 days'::interval, NULL, NOW()-'5 days'::interval, p33, 0, 1);

  -- pos34 challenged pos32 → declined
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p34, p32, 'declined', NOW()-'11 days'::interval, NOW()-'10 days'::interval, NOW()-'10 days'::interval, p34, 0, 1);

  -- pos35 challenged pos33 → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p35, p33, 'completed', NOW()-'10 days'::interval, NOW()-'9 days'::interval, NOW()-'7 days'::interval, p35, 2, 1);

  -- pos36 challenged pos34 → declined_injury
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p36, p34, 'declined_injury', NOW()-'9 days'::interval, NOW()-'8 days'::interval, NOW()-'8 days'::interval, NULL, NULL, NULL);

  -- pos37 challenged pos35 → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change, message)
  VALUES (p37, p35, 'completed', NOW()-'8 days'::interval, NOW()-'7 days'::interval, NOW()-'5 days'::interval, p37, 2, 1, 'Working my way up!');

  -- pos29 challenged pos28 → challenged won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p29, p28, 'completed', NOW()-'7 days'::interval, NOW()-'6 days'::interval, NOW()-'4 days'::interval, p28, 0, 1);

  -- pos30 challenged pos28 → forfeited
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p30, p28, 'forfeited', NOW()-'6 days'::interval, NULL, NOW()-'1 day'::interval, p30, 0, 1);

  -- pos31 challenged pos28 → declined
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p31, p28, 'declined', NOW()-'5 days'::interval, NOW()-'4 days'::interval, NOW()-'4 days'::interval, p31, 0, 1);

  -- ── Cross-division boundary ────────────────────────────────────────────────
  -- pos10 challenged pos8 (D2 top vs D1 bottom) → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change, message)
  VALUES (p10, p8, 'completed', NOW()-'3 days'::interval, NOW()-'2 days'::interval, NOW()-'1 day'::interval, p10, 2, 1, 'Division title incoming.');

  -- pos19 challenged pos17 (D3 top vs D2 bottom) → challenged won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p19, p17, 'completed', NOW()-'3 days'::interval, NOW()-'2 days'::interval, NOW()-'1 day'::interval, p17, 0, 1);

  -- pos28 challenged pos26 (D4 top vs D3 bottom) → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change, message)
  VALUES (p28, p26, 'completed', NOW()-'2 days'::interval, NOW()-'2 days'::interval, NOW()-'1 day'::interval, p28, 2, 1, 'Moving on up!');

  -- pos11 challenged pos9 (D2 boundary vs D1) → declined
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p11, p9, 'declined', NOW()-'2 days'::interval, NOW()-'1 day'::interval, NOW()-'1 day'::interval, p11, 0, 1);

  -- pos20 challenged pos18 (D3 boundary vs D2) → challenger won
  INSERT INTO ladder_challenges (challenger_id, challenged_id, status, issued_at, responded_at, completed_at, winner_id, winner_pos_change, loser_pos_change)
  VALUES (p20, p18, 'completed', NOW()-'1 day'::interval, NOW()-'1 day'::interval, NOW(), p20, 2, 1);

END $$;
