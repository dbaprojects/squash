// reseed-supabase.js — clear all events, build 52 weeks history + next week
// Usage: SUPABASE_SERVICE_ROLE_KEY=... node db/reseed-supabase.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL     = process.env.SUPABASE_URL     || 'https://ikfzmqtglgeotyooosur.supabase.co';
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE;
if (!SUPABASE_SERVICE) { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function getMondayOfWeek(weeksOffset) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const daysToMonday = d.getDay() === 0 ? -6 : 1 - d.getDay();
  d.setDate(d.getDate() + daysToMonday + weeksOffset * 7);
  return d.toISOString().slice(0, 10);
}

function dateForDow(mondayStr, dow) {
  const d = new Date(mondayStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function run() {
  // ── Admin ─────────────────────────────────────────────────────────────────
  const { data: admin } = await sb.from('players')
    .select('*').eq('email', 'dbarkess@gmail.com').single();
  if (!admin) { console.error('Admin not found'); process.exit(1); }
  console.log('Admin:', admin.email);

  // ── Clear all events (and signups via cascade) ────────────────────────────
  console.log('\nClearing signups...');
  const { error: se } = await sb.from('signups').delete().not('id', 'is', null);
  if (se) console.warn('  signups:', se.message);

  console.log('Clearing events...');
  const { error: ee } = await sb.from('events').delete().not('id', 'is', null);
  if (ee) { console.error('  events:', ee.message); process.exit(1); }
  console.log('Cleared.\n');

  // ── Player pool ───────────────────────────────────────────────────────────
  const { data: allPlayers } = await sb.from('players')
    .select('id').eq('active', true).eq('is_admin', false);
  const playerIds = (allPlayers || []).map(p => p.id);
  console.log(`Player pool: ${playerIds.length}`);
  if (!playerIds.length) { console.error('No players — run seed first'); process.exit(1); }

  // ── Templates ─────────────────────────────────────────────────────────────
  const { data: templates } = await sb.from('session_templates').select('*').eq('active', true);
  if (!templates?.length) { console.error('No active templates'); process.exit(1); }
  console.log(`Templates: ${templates.map(t => t.name).join(', ')}\n`);

  // ── Fill event helper ─────────────────────────────────────────────────────
  async function fillEvent(eventId, maxSignups) {
    const min    = Math.round(maxSignups * 0.4);
    const max    = Math.round(maxSignups * 1.2);
    const target = min + Math.floor(Math.random() * (max - min + 1));
    const pool   = shuffle(playerIds).slice(0, Math.min(target, playerIds.length));
    const rows   = pool.map((pid, i) => ({
      event_id:     eventId,
      signed_up_by: admin.id,
      player_id:    pid,
      is_reserve:   i >= maxSignups
    }));
    if (!rows.length) return 0;
    const { error } = await sb.from('signups').insert(rows);
    if (error) { console.error('  Signups error:', error.message); return 0; }
    return rows.length;
  }

  let totalEvents = 0, totalSignups = 0;

  // ── 52 weeks of history ───────────────────────────────────────────────────
  console.log('── History (52 weeks) ──');
  for (let w = 52; w >= 1; w--) {
    const monday = getMondayOfWeek(-w);
    for (const tmpl of templates) {
      const date = dateForDow(monday, tmpl.day_of_week);
      const { data: ev, error: evErr } = await sb.from('events').insert({
        title: tmpl.name, event_date: date,
        start_time: tmpl.start_time, end_time: tmpl.end_time,
        max_signups: tmpl.max_signups, template_id: tmpl.id, created_by: admin.id
      }).select().single();
      if (evErr) { console.error(`  Event ${tmpl.name} ${date}:`, evErr.message); continue; }
      totalEvents++;
      const n = await fillEvent(ev.id, tmpl.max_signups);
      totalSignups += n;
    }
    if (w % 4 === 0 || w === 1) {
      console.log(`  week -${String(w).padStart(2,'0')} done  (${totalEvents} events, ${totalSignups} signups so far)`);
    }
  }

  // ── Next week ─────────────────────────────────────────────────────────────
  console.log('\n── Next week ──');
  const nextMonday = getMondayOfWeek(1);
  for (const tmpl of templates) {
    const date = dateForDow(nextMonday, tmpl.day_of_week);
    const { data: ev, error: evErr } = await sb.from('events').insert({
      title: tmpl.name, event_date: date,
      start_time: tmpl.start_time, end_time: tmpl.end_time,
      max_signups: tmpl.max_signups, template_id: tmpl.id, created_by: admin.id
    }).select().single();
    if (evErr) { console.error(`  Event ${tmpl.name} ${date}:`, evErr.message); continue; }
    totalEvents++;
    const n = await fillEvent(ev.id, tmpl.max_signups);
    totalSignups += n;
    const c = Math.min(n, tmpl.max_signups), r = Math.max(0, n - tmpl.max_signups);
    console.log(`  ${tmpl.name} ${date}: ${c} confirmed${r ? ` + ${r} reserve` : ''}`);
  }

  console.log(`\nDone: ${totalEvents} events, ${totalSignups} signups`);
}

run().catch(console.error);
