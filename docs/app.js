/* app.js — Squash Club SPA (Supabase, phone login) */
'use strict';

// ── Version guard — forces hard reload when app updates ───────────────────
const APP_VERSION = '4.96';;;
(function() {
  const stored = localStorage.getItem('_app_ver');
  if (stored !== APP_VERSION) {
    localStorage.setItem('_app_ver', APP_VERSION);
    // Guard against reload loop: only skip if URL already has THIS exact version
    if (!location.search.includes('_cb=' + APP_VERSION)) {
      location.replace(location.pathname + '?_cb=' + APP_VERSION);
    }
  }
})();

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

function footerInstall() {
  if (deferredInstallPrompt) { triggerInstall(); return; }
  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent) && !window.MSStream;
  const body = isIOS
    ? `<p style="margin-bottom:12px">To install on your iPhone/iPad:</p>
       <ol style="padding-left:20px;line-height:2">
         <li>Tap the <strong>Share</strong> button (the box with an arrow)</li>
         <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
         <li>Tap <strong>Add</strong></li>
       </ol>`
    : `<p style="margin-bottom:12px">To install on your device:</p>
       <ol style="padding-left:20px;line-height:2">
         <li>Tap the browser menu <strong>⋮</strong></li>
         <li>Tap <strong>"Add to Home Screen"</strong> or <strong>"Install App"</strong></li>
         <li>Tap <strong>Add</strong></li>
       </ol>
       <p style="margin-top:12px;font-size:12px;color:#999">Best supported in Chrome (Android) or Safari (iOS).</p>`;
  showFormModal('Install as App', body);
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
  // Remote version check — detects when PWA is serving a stale cached app.js
  try {
    const res = await fetch('version.json?_t=' + Date.now(), { cache: 'no-store' });
    const { version, build } = await res.json();
    const storedBuild = localStorage.getItem('_app_build');
    const versionMismatch = version && version !== APP_VERSION;
    const buildMismatch   = build && build !== storedBuild;
    if (versionMismatch || buildMismatch) {
      if (build) localStorage.setItem('_app_build', build);
      location.replace(location.pathname + '?_cb=' + (build || version || APP_VERSION));
      return;
    }
  } catch (e) { /* offline or fetch failed — continue normally */ }

  setupNav();
  setupModalClose();
  setupUserSwitcher();

  document.getElementById('login-phone').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitLoginPhone();
  });

  document.getElementById('btn-home-switch')?.addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('home-switcher-dropdown').classList.toggle('hidden');
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#home-user-switcher-wrap')) {
      document.getElementById('home-switcher-dropdown')?.classList.add('hidden');
    }
  });

  // Restore session from localStorage
  const saved = localStorage.getItem('squash_player');
  if (saved) {
    try {
      const cached = JSON.parse(saved);
      const { data } = await sb.from('players').select('*').eq('id', cached.id).maybeSingle();
      if (data && data.active && !data.pending) {
        loginSuccess(data, 'session_resume');
        return;
      }
    } catch (_) { /* ignore */ }
    localStorage.removeItem('squash_player');
  }
  showView('login');
});

// ── Audit logging ─────────────────────────────────────────────────────────
async function auditLog(eventType, payload = {}) {
  try {
    await sb.from('audit_log').insert({
      event_type:  eventType,
      player_id:   payload.playerId   || null,
      player_name: payload.playerName || null,
      phone:       payload.phone      || null,
      user_agent:  navigator.userAgent.slice(0, 300),
      details:     payload.details    || null
    });
  } catch (_) { /* never interrupt the user flow */ }
}

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

  const { data: players, error: fetchErr } = await sb.from('players')
    .select('*').not('phone', 'is', null);

  if (fetchErr) {
    auditLog('login_error', { phone, details: { error: fetchErr.message, stage: 'players_fetch' } });
    errEl.textContent = 'Error connecting. Please try again.';
    return;
  }

  const match = (players || []).find(p => normalizePhone(p.phone) === normInput);

  if (match) {
    if (match.pending) {
      auditLog('login_pending', { playerId: match.id, playerName: `${match.first_name} ${match.last_name}`, phone });
      showOnboardStep('pending');
      return;
    }
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
    auditLog('login_not_found', { phone, details: { stage: 'phone_lookup' } });
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
  auditLog('registration_submitted', { playerName: `${first} ${last}`, phone, details: { first_name: first, last_name: last } });
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
  const el = document.getElementById('home-admin-pending');
  if (el) {
    el.textContent = count > 0 ? `${count} pending approval${count > 1 ? 's' : ''}` : '';
    el.className = count > 0 ? 'home-admin-badge' : 'home-admin-badge hidden';
  }
}

function loginSuccess(player, source = 'session_start') {
  if (!player.active) { showOnboardStep('pending'); return; }
  auditLog(source, { playerId: player.id, playerName: `${player.first_name} ${player.last_name}` });
  ST.player = player;
  localStorage.setItem('squash_player', JSON.stringify(player));
  showView('app');
  showSection('view-home');
  loadHome();
  document.getElementById('home-user-switcher-wrap').classList.add('hidden');
  if (player.is_super_admin) loadUserSwitcher();
  showInstallBanner();
  if (!isStandalone()) {
    document.getElementById('btn-install-footer')?.classList.remove('hidden');
  }
}

// ── User switcher ─────────────────────────────────────────────────────────
function setupUserSwitcher() {
  // Switcher is now in the home footer — event listeners set up in DOMContentLoaded
}

async function loadUserSwitcher() {
  const { data } = await sb.from('players')
    .select('id, first_name, last_name')
    .eq('active', true).order('last_name');
  if (!data?.length) return;
  const dropdown = document.getElementById('home-switcher-dropdown');
  dropdown.innerHTML = data.map(p =>
    `<button class="switcher-item${p.id === ST.player.id ? ' active-user' : ''}"
      onclick="switchUser('${p.id}')">${esc(p.first_name)} ${esc(p.last_name)}</button>`
  ).join('');
  document.getElementById('home-user-switcher-wrap').classList.remove('hidden');
}

async function switchUser(playerId) {
  document.getElementById('home-switcher-dropdown')?.classList.add('hidden');
  const { data } = await sb.from('players').select('*').eq('id', playerId).single();
  if (!data) { alert('Player not found'); return; }
  ST.players = [];
  localStorage.setItem('squash_player', JSON.stringify(data));
  loginSuccess(data);
}

// ── Navigation ────────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadAdminTab(btn.dataset.tab);
    });
  });

  document.getElementById('btn-back-schedule').addEventListener('click', () => {
    showSection('view-schedule');
  });
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  if (name === 'login')   document.getElementById('view-login').classList.remove('hidden');
  if (name === 'app')     document.getElementById('view-app').classList.remove('hidden');
  if (name === 'onboard') document.getElementById('view-onboard').classList.remove('hidden');
}

function showSection(id) {
  ['view-home','view-schedule','view-event','view-ladder','view-hof','view-admin','view-player','view-audit'].forEach(s => {
    document.getElementById(s)?.classList.add('hidden');
  });
  document.getElementById(id).classList.remove('hidden');
  document.getElementById('btn-back-home').classList.toggle('hidden', id === 'view-home');
  const appFooter = document.getElementById('app-footer');
  if (appFooter) appFooter.classList.toggle('hidden', id === 'view-home');
  const titles = {
    'view-home': '', 'view-schedule': 'Sign-Up', 'view-ladder': 'Handicaps',
    'view-hof': 'Hall of Fame', 'view-admin': 'Admin', 'view-event': 'Session',
    'view-player': '', 'view-audit': 'Audit Log'
  };
  const titleEl = document.getElementById('header-page-title');
  if (titleEl) titleEl.textContent = titles[id] ?? '';
  // Reset back button to Home
  const backBtn = document.getElementById('btn-back-home');
  if (backBtn) { backBtn.textContent = '← Home'; backBtn.onclick = goHome; }
}

function setNavActive(name) { /* no-op: nav tabs removed */ }

function goHome() {
  showSection('view-home');
  loadHome();
}

function goToAdmin() {
  if (!ST.player?.is_admin) return;
  showSection('view-admin');
  loadAdminTab('tab-players');
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
let ladderStatusFilter = 'active';   // 'active' | 'inactive' | 'all'
let playerHistoryArr  = {};
let ladderMonths      = [];
let ladderYearMode    = 'last12';    // 'last12' | 'YYYY'
let ladderAllYears    = [];
let ladderSectionView = 'list';
let moversTopN        = 10;
let _playerHcChart    = null;
let _distChart        = null;

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

// Derive ladderMonths from ladderYearMode
function computeLadderMonths() {
  const now = new Date();
  if (ladderYearMode === 'last12') {
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    return getLadderWindowMonths(monthKey(start));
  }
  const year = parseInt(ladderYearMode);
  if (year === now.getFullYear()) {
    // Current year: Jan through this month only
    const months = [];
    for (let m = 1; m <= now.getMonth() + 1; m++)
      months.push(`${year}.${String(m).padStart(2, '0')}`);
    return months;
  }
  return getLadderWindowMonths(`${year}.01`);
}

function effectiveHcAt(playerId, targetMonth) {
  const hist = playerHistoryArr[playerId] || [];
  let result = null;
  for (const entry of hist) {
    if (entry.month <= targetMonth) result = entry.value;
    else break;
  }
  return result;
}

// Like effectiveHcAt but falls back to first known entry if no data at/before targetMonth
function effectiveHcAtOrFirst(playerId, targetMonth) {
  const hist = playerHistoryArr[playerId] || [];
  if (!hist.length) return null;
  let result = null;
  for (const entry of hist) {
    if (entry.month <= targetMonth) result = entry.value;
    else break;
  }
  return result ?? hist[0].value;
}


// Returns number of calendar months between two YYYY.MM keys
function monthsDiff(fromKey, toKey) {
  const [fy, fm] = fromKey.split('.').map(Number);
  const [ty, tm] = toKey.split('.').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

// Compute HC trend from hist=[{month,value}] sorted asc (playerHistoryArr format)
// Returns {delta, months} using 12m if available, else oldest entry; null if no data
function computeHcTrendFromArr(currentHc, hist) {
  if (currentHc == null || !hist?.length) return null;
  const nowKey  = monthKey(new Date());
  const ago12   = new Date(); ago12.setDate(1); ago12.setMonth(ago12.getMonth() - 12);
  const cut12   = monthKey(ago12);
  let pastHc = null;
  for (const e of hist) {
    if (e.month <= cut12) pastHc = e.value;
    else break;
  }
  if (pastHc !== null) return { delta: currentHc - pastHc, months: 12 };
  const months = monthsDiff(hist[0].month, nowKey);
  if (months < 1) return null;
  return { delta: currentHc - hist[0].value, months };
}

// Render HC trend span from {delta, months}
function hcTrendHtml(delta, months) {
  const lbl = `${months} month${months !== 1 ? 's' : ''}`;
  if (delta < 0) return `<span class="myhc-trend improved">Handicap has improved ${Math.abs(delta)} in ${lbl}</span>`;
  if (delta > 0) return `<span class="myhc-trend worsened">Handicap has worsened ${delta} in ${lbl}</span>`;
  return `<span class="myhc-trend flat">Handicap unchanged in ${lbl}</span>`;
}

function hasActualEntry(playerId, month) {
  return (playerHistoryArr[playerId] || []).some(e => e.month === month);
}

function getFilteredPlayers() {
  const q = ladderSearch.toLowerCase();
  return ladderPlayers.filter(p => {
    if (ladderStatusFilter === 'active'   && !p.active) return false;
    if (ladderStatusFilter === 'inactive' &&  p.active) return false;
    if (q && !`${p.first_name} ${p.last_name}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

async function loadLadder() {
  ladderSectionView = 'list';   // always reset to Player List on tab entry

  const [{ data: players }, { data: history }] = await Promise.all([
    sb.from('players')
      .select('id, first_name, last_name, current_handicap, active')
      .eq('pending', false)
      .order('current_handicap', { ascending: true, nullsFirst: false })
      .order('last_name').order('first_name'),
    sb.from('handicap_history')
      .select('player_id, handicap_value, changed_at')
      .order('changed_at')
  ]);

  ladderPlayers = players || [];

  const tempMap = {};
  const yearSet = new Set();
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
  // Always include current year in the dropdown
  const curYrStr = String(new Date().getFullYear());
  if (!ladderAllYears.includes(curYrStr)) ladderAllYears.push(curYrStr);

  ladderMonths = computeLadderMonths();

  renderLadder();
}

function renderLadder() {
  const wrap = document.getElementById('ladder-wrap');
  wrap.innerHTML = `
    <div class="hc-top-row">
      <div id="ladder-my-card" class="home-card home-card-me"></div>
      <div id="ladder-section-card" class="home-card home-card-ladder"></div>
    </div>
    <div id="ladder-view-toggle"></div>
    <div id="ladder-filter-bar"></div>
    <div id="ladder-section-history"></div>`;

  renderMyHcCard();
  renderSectionCard();
  renderViewToggle();
  renderFilterBar();
  renderSectionHistory();
}

// ── Shared filter bar ─────────────────────────────────────────────────────
function renderFilterBar() {
  const el = document.getElementById('ladder-filter-bar');
  if (!el) return;
  el.innerHTML = `
    <div class="ladder-filter-row">
      <input type="text" id="ladder-search" class="players-search"
        placeholder="Search players…" autocomplete="off" value="${esc(ladderSearch)}">
      <div class="players-role-btns">
        <button class="role-btn${ladderStatusFilter === 'active' ? ' active' : ''}" onclick="setLadderStatus('active')">Active</button>
        <button class="role-btn${ladderStatusFilter === 'all'    ? ' active' : ''}" onclick="setLadderStatus('all')">All</button>
        <button class="role-btn" onclick="openHcCalculator()">HC Calc</button>
      </div>
    </div>`;
  document.getElementById('ladder-search').addEventListener('input', e => {
    ladderSearch = e.target.value;
    renderSectionHistory();
  });
}

function setLadderStatus(status) {
  ladderStatusFilter = status;
  renderFilterBar();
  renderSectionHistory();
}

// ── My HC card ────────────────────────────────────────────────────────────
function renderMyHcCard() {
  // Use active-only rank for "My HC" card regardless of status filter
  const activePlayers = ladderPlayers.filter(p => p.active);
  const myIdx = activePlayers.findIndex(p => p.id === ST.player.id);
  const me    = myIdx >= 0 ? activePlayers[myIdx] : null;
  const el    = document.getElementById('ladder-my-card');
  if (!me) { el.innerHTML = '<p style="color:#888;font-size:13px">Not on the ladder yet.</p>'; return; }

  const currentHc = me.current_handicap;

  const _trend = computeHcTrendFromArr(currentHc, playerHistoryArr[me.id]);
  const commentHtml = _trend ? hcTrendHtml(_trend.delta, _trend.months) : '';

  el.innerHTML = `
    <div class="myhc-header" style="cursor:pointer" onclick="openPlayerView('${me.id}','view-home')">
      <div style="flex:1;min-width:0">
        <div class="myhc-name">${esc(me.first_name)} ${esc(me.last_name)}</div>
        <div class="myhc-rank">#${myIdx + 1} of ${activePlayers.length}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="myhc-big">${currentHc ?? '–'}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.55)">handicap</div>
      </div>
    </div>
    ${commentHtml ? `<div style="margin-top:6px;font-size:13px;font-weight:700">${commentHtml}</div>` : ''}
    <div class="home-card-link" style="padding-top:8px" onclick="openPlayerView('${me.id}','view-home')">View full history →</div>`;
}

// ── Section summary card ──────────────────────────────────────────────────
function renderSectionCard() {
  const el = document.getElementById('ladder-section-card');
  const fp = getFilteredPlayers();
  if (!fp.length) { el.innerHTML = ''; return; }

  const startM = ladderMonths[0];
  const endM   = ladderMonths[ladderMonths.length - 1];
  let improved = 0, worsened = 0;
  for (const p of fp) {
    const s = effectiveHcAtOrFirst(p.id, startM), e = effectiveHcAt(p.id, endM);
    if (s == null || e == null) continue;
    if (e < s) improved++; else if (e > s) worsened++;
  }
  const validHcs = fp.map(p => p.current_handicap).filter(v => v != null);
  const avgHc    = validHcs.length
    ? (validHcs.reduce((a, b) => a + b, 0) / validHcs.length).toFixed(1) : '–';

  const views = [
    { v: 'list',         label: 'Player List'  },
    { v: 'grid',         label: 'Grid'         },
    { v: 'movers',       label: 'Movers'       },
    { v: 'distribution', label: 'Distribution' },
  ];

  el.innerHTML = `
    <div class="home-card-label">Handicaps</div>
    <div class="home-card-sublabel">Last 12 Months · Active Players</div>
    <div class="home-hc-grid">
      <div class="home-hc-stat"><div class="home-hc-val">${fp.length}</div><div class="home-hc-lbl">Players</div></div>
      <div class="home-hc-stat"><div class="home-hc-val">${avgHc}</div><div class="home-hc-lbl">Avg HC</div></div>
      <div class="home-hc-stat"><div class="home-hc-val sec-improved"><span class="hc-tri">▲</span>${improved}</div><div class="home-hc-lbl">Improved</div></div>
      <div class="home-hc-stat"><div class="home-hc-val sec-worsened"><span class="hc-tri">▼</span>${worsened}</div><div class="home-hc-lbl">Worsened</div></div>
    </div>`;
}

function renderViewToggle() {
  const el = document.getElementById('ladder-view-toggle');
  if (!el) return;
  const views = [
    { v: 'list',         label: 'Player List'  },
    { v: 'grid',         label: 'Grid'         },
    { v: 'movers',       label: 'Movers'       },
    { v: 'distribution', label: 'Distribution' },
  ];
  el.innerHTML = `<div class="hc-view-toggle">
    ${views.map(({ v, label }) =>
      `<button class="hc-toggle-btn${ladderSectionView === v ? ' active' : ''}"
        data-view="${v}" onclick="setLadderView('${v}')">${label}</button>`
    ).join('')}
  </div>`;
}

function setLadderView(v) {
  ladderSectionView = v;
  renderViewToggle();
  renderSectionHistory();
}

function renderSectionHistory() {
  const el = document.getElementById('ladder-section-history');
  if (!el) return;
  if      (ladderSectionView === 'grid')         renderSectionGrid(el);
  else if (ladderSectionView === 'distribution') renderDistributionView(el);
  else if (ladderSectionView === 'movers')       renderMoversView(el);
  else                                           renderPlayerListView(el);
}

// ── Navigation helpers ────────────────────────────────────────────────────
function ladderNavBar() {
  const isLast12  = ladderYearMode === 'last12';
  const curYear   = String(new Date().getFullYear());
  const minYear   = ladderAllYears[0];

  const yearOpts  = [
    `<option value="last12"${isLast12 ? ' selected' : ''}>Last 12 months</option>`,
    ...[...ladderAllYears].reverse().map(y =>
      `<option value="${y}"${!isLast12 && ladderYearMode === y ? ' selected' : ''}>${y}</option>`)
  ].join('');

  const prevDis = isLast12 || ladderYearMode <= minYear ? ' disabled' : '';
  const nextDis = isLast12 || ladderYearMode >= curYear ? ' disabled' : '';

  return `<div class="hc-nav-bar">
    <button class="hc-nav-btn"${prevDis} onclick="ladderNavPrev()">◀ Prev</button>
    <select class="hc-nav-year" onchange="ladderNavYear(this.value)">${yearOpts}</select>
    <button class="hc-nav-btn"${nextDis} onclick="ladderNavNext()">Next ▶</button>
  </div>`;
}

function ladderNavPrev() {
  if (ladderYearMode === 'last12') return;
  ladderYearMode = String(parseInt(ladderYearMode) - 1);
  ladderMonths = computeLadderMonths();
  renderMyHcCard(); renderSectionCard(); renderSectionHistory();
}

function ladderNavNext() {
  if (ladderYearMode === 'last12') return;
  const next = parseInt(ladderYearMode) + 1;
  if (next > new Date().getFullYear()) return;
  ladderYearMode = String(next);
  ladderMonths = computeLadderMonths();
  renderMyHcCard(); renderSectionCard(); renderSectionHistory();
}

function ladderNavYear(val) {
  ladderYearMode = val;
  ladderMonths = computeLadderMonths();
  renderMyHcCard(); renderSectionCard(); renderSectionHistory();
}

// ── Grid view ─────────────────────────────────────────────────────────────
function renderSectionGrid(el) {
  const fp          = getFilteredPlayers().filter(p => playerHistoryArr[p.id]);
  const headerCells = ladderMonths.map(m => `<th>${m}</th>`).join('');
  const rows = fp.map(p => {
    const isMe  = p.id === ST.player.id;
    const cells = ladderMonths.map((m, i) => {
      const val = effectiveHcAt(p.id, m);
      if (val == null) return '<td></td>';
      let cls = '';
      if (hasActualEntry(p.id, m)) {
        const prev = i > 0 ? effectiveHcAt(p.id, ladderMonths[i - 1]) : null;
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
        onclick="openPlayerView('${p.id}','view-ladder')">${nm}</td>${cells}</tr>`;
  }).join('');
  el.innerHTML = `${ladderNavBar()}
    <div class="hc-grid-wrap">
      <table class="hc-grid">
        <thead><tr><th class="hcg-name">Name</th>${headerCells}</tr></thead>
        <tbody>${rows || '<tr><td colspan="13" style="color:#888;padding:12px">No history data.</td></tr>'}</tbody>
      </table>
    </div>`;
}

// ── Player List view ──────────────────────────────────────────────────────
function renderPlayerListView(el) {
  const fp = getFilteredPlayers();
  // Rank within active players for display
  const activeSorted = ladderPlayers.filter(p => p.active);
  el.innerHTML = fp.length
    ? `<table class="data-table">
        <thead><tr><th>#</th><th>Name</th><th>Handicap</th></tr></thead>
        <tbody>${fp.map(p => {
          const rank = activeSorted.indexOf(p) + 1;
          const isMe = p.id === ST.player.id;
          return `<tr${isMe ? ' class="ladder-me"' : ''} style="cursor:pointer"
            onclick="openPlayerView('${p.id}','view-ladder')">
            <td style="color:#888;width:36px">${rank || '–'}</td>
            <td>${esc(p.first_name)} ${esc(p.last_name)}${!p.active ? ' <span style="font-size:10px;color:#aaa">(inactive)</span>' : ''}</td>
            <td><span class="hcap-badge">${p.current_handicap ?? '–'}</span></td>
          </tr>`;
        }).join('')}</tbody>
      </table>`
    : '<p style="color:#888;padding:12px 0">No players found.</p>';
}

// ── Distribution view ─────────────────────────────────────────────────────
function renderDistributionView(el) {
  const fp = getFilteredPlayers().filter(p => p.current_handicap != null);
  const buckets = {};
  for (const p of fp) {
    const b = Math.floor(p.current_handicap / 5) * 5;
    buckets[b] = (buckets[b] || 0) + 1;
  }
  const sorted = Object.keys(buckets).map(Number).sort((a, b) => a - b);
  const labels = sorted.map(b => `${b} to ${b + 4}`);
  const data   = sorted.map(b => buckets[b]);
  el.innerHTML = '<div style="height:260px;padding:8px 0"><canvas id="dist-chart"></canvas></div>';
  setTimeout(() => {
    const ctx = document.getElementById('dist-chart')?.getContext('2d');
    if (!ctx) return;
    if (_distChart) { _distChart.destroy(); _distChart = null; }
    _distChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: 'rgba(27,42,107,.65)', borderColor: 'var(--bc-navy)', borderWidth: 1, borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.raw} player${c.raw !== 1 ? 's' : ''}` } } },
        scales: {
          x: { title: { display: true, text: 'Handicap range' } },
          y: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: 'Players' } }
        }
      }
    });
  }, 0);
}

// ── Movers view ───────────────────────────────────────────────────────────
function setMoversTopN(n) {
  moversTopN = n;
  const el = document.getElementById('ladder-section-history');
  if (el) renderMoversView(el);
}

function renderMoversView(el) {
  const fp     = getFilteredPlayers();
  const startM = ladderMonths[0], endM = ladderMonths[ladderMonths.length - 1];
  const withDelta = fp.map(p => {
    const s = effectiveHcAtOrFirst(p.id, startM), e = effectiveHcAt(p.id, endM);
    return { p, delta: (s != null && e != null) ? e - s : null };
  }).filter(x => x.delta !== null);

  const allImproved = withDelta.filter(x => x.delta < 0).sort((a, b) => a.delta - b.delta);
  const allWorsened = withDelta.filter(x => x.delta > 0).sort((a, b) => b.delta - a.delta);
  const unchanged   = withDelta.filter(x => x.delta === 0).length;
  const improved    = moversTopN ? allImproved.slice(0, moversTopN) : allImproved;
  const worsened    = moversTopN ? allWorsened.slice(0, moversTopN) : allWorsened;

  const topNOptions = [5, 10, 20, 0];
  const topNBar = `<div class="movers-topn-bar">
    Show top:
    ${topNOptions.map(n =>
      `<button class="movers-topn-btn${moversTopN === n ? ' active' : ''}" onclick="setMoversTopN(${n})">${n === 0 ? 'All' : n}</button>`
    ).join('')}
  </div>`;

  function moverRow({ p, delta }) {
    const isMe = p.id === ST.player.id;
    const sign = delta < 0 ? `<span class="hc-tri">▲</span> ${Math.abs(delta)}` : `<span class="hc-tri">▼</span> +${delta}`;
    const cls  = delta < 0 ? 'lb-improved' : 'lb-worsened';
    return `<div class="hc-lb-row${isMe ? ' ladder-me-lb' : ''}">
      <span class="hc-lb-delta ${cls}">${sign}</span>
      <span class="hc-lb-name" onclick="openPlayerView('${p.id}','view-ladder')">${esc(p.first_name)} ${esc(p.last_name)}</span>
      <span class="hc-lb-hc">${p.current_handicap ?? '–'}</span>
    </div>`;
  }

  el.innerHTML = `${ladderNavBar()}
    ${topNBar}
    <div class="movers-grid">
      ${improved.length ? `<div class="hc-lb-section">
        <div class="hc-lb-title">Improved</div>
        ${improved.map(moverRow).join('')}
        ${allImproved.length > improved.length ? `<div class="movers-more">… ${allImproved.length - improved.length} more</div>` : ''}
      </div>` : ''}
      ${worsened.length ? `<div class="hc-lb-section">
        <div class="hc-lb-title">Worsened</div>
        ${worsened.map(moverRow).join('')}
        ${allWorsened.length > worsened.length ? `<div class="movers-more">… ${allWorsened.length - worsened.length} more</div>` : ''}
      </div>` : ''}
    </div>
    ${!withDelta.length ? '<p style="color:#888;font-size:13px;padding:12px 0">Not enough data for this period.</p>' : ''}
    ${unchanged ? `<p style="color:#aaa;font-size:12px;margin-top:8px">${unchanged} player${unchanged !== 1 ? 's' : ''} unchanged</p>` : ''}`;
}

let _playerHcSeries = [];  // filled monthly series: [{month, value, isActual, notes}]
let _playerHcPeriod = 'all';
let _playerModalTab  = 'hc';   // 'hc' | 'attendance'
let _playerAttendanceData = null;
let _playerReturnView = 'view-home';
let _playerModalId   = null;
let _playerModalName = '';
let _playerSignupCount12m = 0;

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

async function openPlayerView(playerId, returnView = 'view-home') {
  _playerHcPeriod = 'all';
  _playerModalTab  = 'hc';
  _playerReturnView = returnView;
  _playerModalId   = playerId;
  const _p = (ladderPlayers || []).find(p => p.id === playerId)
    || (ST.player?.id === playerId ? ST.player : null);
  _playerModalName = _p ? `${_p.first_name} ${_p.last_name}` : '';
  showSection('view-player');
  const backBtn = document.getElementById('btn-back-home');
  if (backBtn) { backBtn.textContent = '← Back'; backBtn.onclick = goBackFromPlayerView; }

  document.getElementById('player-view-wrap').innerHTML =
    '<p style="color:#888;padding:16px 0">Loading…</p>';

  const [{ data: history }, { data: attendanceSups }] = await Promise.all([
    sb.from('handicap_history')
      .select('handicap_value, changed_at, notes')
      .eq('player_id', playerId)
      .order('changed_at', { ascending: true }),
    sb.from('signups')
      .select('events(event_date)')
      .eq('player_id', playerId)
      .eq('is_reserve', false)
  ]);

  _playerHcSeries = history?.length ? buildFilledSeries(history) : [];
  _playerAttendanceData = attendanceSups || [];
  _playerSignupCount12m = 0;
  if (_playerAttendanceData.length) {
    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    _playerSignupCount12m = _playerAttendanceData
      .filter(s => s.events?.event_date >= cutoffStr).length;
  }

  renderPlayerModal();
}

function goBackFromPlayerView() {
  showSection(_playerReturnView || 'view-home');
}

function buildPlayerBannerHtml() {
  const player = (ladderPlayers || []).find(p => p.id === _playerModalId) || ST.player;
  const hc = player?.current_handicap;
  const activeSorted = (ladderPlayers || []).filter(p => p.active)
    .sort((a, b) => (a.current_handicap ?? 99) - (b.current_handicap ?? 99));
  const rank = activeSorted.findIndex(p => p.id === _playerModalId);
  const rankStr = rank >= 0 ? `#${rank + 1} of ${activeSorted.length}` : '';

  let commentHtml = '';
  {
    // Use playerHistoryArr if loaded (from ladder), else derive from _playerHcSeries
    const hist = playerHistoryArr[_playerModalId]?.length
      ? playerHistoryArr[_playerModalId]
      : _playerHcSeries.filter(s => s.isActual).map(s => ({ month: s.month, value: s.value }));
    const _trend = computeHcTrendFromArr(hc, hist);
    if (_trend) commentHtml = hcTrendHtml(_trend.delta, _trend.months);
  }

  return `
    <div class="home-card home-card-me player-banner-card">
      <div class="myhc-header">
        <div style="flex:1;min-width:0">
          <div class="myhc-name">${esc(_playerModalName)}</div>
          ${rankStr ? `<div class="myhc-rank">${rankStr}</div>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div class="myhc-big">${hc ?? '\u2013'}</div>
          <div style="font-size:10px;color:rgba(255,255,255,.45)">handicap</div>
        </div>
      </div>
      ${commentHtml ? `<div style="margin-top:6px;font-size:13px;font-weight:700">${commentHtml}</div>` : ''}
      <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,.55);margin-top:2px">Played ${_playerSignupCount12m} sessions (12m)</div>
    </div>`;
}

function renderPlayerModal() {
  const tabs = [['hc','Handicap'],['attendance','Attendance']];
  const tabBtns = tabs.map(([t, lbl]) =>
    `<button class="pm-tab-btn${_playerModalTab === t ? ' active' : ''}" data-tab="${t}"
      onclick="switchPlayerTab('${t}')">${lbl}</button>`
  ).join('');
  document.getElementById('player-view-wrap').innerHTML = `
    ${buildPlayerBannerHtml()}
    <div class="pm-tabs">${tabBtns}</div>
    <div id="pm-tab-content"></div>`;
  renderPlayerTabContent();
}

function switchPlayerTab(tab) {
  _playerModalTab = tab;
  document.querySelectorAll('.pm-tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  renderPlayerTabContent();
}

function renderPlayerTabContent() {
  if (_playerModalTab === 'hc') renderPlayerHcContent();
  else renderPlayerAttendanceTab();
}

function renderPlayerHcContent() {
  const wrap = document.getElementById('pm-tab-content');
  if (!wrap) return;
  if (!_playerHcSeries.length) {
    wrap.innerHTML = '<p style="color:#888;padding:12px 0">No handicap history recorded.</p>';
    return;
  }
  const periodBtns = ['1yr', '2yr', '3yr', 'all'].map(p =>
    `<button class="ph-period-btn${_playerHcPeriod === p ? ' active' : ''}"
      data-period="${p}" onclick="setPlayerHcPeriod('${p}')">${p === 'all' ? 'All' : p}</button>`
  ).join('');
  wrap.innerHTML = `
    <div class="ph-period-row">${periodBtns}</div>
    <div class="ph-chart-wrap"><canvas id="ph-chart"></canvas></div>
    <div id="ph-table-wrap"></div>`;
  setTimeout(() => { renderPlayerHcChart(); renderPlayerHcTable(); }, 0);
}

function renderPlayerAttendanceTab() {
  const wrap = document.getElementById('pm-tab-content');
  if (!wrap) return;
  const sups = _playerAttendanceData || [];
  const evDates = sups.map(s => s.events?.event_date).filter(Boolean).sort();
  const total = evDates.length;

  const thisYear = new Date().getFullYear().toString();
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  let count12m = 0;
  const byYear = {};
  for (const d of evDates) {
    const yr = d.slice(0, 4);
    byYear[yr] = (byYear[yr] || 0) + 1;
    if (d >= cutoffStr) count12m++;
  }

  const years = Object.keys(byYear).sort().reverse();
  const tableRows = years.map(yr =>
    `<tr${yr === thisYear ? ' class="pa-row-current"' : ''}>
      <td>${yr}</td><td>${byYear[yr]}</td>
    </tr>`
  ).join('');

  wrap.innerHTML = `
    <div class="pa-stats-row">
      <div class="pa-stat"><div class="pa-num">${total}</div><div class="pa-lbl">All time</div></div>
      <div class="pa-stat"><div class="pa-num">${count12m}</div><div class="pa-lbl">Last 12m</div></div>
      <div class="pa-stat"><div class="pa-num">${byYear[thisYear] || 0}</div><div class="pa-lbl">${thisYear}</div></div>
    </div>
    ${years.length ? `<table class="ph-table pa-year-table">
      <thead><tr><th>Year</th><th>Sessions</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>` : '<p style="color:#888;padding:12px 0">No sessions attended yet.</p>'}`;
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
        y: { reverse: true, min: -35, max: 6, ticks: { font: { size: 10 } } }
      }
    }
  });
}

function renderPlayerHcTable() {
  const wrap = document.getElementById('ph-table-wrap');
  if (!wrap) return;
  const slice = filterSeriesByPeriod(_playerHcSeries, _playerHcPeriod);

  // Tag each actual entry with improvement direction vs. previous actual entry
  let prevActualVal = null;
  const tagged = slice.map(s => {
    const out = { ...s, changeClass: null };
    if (s.isActual) {
      if (prevActualVal !== null) {
        if      (s.value < prevActualVal) out.changeClass = 'ph-row-improved';
        else if (s.value > prevActualVal) out.changeClass = 'ph-row-worsened';
      }
      prevActualVal = s.value;
    }
    return out;
  });

  let html = `<table class="ph-table">
    <thead><tr><th>Month</th><th>HC</th><th>Notes</th></tr></thead><tbody>`;
  let lastYear = null;
  for (const s of [...tagged].reverse()) {
    const yr = s.month.slice(0, 4);
    if (yr !== lastYear) {
      html += `<tr class="ph-year-row"><td colspan="3">${yr}</td></tr>`;
      lastYear = yr;
    }
    if (s.isActual) {
      html += `<tr${s.changeClass ? ` class="${s.changeClass}"` : ''}>
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




// ── Hall of Fame ───────────────────────────────────────────────────────────
let hofResults    = [];
let hofNameFilter = '';
let hofStatusFilter = 'all';  // 'all' | 'active' | 'inactive'
let hofYearFilter   = 'all';  // 'all' | 'YYYY'
let hofPlayerMap  = {};       // normalized name → { active: bool, id: uuid }
let hofPlayerList = [];       // [{id, display, normalized}] sorted alpha — for autocomplete

function buildHofPlayerMap(players) {
  hofPlayerMap  = {};
  hofPlayerList = [];
  for (const p of (players || [])) {
    const display    = `${p.first_name} ${p.last_name}`;
    const normalized = display.toLowerCase().replace(/\s+/g,' ').trim();
    hofPlayerMap[normalized] = { active: p.active, id: p.id };
    hofPlayerList.push({ id: p.id, display, normalized });
  }
  hofPlayerList.sort((a, b) => a.display.localeCompare(b.display));
}

async function loadHof() {
  // Clear wrap so renderHof rebuilds the three-div structure fresh
  const wrap = document.getElementById('hof-wrap');
  if (wrap) wrap.innerHTML = '';

  const [{ data, error }, { data: playerList }] = await Promise.all([
    sb.from('hof_results').select('*').order('event_month', { ascending: false }),
    sb.from('players').select('id, first_name, last_name, active')
  ]);
  if (error) { console.error(error); return; }
  hofResults = data || [];
  buildHofPlayerMap(playerList);
  renderHof();
}

function fmtHofMonthShort(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { month: 'short' });
}

function fmtHofMonth(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function fmtScore(ws, ls) {
  if (ws == null || ls == null) return '';
  return `${ws} – ${ls}`;
}

function renderHof() {
  const wrap = document.getElementById('hof-wrap');
  if (!hofResults.length) { wrap.innerHTML = '<p style="color:#888">No records yet.</p>'; return; }

  // Ensure three sub-divs exist in correct order (leaders → filter → results)
  if (!document.getElementById('hof-leaders-div')) {
    wrap.innerHTML =
      '<div id="hof-leaders-div"></div>' +
      '<div id="hof-filter-bar" class="hof-filter-bar"></div>' +
      '<div id="hof-results-div"></div>';
  }
  const leadersDiv = document.getElementById('hof-leaders-div');
  const filterBar  = document.getElementById('hof-filter-bar');
  const resultsDiv = document.getElementById('hof-results-div');

  // ── Helpers ───────────────────────────────────────────────────────────────
  const nameLow = hofNameFilter.toLowerCase().trim();
  function matchesStatus(name) {
    if (hofStatusFilter === 'all') return true;
    const key  = (name || '').toLowerCase().replace(/\s+/g,' ').trim();
    const info = hofPlayerMap[key];
    if (hofStatusFilter === 'active')   return info?.active === true;
    if (hofStatusFilter === 'inactive') return info?.active === false;
    return true;
  }
  function matchesName(r) {
    if (!nameLow) return true;
    return (r.winner_name || '').toLowerCase().includes(nameLow) ||
           (r.runner_up_name || '').toLowerCase().includes(nameLow);
  }
  function filterLeader(entries) {
    if (hofStatusFilter === 'all') return entries;
    return entries.filter(([name]) => matchesStatus(name));
  }

  // ── Leaderboard — all-time, status filter only (unaffected by name/year) ──
  const wins = {}, ru = {};
  for (const r of hofResults) {
    if (r.not_played) continue;
    if (r.winner_name)    wins[r.winner_name]    = (wins[r.winner_name]    || 0) + 1;
    if (r.runner_up_name) ru[r.runner_up_name]   = (ru[r.runner_up_name]  || 0) + 1;
  }
  const topWinners  = filterLeader(Object.entries(wins).sort((a,b) => b[1]-a[1])).slice(0,5);
  const topRunnerUp = filterLeader(Object.entries(ru).sort((a,b)  => b[1]-a[1])).slice(0,5);

  let leadersHtml = '';
  if (topWinners.length || topRunnerUp.length) {
    let dualHtml = `<div class="hof-leaders-dual">`;
    if (topWinners.length) {
      dualHtml += `<div class="hof-leaders-col">
        <div class="hof-leaders-title">🏆 Most Titles</div>
        ${topWinners.map(([name, count], i) =>
          `<div class="hof-leader-chip${i===0?' hof-leader-first':''}">
            <span class="hof-leader-name">${esc(name)}</span>
            <span class="hof-leader-count">${count}</span>
          </div>`).join('')}
      </div>`;
    }
    if (topWinners.length && topRunnerUp.length) dualHtml += `<div class="hof-leaders-divider"></div>`;
    if (topRunnerUp.length) {
      dualHtml += `<div class="hof-leaders-col">
        <div class="hof-leaders-title">🥈 Most #2's</div>
        ${topRunnerUp.map(([name, count], i) =>
          `<div class="hof-leader-chip${i===0?' hof-leader-ru-first':''}">
            <span class="hof-leader-name">${esc(name)}</span>
            <span class="hof-leader-count">${count}</span>
          </div>`).join('')}
      </div>`;
    }
    dualHtml += `</div>`;
    const statusHtml = `<div class="hof-leaders-status">
      <button class="hof-lstatus-btn${hofStatusFilter==='all'?' active':''}" onclick="hofStatusFilter='all';renderHof()">All Time</button>
      <button class="hof-lstatus-btn${hofStatusFilter==='active'?' active':''}" onclick="hofStatusFilter='active';renderHof()">Active Players Only</button>
    </div>`;
    leadersHtml = `<div class="hof-leaders-card">${dualHtml}${statusHtml}</div>`;
  }
  leadersDiv.innerHTML = leadersHtml;

  // ── Filter bar (persistent — preserves input focus) ──────────────────────
  const allYears = [...new Set(hofResults.map(r => r.event_month.slice(0,4)))].sort((a,b) => b-a);
  const wasFocused = document.activeElement?.id === 'hof-name-input';
  filterBar.innerHTML = `
    <input type="text" id="hof-name-input" class="hof-name-filter" placeholder="Filter by name…"
      value="${esc(hofNameFilter)}" oninput="hofNameFilter=this.value;renderHof()">
    <span class="hof-year-label">Year</span>
    <select id="hof-year-sel" class="hof-year-sel" onchange="hofYearFilter=this.value;renderHof()">
      <option value="all"${hofYearFilter==='all'?' selected':''}>All</option>
      ${allYears.map(y => `<option value="${y}"${hofYearFilter===y?' selected':''}>${y}</option>`).join('')}
    </select>`;
  if (wasFocused) {
    const inp = document.getElementById('hof-name-input');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }

  // ── Results — name + year + status filters ────────────────────────────────
  const filtered = hofResults.filter(r => {
    if (hofYearFilter !== 'all' && r.event_month.slice(0,4) !== hofYearFilter) return false;
    if (r.not_played) return !nameLow;
    if (!matchesName(r)) return false;
    return true;
  });

  const byYear = {};
  for (const r of filtered) {
    const yr = r.event_month.slice(0,4);
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(r);
  }

  let resultsHtml = '';
  for (const yr of Object.keys(byYear).sort((a,b) => b-a)) {
    const cards = byYear[yr].map(r => {
      if (r.not_played) {
        return `<div class="hof-result-card hof-card-not-played-row">
          <div class="hof-card-month">${fmtHofMonthShort(r.event_month)}</div>
          <div class="hof-card-body"><span class="hof-card-np-label">Not played</span></div>
        </div>`;
      }
      const score = fmtScore(r.winner_score, r.runner_up_score);
      const wHc = r.winner_hc    != null ? ` <span class="hof-hc-inline">(${r.winner_hc})</span>` : '';
      const rHc = r.runner_up_hc != null ? ` <span class="hof-hc-inline">(${r.runner_up_hc})</span>` : '';
      return `<div class="hof-result-card">
        <div class="hof-card-month">${fmtHofMonthShort(r.event_month)}</div>
        <div class="hof-card-body">
          <div class="hof-card-winner">🏆 ${esc(r.winner_name || '–')}${wHc}</div>
          <div class="hof-card-runnerup">🥈 ${esc(r.runner_up_name || '–')}${rHc}</div>
        </div>
        ${score ? `<div class="hof-card-score">${score}</div>` : ''}
      </div>`;
    }).join('');

    resultsHtml += `<div class="schedule-day-group">
      <div class="sched-aside">
        <div class="sched-day-circle">
          <span class="hof-yr-num">${yr}</span>
        </div>
      </div>
      <div class="sched-main">
        <div class="sched-sessions hof-result-sessions">${cards}</div>
      </div>
    </div>`;
  }

  if (!Object.keys(byYear).length) {
    resultsHtml = '<p style="color:#888;margin-top:12px">No results match the filter.</p>';
  }
  resultsDiv.innerHTML = resultsHtml;
}

// ── Admin: HoF tab ────────────────────────────────────────────────────────
async function loadAdminHof() {
  const queries = [sb.from('hof_results').select('*').order('event_month', { ascending: false })];
  if (!hofPlayerList.length) queries.push(sb.from('players').select('id, first_name, last_name, active'));
  const [{ data }, plResult] = await Promise.all(queries);
  hofResults = data || [];
  if (plResult?.data) buildHofPlayerMap(plResult.data);
  renderAdminHof();
}

function renderAdminHof() {
  const wrap = document.getElementById('hof-admin-list');
  const isSU = ST.player?.is_super_admin;
  if (!hofResults.length) { wrap.innerHTML = '<p style="color:#888">No records yet.</p>'; return; }

  const addBtn = document.getElementById('btn-add-hof');
  if (addBtn) addBtn.style.display = isSU ? '' : 'none';

  wrap.innerHTML = hofResults.map(r => {
    const actBtns = isSU
      ? `<div class="btn-actions">
          <button class="btn-icon-sm" onclick="editHofResult('${r.id}')">Edit</button>
          <button class="btn-icon-sm btn-danger" onclick="deleteHofResult('${r.id}')">Del</button>
        </div>`
      : '';
    const monthStr = fmtHofMonth(r.event_month);
    if (r.not_played) {
      return `<div class="hof-admin-card">
        <div class="hof-ac-row1"><span class="hof-ac-month">${monthStr}</span>${actBtns}</div>
        <div class="hof-ac-row2 hof-ac-notplayed">Not played</div>
      </div>`;
    }
    const winHc  = r.winner_hc    != null ? ` <span class="hcap-badge">${r.winner_hc}</span>`    : '';
    const ruHc   = r.runner_up_hc != null ? ` <span class="hcap-badge">${r.runner_up_hc}</span>` : '';
    const score  = fmtScore(r.winner_score, r.runner_up_score);
    return `<div class="hof-admin-card">
      <div class="hof-ac-row1"><span class="hof-ac-month">${monthStr}</span>${actBtns}</div>
      <div class="hof-ac-row2">
        <span class="hof-ac-winner">🏆 ${esc(r.winner_name || '–')}${winHc}</span>
        <span class="hof-ac-sep">·</span>
        <span class="hof-ac-runner">🥈 ${esc(r.runner_up_name || '–')}${ruHc}</span>
        ${score ? `<span class="hof-ac-sep">·</span><span class="hof-ac-score">${score}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function openHofForm(record = null) {
  const isEdit = !!record;
  const r = record || {};
  const monthVal = r.event_month ? r.event_month.slice(0,7) : '';
  showFormModal(isEdit ? 'Edit HoF Result' : 'Add HoF Result', `
    <div class="form-group">
      <label>Month</label>
      <input type="month" id="hof-month" value="${monthVal}" required
        onchange="hofOnMonthChange()">
    </div>
    <div class="form-group" style="margin-bottom:8px">
      <label><input type="checkbox" id="hof-not-played" ${r.not_played ? 'checked' : ''}
        onchange="toggleHofNotPlayed()"> Not played</label>
    </div>
    <div id="hof-detail-fields">
      <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:start;margin-bottom:8px">
        <div class="form-group" style="margin:0;position:relative">
          <label>Champion</label>
          <input type="text" id="hof-winner" value="${esc(r.winner_name||'')}"
            autocomplete="off"
            oninput="hofShowAutocomplete('hof-winner','hof-winner-hc','hof-winner-warn','hof-winner-ac')"
            onblur="setTimeout(()=>document.getElementById('hof-winner-ac')?.classList.add('hidden'),150)">
          <div id="hof-winner-ac" class="hof-autocomplete hidden"></div>
          <div id="hof-winner-warn" class="hof-name-warn hidden">Name not in player list</div>
        </div>
        <div class="form-group" style="margin:0;width:70px"><label>HC</label><input type="number" id="hof-winner-hc" value="${r.winner_hc ?? ''}" step="1"></div>
        <div class="form-group" style="margin:0;width:70px"><label>Score</label><input type="number" id="hof-winner-score" value="${r.winner_score ?? ''}" step="1" min="0"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:start;margin-bottom:8px">
        <div class="form-group" style="margin:0;position:relative">
          <label>Runner-Up</label>
          <input type="text" id="hof-runner" value="${esc(r.runner_up_name||'')}"
            autocomplete="off"
            oninput="hofShowAutocomplete('hof-runner','hof-runner-hc','hof-runner-warn','hof-runner-ac')"
            onblur="setTimeout(()=>document.getElementById('hof-runner-ac')?.classList.add('hidden'),150)">
          <div id="hof-runner-ac" class="hof-autocomplete hidden"></div>
          <div id="hof-runner-warn" class="hof-name-warn hidden">Name not in player list</div>
        </div>
        <div class="form-group" style="margin:0;width:70px"><label>HC</label><input type="number" id="hof-runner-hc" value="${r.runner_up_hc ?? ''}" step="1"></div>
        <div class="form-group" style="margin:0;width:70px"><label>Score</label><input type="number" id="hof-runner-score" value="${r.runner_up_score ?? ''}" step="1" min="0"></div>
      </div>
    </div>
    <div class="form-group"><label>Notes</label><input type="text" id="hof-notes" value="${esc(r.notes||'')}"></div>
    <div id="hof-form-error" class="error-msg" style="margin-bottom:8px"></div>
    <button class="btn-google-full" onclick="submitHofForm('${isEdit ? r.id : ''}')">
      ${isEdit ? 'Save Changes' : 'Add Result'}
    </button>
  `);
  toggleHofNotPlayed();
  if (r.winner_name)     hofCheckName('hof-winner', 'hof-winner-warn');
  if (r.runner_up_name)  hofCheckName('hof-runner', 'hof-runner-warn');

  // Auto-fill HC from history for any pre-filled name that has no stored HC
  if (monthVal) {
    for (const [name, hcNull, hcInputId] of [
      [r.winner_name,    r.winner_hc    == null, 'hof-winner-hc'],
      [r.runner_up_name, r.runner_up_hc == null, 'hof-runner-hc']
    ]) {
      if (!name || !hcNull) continue;
      const key    = name.toLowerCase().replace(/\s+/g, ' ');
      const player = hofPlayerMap[key];
      if (player?.id) {
        hofGetHcAtMonth(player.id, monthVal + '-01').then(hc => {
          const el = document.getElementById(hcInputId);
          if (hc !== null && el) el.value = hc;
        });
      }
    }
  }
}

function hofShowAutocomplete(inputId, hcInputId, warnId, acId) {
  hofCheckName(inputId, warnId);
  const val = (document.getElementById(inputId)?.value || '').toLowerCase().trim();
  const ac  = document.getElementById(acId);
  if (!ac) return;
  if (!val || val.length < 1) { ac.classList.add('hidden'); return; }

  const matches = hofPlayerList.filter(p => p.normalized.includes(val)).slice(0, 8);
  if (!matches.length) { ac.classList.add('hidden'); return; }

  ac.innerHTML = matches.map(p =>
    `<div class="hof-ac-item"
       data-name="${p.display.replace(/"/g,'&quot;')}"
       data-id="${p.id}"
       data-input="${inputId}" data-hc="${hcInputId}"
       data-warn="${warnId}" data-ac="${acId}"
       onmousedown="hofPickAcItem(this)">${esc(p.display)}</div>`
  ).join('');
  ac.classList.remove('hidden');
}

function hofPickAcItem(el) {
  hofSelectPlayer(el.dataset.input, el.dataset.hc, el.dataset.warn, el.dataset.ac,
    el.dataset.name, el.dataset.id);
}

async function hofSelectPlayer(inputId, hcInputId, warnId, acId, display, playerId) {
  document.getElementById(inputId).value = display;
  document.getElementById(acId)?.classList.add('hidden');
  hofCheckName(inputId, warnId);

  const monthInput = document.getElementById('hof-month')?.value;
  if (monthInput && playerId) {
    const hc = await hofGetHcAtMonth(playerId, monthInput + '-01');
    if (hc !== null) document.getElementById(hcInputId).value = hc;
  }
}

async function hofGetHcAtMonth(playerId, monthISO) {
  const [year, month] = monthISO.slice(0,7).split('-').map(Number);
  const nextMonthStart = new Date(Date.UTC(year, month, 1)).toISOString();
  const { data } = await sb.from('handicap_history')
    .select('handicap_value')
    .eq('player_id', playerId)
    .lt('changed_at', nextMonthStart)
    .order('changed_at', { ascending: false })
    .limit(1).maybeSingle();
  return data?.handicap_value ?? null;
}

async function hofOnMonthChange() {
  const monthInput = document.getElementById('hof-month')?.value;
  if (!monthInput) return;
  const monthISO = monthInput + '-01';
  for (const [inputId, hcInputId] of [['hof-winner','hof-winner-hc'],['hof-runner','hof-runner-hc']]) {
    const name = document.getElementById(inputId)?.value?.trim();
    if (!name) continue;
    const key    = name.toLowerCase().replace(/\s+/g,' ');
    const player = hofPlayerMap[key];
    if (player?.id) {
      const hc = await hofGetHcAtMonth(player.id, monthISO);
      if (hc !== null) document.getElementById(hcInputId).value = hc;
    }
  }
}

function hofCheckName(inputId, warnId) {
  const val  = (document.getElementById(inputId)?.value || '').trim();
  const warn = document.getElementById(warnId);
  if (!warn) return;
  if (!val) { warn.classList.add('hidden'); return; }
  const key = val.toLowerCase().replace(/\s+/g,' ');
  warn.classList.toggle('hidden', hofPlayerMap.hasOwnProperty(key));
}

function toggleHofNotPlayed() {
  const notPlayed = document.getElementById('hof-not-played')?.checked;
  const fields    = document.getElementById('hof-detail-fields');
  if (fields) fields.style.display = notPlayed ? 'none' : '';
}

async function submitHofForm(id) {
  const monthInput = document.getElementById('hof-month').value;
  if (!monthInput) { document.getElementById('hof-form-error').textContent = 'Month is required.'; return; }

  const notPlayed = document.getElementById('hof-not-played').checked;
  const payload = {
    event_month:     monthInput + '-01',
    not_played:      notPlayed,
    winner_name:     notPlayed ? null : (document.getElementById('hof-winner').value.trim() || null),
    winner_hc:       notPlayed ? null : (document.getElementById('hof-winner-hc').value !== '' ? Number(document.getElementById('hof-winner-hc').value) : null),
    winner_score:    notPlayed ? null : (document.getElementById('hof-winner-score').value !== '' ? Number(document.getElementById('hof-winner-score').value) : null),
    runner_up_name:  notPlayed ? null : (document.getElementById('hof-runner').value.trim() || null),
    runner_up_hc:    notPlayed ? null : (document.getElementById('hof-runner-hc').value !== '' ? Number(document.getElementById('hof-runner-hc').value) : null),
    runner_up_score: notPlayed ? null : (document.getElementById('hof-runner-score').value !== '' ? Number(document.getElementById('hof-runner-score').value) : null),
    notes:           document.getElementById('hof-notes').value.trim() || null,
  };

  let error;
  if (id) {
    ({ error } = await sb.from('hof_results').update(payload).eq('id', id));
  } else {
    ({ error } = await sb.from('hof_results').insert(payload));
  }

  if (error) { document.getElementById('hof-form-error').textContent = error.message; return; }
  closeFormModal();
  loadAdminHof();
}

function editHofResult(id) {
  if (!ST.player?.is_super_admin) return;
  const r = hofResults.find(x => x.id === id);
  if (r) openHofForm(r);
}

async function deleteHofResult(id) {
  if (!ST.player?.is_super_admin) return;
  if (!confirm('Delete this HoF result?')) return;
  await sb.from('hof_results').delete().eq('id', id);
  loadAdminHof();
}

// ── Home dashboard ────────────────────────────────────────────────────────
async function loadHome() {
  document.getElementById('home-grid').innerHTML =
    '<p style="color:#888;padding:16px 0">Loading…</p>';

  const me    = ST.player;
  const today = new Date().toISOString().slice(0, 10);

  // 12-month window: HC at start of window vs current
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setDate(1);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const fetches = [
    // Upcoming events with signups (limit 15)
    sb.from('events')
      .select('id, title, event_date, start_time, end_time, max_signups, signups(id, player_id, is_reserve)')
      .gte('event_date', today)
      .order('event_date').order('start_time')
      .limit(15),
    // All active players with current HC (for section stats)
    sb.from('players')
      .select('id, current_handicap')
      .eq('active', true)
      .not('current_handicap', 'is', null)
      .order('current_handicap'),
    // All players' HC history (full, for accurate improved/worsened carry-forward)
    sb.from('handicap_history')
      .select('player_id, handicap_value, changed_at')
      .order('changed_at', { ascending: true }),
    // Latest HoF winner
    sb.from('hof_results')
      .select('event_month, winner_name, winner_hc')
      .eq('not_played', false)
      .order('event_month', { ascending: false })
      .limit(1).maybeSingle(),
    // My signups last 12 months (attendance count)
    sb.from('signups')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', me.id)
      .eq('is_reserve', false)
      .gte('signed_up_at', twelveMonthsAgo.toISOString()),
  ];

  if (me.is_admin) {
    fetches.push(
      sb.from('players').select('*', { count: 'exact', head: true }).eq('pending', true)
    );
  }
  if (me.is_super_admin) {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    fetches.push(
      sb.from('audit_log')
        .select('event_type, player_name, phone, created_at, details')
        .gte('created_at', weekAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(200)
    );
  }

  const results = await Promise.all(fetches);
  const [eventsRes, playersRes, histRes, hofRes, signupCountRes] = results;
  const myAttendance12m = signupCountRes?.count || 0;
  const pendingCount = me.is_admin ? (results[5]?.count || 0) : 0;
  const auditRows = me.is_super_admin ? (results[6]?.data || []) : null;

  // HC trend — use full history from histRes (already fetched) for accurate months
  const currentHc = me.current_handicap;
  const myHistForTrend = (histRes.data || [])
    .filter(h => h.player_id === me.id)
    .map(h => ({ month: monthKey(new Date(h.changed_at)), value: h.handicap_value }))
    .sort((a, b) => a.month < b.month ? -1 : 1);
  const hcTrend = computeHcTrendFromArr(currentHc, myHistForTrend);

  // Section stats: improved / worsened — same 12-month window as ladder (current month - 11)
  const histMap = {};
  for (const h of (histRes.data || [])) {
    const mk = monthKey(new Date(h.changed_at));
    if (!histMap[h.player_id]) histMap[h.player_id] = [];
    histMap[h.player_id].push({ mk, v: h.handicap_value });
  }
  const sectionStart = new Date(); sectionStart.setDate(1); sectionStart.setMonth(sectionStart.getMonth() - 11);
  const startM = monthKey(sectionStart);
  function homeHcAt(pid, mk) {
    const arr = histMap[pid]; if (!arr) return null;
    for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].mk <= mk) return arr[i].v; }
    return null;
  }
  let improved = 0, worsened = 0;
  const allPlayers = playersRes.data || [];
  for (const p of allPlayers) {
    let s = homeHcAt(p.id, startM);
    if (s == null) { const arr = histMap[p.id]; if (arr?.length) s = arr[0].v; }
    const e = p.current_handicap;
    if (s == null || e == null) continue;
    if (e < s) improved++; else if (e > s) worsened++;
  }

  const validHcs = allPlayers.map(p => p.current_handicap).filter(v => v != null);
  const avgHc = validHcs.length ? (validHcs.reduce((a, b) => a + b, 0) / validHcs.length).toFixed(1) : '–';

  renderHome(eventsRes.data || [], hcTrend, { players: allPlayers.length, improved, worsened, avg: avgHc }, hofRes.data, pendingCount, myAttendance12m, auditRows);
}

function renderHome(upcomingEvents, hcTrend, sectionStats, latestHof, pendingCount, myAttendance12m, auditRows = null) {
  const me = ST.player;
  const hc = me.current_handicap;

  // ── Card 1: Me ───────────────────────────────────────────────────────────
  const commentHtml = hcTrend ? hcTrendHtml(hcTrend.delta, hcTrend.months) : '';
  const fullName = `${esc(me.first_name)} ${esc(me.last_name)}`;
  const meCard = `
    <div class="home-card home-card-me"
        onclick="openPlayerView('${me.id}','view-home')">
      <div class="myhc-header">
        <div style="flex:1;min-width:0">
          <div class="myhc-name">${fullName}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div class="myhc-big">${hc ?? '–'}</div>
          <div style="font-size:10px;color:rgba(255,255,255,.45)">handicap</div>
        </div>
      </div>
      ${commentHtml ? `<div style="margin-top:6px;font-size:13px;font-weight:700">${commentHtml}</div>` : ''}
      <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,.55);margin-top:2px">Played ${myAttendance12m} sessions (12m)</div>
      <div class="home-card-link">View full history →</div>
    </div>`;

  // ── Card 2: Sign-Up ──────────────────────────────────────────────────────
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const QUIPS = ['Grab a game!','Get on court!','Get matched up!','Book your slot!',
    'Play this week!','Racket ready?','See you on court!','Claim a court!',
    'Time for a hit!','Ready to rally?'];

  const myBookings = upcomingEvents.filter(ev =>
    (ev.signups || []).some(s => s.player_id === me.id && !s.is_reserve)
  );

  let signupInner = '';
  if (myBookings.length === 0) {
    const quip = QUIPS[Math.floor(Math.random() * QUIPS.length)];
    const n = upcomingEvents.length;
    signupInner = `
      <div class="home-signup-empty">
        <img src="racket01.png" class="home-racket-big" alt="">
        <div class="home-racket-quip">${quip}</div>
        ${n > 0 ? `<div class="home-racket-more">${n} session${n !== 1 ? 's' : ''} available!</div>` : ''}
      </div>`;
  } else {
    const rows = myBookings.map(ev => {
      const confirmed = (ev.signups || []).filter(s => !s.is_reserve);
      const countStr  = ev.max_signups ? `${confirmed.length}/${ev.max_signups}` : `${confirmed.length}`;
      const dayName = days[new Date(ev.event_date + 'T12:00:00').getDay()];
      return `<div class="home-sess-row">
        <span class="home-sess-date">${dayName}</span>
        <span class="home-sess-title">${esc(ev.title)}</span>
        <span class="home-sess-tick">✓</span>
        <span class="home-sess-right">${countStr}</span>
      </div>`;
    }).join('');
    const avail = upcomingEvents.length - myBookings.length;
    const hdrText = avail > 0
      ? `You're signed up for ${myBookings.length} session${myBookings.length !== 1 ? 's' : ''}, ${avail} other${avail !== 1 ? 's' : ''} available!`
      : `You're signed up for ${myBookings.length} session${myBookings.length !== 1 ? 's' : ''}!`;
    const availHdr = `
      <div class="home-signup-booked-hdr">
        <img src="racket01.png" class="home-racket-sm" alt="">
        <span class="home-racket-avail">${hdrText}</span>
      </div>`;
    signupInner = `${availHdr}<div class="home-sess-list">${rows}</div>`;
  }
  const signupCard = `
    <div class="home-card home-card-signup" onclick="navTo('schedule')">
      ${signupInner}
      <div class="home-card-link">Click to sign-up →</div>
    </div>`;

  // ── Card 3: Handicaps ────────────────────────────────────────────────────
  const ladderCard = `
    <div class="home-card home-card-ladder" onclick="navTo('ladder')">
      <div class="home-card-label">Handicaps</div>
      <div class="home-card-sublabel">Last 12 Months · Active Players</div>
      <div class="home-hc-grid">
        <div class="home-hc-stat">
          <div class="home-hc-val">${sectionStats.players}</div>
          <div class="home-hc-lbl">Players</div>
        </div>
        <div class="home-hc-stat">
          <div class="home-hc-val">${sectionStats.avg}</div>
          <div class="home-hc-lbl">Avg HC</div>
        </div>
        <div class="home-hc-stat">
          <div class="home-hc-val sec-improved"><span class="hc-tri">▲</span>${sectionStats.improved}</div>
          <div class="home-hc-lbl">Improved</div>
        </div>
        <div class="home-hc-stat">
          <div class="home-hc-val sec-worsened"><span class="hc-tri">▼</span>${sectionStats.worsened}</div>
          <div class="home-hc-lbl">Worsened</div>
        </div>
      </div>
      <div class="home-card-link">View all handicaps →</div>
    </div>`;

  // ── Card 4: HoF ──────────────────────────────────────────────────────────
  const hofInner = latestHof
    ? `<div class="home-hof-row">
         <img src="winner02-small.png" class="home-hof-trophy-img" alt="">
         <div class="home-hof-info">
           <div class="home-card-main" style="font-size:12px">${esc(latestHof.winner_name || '–')}</div>
           <div class="home-card-sub" style="font-size:11px">${fmtHofMonth(latestHof.event_month)}</div>
         </div>
       </div>`
    : `<div class="home-hof-row">
         <img src="winner02-small.png" class="home-hof-trophy-img" alt="">
         <div class="home-hof-info" style="color:#aaa;font-size:13px">No records yet</div>
       </div>`;
  const hofCard = `
    <div class="home-card home-card-hof" onclick="navTo('hof')">
      <div class="home-card-label">Current HCRR Champ</div>
      ${hofInner}
      <div class="home-card-link">Hall of Fame →</div>
    </div>`;

  // ── Card 5: Admin (admin only) ────────────────────────────────────────────
  let adminSessionRows = '';
  if (me.is_admin && upcomingEvents.length) {
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    adminSessionRows = upcomingEvents.slice(0, 6).map(ev => {
      const d = new Date(ev.event_date + 'T12:00:00');
      const dateStr = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
      const confirmed = (ev.signups || []).filter(s => !s.is_reserve).length;
      const countStr = ev.max_signups ? `${confirmed}/${ev.max_signups}` : `${confirmed}`;
      const full = ev.max_signups && confirmed >= ev.max_signups;
      return `<div class="home-admin-session">
        <span class="has-date">${dateStr}</span>
        <span class="has-title">${esc(ev.title)}</span>
        <span class="has-count${full ? ' full' : ''}">${countStr}</span>
      </div>`;
    }).join('');
  }
  const adminCard = me.is_admin ? `
    <div class="home-card home-card-admin" style="grid-column:1/-1" onclick="goToAdmin()">
      <div class="home-card-label">Admin</div>
      ${pendingCount > 0 ? `<div id="home-admin-pending" class="home-admin-badge">${pendingCount} pending approval${pendingCount > 1 ? 's' : ''}</div>` : '<div id="home-admin-pending" class="home-admin-badge hidden"></div>'}
      ${adminSessionRows ? `<div class="home-admin-section-title">Sign-ups for Upcoming Sessions</div>${adminSessionRows}` : ''}
      <div class="home-card-link" style="margin-top:auto">Manage →</div>
    </div>` : '';

  // ── Card 6: Audit (super_admin only) ─────────────────────────────────────
  let auditCard = '';
  if (me.is_super_admin && auditRows !== null) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const sessionTypes   = ['session_start', 'session_resume'];
    const sessionsToday  = auditRows.filter(r => sessionTypes.includes(r.event_type) && r.created_at.slice(0,10) === todayStr).length;
    const sessions7d     = auditRows.filter(r => sessionTypes.includes(r.event_type)).length;
    const unique7d       = new Set(auditRows.filter(r => sessionTypes.includes(r.event_type) && r.player_name).map(r => r.player_name)).size;
    const errors7d       = auditRows.filter(r => ['login_error','login_not_found','login_pending'].includes(r.event_type)).length;
    const lastLogin      = auditRows.find(r => sessionTypes.includes(r.event_type));
    const lastLoginStr   = lastLogin
      ? `${lastLogin.player_name || '—'} · ${timeAgo(lastLogin.created_at)}`
      : 'No sessions this week';
    auditCard = `
    <div class="home-card home-card-audit" style="grid-column:1/-1" onclick="openAuditLog()">
      <div class="home-card-label">Audit Log</div>
      <div class="audit-summary-grid">
        <div class="audit-stat"><span class="audit-num">${sessionsToday}</span><span class="audit-lbl">Today</span></div>
        <div class="audit-stat"><span class="audit-num">${sessions7d}</span><span class="audit-lbl">Sessions (7d)</span></div>
        <div class="audit-stat"><span class="audit-num">${unique7d}</span><span class="audit-lbl">Unique users (7d)</span></div>
        <div class="audit-stat ${errors7d > 0 ? 'audit-warn' : ''}"><span class="audit-num">${errors7d}</span><span class="audit-lbl">Issues (7d)</span></div>
      </div>
      <div class="audit-last-login">Last session: ${esc(lastLoginStr)}</div>
      <div class="home-card-link" style="margin-top:auto">View log →</div>
    </div>`;
  }

  document.getElementById('home-grid').innerHTML = meCard + signupCard + ladderCard + hofCard + adminCard + auditCard;
}

function navTo(view, callback) {
  if (view === 'schedule') { showSection('view-schedule'); loadSchedule().then(() => callback && callback()); }
  if (view === 'ladder')   { showSection('view-ladder');   loadLadder().then(() => callback && callback()); }
  if (view === 'hof')      { showSection('view-hof');      loadHof().then(() => callback && callback()); }
  if (view === 'admin')    { showSection('view-admin');    loadAdminTab('tab-players'); callback && callback(); }
}

async function homeJoin(eventId) {
  await joinEvent({ stopPropagation: () => {} }, eventId);
  loadHome();
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
  const groupMap = {};
  const dates = [];
  for (const ev of ST.events) {
    if (!groupMap[ev.event_date]) { groupMap[ev.event_date] = []; dates.push(ev.event_date); }
    groupMap[ev.event_date].push(ev);
  }
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  el.innerHTML = dates.map(d => {
    const dObj  = new Date(d + 'T12:00:00');
    const abbr  = dObj.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase();
    const num   = dObj.getDate();
    const label = `${dObj.toLocaleDateString('en-GB',{weekday:'long'}).toUpperCase()} • ${num} ${MONTHS[dObj.getMonth()].toUpperCase()} ${dObj.getFullYear()}`;
    return `<div class="schedule-day-group">
      <div class="sched-aside">
        <div class="sched-day-circle">
          <span class="sched-day-abbr">${abbr}</span>
          <span class="sched-day-num">${num}</span>
        </div>
      </div>
      <div class="sched-main">
        <div class="sched-day-label">${label}</div>
        <div class="sched-sessions">${groupMap[d].map(ev => eventCard(ev)).join('')}</div>
      </div>
    </div>`;
  }).join('');
}

function eventCard(ev) {
  const signups   = ev.signups || [];
  const confirmed = signups.filter(s => !s.is_reserve);
  const reserves  = signups.filter(s =>  s.is_reserve);
  const count     = confirmed.length;
  const full      = ev.max_signups && count >= ev.max_signups;
  const mySignup  = signups.find(s => s.player_id === ST.player.id);
  const isAdmin   = ST.player?.is_admin || ST.player?.is_super_admin;
  const enrolled  = !!mySignup;

  const [h, mm] = ev.start_time.slice(0, 5).split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const timeH = `${h12}:${mm.toString().padStart(2, '0')}`;

  const countLabel = ev.max_signups ? `${count} / ${ev.max_signups} players` : `${count} players`;

  const rowClick = enrolled
    ? `onclick="toggleAttendees('${ev.id}')"`
    : `onclick="joinEvent(event,'${ev.id}')"`;

  const actionBtn = enrolled
    ? `<button class="ev-btn-enrolled" onclick="leaveEvent(event,'${mySignup.id}','${ev.id}')">&#10003; ENROLLED</button>`
    : `<span class="ev-btn-join">JOIN <span class="ev-btn-arrow">&#8594;</span></span>`;

  const confirmedNames = confirmed.map(s => {
    const name = s.player_first ? esc(shortName(s.player_first, s.player_last)) : esc(s.guest_name || 'Guest');
    const del  = isAdmin
      ? `<button class="chip-del" onclick="event.stopPropagation();removeSignupChip('${s.id}','${ev.id}','${name.replace(/'/g, '&#39;')}')" title="Remove">×</button>`
      : '';
    return `<span class="ev-name-item">${name}${del}</span>`;
  }).join('');

  const reserveNames = reserves.length ? reserves.map(s => {
    const name = s.player_first ? esc(shortName(s.player_first, s.player_last)) : esc(s.guest_name || 'Guest');
    const del  = isAdmin
      ? `<button class="chip-del" onclick="event.stopPropagation();removeSignupChip('${s.id}','${ev.id}','${name.replace(/'/g, '&#39;')}')" title="Remove">×</button>`
      : '';
    return `<span class="ev-name-item ev-name-reserve">${name}${del}</span>`;
  }).join('') : '';

  const namesPanel = `
    <div class="ev-names-panel" id="ev-names-${ev.id}" hidden onclick="event.stopPropagation()">
      <div class="ev-names-group">
        ${confirmed.length ? confirmedNames : '<span style="color:#bbb;font-style:italic">No signups yet</span>'}
      </div>
      ${reserveNames ? `<div class="ev-names-reserves">${reserveNames}</div>` : ''}
    </div>`;

  return `
    <div class="ev-row${enrolled ? ' ev-row--enrolled' : ''}" id="ev-card-${ev.id}">
      <div class="ev-row-main" ${rowClick}>
        <div class="ev-time-col">
          <span class="ev-time-h">${timeH}</span>
          <span class="ev-time-p">${ampm}</span>
        </div>
        <div class="ev-info-col">
          <div class="ev-row-title">${esc(ev.title)}</div>
          <div class="ev-meta-row" onclick="event.stopPropagation();toggleAttendees('${ev.id}')">
            <span class="ev-players-icon">&#128101;</span>
            <span class="ev-players-text">${countLabel}</span>
            <span class="ev-chevron-hint">&#9660;</span>
          </div>
        </div>
        <div class="ev-action-col">${actionBtn}</div>
      </div>
      ${namesPanel}
    </div>`
}

function toggleAttendees(eventId) {
  const panel = document.getElementById('ev-names-' + eventId);
  if (!panel) return;
  panel.hidden = !panel.hidden;
  document.getElementById('ev-card-' + eventId)?.classList.toggle('ev-names-open', !panel.hidden);
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
    const { count: already } = await sb.from('signups')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId).eq('player_id', ST.player.id);
    if (already > 0) return;
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

async function removeSignupChip(signupId, eventId, name) {
  if (!confirm(`Remove ${name ? name + ' ' : ''}from this session?`)) return;
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
  const slots = ev.max_signups - count;
  if (slots <= 0) return;
  const { data: reserves } = await sb.from('signups')
    .select('id').eq('event_id', eventId).eq('is_reserve', true)
    .order('signed_up_at').limit(slots);
  for (const r of (reserves || [])) {
    await sb.from('signups').update({ is_reserve: false }).eq('id', r.id);
  }
}

async function demoteOverflowSignups(eventId) {
  const { data: ev } = await sb.from('events').select('max_signups').eq('id', eventId).single();
  if (!ev?.max_signups) return;
  const { data: confirmed } = await sb.from('signups')
    .select('id').eq('event_id', eventId).eq('is_reserve', false)
    .order('signed_up_at', { ascending: false });
  const overflow = (confirmed || []).length - ev.max_signups;
  if (overflow <= 0) return;
  for (const s of confirmed.slice(0, overflow)) {
    await sb.from('signups').update({ is_reserve: true }).eq('id', s.id);
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
  if (tabId === 'tab-hof')       await loadAdminHof();
  if (tabId === 'tab-reports')   await renderReportsTab();

  if (tabId === 'tab-hof') {
    document.getElementById('btn-add-hof')?.addEventListener('click', () => openHofForm());
  }
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

let allPlayers       = [];
let playerLoginCounts = {};
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
  const [{ data }, { data: loginRows }] = await Promise.all([
    sb.from('players').select('*').order('last_name').order('first_name'),
    sb.from('audit_log').select('player_id').in('event_type', ['session_start', 'session_resume']).not('player_id', 'is', null)
  ]);
  allPlayers = data || [];
  ST.players = allPlayers.filter(p => p.active);
  playerLoginCounts = {};
  for (const r of (loginRows || [])) {
    playerLoginCounts[r.player_id] = (playerLoginCounts[r.player_id] || 0) + 1;
  }
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
      const phone = (p.phone || '').replace(/\D/g, '');
      const qDigits = q.replace(/\D/g, '');
      if (!name.includes(q) && !(qDigits && phone.includes(qDigits))) return false;
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
    ? `<span class="sort-arrow">${sortDir === 'asc' ? '▲' : '▼'}</span>`
    : `<span class="sort-arrow muted">↕</span>`;

  document.getElementById('players-list').innerHTML = players.length
    ? `<div class="pc-count-bar">${players.length} player${players.length !== 1 ? 's' : ''}</div>
      <div class="player-cards">
        <div class="pc-sort-hdr">
          <span class="pc-name th-sort" onclick="setPlayersSort('name')">Name ${arrow('name')}</span>
          <span class="pc-phone"></span>
          <span class="pc-logins">Sign-ins</span>
          <span class="pc-hc th-sort" style="cursor:pointer;user-select:none" onclick="setPlayersSort('hc')">HC ${arrow('hc')}</span>
        </div>
        ${players.map(p => {
          const pending = isPending(p);
          const roleLabel = p.is_super_admin
            ? ' <span class="tag-superadmin">SA</span>'
            : p.is_admin ? ' <span class="tag-admin">Admin</span>' : '';
          const statusTag = pending
            ? ' <span class="tag-pending">Pending</span>'
            : !p.active ? ' <span class="tag-inactive">Inactive</span>' : '';
          const logins = playerLoginCounts[p.id] || 0;
          return `<div class="player-card" onclick="openEditPlayerForm('${p.id}')" style="cursor:pointer">
            <div class="pc-row1" style="margin-bottom:0">
              <div class="pc-name">${esc(p.first_name)} ${esc(p.last_name)}${statusTag}${roleLabel}</div>
              <span class="pc-phone">${esc(p.phone || '')}</span>
              <span class="pc-logins">${logins > 0 ? logins + '×' : '–'}</span>
              <span class="pc-hc"><span class="hcap-badge">${p.current_handicap ?? '–'}</span></span>
            </div>
            ${pending ? `<div class="pc-row2"><div class="btn-actions">
              <button class="btn-icon-sm" onclick="event.stopPropagation();approvePlayer('${p.id}')">Approve</button>
              <button class="btn-icon-sm btn-icon-danger" onclick="event.stopPropagation();rejectPlayer('${p.id}')">Reject</button>
            </div></div>` : ''}
          </div>`;
        }).join('')}
      </div>`
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
  const hcDisplay = p.current_handicap ?? '–';
  const activeLabel = p.active
    ? '<span class="tag-active">Active</span>'
    : '<span class="tag-inactive">Inactive</span>';
  const toggleBtn = p.active
    ? `<button type="button" class="btn-icon-sm btn-icon-danger" style="margin-left:10px" onclick="deactivatePlayerFromForm('${id}')">Deactivate</button>`
    : `<button type="button" class="btn-icon-sm" style="margin-left:10px" onclick="reactivatePlayerFromForm('${id}')">Re-activate</button>
       ${ST.player.is_super_admin ? `<button type="button" class="btn-icon-sm btn-icon-danger" style="margin-left:4px" onclick="deletePlayer('${id}','${esc(p.first_name)} ${esc(p.last_name)}')">Delete</button>` : ''}`;
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
    <div class="form-group">
      <label>Handicap</label>
      <div style="display:flex;align-items:center;gap:10px">
        <span class="hcap-badge" style="font-size:15px;padding:4px 12px">${hcDisplay}</span>
        <button type="button" class="btn-icon-sm" onclick="closeFormModal();openHandicapModal('${id}','${esc(p.first_name)} ${esc(p.last_name)}')">Edit HC</button>
      </div>
    </div>
    <div class="form-group">
      <label>Status</label>
      <div style="display:flex;align-items:center">${activeLabel}${toggleBtn}</div>
    </div>
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
  if (!confirm('Deactivate this player? They will be hidden from the active list but can still sign in.')) return false;
  const { error } = await sb.from('players').update({ active: false }).eq('id', id);
  if (error) { alert(error.message); return false; }
  const p = allPlayers.find(x => x.id === id);
  if (p) p.active = false;
  ST.players = allPlayers.filter(p => p.active);
  renderPlayersTable();
  return true;
}

async function reactivatePlayer(id) {
  if (!confirm('Re-activate this player? They will be able to sign in again.')) return false;
  const { error } = await sb.from('players').update({ active: true }).eq('id', id);
  if (error) { alert(error.message); return false; }
  const p = allPlayers.find(x => x.id === id);
  if (p) p.active = true;
  ST.players = allPlayers.filter(p => p.active);
  renderPlayersTable();
  return true;
}

async function deactivatePlayerFromForm(id) {
  if (await deactivatePlayer(id)) openEditPlayerForm(id);
}

async function reactivatePlayerFromForm(id) {
  if (await reactivatePlayer(id)) openEditPlayerForm(id);
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
  closeFormModal();
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

  // Derive true current HC from history (most recent changed_at), not the cached players field
  const trueCurrentHc = history?.length ? history[0].handicap_value : (p?.current_handicap ?? null);

  // Silently repair players.current_handicap if it's stale
  if (p && trueCurrentHc !== null && p.current_handicap !== trueCurrentHc) {
    await sb.from('players').update({ current_handicap: trueCurrentHc }).eq('id', playerId);
    p.current_handicap = trueCurrentHc;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  document.getElementById('modal-body').innerHTML = `
    <div style="margin-bottom:16px">
      <strong>Current handicap:</strong> <span class="hcap-badge">${trueCurrentHc ?? '–'}</span>
    </div>
    <div class="signup-form" style="margin-bottom:16px">
      <h3 style="font-size:14px;margin-bottom:10px">Add new entry</h3>
      <div class="form-group">
        <label>New handicap value</label>
        <input type="number" id="hc-value" min="-35" max="10" step="0.5" value="${trueCurrentHc ?? ''}">
      </div>
      <div class="form-group">
        <label>Date</label>
        <input type="date" id="hc-date" value="${todayStr}" max="${todayStr}">
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
  const dateVal   = document.getElementById('hc-date').value || new Date().toISOString().slice(0, 10);
  const changedAt = new Date(dateVal + 'T12:00:00').toISOString();
  const notes     = document.getElementById('hc-notes').value.trim();
  const { error: hErr } = await sb.from('handicap_history').insert({
    player_id: playerId, handicap_value: value,
    changed_at: changedAt, changed_by: ST.player.id, notes: notes || null
  });
  if (hErr) { alert(hErr.message); return; }
  // Use the most recent entry by changed_at as current_handicap (handles backdated inserts)
  const { data: latest } = await sb.from('handicap_history')
    .select('handicap_value')
    .eq('player_id', playerId)
    .order('changed_at', { ascending: false })
    .limit(1)
    .single();
  const currentValue = latest?.handicap_value ?? value;
  const { error: pErr } = await sb.from('players').update({ current_handicap: currentValue }).eq('id', playerId);
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

  // Fetch signups for all visible events
  const eventIds = (events || []).map(e => e.id);
  let signupMap = {};
  if (eventIds.length) {
    const { data: sups } = await sb.from('signups')
      .select('event_id, is_reserve, guest_name, player:players!player_id(first_name, last_name)')
      .in('event_id', eventIds);
    for (const s of (sups || [])) {
      if (!signupMap[s.event_id]) signupMap[s.event_id] = [];
      signupMap[s.event_id].push(s);
    }
  }

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
    ? (events||[]).map(ev => {
        const sups      = signupMap[ev.id] || [];
        const confirmed = sups.filter(s => !s.is_reserve);
        const reserves  = sups.filter(s =>  s.is_reserve);
        const countStr  = ev.max_signups ? `${confirmed.length}/${ev.max_signups}` : `${confirmed.length}`;
        const chips = [...confirmed, ...reserves].map(s => {
          const name = s.player
            ? `${s.player.first_name} ${s.player.last_name}`
            : (s.guest_name || 'Guest');
          return `<span class="ae-sup-chip${s.is_reserve ? ' ae-sup-reserve' : ''}">${esc(name)}</span>`;
        }).join('');
        return `
      <div class="admin-event-row">
        <div class="ae-main">
          <div class="ev-info">${esc(ev.title)}</div>
          <div class="ev-sub">${fmtDate(ev.event_date)} · ${ev.start_time}–${ev.end_time}
            · <span class="ae-count-btn" onclick="toggleAeSignups('${ev.id}')">${countStr} registered ▾</span></div>
        </div>
        <div class="btn-row">
          <button class="btn-secondary" style="font-size:12px;padding:4px 8px"
            onclick="openEditEventForm('${ev.id}')">Edit</button>
          <button class="btn-danger" onclick="deleteEvent('${ev.id}')">Del</button>
        </div>
      </div>
      <div id="ae-sups-${ev.id}" class="ae-signup-list hidden">${chips || '<span style="color:#aaa;font-size:12px">No signups yet</span>'}</div>`;
      }).join('')
    : '<p style="color:#666;margin-top:8px">No events in this period.</p>');

  document.getElementById('btn-generate-week').onclick = generateWeek;
  document.getElementById('btn-add-event').onclick = openAddEventForm;
}

function toggleAeSignups(id) {
  const el = document.getElementById('ae-sups-' + id);
  if (el) el.classList.toggle('hidden');
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
  await demoteOverflowSignups(id);
  await promoteFirstReserve(id);
  closeFormModal();
  await renderAdminEvents();
}

async function deleteEvent(id) {
  const { data: sups } = await sb.from('signups').select('id').eq('event_id', id);
  const count = (sups || []).length;
  const msg = count > 0
    ? `This event has ${count} signup${count !== 1 ? 's' : ''}. Delete it and all its signups?`
    : 'Delete this event?';
  if (!confirm(msg)) return;
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
  document.getElementById('btn-add-template').onclick = openAddTemplateForm;
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

// ── Audit log modal ───────────────────────────────────────────────────────
function timeAgo(isoStr) {
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Audit log view ────────────────────────────────────────────────────────
let auditTypeFilter   = 'all';   // 'all' | 'logins' | 'issues' | 'registrations'
let auditPeriodFilter = '7d';    // 'today' | '7d' | '30d' | 'all'
let auditNameFilter   = '';
let auditUniqueOnly   = false;

const AUDIT_TYPE_LABEL = {
  session_start:          { text: 'Login',        cls: 'audit-tag-ok' },
  session_resume:         { text: 'Resume',        cls: 'audit-tag-ok' },
  login_not_found:        { text: 'Not found',     cls: 'audit-tag-warn' },
  login_pending:          { text: 'Pending user',  cls: 'audit-tag-warn' },
  login_error:            { text: 'Error',         cls: 'audit-tag-err' },
  registration_submitted: { text: 'Registration',  cls: 'audit-tag-info' },
};

function openAuditLog() {
  if (!ST.player?.is_super_admin) return;
  showSection('view-audit');
  loadAuditLog();
}

async function loadAuditLog() {
  const wrap = document.getElementById('audit-log-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<p style="color:#888;padding:16px 0">Loading…</p>';

  let query = sb.from('audit_log')
    .select('event_type, player_name, phone, user_agent, details, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (auditPeriodFilter !== 'all') {
    let cutoff;
    if (auditPeriodFilter === 'today') {
      cutoff = new Date(); cutoff.setHours(0, 0, 0, 0);
    } else {
      const days = auditPeriodFilter === '7d' ? 7 : 30;
      cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    }
    query = query.gte('created_at', cutoff.toISOString());
  }

  const { data: rows } = await query;
  renderAuditLog(rows || []);
}

function renderAuditLog(rows) {
  const wrap = document.getElementById('audit-log-wrap');
  if (!wrap) return;

  const typeGroups = {
    logins:        ['session_start', 'session_resume'],
    issues:        ['login_not_found', 'login_pending', 'login_error'],
    registrations: ['registration_submitted'],
  };

  let filtered = auditTypeFilter === 'all'
    ? rows
    : rows.filter(r => typeGroups[auditTypeFilter]?.includes(r.event_type));

  if (auditNameFilter) {
    const q = auditNameFilter.toLowerCase();
    filtered = filtered.filter(r => (r.player_name || r.phone || '').toLowerCase().includes(q));
  }

  if (auditUniqueOnly) {
    const seen = new Set();
    filtered = filtered.filter(r => {
      const key = r.player_name || r.phone || '---';
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }

  const periodBtn = p => {
    const labels = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', all: 'All time' };
    return `<button class="audit-filter-btn${auditPeriodFilter===p?' active':''}" onclick="setAuditPeriod('${p}')">${labels[p]}</button>`;
  };
  const typeBtn = (t, lbl) => `<button class="audit-filter-btn${auditTypeFilter===t?' active':''}" onclick="setAuditType('${t}')">${lbl}</button>`;

  const issueCount = rows.filter(r => typeGroups.issues.includes(r.event_type)).length;

  const rowsHtml = filtered.length ? filtered.map(r => {
    const tl = AUDIT_TYPE_LABEL[r.event_type] || { text: r.event_type, cls: 'audit-tag-info' };
    const who = r.player_name || r.phone || '---';
    const detail = r.details?.error || r.details?.stage || '';
    const ua = r.user_agent || '';
    const device = /mobile|android|iphone|ipad/i.test(ua) ? '📱' : '💻';
    const dt = new Date(r.created_at);
    const dtStr = dt.toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    return `<div class="audit-row">
      <div class="audit-row-left">
        <span class="audit-tag ${tl.cls}">${tl.text}</span>
        <span class="audit-row-time">${dtStr}</span>
      </div>
      <div class="audit-row-right">
        <span class="audit-row-who">${device} ${esc(who)}</span>
        ${detail ? `<span class="audit-row-detail">${esc(detail)}</span>` : ''}
      </div>
    </div>`;
  }).join('')
  : '<p style="color:#888;padding:16px 0;text-align:center">No events for this filter</p>';

  const hadFocus = document.activeElement?.id === 'audit-name-input';

  wrap.innerHTML = `
    <div class="audit-top-bar">
      <button class="btn-danger-sm" onclick="confirmDeleteAdminLogs()">Delete my test logs…</button>
      <button class="btn-danger-sm" onclick="confirmDeleteAuditLog()">Delete all logs…</button>
    </div>
    <div class="audit-filter-bar">
      <div class="audit-filter-group">
        ${periodBtn('today')}${periodBtn('7d')}${periodBtn('30d')}${periodBtn('all')}
      </div>
      <div class="audit-filter-group">
        ${typeBtn('all','All')}
        ${typeBtn('logins','Logins')}
        ${typeBtn('issues', issueCount > 0 ? `Issues (${issueCount})` : 'Issues')}
        ${typeBtn('registrations','Registrations')}
      </div>
      <div class="audit-filter-group">
        <input id="audit-name-input" class="audit-name-input" type="text"
          placeholder="Filter by name..." value="${esc(auditNameFilter)}"
          oninput="setAuditName(this.value)">
        <button class="audit-filter-btn${auditUniqueOnly?' active':''}" onclick="toggleAuditUnique()">Unique users</button>
      </div>
    </div>
    <div class="audit-count">${filtered.length} event${filtered.length !== 1 ? 's' : ''}${auditUniqueOnly ? ' · unique users' : ''}</div>
    <div class="audit-rows">${rowsHtml}</div>`;

  if (hadFocus) {
    const inp = document.getElementById('audit-name-input');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }
}
function setAuditType(t)   { auditTypeFilter = t;   loadAuditLog(); }
function setAuditPeriod(p) { auditPeriodFilter = p;  loadAuditLog(); }
function setAuditName(v)   { auditNameFilter = v;    loadAuditLog(); }
function toggleAuditUnique() { auditUniqueOnly = !auditUniqueOnly; loadAuditLog(); }

async function confirmDeleteAuditLog() {
  if (!ST.player?.is_super_admin) return;
  showFormModal('Delete All Audit Logs', `
    <p style="margin-bottom:16px">This will permanently delete <strong>all</strong> audit log entries. This cannot be undone.</p>
    <div class="btn-row">
      <button class="btn-danger" onclick="deleteAllAuditLogs()">Yes, delete all</button>
      <button class="btn-secondary" onclick="closeFormModal()">Cancel</button>
    </div>
  `);
}

async function deleteAllAuditLogs() {
  closeFormModal();
  const wrap = document.getElementById('audit-log-wrap');
  if (wrap) wrap.innerHTML = '<p style="color:#888;padding:16px 0">Deleting…</p>';
  const cutoff = new Date('2000-01-01').toISOString();
  const { error } = await sb.from('audit_log').delete().gte('created_at', cutoff);
  if (error) {
    if (wrap) wrap.innerHTML = `<p style="color:red;padding:16px 0">Error: ${esc(error.message)}</p>`;
    return;
  }
  auditPeriodFilter = '7d';
  auditTypeFilter   = 'all';
  loadAuditLog();
}

async function confirmDeleteAdminLogs() {
  if (!ST.player?.is_super_admin) return;
  const superAdmins = ST.players.filter(p => p.is_super_admin).map(p => `${p.first_name} ${p.last_name}`).join(', ');
  showFormModal('Delete Admin Test Logs', `
    <p style="margin-bottom:16px">Delete all audit entries from super admin users (<strong>${esc(superAdmins)}</strong>). Real user logs will not be affected.</p>
    <div class="btn-row">
      <button class="btn-danger" onclick="deleteAdminAuditLogs()">Yes, delete</button>
      <button class="btn-secondary" onclick="closeFormModal()">Cancel</button>
    </div>
  `);
}

async function deleteAdminAuditLogs() {
  closeFormModal();
  if (!ST.player?.is_super_admin) return;
  const adminIds = ST.players.filter(p => p.is_super_admin).map(p => p.id);
  const wrap = document.getElementById('audit-log-wrap');
  if (wrap) wrap.innerHTML = '<p style="color:#888;padding:16px 0">Deleting…</p>';
  const { error } = await sb.from('audit_log').delete().in('player_id', adminIds);
  if (error) {
    if (wrap) wrap.innerHTML = `<p style="color:red;padding:16px 0">Error: ${esc(error.message)}</p>`;
    return;
  }
  loadAuditLog();
}

function openTermsModal() {
  showFormModal('Terms of Use', `
    <div style="font-size:14px;line-height:1.6;color:#333">
      <p>By using this app you agree to the following:</p>
      <ol style="padding-left:18px;margin-top:10px;display:flex;flex-direction:column;gap:10px">
        <li><strong>Informal tool.</strong> This app is provided as a convenience for members of the BC Squash Section. It is not an official British Club service.</li>
        <li><strong>No guarantee of accuracy.</strong> Session times, availability, and handicap data may not always be current or correct.</li>
        <li><strong>No liability.</strong> The app is provided as-is, with no warranties of any kind. The developer and organising committee accept no responsibility for missed sessions, incorrect handicap records, data loss, or any other consequence of using or being unable to use this app. Use is entirely at your own risk.</li>
        <li><strong>Your data.</strong> Your name and phone number may be stored to identify you within the app. Use of this app is not mandatory — only share information you are comfortable with, to the extent you wish to participate. Data is not shared with third parties and is used solely to manage section participation. This app does not implement strong security measures — do not store sensitive personal information beyond what is needed.</li>
        <li><strong>Access may change.</strong> The app may be updated, suspended, or shut down at any time without notice.</li>
        <li><strong>Fair use.</strong> Don't attempt to manipulate results, impersonate other members, or misuse admin functions.</li>
        <li><strong>Opting out.</strong> If you do not wish to participate or would like your data removed, please advise the organising committee and your details will be withdrawn from the app.</li>
      </ol>
    </div>
  `);
}

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
let reportsFilter = 'last12';  // 'last12' | 'last2y' | 'last3y' | 'all' | 'YYYY'

function getReportsDateRange(filter) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  if (filter === 'last12') {
    const d = new Date(today); d.setFullYear(d.getFullYear() - 1);
    return { from: d.toISOString().slice(0, 10), to: todayStr, label: 'Last 12 months' };
  }
  if (filter === 'last2y') {
    const d = new Date(today); d.setFullYear(d.getFullYear() - 2);
    return { from: d.toISOString().slice(0, 10), to: todayStr, label: 'Last 2 years' };
  }
  if (filter === 'last3y') {
    const d = new Date(today); d.setFullYear(d.getFullYear() - 3);
    return { from: d.toISOString().slice(0, 10), to: todayStr, label: 'Last 3 years' };
  }
  if (filter === 'all') {
    return { from: '2000-01-01', to: todayStr, label: 'All time' };
  }
  // Specific year
  const yr = parseInt(filter);
  const maxTo = today.getFullYear() === yr ? todayStr : `${yr}-12-31`;
  return { from: `${yr}-01-01`, to: maxTo, label: String(yr) };
}

async function renderReportsTab(filter) {
  if (filter !== undefined) reportsFilter = filter;
  const el = document.getElementById('tab-reports');

  // Build available years from events (fetch lightweight)
  let availYears = [];
  try {
    const { data: yrData } = await sb.from('events')
      .select('event_date').order('event_date').limit(1);
    if (yrData?.[0]) {
      const firstYr = parseInt(yrData[0].event_date.slice(0, 4));
      const curYr   = new Date().getFullYear();
      for (let y = curYr; y >= firstYr; y--) availYears.push(y);
    }
  } catch (_) {}

  const periodOptions = [
    { value: 'last12', label: 'Last 12m' },
    { value: 'last2y', label: 'Last 2y' },
    { value: 'last3y', label: 'Last 3y' },
    { value: 'all',    label: 'All time' },
    ...availYears.map(y => ({ value: String(y), label: String(y) }))
  ];

  const filterBar = `<div class="reports-filter-bar">
    ${periodOptions.map(o =>
      `<button class="reports-period-btn${reportsFilter === o.value ? ' active' : ''}"
        onclick="renderReportsTab('${o.value}')">${o.label}</button>`
    ).join('')}
  </div>`;

  el.innerHTML = filterBar + '<p style="color:#888;padding:8px 0">Loading…</p>';

  const { from: fromDate, to: toDate, label: periodLabel } = getReportsDateRange(reportsFilter);

  const [{ data: events }, { data: templates }] = await Promise.all([
    sb.from('events')
      .select('id, title, event_date, max_signups, template_id, signups(id, is_reserve, player_id, player:players!player_id(first_name, last_name, active))')
      .gte('event_date', fromDate).lte('event_date', toDate)
      .order('event_date'),
    sb.from('session_templates').select('id, name')
  ]);

  const evList = events || [];
  if (!evList.length) {
    el.innerHTML = filterBar + '<p style="color:#888;padding:8px 0">No data for this period.</p>';
    return;
  }

  const weekMap   = {};
  const tmplMap   = {};
  const tmplNames = Object.fromEntries((templates || []).map(t => [t.id, t.name]));

  for (const ev of evList) {
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

  const totalSessions  = evList.length;
  const totalConfirmed = evList.reduce((s, ev) => s + (ev.signups||[]).filter(x=>!x.is_reserve).length, 0);
  const totalCapacity  = evList.reduce((s, ev) => s + (ev.max_signups || 0), 0);
  const avgFill = totalCapacity ? Math.round((totalConfirmed / totalCapacity) * 100) : 0;
  const avgPerSession = totalSessions ? Math.round(totalConfirmed / totalSessions * 10) / 10 : 0;

  // Attendance frequency — derived from events in period
  const playerCounts = {};
  for (const ev of evList) {
    for (const s of (ev.signups || []).filter(s => !s.is_reserve && s.player_id && s.player)) {
      const pid = s.player_id;
      if (!playerCounts[pid]) {
        playerCounts[pid] = {
          name: `${s.player.first_name} ${s.player.last_name}`,
          active: s.player.active,
          count: 0
        };
      }
      playerCounts[pid].count++;
    }
  }
  const topAttendees = Object.values(playerCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const weeks      = Object.keys(weekMap).sort();
  const weekLabels = weeks.map(k => weekMap[k].label);
  const weekConf   = weeks.map(k => weekMap[k].confirmed);
  const weekRes    = weeks.map(k => weekMap[k].reserve);
  const tmplIds    = Object.keys(tmplMap);
  const tmplLabels = tmplIds.map(id => tmplMap[id].name);
  const tmplAvg    = tmplIds.map(id => Math.round(tmplMap[id].total / tmplMap[id].count));

  const attendeeRows = topAttendees.map((p, i) => `
    <tr>
      <td style="color:#888;width:28px">${i+1}</td>
      <td>${esc(p.name)}${!p.active ? ' <span style="font-size:10px;color:#aaa">(inactive)</span>' : ''}</td>
      <td style="text-align:right;font-weight:600">${p.count}</td>
      <td style="text-align:right;color:#888;font-size:12px">${totalSessions ? Math.round(p.count/totalSessions*100) + '%' : ''}</td>
    </tr>`).join('');

  el.innerHTML = filterBar + `
    <div class="stats-row">
      <div class="stat-box"><div class="stat-num">${totalSessions}</div><div class="stat-label">Sessions (${periodLabel})</div></div>
      <div class="stat-box"><div class="stat-num">${totalConfirmed}</div><div class="stat-label">Total Attendances</div></div>
      <div class="stat-box"><div class="stat-num">${avgFill}%</div><div class="stat-label">Avg Fill Rate</div></div>
      <div class="stat-box"><div class="stat-num">${avgPerSession}</div><div class="stat-label">Avg per Session</div></div>
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
    </div>
    <div class="report-card" style="margin-top:16px">
      <div class="report-title">Most Frequent Players</div>
      <table class="data-table attendance-table">
        <thead><tr><th>#</th><th>Player</th><th style="text-align:right">Sessions</th><th style="text-align:right">Attendance %</th></tr></thead>
        <tbody>${attendeeRows || '<tr><td colspan="4" style="color:#888">No data</td></tr>'}</tbody>
      </table>
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

// ── HC Calculator ─────────────────────────────────────────────────────────
function computeHcStarts(hcA, hcB) {
  let nettedA = hcA, nettedB = hcB;
  let netted = false;
  if (hcA < 0 && hcB < 0) {
    const worst = Math.max(hcA, hcB);
    nettedA = hcA - worst;
    nettedB = hcB - worst;
    netted = true;
  } else if (hcA > 0 && hcB > 0) {
    const best = Math.min(hcA, hcB);
    nettedA = hcA - best;
    nettedB = hcB - best;
    netted = true;
  }
  const diff = Math.abs(nettedA - nettedB);
  const shifts = Math.floor(diff / 6);
  const startA = Math.min(nettedA + shifts, 7);
  const startB = Math.min(nettedB + shifts, 7);
  return { startA, startB, netted, shifts };
}

function openHcCalculator() {
  const myHc = ST.player?.current_handicap ?? '';
  showFormModal('HC Calculator', `
    <div class="form-group">
      <label>Player A handicap</label>
      <input type="number" id="hcc-a" value="${myHc}" style="text-align:center;font-size:18px;font-weight:700;width:100%">
    </div>
    <div class="form-group">
      <label>Player B handicap</label>
      <input type="number" id="hcc-b" placeholder="e.g. -5" style="text-align:center;font-size:18px;font-weight:700;width:100%">
    </div>
    <button class="btn-primary" style="width:100%" onclick="calcHcResult()">Calculate</button>
    <div id="hcc-result" class="hc-calc-result" style="display:none"></div>
  `);
}

function calcHcResult() {
  const valA = parseFloat(document.getElementById('hcc-a').value);
  const valB = parseFloat(document.getElementById('hcc-b').value);
  const el = document.getElementById('hcc-result');
  if (isNaN(valA) || isNaN(valB)) {
    el.style.display = 'block';
    el.innerHTML = `<p style="color:#dc2626;font-size:13px">Please enter valid handicaps for both players.</p>`;
    return;
  }
  const { startA, startB, netted, shifts } = computeHcStarts(valA, valB);
  const fmt = n => n === 0 ? '0' : (n > 0 ? '+' + n : '−' + Math.abs(n));
  const shiftNote = shifts > 0 ? `, shifted ${shifts} place${shifts > 1 ? 's' : ''}` : '';
  const noteText = netted
    ? `Handicaps netted off${shiftNote}`
    : `Handicaps straddle zero — no netting${shiftNote}`;
  el.style.display = 'block';
  el.innerHTML = `
    <div style="display:flex;gap:12px;justify-content:center;margin-top:12px">
      <div class="hc-calc-player-box">
        <div class="hc-calc-label">Player A</div>
        <div class="hc-calc-score">${fmt(startA)}</div>
      </div>
      <div style="align-self:center;font-size:18px;color:#94a3b8">vs</div>
      <div class="hc-calc-player-box">
        <div class="hc-calc-label">Player B</div>
        <div class="hc-calc-score">${fmt(startB)}</div>
      </div>
    </div>
    <div class="hc-calc-note">${noteText}</div>
  `;
}
