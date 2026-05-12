// load-players.js — full reload from Excel: HC players + no-HC named players + phones
// Usage: SUPABASE_SERVICE_ROLE_KEY=... node db/load-players.js
require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL     = process.env.SUPABASE_URL     || 'https://ikfzmqtglgeotyooosur.supabase.co';
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE;
if (!SUPABASE_SERVICE) { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const EXCEL_PATH   = path.join(__dirname, '..', 'names and hcs.xlsx');
const ADMIN_EMAIL  = 'dbarkess@gmail.com';
const EMAIL_DOMAIN = '@bcsg.squash';

// no-HC players that are active
const ACTIVE_NO_HC = new Set(['Brian Chang', 'Sebastien Bruggeman']);

// phone-list name → HC player name (where normalised matching fails)
const MANUAL_PHONE = {
  'Chris Kingsley-Wilkins': 'Chris KW',
  'Dicky Offer':            'Richard Offer',
  'Soumit Goswami':         'Soumit Goswani',
};

// HC name renames: merge old → canonical
const RENAME_HC = {
  'Matthew Cannon': 'Matt Cannon',
  'Rahul Gosh':     'Rahul Ghosh',
};

function dateFromNum(d) {
  const str = d.toFixed(2);
  const [year, mm] = str.split('.');
  return `${year}-${mm.padStart(2, '0')}-01`;
}

function makeEmail(name) {
  return name.trim().toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, '.') + EMAIL_DOMAIN;
}

function parseName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  return {
    first_name: parts[0],
    last_name:  parts.slice(1).join(' ') || parts[0],
  };
}

function normalise(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function matchPhoneToHC(phoneName, hcNames) {
  if (MANUAL_PHONE[phoneName]) return MANUAL_PHONE[phoneName];
  const norm = normalise(phoneName);
  // exact normalised match
  const exact = hcNames.find(n => normalise(n) === norm);
  if (exact) return exact;
  // all tokens must appear in HC name (no length filter — prevents partial matches)
  const tokens = norm.split(' ').filter(Boolean);
  if (tokens.length > 0) {
    const candidates = hcNames.filter(n => tokens.every(t => normalise(n).includes(t)));
    if (candidates.length === 1) return candidates[0];
  }
  return null;
}

async function insertBatch(table, rows, batchSize = 100) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await sb.from(table).insert(batch);
    if (error) throw new Error(`${table} batch ${i}: ${error.message}`);
    inserted += batch.length;
  }
  return inserted;
}

async function run() {
  // ── Parse Excel ────────────────────────────────────────────────────────────
  console.log('Reading Excel...');
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // HC data: columns A (name), B (handicap), C (date as YYYY.MM float)
  const hcRows = rawRows.slice(1).map(r => ({
    name: String(r[0] || '').trim(),
    hc:   Number(r[1]),
    date: Number(r[2]),
  })).filter(r => r.name && !isNaN(r.hc) && !isNaN(r.date) && r.date > 0);

  hcRows.sort((a, b) => a.name.localeCompare(b.name) || a.date - b.date);

  const maxDate    = Math.max(...hcRows.map(r => r.date));
  const activeHC   = new Set(hcRows.filter(r => r.date === maxDate).map(r => r.name));

  // Latest HC per player
  const latestHC = {};
  for (const row of hcRows) {
    if (!latestHC[row.name] || row.date > latestHC[row.name].date)
      latestHC[row.name] = { hc: row.hc, date: row.date };
  }

  // Handicap history per player (changes only)
  const hcHistory = {};
  for (const row of hcRows) {
    if (!hcHistory[row.name]) hcHistory[row.name] = { last: null, entries: [] };
    const ph = hcHistory[row.name];
    if (ph.last === null || ph.last !== row.hc) {
      ph.entries.push({ hc: row.hc, date: row.date });
      ph.last = row.hc;
    }
  }

  // Apply renames
  for (const [old, canonical] of Object.entries(RENAME_HC)) {
    if (latestHC[old] && latestHC[canonical]) {
      if (latestHC[old].date > latestHC[canonical].date)
        latestHC[canonical] = latestHC[old];
    } else if (latestHC[old]) {
      latestHC[canonical] = latestHC[old];
    }
    if (activeHC.has(old)) { activeHC.delete(old); activeHC.add(canonical); }
    delete latestHC[old];

    if (hcHistory[old]) {
      if (!hcHistory[canonical]) hcHistory[canonical] = { last: null, entries: [] };
      // merge + deduplicate by date, keep canonical's entry when dates clash
      const merged = [...hcHistory[old].entries, ...hcHistory[canonical].entries]
        .sort((a, b) => a.date - b.date);
      // keep only change entries
      const deduped = [];
      let prev = null;
      for (const e of merged) {
        if (e.hc !== prev) { deduped.push(e); prev = e.hc; }
      }
      hcHistory[canonical].entries = deduped;
      delete hcHistory[old];
    }
  }

  const hcPlayerNames = Object.keys(latestHC);
  console.log(`  ${hcPlayerNames.length} HC players, active snapshot: ${dateFromNum(maxDate)} (${activeHC.size} active)`);

  // Phone data: columns G (name) and H (phone)
  const phoneRows = rawRows.slice(1).map(r => ({
    name:  String(r[6] || '').trim(),
    phone: String(r[7] || '').trim(),
  })).filter(r => r.phone);

  const namedPhones    = phoneRows.filter(r => r.name);
  const namelessPhones = phoneRows.filter(r => !r.name);

  // Match phone names → HC player names
  const phoneMap      = {};
  const unmatchedNamed = [];
  for (const { name, phone } of namedPhones) {
    const match = matchPhoneToHC(name, hcPlayerNames);
    if (match) {
      if (!phoneMap[match]) phoneMap[match] = phone; // first match wins (own entry takes priority)
    } else {
      unmatchedNamed.push({ name, phone });
    }
  }
  console.log(`  ${unmatchedNamed.length} named phone entries with no HC record: ${unmatchedNamed.map(u => u.name).join(', ')}`);
  console.log(`  ${namelessPhones.length} nameless phone entries (TBA — not loaded)`);

  // ── Find admin ─────────────────────────────────────────────────────────────
  const { data: admin } = await sb.from('players').select('*').eq('email', ADMIN_EMAIL).single();
  if (!admin) { console.error('Admin not found:', ADMIN_EMAIL); process.exit(1); }
  console.log('\nAdmin:', admin.email, '(id:', admin.id + ')');

  // ── Clear existing data ────────────────────────────────────────────────────
  console.log('\nClearing data...');

  const { error: se } = await sb.from('signups').delete().not('id', 'is', null);
  if (se) { console.error('  signups:', se.message); process.exit(1); }
  console.log('  signups cleared');

  const { error: ee } = await sb.from('events').delete().not('id', 'is', null);
  if (ee) { console.error('  events:', ee.message); process.exit(1); }
  console.log('  events cleared');

  const { error: hhe } = await sb.from('handicap_history').delete().not('id', 'is', null);
  if (hhe) { console.error('  handicap_history:', hhe.message); process.exit(1); }
  console.log('  handicap_history cleared');

  const { error: te } = await sb.from('session_templates')
    .update({ created_by: admin.id }).neq('created_by', admin.id);
  if (te) { console.error('  session_templates update:', te.message); process.exit(1); }
  console.log('  session_templates reassigned to admin');

  const { error: pe } = await sb.from('players').delete().neq('email', ADMIN_EMAIL);
  if (pe) { console.error('  players:', pe.message); process.exit(1); }
  console.log('  players cleared (admin preserved)');

  // Update admin record
  const adminHCName = hcPlayerNames.find(n => n.toLowerCase().includes('barkess'));
  const { error: adminErr } = await sb.from('players').update({
    is_admin:         true,
    active:           true,
    current_handicap: adminHCName ? latestHC[adminHCName].hc : admin.current_handicap,
    phone:            phoneMap['David Barkess'] || null,
  }).eq('id', admin.id);
  if (adminErr) { console.error('  admin update:', adminErr.message); process.exit(1); }
  console.log('  admin updated (is_admin=true)');

  // ── Insert HC players ──────────────────────────────────────────────────────
  console.log('\nInserting HC players...');
  const playerRows    = [];
  const nameToId      = new Map();
  if (adminHCName) nameToId.set(adminHCName, admin.id);

  for (const name of hcPlayerNames) {
    if (name.toLowerCase().includes('barkess')) continue;
    const { first_name, last_name } = parseName(name);
    playerRows.push({
      email:            makeEmail(name),
      first_name,
      last_name,
      is_admin:         false,
      active:           activeHC.has(name),
      current_handicap: latestHC[name].hc,
      phone:            phoneMap[name] || null,
    });
  }

  const BATCH = 50;
  for (let i = 0; i < playerRows.length; i += BATCH) {
    const batch = playerRows.slice(i, i + BATCH);
    const { data: ins, error } = await sb.from('players').insert(batch).select('id, email');
    if (error) { console.error(`  HC batch ${i}:`, error.message); process.exit(1); }
    for (const p of (ins || [])) {
      for (const name of hcPlayerNames) {
        if (makeEmail(name) === p.email) { nameToId.set(name, p.id); break; }
      }
    }
    process.stdout.write(`\r  ${Math.min(i + BATCH, playerRows.length)}/${playerRows.length}`);
  }
  console.log(`\n  Done: ${playerRows.length} HC players`);

  // ── Insert no-HC named players ─────────────────────────────────────────────
  console.log('\nInserting no-HC players...');
  if (unmatchedNamed.length) {
    const noHCRows = unmatchedNamed.map(({ name, phone }) => {
      const { first_name, last_name } = parseName(name);
      return {
        email:            makeEmail(name),
        first_name,
        last_name,
        is_admin:         false,
        active:           ACTIVE_NO_HC.has(name),
        current_handicap: null,
        phone:            phone || null,
      };
    });
    const { data: ins, error } = await sb.from('players').insert(noHCRows).select('id, email');
    if (error) { console.error('  no-HC insert:', error.message); process.exit(1); }
    console.log(`  Done: ${ins?.length || 0} no-HC players`);
  }

  // ── Insert handicap history ────────────────────────────────────────────────
  console.log('\nInserting handicap history...');
  const historyRows = [];
  for (const [name, ph] of Object.entries(hcHistory)) {
    const playerId = nameToId.get(name);
    if (!playerId) { console.warn(`  WARNING: no id for "${name}" — skipping history`); continue; }
    for (const entry of ph.entries) {
      historyRows.push({
        player_id:      playerId,
        handicap_value: entry.hc,
        changed_at:     dateFromNum(entry.date) + 'T00:00:00Z',
        changed_by:     admin.id,
        notes:          null,
      });
    }
  }
  console.log(`  ${historyRows.length} history entries`);
  const hInserted = await insertBatch('handicap_history', historyRows, 100);
  console.log(`  Done: ${hInserted} rows`);

  console.log(`\nLoad complete: ${playerRows.length + unmatchedNamed.length} players, ${historyRows.length} history entries.`);
  console.log('Run db/reseed-supabase.js next to rebuild event history.');
}

run().catch(err => { console.error(err); process.exit(1); });
