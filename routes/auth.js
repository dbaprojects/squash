const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/auth/login
// Local: looks up email and sets session immediately (no real magic link)
// Prod (Supabase): would call supabase.auth.signInWithOtp
router.post('/login', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  const player = db.players.getByEmail(email.trim().toLowerCase());
  if (!player) {
    return res.status(404).json({ error: 'No account found for that email' });
  }

  req.session.playerId = player.id;
  res.json({ ok: true, player: sanitize(player) });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// GET /api/auth/me  — also mounted at GET /api/me via server.js
router.get('/me', requireSession, (req, res) => {
  res.json(sanitize(req.player));
});

function sanitize(p) {
  return {
    id: p.id,
    email: p.email,
    first_name: p.first_name,
    last_name: p.last_name,
    is_admin: !!p.is_admin,
    current_handicap: p.current_handicap
  };
}

// Middleware exported for use by other routes
function requireSession(req, res, next) {
  if (!req.session.playerId) return res.status(401).json({ error: 'Not logged in' });
  const player = db.players.get(req.session.playerId);
  if (!player || !player.active) return res.status(401).json({ error: 'Session invalid' });
  req.player = player;
  next();
}

function requireAdmin(req, res, next) {
  requireSession(req, res, () => {
    if (!req.player.is_admin) return res.status(403).json({ error: 'Admin required' });
    next();
  });
}

module.exports = router;
module.exports.requireSession = requireSession;
module.exports.requireAdmin = requireAdmin;
