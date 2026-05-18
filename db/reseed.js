// reseed.js — clear events, expand to 80 players, 9 weeks history + next week
// Usage: node db/reseed.js
require('dotenv').config();
const db = require('./index');

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
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const dow = today.getDay();
  const daysToMonday = dow === 0 ? -6 : 1 - dow;
  const d = new Date(today);
  d.setDate(today.getDate() + daysToMonday + weeksOffset * 7);
  return d.toISOString().slice(0, 10);
}

function dateForDow(mondayStr, dow) {
  const d = new Date(mondayStr + 'T12:00:00Z');
  const offset = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() + offset);
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

function reseed() {
  // ── 1. Clear all events (signups cascade-delete via FK) ───────────────────
  console.log('Clearing events...');
  const allEvents = db.events.list();
  for (const ev of allEvents) db.events.delete(ev.id);
  console.log(`Deleted ${allEvents.length} events`);

  // ── 2. Bring total players to 80 ──────────────────────────────────────────
  const admin = db.players.getByEmail('admin@squashclub.local');
  if (!admin) { console.error('Run db/seed.js first'); process.exit(1); }

  const existing    = db.players.list();
  const emailsInDB  = new Set(existing.map(p => p.email));
  const toAdd       = 80 - existing.length;
  console.log(`\nPlayers: ${existing.length} existing, adding ${toAdd}`);

  let fn = 0, added = 0, n = 1;
  while (added < toAdd) {
    const email = `player${n}@squashclub.local`;
    if (!emailsInDB.has(email)) {
      const firstName = FIRST_NAMES[fn % FIRST_NAMES.length];
      const lastName  = LAST_NAMES[Math.floor(fn / FIRST_NAMES.length) % LAST_NAMES.length];
      const handicap  = HANDICAPS[fn % HANDICAPS.length];
      db.players.create({ email, first_name: firstName, last_name: lastName, current_handicap: handicap });
      fn++;
      added++;
    }
    n++;
  }
  console.log(`Added ${added} players → 80 total`);

  // ── 3. Build signup pool (all non-admin players) ──────────────────────────
  const players  = db.players.list().filter(p => !p.is_admin);
  const templates = db.templates.list();
  if (!templates.length) { console.error('No templates — run db/seed.js first'); process.exit(1); }

  // ── 4. Create events with 60–120% fill ────────────────────────────────────
  let totalEvents = 0, totalSignups = 0;

  function fillEvent(ev, maxSignups) {
    const min    = Math.round(maxSignups * 0.6);
    const max    = Math.round(maxSignups * 1.2);
    const target = min + Math.floor(Math.random() * (max - min + 1));
    const pool   = shuffle(players).slice(0, target);
    for (const p of pool) {
      // signups.add() auto-sets is_reserve based on current confirmed count
      db.signups.add({ event_id: ev.id, signed_up_by: admin.id, player_id: p.id });
      totalSignups++;
    }
    return pool.length;
  }

  // 9 weeks of history (≈ 2 months)
  console.log('\n── History (9 weeks) ──');
  for (let w = 9; w >= 1; w--) {
    const monday = getMondayOfWeek(-w);
    for (const tmpl of templates) {
      const date = dateForDow(monday, tmpl.day_of_week);
      const ev   = db.events.create({
        title: tmpl.name, event_date: date,
        start_time: tmpl.start_time, end_time: tmpl.end_time,
        max_signups: tmpl.max_signups, template_id: tmpl.id, created_by: admin.id
      });
      totalEvents++;
      const n = fillEvent(ev, tmpl.max_signups);
      const confirmed = Math.min(n, tmpl.max_signups);
      const reserve   = Math.max(0, n - tmpl.max_signups);
      console.log(`  ${tmpl.name} ${date}: ${confirmed} confirmed${reserve ? ` + ${reserve} reserve` : ''}`);
    }
  }

  // Next week
  console.log('\n── Next week ──');
  const nextMonday = getMondayOfWeek(1);
  for (const tmpl of templates) {
    const date = dateForDow(nextMonday, tmpl.day_of_week);
    const ev   = db.events.create({
      title: tmpl.name, event_date: date,
      start_time: tmpl.start_time, end_time: tmpl.end_time,
      max_signups: tmpl.max_signups, template_id: tmpl.id, created_by: admin.id
    });
    totalEvents++;
    const n = fillEvent(ev, tmpl.max_signups);
    const confirmed = Math.min(n, tmpl.max_signups);
    const reserve   = Math.max(0, n - tmpl.max_signups);
    console.log(`  ${tmpl.name} ${date}: ${confirmed} confirmed${reserve ? ` + ${reserve} reserve` : ''}`);
  }

  console.log(`\nDone: ${totalEvents} events, ${totalSignups} signups`);
}

reseed();
