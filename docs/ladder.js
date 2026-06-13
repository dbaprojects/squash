// ── Division Ladder (Phase 1 + 2) ────────────────────────────────────────────
// Loaded after app.js in both index.html (production) and dev.html.
// Challenge system promoted to production.

const _CHALLENGES_ENABLED = true;

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
    // Clear stale state so previous user's data doesn't linger
    _ladderPositions = [];
    _activeChallenges = [];
    _myChallenges = [];
    _recentCompleted = [];
    _serialGhosters = new Set();
    _snailBadges = new Set();
    _jumpedBadges = new Set();
    _notifiedChallengeIds = new Set();
    const basePromises = [
      _origLoadHome(),
      sb.from('ladder_positions')
        .select('position, player_id, players(id, first_name, last_name, current_handicap)')
        .order('position'),
      sb.from('ladder_config').select('key,value'),
    ];
    if (_CHALLENGES_ENABLED) {
      basePromises.push(_loadChallenges());
      basePromises.push(_loadMyChallenges());
    }
    const [, posRes, cfgRes] = await Promise.all(basePromises);
    _applyConfig(cfgRes.data);
    _ladderPositions = posRes.data || [];
    _injectLadderHomeCard();
    if (_CHALLENGES_ENABLED) {
      _injectMyChallenges();
      _checkPendingChallenges();
    }
  };

  // ── Patch closeFormModal — block close when modal is locked ───────────
  if (_CHALLENGES_ENABLED) {
    const _origCloseFormModal = closeFormModal;
    closeFormModal = function () {
      if (_formModalLocked) return;
      _origCloseFormModal();
    };
  }

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
let _serialGhosters   = new Set();
let _snailBadges      = new Set();
let _jumpedBadges     = new Set();
let _ladderInList     = [];
let _ladderPool       = [];
let _ladderAllPlayers = [];
let _activeChallenges  = [];
let _submittingChallenge = false;
let _recentCompleted   = [];
let _myChallenges      = [];
let _resultsFilter     = 'all';
let _formModalLocked   = false;
let _notifiedChallengeIds = new Set();

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

// D1 uses base range; each lower division gets +1. Effective range is
// determined by the TARGET's division, so crossing up uses the higher div's
// (smaller) range as the cap.
function _divOf(pos) {
  return Math.ceil(pos / _ladderDivSize);
}
function _divRange(div) {
  return _challengeRange + (div - 1);
}
function _canChallenge(myPos, targetPos) {
  if (targetPos >= myPos) return false;
  const effectiveRange = _divRange(_divOf(targetPos));
  return targetPos >= myPos - effectiveRange;
}

// ── Load challenges ────────────────────────────────────────────────────────
async function _loadChallenges() {
  const [activeRes, completedRes] = await Promise.all([
    sb.from('ladder_challenges')
      .select(`id, challenger_id, challenged_id, message, status, issued_at, responded_at,
               challenger:players!challenger_id(first_name, last_name),
               challenged:players!challenged_id(first_name, last_name)`)
      .in('status', ['pending', 'accepted'])
      .order('issued_at', { ascending: false }),
    sb.from('ladder_challenges')
      .select(`id, challenger_id, challenged_id, status, completed_at, responded_at, winner_id, winner_pos_change,
               challenger:players!challenger_id(first_name, last_name),
               challenged:players!challenged_id(first_name, last_name)`)
      .in('status', ['completed', 'forfeited', 'declined', 'declined_injury', 'voided', 'superseded'])
      .order('completed_at', { ascending: false })
  ]);
  _activeChallenges = activeRes.data || [];
  _recentCompleted  = completedRes.data || [];
  _rebuildSerialGhosters();
  _rebuildSnailBadges();
  _rebuildJumpedBadges();
}

function _rebuildSerialGhosters() {
  _serialGhosters = new Set();
  const byPlayer = {};
  for (const c of _recentCompleted) {
    if (!byPlayer[c.challenged_id]) byPlayer[c.challenged_id] = [];
    byPlayer[c.challenged_id].push(c); // already sorted desc by completed_at
  }
  for (const [pid, challenges] of Object.entries(byPlayer)) {
    const recent = challenges.slice(0, 3);
    if (recent.length >= 3 && recent.every(c => c.status === 'forfeited')) {
      _serialGhosters.add(pid);
    }
  }
}

function _isSerialGhoster(playerId) {
  return _serialGhosters.has(playerId);
}

function _rebuildSnailBadges() {
  _snailBadges = new Set();
  // For each player, look at their most recent challenge as *challenger*.
  // If it's voided → 🐌. Any other terminal status clears it.
  const latestAsChallengerByPlayer = {};
  for (const c of _recentCompleted) {
    if (!latestAsChallengerByPlayer[c.challenger_id]) {
      latestAsChallengerByPlayer[c.challenger_id] = c;
    }
  }
  for (const [pid, c] of Object.entries(latestAsChallengerByPlayer)) {
    if (c.status === 'voided') _snailBadges.add(pid);
  }
}

function _isSnailBadged(playerId) {
  return _snailBadges.has(playerId);
}

function _rebuildJumpedBadges() {
  _jumpedBadges = new Set();
  // For each player, look at their most recent challenge as *challenged*.
  // If it's superseded (challenger won another match and leapt above them
  // before this match was played) → 🦘 "got jumped". Any other terminal status clears it.
  const latestAsChallengedByPlayer = {};
  for (const c of _recentCompleted) {
    if (!latestAsChallengedByPlayer[c.challenged_id]) {
      latestAsChallengedByPlayer[c.challenged_id] = c;
    }
  }
  for (const [pid, c] of Object.entries(latestAsChallengedByPlayer)) {
    if (c.status === 'superseded') _jumpedBadges.add(pid);
  }
}

function _isJumped(playerId) {
  return _jumpedBadges.has(playerId);
}

// Called after any ladder reshuffle: void all active challenges now out of range.
// Challengers whose challenge gets voided earn a 🐌 badge.
async function _voidOutOfRangeChallenges() {
  const outOfRange = _activeChallenges.filter(c => {
    const myPos     = _ladderPositions.find(p => p.player_id === c.challenger_id)?.position;
    const targetPos = _ladderPositions.find(p => p.player_id === c.challenged_id)?.position;
    if (!myPos || !targetPos) return false;
    return !_canChallenge(myPos, targetPos);
  });
  if (outOfRange.length === 0) return;
  const now = new Date().toISOString();
  for (const c of outOfRange) {
    await sb.from('ladder_challenges').update({ status: 'voided', completed_at: now }).eq('id', c.id);
  }
}

// Called after a win cascade: the winner may have leapt above players they
// also had a live challenge with. Those matches will never be played, so mark
// them 'superseded' (the challenged player "got jumped" 🦘). Distinct from
// 'voided'/🐌 — the winner caused this by winning, so they get no snail penalty.
// excludeId skips the just-recorded challenge itself.
async function _supersedeJumpedChallenges(winnerId, excludeId) {
  const winnerPos = _ladderPositions.find(p => p.player_id === winnerId)?.position;
  if (!winnerPos) return;
  const jumped = _activeChallenges.filter(c => {
    if (c.id === excludeId) return false;
    if (c.challenger_id !== winnerId) return false;
    const targetPos = _ladderPositions.find(p => p.player_id === c.challenged_id)?.position;
    if (!targetPos) return false;
    return !_canChallenge(winnerPos, targetPos);
  });
  if (jumped.length === 0) return;
  const now = new Date().toISOString();
  for (const c of jumped) {
    await sb.from('ladder_challenges').update({ status: 'superseded', completed_at: now }).eq('id', c.id);
  }
}

async function _demoteToLastPlace(playerId) {
  const sorted = [..._ladderPositions].sort((a, b) => a.position - b.position);
  const idx = sorted.findIndex(p => p.player_id === playerId);
  if (idx === -1 || idx === sorted.length - 1) return; // not found or already last
  const [removed] = sorted.splice(idx, 1);
  sorted.push(removed);
  const updates = sorted.map((p, i) => ({ player_id: p.player_id, position: i + 1 }));
  await _savePositions(updates);
}

async function _loadMyChallenges() {
  if (!ST?.player?.id) return;
  const myId = ST.player.id;
  const { data } = await sb.from('ladder_challenges')
    .select(`id, challenger_id, challenged_id, status, issued_at, responded_at, winner_id,
             challenger:players!challenger_id(first_name, last_name),
             challenged:players!challenged_id(first_name, last_name)`)
    .or(`challenger_id.eq.${myId},challenged_id.eq.${myId}`)
    .order('issued_at', { ascending: false })
    .limit(6);
  _myChallenges = data || [];
}

// ── Home tile injection ────────────────────────────────────────────────────
const _QUIPS_ACTIVE = [
  "Get 'em tiger", "Game face on!", "Make it count", "Court's calling",
  "Show no mercy", "Time to shine", "Let's settle this", "Bring the heat",
  "No pressure... loads of it", "You've got this", "They won't see it coming",
  "Eyes on the prize", "It's go time", "Ready? Thought so",
  "Sweat now, beer later", "Winners make moves", "Smash it",
  "Inner champion time", "Racket up, let's go", "Someone's buying tonight",
  "Go bring it home", "Fear no one", "Play hard, drink harder",
  "Own the court", "Do it for the beer", "Today's the day",
  "No backing down now", "This is your moment", "They're nervous. Good.",
  "Take their spot", "Leave it all on court", "Handle it",
  "Hunger game time", "Believe", "All in", "Win it",
  "Sorted. Now go win.", "Make the move", "That spot's yours for taking",
  "One of you owes a beer"
];
const _QUIPS_IDLE = [
  "C'mon then, step up", "The ladder won't climb itself",
  "Move up or move over", "Fortune favours the bold",
  "What are you waiting for?", "Go on, make a move",
  "That spot won't hold itself", "Pick a fight, win a beer",
  "Your move, squash hero", "Don't be shy",
  "They're yours for the taking", "Tick tock, climb the clock",
  "Comfort zone? Overrated", "Make them nervous", "Prove something",
  "Challenge or be challenged", "Move or be moved", "Go shake things up",
  "Waiting changes nothing", "The brave get the beer",
  "Aim higher", "Don't let them relax", "Time to stir the pot",
  "You're better than this", "Someone needs a knock",
  "Strike while you can", "Make your mark", "Shake the ladder up",
  "Progress means moving up", "You know you want to",
  "Won't climb itself", "Channel that hunger", "Hungry? Take a spot.",
  "Be the bully today", "They're not scared enough",
  "Go on — they deserve it", "Still waiting? Really?",
  "Climb now, boast later", "Spot up there. Your name on it.",
  "No excuses, only excuses"
];
const _ICONS_ACTIVE = ['🔥','💪','👊','⚡','🎯','🚀','😤','🦁','🐯','🏆','💥','🤜','🥊','🌟','👑','🏋️','⚔️','🍺','🤩','😈'];
const _ICONS_IDLE   = ['👀','🤔','⬆️','🏃','🧗','⏰','😏','🗣️','🐔','💨','🔝','👆','😬','🙄','😤','🤷','🫵','👻','🎯','🥱'];
function _rndQuip(quips, icons) {
  const q = quips[Math.floor(Math.random() * quips.length)];
  const i = icons[Math.floor(Math.random() * icons.length)];
  return `<span>${i}</span><em>${q}</em><span>${i}</span>`;
}
function _cr(iconL, nameL, iconR, nameR) {
  return `<div class="divladder-challenge-row"><span class="dlcr-ic">${iconL}</span><span class="dlcr-nl">${nameL}</span><span class="dlcr-v">v</span><span class="dlcr-nr">${nameR}</span><span class="dlcr-ic">${iconR}</span></div>`;
}

function _divGridHtml() {
  return `<div class="divladder-home-body">
    ${[1,2,3,4].map(d => {
      const start = (d - 1) * _ladderDivSize + 1;
      const top3  = _ladderPositions.filter(p => p.position >= start && p.position <= start + 2);
      const names = top3
        .filter(p => p.players)
        .map(p => `${p.players.first_name} ${(p.players.last_name || '')[0] || ''}`)
        .join(', ') || '—';
      return `<div class="divladder-home-div"><span class="divladder-home-div-label">D${d}</span> ${names}</div>`;
    }).join('')}
  </div>`;
}

function _injectLadderHomeCard() {
  const grid = document.getElementById('home-grid');
  if (!grid) return;
  document.getElementById('home-card-division-ladder')?.remove();

  const card = document.createElement('div');
  card.id = 'home-card-division-ladder';
  card.className = 'home-card home-card-divladder';
  card.onclick = () => navTo('division-ladder');

  let bodyHtml = '';

  if (_CHALLENGES_ENABLED) {
    const myId  = ST?.player?.id;
    const myPos = myId ? (_ladderPositions.find(p => p.player_id === myId)?.position ?? null) : null;

    if (myPos === null) {
      // Not on ladder — show D1-D4 grid + nudge
      bodyHtml = _divGridHtml() + `<div class="ladder-signup-nudge">Don't be shy — sign up! Ping David B 🏃</div>`;
    } else {
      const fn1 = obj => `${obj?.first_name || ''} ${(obj?.last_name || '')[0] || ''}`.trim();

      // IDs of players already in an active challenge with me
      const myActivePairIds = new Set(
        _activeChallenges
          .filter(c => c.challenger_id === myId || c.challenged_id === myId)
          .map(c => c.challenger_id === myId ? c.challenged_id : c.challenger_id)
      );

      // Players within challenge range above me who aren't already matched with me
      const challengeable = _ladderPositions.filter(p =>
        p.players &&
        _canChallenge(myPos, p.position) &&
        !myActivePairIds.has(p.player_id)
      );

      // My active (pending + accepted) challenges
      const myActive = _activeChallenges.filter(c =>
        c.challenger_id === myId || c.challenged_id === myId
      );

      const quipUrgent = myActive.length === 0;
      const quip = _rndQuip(quipUrgent ? _QUIPS_IDLE : _QUIPS_ACTIVE,
                            quipUrgent ? _ICONS_IDLE : _ICONS_ACTIVE);

      let rows = '';
      if (myActive.length > 0) {
        rows += `<div class="divladder-section-label" style="padding:0 2px;margin-top:6px">My challenges</div>`;
        rows += `<div class="dlhc-tiles">` + myActive.map(c => {
          const opp  = c.challenger_id === myId ? c.challenged : c.challenger;
          return `<div class="dlhc-tile dlhc-active"><span class="dlhc-tile-name">${fn1(opp)}</span></div>`;
        }).join('') + `</div>`;
      }

      if (challengeable.length > 0) {
        rows += `<div class="divladder-section-label" style="padding:0 2px;margin-top:${myActive.length ? 6 : 6}px">Can challenge</div>`;
        rows += `<div class="dlhc-tiles">` + challengeable.map(p => `<div class="dlhc-tile dlhc-can">`
          + `<span class="dlhc-tile-name">${fn1(p.players)}${_isSerialGhoster(p.player_id) ? ' 👻' : ''}${_isSnailBadged(p.player_id) ? ' 🐌' : ''}${_isJumped(p.player_id) ? ' 🦘' : ''}</span>`
          + `</div>`).join('') + `</div>`;
      }

      rows += `<div class="dlhc-quip${quipUrgent ? ' dlhc-quip--urgent' : ''}">${quip}</div>`;

      bodyHtml = `<div class="dlhc-rows">${rows}</div>`;
    }
  } else {
    // prod: D1-D4 grid + any active challenges (global)
    bodyHtml = _divGridHtml();
    if (_activeChallenges.length > 0) {
      bodyHtml += `<div class="divladder-challenges">
        ${_activeChallenges.slice(0, 6).map(c => {
          const cn = (c.challenger?.first_name || '') + ' ' + ((c.challenger?.last_name || '')[0] || '');
          const dn = (c.challenged?.first_name || '') + ' ' + ((c.challenged?.last_name || '')[0] || '');
          return _cr('⚔️', cn, '⚔️', dn);
        }).join('')}
      </div>`;
    }
  }

  card.innerHTML = `
    <div class="home-card-label" style="${_CHALLENGES_ENABLED ? 'text-align:center' : ''}">${_CHALLENGES_ENABLED ? '<span style="font-size:22px">🍺</span> LADDERS <span style="font-size:22px">⚔️</span>' : 'Ladders'}</div>
    ${bodyHtml}
    <div style="font-size:11px;color:#64748b;text-align:center;padding:4px 10px 6px">Click for Ladder Action →</div>`;

  const hcCard = grid.querySelector('.home-card-ladder');
  if (hcCard) grid.insertBefore(card, hcCard);
  else grid.appendChild(card);
}

// ── Elapsed-time since a timestamp — "3d 4h", "5h", "20m", "just now" ───────
function _elapsed(dateStr) {
  if (!dateStr) return '';
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 0) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return remHrs ? `${days}d ${remHrs}h` : `${days}d`;
}

// ── Me tile: inject my personal challenges ─────────────────────────────────
function _myChallengeStatusLabel(c, myId) {
  const isMe = id => id === myId;
  switch (c.status) {
    case 'pending':          return '<span style="color:#fbbf24;font-weight:700">Pending</span>';
    case 'accepted':         return '<span style="color:#86efac;font-weight:700">Accepted</span>';
    case 'declined':         return '<span style="color:#fca5a5;font-weight:700">Declined ↓</span>';
    case 'declined_injury':  return '<span style="color:#fdba74;font-weight:700">🩹 Injury</span>';
    case 'completed':
      return isMe(c.winner_id)
        ? '<span style="color:#86efac;font-weight:700">Won 🏆</span>'
        : '<span style="color:rgba(255,255,255,.5);font-weight:700">Lost</span>';
    case 'forfeited':
      return isMe(c.winner_id)
        ? '<span style="color:#86efac;font-weight:700">Won (forfeit)</span>'
        : '<span style="color:rgba(255,255,255,.5);font-weight:700">Forfeited</span>';
    case 'withdrawn':         return '<span style="color:rgba(255,255,255,.4);font-weight:700">Withdrawn</span>';
    default: return `<span style="color:rgba(255,255,255,.5)">${c.status}</span>`;
  }
}

function _injectMyChallenges() {
  if (!ST?.player?.id) return;
  const meCard = document.querySelector('#home-grid .home-card-me');
  if (!meCard) return;
  meCard.querySelector('.me-challenges-wrap')?.remove();
  if (_myChallenges.length === 0) return;
  const myId = ST.player.id;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const active = _myChallenges.filter(c => {
    if (c.status === 'declined_injury') return c.issued_at >= sevenDaysAgo;
    return ['pending', 'accepted'].includes(c.status);
  });
  if (active.length === 0) return;
  const rows = active.slice(0, 3).map(c => {
    const opp = c.challenger_id === myId ? c.challenged : c.challenger;
    const oppName = `${opp?.first_name || ''} ${(opp?.last_name || '')[0] || ''}`.trim();
    const statusHtml = _myChallengeStatusLabel(c, myId);
    const stampSrc = c.status === 'accepted' ? (c.responded_at || c.issued_at) : c.issued_at;
    const ago = _elapsed(stampSrc);
    const agoHtml = ago ? `<span class="me-challenge-ago"> · ${ago}</span>` : '';
    return `<div class="me-challenge-row">vs ${oppName} · ${statusHtml}${agoHtml}</div>`;
  }).join('');
  const wrap = document.createElement('div');
  wrap.className = 'me-challenges-wrap';
  wrap.innerHTML = rows;
  wrap.onclick = e => { e.stopPropagation(); navTo('division-ladder'); };
  const link = meCard.querySelector('.home-card-link');
  if (link) meCard.insertBefore(wrap, link);
  else meCard.appendChild(wrap);
}

// ── Public view: load + render ─────────────────────────────────────────────
async function loadDivisionLadder() {
  const wrap = document.getElementById('division-ladder-wrap');
  wrap.innerHTML = '<p style="color:#888;padding:16px">Loading…</p>';

  const promises = [
    sb.from('ladder_positions')
      .select('position, player_id, players(id, first_name, last_name, current_handicap)')
      .order('position'),
    sb.from('ladder_config').select('key,value'),
  ];
  if (_CHALLENGES_ENABLED) promises.push(_loadChallenges());

  const [posRes, cfgRes] = await Promise.all(promises);

  if (posRes.error) { wrap.innerHTML = `<p style="color:#c00;padding:16px">${posRes.error.message}</p>`; return; }

  _applyConfig(cfgRes.data);
  _ladderPositions = posRes.data || [];

  if (_CHALLENGES_ENABLED) await _processAutoForfeits();
  renderDivisionLadder();
}

function setLadderResultsFilter(f) {
  _resultsFilter = f;
  _renderResultsList();
}

function _renderResultsList() {
  const el = document.getElementById('challenge-results-list');
  if (!el) return;
  const myId = ST?.player?.id;

  let filtered;
  switch (_resultsFilter) {
    case 'played':   filtered = _recentCompleted.filter(c => c.status === 'completed'); break;
    case 'declined': filtered = _recentCompleted.filter(c => c.status === 'declined'); break;
    case 'forfeit':  filtered = _recentCompleted.filter(c => c.status === 'forfeited'); break;
    case 'injury':   filtered = _recentCompleted.filter(c => c.status === 'declined_injury'); break;
    case 'voided':   filtered = _recentCompleted.filter(c => c.status === 'voided'); break;
    case 'jumped':   filtered = _recentCompleted.filter(c => c.status === 'superseded'); break;
    default:         filtered = _recentCompleted;
  }

  const sel = document.getElementById('results-filter-sel');
  if (sel) sel.value = _resultsFilter;

  if (filtered.length === 0) {
    el.innerHTML = '<div class="ch-empty">No results</div>';
    return;
  }
  el.innerHTML = filtered.map(c => {
    const cn = (c.challenger?.first_name || '') + ' ' + ((c.challenger?.last_name || '')[0] || '');
    const dn = (c.challenged?.first_name || '') + ' ' + ((c.challenged?.last_name || '')[0] || '');
    const date = (c.completed_at || c.responded_at)
      ? new Date(c.completed_at || c.responded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : '';
    let label;
    switch (c.status) {
      case 'completed': {
        const wn = c.winner_id === c.challenger_id ? cn : dn;
        const ln = c.winner_id === c.challenger_id ? dn : cn;
        label = `🍺 ${wn} 😢 ${ln}`; break;
      }
      case 'declined':        label = `🐔 ${dn} dodged 🍺 ${cn}`; break;
      case 'declined_injury': label = `🩹 ${dn} claimed injury vs ${cn}`; break;
      case 'forfeited': {
        const wn = c.winner_id === c.challenger_id ? cn : dn;
        const ln = c.winner_id === c.challenger_id ? dn : cn;
        label = `🍺 ${wn} 👻 ${ln} ghosted`; break;
      }
      case 'voided': label = `🐌 ${cn} challenge voided`; break;
      case 'superseded': label = `🦘 ${dn} got jumped!`; break;
      default: label = `⚔️ ${cn} v ${dn}`;
    }
    return `<div class="ch-res-row">
      <div class="ch-res-names">${label}</div>
      <div class="challenge-date">${date}</div>
    </div>`;
  }).join('');
}

function renderDivisionLadder() {
  const wrap = document.getElementById('division-ladder-wrap');
  const numDivisions = 4;
  const ranked = _ladderPositions;

  const myId  = ST?.player?.id;
  const myPos = ranked.find(p => p.player_id === myId)?.position ?? null;

  // Build challenge maps (dev/challenges only)
  const myOutgoingMap = {};
  const myIncomingMap = {};
  if (_CHALLENGES_ENABLED && myId) {
    for (const c of _activeChallenges) {
      if (c.challenger_id === myId) myOutgoingMap[c.challenged_id] = c;
      else if (c.challenged_id === myId) myIncomingMap[c.challenger_id] = c;
    }
  }

  // Build most-recent-result icon map per player (skip injury/pending)
  const recentIconMap = {};
  for (const c of _recentCompleted) {
    const relevant = c.status === 'completed' || c.status === 'forfeited' || c.status === 'declined';
    if (!relevant) continue;
    for (const pid of [c.challenger_id, c.challenged_id]) {
      if (recentIconMap[pid]) continue; // already have most recent
      let icon = '';
      if (c.status === 'completed')  icon = c.winner_id === pid ? '🍺' : '😢';
      else if (c.status === 'forfeited') icon = c.winner_id === pid ? '🍺' : '👻';
      else if (c.status === 'declined')  icon = c.challenged_id === pid ? '🐔' : '🍺';
      if (icon) recentIconMap[pid] = icon;
    }
  }

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
      const hc    = p.players.current_handicap != null ? ` (${p.players.current_handicap})` : '';
      let cls = '', badge = '', rowClick = '';
      if (myPos !== null) {
        if (p.player_id === myId) {
          cls = ' div-row-me';
        } else if (_canChallenge(myPos, p.position)) {
          cls = ' div-row-can-challenge';
          if (_CHALLENGES_ENABLED) {
            const existing = myOutgoingMap[p.player_id];
            if (existing) {
              const icon  = existing.status === 'accepted' ? '💥' : '⏳';
              const title = existing.status === 'accepted' ? 'Game on! — tap to record result' : 'Challenge pending — tap to manage';
              rowClick = `openChallengeResult('${existing.id}')`;
              badge = `<button class="div-challenge-btn"
                onclick="event.stopPropagation();openChallengeResult('${existing.id}')"
                title="${title}">${icon}</button>`;
            } else {
              rowClick = `_issueChallengeForm('${p.player_id}',${p.position})`;
              badge = `<button class="div-challenge-btn"
                onclick="event.stopPropagation();_issueChallengeForm('${p.player_id}',${p.position})"
                title="Challenge ${first}">⚔️</button>`;
            }
          }
        } else if (_CHALLENGES_ENABLED) {
          const incoming = myIncomingMap[p.player_id];
          if (incoming) {
            const icon  = incoming.status === 'accepted' ? '💥' : '⏳';
            const title = incoming.status === 'accepted' ? 'Game on! — tap to record result' : 'Challenge from them — tap to manage';
            rowClick = `openChallengeResult('${incoming.id}')`;
            badge = `<button class="div-challenge-btn"
              onclick="event.stopPropagation();openChallengeResult('${incoming.id}')"
              title="${title}">${icon}</button>`;
          }
        }
      }
      return `<div class="div-player-row${cls}"${rowClick ? ` onclick="${rowClick}" style="cursor:pointer"` : ''}>
        <span class="div-pos">${recentIconMap[p.player_id] || ''}</span>
        <span class="div-player-name">${first} ${last}<span class="div-hc">${hc}</span>${_isSerialGhoster(p.player_id) ? '<span class="div-ghost-badge" title="3 consecutive ghosts — moved to last place">👻</span>' : ''}${_isSnailBadged(p.player_id) ? '<span class="div-snail-badge" title="Challenge voided — ladder reshuffled before match was played">🐌</span>' : ''}${_isJumped(p.player_id) ? '<span class="div-jumped-badge" title="Got jumped — challenger won another match and leapt above them; match no longer played">🦘</span>' : ''}</span>
        ${badge}
      </div>`;
    }).join('');

    divCards.push(`
      <div class="div-card">
        <div class="div-card-header">Division ${d}</div>
        ${rows || '<div style="color:#aaa;font-size:12px;padding:6px 0">No players ranked</div>'}
      </div>`);
  }

  // Build 2-col challenges panel
  const challengesPanelHtml = _CHALLENGES_ENABLED ? `
    <div class="challenges-panel-wrap">
      <div class="ch-col">
        <div class="challenge-list-header">Active</div>
        ${_activeChallenges.length === 0
          ? '<div class="ch-empty">No active challenges</div>'
          : _activeChallenges.map(c => {
              const cn = (c.challenger?.first_name || '') + ' ' + ((c.challenger?.last_name || '')[0] || '');
              const dn = (c.challenged?.first_name || '') + ' ' + ((c.challenged?.last_name || '')[0] || '');
              const canAct = myId && (c.challenger_id === myId || c.challenged_id === myId);
              const isAccepted  = c.status === 'accepted';
              const statusCls   = isAccepted ? ' accepted' : '';
              const statusLabel = isAccepted ? 'Accepted' : 'Pending';
              const stampSrc    = isAccepted ? (c.responded_at || c.issued_at) : c.issued_at;
              const issuedDate  = stampSrc ? new Date(stampSrc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
              const ago         = _elapsed(stampSrc);
              const agoLabel    = ago ? `${isAccepted ? 'accepted' : 'pending'} ${ago}` : '';
              return `<div class="ch-act-row${canAct ? ' clickable' : ''}"${canAct ? ` onclick="openChallengeResult('${c.id}')"` : ''}>
                <div class="ch-act-names">⚔️ ${cn} vs ${dn}</div>
                <div class="ch-act-foot">
                  <span class="challenge-status-badge${statusCls}">${statusLabel}</span>
                  <span class="challenge-date">${issuedDate}</span>
                  ${agoLabel ? `<span class="challenge-ago">${agoLabel}</span>` : ''}
                </div>
              </div>`;
            }).join('')
        }
      </div>
      <div class="ch-col">
        <div class="ch-history-header">
          <span class="challenge-list-header" style="padding:0">History</span>
          <select id="results-filter-sel" class="results-filter-sel" onchange="setLadderResultsFilter(this.value)">
            <option value="all">♾️ All</option>
            <option value="played">⚔️ Played</option>
            <option value="declined">🐔 Decline</option>
            <option value="forfeit">👻 Forfeit</option>
            <option value="injury">🩹 Injury</option>
            <option value="voided">🐌 Voided</option>
            <option value="jumped">🦘 Jumped</option>
          </select>
        </div>
        <div id="challenge-results-list"></div>
      </div>
    </div>` : '';

  const myAccepted = _CHALLENGES_ENABLED && myId
    ? _activeChallenges.filter(c => c.status === 'accepted' && (c.challenger_id === myId || c.challenged_id === myId))
    : [];
  const myPending = _CHALLENGES_ENABLED && myId
    ? _activeChallenges.filter(c => c.status === 'pending' && c.challenger_id === myId)
    : [];
  const myBannerHtml = (myAccepted.length > 0 || myPending.length > 0) ? `
    <div class="my-challenge-banner">
      ${myAccepted.map(c => {
        const oppObj = c.challenger_id === myId ? c.challenged : c.challenger;
        const opp = `${oppObj?.first_name || ''} ${oppObj?.last_name || ''}`.trim();
        return `<div class="mcb-card">
          <div class="mcb-icon">💥</div>
          <div class="mcb-info">
            <div class="mcb-label">Game On!</div>
            <div class="mcb-match">You vs ${opp}</div>
          </div>
          <button class="mcb-btn" onclick="openChallengeResult('${c.id}')">Record Result</button>
        </div>`;
      }).join('')}
      ${myPending.map(c => {
        const opp = `${c.challenged?.first_name || ''} ${c.challenged?.last_name || ''}`.trim();
        return `<div class="mcb-card mcb-pending">
          <div class="mcb-icon">⏳</div>
          <div class="mcb-info">
            <div class="mcb-label">Awaiting Response</div>
            <div class="mcb-match">You vs ${opp}</div>
            <div class="mcb-note">No penalty — they haven't accepted yet</div>
          </div>
          <button class="mcb-btn mcb-btn-withdraw" onclick="withdrawChallenge('${c.id}')">Withdraw</button>
        </div>`;
      }).join('')}
    </div>` : '';

  wrap.innerHTML = `
    ${myBannerHtml}
    <div style="max-width:600px;margin:0 auto 0;padding:0 8px">
      <button class="hc-calc-banner" onclick="showLadderRules()">⚔️ Rules of Engagement ⚔️</button>
      ${_CHALLENGES_ENABLED ? '<p style="text-align:center;font-size:12px;font-weight:700;color:#475569;margin:4px 0 0">Click a player\'s name to issue a challenge</p>' : ''}
    </div>
    <div class="div-ladder-grid">${divCards.join('')}</div>
    ${challengesPanelHtml}`;

  _renderResultsList();
}

function showLadderRules() {
  showFormModal('⚔️ Rules of Engagement ⚔️', `
    <p style="font-size:13px;color:#92400e;background:#fffbeb;border:1.5px solid #fbbf24;border-radius:6px;padding:8px 12px;margin:0 0 14px">
      <strong>Note:</strong> Ladders updated automatically — any issues, ping David B.
    </p>
    <ol style="padding-left:20px;margin:0;font-size:15px;line-height:1.8;color:#1e293b">
      <li><strong>No bloody whinging, whining or complaining!</strong> 🍼😭🤓</li>
      <li><strong>Challenge whenever you like</strong> — agree a time, or find each other at a session. <em>(Rocking up late when your opponent has already been playing for an hour can be respectfully declined — we're not tennis players.)</em></li>
      <li><strong>Ladder games are best of 3, no handicaps.</strong></li>
      <li><strong>Winner</strong> 🍺 takes the loser's spot on the ladder — or stays put if they're already higher.</li>
      <li><strong>Loser</strong> 😢 always drops one place. No exceptions.</li>
      <li><strong>Refuse a challenge?</strong> You lose a place and earn yourself a 🐔. Cluck cluck.</li>
      <li><strong>Injured?</strong> Fair enough — decline with injury and no penalty applies. We won't ask for a doctor's certificate... unless it becomes a habit.</li>
      <li><strong>One ladder game per session</strong> is all that's required. No one can demand a rematch the same night.</li>
      <li><strong>Challenge range increases by division</strong> — D1: ${_divRange(1)}, D2: ${_divRange(2)}, D3: ${_divRange(3)}, D4: ${_divRange(4)}. When challenging into a higher division the target division's (smaller) range applies.</li>
      <li><strong>Ghost rule</strong> 👻 — If you don't accept <em>or</em> decline within 7 days, you automatically drop one place. Don't go quiet.</li>
      <li><strong>Serial ghoster</strong> 👻 — Three consecutive ghosts as the challenged player and you get dropped straight to last place. The badge stays until you play a game.</li>
      <li><strong>Snail rule</strong> 🐌 — If the ladder reshuffles while your challenge is sitting idle and your opponent is now out of your range, the challenge gets voided and you earn a 🐌. Don't let the ladder move around you — play your games.</li>
      <li><strong>You got jumped!</strong> 🦘 — If someone challenges you, then wins a different match and leaps above you before your game is played, that challenge is off and you earn a 🦘. No penalty — just bad timing.</li>
    </ol>
  `);
}

// ── Issue a challenge ──────────────────────────────────────────────────────
function _issueChallengeForm(targetId, targetPos) {
  const entry = _ladderPositions.find(p => p.player_id === targetId);
  const targetName = entry?.players
    ? `${entry.players.first_name} ${(entry.players.last_name || '')[0] || ''}`.trim()
    : 'Player';
  const msg = CHALLENGE_MESSAGES[Math.floor(Math.random() * CHALLENGE_MESSAGES.length)];
  showFormModal(`⚔️ Challenge ${targetName}`, `
    <p style="margin-bottom:14px;font-size:17px">Send a challenge to <strong>${targetName}</strong> (position ${targetPos}).</p>
    <div class="form-group">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <label style="margin:0;font-size:16px">Trash talk</label>
        <button type="button" onclick="_shuffleChallengeMsg()" style="border:none;background:#f1f5f9;border-radius:6px;font-size:14px;cursor:pointer;color:#1B2A6B;font-weight:600;padding:6px 12px">🍀 Pick a message for me</button>
      </div>
      <textarea id="challenge-msg" rows="3" style="width:100%;padding:10px;border:1.5px solid #cbd5e1;border-radius:6px;font-size:16px;resize:vertical;touch-action:manipulation">${msg}</textarea>
    </div>
    <div id="challenge-form-error" class="error-msg" style="margin-bottom:8px"></div>
    <button class="btn-primary" style="width:100%;margin-top:4px" onclick="submitChallenge('${targetId}')">Send Challenge ⚔️</button>
  `);
}

function _shuffleChallengeMsg() {
  const el = document.getElementById('challenge-msg');
  if (!el) return;
  let msg;
  do { msg = CHALLENGE_MESSAGES[Math.floor(Math.random() * CHALLENGE_MESSAGES.length)]; }
  while (msg === el.value && CHALLENGE_MESSAGES.length > 1);
  el.value = msg;
}

async function submitChallenge(targetId) {
  if (_submittingChallenge) return;
  _submittingChallenge = true;
  const msg = document.getElementById('challenge-msg')?.value.trim();
  const err = document.getElementById('challenge-form-error');

  try {
  // Validate positions
  const myId = ST.player.id;
  const myEntry     = _ladderPositions.find(p => p.player_id === myId);
  const targetEntry = _ladderPositions.find(p => p.player_id === targetId);
  if (myEntry && targetEntry && !_canChallenge(myEntry.position, targetEntry.position)) {
    if (err) err.textContent = 'That player is outside your challenge range.';
    return;
  }
  // Max 3 active (pending/accepted) challenges per player
  const { data: active } = await sb.from('ladder_challenges')
    .select('id, challenger_id, challenged_id')
    .in('status', ['pending', 'accepted']);
  if (active) {
    // Block duplicate challenge between same pair
    const duplicate = active.find(c =>
      (c.challenger_id === myId && c.challenged_id === targetId) ||
      (c.challenger_id === targetId && c.challenged_id === myId)
    );
    if (duplicate) { closeFormModal(); return; }

    const myCount     = active.filter(c => c.challenger_id === myId    || c.challenged_id === myId).length;
    const theirCount  = active.filter(c => c.challenger_id === targetId || c.challenged_id === targetId).length;
    if (myCount >= 3) {
      if (err) err.textContent = 'You already have 3 active challenges — complete or wait for those first.';
      return;
    }
    if (theirCount >= 3) {
      if (err) err.textContent = 'That player already has 3 active challenges — try again later.';
      return;
    }
  }

  const { error } = await sb.from('ladder_challenges').insert({
    challenger_id: ST.player.id,
    challenged_id: targetId,
    message: msg || null,
    status: 'pending'
  });
  if (error) { if (err) err.textContent = error.message; return; }
  closeFormModal();
  await _loadChallenges();
  await _loadMyChallenges();
  renderDivisionLadder();
  _injectLadderHomeCard();
  _injectMyChallenges();
  } finally {
    _submittingChallenge = false;
  }
}

// ── Pending challenge popup — fires on every loadHome for any unseen challenge ─
function _checkPendingChallenges() {
  if (!ST?.player) return;
  if (!document.getElementById('form-overlay')?.classList.contains('hidden')) return;
  const myId = ST.player.id;
  const unseen = _activeChallenges.filter(
    c => c.challenged_id === myId && c.status === 'pending' && !_notifiedChallengeIds.has(c.id)
  );
  if (unseen.length === 0) return;
  const c = unseen[0];
  _notifiedChallengeIds.add(c.id);
  const challengerName = `${c.challenger?.first_name || ''} ${c.challenger?.last_name || ''}`.trim();
  const issuedDate = c.issued_at
    ? new Date(c.issued_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  const moreNote = unseen.length > 1
    ? `<p style="font-size:12px;color:#64748b;margin-top:8px">+${unseen.length - 1} more challenge${unseen.length > 2 ? 's' : ''} — view in Ladders</p>`
    : '';
  showFormModal('⚔️ You\'ve Been Challenged!', `
    <div style="text-align:center;padding:4px 0">
      <p style="font-size:15px;margin-bottom:8px"><strong>${challengerName}</strong> has challenged you!</p>
      ${c.message ? `<p style="color:#64748b;font-style:italic;margin-bottom:10px">"${c.message}"</p>` : ''}
      <p style="font-size:12px;color:#94a3b8;margin-bottom:16px">Issued ${issuedDate}</p>
      <div style="display:flex;gap:8px;justify-content:center;margin-bottom:8px">
        <button class="btn-primary" style="flex:1" onclick="respondToChallenge('${c.id}','accept')">Accept</button>
        <button class="btn-secondary" style="flex:1" onclick="respondToChallenge('${c.id}','decline')">Decline</button>
      </div>
      <button class="btn-secondary" style="width:100%;font-size:12px" onclick="respondToChallenge('${c.id}','injury')">Decline — Injury (no penalty)</button>
      <p style="font-size:11px;color:#ef4444;margin-top:8px">⚠️ Declining costs you one place on the ladder</p>
      ${moreNote}
    </div>
  `);
  // Lock the modal so it can't be dismissed without making a choice
  _formModalLocked = true;
  document.getElementById('form-close').style.visibility = 'hidden';
}

async function respondToChallenge(challengeId, response) {
  // response: 'accept' | 'decline' | 'injury'
  if (response === 'decline') {
    const ok = confirm('Are you sure you want to decline? You will lose one place on the ladder.');
    if (!ok) return;
  }
  // Unlock modal before any async work so user isn't stuck if an error occurs
  _formModalLocked = false;
  document.getElementById('form-close').style.visibility = '';
  const now = new Date().toISOString();
  const statusMap = { accept: 'accepted', decline: 'declined', injury: 'declined_injury' };
  const extra = response === 'decline' ? { loser_pos_change: 1 } : {};
  const { error } = await sb.from('ladder_challenges')
    .update({ status: statusMap[response], responded_at: now, ...extra })
    .eq('id', challengeId);
  if (error) { alert(error.message); return; }
  if (response === 'decline') {
    await _applyOnePlaceDrop(ST.player.id);
  }
  closeFormModal();
  await _loadChallenges();
  if (response === 'decline') {
    // Decline reshuffles positions — check for newly out-of-range challenges
    await _voidOutOfRangeChallenges();
    await _loadChallenges();
  }
  await _loadMyChallenges();
  _injectLadderHomeCard();
  _injectMyChallenges();
}

// ── Challenge resolution modal (record result + optional withdraw) ─────────
function openChallengeResult(challengeId) {
  const c = _activeChallenges.find(x => x.id === challengeId);
  if (!c) return;
  const myId    = ST?.player?.id;
  const isAdmin = ST?.player?.is_super_admin === true;
  const cn = `${c.challenger?.first_name || ''} ${c.challenger?.last_name || ''}`.trim();
  const dn = `${c.challenged?.first_name || ''} ${c.challenged?.last_name || ''}`.trim();
  const isPending  = c.status === 'pending';
  const isMine     = c.challenger_id === myId;
  const canWithdraw = isPending && (isMine || isAdmin);
  const title      = isPending ? `⏳ vs ${isMine ? dn : cn}` : `💥 Game on! vs ${isMine ? dn : cn}`;
  const issuedDate = c.issued_at
    ? new Date(c.issued_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : '';
  showFormModal(title, `
    <p style="text-align:center;color:#64748b;font-size:13px;margin-bottom:4px">⚔️ ${cn} vs ${dn} · ${issuedDate}</p>
    ${c.message ? `<p style="text-align:center;color:#94a3b8;font-size:12px;font-style:italic;margin-bottom:12px">"${c.message}"</p>` : '<div style="margin-bottom:12px"></div>'}
    <p style="text-align:center;font-weight:700;margin-bottom:10px">Who won?</p>
    <div style="display:flex;gap:8px;margin-bottom:${canWithdraw ? '12' : '0'}px">
      <button class="btn-primary" style="flex:1;padding:12px 8px"
        onclick="submitChallengeResult('${challengeId}','${c.challenger_id}')">🏆 ${cn}</button>
      <button class="btn-primary" style="flex:1;padding:12px 8px"
        onclick="submitChallengeResult('${challengeId}','${c.challenged_id}')">🏆 ${dn}</button>
    </div>
    ${canWithdraw ? `<button class="btn-secondary" style="width:100%;color:#dc2626;border-color:#dc2626;margin-bottom:0"
      onclick="withdrawChallenge('${challengeId}')">Withdraw Challenge</button>` : ''}
    <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:10px">Recording a result updates ladder positions immediately.</p>
    ${isPending ? '' : '<p style="font-size:12px;color:#92400e;background:#fffbeb;border:1.5px solid #fbbf24;border-radius:6px;padding:8px 12px;margin:10px 0 0;text-align:center">If you\'ve <strong>mutually agreed to cancel</strong> this match, don\'t record a result here — ping David B and it <strong>may</strong> be removed without penalty.</p>'}
  `);
}

async function withdrawChallenge(challengeId) {
  const { error } = await sb.from('ladder_challenges')
    .update({ status: 'withdrawn', responded_at: new Date().toISOString() })
    .eq('id', challengeId);
  if (error) { alert(error.message); return; }
  closeFormModal();
  await _loadChallenges();
  await _loadMyChallenges();
  renderDivisionLadder();
  _injectLadderHomeCard();
  _injectMyChallenges();
}

async function submitChallengeResult(challengeId, winnerId) {
  const c = _activeChallenges.find(x => x.id === challengeId);
  if (!c) return;
  const loserId = winnerId === c.challenger_id ? c.challenged_id : c.challenger_id;
  const posChange = await _applyLadderResult(winnerId, loserId);
  const { error } = await sb.from('ladder_challenges').update({
    status: 'completed',
    winner_id: winnerId,
    result_recorded_by: ST.player.id,
    completed_at: new Date().toISOString(),
    winner_pos_change: posChange ?? null,
    loser_pos_change: 1
  }).eq('id', challengeId);
  if (error) { alert(error.message); return; }
  // Winner may have leapt above players they also had a live challenge with —
  // mark those 'superseded' (🦘 "got jumped") before loadDivisionLadder's
  // reshuffle pass runs, so they aren't mistaken for out-of-range 🐌 voids.
  await _supersedeJumpedChallenges(winnerId, challengeId);
  closeFormModal();
  await _loadMyChallenges();
  await loadDivisionLadder();
  _injectLadderHomeCard();
  _injectMyChallenges();
}

// ── Position update helpers ────────────────────────────────────────────────
async function _applyLadderResult(winnerId, loserId) {
  const { data: pos } = await sb.from('ladder_positions')
    .select('player_id, position').order('position');
  if (!pos) return null;
  const winnerRow = pos.find(p => p.player_id === winnerId);
  const loserRow  = pos.find(p => p.player_id === loserId);
  if (!winnerRow || !loserRow) return null;
  const winnerPos = winnerRow.position;
  const loserPos  = loserRow.position;

  let updates, posChange;
  if (winnerPos > loserPos) {
    // Challenger won: cascade — winner takes loser's spot, everyone between shifts down 1
    posChange = winnerPos - loserPos;
    updates = pos.map(p => {
      if (p.player_id === winnerId) return { player_id: p.player_id, position: loserPos };
      if (p.position >= loserPos && p.position < winnerPos) return { player_id: p.player_id, position: p.position + 1 };
      return p;
    });
  } else {
    // Challenged won: loser (challenger) drops 1, player directly below moves up
    posChange = 1;
    updates = pos.map(p => {
      if (p.player_id === loserId)       return { player_id: p.player_id, position: loserPos + 1 };
      if (p.position === loserPos + 1)   return { player_id: p.player_id, position: loserPos };
      return p;
    });
  }
  await _savePositions(updates);
  return posChange;
}

async function _applyForfeitResult(challengerId, challengedId) {
  // Forfeit rule: challenged drops to just below challenger; challenger gets no jump reward.
  // Implementation: remove challenged from list, reinsert after challenger, renumber.
  // challenger_pos_change = 0 (by rule); loser may drop several places.
  const { data: pos } = await sb.from('ladder_positions')
    .select('player_id, position').order('position');
  if (!pos) return { winnerChange: 0, loserChange: 1 };
  const challengerRow = pos.find(p => p.player_id === challengerId);
  const challengedRow = pos.find(p => p.player_id === challengedId);
  if (!challengerRow || !challengedRow) return { winnerChange: 0, loserChange: 1 };

  const oldChallengedPos = challengedRow.position;
  const sorted = [...pos].sort((a, b) => a.position - b.position);
  const challengedIdx = sorted.findIndex(p => p.player_id === challengedId);
  sorted.splice(challengedIdx, 1);
  const newChallengerIdx = sorted.findIndex(p => p.player_id === challengerId);
  sorted.splice(newChallengerIdx + 1, 0, challengedRow);

  const updates = sorted.map((p, i) => ({ player_id: p.player_id, position: i + 1 }));
  const newChallengedPos = updates.find(u => u.player_id === challengedId).position;
  const loserChange = newChallengedPos - oldChallengedPos;

  await _savePositions(updates);
  return { winnerChange: 0, loserChange };
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
    await _applyOnePlaceDrop(c.challenged_id);
    await sb.from('ladder_challenges').update({
      status: 'forfeited',
      winner_id: c.challenger_id,
      completed_at: new Date().toISOString(),
      winner_pos_change: 0,
      loser_pos_change: 1
    }).eq('id', c.id);
  }
  if (expired.length > 0) {
    await _loadChallenges();
    // Demote any player who has now ghosted 3 consecutive times
    const uniqueChallenged = [...new Set(expired.map(c => c.challenged_id))];
    for (const pid of uniqueChallenged) {
      if (_isSerialGhoster(pid)) await _demoteToLastPlace(pid);
    }
  }
  // Always check — any reshuffle (forfeit, serial ghost demotion, or none)
  // may leave active challenges out of range; void them and rebuild snail badges
  await _voidOutOfRangeChallenges();
  await _loadChallenges();
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

  // Preserve scroll positions across re-render
  const prevWindowY  = window.scrollY;
  const prevListScroll = document.getElementById('ladder-in-list')?.scrollTop || 0;

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
                 ondrop="ladderDrop(event)"
                 ondragend="ladderDragEnd(event)">
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
      <label class="ladder-cfg-label">D1 challenge range
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

  // Restore scroll after DOM settles
  requestAnimationFrame(() => {
    window.scrollTo(0, prevWindowY);
    const list = document.getElementById('ladder-in-list');
    if (list) list.scrollTop = prevListScroll;
  });

  // Attach touch listeners (non-passive touchmove needed to preventDefault page scroll)
  document.querySelectorAll('#ladder-in-list .ladder-in-row').forEach(row => {
    row.addEventListener('touchstart',  _ladderTouchStart, { passive: true });
    row.addEventListener('touchmove',   _ladderTouchMove,  { passive: false });
    row.addEventListener('touchend',    _ladderTouchEnd,   { passive: false });
  });

  if (_CHALLENGES_ENABLED) loadAdminChallenges();
}

// ── Admin challenges section ───────────────────────────────────────────────
let _adminChallengesData = [];

async function loadAdminChallenges() {
  const wrap = document.getElementById('tab-ladder');
  if (!wrap) return;

  let section = document.getElementById('admin-challenges-section');
  if (!section) {
    section = document.createElement('div');
    section.id = 'admin-challenges-section';
    section.style.cssText = 'margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0';
    wrap.appendChild(section);
  }
  section.innerHTML = '<p style="color:#888;font-size:13px;padding:8px 0">Loading challenges…</p>';

  const { data, error } = await sb.from('ladder_challenges')
    .select(`id, status, issued_at, responded_at, completed_at,
             challenger:players!challenger_id(first_name, last_name),
             challenged:players!challenged_id(first_name, last_name)`)
    .order('issued_at', { ascending: false });

  if (error) { section.innerHTML = `<p style="color:#c00">${error.message}</p>`; return; }
  _adminChallengesData = data || [];
  _renderAdminChallenges('');
}

function _renderAdminChallenges(filter) {
  const section = document.getElementById('admin-challenges-section');
  if (!section) return;

  const q = (filter || '').toLowerCase();
  const filtered = q
    ? _adminChallengesData.filter(c => {
        const cr = `${c.challenger?.first_name||''} ${c.challenger?.last_name||''}`.toLowerCase();
        const cd = `${c.challenged?.first_name||''} ${c.challenged?.last_name||''}`.toLowerCase();
        return cr.includes(q) || cd.includes(q);
      })
    : _adminChallengesData;

  const statusLabel = { pending:'⏳ Pending', accepted:'💥 Accepted', completed:'🍺 Completed',
    declined:'🐔 Declined', declined_injury:'🩹 Injury', forfeited:'👻 Forfeited', withdrawn:'↩️ Withdrawn', voided:'🐌 Voided', superseded:'🦘 Jumped' };

  const rows = filtered.map(c => {
    const cr = `${c.challenger?.first_name||'?'} ${c.challenger?.last_name||''}`.trim();
    const cd = `${c.challenged?.first_name||'?'} ${c.challenged?.last_name||''}`.trim();
    const date = (c.completed_at || c.responded_at || c.issued_at || '').slice(0, 10);
    return `<tr>
      <td><input type="checkbox" class="ac-chk" data-id="${c.id}" onchange="_acUpdateBulkBtn()"></td>
      <td>${statusLabel[c.status] || c.status}</td>
      <td>${cr}</td>
      <td>${cd}</td>
      <td>${date}</td>
    </tr>`;
  }).join('');

  section.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <h3 style="font-size:14px;margin:0;flex-shrink:0">Challenges (${_adminChallengesData.length})</h3>
      <input id="ac-filter" type="text" placeholder="Filter by name…" value="${filter||''}"
             oninput="_renderAdminChallenges(this.value)"
             style="flex:1;min-width:120px;font-size:12px;padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px">
      <button class="btn-secondary" style="font-size:12px;flex-shrink:0" onclick="loadAdminChallenges()">Refresh</button>
    </div>
    ${rows ? `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer">
        <input type="checkbox" id="ac-select-all" onchange="_acSelectAll(this.checked)"> Select all
      </label>
      <button id="ac-bulk-delete" class="btn-icon-sm btn-icon-danger" style="display:none" onclick="deleteAdminChallengesSelected()">Delete selected (0)</button>
    </div>
    <table class="data-table" style="font-size:12px">
      <thead><tr><th></th><th>Status</th><th>Challenger</th><th>Challenged</th><th>Date</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : '<p style="color:#888;font-size:13px">No challenges found.</p>'}`;
}

function _acSelectAll(checked) {
  document.querySelectorAll('.ac-chk').forEach(cb => cb.checked = checked);
  _acUpdateBulkBtn();
}

function _acUpdateBulkBtn() {
  const checked = document.querySelectorAll('.ac-chk:checked');
  const allCbs  = document.querySelectorAll('.ac-chk');
  const btn = document.getElementById('ac-bulk-delete');
  const selAll = document.getElementById('ac-select-all');
  if (btn) {
    btn.style.display = checked.length ? '' : 'none';
    btn.textContent = `Delete selected (${checked.length})`;
  }
  if (selAll) selAll.indeterminate = checked.length > 0 && checked.length < allCbs.length;
}

async function deleteAdminChallengesSelected() {
  const ids = [...document.querySelectorAll('.ac-chk:checked')].map(cb => cb.dataset.id);
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} challenge${ids.length > 1 ? 's' : ''}?`)) return;
  const { error } = await sb.from('ladder_challenges').delete().in('id', ids);
  if (error) { alert(error.message); return; }
  await loadAdminChallenges();
}

async function deleteAdminChallenge(id) {
  if (!confirm('Delete this challenge record?')) return;
  const { error } = await sb.from('ladder_challenges').delete().eq('id', id);
  if (error) { alert(error.message); return; }
  await loadAdminChallenges();
}

// ── Drag and drop (mouse) + touch drag (iOS/mobile) ───────────────────────
let _ladderDragSrcIdx  = null;
let _ladderPoolDragIdx = null;

function ladderDragStart(e) {
  _ladderDragSrcIdx  = parseInt(e.currentTarget.dataset.idx, 10);
  _ladderPoolDragIdx = null;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('ladder-dragging');
}

function ladderPoolDragStart(e) {
  _ladderPoolDragIdx = parseInt(e.currentTarget.dataset.poolIdx, 10);
  _ladderDragSrcIdx  = null;
  e.dataTransfer.effectAllowed = 'copy';
}

function ladderDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.ladder-in-row').forEach(r => r.classList.remove('ladder-drag-over'));
  e.currentTarget.classList.add('ladder-drag-over');
}

function ladderDragEnd(e) {
  document.querySelectorAll('.ladder-in-row').forEach(r => {
    r.classList.remove('ladder-dragging');
    r.classList.remove('ladder-drag-over');
  });
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

// ── Touch drag (iOS Safari doesn't support HTML5 drag-and-drop) ───────────
let _ladderTouchSrcIdx = null;

function _ladderTouchStart(e) {
  _ladderTouchSrcIdx = parseInt(e.currentTarget.dataset.idx, 10);
  e.currentTarget.classList.add('ladder-dragging');
}

function _ladderTouchMove(e) {
  if (_ladderTouchSrcIdx === null) return;
  e.preventDefault(); // block page scroll while dragging
  const touch = e.touches[0];
  document.querySelectorAll('.ladder-in-row').forEach(r => r.classList.remove('ladder-drag-over'));
  const el  = document.elementFromPoint(touch.clientX, touch.clientY);
  const row = el?.closest?.('.ladder-in-row');
  if (row && parseInt(row.dataset.idx, 10) !== _ladderTouchSrcIdx) {
    row.classList.add('ladder-drag-over');
  }
}

function _ladderTouchEnd(e) {
  if (_ladderTouchSrcIdx === null) return;
  const touch = e.changedTouches[0];
  document.querySelectorAll('.ladder-in-row').forEach(r => {
    r.classList.remove('ladder-dragging');
    r.classList.remove('ladder-drag-over');
  });
  const el  = document.elementFromPoint(touch.clientX, touch.clientY);
  const row = el?.closest?.('.ladder-in-row');
  const targetIdx = row ? parseInt(row.dataset.idx, 10) : NaN;
  if (!isNaN(targetIdx) && targetIdx !== _ladderTouchSrcIdx) {
    const [moved] = _ladderInList.splice(_ladderTouchSrcIdx, 1);
    _ladderInList.splice(targetIdx, 0, moved);
  }
  _ladderTouchSrcIdx = null;
  renderLadderAdmin();
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
