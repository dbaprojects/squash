// Compare live DB schemas between Squash and Padel
// Usage: node db/compare-schemas.js
// Uses anon keys — requires fix-rls-anon.sql to have been run on both DBs

const DBS = {
  squash: {
    url: 'https://ikfzmqtglgeotyooosur.supabase.co',
    key: 'sb_publishable_zs7ClfRPKw5TEaVSn2_oTA_kqVLhZfe',
  },
  padel: {
    url: 'https://zrwpjecfswmyqbtaujnb.supabase.co',
    key: 'sb_publishable_qQ96tYAR9162_2qDBm49QQ_8Gzt5vhs',
  },
};

const EXPECTED = {
  players: [
    'id','email','first_name','last_name','is_admin','is_super_admin',
    'current_handicap','active','pending','phone','created_at',
  ],
  handicap_history: ['id','player_id','handicap_value','changed_at','changed_by','notes'],
  session_templates: ['id','name','day_of_week','start_time','end_time','max_signups','active','created_by','created_at'],
  events: ['id','title','event_date','start_time','end_time','max_signups','template_id','notes','created_by','created_at'],
  signups: ['id','event_id','signed_up_by','player_id','guest_name','is_reserve','signed_up_at','notes'],
  hof_results: ['id','event_month','winner_name','winner_hc','winner_score','runner_up_name','runner_up_hc','runner_up_score','not_played','notes','created_by','created_at'],
  audit_log: ['id','event_type','player_id','player_name','phone','user_agent','details','created_at'],
};

async function checkTable(url, key, table) {
  const res = await fetch(`${url}/rest/v1/${table}?limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return { exists: false, columns: [] };
  const data = await res.json();
  // If rows exist, we get column names from the first row
  if (data.length > 0) return { exists: true, columns: Object.keys(data[0]) };
  // No rows — probe each expected column individually
  return { exists: true, columns: null };
}

async function checkColumn(url, key, table, col) {
  const res = await fetch(`${url}/rest/v1/${table}?select=${col}&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return res.ok;
}

async function getSchema(name, { url, key }) {
  const schema = {};
  for (const [table, cols] of Object.entries(EXPECTED)) {
    const { exists, columns } = await checkTable(url, key, table);
    if (!exists) { schema[table] = null; continue; }

    const present = [];
    const missing = [];
    // If we got column names from a row, use those; otherwise probe individually
    for (const col of cols) {
      if (columns) {
        (columns.includes(col) ? present : missing).push(col);
      } else {
        const ok = await checkColumn(url, key, table, col);
        (ok ? present : missing).push(col);
      }
    }
    schema[table] = { present, missing };
  }
  return schema;
}

async function main() {
  console.log('Querying live schemas...\n');
  const [squash, padel] = await Promise.all([
    getSchema('squash', DBS.squash),
    getSchema('padel',  DBS.padel),
  ]);

  let allMatch = true;

  for (const table of Object.keys(EXPECTED)) {
    const sq = squash[table];
    const pd = padel[table];

    const sqMissing = sq === null ? ['TABLE MISSING'] : sq.missing;
    const pdMissing = pd === null ? ['TABLE MISSING'] : pd.missing;

    const same = JSON.stringify(sqMissing) === JSON.stringify(pdMissing) && sqMissing.length === 0;
    if (!same) allMatch = false;

    console.log(`── ${table}`);
    if (sqMissing.length === 0 && pdMissing.length === 0) {
      console.log(`   ✓ All columns present in both`);
    } else {
      if (sqMissing.length) console.log(`   SQUASH missing: ${sqMissing.join(', ')}`);
      if (pdMissing.length) console.log(`   PADEL  missing: ${pdMissing.join(', ')}`);
    }
  }

  console.log('');
  console.log(allMatch ? '✓ Schemas match.' : '✗ Schemas differ — see above.');
}

main().catch(err => { console.error(err); process.exit(1); });
