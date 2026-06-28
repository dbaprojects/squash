// ── HCRR detailed results manager (super_admin only) ─────────────────────────
// Loaded after app.js + ladder.js in index.html and dev.html.
// Entry point: super_admins tapping the "Current HCRR Champ" home tile land here
// (see _initDoomEgg release() branch in app.js). Data is stored as a JSONB
// document (hcrr_data) on the hof_results row for that month — one HCRR/month.

(function () {
  // ── Patch showSection ──────────────────────────────────────────────────
  const _origShowSection = showSection;
  showSection = function (id) {
    document.getElementById('view-hcrr')?.classList.add('hidden');
    _origShowSection(id);
    if (id === 'view-hcrr') {
      document.getElementById('view-hcrr').classList.remove('hidden');
      document.getElementById('btn-back-home')?.classList.remove('hidden');
      const appFooter = document.getElementById('app-footer');
      if (appFooter) appFooter.classList.remove('hidden');
      const titleEl = document.getElementById('header-page-title');
      if (titleEl) titleEl.textContent = 'HCRR Results';
      const backBtn = document.getElementById('btn-back-home');
      if (backBtn) { backBtn.textContent = '← Home'; backBtn.onclick = goHome; }
    }
  };

  // ── Patch navTo ────────────────────────────────────────────────────────
  const _origNavTo = navTo;
  navTo = function (view, callback) {
    if (view === 'hcrr') {
      showSection('view-hcrr');
      loadHcrr().then(() => callback && callback());
      return;
    }
    _origNavTo(view, callback);
  };
})();

// ── State ────────────────────────────────────────────────────────────────────
let _hcrrRows    = [];    // hof_results: {id, event_month, winner_name, hcrr_data}
let _hcrrEditing = null;  // { id|null, event_month, data:{groups:[]} }
let _hcrrView    = null;  // { month, id|null, data:{groups:[]} } — read-only viewer

// ── Helpers ──────────────────────────────────────────────────────────────────
function _hcrrUid() {
  return (self.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'u' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function _hcrrInitials(name) {
  return (name || '').trim().split(/\s+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 3);
}

function _hcrrMonthLabel(dateStr) {
  return (typeof fmtHofMonth === 'function')
    ? fmtHofMonth(dateStr)
    : (dateStr || '').slice(0, 7);
}

function _hcrrHasResults(row) {
  return !!(row.hcrr_data && Array.isArray(row.hcrr_data.groups) && row.hcrr_data.groups.length);
}

function _hcrrStageLabel(stage) {
  return stage === 'box' ? 'Box' : stage === 'semi' ? 'Semi-Final' : 'Final';
}

// Row player's points across all opponents in a group.
function _hcrrTotal(group, pid) {
  const row = (group.scores && group.scores[pid]) || {};
  return group.players.reduce((sum, p) => {
    if (p.pid === pid) return sum;
    const v = row[p.pid];
    return sum + (typeof v === 'number' && !isNaN(v) ? v : 0);
  }, 0);
}

function _hcrrFindGroup(gid) {
  return _hcrrEditing?.data.groups.find(g => g.id === gid);
}

// ── Performance vs handicap ──────────────────────────────────────────────────
// Games are played with handicapped starts (HC Calculator), so the handicap is
// already in the scoreline. "To / over / under handicap" is simply the margin:
// a well-handicapped game finishes close; a big margin means the winner
// over-performed (and the loser under-performed). Threshold = dead-band.
const HCRR_SENS = 3;

function _hcrrCellClass(g, rowPid, colPid) {
  const a = g.scores?.[rowPid]?.[colPid];
  const b = g.scores?.[colPid]?.[rowPid];
  if (typeof a !== 'number' || typeof b !== 'number') return '';
  const m = a - b;
  if (m >  HCRR_SENS) return 'hcrr-over';
  if (m < -HCRR_SENS) return 'hcrr-under';
  return '';
}

// Net points scored vs conceded across the box — over/under-performance signal.
function _hcrrNet(g, pid) {
  let net = 0, any = false;
  for (const p of (g.players || [])) {
    if (p.pid === pid) continue;
    const a = g.scores?.[pid]?.[p.pid];
    const b = g.scores?.[p.pid]?.[pid];
    if (typeof a === 'number' && typeof b === 'number') { net += a - b; any = true; }
  }
  return any ? net : null;
}

// ── Entry / list ─────────────────────────────────────────────────────────────
async function loadHcrr() {
  const wrap = document.getElementById('hcrr-wrap');
  if (!wrap) return;
  if (!ST?.player?.is_super_admin) {
    wrap.innerHTML = '<p style="padding:16px;color:#c00">Super admin only.</p>';
    return;
  }
  wrap.innerHTML = '<p style="padding:16px;color:#888">Loading…</p>';
  const { data, error } = await sb.from('hof_results')
    .select('id, event_month, winner_name, hcrr_data')
    .order('event_month', { ascending: false });
  if (error) { wrap.innerHTML = `<p style="color:#c00;padding:16px">${error.message}</p>`; return; }
  _hcrrRows = data || [];
  _hcrrEditing = null;
  renderHcrrList();
}

function renderHcrrList() {
  const wrap = document.getElementById('hcrr-wrap');
  const rows = _hcrrRows.map(r => {
    const recorded = _hcrrHasResults(r);
    const champ = r.winner_name ? esc(r.winner_name) : '<span style="color:#aaa">—</span>';
    return `<div class="hcrr-list-row" onclick="hcrrEdit('${r.id}')">
      <div class="hcrr-list-main">
        <div class="hcrr-list-month">${_hcrrMonthLabel(r.event_month)}</div>
        <div class="hcrr-list-champ">🏆 ${champ}</div>
      </div>
      <div class="hcrr-list-badge ${recorded ? 'recorded' : 'empty'}">${recorded ? 'Results recorded' : 'No results'}</div>
    </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="hcrr-panel">
      <div class="panel-header">
        <h3 style="margin:0">HCRR Results</h3>
        <button class="btn-primary" onclick="hcrrNewPrompt()">+ New HCRR</button>
      </div>
      <p style="font-size:12px;color:#64748b;margin:0 0 12px">
        Record the detailed box-by-box results for each month's Handicap Round Robin.
      </p>
      ${rows || '<p style="color:#888;padding:8px 0">No HoF months yet. Create one with “+ New HCRR”.</p>'}
      <div style="margin-top:16px">
        <a class="hcrr-link" onclick="navTo('hof')">View Hall of Fame →</a>
      </div>
    </div>`;
}

function hcrrNewPrompt() {
  const now = new Date();
  const defMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  showFormModal('New HCRR', `
    <div class="form-group">
      <label>Month</label>
      <input type="month" id="hcrr-new-month" value="${defMonth}">
    </div>
    <button class="btn-primary" style="width:100%" onclick="hcrrCreate()">Create / Open</button>
    <p style="font-size:11px;color:#94a3b8;margin-top:8px">If results already exist for this month, they'll open for editing.</p>
  `);
}

function hcrrCreate() {
  const m = document.getElementById('hcrr-new-month')?.value;
  if (!m) { alert('Pick a month'); return; }
  const month = m + '-01';
  const existing = _hcrrRows.find(r => r.event_month === month);
  _hcrrEditing = {
    id: existing ? existing.id : null,
    event_month: month,
    data: existing && existing.hcrr_data && Array.isArray(existing.hcrr_data.groups)
      ? existing.hcrr_data
      : { groups: [] },
  };
  closeFormModal();
  showSection('view-hcrr');
  renderHcrrEditor();
}

function hcrrEdit(id) {
  const row = _hcrrRows.find(r => r.id === id);
  if (!row) return;
  _hcrrEditing = {
    id: row.id,
    event_month: row.event_month,
    data: (row.hcrr_data && Array.isArray(row.hcrr_data.groups)) ? row.hcrr_data : { groups: [] },
  };
  renderHcrrEditor();
}

// Open the detailed box editor for a specific month — the main entry point,
// called from the HoF month cards and the HoF "Detailed box results →" button.
async function hcrrOpenForMonth(month) {
  if (!ST?.player?.is_super_admin) return;
  const { data } = await sb.from('hof_results')
    .select('id, event_month, hcrr_data').eq('event_month', month).maybeSingle();
  _hcrrEditing = {
    id: data ? data.id : null,
    event_month: month,
    data: (data && data.hcrr_data && Array.isArray(data.hcrr_data.groups)) ? data.hcrr_data : { groups: [] },
  };
  showSection('view-hcrr');
  renderHcrrEditor();
}

// ── Read-only viewer (everyone) — opened by clicking a HoF month card ─────────
async function hcrrViewForMonth(month) {
  const { data } = await sb.from('hof_results')
    .select('id, event_month, hcrr_data, winner_name, runner_up_name').eq('event_month', month).maybeSingle();
  _hcrrView = {
    month,
    id: data ? data.id : null,
    winner: data?.winner_name || null,
    runnerUp: data?.runner_up_name || null,
    data: (data && data.hcrr_data && Array.isArray(data.hcrr_data.groups)) ? data.hcrr_data : { groups: [] },
  };
  showSection('view-hcrr');
  renderHcrrView();
}

// Copy a shareable deep link to this month's results. Recipients who aren't
// logged in go through the phone-login flow first, then land here.
function hcrrCopyLink(month) {
  const url = location.origin + location.pathname + '#hcrr=' + (month || '').slice(0, 7);
  const done = () => alert('Link copied:\n' + url);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done, () => prompt('Copy this link:', url));
  } else {
    prompt('Copy this link:', url);
  }
}

// Rank players within a box: most total points, head-to-head tiebreak.
function _hcrrRanks(g) {
  const arr = (g.players || []).map(p => ({ pid: p.pid, total: _hcrrTotal(g, p.pid) }));
  arr.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    const ab = g.scores?.[a.pid]?.[b.pid];
    const ba = g.scores?.[b.pid]?.[a.pid];
    if (typeof ab === 'number' && typeof ba === 'number') return ba - ab;
    return 0;
  });
  const ranks = {};
  arr.forEach((x, i) => { ranks[x.pid] = i + 1; });
  return ranks;
}

function _hcrrRenderBoxView(g) {
  const players = g.players || [];
  if (!players.length) return '';
  const n = players.length;
  const ranks = _hcrrRanks(g);
  const tmpl = `26px minmax(84px,1fr) repeat(${n}, 26px) 30px 34px`;

  const colHead = players.map(p =>
    `<span class="hb-colh" title="${esc(p.name)}">${esc(p.initials || '?')}</span>`).join('');
  const head = `<div class="hb-head" style="grid-template-columns:${tmpl}">
    <span class="hb-title">${esc(g.name)}</span>
    ${colHead}
    <span class="hb-colh hb-tot">TOT</span>
    <span class="hb-colh hb-net">±HC</span>
  </div>`;

  const rows = players.map(rp => {
    const cells = players.map(cp => {
      if (cp.pid === rp.pid) return `<span class="hb-cell diag"></span>`;
      const v = (g.scores?.[rp.pid]?.[cp.pid] != null) ? g.scores[rp.pid][cp.pid] : '';
      return `<span class="hb-cell ${_hcrrCellClass(g, rp.pid, cp.pid)}">${v}</span>`;
    }).join('');
    const net = _hcrrNet(g, rp.pid);
    const netCls = net == null ? '' : net > 0 ? 'pos' : net < 0 ? 'neg' : '';
    const netTxt = net == null ? '' : (net > 0 ? '+' : '') + net;
    const pos = ranks[rp.pid];
    const hcTxt = rp.hc != null ? `HC ${rp.hc}` : '';
    return `<div class="hb-row" style="grid-template-columns:${tmpl}">
      <span class="hb-pos${pos === 1 ? ' pos1' : ''}">${pos}</span>
      <span class="hb-id">
        <span class="hb-name">${esc(rp.name)}</span>
        <span class="hb-sub">${hcTxt}${rp.initials ? ` · ${esc(rp.initials)}` : ''}</span>
      </span>
      ${cells}
      <span class="hb-rtot">${_hcrrTotal(g, rp.pid)}</span>
      <span class="hb-rnet ${netCls}">${netTxt}</span>
    </div>`;
  }).join('');

  return `<div class="hbox">${head}${rows}</div>`;
}

function renderHcrrView() {
  const wrap = document.getElementById('hcrr-wrap');
  const v = _hcrrView;
  if (!wrap || !v) return;
  const isSU = ST?.player?.is_super_admin === true;
  const groups = v.data.groups || [];

  const cap = v.winner ? `${esc(v.winner)}${v.runnerUp ? ` def. ${esc(v.runnerUp)}` : ''} · Final` : '';
  const banner = (v.data.photo || cap || isSU) ? `<div class="hcrr-banner">
      ${v.data.photo
        ? `<img class="hcrr-banner-img" src="${v.data.photo}" alt="Winners">`
        : `<div class="hcrr-banner-ph">winners photo</div>`}
      ${cap ? `<div class="hcrr-banner-cap">${cap}</div>` : ''}
    </div>` : '';

  const legend = groups.length ? `<div class="hcrr-legend2">
      <span class="lg-chip"><i class="lg-dot over"></i> above HC</span>
      <span class="lg-chip"><i class="lg-dot under"></i> below HC</span>
      <span class="lg-chip"><i class="lg-dot neutral"></i> ±${HCRR_SENS}</span>
      <span class="lg-net">net pts vs box</span>
    </div>` : '';

  const body = groups.length
    ? groups.map(g => _hcrrRenderBoxView(g)).join('')
    : `<p style="color:#888;padding:12px 0">No detailed results recorded for ${_hcrrMonthLabel(v.month)}${isSU ? ' yet.' : '.'}</p>`;

  const editBtn = isSU
    ? `<button class="hcrr-edit-btn" onclick="hcrrOpenForMonth('${v.month}')">✏️ ${groups.length ? 'Edit results' : 'Create results'}</button>`
    : '';

  wrap.innerHTML = `
    <div class="hcrr-panel">
      <button class="hcrr-back2" onclick="navTo('hof')">← Hall of Fame</button>
      <div class="hcrr-vtop">
        <div class="hcrr-vtitle">${_hcrrMonthLabel(v.month)} HCRR</div>
        <button class="hcrr-copy2" onclick="hcrrCopyLink('${v.month}')">Copy link</button>
      </div>
      ${banner}
      ${legend}
      ${body}
      ${editBtn}
    </div>`;
}

// ── Editor ───────────────────────────────────────────────────────────────────
function renderHcrrEditor() {
  const wrap = document.getElementById('hcrr-wrap');
  const e = _hcrrEditing;
  if (!e) { renderHcrrList(); return; }

  const groupsHtml = e.data.groups.map(g => _hcrrRenderGroup(g)).join('')
    || '<p style="color:#888;padding:8px 0">No boxes yet. Add one below.</p>';

  wrap.innerHTML = `
    <div class="hcrr-panel">
      <button class="hcrr-back2" onclick="hcrrViewForMonth('${e.event_month}')">← Done</button>
      <div class="hcrr-vtop">
        <div class="hcrr-vtitle">${_hcrrMonthLabel(e.event_month)} HCRR</div>
        <span class="hcrr-edit-tag">Editing</span>
      </div>

      <div class="hcrr-photo-section">
        ${e.data.photo ? `<img src="${e.data.photo}" class="hcrr-photo" alt="Winners">` : ''}
        <div class="hcrr-photo-controls">
          <label class="hcrr-photo-btn">${e.data.photo ? '🔄 Replace photo' : '📷 Add winners photo'}
            <input type="file" accept="image/*" style="display:none" onchange="hcrrPhotoSelected(this)">
          </label>
          ${e.data.photo ? `<button class="hcrr-photo-remove" onclick="hcrrRemovePhoto()">Remove</button>` : ''}
          <span id="hcrr-photo-status" class="hcrr-photo-status"></span>
        </div>
      </div>

      ${groupsHtml}

      <div class="hcrr-add-row">
        <button class="btn-secondary" onclick="hcrrAddGroup('box')">+ Add Box</button>
        <button class="btn-secondary" onclick="hcrrAddGroup('semi')">+ Add Semi-Final</button>
        <button class="btn-secondary" onclick="hcrrAddGroup('final')">+ Add Final</button>
      </div>

      <div class="hcrr-save-row">
        <button class="hcrr-edit-btn" onclick="hcrrSave()">💾 Save HCRR</button>
      </div>
    </div>`;
}

function _hcrrRenderGroup(g, ro) {
  const players = g.players || [];
  // Column headers (initials)
  const colHead = players.map(p => `<th class="hcrr-col-init" title="${esc(p.name)}">${esc(p.initials || '?')}</th>`).join('');

  const bodyRows = players.map(rp => {
    const cells = players.map(cp => {
      if (cp.pid === rp.pid) return `<td class="hcrr-diag"></td>`;
      const v = (g.scores && g.scores[rp.pid] && g.scores[rp.pid][cp.pid] != null)
        ? g.scores[rp.pid][cp.pid] : '';
      // Read-only view: shade by handicapped-game margin (start already applied).
      if (ro) return `<td class="hcrr-cell-ro ${_hcrrCellClass(g, rp.pid, cp.pid)}">${v}</td>`;
      return `<td><input class="hcrr-cell" id="hcrr-cell-${g.id}-${rp.pid}-${cp.pid}" type="number" min="-35" max="11" step="1"
        value="${v}" onchange="hcrrSetScore('${g.id}','${rp.pid}','${cp.pid}',this.value)"></td>`;
    }).join('');
    let netCell = '';
    if (ro) {
      const net = _hcrrNet(g, rp.pid);
      const cls = net == null ? '' : net > HCRR_SENS ? 'hcrr-over' : net < -HCRR_SENS ? 'hcrr-under' : '';
      const txt = net == null ? '' : (net > 0 ? '+' : '') + net;
      netCell = `<td class="hcrr-net ${cls}">${txt}</td>`;
    }
    return `<tr>
      <td class="hcrr-rp-hc">${rp.hc != null ? rp.hc : ''}</td>
      <td class="hcrr-rp-name">${esc(rp.name)} <span class="hcrr-rp-init">${esc(rp.initials || '')}</span></td>
      ${cells}
      <td class="hcrr-total" id="hcrr-tot-${g.id}-${rp.pid}">${_hcrrTotal(g, rp.pid)}</td>
      ${ro ? netCell : `<td><button class="hcrr-x" title="Remove player" onclick="hcrrRemovePlayer('${g.id}','${rp.pid}')">×</button></td>`}
    </tr>`;
  }).join('');

  const matrix = players.length
    ? `<div class="hcrr-matrix-scroll"><table class="hcrr-matrix">
         <thead><tr>
           <th class="hcrr-hc-head">HC</th>
           <th class="hcrr-name-head">Player</th>
           ${colHead}
           <th class="hcrr-total-head">Total</th>
           ${ro ? '<th class="hcrr-net-head" title="Net points vs opponents — over/under handicap">± HC</th>' : '<th></th>'}
         </tr></thead>
         <tbody>${bodyRows}</tbody>
       </table></div>`
    : (ro ? '' : '<p style="color:#aaa;font-size:12px;padding:4px 0">No players yet.</p>');

  const head = ro
    ? `<div class="hcrr-group-head">
        <span class="hcrr-group-name-ro">${esc(g.name)}</span>
        <span class="hcrr-stage-tag">${_hcrrStageLabel(g.stage)}</span>
      </div>`
    : `<div class="hcrr-group-head">
        <input class="hcrr-group-name" value="${esc(g.name)}" onchange="hcrrRenameGroup('${g.id}',this.value)">
        <span class="hcrr-stage-tag">${_hcrrStageLabel(g.stage)}</span>
        <button class="hcrr-group-x" title="Remove ${_hcrrStageLabel(g.stage)}" onclick="hcrrRemoveGroup('${g.id}')">🗑</button>
      </div>`;

  return `<div class="hcrr-group">
    ${head}
    ${matrix}
    ${ro ? '' : `<button class="hcrr-addplayer-btn" onclick="hcrrAddPlayerPrompt('${g.id}')">+ Add player</button>`}
  </div>`;
}

// ── Group / player mutations ──────────────────────────────────────────────────
function hcrrAddGroup(stage) {
  const groups = _hcrrEditing.data.groups;
  let name;
  if (stage === 'box') {
    const n = groups.filter(g => g.stage === 'box').length + 1;
    name = `Box ${n}`;
  } else if (stage === 'semi') {
    const n = groups.filter(g => g.stage === 'semi').length + 1;
    name = `SF ${n}`;
  } else {
    name = 'Final';
  }
  groups.push({ id: _hcrrUid(), stage, name, players: [], scores: {} });
  renderHcrrEditor();
}

function hcrrRemoveGroup(gid) {
  const g = _hcrrFindGroup(gid);
  if (!g) return;
  if (!confirm(`Remove ${g.name}?`)) return;
  _hcrrEditing.data.groups = _hcrrEditing.data.groups.filter(x => x.id !== gid);
  renderHcrrEditor();
}

function hcrrRenameGroup(gid, val) {
  const g = _hcrrFindGroup(gid);
  if (g) g.name = val;
}

let _hcrrPickGid = null;   // group currently having a player added

function hcrrAddPlayerPrompt(gid) {
  const g = _hcrrFindGroup(gid);
  if (!g) return;
  _hcrrPickGid = gid;
  showFormModal(`Add player to ${esc(g.name)}`, `
    <div class="form-group">
      <label>Player</label>
      <input type="text" id="hcrr-pick-search" class="hcrr-pick-search" placeholder="Type a name…"
        autocomplete="off" oninput="hcrrFilterPick()">
    </div>
    <div id="hcrr-pick-list" class="hcrr-pick-list">${_hcrrPickItems('')}</div>
  `);
  setTimeout(() => document.getElementById('hcrr-pick-search')?.focus(), 50);
}

// Build the filtered candidate list (active players not already in the group).
function _hcrrPickItems(filterStr) {
  const g = _hcrrFindGroup(_hcrrPickGid);
  if (!g) return '';
  const existingIds = new Set(g.players.map(p => p.player_id).filter(Boolean));
  const q = (filterStr || '').toLowerCase().trim();
  const list = (ST.players || [])
    .filter(p => p.active !== false && !existingIds.has(p.id))
    .filter(p => !q || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q))
    .sort((a, b) => (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name));
  if (!list.length) return '<div class="hcrr-pick-empty">No matching players</div>';
  return list.map(p =>
    `<div class="hcrr-pick-item" onclick="hcrrPickPlayer('${p.id}')">
      <span>${esc(p.first_name)} ${esc(p.last_name)}</span>
      <span class="hcrr-pick-hc">${p.current_handicap != null ? p.current_handicap : '–'}</span>
    </div>`
  ).join('');
}

function hcrrFilterPick() {
  const q = document.getElementById('hcrr-pick-search')?.value || '';
  const listEl = document.getElementById('hcrr-pick-list');
  if (listEl) listEl.innerHTML = _hcrrPickItems(q);
}

function hcrrPickPlayer(playerId) {
  const g = _hcrrFindGroup(_hcrrPickGid);
  if (!g) return;
  const p = (ST.players || []).find(x => x.id === playerId);
  if (!p) return;
  const name = `${p.first_name} ${p.last_name}`.trim();
  g.players.push({
    pid: _hcrrUid(),
    player_id: p.id,
    name,
    initials: _hcrrInitials(name),
    hc: p.current_handicap != null ? p.current_handicap : null,
  });
  closeFormModal();
  renderHcrrEditor();
}

function hcrrRemovePlayer(gid, pid) {
  const g = _hcrrFindGroup(gid);
  if (!g) return;
  g.players = g.players.filter(p => p.pid !== pid);
  if (g.scores) {
    delete g.scores[pid];
    for (const rowPid of Object.keys(g.scores)) delete g.scores[rowPid][pid];
  }
  renderHcrrEditor();
}

const HCRR_SCORE_MIN = -35;  // worst possible — lowest handicap start
const HCRR_SCORE_MAX = 11;   // game won

function hcrrSetScore(gid, rowPid, colPid, val) {
  const g = _hcrrFindGroup(gid);
  if (!g) return;
  g.scores = g.scores || {};
  g.scores[rowPid] = g.scores[rowPid] || {};
  if (val === '' || val == null) {
    delete g.scores[rowPid][colPid];
  } else {
    let n = Math.round(Number(val));
    if (isNaN(n)) { delete g.scores[rowPid][colPid]; }
    else {
      n = Math.max(HCRR_SCORE_MIN, Math.min(HCRR_SCORE_MAX, n));
      g.scores[rowPid][colPid] = n;
      // Reflect any clamp/rounding back into the input
      const inp = document.getElementById(`hcrr-cell-${gid}-${rowPid}-${colPid}`);
      if (inp && String(n) !== val) inp.value = n;
    }
  }
  // Live-update the row total
  const totEl = document.getElementById(`hcrr-tot-${gid}-${rowPid}`);
  if (totEl) totEl.textContent = _hcrrTotal(g, rowPid);
}

// ── Save ─────────────────────────────────────────────────────────────────────
async function hcrrSave() {
  if (!ST?.player?.is_super_admin) return;
  const e = _hcrrEditing;
  if (!e) return;
  let res;
  if (e.id) {
    res = await sb.from('hof_results').update({ hcrr_data: e.data }).eq('id', e.id);
  } else {
    res = await sb.from('hof_results')
      .insert({ event_month: e.event_month, hcrr_data: e.data, created_by: ST.player.id })
      .select('id')
      .single();
    if (!res.error && res.data) e.id = res.data.id;
  }
  if (res.error) { alert('Save failed: ' + res.error.message); return; }
  alert('HCRR saved.');
  renderHcrrEditor();   // stay in the editor
}

// ── Winners photo: resize client-side, upload to the squash-photos bucket ─────
const HCRR_PHOTO_MAX = 1080;   // longest edge — plenty for a phone screen
const HCRR_PHOTO_Q   = 0.82;   // JPEG quality

function _hcrrResizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > HCRR_PHOTO_MAX || h > HCRR_PHOTO_MAX) {
        if (w >= h) { h = Math.round(h * HCRR_PHOTO_MAX / w); w = HCRR_PHOTO_MAX; }
        else        { w = Math.round(w * HCRR_PHOTO_MAX / h); h = HCRR_PHOTO_MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(img.src);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not process image')), 'image/jpeg', HCRR_PHOTO_Q);
    };
    img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error('Could not read image')); };
    img.src = URL.createObjectURL(file);
  });
}

async function hcrrPhotoSelected(input) {
  const file = input.files && input.files[0];
  if (!file || !_hcrrEditing) return;
  const statusEl = document.getElementById('hcrr-photo-status');
  if (statusEl) statusEl.textContent = 'Uploading…';
  try {
    const blob = await _hcrrResizeImage(file);
    const path = `hcrr/${_hcrrEditing.event_month}.jpg`;
    const up = await sb.storage.from('squash-photos')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (up.error) throw up.error;
    const pub = sb.storage.from('squash-photos').getPublicUrl(path);
    _hcrrEditing.data.photo = pub.data.publicUrl + '?t=' + Date.now();  // cache-bust on replace
    renderHcrrEditor();
  } catch (err) {
    if (statusEl) statusEl.textContent = '';
    alert('Photo upload failed: ' + (err.message || err));
  }
}

function hcrrRemovePhoto() {
  if (!_hcrrEditing) return;
  delete _hcrrEditing.data.photo;
  renderHcrrEditor();
}
