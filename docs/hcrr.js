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

// Bridge from the HoF winner/runner-up modal's "Detailed box results →" button.
function hcrrFromHofForm() {
  const m = document.getElementById('hof-month')?.value;
  if (!m) { alert('Pick a month first'); return; }
  closeFormModal();
  hcrrOpenForMonth(m + '-01');
}

// ── Read-only viewer (everyone) — opened by clicking a HoF month card ─────────
async function hcrrViewForMonth(month) {
  const { data } = await sb.from('hof_results')
    .select('id, event_month, hcrr_data').eq('event_month', month).maybeSingle();
  _hcrrView = {
    month,
    id: data ? data.id : null,
    data: (data && data.hcrr_data && Array.isArray(data.hcrr_data.groups)) ? data.hcrr_data : { groups: [] },
  };
  showSection('view-hcrr');
  renderHcrrView();
}

function renderHcrrView() {
  const wrap = document.getElementById('hcrr-wrap');
  const v = _hcrrView;
  if (!wrap || !v) return;
  const isSU = ST?.player?.is_super_admin === true;
  const groups = v.data.groups || [];
  const groupsHtml = groups.length
    ? groups.map(g => _hcrrRenderGroup(g, true)).join('')
    : `<p style="color:#888;padding:12px 0">No detailed results recorded for ${_hcrrMonthLabel(v.month)}${isSU ? ' yet.' : '.'}</p>`;
  const editBtn = isSU
    ? `<div class="hcrr-save-row"><button class="btn-primary" style="flex:1" onclick="hcrrOpenForMonth('${v.month}')">${groups.length ? '✏️ Edit results' : '➕ Create results'}</button></div>`
    : '';
  wrap.innerHTML = `
    <div class="hcrr-panel">
      <div class="hcrr-editor-head">
        <button class="hcrr-back-btn" onclick="navTo('hof')">← Hall of Fame</button>
        <div class="hcrr-editor-month">${_hcrrMonthLabel(v.month)} HCRR</div>
      </div>
      ${groupsHtml}
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
      <div class="hcrr-editor-head">
        <button class="hcrr-back-btn" onclick="hcrrViewForMonth('${e.event_month}')">← Done</button>
        <div class="hcrr-editor-month">Editing ${_hcrrMonthLabel(e.event_month)} HCRR</div>
      </div>

      ${groupsHtml}

      <div class="hcrr-add-row">
        <button class="btn-secondary" onclick="hcrrAddGroup('box')">+ Add Box</button>
        <button class="btn-secondary" onclick="hcrrAddGroup('semi')">+ Add Semi-Final</button>
        <button class="btn-secondary" onclick="hcrrAddGroup('final')">+ Add Final</button>
      </div>

      <div class="hcrr-save-row">
        <button class="btn-primary" style="flex:1" onclick="hcrrSave()">💾 Save HCRR</button>
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
      if (ro) return `<td class="hcrr-cell-ro">${v}</td>`;
      return `<td><input class="hcrr-cell" type="number" inputmode="numeric" min="0" max="99"
        value="${v}" onchange="hcrrSetScore('${g.id}','${rp.pid}','${cp.pid}',this.value)"></td>`;
    }).join('');
    return `<tr>
      <td class="hcrr-rp-hc">${rp.hc != null ? rp.hc : ''}</td>
      <td class="hcrr-rp-name">${esc(rp.name)} <span class="hcrr-rp-init">${esc(rp.initials || '')}</span></td>
      ${cells}
      <td class="hcrr-total" id="hcrr-tot-${g.id}-${rp.pid}">${_hcrrTotal(g, rp.pid)}</td>
      ${ro ? '' : `<td><button class="hcrr-x" title="Remove player" onclick="hcrrRemovePlayer('${g.id}','${rp.pid}')">×</button></td>`}
    </tr>`;
  }).join('');

  const matrix = players.length
    ? `<div class="hcrr-matrix-scroll"><table class="hcrr-matrix">
         <thead><tr>
           <th class="hcrr-hc-head">HC</th>
           <th class="hcrr-name-head">Player</th>
           ${colHead}
           <th class="hcrr-total-head">Total</th>
           ${ro ? '' : '<th></th>'}
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

function hcrrAddPlayerPrompt(gid) {
  const g = _hcrrFindGroup(gid);
  if (!g) return;
  const existingIds = new Set(g.players.map(p => p.player_id).filter(Boolean));
  const opts = (ST.players || [])
    .filter(p => p.active !== false && !existingIds.has(p.id))
    .sort((a, b) => (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name))
    .map(p => `<option value="${p.id}">${esc(p.first_name)} ${esc(p.last_name)} (${p.current_handicap != null ? p.current_handicap : '–'})</option>`)
    .join('');
  showFormModal(`Add player to ${esc(g.name)}`, `
    <div class="form-group">
      <label>Player</label>
      <select id="hcrr-pick-player"><option value="">— choose —</option>${opts}</select>
    </div>
    <button class="btn-primary" style="width:100%;margin-bottom:14px" onclick="hcrrPickPlayer('${gid}')">Add Player</button>
    <div style="border-top:1px solid #e2e8f0;padding-top:12px">
      <p style="font-size:12px;color:#64748b;margin:0 0 8px">…or add a guest (not in the player list):</p>
      <div class="form-group"><label>Name</label><input id="hcrr-guest-name" placeholder="Guest name"></div>
      <div class="form-group"><label>Handicap</label><input id="hcrr-guest-hc" type="number" inputmode="numeric" placeholder="e.g. -3"></div>
      <button class="btn-secondary" style="width:100%" onclick="hcrrAddGuest('${gid}')">Add Guest</button>
    </div>
  `);
}

function hcrrPickPlayer(gid) {
  const g = _hcrrFindGroup(gid);
  if (!g) return;
  const id = document.getElementById('hcrr-pick-player')?.value;
  if (!id) { alert('Choose a player'); return; }
  const p = (ST.players || []).find(x => x.id === id);
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

function hcrrAddGuest(gid) {
  const g = _hcrrFindGroup(gid);
  if (!g) return;
  const name = (document.getElementById('hcrr-guest-name')?.value || '').trim();
  if (!name) { alert('Enter a name'); return; }
  const hcRaw = document.getElementById('hcrr-guest-hc')?.value;
  g.players.push({
    pid: _hcrrUid(),
    player_id: null,
    name,
    initials: _hcrrInitials(name),
    hc: hcRaw === '' || hcRaw == null ? null : Number(hcRaw),
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

function hcrrSetScore(gid, rowPid, colPid, val) {
  const g = _hcrrFindGroup(gid);
  if (!g) return;
  g.scores = g.scores || {};
  g.scores[rowPid] = g.scores[rowPid] || {};
  if (val === '' || val == null) {
    delete g.scores[rowPid][colPid];
  } else {
    g.scores[rowPid][colPid] = Number(val);
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
