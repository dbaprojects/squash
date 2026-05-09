require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.SQLITE_PATH || './squash.db';
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Apply schema on first run
const schema = fs.readFileSync(path.join(__dirname, 'schema-sqlite.sql'), 'utf8');
db.exec(schema);

function uuid() {
  return require('crypto').randomUUID();
}

function now() {
  return new Date().toISOString();
}

// ── Players ──────────────────────────────────────────────────────────────────

const players = {
  list() {
    return db.prepare('SELECT * FROM players WHERE active = 1 ORDER BY last_name, first_name').all();
  },
  get(id) {
    return db.prepare('SELECT * FROM players WHERE id = ?').get(id);
  },
  getByEmail(email) {
    return db.prepare('SELECT * FROM players WHERE email = ? AND active = 1').get(email);
  },
  create(data) {
    const id = uuid();
    db.prepare(`
      INSERT INTO players (id, email, first_name, last_name, is_admin, current_handicap, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.email, data.first_name, data.last_name, data.is_admin ? 1 : 0, data.current_handicap ?? null, now());
    return players.get(id);
  },
  update(id, data) {
    const fields = [];
    const vals = [];
    if (data.first_name !== undefined)       { fields.push('first_name = ?');       vals.push(data.first_name); }
    if (data.last_name !== undefined)         { fields.push('last_name = ?');        vals.push(data.last_name); }
    if (data.email !== undefined)             { fields.push('email = ?');            vals.push(data.email); }
    if (data.is_admin !== undefined)          { fields.push('is_admin = ?');         vals.push(data.is_admin ? 1 : 0); }
    if (data.current_handicap !== undefined)  { fields.push('current_handicap = ?'); vals.push(data.current_handicap); }
    if (!fields.length) return players.get(id);
    vals.push(id);
    db.prepare(`UPDATE players SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    return players.get(id);
  },
  deactivate(id) {
    db.prepare('UPDATE players SET active = 0 WHERE id = ?').run(id);
  }
};

// ── Handicaps ─────────────────────────────────────────────────────────────────

const handicaps = {
  history(playerId) {
    return db.prepare(`
      SELECT h.*, p.first_name || ' ' || p.last_name AS changed_by_name
      FROM handicap_history h
      JOIN players p ON p.id = h.changed_by
      WHERE h.player_id = ?
      ORDER BY h.changed_at DESC
    `).all(playerId);
  },
  add({ playerId, value, changedBy, notes }) {
    const id = uuid();
    db.prepare(`
      INSERT INTO handicap_history (id, player_id, handicap_value, changed_by, notes, changed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, playerId, value, changedBy, notes || null, now());
    players.update(playerId, { current_handicap: value });
    return { id };
  }
};

// ── Events ────────────────────────────────────────────────────────────────────

const events = {
  list(from, to) {
    let sql = 'SELECT * FROM events';
    const args = [];
    if (from) { sql += ' WHERE event_date >= ?'; args.push(from); }
    if (to)   { sql += (from ? ' AND' : ' WHERE') + ' event_date <= ?'; args.push(to); }
    sql += ' ORDER BY event_date, start_time';
    return db.prepare(sql).all(...args);
  },
  get(id) {
    return db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  },
  create(data) {
    const id = uuid();
    db.prepare(`
      INSERT INTO events (id, title, event_date, start_time, end_time, max_signups, template_id, notes, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.title, data.event_date, data.start_time, data.end_time,
           data.max_signups ?? null, data.template_id ?? null, data.notes ?? null, data.created_by, now());
    return events.get(id);
  },
  update(id, data) {
    const fields = [];
    const vals = [];
    ['title', 'event_date', 'start_time', 'end_time', 'notes'].forEach(f => {
      if (data[f] !== undefined) { fields.push(`${f} = ?`); vals.push(data[f]); }
    });
    if (data.max_signups !== undefined) { fields.push('max_signups = ?'); vals.push(data.max_signups); }
    if (!fields.length) return events.get(id);
    vals.push(id);
    db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    return events.get(id);
  },
  delete(id) {
    db.prepare('DELETE FROM events WHERE id = ?').run(id);
  },
  findByTemplateAndDate(templateId, date) {
    return db.prepare('SELECT id FROM events WHERE template_id = ? AND event_date = ?').get(templateId, date);
  }
};

// ── Templates ─────────────────────────────────────────────────────────────────

const templates = {
  list() {
    return db.prepare('SELECT * FROM session_templates WHERE active = 1 ORDER BY day_of_week, start_time').all();
  },
  get(id) {
    return db.prepare('SELECT * FROM session_templates WHERE id = ?').get(id);
  },
  create(data) {
    const id = uuid();
    db.prepare(`
      INSERT INTO session_templates (id, name, day_of_week, start_time, end_time, max_signups, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.day_of_week, data.start_time, data.end_time,
           data.max_signups ?? null, data.created_by, now());
    return templates.get(id);
  },
  update(id, data) {
    const fields = [];
    const vals = [];
    ['name', 'start_time', 'end_time'].forEach(f => {
      if (data[f] !== undefined) { fields.push(`${f} = ?`); vals.push(data[f]); }
    });
    if (data.day_of_week !== undefined) { fields.push('day_of_week = ?'); vals.push(data.day_of_week); }
    if (data.max_signups !== undefined) { fields.push('max_signups = ?'); vals.push(data.max_signups); }
    if (data.active !== undefined)      { fields.push('active = ?');      vals.push(data.active ? 1 : 0); }
    if (!fields.length) return templates.get(id);
    vals.push(id);
    db.prepare(`UPDATE session_templates SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    return templates.get(id);
  },
  delete(id) {
    db.prepare('UPDATE session_templates SET active = 0 WHERE id = ?').run(id);
  }
};

// ── Signups ───────────────────────────────────────────────────────────────────

const signups = {
  forEvents(eventIds) {
    if (!eventIds.length) return [];
    const ph = eventIds.map(() => '?').join(',');
    return db.prepare(`
      SELECT s.id, s.event_id, s.player_id, s.signed_up_by, s.guest_name, s.is_reserve,
             p.first_name AS player_first, p.last_name AS player_last
      FROM signups s
      LEFT JOIN players p ON p.id = s.player_id
      WHERE s.event_id IN (${ph})
      ORDER BY s.is_reserve, s.signed_up_at
    `).all(...eventIds);
  },
  forEvent(eventId) {
    return db.prepare(`
      SELECT s.*,
             p.first_name AS player_first,
             p.last_name  AS player_last,
             p.first_name || ' ' || p.last_name AS player_name,
             p.current_handicap AS player_handicap,
             b.first_name || ' ' || b.last_name AS signed_up_by_name
      FROM signups s
      LEFT JOIN players p ON p.id = s.player_id
      JOIN players b ON b.id = s.signed_up_by
      WHERE s.event_id = ?
      ORDER BY s.signed_up_at
    `).all(eventId);
  },
  countForEvent(eventId) {
    return db.prepare('SELECT COUNT(*) AS n FROM signups WHERE event_id = ? AND is_reserve = 0').get(eventId).n;
  },
  findPlayerOnEvent(eventId, playerId) {
    return db.prepare('SELECT id FROM signups WHERE event_id = ? AND player_id = ?').get(eventId, playerId);
  },
  get(id) {
    return db.prepare('SELECT * FROM signups WHERE id = ?').get(id);
  },
  add(data) {
    const event = events.get(data.event_id);
    let isReserve = false;
    if (event.max_signups) {
      const count = signups.countForEvent(data.event_id);
      isReserve = count >= event.max_signups;
    }
    const id = uuid();
    db.prepare(`
      INSERT INTO signups (id, event_id, signed_up_by, player_id, guest_name, is_reserve, notes, signed_up_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.event_id, data.signed_up_by, data.player_id ?? null,
           data.guest_name ?? null, isReserve ? 1 : 0, data.notes ?? null, now());
    return signups.get(id);
  },
  remove(id) {
    db.prepare('DELETE FROM signups WHERE id = ?').run(id);
  }
};

module.exports = { players, handicaps, events, templates, signups };
