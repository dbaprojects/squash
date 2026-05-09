// Seed initial data into Supabase.
// Run AFTER schema-supabase.sql has been executed in the Supabase SQL editor.
// Usage: node db/seed-supabase.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL     = process.env.SUPABASE_URL     || 'https://ikfzmqtglgeotyooosur.supabase.co';
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE;

if (!SUPABASE_SERVICE) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// Service role key bypasses RLS — safe for seeding only
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function seed() {
  console.log('Seeding Supabase...');

  // ── Admin player (update email to your real Google account) ──────────────
  const { data: admin, error: adminErr } = await sb
    .from('players')
    .upsert({
      email: 'dbarkess@gmail.com',
      first_name: 'David',
      last_name: 'Barkess',
      is_admin: true,
      current_handicap: 0
    }, { onConflict: 'email' })
    .select()
    .single();
  if (adminErr) { console.error('Admin:', adminErr.message); return; }
  console.log('Admin player:', admin.email);

  // ── Session templates ────────────────────────────────────────────────────
  const templates = [
    { name: 'Monday Evening',    day_of_week: 1, start_time: '18:30', end_time: '21:00', max_signups: 12 },
    { name: 'Wednesday Evening', day_of_week: 3, start_time: '18:30', end_time: '21:00', max_signups: 12 },
    { name: 'Saturday Morning',  day_of_week: 6, start_time: '09:00', end_time: '12:00', max_signups: 16 },
  ];

  const { data: existing } = await sb.from('session_templates').select('id').limit(1);
  if (existing && existing.length > 0) {
    console.log('Templates already exist — skipping');
  } else {
    for (const t of templates) {
      const { error } = await sb.from('session_templates').insert({ ...t, created_by: admin.id });
      if (error) console.error('Template:', error.message);
      else console.log('Created template:', t.name);
    }
  }

  // ── Next week events ─────────────────────────────────────────────────────
  const { data: tmplList } = await sb.from('session_templates').select('*').eq('active', true);
  const nextMonday = getNextMonday();

  for (const tmpl of (tmplList || [])) {
    const date = dateForDow(nextMonday, tmpl.day_of_week);
    const { data: existing } = await sb.from('events')
      .select('id').eq('template_id', tmpl.id).eq('event_date', date).limit(1);
    if (existing && existing.length > 0) {
      console.log('Event exists:', tmpl.name, date);
      continue;
    }
    const { error } = await sb.from('events').insert({
      title: tmpl.name, event_date: date,
      start_time: tmpl.start_time, end_time: tmpl.end_time,
      max_signups: tmpl.max_signups, template_id: tmpl.id, created_by: admin.id
    });
    if (error) console.error('Event:', error.message);
    else console.log('Created event:', tmpl.name, date);
  }

  console.log('\nDone. Log in with dbarkess@gmail.com via Google OAuth.');
}

function getNextMonday() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const diff = (1 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function dateForDow(mondayStr, dow) {
  const d = new Date(mondayStr + 'T12:00:00Z');
  const offset = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

seed().catch(console.error);
