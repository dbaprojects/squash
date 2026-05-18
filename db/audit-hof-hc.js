// Audit HoF handicaps — checks stored winner_hc / runner_up_hc against handicap_history
// Usage: node db/audit-hof-hc.js

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://ikfzmqtglgeotyooosur.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_zs7ClfRPKw5TEaVSn2_oTA_kqVLhZfe'
);

// Carry-forward: find the HC a player had at the end of targetMonth ('YYYY-MM-01')
function hcAt(history, playerId, targetMonth) {
  const cutoff = new Date(targetMonth);
  cutoff.setMonth(cutoff.getMonth() + 1); // end of target month
  const entries = history
    .filter(h => h.player_id === playerId && new Date(h.changed_at) < cutoff)
    .sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));
  return entries.length ? entries[0].handicap_value : null;
}

// Normalise name for matching: lowercase, trim, collapse spaces
function norm(s) { return (s || '').toLowerCase().trim().replace(/\s+/g, ' '); }

async function main() {
  const [hofRes, hxRes, playersRes] = await Promise.all([
    sb.from('hof_results').select('*').order('event_month'),
    sb.from('handicap_history').select('player_id, handicap_value, changed_at'),
    sb.from('players').select('id, first_name, last_name'),
  ]);

  if (hofRes.error)     throw hofRes.error;
  if (hxRes.error)      throw hxRes.error;
  if (playersRes.error) throw playersRes.error;

  const hof     = hofRes.data;
  const history = hxRes.data;
  const players = playersRes.data;

  // Build name → player map (normalised full name)
  const nameMap = {};
  for (const p of players) {
    const key = norm(`${p.first_name} ${p.last_name}`);
    nameMap[key] = p;
  }

  const issues = [];
  const noHistory = [];

  for (const r of hof) {
    if (r.not_played) continue;

    for (const [role, nameField, hcField] of [
      ['Winner',    'winner_name',    'winner_hc'],
      ['Runner-up', 'runner_up_name', 'runner_up_hc'],
    ]) {
      const name    = r[nameField];
      const storedHc = r[hcField];
      if (!name) continue;

      const player = nameMap[norm(name)];
      if (!player) {
        noHistory.push(`${r.event_month}  ${role}: "${name}" — not found in players table`);
        continue;
      }

      const expectedHc = hcAt(history, player.id, r.event_month);
      if (expectedHc === null) {
        noHistory.push(`${r.event_month}  ${role}: ${name} — no HC history before this date`);
        continue;
      }

      if (Number(storedHc) !== Number(expectedHc)) {
        issues.push({
          month:    r.event_month,
          role,
          name,
          stored:   storedHc,
          expected: expectedHc,
          diff:     Number(storedHc) - Number(expectedHc),
        });
      }
    }
  }

  console.log(`\n=== HoF HC Audit (${hof.filter(r => !r.not_played).length} played results) ===\n`);

  if (issues.length === 0 && noHistory.length === 0) {
    console.log('✓ All stored handicaps match history — no issues found.');
  }

  if (issues.length > 0) {
    console.log(`MISMATCHES (${issues.length}):`);
    for (const i of issues) {
      const arrow = i.diff > 0 ? `stored +${i.diff} too high` : `stored ${i.diff} too low`;
      console.log(`  ${i.month}  ${i.role}: ${i.name}  stored=${i.stored}  expected=${i.expected}  (${arrow})`);
    }
  }

  if (noHistory.length > 0) {
    console.log(`\nNO HISTORY / NOT MATCHED (${noHistory.length}):`);
    noHistory.forEach(l => console.log('  ' + l));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
