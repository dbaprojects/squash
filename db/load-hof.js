// load-hof.js — seed hof_results from hof.xlsx
// Usage: SUPABASE_SERVICE_ROLE_KEY=... node db/load-hof.js
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

function excelDateToISO(serial) {
  const d = XLSX.SSF.parse_date_code(serial);
  return `${d.y}-${String(d.m).padStart(2,'0')}-01`;
}

// Normalise a name for fuzzy matching
function normName(n) {
  return (n || '').toLowerCase().replace(/\s+/g,' ').trim();
}

async function main() {
  // Load all players + handicap history for HC-at-time lookup
  const { data: players }  = await sb.from('players').select('id, first_name, last_name');
  const { data: histRows } = await sb.from('handicap_history')
    .select('player_id, handicap_value, changed_at').order('changed_at');

  // Build name → player_id map (normalised)
  const nameToId = {};
  for (const p of (players || [])) {
    const full = normName(`${p.first_name} ${p.last_name}`);
    nameToId[full] = p.id;
  }

  // Build player_id → sorted monthly HC array
  const histMap = {};
  for (const h of (histRows || [])) {
    const pid = h.player_id;
    if (!histMap[pid]) histMap[pid] = [];
    const d = new Date(h.changed_at);
    const mKey = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}`;
    histMap[pid].push({ month: mKey, value: Number(h.handicap_value) });
  }
  // Sort each player's history
  for (const pid of Object.keys(histMap)) {
    histMap[pid].sort((a,b) => a.month.localeCompare(b.month));
  }

  function effectiveHcAt(playerId, monthISO) {
    // monthISO = 'YYYY-MM-01'
    const mKey = monthISO.slice(0,7).replace('-','.');
    const hist = histMap[playerId] || [];
    let result = null;
    for (const e of hist) {
      if (e.month <= mKey) result = e.value;
      else break;
    }
    return result;
  }

  function lookupHc(name, monthISO) {
    const pid = nameToId[normName(name)];
    if (!pid) return null;
    return effectiveHcAt(pid, monthISO);
  }

  // Parse Excel
  const wb   = XLSX.readFile(path.join(__dirname, '..', 'hof.xlsx'));
  const ws   = wb.Sheets['Sheet1'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const records = [];
  let curYear = null;

  for (const row of rows) {
    if (!row[0] && !row[1]) continue;  // blank row

    if (row[0] && !row[1]) { curYear = row[0]; continue; }  // year header
    if (row[0] && row[1])  { curYear = row[0]; }            // year + month on same row

    const serial    = row[1];
    if (!serial)    continue;

    const monthISO  = excelDateToISO(serial);
    const notPlayed = String(row[2]).toLowerCase().includes('not played');

    if (notPlayed) {
      records.push({ event_month: monthISO, not_played: true });
      continue;
    }

    const winnerName  = String(row[2]).trim() || null;
    const ruName      = String(row[6]).trim() || null;

    // HC: use stored value if present, else look up from history
    const winnerHcRaw = row[3] !== '' ? Number(row[3]) : null;
    const ruHcRaw     = row[7] !== '' ? Number(row[7]) : null;

    const winnerHc = winnerHcRaw  !== null ? winnerHcRaw  : (winnerName ? lookupHc(winnerName, monthISO)  : null);
    const ruHc     = ruHcRaw      !== null ? ruHcRaw      : (ruName     ? lookupHc(ruName, monthISO)      : null);

    const winnerScore = row[4] !== '' ? Number(row[4]) : null;
    const ruScore     = row[8] !== '' ? Number(row[8]) : null;

    records.push({
      event_month:     monthISO,
      not_played:      false,
      winner_name:     winnerName,
      winner_hc:       winnerHc,
      winner_score:    winnerScore,
      runner_up_name:  ruName,
      runner_up_hc:    ruHc,
      runner_up_score: ruScore,
    });
  }

  console.log(`Parsed ${records.length} records`);

  // Upsert (unique on event_month)
  const { error } = await sb.from('hof_results')
    .upsert(records, { onConflict: 'event_month' });

  if (error) { console.error('Upsert error:', error); process.exit(1); }
  console.log('Done. HoF records loaded.');
}

main().catch(e => { console.error(e); process.exit(1); });
