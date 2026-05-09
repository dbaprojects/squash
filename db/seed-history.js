require('dotenv').config();
const db = require('./index');

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

function addSignups(ev, admin, players, maxSignups) {
  const existing = db.signups.countForEvent(ev.id);
  if (existing > 0) {
    console.log(`  skip signups (already has ${existing})`);
    return 0;
  }
  const min = Math.round(maxSignups * 0.8);
  const max = Math.round(maxSignups * 1.1);
  const target = min + Math.floor(Math.random() * (max - min + 1));
  const shuffled = shuffle(players);
  let added = 0;
  for (let i = 0; i < target; i++) {
    if (i < shuffled.length) {
      db.signups.add({ event_id: ev.id, signed_up_by: admin.id, player_id: shuffled[i].id, guest_name: null });
    } else {
      db.signups.add({ event_id: ev.id, signed_up_by: admin.id, player_id: null, guest_name: `Guest ${i - shuffled.length + 1}` });
    }
    added++;
  }
  return added;
}

function seedHistory() {
  const admin = db.players.getByEmail('admin@squashclub.local');
  if (!admin) { console.error('Admin not found — run db/seed.js first'); process.exit(1); }

  const players   = db.players.list().filter(p => !p.is_admin);
  const templates = db.templates.list();
  if (!templates.length) { console.error('No templates — run db/seed.js first'); process.exit(1); }

  let totalEvents = 0, totalSignups = 0;

  // Past 10 weeks
  for (let w = 10; w >= 1; w--) {
    const monday = getMondayOfWeek(-w);
    for (const tmpl of templates) {
      const date = dateForDow(monday, tmpl.day_of_week);
      let evRow = db.events.findByTemplateAndDate(tmpl.id, date);
      let ev;
      if (evRow) {
        ev = db.events.get(evRow.id);
      } else {
        ev = db.events.create({
          title: tmpl.name, event_date: date,
          start_time: tmpl.start_time, end_time: tmpl.end_time,
          max_signups: tmpl.max_signups, template_id: tmpl.id, created_by: admin.id
        });
        totalEvents++;
      }
      const added = addSignups(ev, admin, players, tmpl.max_signups);
      totalSignups += added;
      console.log(`${tmpl.name} ${date}: ${added} signups added`);
    }
  }

  // Next week
  console.log('\n── Next week ──');
  const nextMonday = getMondayOfWeek(1);
  for (const tmpl of templates) {
    const date = dateForDow(nextMonday, tmpl.day_of_week);
    let evRow = db.events.findByTemplateAndDate(tmpl.id, date);
    let ev;
    if (evRow) {
      ev = db.events.get(evRow.id);
    } else {
      ev = db.events.create({
        title: tmpl.name, event_date: date,
        start_time: tmpl.start_time, end_time: tmpl.end_time,
        max_signups: tmpl.max_signups, template_id: tmpl.id, created_by: admin.id
      });
      totalEvents++;
    }
    const added = addSignups(ev, admin, players, tmpl.max_signups);
    totalSignups += added;
    console.log(`${tmpl.name} ${date}: ${added} signups added`);
  }

  console.log(`\nDone: ${totalEvents} events created, ${totalSignups} signups added.`);
}

seedHistory();
