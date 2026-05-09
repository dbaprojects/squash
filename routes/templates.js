const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('./auth');

// GET /api/templates
router.get('/templates', requireAdmin, (req, res) => {
  res.json(db.templates.list());
});

// POST /api/templates
router.post('/templates', requireAdmin, (req, res) => {
  const { name, day_of_week, start_time, end_time, max_signups } = req.body;
  if (!name || day_of_week === undefined || !start_time || !end_time) {
    return res.status(400).json({ error: 'name, day_of_week, start_time, end_time required' });
  }
  const tmpl = db.templates.create({
    name, day_of_week, start_time, end_time,
    max_signups: max_signups || null,
    created_by: req.player.id
  });
  res.status(201).json(tmpl);
});

// PUT /api/templates/:id
router.put('/templates/:id', requireAdmin, (req, res) => {
  const tmpl = db.templates.get(req.params.id);
  if (!tmpl) return res.status(404).json({ error: 'Template not found' });
  res.json(db.templates.update(req.params.id, req.body));
});

// DELETE /api/templates/:id  (soft delete — sets active=0)
router.delete('/templates/:id', requireAdmin, (req, res) => {
  db.templates.delete(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
