require('dotenv').config();
const db = require('./index');

async function seed() {
  console.log('Seeding database...');

  // Admin player
  let admin;
  try {
    admin = db.players.create({
      email: 'admin@squashclub.local',
      first_name: 'Club',
      last_name: 'Admin',
      is_admin: true,
      current_handicap: 0
    });
    console.log('Created admin:', admin.email);
  } catch (e) {
    admin = db.players.getByEmail('admin@squashclub.local');
    console.log('Admin already exists');
  }

  // Regular players
  const playerData = [
    { email: 'alice@squashclub.local',   first_name: 'Alice',   last_name: 'Smith',   current_handicap: -10 },
    { email: 'bob@squashclub.local',     first_name: 'Bob',     last_name: 'Jones',   current_handicap: 5 },
    { email: 'charlie@squashclub.local', first_name: 'Charlie', last_name: 'Brown',   current_handicap: 3 },
    { email: 'diana@squashclub.local',   first_name: 'Diana',   last_name: 'Prince',  current_handicap: -5 },
    { email: 'ed@squashclub.local',      first_name: 'Ed',      last_name: 'Harris',  current_handicap: 8 },
    { email: 'fiona@squashclub.local',   first_name: 'Fiona',   last_name: 'Green',   current_handicap: -12 },
    { email: 'george@squashclub.local',  first_name: 'George',  last_name: 'Taylor',  current_handicap: 0 },
    { email: 'helen@squashclub.local',   first_name: 'Helen',   last_name: 'Hunt',    current_handicap: -7 },
    { email: 'ian@squashclub.local',     first_name: 'Ian',     last_name: 'Wright',  current_handicap: 2 },
    { email: 'jane@squashclub.local',    first_name: 'Jane',    last_name: 'Doe',     current_handicap: -15 },
    { email: 'kevin@squashclub.local',   first_name: 'Kevin',   last_name: 'Sharp',   current_handicap: 6 },
    { email: 'laura@squashclub.local',   first_name: 'Laura',   last_name: 'Palmer',  current_handicap: -3 },
  ];

  for (const p of playerData) {
    try {
      db.players.create(p);
      console.log('Created player:', p.email);
    } catch {
      console.log('Player already exists:', p.email);
    }
  }

  // Session templates: Mon, Wed, Sat
  const templateData = [
    { name: 'Monday Evening',   day_of_week: 1, start_time: '18:30', end_time: '21:00', max_signups: 12 },
    { name: 'Wednesday Evening',day_of_week: 3, start_time: '18:30', end_time: '21:00', max_signups: 12 },
    { name: 'Saturday Morning', day_of_week: 6, start_time: '09:00', end_time: '12:00', max_signups: 16 },
  ];

  const existingTemplates = db.templates.list();
  if (existingTemplates.length === 0) {
    for (const t of templateData) {
      db.templates.create({ ...t, created_by: admin.id });
      console.log('Created template:', t.name);
    }
  } else {
    console.log('Templates already exist — skipping');
  }

  // One upcoming event (next Monday)
  const nextMonday = getNextWeekday(1);
  const existingEvents = db.events.list(nextMonday, nextMonday);
  if (existingEvents.length === 0) {
    db.events.create({
      title: 'Monday Evening',
      event_date: nextMonday,
      start_time: '18:30',
      end_time: '21:00',
      max_signups: 12,
      created_by: admin.id
    });
    console.log('Created seed event for', nextMonday);
  }

  console.log('\nDone. Login emails for testing:');
  console.log('  admin@squashclub.local  (admin)');
  playerData.forEach(p => console.log(`  ${p.email}`));
}

function getNextWeekday(dow) {
  // dow: 1=Mon..6=Sat
  const d = new Date();
  const diff = (dow - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

seed().catch(console.error);
