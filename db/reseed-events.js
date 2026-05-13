// reseed-events.js — delete all events, build 52w history (30-120% fill),
//   then events for rest of current week + next week with 1-3 signups each
// Usage: SUPABASE_SERVICE_ROLE_KEY=<key> node db/reseed-events.js
'use strict';
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ikfzmqtglgeotyooosur.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Returns ISO date string (YYYY-MM-DD) for the Monday of the week at weeksOffset
function getMondayOfWeek(weeksOffset) {
  const d = new Date(); d.setUTCHours(12, 0, 0, 0);
  const day = d.getUTCDay();
  const daysToMon = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + daysToMon + weeksOffset * 7);
  return d.toISOString().slice(0, 10);
}

// Returns ISO date string for the given day-of-week (1=Mon..7=Sun) in the week starting mondayStr
function dateForDow(mondayStr, dow) {
  const d = new Date(mondayStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
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
    .select('id, first_name, last_name').eq('is_super_admin', true).limit(1).single();
  if (!admin) { console.error('No super-admin found'); process.exit(1); }
  console.log(`Admin: ${admin.first_name} ${admin.last_name}`);

  // ── Delete all events (signups cascade) ──────────────────────────────────
  console.log('\nDeleting all events...');
  const { error: delErr } = await sb.from('events').delete().not('id', 'is', null);
  if (delErr) { console.error('Delete error:', delErr.message); process.exit(1); }
  console.log('Deleted.');

  // ── Player pool ───────────────────────────────────────────────────────────
  const { data: allPlayers } = await sb.from('players')
    .select('id').eq('active', true);
  const playerIds = (allPlayers || []).map(p => p.id);
  console.log(`Player pool: ${playerIds.length}`);
  if (!playerIds.length) { console.error('No active players'); process.exit(1); }

  // ── Templates ─────────────────────────────────────────────────────────────
  const { data: templates } = await sb.from('session_templates')
    .select('*').eq('active', true).order('day_of_week').order('start_time');
  if (!templates?.length) { console.error('No active templates'); process.exit(1); }
  console.log(`Templates: ${templates.map(t => t.name).join(', ')}\n`);

  // ── Fill helper ────────────────────────────────────────────────────────────
  async function fillEvent(eventId, maxSignups, pctOverride) {
    const pct    = pctOverride ?? (0.3 + Math.random() * 0.9);   // 30%–120%
    const target = Math.min(Math.round(maxSignups * pct), playerIds.length);
    const pool   = shuffle(playerIds).slice(0, target);
    const rows   = pool.map((pid, i) => ({
      event_id:     eventId,
      signed_up_by: admin.id,
      player_id:    pid,
      is_reserve:   i >= maxSignups,
      signed_up_at: new Date().toISOString()
    }));
    if (!rows.length) return 0;
    const { error } = await sb.from('signups').insert(rows);
    if (error) { console.error('  Signups error:', error.message); return 0; }
    return rows.length;
  }

  // ── 52 weeks of history ────────────────────────────────────────────────────
  console.log('── History (52 weeks) ──');
  let totalEvents = 0, totalSignups = 0;

  for (let w = 52; w >= 1; w--) {
    const monday = getMondayOfWeek(-w);
    for (const tmpl of templates) {
      const date = dateForDow(monday, tmpl.day_of_week);
      const { data: ev, error: evErr } = await sb.from('events').insert({
        title: tmpl.name, event_date: date,
        start_time: tmpl.start_time, end_time: tmpl.end_time,
        max_signups: tmpl.max_signups, template_id: tmpl.id,
        created_by: admin.id
      }).select('id').single();
      if (evErr) { console.error(`  Event ${tmpl.name} ${date}:`, evErr.message); continue; }
      totalEvents++;
      const n = await fillEvent(ev.id, tmpl.max_signups);
      totalSignups += n;
    }
    if (w % 8 === 0 || w === 1) {
      process.stdout.write(`  week -${String(w).padStart(2,'0')} done  (${totalEvents} events, ${totalSignups} signups)\n`);
    }
  }

  // ── Rest of current week + next week — light signups ─────────────────────
  console.log('\n── Current & next week (lightly signed up) ──');
  const todayStr   = today();
  const thisMonday = getMondayOfWeek(0);
  const nextMonday = getMondayOfWeek(1);
  let futureCreated = 0, futureSignups = 0;

  for (const weekMonday of [thisMonday, nextMonday]) {
    for (const tmpl of templates) {
      const date = dateForDow(weekMonday, tmpl.day_of_week);
      if (date < todayStr) continue;   // skip past days in current week
      const { data: ev, error: evErr } = await sb.from('events').insert({
        title: tmpl.name, event_date: date,
        start_time: tmpl.start_time, end_time: tmpl.end_time,
        max_signups: tmpl.max_signups, template_id: tmpl.id,
        created_by: admin.id
      }).select('id').single();
      if (evErr) { console.error(`  ${tmpl.name} ${date}:`, evErr.message); continue; }
      futureCreated++;
      // 1–3 random signups (≈15% fill)
      const n = await fillEvent(ev.id, tmpl.max_signups, 0.1 + Math.random() * 0.1);
      futureSignups += n;
      console.log(`  + ${tmpl.name}  ${date}  (${n} signups)`);
    }
  }

  console.log(`\nDone: ${totalEvents + futureCreated} events, ${totalSignups} historical + ${futureSignups} future signups`);
}

run().catch(err => { console.error(err); process.exit(1); });
