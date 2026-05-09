const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireSession, requireAdmin } = require('./auth');

// GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/events', requireSession, (req, res) => {
  const hasFrom = 'from' in req.query;
  const hasTo   = 'to'   in req.query;
  const from = hasFrom ? (req.query.from || null) : (hasTo ? null : new Date().toISOString().slice(0, 10));
  const to = req.query.to || null;
  const evList = db.events.list(from, to);
  if (evList.length) {
    const allSignups = db.signups.forEvents(evList.map(e => e.id));
    const byEvent = {};
    for (const s of allSignups) {
      if (!byEvent[s.event_id]) byEvent[s.event_id] = [];
      byEvent[s.event_id].push(s);
    }
    evList.forEach(ev => { ev.signups = byEvent[ev.id] || []; });
  } else {
    evList.forEach(ev => { ev.signups = []; });
  }
  res.json(evList);
});

// GET /api/events/:id
router.get('/events/:id', requireSession, (req, res) => {
  const event = db.events.get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const eventSignups = db.signups.forEvent(req.params.id);
  res.json({ ...event, signups: eventSignups });
});

// POST /api/events  (admin)
router.post('/events', requireAdmin, (req, res) => {
  const { title, event_date, start_time, end_time, max_signups, notes } = req.body;
  if (!title || !event_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'title, event_date, start_time, end_time required' });
  }
  const event = db.events.create({
    title, event_date, start_time, end_time,
    max_signups: max_signups || null,
    notes: notes || null,
    created_by: req.player.id
  });
  res.status(201).json(event);
});

// PUT /api/events/:id  (admin)
router.put('/events/:id', requireAdmin, (req, res) => {
  const event = db.events.get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(db.events.update(req.params.id, req.body));
});

// DELETE /api/events/:id  (admin)
router.delete('/events/:id', requireAdmin, (req, res) => {
  db.events.delete(req.params.id);
  res.json({ ok: true });
});

// POST /api/events/generate-week  (admin)
// Body: { weekStartDate?: 'YYYY-MM-DD' }  — defaults to next Monday
router.post('/events/generate-week', requireAdmin, (req, res) => {
  const weekStart = req.body.weekStartDate || getNextMonday();
  const tmplList = db.templates.list();
  const created = [];

  for (const tmpl of tmplList) {
    const date = dateForDow(weekStart, tmpl.day_of_week);
    const existing = db.events.findByTemplateAndDate(tmpl.id, date);
    if (existing) continue;
    const ev = db.events.create({
      title: tmpl.name,
      event_date: date,
      start_time: tmpl.start_time,
      end_time: tmpl.end_time,
      max_signups: tmpl.max_signups,
      template_id: tmpl.id,
      created_by: req.player.id
    });
    created.push(ev);
  }

  res.json({ created });
});

function getNextMonday() {
  const d = new Date();
  const diff = (1 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// Given a week-start date (Monday) and a day-of-week (1=Mon..6=Sat,0=Sun),
// return the ISO date string for that day within the same week.
function dateForDow(mondayStr, dow) {
  const d = new Date(mondayStr + 'T12:00:00Z');
  const offset = dow === 0 ? 6 : dow - 1;  // Mon=0 offset
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

module.exports = router;
