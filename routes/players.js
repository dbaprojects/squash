const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireSession, requireAdmin } = require('./auth');

// GET /api/me
router.get('/me', requireSession, (req, res) => {
  res.json({
    id: req.player.id,
    email: req.player.email,
    first_name: req.player.first_name,
    last_name: req.player.last_name,
    is_admin: !!req.player.is_admin,
    current_handicap: req.player.current_handicap
  });
});

// GET /api/players/list  (any authenticated user — for user switcher)
router.get('/players/list', requireSession, (req, res) => {
  res.json(db.players.list().map(p => ({
    id: p.id, email: p.email, first_name: p.first_name, last_name: p.last_name
  })));
});

// GET /api/players  (admin)
router.get('/players', requireAdmin, (req, res) => {
  res.json(db.players.list());
});

// POST /api/players  (admin)
router.post('/players', requireAdmin, (req, res) => {
  const { email, first_name, last_name, is_admin, current_handicap } = req.body;
  if (!email || !first_name || !last_name) {
    return res.status(400).json({ error: 'email, first_name, last_name required' });
  }
  try {
    const player = db.players.create({
      email: email.trim().toLowerCase(),
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      is_admin: !!is_admin,
      current_handicap: current_handicap ?? null
    });
    res.status(201).json(player);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already registered' });
    throw e;
  }
});

// PUT /api/players/:id  (admin)
router.put('/players/:id', requireAdmin, (req, res) => {
  const player = db.players.get(req.params.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  const updated = db.players.update(req.params.id, req.body);
  res.json(updated);
});

// DELETE /api/players/:id  (admin — soft delete)
router.delete('/players/:id', requireAdmin, (req, res) => {
  db.players.deactivate(req.params.id);
  res.json({ ok: true });
});

// GET /api/players/:id/handicaps
router.get('/players/:id/handicaps', requireSession, (req, res) => {
  res.json(db.handicaps.history(req.params.id));
});

// POST /api/players/:id/handicaps  (admin)
router.post('/players/:id/handicaps', requireAdmin, (req, res) => {
  const { value, notes } = req.body;
  if (value === undefined || value === null) return res.status(400).json({ error: 'value required' });
  const result = db.handicaps.add({
    playerId: req.params.id,
    value,
    changedBy: req.player.id,
    notes: notes || null
  });
  res.status(201).json(result);
});

module.exports = router;
