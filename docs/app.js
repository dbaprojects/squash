/* app.js — Squash Club SPA (Supabase, phone login) */
'use strict';

// ── PWA install prompt ────────────────────────────────────────────────────
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
}

function showInstallBanner() {
  if (isStandalone()) return;
  if (!isMobile()) return;
  if (localStorage.getItem('pwa_dismissed')) return;

  const isIOS     = /iPad|iPhone|iPod/i.test(navigator.userAgent) && !window.MSStream;
  const canNative = !!deferredInstallPrompt;
  if (!isIOS && !canNative) return;

  const banner = document.getElementById('pwa-banner');
  if (!banner) return;

  if (isIOS) {
    banner.innerHTML = `
      <div class="pwa-text">
        <strong>Add to Home Screen</strong>
        <span>Tap the Share button&nbsp;
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          &nbsp;then "Add to Home Screen"
        </span>
      </div>
      <button class="pwa-dismiss" onclick="dismissInstallBanner()">✕</button>`;
  } else {
    banner.innerHTML = `
      <div class="pwa-text">
        <strong>Install App</strong>
        <span>Add to your home screen for quick access</span>
      </div>
      <button class="pwa-install-btn" onclick="triggerInstall()">Install</button>
      <button class="pwa-dismiss" onclick="dismissInstallBanner()">✕</button>`;
  }
  banner.classList.remove('hidden');
}

function dismissInstallBanner() {
  localStorage.setItem('pwa_dismissed', '1');
  document.getElementById('pwa-banner').classList.add('hidden');
}

async function triggerInstall() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  dismissInstallBanner();
}

// ── Supabase client ───────────────────────────────────────────────────────
const { createClient } = window.supabase;
const sb = createClient(
  'https://ikfzmqtglgeotyooosur.supabase.co',
  'sb_publishable_zs7ClfRPKw5TEaVSn2_oTA_kqVLhZfe'
);

// ── State ─────────────────────────────────────────────────────────────────
const ST = {
  player: null,
  players: [],
  events: [],
  templates: [],
  currentEvent: null
};

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  setupModalClose();
  setupUserSwitcher();

  document.getElementById('login-phone').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitLoginPhone();
  });

  document.getElementById('event-list').addEventListener('click', e => {
    const clickable = e.target.closest('.ev-clickable');
    if (clickable) openEvent(clickable.dataset.id);
  });

  document.getElementById('btn-logout').addEventListener('click', signOutAndReset);
  document.getElementById('btn-hamburger').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('hamburger-menu').classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    document.getElementById('hamburger-menu')?.classList.add('hidden');
  });

  // Restore session from localStorage
  const saved = localStorage.getItem('squash_player');
  if (saved) {
    try {
      const cached = JSON.parse(saved);
      const { data } = await sb.from('players').select('*').eq('id', cached.id).maybeSingle();
      if (data && data.active && !data.pending) {
        loginSuccess(data);
        return;
      }
    } catch (_) { /* ignore */ }
    localStorage.removeItem('squash_player');
  }
  showView('login');
});

// ── Auth ──────────────────────────────────────────────────────────────────
function normalizePhone(p) {
  return (p || '').replace(/\D/g, '');
}

async function submitLoginPhone() {
  const dialCode  = document.getElementById('login-dialcode').value;
  const local     = document.getElementById('login-phone').value.trim();
  const errEl     = document.getElementById('login-phone-error');
  errEl.textContent = '';
  if (!local) { errEl.textContent = 'Please enter your phone number.'; return; }

  const phone     = buildPhone(dialCode, local);
  const normInput = normalizePhone(phone);

  const { data: players } = await sb.from('players')
    .select('*').not('phone', 'is', null);

  const match = (players || []).find(p => normalizePhone(p.phone) === normInput);

  if (match) {
    if (match.pending) { showOnboardStep('pending'); return; }
    document.getElementById('ob-confirm-name').textContent  = `${match.first_name} ${match.last_name}`;
    document.getElementById('ob-confirm-phone').textContent = phone;
    document.getElementById('ob-confirm-yes').onclick = () => completeLogin(match);
    document.getElementById('ob-confirm-no').onclick  = () => { prefillRegForm(phone); showOnboardStep('register'); };
    document.getElementById('ob-confirm-name-fix').onclick = () => {
      pendingLoginPlayer = match;
      document.getElementById('ob-fix-first').value = match.first_name;
      document.getElementById('ob-fix-last').value  = match.last_name;
      document.getElementById('ob-fix-error').textContent = '';
      document.getElementById('ob-name-fix-form').classList.remove('hidden');
      document.getElementById('ob-confirm-name-fix').classList.add('hidden');
    };
    showOnboardStep('confirm');
  } else {
    prefillRegForm(phone);
    showOnboardStep('register');
  }
}

let pendingLoginPlayer = null;

async function completeLogin(player) {
  if (!player.active) {
    await sb.from('players').update({ active: true }).eq('id', player.id);
    player.active = true;
  }
  loginSuccess(player);
}

async function submitNameFix() {
  const player = pendingLoginPlayer;
  if (!player) return;
  const first  = document.getElementById('ob-fix-first').value.trim();
  const last   = document.getElementById('ob-fix-last').value.trim();
  const errEl  = document.getElementById('ob-fix-error');
  errEl.textContent = '';
  if (!first || !last) { errEl.textContent = 'Please enter your full name.'; return; }
  const { error } = await sb.from('players').update({ first_name: first, last_name: last }).eq('id', player.id);
  if (error) { errEl.textContent = error.message; return; }
  player.first_name = first;
  player.last_name  = last;
  pendingLoginPlayer = null;
  completeLogin(player);
}

function prefillRegForm(phone) {
  document.getElementById('ob-reg-first').value                = '';
  document.getElementById('ob-reg-last').value                 = '';
  document.getElementById('ob-reg-phone-display').textContent  = phone;
  document.getElementById('ob-reg-phone-stored').value         = phone;
  document.getElementById('ob-reg-error').textContent          = '';
}

// ── Fuzzy name matching ───────────────────────────────────────────────────
const NICKNAMES = {
  dick: 'richard', dicky: 'richard', ricky: 'richard', rich: 'richard', rick: 'richard', richie: 'richard',
  bob: 'robert', rob: 'robert', bobby: 'robert', robbie: 'robert',
  bill: 'william', will: 'william', billy: 'william', willy: 'william', liam: 'william',
  jim: 'james', jimmy: 'james', jamie: 'james',
  mike: 'michael', mick: 'michael', mickey: 'michael', mikey: 'michael',
  dave: 'david', davy: 'david',
  steve: 'stephen', steph: 'stephen', stevie: 'stephen',
  tom: 'thomas', tommy: 'thomas',
  chris: 'christopher', kit: 'christopher',
  andy: 'andrew', drew: 'andrew',
  tony: 'anthony', ant: 'anthony',
  nick: 'nicholas', nic: 'nicholas',
  ed: 'edward', ted: 'edward', ned: 'edward', eddie: 'edward',
  ben: 'benjamin', benny: 'benjamin',
  alex: 'alexander', al: 'alexander',
  dan: 'daniel', danny: 'daniel',
  matt: 'matthew', matty: 'matthew',
  pete: 'peter', petey: 'peter',
  sam: 'samuel', sammy: 'samuel',
  tim: 'timothy', timmy: 'timothy',
  jon: 'john', johnny: 'john', jack: 'john',
  charlie: 'charles', chuck: 'charles',
  harry: 'henry', hal: 'henry', hank: 'henry',
  fred: 'frederick', freddie: 'frederick',
  joe: 'joseph', joey: 'joseph',
  ken: 'kenneth', kenny: 'kenneth',
  ron: 'ronald', ronnie: 'ronald',
  terry: 'terence', tel: 'terence',
  phil: 'philip',
  sue: 'susan', susie: 'susan',
  liz: 'elizabeth', beth: 'elizabeth', betty: 'elizabeth', lisa: 'elizabeth',
  kate: 'katherine', kathy: 'katherine', katie: 'katherine',
  jen: 'jennifer', jenny: 'jennifer',
  meg: 'margaret', maggie: 'margaret', peggy: 'margaret',
  vicky: 'victoria',
  pat: 'patricia', trish: 'patricia',
};

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i || j));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function firstNameMatch(a, b) {
  a = a.toLowerCase().replace(/[^a-z]/g, '');
  b = b.toLowerCase().replace(/[^a-z]/g, '');
  if (a === b) return true;
  if (a.length >= 3 && b.startsWith(a)) return true;
  if (b.length >= 3 && a.startsWith(b)) return true;
  const ca = NICKNAMES[a] || a, cb = NICKNAMES[b] || b;
  if (ca === cb || ca === b || cb === a) return true;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen >= 4 && levenshtein(a, b) <= Math.floor(maxLen / 4)) return true;
  return false;
}

async function submitRegistration() {
  const first = document.getElementById('ob-reg-first').value.trim();
  const last  = document.getElementById('ob-reg-last').value.trim();
  const phone = document.getElementById('ob-reg-phone-stored').value;
  const errEl = document.getElementById('ob-reg-error');
  errEl.textContent = '';
  if (!first || !last) { errEl.textContent = 'Please enter your full name.'; return; }

  const { data: existing } = await sb.from('players')
    .select('*').eq('active', true).eq('pending', false);
  const normStr = s => s.toLowerCase().replace(/[^a-z]/g, '');

  // Tier 1: last name exact + first name fuzzy
  const fuzzyMatches = (existing || []).filter(p =>
    normStr(p.last_name) === normStr(last) && firstNameMatch(p.first_name, first)
  );

  // Tier 2: last name exact only (surname-only match), exactly one candidate
  const surnameOnly = fuzzyMatches.length === 0
    ? (existing || []).filter(p => normStr(p.last_name) === normStr(last))
    : [];

  const found    = fuzzyMatches[0] || (surnameOnly.length === 1 ? surnameOnly[0] : null);
  const isFuzzy  = fuzzyMatches.length === 1;
  const isSurname = !isFuzzy && surnameOnly.length === 1;

  if (found && (isFuzzy || isSurname)) {
    document.getElementById('ob-confirm-name').textContent  = `${found.first_name} ${found.last_name}`;
    document.getElementById('ob-confirm-phone').textContent = phone;
    document.getElementById('ob-confirm-yes').onclick = async () => {
      await sb.from('players').update({ phone }).eq('id', found.id);
      const { data: updated } = await sb.from('players').select('*').eq('id', found.id).single();
      completeLogin(updated || found);
    };
    document.getElementById('ob-confirm-no').onclick = () => createPendingPlayer(first, last, phone);
    showOnboardStep('confirm');
    if (isSurname) document.getElementById('ob-confirm-msg').textContent = 'We found someone with the same surname. Could this be you?';
    return;
  }

  await createPendingPlayer(first, last, phone);
}

async function createPendingPlayer(first, last, phone) {
  const errEl = document.getElementById('ob-reg-error');
  const { error } = await sb.from('players').insert({
    first_name: first, last_name: last,
    email: null, phone: phone || null,
    is_admin: false, active: false, pending: true, current_handicap: null
  });
  if (error) { errEl.textContent = error.message; showOnboardStep('register'); return; }
  showOnboardStep('pending');
}

function signOutAndReset() {
  localStorage.removeItem('squash_player');
  ST.player  = null;
  ST.players = [];
  showView('login');
}

function showOnboardStep(step) {
  ['onboard-confirm', 'onboard-register', 'onboard-pending'].forEach(id => {
    document.getElementById(id).classList.toggle('hidden', id !== `onboard-${step}`);
  });
  if (step === 'confirm') {
    document.getElementById('ob-confirm-msg').textContent = 'We found a matching account. Is this you?';
    document.getElementById('ob-name-fix-form').classList.add('hidden');
    document.getElementById('ob-confirm-name-fix').classList.remove('hidden');
  }
  showView('onboard');
}

async function checkPendingBadge() {
  const { count } = await sb.from('players')
    .select('*', { count: 'exact', head: true })
    .eq('pending', true);
  const badge = document.getElementById('admin-badge');
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function loginSuccess(player) {
  if (!player.active) { showOnboardStep('pending'); return; }
  ST.player = player;
  localStorage.setItem('squash_player', JSON.stringify(player));
  document.getElementById('header-name').textContent =
    `${player.first_name} ${player.last_name}`;
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', !player.is_admin);
  });
  showView('app');
  showSection('view-schedule');
  setNavActive('schedule');
  loadSchedule();
  if (player.is_super_admin) loadUserSwitcher();
  if (player.is_admin) checkPendingBadge();
  showInstallBanner();
}

// ── User switcher ─────────────────────────────────────────────────────────
function setupUserSwitcher() {
  document.getElementById('btn-switcher-toggle').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('switcher-dropdown').classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    document.getElementById('switcher-dropdown').classList.add('hidden');
  });
}

async function loadUserSwitcher() {
  const { data } = await sb.from('players')
    .select('id, first_name, last_name')
    .eq('active', true).order('last_name');
  if (!data?.length) return;
  const dropdown = document.getElementById('switcher-dropdown');
  dropdown.innerHTML = data.map(p =>
    `<button class="switcher-item${p.id === ST.player.id ? ' active-user' : ''}"
      onclick="switchUser('${p.id}')">${esc(p.first_name)} ${esc(p.last_name)}</button>`
  ).join('');
  document.getElementById('user-switcher').classList.remove('hidden');
}

async function switchUser(playerId) {
  document.getElementById('switcher-dropdown').classList.add('hidden');
  const { data } = await sb.from('players').select('*').eq('id', playerId).single();
  if (!data) { alert('Player not found'); return; }
  ST.players = [];
  localStorage.setItem('squash_player', JSON.stringify(data));
  loginSuccess(data);
}

// ── Navigation ────────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const v = btn.dataset.view;
      if (v === 'schedule') { showSection('view-schedule'); loadSchedule(); }
      if (v === 'ladder')   { showSection('view-ladder');   loadLadder(); }
      if (v === 'admin')    { showSection('view-admin');   loadAdminTab('tab-players'); }
    });
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadAdminTab(btn.dataset.tab);
    });
  });

  document.getElementById('btn-back-schedule').addEventListener('click', () => {
    showSection('view-schedule');
    setNavActive('schedule');
  });
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  if (name === 'login')   document.getElementById('view-login').classList.remove('hidden');
  if (name === 'app')     document.getElementById('view-app').classList.remove('hidden');
  if (name === 'onboard') document.getElementById('view-onboard').classList.remove('hidden');
}

function showSection(id) {
  ['view-schedule','view-event','view-ladder','view-admin'].forEach(s => {
    document.getElementById(s).classList.add('hidden');
  });
  document.getElementById(id).classList.remove('hidden');
}

function setNavActive(name) {
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });
}

// ── Normalise Supabase nested responses ───────────────────────────────────
function normaliseSignup(s) {
  return {
    ...s,
    player_first:      s.player?.first_name ?? null,
    player_last:       s.player?.last_name  ?? null,
    player_name:       s.player ? `${s.player.first_name} ${s.player.last_name}` : null,
    player_handicap:   s.player?.current_handicap ?? null,
    signed_up_by_name: s.booker ? `${s.booker.first_name} ${s.booker.last_name}` : null
  };
}

function normaliseEvent(ev) {
  return { ...ev, signups: (ev.signups || []).map(normaliseSignup) };
}

// ── Ladder ────────────────────────────────────────────────────────────────
let ladderPlayers     = [];
let ladderSearch      = '';
let playerHistoryArr  = {};   // { playerId: [{month:'YYYY.MM', value},...] ascending }
let ladderMonths      = [];   // current 12-month display window
let ladderWindowStart = null; // 'YYYY.MM' first month of window
let ladderAllYears    = [];   // years that have data
let ladderSectionView = 'list';
let _sparkChart       = null;
let _playerHcChart    = null;

function monthKey(date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getLadderWindowMonths(startKey) {
  const [y, m] = startKey.split('.').map(Number);
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(y, m - 1 + i, 1);
    months.push(monthKey(d));
  }
  return months;
}

// Most-recent known HC for player at or before targetMonth
function effectiveHcAt(playerId, targetMonth) {
  const hist = playerHistoryArr[playerId] || [];
  let result = null;
  for (const entry of hist) {
    if (entry.month <= targetMonth) result = entry.value;
    else break;
  }
  return result;
}

// Whether there is a real history entry in that exact month
function hasActualEntry(playerId, month) {
  return (playerHistoryArr[playerId] || []).some(e => e.month === month);
}

async function loadLadder() {
  const [{ data: players }, { data: history }] = await Promise.all([
    sb.from('players')
      .select('id, first_name, last_name, current_handicap')
      .eq('active', true).eq('pending', false)
      .order('current_handicap', { ascending: true, nullsFirst: false })
      .order('last_name').order('first_name'),
    sb.from('handicap_history')
      .select('player_id, handicap_value, changed_at')
      .order('changed_at')
  ]);

  ladderPlayers = players || [];

  // Build per-player monthly array: one entry per month (last wins), sorted asc
  const tempMap  = {};
  const yearSet  = new Set();
  for (const h of (history || [])) {
    const key = monthKey(new Date(h.changed_at));
    yearSet.add(key.slice(0, 4));
    if (!tempMap[h.player_id]) tempMap[h.player_id] = {};
    tempMap[h.player_id][key] = h.handicap_value;
  }
  playerHistoryArr = {};
  for (const [pid, mm] of Object.entries(tempMap)) {
    playerHistoryArr[pid] = Object.keys(mm).sort().map(m => ({ month: m, value: mm[m] }));
  }
  ladderAllYears = [...yearSet].sort();

  // Default: show last 12 months (window starts 11 months ago)
  if (!ladderWindowStart) {
    const d = new Date(); d.setMonth(d.getMonth() - 11);
    ladderWindowStart = monthKey(d);
  }
  ladderMonths = getLadderWindowMonths(ladderWindowStart);

  renderLadder();
}

function renderLadder() {
  const wrap = document.getElementById('ladder-wrap');

  if (!document.getElementById('ladder-section-history')) {
    wrap.innerHTML = `
      <div class="hc-top-row">
        <div id="ladder-my-card" class="hc-top-card"></div>
        <div id="ladder-section-card" class="hc-top-card"></div>
      </div>
      <div id="ladder-section-history"></div>`;
  }

  renderMyHcCard();
  renderSectionCard();
  renderSectionHistory();
}

function renderMyHcCard() {
  const myIdx = ladderPlayers.findIndex(p => p.id === ST.player.id);
  const me    = myIdx >= 0 ? ladderPlayers[myIdx] : null;
  const el    = document.getElementById('ladder-my-card');
  if (!me) { el.innerHTML = '<p style="color:#888;font-size:13px">Not on the ladder yet.</p>'; return; }

  // 3-month trend: compare current HC vs value 3 months ago
  const now     = new Date();
  const ago3    = new Date(now); ago3.setMonth(ago3.getMonth() - 3);
  const ago3Key = monthKey(ago3);
  const threeMonthVal = effectiveHcAt(me.id, ago3Key);
  const currentHc     = me.current_handicap;

  let trendHtml = '';
  if (threeMonthVal !== null && currentHc !== null) {
    const delta = currentHc - threeMonthVal;
    if      (delta < 0) trendHtml = `<span class="myhc-trend improved">▼ ${delta} vs 3 months ago</span>`;
    else if (delta > 0) trendHtml = `<span class="myhc-trend worsened">▲ +${delta} vs 3 months ago</span>`;
    else                trendHtml = `<span class="myhc-trend flat">— unchanged vs 3 months ago</span>`;
  }

  // Sparkline: show the current 12-month window's months (filled values)
  const sparkMonths = ladderMonths;

  if (_sparkChart) { _sparkChart.destroy(); _sparkChart = null; }
  el.innerHTML = `
    <div class="myhc-header">
      <div>
        <div class="myhc-name">${esc(me.first_name)} ${esc(me.last_name)}</div>
        <div class="myhc-rank">#${myIdx + 1} of ${ladderPlayers.length}</div>
      </div>
      <div style="text-align:right">
        <div class="myhc-big">${currentHc ?? '–'}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.55)">handicap</div>
      </div>
    </div>
    ${trendHtml ? `<div style="margin-top:8px">${trendHtml}</div>` : ''}
    ${sparkMonths.length > 1 ? `<div class="myhc-sparkline"><canvas id="my-hc-sparkline"></canvas></div>` : ''}
    <button class="myhc-history-btn"
      onclick="openPlayerHcModal('${me.id}','${esc(me.first_name + ' ' + me.last_name)}')">
      View full history →
    </button>`;

  if (sparkMonths.length > 1) {
    setTimeout(() => {
      const ctx = document.getElementById('my-hc-sparkline')?.getContext('2d');
      if (!ctx) return;
      const vals = sparkMonths.map(m => effectiveHcAt(me.id, m));
      // Only render if there's any data at all
      if (vals.every(v => v === null)) return;
      _sparkChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: sparkMonths,
          datasets: [{ data: vals, borderColor: 'rgba(196,147,42,.9)', backgroundColor: 'rgba(196,147,42,.15)',
            borderWidth: 2, pointRadius: 3, tension: 0.3, fill: true, spanGaps: true }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `HC: ${c.raw}` } } },
          scales: {
            x: { ticks: { color: 'rgba(255,255,255,.65)', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,.1)' } },
            y: { ticks: { color: 'rgba(255,255,255,.65)', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,.1)' } }
          }
        }
      });
    }, 0);
  }
}

function renderSectionCard() {
  const el = document.getElementById('ladder-section-card');
  if (!ladderPlayers.length) { el.innerHTML = ''; return; }

  // Improved / worsened over the full 12-month window
  const startM = ladderMonths[0];
  const endM   = ladderMonths[ladderMonths.length - 1];
  let improved = 0, worsened = 0;
  for (const p of ladderPlayers) {
    const start = effectiveHcAt(p.id, startM);
    const end   = effectiveHcAt(p.id, endM);
    if (start == null || end == null) continue;
    if (end < start) improved++;
    else if (end > start) worsened++;
  }

  const validHcs = ladderPlayers.map(p => p.current_handicap).filter(v => v != null);
  const avgHc    = validHcs.length
    ? (validHcs.reduce((a, b) => a + b, 0) / validHcs.length).toFixed(1)
    : '–';

  el.innerHTML = `
    <div class="sec-card-title">Section Summary</div>
    <div class="sec-stat-row">
      <div class="sec-stat">
        <div class="sec-stat-val">${ladderPlayers.length}</div>
        <div class="sec-stat-lbl">Players</div>
      </div>
      <div class="sec-stat">
        <div class="sec-stat-val">${avgHc}</div>
        <div class="sec-stat-lbl">Avg HC</div>
      </div>
      <div class="sec-stat">
        <div class="sec-stat-val sec-improved">↓${improved}</div>
        <div class="sec-stat-lbl">Improved<br><span style="font-size:9px;font-weight:400">12 months</span></div>
      </div>
      <div class="sec-stat">
        <div class="sec-stat-val sec-worsened">↑${worsened}</div>
        <div class="sec-stat-lbl">Worsened<br><span style="font-size:9px;font-weight:400">12 months</span></div>
      </div>
    </div>
    <div class="hc-view-toggle">
      <button class="hc-toggle-btn${ladderSectionView === 'list' ? ' active' : ''}"
        onclick="setLadderView('list')">Player List</button>
      <button class="hc-toggle-btn${ladderSectionView === 'grid' ? ' active' : ''}"
        onclick="setLadderView('grid')">Grid</button>
    </div>`;
}

function setLadderView(v) {
  ladderSectionView = v;
  document.querySelectorAll('.hc-toggle-btn').forEach(b => {
    b.classList.toggle('active', b.textContent.trim().toLowerCase().replace(' ', '') === v.replace(' ', ''));
  });
  renderSectionHistory();
}

function renderSectionHistory() {
  const el = document.getElementById('ladder-section-history');
  if (!el) return;
  if (ladderSectionView === 'grid') renderSectionGrid(el);
  else renderPlayerListView(el);
}

// ── Navigation helpers ────────────────────────────────────────────────────
function ladderNavBar() {
  const nowKey    = monthKey(new Date());
  const maxD      = new Date(); maxD.setMonth(maxD.getMonth() - 11);
  const maxStart  = monthKey(maxD);
  const isLatest  = ladderWindowStart >= maxStart;

  const curYear = ladderWindowStart.slice(0, 4);
  const yearOpts = ladderAllYears.map(y =>
    `<option value="${y}"${y === curYear ? ' selected' : ''}>${y}</option>`
  ).join('');

  return `<div class="hc-nav-bar">
    <button class="hc-nav-btn" onclick="ladderNavPrev()">◀ Prev</button>
    <select class="hc-nav-year" onchange="ladderNavYear(this.value)">${yearOpts}</select>
    <button class="hc-nav-btn" onclick="ladderNavNext()"${isLatest ? ' disabled' : ''}>Next ▶</button>
  </div>`;
}

function ladderNavPrev() {
  const [y, m] = ladderWindowStart.split('.').map(Number);
  const d = new Date(y, m - 1 - 12, 1);
  ladderWindowStart = monthKey(d);
  ladderMonths = getLadderWindowMonths(ladderWindowStart);
  renderMyHcCard();
  renderSectionCard();
  renderSectionHistory();
}

function ladderNavNext() {
  const [y, m] = ladderWindowStart.split('.').map(Number);
  const d = new Date(y, m - 1 + 12, 1);
  const maxD = new Date(); maxD.setMonth(maxD.getMonth() - 11);
  if (d > maxD) return;
  ladderWindowStart = monthKey(d);
  ladderMonths = getLadderWindowMonths(ladderWindowStart);
  renderMyHcCard();
  renderSectionCard();
  renderSectionHistory();
}

function ladderNavYear(year) {
  // Show Jan–Dec of selected year, but cap window end at current month
  const now     = new Date();
  const curYr   = now.getFullYear();
  const curMo   = now.getMonth(); // 0-based
  if (parseInt(year) === curYr) {
    // Start 11 months back so current month is last column
    const d = new Date(curYr, curMo - 11, 1);
    ladderWindowStart = monthKey(d);
  } else {
    ladderWindowStart = `${year}.01`;
  }
  ladderMonths = getLadderWindowMonths(ladderWindowStart);
  renderMyHcCard();
  renderSectionCard();
  renderSectionHistory();
}

// ── Grid view ─────────────────────────────────────────────────────────────
function renderSectionGrid(el) {
  const activePlayers = ladderPlayers.filter(p => playerHistoryArr[p.id]);
  const headerCells   = ladderMonths.map(m => `<th>${m}</th>`).join('');

  const rows = activePlayers.map(p => {
    const isMe  = p.id === ST.player.id;
    const cells = ladderMonths.map((m, i) => {
      const val = effectiveHcAt(p.id, m);
      if (val == null) return '<td></td>';

      // Only colour if there's an actual change recorded this month
      let cls = '';
      if (hasActualEntry(p.id, m)) {
        const prevM = i > 0 ? ladderMonths[i - 1] : null;
        const prev  = prevM ? effectiveHcAt(p.id, prevM) : null;
        if (prev != null) {
          if      (val < prev) cls = ' class="hc-cell-down"';
          else if (val > prev) cls = ' class="hc-cell-up"';
        }
      }
      return `<td${cls}>${val}</td>`;
    }).join('');

    const nm = `${esc(p.first_name)} ${esc(p.last_name)}`;
    return `<tr${isMe ? ' class="ladder-me"' : ''}>
      <td class="hcg-name${isMe ? ' hcg-name-me' : ''}"
        onclick="openPlayerHcModal('${p.id}','${nm}')">${nm}</td>
      ${cells}
    </tr>`;
  }).join('');

  el.innerHTML = `
    ${ladderNavBar()}
    <div class="hc-grid-wrap">
      <table class="hc-grid">
        <thead><tr><th class="hcg-name">Name</th>${headerCells}</tr></thead>
        <tbody>${rows || '<tr><td colspan="13" style="color:#888;padding:12px">No history data.</td></tr>'}</tbody>
      </table>
    </div>`;
}

// ── Player List view ──────────────────────────────────────────────────────
function renderPlayerListView(el) {
  const q        = ladderSearch.toLowerCase();
  const filtered = ladderPlayers.filter(p =>
    !q || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q)
  );

  el.innerHTML = `
    <div class="players-toolbar" style="margin-top:0;margin-bottom:12px">
      <input type="text" id="ladder-search" class="players-search"
        placeholder="Search players…" autocomplete="off" value="${esc(ladderSearch)}">
    </div>
    ${filtered.length
      ? `<table class="data-table">
          <thead><tr><th>#</th><th>Name</th><th>Handicap</th></tr></thead>
          <tbody>${filtered.map(p => {
            const rank = ladderPlayers.indexOf(p) + 1;
            const isMe = p.id === ST.player.id;
            return `<tr${isMe ? ' class="ladder-me"' : ''} style="cursor:pointer"
              onclick="openPlayerHcModal('${p.id}','${esc(p.first_name)} ${esc(p.last_name)}')">
              <td style="color:#888;width:36px">${rank}</td>
              <td>${esc(p.first_name)} ${esc(p.last_name)}</td>
              <td><span class="hcap-badge">${p.current_handicap ?? '–'}</span></td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>`
      : '<p style="color:#888;padding:12px 0">No players found.</p>'
    }`;

  document.getElementById('ladder-search').addEventListener('input', e => {
    ladderSearch = e.target.value;
    renderPlayerListView(el);
  });
}

let _playerHcSeries = [];  // filled monthly series: [{month, value, isActual, notes}]
let _playerHcPeriod = 'all';

// Build complete monthly series from first entry to now, carrying forward unchanged values
function buildFilledSeries(history) {
  if (!history?.length) return [];
  const byMonth = {};
  for (const h of history) {
    const k = monthKey(new Date(h.changed_at));
    byMonth[k] = h; // last entry in month wins
  }
  const firstKey = monthKey(new Date(history[0].changed_at));
  const nowKey   = monthKey(new Date());
  const series   = [];
  let lastVal    = null;
  let [y, m]     = firstKey.split('.').map(Number);
  const [ly, lm] = nowKey.split('.').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    const key    = `${y}.${String(m).padStart(2, '0')}`;
    const actual = byMonth[key];
    if (actual) lastVal = actual.handicap_value;
    if (lastVal !== null) {
      series.push({ month: key, value: lastVal, isActual: !!actual, notes: actual?.notes || '' });
    }
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return series;
}

function filterSeriesByPeriod(series, period) {
  if (period === 'all') return series;
  const years   = parseInt(period);
  const cutoff  = new Date(); cutoff.setFullYear(cutoff.getFullYear() - years);
  const cutoffK = monthKey(cutoff);
  return series.filter(s => s.month >= cutoffK);
}

async function openPlayerHcModal(playerId, playerName) {
  _playerHcPeriod = 'all';
  document.getElementById('modal-title').textContent = playerName;
  document.getElementById('modal-body').innerHTML = '<p style="color:#888;padding:12px 0">Loading…</p>';
  openModal();

  const { data: history } = await sb.from('handicap_history')
    .select('handicap_value, changed_at, notes')
    .eq('player_id', playerId)
    .order('changed_at', { ascending: true });

  if (!history?.length) {
    document.getElementById('modal-body').innerHTML =
      '<p style="color:#888;padding:12px 0">No history recorded.</p>';
    return;
  }

  _playerHcSeries = buildFilledSeries(history);
  renderPlayerHcModal();
}

function renderPlayerHcModal() {
  const periodBtns = ['1yr', '2yr', '3yr', 'all'].map(p =>
    `<button class="ph-period-btn${_playerHcPeriod === p ? ' active' : ''}"
      data-period="${p}" onclick="setPlayerHcPeriod('${p}')">${p === 'all' ? 'All' : p}</button>`
  ).join('');

  document.getElementById('modal-body').innerHTML = `
    <div class="ph-period-row">${periodBtns}</div>
    <div class="ph-chart-wrap"><canvas id="ph-chart"></canvas></div>
    <div id="ph-table-wrap"></div>`;

  setTimeout(() => { renderPlayerHcChart(); renderPlayerHcTable(); }, 0);
}

function setPlayerHcPeriod(period) {
  _playerHcPeriod = period;
  document.querySelectorAll('.ph-period-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.period === period);
  });
  renderPlayerHcChart();
  renderPlayerHcTable();
}

function renderPlayerHcChart() {
  const ctx = document.getElementById('ph-chart')?.getContext('2d');
  if (!ctx) return;
  if (_playerHcChart) { _playerHcChart.destroy(); _playerHcChart = null; }
  const slice = filterSeriesByPeriod(_playerHcSeries, _playerHcPeriod);
  if (!slice.length) return;

  // Point radius: bigger for actual entries, 0 for carried-forward
  const radii = slice.map(s => s.isActual ? 4 : 0);

  _playerHcChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: slice.map(s => s.month),
      datasets: [{
        data: slice.map(s => s.value),
        borderColor: '#1B2A6B', backgroundColor: 'rgba(27,42,107,.08)',
        borderWidth: 2, pointRadius: radii, pointHoverRadius: 5,
        tension: 0, fill: true
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `HC: ${c.raw}` } }
      },
      scales: {
        x: { ticks: { font: { size: 10 }, maxRotation: 45 } },
        y: { ticks: { font: { size: 10 } } }
      }
    }
  });
}

function renderPlayerHcTable() {
  const wrap = document.getElementById('ph-table-wrap');
  if (!wrap) return;
  const slice = filterSeriesByPeriod(_playerHcSeries, _playerHcPeriod);
  // Table shows every month in the period (carry-forwards greyed)
  let html = `<table class="ph-table">
    <thead><tr><th>Month</th><th>HC</th><th>Notes</th></tr></thead><tbody>`;
  let lastYear = null;
  for (const s of [...slice].reverse()) {
    const yr = s.month.slice(0, 4);
    if (yr !== lastYear) {
      html += `<tr class="ph-year-row"><td colspan="3">${yr}</td></tr>`;
      lastYear = yr;
    }
    if (s.isActual) {
      html += `<tr>
        <td>${s.month}</td>
        <td><strong>${s.value}</strong></td>
        <td style="color:#888;font-size:12px">${esc(s.notes)}</td>
      </tr>`;
    } else {
      html += `<tr class="ph-carryforward">
        <td>${s.month}</td>
        <td>${s.value}</td>
        <td></td>
      </tr>`;
    }
  }
  html += '</tbody></table>';
  wrap.innerHTML = html;
}


// ── Schedule ──────────────────────────────────────────────────────────────
async function loadSchedule() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb.from('events')
    .select(`
      *,
      signups (
        id, player_id, guest_name, is_reserve, signed_up_by, signed_up_at, notes,
        player:players!player_id (first_name, last_name, current_handicap),
        booker:players!signed_up_by (first_name, last_name)
      )
    `)
    .gte('event_date', today)
    .order('event_date')
    .order('start_time');
  if (error) { console.error(error); return; }
  ST.events = (data || []).map(normaliseEvent);
  renderSchedule();
}

function renderSchedule() {
  const el = document.getElementById('event-list');
  if (!ST.events.length) { el.innerHTML = '<p style="color:#666">No upcoming sessions.</p>'; return; }
  el.innerHTML = ST.events.map(ev => eventCard(ev)).join('');
}

function eventCard(ev) {
  const signups   = ev.signups || [];
  const confirmed = signups.filter(s => !s.is_reserve);
  const count     = confirmed.length;
  const full      = ev.max_signups && count >= ev.max_signups;
  const mySignup  = signups.find(s => s.player_id === ST.player.id);

  const actionBtns = mySignup
    ? `<button class="btn-leave" onclick="leaveEvent(event,'${mySignup.id}','${ev.id}')">Cancel</button>`
    : `<button class="btn-join" onclick="joinEvent(event,'${ev.id}')">Join</button>`;

  const chips = signups.map(s => {
    const name = s.player_first
      ? esc(shortName(s.player_first, s.player_last))
      : esc(s.guest_name || 'Guest');
    const cls = !s.player_id ? 'chip-guest' : s.is_reserve ? 'chip-reserve' : 'chip-confirmed';
    return `<span class="attendee-chip ${cls}">${name}</span>`;
  }).join('');

  return `<div class="event-card" id="ev-card-${ev.id}">
    <div class="ev-card-top">
      <div class="ev-clickable" data-id="${ev.id}">
        <div class="ev-title">${esc(ev.title)}</div>
        <div class="ev-date">${fmtDate(ev.event_date)}</div>
        <div class="ev-time">${ev.start_time} – ${ev.end_time}</div>
      </div>
      <div class="ev-actions">${actionBtns}</div>
    </div>
    <div class="ev-attendees">
      <span class="ev-count${full ? ' full' : ''}">${ev.max_signups ? `${count}/${ev.max_signups}` : count}</span>
      ${chips || '<span class="ev-no-signups">No signups yet</span>'}
    </div>
  </div>`;
}

function refreshCard(eventId, signups) {
  const idx = ST.events.findIndex(x => x.id === eventId);
  if (idx === -1) return;
  ST.events[idx].signups = signups;
  const card = document.getElementById(`ev-card-${eventId}`);
  if (card) card.outerHTML = eventCard(ST.events[idx]);
}

async function fetchEventSignups(eventId) {
  const { data } = await sb.from('signups')
    .select(`
      id, player_id, guest_name, is_reserve, signed_up_by, signed_up_at, notes,
      player:players!player_id (first_name, last_name, current_handicap),
      booker:players!signed_up_by (first_name, last_name)
    `)
    .eq('event_id', eventId)
    .order('signed_up_at');
  return (data || []).map(normaliseSignup);
}

async function joinEvent(e, eventId) {
  e.stopPropagation();
  try {
    const { data: ev } = await sb.from('events').select('max_signups').eq('id', eventId).single();
    const { count }    = await sb.from('signups')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId).eq('is_reserve', false);
    const { error } = await sb.from('signups').insert({
      event_id: eventId, signed_up_by: ST.player.id,
      player_id: ST.player.id,
      is_reserve: !!(ev.max_signups && count >= ev.max_signups)
    });
    if (error) throw error;
    refreshCard(eventId, await fetchEventSignups(eventId));
  } catch (err) { alert(err.message); }
}

async function leaveEvent(e, signupId, eventId) {
  e.stopPropagation();
  try {
    const { error } = await sb.from('signups').delete().eq('id', signupId);
    if (error) throw error;
    await promoteFirstReserve(eventId);
    refreshCard(eventId, await fetchEventSignups(eventId));
  } catch (err) { alert(err.message); }
}

function addGuestInCard() {}
function cancelGuestInCard() {}
async function submitGuestInCard() {}

async function promoteFirstReserve(eventId) {
  const { data: ev } = await sb.from('events').select('max_signups').eq('id', eventId).single();
  if (!ev?.max_signups) return;
  const { count } = await sb.from('signups')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId).eq('is_reserve', false);
  if (count < ev.max_signups) {
    const { data: first } = await sb.from('signups')
      .select('id').eq('event_id', eventId).eq('is_reserve', true)
      .order('signed_up_at').limit(1).maybeSingle();
    if (first) await sb.from('signups').update({ is_reserve: false }).eq('id', first.id);
  }
}

// ── Event detail ──────────────────────────────────────────────────────────
async function openEvent(id) {
  const { data: ev, error } = await sb.from('events')
    .select(`
      *,
      signups (
        id, player_id, guest_name, is_reserve, signed_up_by, signed_up_at, notes,
        player:players!player_id (first_name, last_name, current_handicap),
        booker:players!signed_up_by (first_name, last_name)
      )
    `)
    .eq('id', id).single();
  if (error) { alert('Failed to load event'); return; }
  ST.currentEvent = normaliseEvent(ev);
  showSection('view-event');
  renderEventDetail(ST.currentEvent);
}

function renderEventDetail(ev) {
  const signups   = ev.signups || [];
  const confirmed = signups.filter(s => !s.is_reserve);
  const reserves  = signups.filter(s => s.is_reserve);
  const mySignup  = signups.find(s => s.player_id === ST.player.id);

  document.getElementById('event-detail').innerHTML = `
    <div class="event-detail-header">
      <h2>${esc(ev.title)}</h2>
      <div class="ev-meta">${fmtDate(ev.event_date)} &nbsp;·&nbsp; ${ev.start_time} – ${ev.end_time}
        ${ev.max_signups ? `&nbsp;·&nbsp; max ${ev.max_signups}` : ''}
      </div>
      ${ev.notes ? `<div class="ev-meta" style="margin-top:6px">${esc(ev.notes)}</div>` : ''}
    </div>
    <div class="signup-list">
      <h3>Confirmed (${confirmed.length})</h3>
      ${confirmed.length ? confirmed.map(s => signupRow(s)).join('') : '<p style="color:#888;font-size:13px">None yet</p>'}
    </div>
    ${reserves.length ? `
    <div class="signup-list">
      <h3>Reserves (${reserves.length})</h3>
      ${reserves.map(s => signupRow(s)).join('')}
    </div>` : ''}
    ${!mySignup ? renderSignupForm(ev) : `
    <div class="signup-form">
      <p>You are ${confirmed.find(s=>s.player_id===ST.player.id) ? 'going' : 'on the reserve list'}.</p>
      <button class="btn-danger" style="margin-top:10px" onclick="removeSignup('${mySignup.id}')">Cancel my signup</button>
    </div>`}
  `;
}

function signupRow(s) {
  const name     = s.player_name || s.guest_name || '?';
  const byOther  = s.signed_up_by !== s.player_id && s.player_name;
  const canRemove = ST.player.is_admin || s.signed_up_by === ST.player.id || s.player_id === ST.player.id;
  return `<div class="signup-row">
    <div>
      <div class="sname">${esc(name)}${s.is_reserve ? '<span class="reserve-badge">Reserve</span>' : ''}</div>
      <div class="smeta">${byOther ? `Added by ${esc(s.signed_up_by_name)}` : ''}${!s.player_id ? ' · Guest' : ''}</div>
    </div>
    ${canRemove ? `<button class="btn-danger" onclick="removeSignup('${s.id}')">Remove</button>` : ''}
  </div>`;
}

function renderSignupForm(ev) {
  const otherPlayers = ST.players.filter(p => p.id !== ST.player.id);
  const playerOpts   = otherPlayers.map(p =>
    `<option value="${p.id}">${esc(p.first_name)} ${esc(p.last_name)}</option>`
  ).join('');

  return `<div class="signup-form">
    <button class="btn-join-large" onclick="submitSignup('${ev.id}','self')">✓ Join this session</button>
    <details class="signup-others">
      <summary>Sign up someone else</summary>
      <div style="margin-top:12px">
        <div class="form-group">
          <label>Another player</label>
          <div style="display:flex;gap:8px">
            <select id="su-player-id" style="flex:1">
              <option value="">-- select --</option>
              ${playerOpts}
            </select>
            <button class="btn-primary" onclick="submitSignup('${ev.id}','player')">Add</button>
          </div>
        </div>
      </div>
    </details>
  </div>`;
}

async function submitSignup(eventId, type) {
  await ensurePlayers();
  const { data: ev } = await sb.from('events').select('max_signups').eq('id', eventId).single();
  const { count }    = await sb.from('signups')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId).eq('is_reserve', false);
  const isReserve = !!(ev.max_signups && count >= ev.max_signups);
  const row = { event_id: eventId, signed_up_by: ST.player.id, is_reserve: isReserve };

  if (type === 'self') {
    row.player_id = ST.player.id;
  } else if (type === 'player') {
    const pid = document.getElementById('su-player-id').value;
    if (!pid) { alert('Please select a player'); return; }
    row.player_id = pid;
  }

  const { error } = await sb.from('signups').insert(row);
  if (error) { alert(error.message); return; }
  openEvent(eventId);
}

async function removeSignup(signupId) {
  if (!confirm('Remove this signup?')) return;
  const eventId = ST.currentEvent?.id;
  const { error } = await sb.from('signups').delete().eq('id', signupId);
  if (error) { alert(error.message); return; }
  if (eventId) await promoteFirstReserve(eventId);
  if (ST.currentEvent) openEvent(ST.currentEvent.id);
}

// ── Admin ─────────────────────────────────────────────────────────────────
async function loadAdminTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(tabId)?.classList.remove('hidden');
  if (tabId === 'tab-players')   await renderPlayersTab();
  if (tabId === 'tab-events')    await renderAdminEvents();
  if (tabId === 'tab-templates') await renderTemplatesTab();
  if (tabId === 'tab-reports')   await renderReportsTab();
}

// ── Players tab ───────────────────────────────────────────────────────────
const DIAL_CODES = [
  { code: '65',  name: 'Singapore'   },
  { code: '61',  name: 'Australia'   },
  { code: '880', name: 'Bangladesh'  },
  { code: '32',  name: 'Belgium'     },
  { code: '55',  name: 'Brazil'      },
  { code: '1',   name: 'Canada / USA'},
  { code: '86',  name: 'China'       },
  { code: '45',  name: 'Denmark'     },
  { code: '358', name: 'Finland'     },
  { code: '33',  name: 'France'      },
  { code: '49',  name: 'Germany'     },
  { code: '852', name: 'Hong Kong'   },
  { code: '91',  name: 'India'       },
  { code: '62',  name: 'Indonesia'   },
  { code: '353', name: 'Ireland'     },
  { code: '39',  name: 'Italy'       },
  { code: '81',  name: 'Japan'       },
  { code: '82',  name: 'Korea'       },
  { code: '60',  name: 'Malaysia'    },
  { code: '95',  name: 'Myanmar'     },
  { code: '31',  name: 'Netherlands' },
  { code: '64',  name: 'New Zealand' },
  { code: '47',  name: 'Norway'      },
  { code: '92',  name: 'Pakistan'    },
  { code: '63',  name: 'Philippines' },
  { code: '351', name: 'Portugal'    },
  { code: '7',   name: 'Russia'      },
  { code: '966', name: 'Saudi Arabia'},
  { code: '27',  name: 'South Africa'},
  { code: '34',  name: 'Spain'       },
  { code: '94',  name: 'Sri Lanka'   },
  { code: '46',  name: 'Sweden'      },
  { code: '41',  name: 'Switzerland' },
  { code: '886', name: 'Taiwan'      },
  { code: '66',  name: 'Thailand'    },
  { code: '971', name: 'UAE'         },
  { code: '44',  name: 'UK'          },
  { code: '84',  name: 'Vietnam'     },
];

let allPlayers    = [];
let playersFilter = { status: 'active', search: '', sortBy: 'name', sortDir: 'asc', role: 'all' };

function dialCodeOptions(selected = '65') {
  return DIAL_CODES.map(d =>
    `<option value="${d.code}"${d.code === selected ? ' selected' : ''}>+${d.code} ${esc(d.name)}</option>`
  ).join('');
}

function dialCodeBtnHtml(id, selectedCode = '65') {
  const dc = DIAL_CODES.find(d => d.code === selectedCode) || DIAL_CODES[0];
  return `<button type="button" class="dial-code-btn" id="${id}-btn"
    onclick="openCountryPicker('${id}')">+${dc.code} ${esc(dc.name)}</button>
    <input type="hidden" id="${id}" value="${dc.code}">`;
}

// ── Country picker ────────────────────────────────────────────────────────
let countryPickerTarget = null;

function openCountryPicker(targetId) {
  countryPickerTarget = targetId;
  const overlay = document.getElementById('country-picker');
  const search  = document.getElementById('country-picker-search');
  search.value  = '';
  renderCountryList('');
  overlay.classList.remove('hidden');
  setTimeout(() => search.focus(), 80);
  document.getElementById('country-picker-search').addEventListener('input', e => {
    renderCountryList(e.target.value);
  }, { once: true });
  document.getElementById('country-picker-search').oninput = e => renderCountryList(e.target.value);
}

function closeCountryPicker() {
  document.getElementById('country-picker').classList.add('hidden');
  countryPickerTarget = null;
}

function closeCountryPickerOutside(e) {
  if (e.target === document.getElementById('country-picker')) closeCountryPicker();
}

function selectCountry(code, name) {
  if (!countryPickerTarget) return;
  const hidden = document.getElementById(countryPickerTarget);
  const btn    = document.getElementById(countryPickerTarget + '-btn');
  if (hidden) hidden.value = code;
  if (btn)    btn.textContent = `+${code} ${name}`;
  closeCountryPicker();
}

function renderCountryList(q) {
  const lq = q.toLowerCase();
  const filtered = q
    ? DIAL_CODES.filter(d => d.name.toLowerCase().includes(lq) || d.code.startsWith(q.replace('+','')))
    : DIAL_CODES;
  document.getElementById('country-picker-list').innerHTML = filtered.map(d =>
    `<button class="country-option" onclick="selectCountry('${d.code}','${esc(d.name)}')">
      <span>${esc(d.name)}</span><span class="country-code">+${d.code}</span>
    </button>`
  ).join('') || '<p style="padding:16px;color:#999">No results</p>';
}

function parsePhone(stored) {
  if (!stored) return { dialCode: '65', localNumber: '' };
  const m = stored.match(/^\+(\d+)\s*(.*)$/);
  return m ? { dialCode: m[1], localNumber: m[2].trim() } : { dialCode: '65', localNumber: stored };
}

function buildPhone(dialCode, localNumber) {
  localNumber = localNumber.trim();
  return localNumber ? `+${dialCode} ${localNumber}` : '';
}

async function renderPlayersTab() {
  const { data } = await sb.from('players').select('*').order('last_name').order('first_name');
  allPlayers = data || [];
  ST.players = allPlayers.filter(p => p.active);
  renderPlayersTable();
  document.getElementById('btn-add-player').onclick = openAddPlayerForm;
}

function renderPlayersTable() {
  const { status, search, sortBy, sortDir, role } = playersFilter;
  const q = search.toLowerCase();
  const isPending = p => p.pending === true;

  let players = allPlayers.filter(p => {
    if (status === 'active'   && !p.active) return false;
    if (status === 'inactive' && (p.active || isPending(p))) return false;
    if (status === 'pending'  && !isPending(p)) return false;
    if (role === 'superadmin' && !p.is_super_admin) return false;
    if (role === 'admin'      && !(p.is_admin && !p.is_super_admin)) return false;
    if (role === 'regular'    && p.is_admin) return false;
    if (q) {
      const name = `${p.first_name} ${p.last_name}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  players = [...players].sort((a, b) => {
    let av, bv;
    if (sortBy === 'hc') {
      av = a.current_handicap ?? 999;
      bv = b.current_handicap ?? 999;
    } else {
      av = `${a.last_name} ${a.first_name}`.toLowerCase();
      bv = `${b.last_name} ${b.first_name}`.toLowerCase();
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  const pendingCount = allPlayers.filter(isPending).length;
  const wrap = document.getElementById('players-table-wrap');

  // Build toolbar once — re-rendering destroys focus on every keystroke
  if (!document.getElementById('players-search')) {
    wrap.innerHTML = `
      <div class="players-toolbar">
        <input type="text" id="players-search" class="players-search"
          placeholder="Search by name…" autocomplete="off">
        <div id="players-status-btns" class="players-status-btns"></div>
        <div id="players-role-btns" class="players-role-btns"></div>
      </div>
      <div id="players-list"></div>`;
    document.getElementById('players-search').addEventListener('input', e => {
      playersFilter.search = e.target.value;
      renderPlayersTable();
    });
  }

  document.getElementById('players-status-btns').innerHTML = `
    <button class="admin-filter-btn${status === 'active'   ? ' active' : ''}" onclick="setPlayersStatus('active')">Active</button>
    <button class="admin-filter-btn${status === 'inactive' ? ' active' : ''}" onclick="setPlayersStatus('inactive')">Inactive</button>
    <button class="admin-filter-btn${status === 'pending'  ? ' active' : ''}" onclick="setPlayersStatus('pending')">Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}</button>
    <button class="admin-filter-btn${status === 'all'      ? ' active' : ''}" onclick="setPlayersStatus('all')">All</button>`;

  document.getElementById('players-role-btns').innerHTML = `
    <button class="admin-filter-btn${role === 'all'       ? ' active' : ''}" onclick="setPlayersRole('all')">All roles</button>
    <button class="admin-filter-btn${role === 'admin'     ? ' active' : ''}" onclick="setPlayersRole('admin')">Admin</button>
    <button class="admin-filter-btn${role === 'superadmin'? ' active' : ''}" onclick="setPlayersRole('superadmin')">SuperAdmin</button>
    <button class="admin-filter-btn${role === 'regular'   ? ' active' : ''}" onclick="setPlayersRole('regular')">Regular</button>`;

  const arrow = f => sortBy === f
    ? `<span class="sort-arrow">${sortDir === 'asc' ? '↑' : '↓'}</span>`
    : `<span class="sort-arrow muted">↕</span>`;

  document.getElementById('players-list').innerHTML = players.length
    ? `<table class="data-table players-table">
      <thead><tr>
        <th class="th-sort" onclick="setPlayersSort('name')">Name ${arrow('name')}</th>
        <th class="col-phone">Phone</th>
        <th class="th-sort" onclick="setPlayersSort('hc')">HC ${arrow('hc')}</th>
        <th class="col-role">Role</th>
        <th></th>
      </tr></thead>
      <tbody>
      ${players.map(p => {
        const pending = isPending(p);
        const roleLabel = p.is_super_admin
          ? '<span class="tag-superadmin">SuperAdmin</span>'
          : p.is_admin ? '<span class="tag-admin">Admin</span>' : '';
        return `<tr>
        <td>
          <div class="player-name">${esc(p.first_name)} ${esc(p.last_name)}${pending ? ' <span class="tag-pending">Pending</span>' : !p.active ? ' <span class="tag-inactive">Inactive</span>' : ''}</div>
        </td>
        <td class="col-phone">${esc(p.phone || '')}</td>
        <td><span class="hcap-badge">${p.current_handicap ?? '–'}</span></td>
        <td class="col-role">${roleLabel}</td>
        <td>
          <div class="btn-actions">
          ${pending
            ? `<button class="btn-icon-sm" onclick="approvePlayer('${p.id}')">Approve</button>
               <button class="btn-icon-sm btn-icon-danger" onclick="rejectPlayer('${p.id}')">Reject</button>`
            : `<button class="btn-icon-sm btn-hc-mobile" onclick="openHandicapModal('${p.id}','${esc(p.first_name)} ${esc(p.last_name)}')">HC</button>
               <button class="btn-icon-sm" onclick="openEditPlayerForm('${p.id}')">Edit</button>
               ${p.active
                 ? `<button class="btn-icon-sm btn-icon-danger" onclick="deactivatePlayer('${p.id}')">Deact.</button>
                    <span class="btn-placeholder"></span>`
                 : `<button class="btn-icon-sm" onclick="reactivatePlayer('${p.id}')">Restore</button>
                    ${ST.player.is_super_admin
                      ? `<button class="btn-icon-sm btn-icon-danger" onclick="deletePlayer('${p.id}','${esc(p.first_name)} ${esc(p.last_name)}')">Delete</button>`
                      : '<span class="btn-placeholder"></span>'}`}`}
          </div>
        </td>
      </tr>`;
      }).join('')}
      </tbody></table>`
    : '<p style="color:#888;padding:12px 0">No players match.</p>';
}

function setPlayersStatus(status) {
  playersFilter.status = status;
  renderPlayersTable();
}

function setPlayersSort(field) {
  if (playersFilter.sortBy === field) {
    playersFilter.sortDir = playersFilter.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    playersFilter.sortBy = field;
    playersFilter.sortDir = 'asc';
  }
  renderPlayersTable();
}

function setPlayersRole(role) {
  playersFilter.role = role;
  renderPlayersTable();
}

function openAddPlayerForm() {
  showFormModal('Add Player', `
    <div class="form-group"><label>First name</label><input type="text" id="fp-first" autocomplete="off"></div>
    <div class="form-group"><label>Last name</label><input type="text" id="fp-last" autocomplete="off"></div>
    <div class="form-group">
      <label>Phone</label>
      <div class="phone-input-row">
        ${dialCodeBtnHtml('fp-dialcode')}
        <input type="tel" id="fp-phone" class="phone-local" placeholder="9123 4567" autocomplete="off" inputmode="numeric">
      </div>
    </div>
    <div class="form-group"><label>Handicap</label><input type="number" id="fp-hcap" min="-35" max="10" step="0.5"></div>
    <div class="form-group"><label><input type="checkbox" id="fp-admin"> Admin</label></div>
    ${ST.player.is_super_admin ? `<div class="form-group"><label><input type="checkbox" id="fp-super-admin"> Super Admin</label></div>` : ''}
    <div style="text-align:right;margin-top:8px">
      <button class="btn-primary" onclick="submitAddPlayer()">Add Player</button>
    </div>`);
}

async function submitAddPlayer() {
  const body = {
    first_name:       document.getElementById('fp-first').value.trim(),
    last_name:        document.getElementById('fp-last').value.trim(),
    is_admin:         document.getElementById('fp-admin').checked,
    is_super_admin:   document.getElementById('fp-super-admin')?.checked ?? false,
    current_handicap: parseFloat(document.getElementById('fp-hcap').value) || null,
    phone:            buildPhone(document.getElementById('fp-dialcode').value, document.getElementById('fp-phone').value),
    active:           true
  };
  if (!body.first_name || !body.last_name) { alert('Name required'); return; }
  const { data: newPlayer, error } = await sb.from('players').insert(body).select().single();
  if (error) { alert(error.message); return; }
  allPlayers.push(newPlayer);
  allPlayers.sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  ST.players = allPlayers.filter(p => p.active);
  closeFormModal();
  renderPlayersTable();
}

function openEditPlayerForm(id) {
  const p = allPlayers.find(x => x.id === id);
  if (!p) return;
  const ph = parsePhone(p.phone);
  const isSelf = p.id === ST.player.id;
  const saLocked = isSelf || p.is_super_admin;
  const saNote = isSelf ? '(cannot change own)' : '(cannot revoke)';
  showFormModal('Edit Player', `
    <div class="form-group"><label>First name</label><input type="text" id="ep-first" value="${esc(p.first_name)}"></div>
    <div class="form-group"><label>Last name</label><input type="text" id="ep-last" value="${esc(p.last_name)}"></div>
    <div class="form-group">
      <label>Phone</label>
      <div class="phone-input-row">
        ${dialCodeBtnHtml('ep-dialcode', ph.dialCode)}
        <input type="tel" id="ep-phone" class="phone-local" value="${esc(ph.localNumber)}" placeholder="9123 4567" inputmode="numeric">
      </div>
    </div>
    <div class="form-group"><label><input type="checkbox" id="ep-admin" ${p.is_admin ? 'checked' : ''}> Admin</label></div>
    ${ST.player.is_super_admin ? `<div class="form-group"><label><input type="checkbox" id="ep-super-admin" ${p.is_super_admin ? 'checked' : ''} ${saLocked ? 'disabled' : ''}> Super Admin${saLocked ? ` <span style="font-size:11px;color:#aaa">${saNote}</span>` : ''}</label></div>` : ''}
    <div style="text-align:right;margin-top:8px">
      <button class="btn-primary" onclick="submitEditPlayer('${id}')">Save</button>
    </div>`);
}

async function submitEditPlayer(id) {
  const superAdminEl = document.getElementById('ep-super-admin');
  const body = {
    first_name:  document.getElementById('ep-first').value.trim(),
    last_name:   document.getElementById('ep-last').value.trim(),
    is_admin:    document.getElementById('ep-admin').checked,
    phone:       buildPhone(document.getElementById('ep-dialcode').value, document.getElementById('ep-phone').value),
    ...(superAdminEl && !superAdminEl.disabled ? { is_super_admin: superAdminEl.checked } : {})
  };
  const { error } = await sb.from('players').update(body).eq('id', id);
  if (error) { alert(error.message); return; }
  const p = allPlayers.find(x => x.id === id);
  if (p) Object.assign(p, body);
  ST.players = allPlayers.filter(p => p.active);
  closeFormModal();
  renderPlayersTable();
}

async function deactivatePlayer(id) {
  if (!confirm('Deactivate this player? They will be hidden from the active list but can still sign in.')) return;
  const { error } = await sb.from('players').update({ active: false }).eq('id', id);
  if (error) { alert(error.message); return; }
  const p = allPlayers.find(x => x.id === id);
  if (p) p.active = false;
  ST.players = allPlayers.filter(p => p.active);
  renderPlayersTable();
}

async function reactivatePlayer(id) {
  if (!confirm('Restore this player? They will be able to sign in again.')) return;
  const { error } = await sb.from('players').update({ active: true }).eq('id', id);
  if (error) { alert(error.message); return; }
  const p = allPlayers.find(x => x.id === id);
  if (p) p.active = true;
  ST.players = allPlayers.filter(p => p.active);
  renderPlayersTable();
}

async function deletePlayer(id, name) {
  if (!confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
  // Remove related records first
  await sb.from('handicap_history').delete().eq('player_id', id);
  await sb.from('signups').delete().eq('player_id', id);
  const { error } = await sb.from('players').delete().eq('id', id);
  if (error) { alert(error.message); return; }
  allPlayers = allPlayers.filter(x => x.id !== id);
  ST.players = allPlayers.filter(p => p.active);
  renderPlayersTable();
}

async function approvePlayer(id) {
  if (!confirm('Approve this registration? The player will gain access to the app.')) return;
  const { error } = await sb.from('players').update({ active: true, pending: false }).eq('id', id);
  if (error) { alert(error.message); return; }
  const p = allPlayers.find(x => x.id === id);
  if (p) { p.active = true; p.pending = false; }
  ST.players = allPlayers.filter(p => p.active);
  checkPendingBadge();
  renderPlayersTable();
}

async function rejectPlayer(id) {
  if (!confirm('Reject and delete this registration? This cannot be undone.')) return;
  const { error } = await sb.from('players').delete().eq('id', id);
  if (error) { alert(error.message); return; }
  const idx = allPlayers.findIndex(x => x.id === id);
  if (idx !== -1) allPlayers.splice(idx, 1);
  checkPendingBadge();
  renderPlayersTable();
}

// ── Handicap modal ────────────────────────────────────────────────────────
async function openHandicapModal(playerId, playerName) {
  document.getElementById('modal-title').textContent = `Handicap — ${playerName}`;
  const { data: history } = await sb.from('handicap_history')
    .select('*, changed_by_player:players!changed_by (first_name, last_name)')
    .eq('player_id', playerId)
    .order('changed_at', { ascending: false });
  const p = allPlayers.find(x => x.id === playerId);

  document.getElementById('modal-body').innerHTML = `
    <div style="margin-bottom:16px">
      <strong>Current handicap:</strong> <span class="hcap-badge">${p?.current_handicap ?? '–'}</span>
    </div>
    <div class="signup-form" style="margin-bottom:16px">
      <h3 style="font-size:14px;margin-bottom:10px">Add new entry</h3>
      <div class="form-group">
        <label>New handicap value</label>
        <input type="number" id="hc-value" min="-35" max="10" step="0.5" value="${p?.current_handicap ?? ''}">
      </div>
      <div class="form-group">
        <label>Notes (optional)</label>
        <input type="text" id="hc-notes" placeholder="e.g. after club championship">
      </div>
      <button class="btn-primary" onclick="submitHandicap('${playerId}')">Save</button>
    </div>
    <h3 style="font-size:14px;margin-bottom:8px">History</h3>
    ${(history||[]).length ? `<table class="data-table">
      <thead><tr><th>Date</th><th>Value</th><th>Changed by</th><th>Notes</th></tr></thead>
      <tbody>
      ${(history||[]).map(h => `<tr>
        <td>${fmtDatetime(h.changed_at)}</td>
        <td><span class="hcap-badge">${h.handicap_value}</span></td>
        <td>${esc(h.changed_by_player ? `${h.changed_by_player.first_name} ${h.changed_by_player.last_name}` : '–')}</td>
        <td>${h.notes ? esc(h.notes) : '–'}</td>
      </tr>`).join('')}
      </tbody></table>`
    : '<p style="color:#888;font-size:13px">No history yet.</p>'}
  `;
  openModal();
}

async function submitHandicap(playerId) {
  const value = parseFloat(document.getElementById('hc-value').value);
  if (isNaN(value)) { alert('Enter a valid handicap value'); return; }
  const notes = document.getElementById('hc-notes').value.trim();
  const { error: hErr } = await sb.from('handicap_history').insert({
    player_id: playerId, handicap_value: value,
    changed_by: ST.player.id, notes: notes || null
  });
  if (hErr) { alert(hErr.message); return; }
  const { error: pErr } = await sb.from('players').update({ current_handicap: value }).eq('id', playerId);
  if (pErr) { alert(pErr.message); return; }
  const p = allPlayers.find(x => x.id === playerId);
  await renderPlayersTab();
  await openHandicapModal(playerId, p ? `${p.first_name} ${p.last_name}` : playerName);
}

// ── Admin events tab ──────────────────────────────────────────────────────
let adminEventsFilter = { mode: 'upcoming', from: '', to: '' };

function setAdminFilter(mode) {
  adminEventsFilter.mode = mode;
  if (mode !== 'range') { adminEventsFilter.from = ''; adminEventsFilter.to = ''; }
  renderAdminEvents();
}

function applyAdminDateRange() {
  adminEventsFilter.from = document.getElementById('admin-from').value;
  adminEventsFilter.to   = document.getElementById('admin-to').value;
  renderAdminEvents();
}

async function renderAdminEvents() {
  const today = new Date().toISOString().slice(0, 10);
  const { mode, from, to } = adminEventsFilter;

  let query = sb.from('events').select('*').order('event_date').order('start_time');
  if (mode === 'upcoming') {
    query = query.gte('event_date', today);
  } else if (mode === 'past') {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    query = query.lte('event_date', yesterday.toISOString().slice(0, 10));
  } else {
    if (from) query = query.gte('event_date', from);
    if (to)   query = query.lte('event_date', to);
    if (!from && !to) query = query.gte('event_date', '2000-01-01');
  }

  const { data: events } = await query;
  const el = document.getElementById('admin-event-list');

  const rangeInputs = mode === 'range' ? `
    <span class="admin-range-span">
      <input type="date" id="admin-from" value="${from}">
      <span class="range-sep">–</span>
      <input type="date" id="admin-to" value="${to}">
      <button class="btn-primary" style="font-size:13px;padding:5px 10px" onclick="applyAdminDateRange()">Apply</button>
    </span>` : '';

  el.innerHTML = `<div class="admin-filter-bar">
    <button class="admin-filter-btn${mode==='upcoming'?' active':''}" onclick="setAdminFilter('upcoming')">Upcoming</button>
    <button class="admin-filter-btn${mode==='past'?' active':''}" onclick="setAdminFilter('past')">Past</button>
    <button class="admin-filter-btn${mode==='range'?' active':''}" onclick="setAdminFilter('range')">Date Range</button>
    ${rangeInputs}
  </div>` + ((events||[]).length
    ? (events||[]).map(ev => `
      <div class="admin-event-row">
        <div>
          <div class="ev-info">${esc(ev.title)}</div>
          <div class="ev-sub">${fmtDate(ev.event_date)} · ${ev.start_time}–${ev.end_time}
            ${ev.max_signups ? ` · max ${ev.max_signups}` : ''}</div>
        </div>
        <div class="btn-row">
          <button class="btn-secondary" style="font-size:12px;padding:4px 8px"
            onclick="openEditEventForm('${ev.id}')">Edit</button>
          <button class="btn-danger" onclick="deleteEvent('${ev.id}')">Delete</button>
        </div>
      </div>`).join('')
    : '<p style="color:#666;margin-top:8px">No events in this period.</p>');

  document.getElementById('btn-generate-week').onclick = generateWeek;
  document.getElementById('btn-add-event').onclick = openAddEventForm;
}

async function generateWeek() {
  const { data: templates } = await sb.from('session_templates').select('*').eq('active', true);
  if (!templates?.length) { alert('No active templates.'); return; }
  const weekStart = getNextMonday();
  let created = 0;
  for (const tmpl of templates) {
    const date = dateForDow(weekStart, tmpl.day_of_week);
    const { data: existing } = await sb.from('events')
      .select('id').eq('template_id', tmpl.id).eq('event_date', date).limit(1);
    if (existing?.length) continue;
    const { error } = await sb.from('events').insert({
      title: tmpl.name, event_date: date,
      start_time: tmpl.start_time, end_time: tmpl.end_time,
      max_signups: tmpl.max_signups, template_id: tmpl.id, created_by: ST.player.id
    });
    if (!error) created++;
  }
  alert(`Created ${created} event(s) for next week.`);
  await renderAdminEvents();
}

function getNextMonday() {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  const diff = (1 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function dateForDow(mondayStr, dow) {
  const d = new Date(mondayStr + 'T12:00:00Z');
  const offset = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function openAddEventForm() {
  showFormModal('Add Event', `
    <div class="form-group"><label>Title</label><input type="text" id="ae-title"></div>
    <div class="form-group"><label>Date</label><input type="date" id="ae-date"></div>
    <div class="form-group"><label>Start time</label><input type="time" id="ae-start" value="18:30"></div>
    <div class="form-group"><label>End time</label><input type="time" id="ae-end" value="21:00"></div>
    <div class="form-group"><label>Max signups (optional)</label><input type="number" id="ae-max" min="1"></div>
    <div class="form-group"><label>Notes</label><input type="text" id="ae-notes"></div>
    <div style="text-align:right;margin-top:8px">
      <button class="btn-primary" onclick="submitAddEvent()">Create Event</button>
    </div>`);
}

async function submitAddEvent() {
  const body = {
    title:       document.getElementById('ae-title').value.trim(),
    event_date:  document.getElementById('ae-date').value,
    start_time:  document.getElementById('ae-start').value,
    end_time:    document.getElementById('ae-end').value,
    max_signups: parseInt(document.getElementById('ae-max').value) || null,
    notes:       document.getElementById('ae-notes').value.trim() || null,
    created_by:  ST.player.id
  };
  if (!body.title || !body.event_date || !body.start_time || !body.end_time) {
    alert('Title, date, and times are required'); return;
  }
  const { error } = await sb.from('events').insert(body);
  if (error) { alert(error.message); return; }
  closeFormModal();
  await renderAdminEvents();
}

function openEditEventForm(id) {
  sb.from('events').select('*').eq('id', id).single().then(({ data: ev }) => {
    if (!ev) return;
    showFormModal('Edit Event', `
      <div class="form-group"><label>Title</label><input type="text" id="ee-title" value="${esc(ev.title)}"></div>
      <div class="form-group"><label>Date</label><input type="date" id="ee-date" value="${ev.event_date}"></div>
      <div class="form-group"><label>Start time</label><input type="time" id="ee-start" value="${ev.start_time}"></div>
      <div class="form-group"><label>End time</label><input type="time" id="ee-end" value="${ev.end_time}"></div>
      <div class="form-group"><label>Max signups</label><input type="number" id="ee-max" value="${ev.max_signups ?? ''}"></div>
      <div class="form-group"><label>Notes</label><input type="text" id="ee-notes" value="${esc(ev.notes||'')}"></div>
      <div style="text-align:right;margin-top:8px">
        <button class="btn-primary" onclick="submitEditEvent('${id}')">Save</button>
      </div>`);
  });
}

async function submitEditEvent(id) {
  const body = {
    title:       document.getElementById('ee-title').value.trim(),
    event_date:  document.getElementById('ee-date').value,
    start_time:  document.getElementById('ee-start').value,
    end_time:    document.getElementById('ee-end').value,
    max_signups: parseInt(document.getElementById('ee-max').value) || null,
    notes:       document.getElementById('ee-notes').value.trim() || null
  };
  const { error } = await sb.from('events').update(body).eq('id', id);
  if (error) { alert(error.message); return; }
  closeFormModal();
  await renderAdminEvents();
}

async function deleteEvent(id) {
  if (!confirm('Delete this event and all its signups?')) return;
  const { error } = await sb.from('events').delete().eq('id', id);
  if (error) { alert(error.message); return; }
  await renderAdminEvents();
}

// ── Templates tab ─────────────────────────────────────────────────────────
const DOW_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

async function renderTemplatesTab() {
  const { data } = await sb.from('session_templates')
    .select('*').eq('active', true).order('day_of_week');
  ST.templates = data || [];
  const el = document.getElementById('templates-list');
  if (!ST.templates.length) { el.innerHTML = '<p style="color:#666">No templates yet.</p>'; return; }
  el.innerHTML = ST.templates.map(t => `
    <div class="admin-event-row">
      <div>
        <div class="ev-info">${esc(t.name)}</div>
        <div class="ev-sub">${DOW_NAMES[t.day_of_week]} · ${t.start_time}–${t.end_time}
          ${t.max_signups ? ` · max ${t.max_signups}` : ''}</div>
      </div>
      <div class="btn-row">
        <button class="btn-secondary" style="font-size:12px;padding:4px 8px"
          onclick="openEditTemplateForm('${t.id}')">Edit</button>
        <button class="btn-danger" onclick="deleteTemplate('${t.id}')">Delete</button>
      </div>
    </div>`).join('');
  document.getElementById('btn-add-template').onclick = openAddTemplateForm;
}

function dowOptions(selected) {
  return [1,2,3,4,5,6,0].map(d =>
    `<option value="${d}" ${d===selected?'selected':''}>${DOW_NAMES[d]}</option>`
  ).join('');
}

function openAddTemplateForm() {
  showFormModal('Add Template', `
    <div class="form-group"><label>Name</label><input type="text" id="at-name" placeholder="e.g. Monday Evening"></div>
    <div class="form-group"><label>Day</label><select id="at-dow">${dowOptions(1)}</select></div>
    <div class="form-group"><label>Start time</label><input type="time" id="at-start" value="18:30"></div>
    <div class="form-group"><label>End time</label><input type="time" id="at-end" value="21:00"></div>
    <div class="form-group"><label>Max signups (optional)</label><input type="number" id="at-max" min="1"></div>
    <div style="text-align:right;margin-top:8px">
      <button class="btn-primary" onclick="submitAddTemplate()">Add Template</button>
    </div>`);
}

async function submitAddTemplate() {
  const body = {
    name:        document.getElementById('at-name').value.trim(),
    day_of_week: parseInt(document.getElementById('at-dow').value),
    start_time:  document.getElementById('at-start').value,
    end_time:    document.getElementById('at-end').value,
    max_signups: parseInt(document.getElementById('at-max').value) || null,
    created_by:  ST.player.id
  };
  if (!body.name) { alert('Name required'); return; }
  const { error } = await sb.from('session_templates').insert(body);
  if (error) { alert(error.message); return; }
  closeFormModal();
  await renderTemplatesTab();
}

function openEditTemplateForm(id) {
  const t = ST.templates.find(x => x.id === id);
  if (!t) return;
  showFormModal('Edit Template', `
    <div class="form-group"><label>Name</label><input type="text" id="et-name" value="${esc(t.name)}"></div>
    <div class="form-group"><label>Day</label><select id="et-dow">${dowOptions(t.day_of_week)}</select></div>
    <div class="form-group"><label>Start time</label><input type="time" id="et-start" value="${t.start_time}"></div>
    <div class="form-group"><label>End time</label><input type="time" id="et-end" value="${t.end_time}"></div>
    <div class="form-group"><label>Max signups</label><input type="number" id="et-max" value="${t.max_signups??''}"></div>
    <div style="text-align:right;margin-top:8px">
      <button class="btn-primary" onclick="submitEditTemplate('${id}')">Save</button>
    </div>`);
}

async function submitEditTemplate(id) {
  const body = {
    name:        document.getElementById('et-name').value.trim(),
    day_of_week: parseInt(document.getElementById('et-dow').value),
    start_time:  document.getElementById('et-start').value,
    end_time:    document.getElementById('et-end').value,
    max_signups: parseInt(document.getElementById('et-max').value) || null
  };
  const { error } = await sb.from('session_templates').update(body).eq('id', id);
  if (error) { alert(error.message); return; }
  closeFormModal();
  await renderTemplatesTab();
}

async function deleteTemplate(id) {
  if (!confirm('Deactivate this template?')) return;
  const { error } = await sb.from('session_templates').update({ active: false }).eq('id', id);
  if (error) { alert(error.message); return; }
  await renderTemplatesTab();
}

// ── Modals ────────────────────────────────────────────────────────────────
function setupModalClose() {
  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('form-close').onclick   = closeFormModal;
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('form-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeFormModal();
  });
}

function openModal()      { document.getElementById('modal-overlay').classList.remove('hidden'); }
function closeModal()     { document.getElementById('modal-overlay').classList.add('hidden'); }
function closeFormModal() { document.getElementById('form-overlay').classList.add('hidden'); }

function showFormModal(title, bodyHtml) {
  document.getElementById('form-title').textContent = title;
  document.getElementById('form-body').innerHTML = bodyHtml;
  document.getElementById('form-overlay').classList.remove('hidden');
}

// ── Utilities ─────────────────────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function shortName(first, last) {
  if (!first) return '';
  return last ? `${first} ${String(last)[0].toUpperCase()}.` : first;
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined,
    { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDatetime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined,
    { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function ensurePlayers() {
  if (!ST.players.length) {
    const { data } = await sb.from('players').select('*').eq('active', true).order('last_name');
    ST.players = data || [];
  }
}

document.getElementById('view-app').addEventListener('click', () => ensurePlayers(), { once: true });

// ── Reports tab ───────────────────────────────────────────────────────────
async function renderReportsTab() {
  const el = document.getElementById('tab-reports');
  el.innerHTML = '<p style="color:#888;padding:8px 0">Loading...</p>';

  const cutoff  = new Date();
  cutoff.setDate(cutoff.getDate() - 91);
  const fromDate = cutoff.toISOString().slice(0, 10);
  const today    = new Date().toISOString().slice(0, 10);

  const [{ data: events }, { data: templates }] = await Promise.all([
    sb.from('events')
      .select('id, title, event_date, max_signups, template_id, signups(id, is_reserve)')
      .gte('event_date', fromDate)
      .lte('event_date', today)
      .order('event_date'),
    sb.from('session_templates').select('id, name')
  ]);

  if (!events?.length) {
    el.innerHTML = '<p style="color:#888;padding:8px 0">No historical data yet.</p>';
    return;
  }

  const weekMap   = {};
  const tmplMap   = {};
  const tmplNames = Object.fromEntries((templates || []).map(t => [t.id, t.name]));

  for (const ev of events) {
    const confirmed = (ev.signups || []).filter(s => !s.is_reserve).length;
    const reserve   = (ev.signups || []).filter(s =>  s.is_reserve).length;
    const d   = new Date(ev.event_date + 'T12:00:00');
    const mon = getMondayOfDate(d);
    const key = mon.toISOString().slice(0, 10);
    if (!weekMap[key]) {
      weekMap[key] = {
        confirmed: 0, reserve: 0,
        label: mon.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
      };
    }
    weekMap[key].confirmed += confirmed;
    weekMap[key].reserve   += reserve;
    if (ev.template_id && ev.max_signups) {
      if (!tmplMap[ev.template_id]) {
        tmplMap[ev.template_id] = { name: tmplNames[ev.template_id] || ev.title, total: 0, count: 0 };
      }
      tmplMap[ev.template_id].total += Math.round((confirmed / ev.max_signups) * 100);
      tmplMap[ev.template_id].count++;
    }
  }

  const totalSessions  = events.length;
  const totalConfirmed = events.reduce((s, ev) => s + (ev.signups||[]).filter(x=>!x.is_reserve).length, 0);
  const totalCapacity  = events.reduce((s, ev) => s + (ev.max_signups || 0), 0);
  const avgFill = totalCapacity ? Math.round((totalConfirmed / totalCapacity) * 100) : 0;

  const weeks      = Object.keys(weekMap).sort();
  const weekLabels = weeks.map(k => weekMap[k].label);
  const weekConf   = weeks.map(k => weekMap[k].confirmed);
  const weekRes    = weeks.map(k => weekMap[k].reserve);
  const tmplIds    = Object.keys(tmplMap);
  const tmplLabels = tmplIds.map(id => tmplMap[id].name);
  const tmplAvg    = tmplIds.map(id => Math.round(tmplMap[id].total / tmplMap[id].count));

  el.innerHTML = `
    <div class="stats-row">
      <div class="stat-box"><div class="stat-num">${totalSessions}</div><div class="stat-label">Sessions (13 wks)</div></div>
      <div class="stat-box"><div class="stat-num">${totalConfirmed}</div><div class="stat-label">Total Attendees</div></div>
      <div class="stat-box"><div class="stat-num">${avgFill}%</div><div class="stat-label">Avg Fill Rate</div></div>
    </div>
    <div class="reports-grid">
      <div class="report-card">
        <div class="report-title">Weekly Attendance</div>
        <div class="chart-wrap"><canvas id="chart-weekly"></canvas></div>
      </div>
      <div class="report-card">
        <div class="report-title">Avg Fill Rate by Session <span style="font-size:11px;font-weight:400;color:#888">(red = over capacity)</span></div>
        <div class="chart-wrap"><canvas id="chart-fillrate"></canvas></div>
      </div>
    </div>`;

  new Chart(document.getElementById('chart-weekly'), {
    type: 'bar',
    data: {
      labels: weekLabels,
      datasets: [
        { label: 'Confirmed', data: weekConf, backgroundColor: 'rgba(27,42,107,0.85)', borderRadius: 3 },
        { label: 'Reserve',   data: weekRes,  backgroundColor: 'rgba(196,147,42,0.75)', borderRadius: 3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { font: { size: 12 } } } },
      scales: {
        x: { stacked: true, ticks: { font: { size: 11 } } },
        y: { stacked: true, beginAtZero: true }
      }
    }
  });

  new Chart(document.getElementById('chart-fillrate'), {
    type: 'bar',
    data: {
      labels: tmplLabels,
      datasets: [{
        label: 'Avg Fill %',
        data: tmplAvg,
        backgroundColor: tmplAvg.map(v => v > 100 ? 'rgba(192,57,43,0.8)' : 'rgba(27,42,107,0.8)'),
        borderRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          max: tmplAvg.length ? Math.max(130, ...tmplAvg) + 10 : 130,
          ticks: { callback: v => v + '%' }
        }
      }
    }
  });
}

function getMondayOfDate(d) {
  const day  = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon  = new Date(d);
  mon.setDate(d.getDate() + diff);
  return mon;
}
