// seed-supabase-full.js — add 60 players + 9 weeks history to Supabase
// Usage: SUPABASE_SERVICE_ROLE_KEY=... node db/seed-supabase-full.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL     = process.env.SUPABASE_URL     || 'https://ikfzmqtglgeotyooosur.supabase.co';
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE;
if (!SUPABASE_SERVICE) { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const FIRST_NAMES = [
  'James','Michael','Robert','William','Richard','Thomas','Mark','Daniel',
  'Paul','Andrew','Scott','Peter','Stephen','Graham','Neil','Colin','Stuart',
  'Ross','Liam','Ryan','Jake','Matt','Chris','Ben','Luke','Jack','Harry',
  'Adam','Josh','Phil','Tim','Owen','Callum','Jamie','Connor','Sean',
  'Emma','Sophie','Charlotte','Hannah','Katie','Megan','Rachel','Sarah',
  'Rebecca','Lauren','Amy','Claire','Jenny','Anna','Lisa','Kerry','Jessica',
  'Lucy','Kate','Zoe','Holly','Gemma','Victoria','Natalie','Chloe','Leah',
  'Abby','Ellie','Olivia','Amelia','Freya','Isla','Erin','Niamh'
];
const LAST_NAMES = [
  'Williams','Davies','Evans','Thomas','Roberts','Lewis','Clarke','Walker',
  'Robinson','Thompson','White','Jackson','Hall','Wood','Martin','Allen',
  'Cooper','Hughes','Turner','Morris','Ward','Watson','Baker','Miller',
  'Edwards','Wilson','Moore','Anderson','Mitchell','Campbell','Scott',
  'Stewart','Reid','Murray','Bell','Patterson','Ross','Henderson','Forbes',
  'Christie','Dunlop','Mackenzie','Fleming','Sinclair','Davidson','Ellis',
  'Hamilton','Grant','Shaw','Payne','Booth','Fox','Burke','Webb','Curtis',
  'Perry','Pearce','Harvey','Watts','Barker','Hudson','Holt','Riley','Burns'
];
const HANDICAPS = [-35,-28,-22,-18,-14,-10,-8,-6,-5,-3,-2,-1,0,1,2,3,4,5,6,7,8,9,10];

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
  if (!admin) { console.error('Admin not found — run seed-supabase.js first'); process.exit(1); }
  console.log('Admin:', admin.email);

  // ── Add 60 players ────────────────────────────────────────────────────────
  const { data: existing } = await sb.from('players').select('email');
  const existingEmails = new Set((existing || []).map(p => p.email));
  const nonAdminCount = (existing || []).filter(p =>
    p.email !== 'dbarkess@gmail.com' && p.email !== 'admin@squashclub.local'
  ).length;

  if (nonAdminCount >= 60) {
    console.log(`Players already seeded (${nonAdminCount} non-admin) — skipping`);
  } else {
    const toAdd = 60 - nonAdminCount;
    const newPlayers = [];
    let fn = nonAdminCount, n = 1;
    while (newPlayers.length < toAdd) {
      const email = `player${n}@squashclub.local`;
      if (!existingEmails.has(email)) {
        newPlayers.push({
          email,
          first_name:       FIRST_NAMES[fn % FIRST_NAMES.length],
          last_name:        LAST_NAMES[fn % LAST_NAMES.length],
          current_handicap: HANDICAPS[fn % HANDICAPS.length],
          is_admin: false,
          active:   true
        });
        fn++;
      }
      n++;
    }
    for (let i = 0; i < newPlayers.length; i += 20) {
      const { error } = await sb.from('players').insert(newPlayers.slice(i, i + 20));
      if (error) { console.error('Players:', error.message); process.exit(1); }
    }
    console.log(`Added ${newPlayers.length} players`);
  }

  // ── Player pool for signups ───────────────────────────────────────────────
  const { data: allPlayers } = await sb.from('players')
    .select('id').eq('active', true).eq('is_admin', false);
  const playerIds = (allPlayers || []).map(p => p.id);
  console.log(`Player pool: ${playerIds.length}`);

  // ── Templates ─────────────────────────────────────────────────────────────
  const { data: templates } = await sb.from('session_templates').select('*').eq('active', true);
  if (!templates?.length) { console.error('No templates'); process.exit(1); }

  // ── Fill an event with 60–120% signups ────────────────────────────────────
  async function fillEvent(eventId, maxSignups) {
    const min    = Math.round(maxSignups * 0.6);
    const max    = Math.round(maxSignups * 1.2);
    const target = min + Math.floor(Math.random() * (max - min + 1));
    const pool   = shuffle(playerIds).slice(0, target);
    const rows   = pool.map((pid, i) => ({
      event_id:     eventId,
      signed_up_by: admin.id,
      player_id:    pid,
      is_reserve:   i >= maxSignups
    }));
    const { error } = await sb.from('signups').insert(rows);
    if (error) { console.error('Signups:', error.message); return 0; }
    return rows.length;
  }

  let totalEvents = 0, totalSignups = 0;

  // ── 9 weeks of history ────────────────────────────────────────────────────
  console.log('\n── History (9 weeks) ──');
  for (let w = 9; w >= 1; w--) {
    const monday = getMondayOfWeek(-w);
    for (const tmpl of templates) {
      const date = dateForDow(monday, tmpl.day_of_week);

      const { data: dupe } = await sb.from('events')
        .select('id').eq('template_id', tmpl.id).eq('event_date', date).limit(1);
      if (dupe?.length) { console.log(`  exists: ${tmpl.name} ${date}`); continue; }

      const { data: ev, error: evErr } = await sb.from('events').insert({
        title: tmpl.name, event_date: date,
        start_time: tmpl.start_time, end_time: tmpl.end_time,
        max_signups: tmpl.max_signups, template_id: tmpl.id, created_by: admin.id
      }).select().single();
      if (evErr) { console.error('Event:', evErr.message); continue; }
      totalEvents++;

      const n = await fillEvent(ev.id, tmpl.max_signups);
      totalSignups += n;
      const c = Math.min(n, tmpl.max_signups), r = Math.max(0, n - tmpl.max_signups);
      console.log(`  ${tmpl.name} ${date}: ${c} confirmed${r ? ` + ${r} reserve` : ''}`);
    }
  }

  // ── Fill next week's existing events ──────────────────────────────────────
  console.log('\n── Next week ──');
  const nextMonday = getMondayOfWeek(1);
  for (const tmpl of templates) {
    const date = dateForDow(nextMonday, tmpl.day_of_week);
    const { data: evRow } = await sb.from('events')
      .select('id, max_signups').eq('template_id', tmpl.id).eq('event_date', date).single();
    if (!evRow) { console.log(`  no event: ${tmpl.name} ${date}`); continue; }

    const { count } = await sb.from('signups')
      .select('id', { count: 'exact', head: true }).eq('event_id', evRow.id);
    if (count > 0) { console.log(`  already filled: ${tmpl.name} ${date}`); continue; }

    const n = await fillEvent(evRow.id, evRow.max_signups);
    totalSignups += n;
    const c = Math.min(n, evRow.max_signups), r = Math.max(0, n - evRow.max_signups);
    console.log(`  ${tmpl.name} ${date}: ${c} confirmed${r ? ` + ${r} reserve` : ''}`);
  }

  console.log(`\nDone: ${totalEvents} events created, ${totalSignups} signups added`);
}

run().catch(console.error);
