// ── Division Ladder (Phase 1) ─────────────────────────────────────────────
// Loaded after app.js in dev.html only.
// Patches showSection, navTo, loadHome, and loadAdminTab to add ladder support.

(function () {
  // ── Patch showSection ──────────────────────────────────────────────────
  const _origShowSection = showSection;
  showSection = function (id) {
    // Add view-division-ladder to the hide list
    document.getElementById('view-division-ladder')?.classList.add('hidden');
    _origShowSection(id);
    // Override title for division ladder
    if (id === 'view-division-ladder') {
      document.getElementById('view-division-ladder').classList.remove('hidden');
      // btn-back-home visibility
      document.getElementById('btn-back-home')?.classList.remove('hidden');
      const appFooter = document.getElementById('app-footer');
      if (appFooter) appFooter.classList.remove('hidden');
      const titleEl = document.getElementById('header-page-title');
      if (titleEl) titleEl.textContent = 'Division Ladder';
      const backBtn = document.getElementById('btn-back-home');
      if (backBtn) { backBtn.textContent = '← Home'; backBtn.onclick = goHome; }
    }
  };

  // ── Patch navTo ────────────────────────────────────────────────────────
  const _origNavTo = navTo;
  navTo = function (view, callback) {
    if (view === 'division-ladder') {
      showSection('view-division-ladder');
      loadDivisionLadder().then(() => callback && callback());
      return;
    }
    _origNavTo(view, callback);
  };

  // ── Patch loadHome ─────────────────────────────────────────────────────
  const _origLoadHome = loadHome;
  loadHome = async function () {
    const [, posRes, cfgRes] = await Promise.all([
      _origLoadHome(),
      sb.from('ladder_positions')
        .select('position, player_id, players(id, first_name, last_name, current_handicap)')
        .order('position'),
      sb.from('ladder_config').select('key,value')
    ]);
    const cfg = (cfgRes.data || []).find(r => r.key === 'division_size');
    _ladderDivSize   = cfg ? parseInt(cfg.value, 10) : 9;
    _ladderPositions = posRes.data || [];
    _injectLadderHomeCard();
  };

  // ── Patch loadAdminTab ─────────────────────────────────────────────────
  const _origLoadAdminTab = loadAdminTab;
  loadAdminTab = async function (tabId) {
    await _origLoadAdminTab(tabId);
    if (tabId === 'tab-ladder') {
      // Show the tab panel (origLoadAdminTab hid it since it doesn't know about it)
      document.getElementById('tab-ladder')?.classList.remove('hidden');
      await loadLadderAdmin();
    }
    // Show Ladder tab button only for super_admin
    const ladderTabBtn = document.getElementById('tab-btn-ladder');
    if (ladderTabBtn && ST?.player?.is_super_admin) ladderTabBtn.style.display = '';
  };
})();

// ── State ──────────────────────────────────────────────────────────────────
let _ladderPositions = [];   // [{position, player_id, players:{first_name,last_name,current_handicap}}]
let _ladderDivSize   = 9;
let _ladderInList    = [];   // ordered array of player_id (admin reorder)
let _ladderPool      = [];   // unranked player objects (admin reorder)
let _ladderAllPlayers= [];   // all active players [{id,first_name,last_name,current_handicap}]

// ── Home tile injection ────────────────────────────────────────────────────
function _injectLadderHomeCard() {
  const grid = document.getElementById('home-grid');
  if (!grid) return;
  if (document.getElementById('home-card-division-ladder')) return; // already injected

  const card = document.createElement('div');
  card.id = 'home-card-division-ladder';
  card.className = 'home-card home-card-divladder';
  card.onclick = () => navTo('division-ladder');
  card.innerHTML = `
    <div class="home-card-label">Ladders</div>
    <div class="divladder-home-body">
      ${[1,2,3,4].map(d => {
        const start = (d - 1) * _ladderDivSize + 1;
        const top3  = _ladderPositions.filter(p => p.position >= start && p.position <= start + 2);
        const names = top3.map(p => `${p.players.first_name} ${p.players.last_name[0]}`).join(', ') || '—';
        return `<div class="divladder-home-div"><span class="divladder-home-div-label">Div ${d}</span><span class="divladder-home-div-name">${names}</span></div>`;
      }).join('')}
    </div>`;

  // Insert before admin card (it has grid-column:1/-1 so it sits at the end)
  const adminCard = grid.querySelector('.home-card-admin');
  if (adminCard) {
    grid.insertBefore(card, adminCard);
  } else {
    grid.appendChild(card);
  }
}

// ── Public view: load + render ─────────────────────────────────────────────
async function loadDivisionLadder() {
  const wrap = document.getElementById('division-ladder-wrap');
  wrap.innerHTML = '<p style="color:#888;padding:16px">Loading…</p>';

  const [posRes, cfgRes] = await Promise.all([
    sb.from('ladder_positions')
      .select('position, player_id, players(id, first_name, last_name, current_handicap)')
      .order('position'),
    sb.from('ladder_config').select('key,value')
  ]);

  if (posRes.error) { wrap.innerHTML = `<p style="color:#c00;padding:16px">${posRes.error.message}</p>`; return; }

  const cfg = (cfgRes.data || []).find(r => r.key === 'division_size');
  _ladderDivSize    = cfg ? parseInt(cfg.value, 10) : 9;
  _ladderPositions  = posRes.data || [];

  renderDivisionLadder();
}

function renderDivisionLadder() {
  const wrap = document.getElementById('division-ladder-wrap');
  const numDivisions = 4;
  const ranked = _ladderPositions; // already sorted by position

  const myId  = ST?.player?.id;
  const myPos = ranked.find(p => p.player_id === myId)?.position ?? null;

  const divCards = [];
  for (let d = 1; d <= numDivisions; d++) {
    const start = (d - 1) * _ladderDivSize + 1;
    const end   = d * _ladderDivSize;
    // Last division shows all remaining players (may be more than division_size)
    const players = ranked.filter(p => d === numDivisions
      ? p.position >= start
      : p.position >= start && p.position <= end);

    const rows = players.map(p => {
      const first = p.players.first_name;
      const last  = p.players.last_name ? p.players.last_name[0].toUpperCase() : '';
      let cls = '', badge = '';
      if (myPos !== null) {
        if (p.player_id === myId) {
          cls = ' div-row-me';
        } else if (p.position < myPos && p.position >= myPos - 3) {
          cls = ' div-row-can-challenge';
          badge = '<span class="div-row-badge badge-up">▲</span>';
        } else if (p.position > myPos && p.position <= myPos + 3) {
          cls = '';
          badge = '';
        }
      }
      return `<div class="div-player-row${cls}">
        <span class="div-pos">${p.position}</span>
        <span class="div-player-name">${first} ${last}</span>
        ${badge}
      </div>`;
    }).join('');

    divCards.push(`
      <div class="div-card">
        <div class="div-card-header">Division ${d}</div>
        ${rows || '<div style="color:#aaa;font-size:12px;padding:6px 0">No players ranked</div>'}
      </div>`);
  }

  wrap.innerHTML = `<div class="div-ladder-grid">${divCards.join('')}</div>`;
}

// ── Admin reorder ──────────────────────────────────────────────────────────
async function loadLadderAdmin() {
  const wrap = document.getElementById('tab-ladder');
  if (!wrap) return;
  wrap.innerHTML = '<p style="color:#888;padding:16px">Loading…</p>';

  const [posRes, playersRes] = await Promise.all([
    sb.from('ladder_positions')
      .select('position, player_id, players(id, first_name, last_name, current_handicap)')
      .order('position'),
    sb.from('players').select('id,first_name,last_name,current_handicap').eq('active', true).order('first_name')
  ]);

  if (posRes.error || playersRes.error) {
    wrap.innerHTML = `<p style="color:#c00;padding:16px">${(posRes.error || playersRes.error).message}</p>`;
    return;
  }

  _ladderAllPlayers = playersRes.data || [];
  _ladderPositions  = posRes.data || [];

  const rankedIds = new Set(_ladderPositions.map(p => p.player_id));
  _ladderInList   = _ladderPositions.map(p => p.player_id);
  _ladderPool     = _ladderAllPlayers.filter(p => !rankedIds.has(p.id));

  renderLadderAdmin();
}

function _playerById(id) {
  return _ladderAllPlayers.find(p => p.id === id);
}

function renderLadderAdmin() {
  const wrap = document.getElementById('tab-ladder');
  if (!wrap) return;

  const inRows = _ladderInList.map((pid, idx) => {
    const p = _playerById(pid);
    if (!p) return '';
    const name = `${p.first_name} ${p.last_name}`;
    const divNum = Math.ceil((idx + 1) / _ladderDivSize);
    const divBorder = (idx + 1) % _ladderDivSize === 0 ? ' ladder-div-end' : '';
    return `<div class="ladder-in-row${divBorder}" draggable="true"
                 data-idx="${idx}"
                 ondragstart="ladderDragStart(event)"
                 ondragover="ladderDragOver(event)"
                 ondrop="ladderDrop(event)">
      <span class="ladder-drag-handle">⠿</span>
      <span class="ladder-in-pos">${idx + 1}</span>
      <span class="ladder-in-name">${name}</span>
      <span class="ladder-in-div" title="Division">D${divNum}</span>
      <button class="ladder-remove-btn" onclick="ladderRemove(${idx})">✕</button>
    </div>`;
  }).join('');

  const poolRows = _ladderPool.map((p, idx) => {
    const name = `${p.first_name} ${p.last_name}`;
    return `<div class="ladder-pool-row" data-pool-idx="${idx}"
                 ondragstart="ladderPoolDragStart(event)"
                 draggable="true">
      <span class="ladder-pool-name">${name}</span>
      <button class="ladder-add-btn" onclick="ladderAdd(${idx})">+ Add</button>
    </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="panel-header" style="margin-bottom:16px">
      <h3>Division Ladder — Reorder</h3>
      <button class="btn-primary" onclick="saveLadderOrder()">Save Order</button>
    </div>
    <div id="ladder-save-msg" style="margin-bottom:12px;font-size:13px;color:#15803d;min-height:18px"></div>
    <div class="ladder-admin-wrap">
      <div class="ladder-admin-panel">
        <div class="ladder-panel-header">In Ladder (${_ladderInList.length})</div>
        <div id="ladder-in-list" class="ladder-in-list"
             ondragover="event.preventDefault()"
             ondrop="ladderDropOnEmpty(event)">
          ${inRows || '<div style="color:#aaa;padding:12px;font-size:13px">No players ranked yet</div>'}
        </div>
      </div>
      <div class="ladder-admin-panel">
        <div class="ladder-panel-header">Not in Ladder (${_ladderPool.length})</div>
        <div id="ladder-pool-list" class="ladder-pool-list">
          ${poolRows || '<div style="color:#aaa;padding:12px;font-size:13px">All players ranked</div>'}
        </div>
      </div>
    </div>`;
}

// ── Drag and drop ──────────────────────────────────────────────────────────
let _ladderDragSrcIdx  = null; // index in _ladderInList
let _ladderPoolDragIdx = null; // index in _ladderPool

function ladderDragStart(e) {
  _ladderDragSrcIdx  = parseInt(e.currentTarget.dataset.idx, 10);
  _ladderPoolDragIdx = null;
  e.dataTransfer.effectAllowed = 'move';
}

function ladderPoolDragStart(e) {
  _ladderPoolDragIdx = parseInt(e.currentTarget.dataset.poolIdx, 10);
  _ladderDragSrcIdx  = null;
  e.dataTransfer.effectAllowed = 'copy';
}

function ladderDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function ladderDrop(e) {
  e.preventDefault();
  const targetIdx = parseInt(e.currentTarget.dataset.idx, 10);

  if (_ladderPoolDragIdx !== null) {
    // Dropping from pool into a specific position
    const p = _ladderPool.splice(_ladderPoolDragIdx, 1)[0];
    _ladderInList.splice(targetIdx, 0, p.id);
    _ladderPoolDragIdx = null;
  } else if (_ladderDragSrcIdx !== null && _ladderDragSrcIdx !== targetIdx) {
    const [moved] = _ladderInList.splice(_ladderDragSrcIdx, 1);
    _ladderInList.splice(targetIdx, 0, moved);
    _ladderDragSrcIdx = null;
  }
  renderLadderAdmin();
}

function ladderDropOnEmpty(e) {
  // Drop onto the list container when dropped below all rows
  if (_ladderPoolDragIdx !== null) {
    const p = _ladderPool.splice(_ladderPoolDragIdx, 1)[0];
    _ladderInList.push(p.id);
    _ladderPoolDragIdx = null;
    renderLadderAdmin();
  }
}

// ── Add / Remove ───────────────────────────────────────────────────────────
function ladderAdd(poolIdx) {
  const p = _ladderPool.splice(poolIdx, 1)[0];
  _ladderInList.push(p.id);
  renderLadderAdmin();
}

function ladderRemove(inIdx) {
  const pid = _ladderInList.splice(inIdx, 1)[0];
  const p   = _ladderAllPlayers.find(pl => pl.id === pid);
  if (p) _ladderPool.unshift(p);
  renderLadderAdmin();
}

// ── Save ───────────────────────────────────────────────────────────────────
async function saveLadderOrder() {
  const msg = document.getElementById('ladder-save-msg');
  if (msg) msg.textContent = 'Saving…';

  const rows = _ladderInList.map((playerId, i) => ({
    player_id: playerId,
    position: i + 1,
    updated_at: new Date().toISOString()
  }));

  // Delete all existing, then upsert new order
  const { error: delErr } = await sb.from('ladder_positions').delete().gte('position', 0);
  if (delErr) {
    if (msg) msg.style.color = '#dc2626';
    if (msg) msg.textContent = `Error: ${delErr.message}`;
    return;
  }

  if (rows.length > 0) {
    const { error: insErr } = await sb.from('ladder_positions').insert(rows);
    if (insErr) {
      if (msg) msg.style.color = '#dc2626';
      if (msg) msg.textContent = `Error: ${insErr.message}`;
      return;
    }
  }

  _ladderPositions = rows.map((r, i) => ({
    position: r.position,
    player_id: r.player_id,
    players: _ladderAllPlayers.find(p => p.id === r.player_id) || {}
  }));

  if (msg) { msg.style.color = '#15803d'; msg.textContent = `Saved — ${rows.length} players ranked`; }
  renderLadderAdmin();
}

// Show Ladder tab button once super_admin loads any admin tab
document.addEventListener('DOMContentLoaded', () => {
  const ladderTabBtn = document.getElementById('tab-btn-ladder');
  if (ladderTabBtn && ST?.player?.is_super_admin) ladderTabBtn.style.display = '';
});
