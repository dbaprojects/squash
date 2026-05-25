// ── Division Ladder (Phase 1 + 2) ────────────────────────────────────────────
// Loaded after app.js in dev.html only.
// Patches showSection, navTo, loadHome, and loadAdminTab to add ladder support.

(function () {
  // ── Patch showSection ──────────────────────────────────────────────────
  const _origShowSection = showSection;
  showSection = function (id) {
    document.getElementById('view-division-ladder')?.classList.add('hidden');
    _origShowSection(id);
    if (id === 'view-division-ladder') {
      document.getElementById('view-division-ladder').classList.remove('hidden');
      document.getElementById('btn-back-home')?.classList.remove('hidden');
      const appFooter = document.getElementById('app-footer');
      if (appFooter) appFooter.classList.remove('hidden');
      const titleEl = document.getElementById('header-page-title');
      if (titleEl) titleEl.textContent = 'Ladders';
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
      sb.from('ladder_config').select('key,value'),
      _loadChallenges()
    ]);
    _applyConfig(cfgRes.data);
    _ladderPositions = posRes.data || [];
    _injectLadderHomeCard();
    _checkPendingChallenges();
  };

  // ── Patch loadAdminTab ─────────────────────────────────────────────────
  const _origLoadAdminTab = loadAdminTab;
  loadAdminTab = async function (tabId) {
    await _origLoadAdminTab(tabId);
    if (tabId === 'tab-ladder') {
      document.getElementById('tab-ladder')?.classList.remove('hidden');
      await loadLadderAdmin();
    }
    const ladderTabBtn = document.getElementById('tab-btn-ladder');
    if (ladderTabBtn && ST?.player?.is_super_admin) ladderTabBtn.style.display = '';
  };
})();

// ── State ──────────────────────────────────────────────────────────────────
let _ladderPositions  = [];
let _ladderDivSize    = 9;
let _challengeRange   = 3;
let _ladderInList     = [];
let _ladderPool       = [];
let _ladderAllPlayers = [];
let _activeChallenges = [];
let _challengesNotified = false; // reset each page load; prevents repeat popup on goHome()

// ── Challenge messages ─────────────────────────────────────────────────────
const CHALLENGE_MESSAGES = [
  "Don't be chicken!",
  "Ready to buy me a beer?",
  "Time to settle this on court!",
  "Prepare to be humbled!",
  "Step up or step aside!",
  "Your days at the top are numbered.",
  "Court's booked. You're on.",
  "I've been watching your game. Big mistake.",
  "See you on the squash court!",
  "Game on. May the best player win!",
  "Fancy your chances?",
  "Let's do this the old fashioned way.",
  "I'm coming for your spot!",
  "You'd better bring your A game.",
  "Challenge accepted? It should be!",
  "No excuses. Court time!",
  "I've been practising. Have you?",
  "Put your ranking where your mouth is.",
  "Let the rackets do the talking.",
  "Loser buys the first round!",
  "Come on, it'll be quick. Then I'll buy YOU a beer.",
  "Time to earn that cold one you owe me.",
  "Let's settle this like gentlemen. Then beer.",
  "Your serve is about as dangerous as a shandy.",
  "I've beaten better players with a hangover.",
  "Bold move staying in my division. Respect. See you on court.",
  "That ranking won't protect you forever.",
  "I'll go easy on the first point. After that, no promises.",
  "You owe me a game. And probably a beer.",
  "Less talking, more squash. Court's booked.",
  "I've been waiting for this one.",
  "Don't make it weird. Just show up and lose gracefully.",
  "Two words: court. now.",
  "I've seen your drop shot. Needs work. Let me show you.",
  "Brought my A game. Hope you brought yours.",
  "The bar's open after. First round's on the loser.",
  "Nothing personal. Just business. Court business.",
  "Don't worry, I'll shake your hand after.",
  "You've been comfortable up there too long.",
  "Some people train. Some people challenge. Today I do both.",
  "My backhand's been waiting for this.",
  "Fair warning: I've been practising that serve you hate.",
  "The ghost drop doesn't work on me. Just so you know.",
  "Game, sweat, beers. In that order.",
  "Heard you've been on a hot streak. Let's cool that down.",
  "No ragrets. Just squash.",
  "My therapist says I need to win this one.",
  "I'm not saying I'll win easily. Actually yes I am.",
  "You've had a good run up there. Time's up.",
  "Settle it properly. Court. Ball. Bragging rights.",
  "One game. Winner picks the bar.",
  "I've been doing the maths. Your position doesn't add up.",
  "Fancy a friendly? (It won't be friendly.)",
  "Save the excuses for the bar.",
  "The ladder giveth and the ladder taketh away.",
  "Been watching that nick shot of yours. I've got an answer.",
  "May the best player buy the worst player a drink.",
  "Don't overthink it. Just bring your racket.",
  "Last one to the bar pays for everyone.",
  "Your move. Literally.",
  "The court doesn't lie. Let's find out.",
  "I promise to buy you a consolation beer.",
  "Heard you're unbeatable. Challenge accepted.",
  "Light jog, heavy swing, cold beer. Let's go.",
  "I'm feeling lucky. You're feeling nervous. Perfect.",
  "I'll spot you the first two points. Won't matter.",
  "Some rivalries need settling. This is one of them.",
  "Don't let the ranking fool you — this one's personal.",
  "You in? Or are you saving yourself for someone easier?",
  "Clocks ticking. Court's free. What are you waiting for?",
  "Respect the hustle. Fear the volley.",
  "I trained this morning. Did you?",
  "The only thing getting a workout today is your excuse muscle.",
  "One court, two players, one very smug winner.",
  "I've forgiven worse opponents. After they bought me a pint.",
  "Bring water. You'll need it more than I will.",
  "Consider this a friendly intervention.",
  "Your drop shot is a myth. Prove me wrong.",
  "Every champion needs a good nemesis. You're welcome.",
  "Win or lose, the beer tastes the same. Let's find out together.",
  "No mercy. Full respect. Cold beer after.",
  "Some challenges write themselves. This is one of them.",
  "The ladder has spoken. Your number's up.",
  "See you on the other side — by which I mean one place lower.",
  "Game on. First one to the bar wins the important bit.",
  "One of us is buying tonight. Spoiler: it's not me.",
  "You had a good run. Now it's my turn.",
  "Three games, two players, one tab to settle.",
  "Fresh balls, cold beer, warm-up done. You're out of excuses.",
  "Don't worry about the result. Worry about the bar bill.",
  "I've played you in my head all week. You lost every time.",
  "You've been warned. In writing. On a squash app.",
  "The only thing between me and your position is you. Briefly.",
  "Rackets out. Excuses away.",
  "I'll bring the energy. You bring the acceptance.",
  "This isn't personal. Actually it's a little personal.",
  "I'm not celebrating early. The beer's already cold though.",
  "Come on — it's just squash. Famous last words.",
  "Your position has been on my mind. And my mind's made up.",
  "Challenge issued. Clock's ticking. Bar's open."
];

function _applyConfig(cfgData) {
  const rows = cfgData || [];
  const ds = rows.find(r => r.key === 'division_size');
  const cr = rows.find(r => r.key === 'challenge_range');
  if (ds) _ladderDivSize  = parseInt(ds.value, 10);
  if (cr) _challengeRange = parseInt(cr.value, 10);
}

// ── Load challenges ────────────────────────────────────────────────────────
async function _loadChallenges() {
  const { data } = await sb.from('ladder_challenges')
    .select(`id, challenger_id, challenged_id, message, status, issued_at,
             challenger:players!challenger_id(first_name, last_name),
             challenged:players!challenged_id(first_name, last_name)`)
    .in('status', ['pending', 'accepted'])
    .order('issued_at', { ascending: false });
  _activeChallenges = data || [];
}

// ── Home tile injection ────────────────────────────────────────────────────
function _injectLadderHomeCard() {
  const grid = document.getElementById('home-grid');
  if (!grid) return;
  document.getElementById('home-card-division-ladder')?.remove();

  const card = document.createElement('div');
  card.id = 'home-card-division-ladder';
  card.className = 'home-card home-card-divladder';
  card.onclick = () => navTo('division-ladder');

  const challengeHtml = _activeChallenges.length > 0
    ? `<div class="divladder-challenges">
        ${_activeChallenges.slice(0, 3).map(c => {
          const cn = (c.challenger?.first_name || '') + ' ' + ((c.challenger?.last_name || '')[0] || '');
          const dn = (c.challenged?.first_name || '') + ' ' + ((c.challenged?.last_name || '')[0] || '');
          return `<div class="divladder-challenge-row">⚔️ ${cn} vs ${dn}</div>`;
        }).join('')}
      </div>`
    : '';

  card.innerHTML = `
    <div class="home-card-label">Ladders</div>
    <div class="divladder-home-body">
      ${[1,2,3,4].map(d => {
        const start = (d - 1) * _ladderDivSize + 1;
        const top3  = _ladderPositions.filter(p => p.position >= start && p.position <= start + 2);
        const names = top3
          .filter(p => p.players)
          .map(p => `${p.players.first_name} ${(p.players.last_name || '')[0] || ''}`)
          .join(', ') || '—';
        return `<div class="divladder-home-div"><span class="divladder-home-div-label">D${d}</span> ${names}</div>`;
      }).join('')}
    </div>
    ${challengeHtml}`;

  const adminCard = grid.querySelector('.home-card-admin');
  if (adminCard) grid.insertBefore(card, adminCard);
  else grid.appendChild(card);
}

// ── Public view: load + render ─────────────────────────────────────────────
async function loadDivisionLadder() {
  const wrap = document.getElementById('division-ladder-wrap');
  wrap.innerHTML = '<p style="color:#888;padding:16px">Loading…</p>';

  const [posRes, cfgRes] = await Promise.all([
    sb.from('ladder_positions')
      .select('position, player_id, players(id, first_name, last_name, current_handicap)')
      .order('position'),
    sb.from('ladder_config').select('key,value'),
    _loadChallenges()
  ]);

  if (posRes.error) { wrap.innerHTML = `<p style="color:#c00;padding:16px">${posRes.error.message}</p>`; return; }

  _applyConfig(cfgRes.data);
  _ladderPositions = posRes.data || [];

  await _processAutoForfeits();
  renderDivisionLadder();
}

function renderDivisionLadder() {
  const wrap = document.getElementById('division-ladder-wrap');
  const numDivisions = 4;
  const ranked = _ladderPositions;

  const myId  = ST?.player?.id;
  const myPos = ranked.find(p => p.player_id === myId)?.position ?? null;

  const divCards = [];
  for (let d = 1; d <= numDivisions; d++) {
    const start = (d - 1) * _ladderDivSize + 1;
    const end   = d * _ladderDivSize;
    const players = ranked.filter(p => d === numDivisions
      ? p.position >= start
      : p.position >= start && p.position <= end);

    const rows = players.map(p => {
      if (!p.players) return '';
      const first = p.players.first_name || '';
      const last  = (p.players.last_name || '')[0]?.toUpperCase() || '';
      let cls = '', badge = '';
      if (myPos !== null) {
        if (p.player_id === myId) {
          cls = ' div-row-me';
        } else if (p.position < myPos && p.position >= myPos - _challengeRange) {
          cls = ' div-row-can-challenge';
          badge = `<button class="div-challenge-btn"
            onclick="event.stopPropagation();_issueChallengeForm('${p.player_id}','${first} ${last}',${p.position})"
            title="Challenge ${first}">⚔️</button>`;
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

  // Build challenge list html
  const myIsAdmin = ST?.player?.is_admin || ST?.player?.is_super_admin;
  const challengeListHtml = _activeChallenges.length > 0
    ? `<div class="challenge-list">
        <div class="challenge-list-header">Active Challenges</div>
        ${_activeChallenges.map(c => {
          const cn = (c.challenger?.first_name || '') + ' ' + ((c.challenger?.last_name || '')[0] || '');
          const dn = (c.challenged?.first_name || '') + ' ' + ((c.challenged?.last_name || '')[0] || '');
          const canAct = myId && (c.challenger_id === myId || c.challenged_id === myId || myIsAdmin);
          const statusCls = c.status === 'accepted' ? ' accepted' : '';
          const statusLabel = c.status === 'accepted' ? 'Accepted' : 'Pending';
          const issuedDate = c.issued_at ? new Date(c.issued_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
          return `<div class="challenge-row${canAct ? '' : ' display-only'}"
            ${canAct ? `onclick="openChallengeResult('${c.id}')"` : ''}>
            <span class="challenge-row-names">⚔️ ${cn} vs ${dn}</span>
            <span class="challenge-status-badge${statusCls}">${statusLabel}</span>
            <span class="challenge-date">${issuedDate}</span>
          </div>`;
        }).join('')}
      </div>`
    : '';

  wrap.innerHTML = `
    <div class="ladder-banner">
      <strong>Throw down a challenge!</strong> Ladders are currently updated by David B., so let him know if any movements.
    </div>
    <div class="div-ladder-grid">${divCards.join('')}</div>
    <div class="ladder-banner">
      <strong>Rules of Engagement</strong>
      <ol class="ladder-rules">
        <li>Winner takes loser's place. Loser goes down 1 place.</li>
        <li>Can't refuse a challenge (else you slip a place!)</li>
        <li>Not required to do more than 1 challenge per session.</li>
        <li>You can challenge up to <strong>${_challengeRange}</strong> place${_challengeRange !== 1 ? 's' : ''} above you.</li>
      </ol>
    </div>
    ${challengeListHtml}`;
}

// ── Issue a challenge ──────────────────────────────────────────────────────
function _issueChallengeForm(targetId, targetName, targetPos) {
  const msg = CHALLENGE_MESSAGES[Math.floor(Math.random() * CHALLENGE_MESSAGES.length)];
  showFormModal(`⚔️ Challenge ${targetName}`, `
    <p style="margin-bottom:12px">Send a challenge to <strong>${targetName}</strong> (position ${targetPos}).</p>
    <div class="form-group">
      <label>Message (editable)</label>
      <textarea id="challenge-msg" rows="2" style="width:100%;padding:8px;border:1.5px solid #cbd5e1;border-radius:6px;font-size:13px;resize:vertical">${msg}</textarea>
    </div>
    <div id="challenge-form-error" class="error-msg" style="margin-bottom:8px"></div>
    <button class="btn-primary" style="width:100%;margin-top:4px" onclick="submitChallenge('${targetId}')">Send Challenge ⚔️</button>
  `);
}

async function submitChallenge(targetId) {
  const msg = document.getElementById('challenge-msg')?.value.trim();
  const err = document.getElementById('challenge-form-error');
  const { error } = await sb.from('ladder_challenges').insert({
    challenger_id: ST.player.id,
    challenged_id: targetId,
    message: msg || null,
    status: 'pending'
  });
  if (error) { if (err) err.textContent = error.message; return; }
  closeFormModal();
  await _loadChallenges();
  renderDivisionLadder();
  _injectLadderHomeCard();
}

// ── Pending challenge popup (shown once per session on home load) ───────────
function _checkPendingChallenges() {
  if (_challengesNotified || !ST?.player) return;
  _challengesNotified = true;
  const myId = ST.player.id;
  const pending = _activeChallenges.filter(c => c.challenged_id === myId && c.status === 'pending');
  if (pending.length === 0) return;
  const c = pending[0];
  const challengerName = `${c.challenger?.first_name || ''} ${c.challenger?.last_name || ''}`.trim();
  const issuedDate = c.issued_at
    ? new Date(c.issued_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  const moreNote = pending.length > 1
    ? `<p style="font-size:12px;color:#64748b;margin-top:8px">+${pending.length - 1} more challenge${pending.length > 2 ? 's' : ''} — view in Ladders</p>`
    : '';
  showFormModal('⚔️ You\'ve Been Challenged!', `
    <div style="text-align:center;padding:4px 0">
      <p style="font-size:15px;margin-bottom:8px"><strong>${challengerName}</strong> has challenged you!</p>
      ${c.message ? `<p style="color:#64748b;font-style:italic;margin-bottom:10px">"${c.message}"</p>` : ''}
      <p style="font-size:12px;color:#94a3b8;margin-bottom:16px">Issued ${issuedDate}</p>
      <div style="display:flex;gap:8px;justify-content:center">
        <button class="btn-primary" style="flex:1" onclick="respondToChallenge('${c.id}', true)">Accept</button>
        <button class="btn-secondary" style="flex:1" onclick="respondToChallenge('${c.id}', false)">Decline</button>
      </div>
      <p style="font-size:11px;color:#ef4444;margin-top:10px">⚠️ Declining costs you one place on the ladder</p>
      ${moreNote}
    </div>
  `);
}

async function respondToChallenge(challengeId, accept) {
  if (!accept) {
    const ok = confirm('Are you sure you want to decline? You will lose one place on the ladder.');
    if (!ok) return;
  }
  const now = new Date().toISOString();
  const { error } = await sb.from('ladder_challenges')
    .update({ status: accept ? 'accepted' : 'declined', responded_at: now })
    .eq('id', challengeId);
  if (error) { alert(error.message); return; }

  if (!accept) {
    await _applyOnePlaceDrop(ST.player.id);
  }

  closeFormModal();
  await _loadChallenges();
  _injectLadderHomeCard();
}

// ── Record match result ────────────────────────────────────────────────────
function openChallengeResult(challengeId) {
  const c = _activeChallenges.find(x => x.id === challengeId);
  if (!c) return;
  const cn = `${c.challenger?.first_name || ''} ${c.challenger?.last_name || ''}`.trim();
  const dn = `${c.challenged?.first_name || ''} ${c.challenged?.last_name || ''}`.trim();
  const issuedDate = c.issued_at
    ? new Date(c.issued_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : '';
  showFormModal('Record Challenge Result', `
    <p style="text-align:center;margin-bottom:16px;color:#64748b;font-size:13px">
      ⚔️ ${cn} vs ${dn} &nbsp;·&nbsp; ${issuedDate}
    </p>
    <p style="text-align:center;font-weight:700;margin-bottom:12px">Who won?</p>
    <div style="display:flex;gap:8px">
      <button class="btn-primary" style="flex:1;padding:12px 8px"
        onclick="submitChallengeResult('${challengeId}','${c.challenger_id}')">🏆 ${cn}</button>
      <button class="btn-primary" style="flex:1;padding:12px 8px"
        onclick="submitChallengeResult('${challengeId}','${c.challenged_id}')">🏆 ${dn}</button>
    </div>
    <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:12px">
      This will update ladder positions immediately.
    </p>
  `);
}

async function submitChallengeResult(challengeId, winnerId) {
  const c = _activeChallenges.find(x => x.id === challengeId);
  if (!c) return;
  const loserId = winnerId === c.challenger_id ? c.challenged_id : c.challenger_id;
  const { error } = await sb.from('ladder_challenges').update({
    status: 'completed',
    winner_id: winnerId,
    result_recorded_by: ST.player.id,
    completed_at: new Date().toISOString()
  }).eq('id', challengeId);
  if (error) { alert(error.message); return; }
  await _applyLadderResult(winnerId, loserId);
  closeFormModal();
  await loadDivisionLadder();
  _injectLadderHomeCard();
}

// ── Position update helpers ────────────────────────────────────────────────
async function _applyLadderResult(winnerId, loserId) {
  const { data: pos } = await sb.from('ladder_positions')
    .select('player_id, position').order('position');
  if (!pos) return;
  const winnerRow = pos.find(p => p.player_id === winnerId);
  const loserRow  = pos.find(p => p.player_id === loserId);
  if (!winnerRow || !loserRow) return;
  const winnerPos = winnerRow.position;
  const loserPos  = loserRow.position;

  let updates;
  if (winnerPos > loserPos) {
    // Challenger won: cascade — winner takes loser's spot, everyone between shifts down 1
    updates = pos.map(p => {
      if (p.player_id === winnerId) return { player_id: p.player_id, position: loserPos };
      if (p.position >= loserPos && p.position < winnerPos) return { player_id: p.player_id, position: p.position + 1 };
      return p;
    });
  } else {
    // Challenged won: loser (challenger) drops 1, player directly below moves up
    updates = pos.map(p => {
      if (p.player_id === loserId)       return { player_id: p.player_id, position: loserPos + 1 };
      if (p.position === loserPos + 1)   return { player_id: p.player_id, position: loserPos };
      return p;
    });
  }
  await _savePositions(updates);
}

async function _applyOnePlaceDrop(playerId) {
  const { data: pos } = await sb.from('ladder_positions')
    .select('player_id, position').order('position');
  if (!pos) return;
  const cur = pos.find(p => p.player_id === playerId);
  if (!cur) return;
  const updates = pos.map(p => {
    if (p.player_id === playerId)          return { player_id: p.player_id, position: cur.position + 1 };
    if (p.position === cur.position + 1)   return { player_id: p.player_id, position: cur.position };
    return p;
  });
  await _savePositions(updates);
}

async function _savePositions(updates) {
  const now = new Date().toISOString();
  await sb.from('ladder_positions').delete().gte('position', 0);
  await sb.from('ladder_positions').insert(
    updates.map(p => ({ player_id: p.player_id, position: p.position, updated_at: now }))
  );
  const { data } = await sb.from('ladder_positions')
    .select('position, player_id, players(id, first_name, last_name, current_handicap)')
    .order('position');
  _ladderPositions = data || [];
}

// ── Auto-forfeit ───────────────────────────────────────────────────────────
async function _processAutoForfeits() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const expired = _activeChallenges.filter(c => c.status === 'pending' && c.issued_at < cutoff);
  for (const c of expired) {
    await sb.from('ladder_challenges').update({
      status: 'forfeited',
      winner_id: c.challenger_id,
      completed_at: new Date().toISOString()
    }).eq('id', c.id);
    await _applyLadderResult(c.challenger_id, c.challenged_id);
  }
  if (expired.length > 0) await _loadChallenges();
}

// ── Admin reorder ──────────────────────────────────────────────────────────
async function loadLadderAdmin() {
  const wrap = document.getElementById('tab-ladder');
  if (!wrap) return;
  wrap.innerHTML = '<p style="color:#888;padding:16px">Loading…</p>';

  const [posRes, playersRes, cfgRes] = await Promise.all([
    sb.from('ladder_positions')
      .select('position, player_id, players(id, first_name, last_name, current_handicap)')
      .order('position'),
    sb.from('players').select('id,first_name,last_name,current_handicap').eq('active', true).order('first_name'),
    sb.from('ladder_config').select('key,value')
  ]);

  if (posRes.error || playersRes.error) {
    wrap.innerHTML = `<p style="color:#c00;padding:16px">${(posRes.error || playersRes.error).message}</p>`;
    return;
  }

  _applyConfig(cfgRes.data);
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
    <div class="ladder-config-row">
      <label class="ladder-cfg-label">Division size
        <input type="number" id="cfg-div-size" class="ladder-cfg-input" value="${_ladderDivSize}" min="1" max="20">
      </label>
      <label class="ladder-cfg-label">Challenge range
        <input type="number" id="cfg-challenge-range" class="ladder-cfg-input" value="${_challengeRange}" min="1" max="10">
      </label>
      <button class="btn-secondary" onclick="saveAdminConfig()" style="align-self:flex-end">Save Settings</button>
      <span id="cfg-save-msg" style="font-size:12px;color:#15803d;align-self:flex-end"></span>
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
let _ladderDragSrcIdx  = null;
let _ladderPoolDragIdx = null;

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
async function saveAdminConfig() {
  const ds  = parseInt(document.getElementById('cfg-div-size')?.value, 10);
  const cr  = parseInt(document.getElementById('cfg-challenge-range')?.value, 10);
  const msg = document.getElementById('cfg-save-msg');
  if (!ds || !cr || ds < 1 || cr < 1) { if (msg) msg.textContent = 'Invalid values'; return; }
  const rows = [
    { key: 'division_size',   value: String(ds) },
    { key: 'challenge_range', value: String(cr) }
  ];
  const { error } = await sb.from('ladder_config').upsert(rows, { onConflict: 'key' });
  if (error) { if (msg) { msg.style.color = '#dc2626'; msg.textContent = error.message; } return; }
  _ladderDivSize  = ds;
  _challengeRange = cr;
  if (msg) { msg.style.color = '#15803d'; msg.textContent = 'Saved'; setTimeout(() => { msg.textContent = ''; }, 2000); }
  renderLadderAdmin();
}

async function saveLadderOrder() {
  const msg = document.getElementById('ladder-save-msg');
  if (msg) msg.textContent = 'Saving…';
  const rows = _ladderInList.map((playerId, i) => ({
    player_id: playerId,
    position: i + 1,
    updated_at: new Date().toISOString()
  }));
  const { error: delErr } = await sb.from('ladder_positions').delete().gte('position', 0);
  if (delErr) {
    if (msg) { msg.style.color = '#dc2626'; msg.textContent = `Error: ${delErr.message}`; }
    return;
  }
  if (rows.length > 0) {
    const { error: insErr } = await sb.from('ladder_positions').insert(rows);
    if (insErr) {
      if (msg) { msg.style.color = '#dc2626'; msg.textContent = `Error: ${insErr.message}`; }
      return;
    }
  }
  _ladderPositions = rows.map(r => ({
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
