const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireSession, requireAdmin } = require('./auth');

// GET /api/signups/:eventId
router.get('/signups/:eventId', requireSession, (req, res) => {
  res.json(db.signups.forEvent(req.params.eventId));
});

// POST /api/signups
// Body: { event_id, player_id?, guest_name?, notes? }
// signed_up_by = current session player
// If neither player_id nor guest_name → defaults to signing up self
router.post('/signups', requireSession, (req, res) => {
  const { event_id, player_id, guest_name, notes } = req.body;
  if (!event_id) return res.status(400).json({ error: 'event_id required' });

  const event = db.events.get(event_id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  // Resolve who is being signed up
  let targetPlayerId = player_id || null;
  let targetGuestName = guest_name || null;

  if (!targetPlayerId && !targetGuestName) {
    // Default: sign up self
    targetPlayerId = req.player.id;
  }

  if (targetPlayerId && targetGuestName) {
    return res.status(400).json({ error: 'Provide either player_id or guest_name, not both' });
  }

  // Prevent duplicate player signup on same event
  if (targetPlayerId) {
    const existing = db.signups.findPlayerOnEvent(event_id, targetPlayerId);
    if (existing) return res.status(409).json({ error: 'Player already signed up for this event' });
  }

  const signup = db.signups.add({
    event_id,
    signed_up_by: req.player.id,
    player_id: targetPlayerId,
    guest_name: targetGuestName,
    notes: notes || null
  });

  res.status(201).json(signup);
});

// DELETE /api/signups/:id
// Players can remove their own signups; admin can remove any
router.delete('/signups/:id', requireSession, (req, res) => {
  const signup = db.signups.get(req.params.id);
  if (!signup) return res.status(404).json({ error: 'Signup not found' });

  const isOwn = signup.signed_up_by === req.player.id || signup.player_id === req.player.id;
  if (!isOwn && !req.player.is_admin) {
    return res.status(403).json({ error: 'Cannot remove another player\'s signup' });
  }

  db.signups.remove(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
