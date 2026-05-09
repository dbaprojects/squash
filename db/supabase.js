// Supabase adapter — stub for future implementation
// Set DB_BACKEND=supabase and provide SUPABASE_URL + SUPABASE_ANON_KEY in .env

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// TODO: implement each method using supabase.from(...) queries
// The interface must match db/sqlite.js exactly.

const players = {
  async list() { throw new Error('supabase adapter: players.list not implemented'); },
  async get(id) { throw new Error('supabase adapter: players.get not implemented'); },
  async getByEmail(email) { throw new Error('supabase adapter: players.getByEmail not implemented'); },
  async create(data) { throw new Error('supabase adapter: players.create not implemented'); },
  async update(id, data) { throw new Error('supabase adapter: players.update not implemented'); },
  async deactivate(id) { throw new Error('supabase adapter: players.deactivate not implemented'); }
};

const handicaps = {
  async history(playerId) { throw new Error('supabase adapter: handicaps.history not implemented'); },
  async add(data) { throw new Error('supabase adapter: handicaps.add not implemented'); }
};

const events = {
  async list(from, to) { throw new Error('supabase adapter: events.list not implemented'); },
  async get(id) { throw new Error('supabase adapter: events.get not implemented'); },
  async create(data) { throw new Error('supabase adapter: events.create not implemented'); },
  async update(id, data) { throw new Error('supabase adapter: events.update not implemented'); },
  async delete(id) { throw new Error('supabase adapter: events.delete not implemented'); },
  async findByTemplateAndDate(templateId, date) { throw new Error('supabase adapter: events.findByTemplateAndDate not implemented'); }
};

const templates = {
  async list() { throw new Error('supabase adapter: templates.list not implemented'); },
  async get(id) { throw new Error('supabase adapter: templates.get not implemented'); },
  async create(data) { throw new Error('supabase adapter: templates.create not implemented'); },
  async update(id, data) { throw new Error('supabase adapter: templates.update not implemented'); },
  async delete(id) { throw new Error('supabase adapter: templates.delete not implemented'); }
};

const signups = {
  async forEvent(eventId) { throw new Error('supabase adapter: signups.forEvent not implemented'); },
  async countForEvent(eventId) { throw new Error('supabase adapter: signups.countForEvent not implemented'); },
  async findPlayerOnEvent(eventId, playerId) { throw new Error('supabase adapter: signups.findPlayerOnEvent not implemented'); },
  async get(id) { throw new Error('supabase adapter: signups.get not implemented'); },
  async add(data) { throw new Error('supabase adapter: signups.add not implemented'); },
  async remove(id) { throw new Error('supabase adapter: signups.remove not implemented'); }
};

module.exports = { players, handicaps, events, templates, signups, supabase };
