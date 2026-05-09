/* app.js — Squash Club SPA (Supabase) */
'use strict';

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
document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  setupModalClose();

  document.getElementById('event-list').addEventListener('click', e => {
    const clickable = e.target.closest('.ev-clickable');
    if (clickable) openEvent(clickable.dataset.id);
  });

  document.getElementById('btn-google-signin').addEventListener('click', () => {
    sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href.split('?')[0].split('#')[0] }
    });
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await sb.auth.signOut();
    ST.player = null;
    showView('login');
  });

  sb.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      await resolvePlayer(session.user.email);
    } else {
      showView('login');
    }
  });
});

// ── Auth ──────────────────────────────────────────────────────────────────
async function resolvePlayer(email) {
  const { data, error } = await sb.from('players')
    .select('*')
    .eq('email', email)
    .eq('active', true)
    .single();

  if (error || !data) {
    document.getElementById('login-error').textContent =
      'Your account is not registered in the club. Contact an admin.';
    await sb.auth.signOut();
    showView('login');
    return;
  }
  loginSuccess(data);
}

function loginSuccess(player) {
  ST.player = player;
  document.getElementById('header-name').textContent =
    `${player.first_name} ${player.last_name}`;
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', !player.is_admin);
  });
  showView('app');
  showSection('view-schedule');
  setNavActive('schedule');
  loadSchedule();
}

// ── Navigation ────────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const v = btn.dataset.view;
      if (v === 'schedule') { showSection('view-schedule'); loadSchedule(); }
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
  if (name === 'login') document.getElementById('view-login').classList.remove('hidden');
  if (name === 'app')   document.getElementById('view-app').classList.remove('hidden');
}

function showSection(id) {
  ['view-schedule','view-event','view-admin'].forEach(s => {
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
    ? `<button class="btn-leave" onclick="leaveEvent(event,'${mySignup.id}','${ev.id}')">Cancel</button>
       <button class="btn-add-guest" onclick="addGuestInCard(event,'${ev.id}')">+ Guest</button>`
    : `<button class="btn-join" onclick="joinEvent(event,'${ev.id}')">Join</button>`;

  const chips = signups.map(s => {
    const name = s.player_first ? esc(s.player_first) : esc(s.guest_name || 'Guest');
    const isGuest = !s.player_id;
    const cls = isGuest ? 'chip-guest' : s.is_reserve ? 'chip-reserve' : 'chip-confirmed';
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
    <div id="ev-guest-form-${ev.id}" class="ev-guest-form hidden">
      <input type="text" placeholder="Guest name" id="ev-guest-input-${ev.id}">
      <button class="btn-primary" style="font-size:12px;padding:4px 10px"
              onclick="submitGuestInCard('${ev.id}')">Add</button>
      <button class="btn-text" style="color:#888;font-size:12px;padding:4px"
              onclick="cancelGuestInCard('${ev.id}')">Cancel</button>
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
    const { count } = await sb.from('signups')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId).eq('is_reserve', false);
    const isReserve = !!(ev.max_signups && count >= ev.max_signups);
    const { error } = await sb.from('signups').insert({
      event_id: eventId, signed_up_by: ST.player.id,
      player_id: ST.player.id, is_reserve: isReserve
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
    refreshCard(eventId, await fetchEventSignups(eventId));
  } catch (err) { alert(err.message); }
}

function addGuestInCard(e, eventId) {
  e.stopPropagation();
  document.getElementById(`ev-guest-form-${eventId}`).classList.remove('hidden');
  document.getElementById(`ev-guest-input-${eventId}`).focus();
}

function cancelGuestInCard(eventId) {
  document.getElementById(`ev-guest-form-${eventId}`).classList.add('hidden');
  document.getElementById(`ev-guest-input-${eventId}`).value = '';
}

async function submitGuestInCard(eventId) {
  const input = document.getElementById(`ev-guest-input-${eventId}`);
  const name = input.value.trim();
  if (!name) { alert('Enter a guest name'); return; }
  try {
    const { data: ev } = await sb.from('events').select('max_signups').eq('id', eventId).single();
    const { count } = await sb.from('signups')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId).eq('is_reserve', false);
    const isReserve = !!(ev.max_signups && count >= ev.max_signups);
    const { error } = await sb.from('signups').insert({
      event_id: eventId, signed_up_by: ST.player.id,
      guest_name: name, is_reserve: isReserve
    });
    if (error) throw error;
    refreshCard(eventId, await fetchEventSignups(eventId));
  } catch (err) { alert(err.message); }
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
    .eq('id', id)
    .single();
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

  const el = document.getElementById('event-detail');
  el.innerHTML = `
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
  const name = s.player_name || s.guest_name || '?';
  const byOther = s.signed_up_by !== s.player_id && s.player_name;
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
  const playerOpts = otherPlayers.length
    ? otherPlayers.map(p => `<option value="${p.id}">${esc(p.first_name)} ${esc(p.last_name)}</option>`).join('')
    : '';

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
        <div class="form-group">
          <label>A guest</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="su-guest-name" placeholder="Guest name" style="flex:1">
            <button class="btn-primary" onclick="submitSignup('${ev.id}','guest')">Add</button>
          </div>
        </div>
      </div>
    </details>
  </div>`;
}

document.getElementById('event-detail').addEventListener('change', e => {
  if (e.target.name !== 'su-type') return;
  document.getElementById('su-player-wrap')?.classList.toggle('hidden', e.target.value !== 'player');
  document.getElementById('su-guest-wrap')?.classList.toggle('hidden', e.target.value !== 'guest');
});

async function submitSignup(eventId, type) {
  await ensurePlayers();
  const { data: ev } = await sb.from('events').select('max_signups').eq('id', eventId).single();
  const { count } = await sb.from('signups')
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
  } else if (type === 'guest') {
    const name = document.getElementById('su-guest-name').value.trim();
    if (!name) { alert('Please enter the guest name'); return; }
    row.guest_name = name;
  }

  const { error } = await sb.from('signups').insert(row);
  if (error) { alert(error.message); return; }
  openEvent(eventId);
}

async function removeSignup(signupId) {
  if (!confirm('Remove this signup?')) return;
  const { error } = await sb.from('signups').delete().eq('id', signupId);
  if (error) { alert(error.message); return; }
  if (ST.currentEvent) openEvent(ST.currentEvent.id);
}

// ── Admin ─────────────────────────────────────────────────────────────────
async function loadAdminTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(tabId)?.classList.remove('hidden');

  if (tabId === 'tab-players')   await renderPlayersTab();
  if (tabId === 'tab-events')    await renderAdminEvents();
  if (tabId === 'tab-templates') await renderTemplatesTab();
}

// ── Players tab ───────────────────────────────────────────────────────────
async function renderPlayersTab() {
  const { data } = await sb.from('players').select('*').eq('active', true).order('last_name');
  ST.players = data || [];
  const wrap = document.getElementById('players-table-wrap');
  if (!ST.players.length) { wrap.innerHTML = '<p>No players yet.</p>'; return; }
  wrap.innerHTML = `<table class="data-table">
    <thead><tr>
      <th>Name</th><th>Email</th><th>Handicap</th><th>Role</th><th></th>
    </tr></thead>
    <tbody>
    ${ST.players.map(p => `<tr>
      <td>${esc(p.first_name)} ${esc(p.last_name)}</td>
      <td>${esc(p.email)}</td>
      <td><span class="hcap-badge">${p.current_handicap ?? '–'}</span></td>
      <td>${p.is_admin ? '<span class="tag-admin">Admin</span>' : ''}</td>
      <td style="white-space:nowrap">
        <button class="btn-secondary" style="font-size:12px;padding:4px 8px;margin-right:4px"
          onclick="openHandicapModal('${p.id}','${esc(p.first_name)} ${esc(p.last_name)}')">Handicap</button>
        <button class="btn-secondary" style="font-size:12px;padding:4px 8px;margin-right:4px"
          onclick="openEditPlayerForm('${p.id}')">Edit</button>
        <button class="btn-danger" onclick="deactivatePlayer('${p.id}')">Remove</button>
      </td>
    </tr>`).join('')}
    </tbody>
  </table>`;

  document.getElementById('btn-add-player').onclick = openAddPlayerForm;
}

function openAddPlayerForm() {
  showFormModal('Add Player', `
    <div class="form-group"><label>First name</label><input type="text" id="fp-first" autocomplete="off"></div>
    <div class="form-group"><label>Last name</label><input type="text" id="fp-last" autocomplete="off"></div>
    <div class="form-group"><label>Email</label><input type="email" id="fp-email" autocomplete="off"></div>
    <div class="form-group"><label>Handicap</label><input type="number" id="fp-hcap" min="-35" max="10" step="0.5"></div>
    <div class="form-group"><label><input type="checkbox" id="fp-admin"> Admin</label></div>
    <div style="text-align:right;margin-top:8px">
      <button class="btn-primary" onclick="submitAddPlayer()">Add Player</button>
    </div>
  `);
}

async function submitAddPlayer() {
  const body = {
    first_name:       document.getElementById('fp-first').value.trim(),
    last_name:        document.getElementById('fp-last').value.trim(),
    email:            document.getElementById('fp-email').value.trim(),
    is_admin:         document.getElementById('fp-admin').checked,
    current_handicap: parseFloat(document.getElementById('fp-hcap').value) || null
  };
  if (!body.first_name || !body.last_name || !body.email) { alert('Name and email required'); return; }
  const { error } = await sb.from('players').insert(body);
  if (error) { alert(error.message); return; }
  closeFormModal();
  await renderPlayersTab();
}

function openEditPlayerForm(id) {
  const p = ST.players.find(x => x.id === id);
  if (!p) return;
  showFormModal('Edit Player', `
    <div class="form-group"><label>First name</label><input type="text" id="ep-first" value="${esc(p.first_name)}"></div>
    <div class="form-group"><label>Last name</label><input type="text" id="ep-last" value="${esc(p.last_name)}"></div>
    <div class="form-group"><label>Email</label><input type="email" id="ep-email" value="${esc(p.email)}"></div>
    <div class="form-group"><label><input type="checkbox" id="ep-admin" ${p.is_admin?'checked':''}> Admin</label></div>
    <div style="text-align:right;margin-top:8px">
      <button class="btn-primary" onclick="submitEditPlayer('${id}')">Save</button>
    </div>
  `);
}

async function submitEditPlayer(id) {
  const body = {
    first_name: document.getElementById('ep-first').value.trim(),
    last_name:  document.getElementById('ep-last').value.trim(),
    email:      document.getElementById('ep-email').value.trim(),
    is_admin:   document.getElementById('ep-admin').checked
  };
  const { error } = await sb.from('players').update(body).eq('id', id);
  if (error) { alert(error.message); return; }
  closeFormModal();
  await renderPlayersTab();
}

async function deactivatePlayer(id) {
  if (!confirm('Remove this player? They will no longer be able to sign in.')) return;
  const { error } = await sb.from('players').update({ active: false }).eq('id', id);
  if (error) { alert(error.message); return; }
  await renderPlayersTab();
}

// ── Handicap modal ────────────────────────────────────────────────────────
async function openHandicapModal(playerId, playerName) {
  document.getElementById('modal-title').textContent = `Handicap — ${playerName}`;
  const { data: history } = await sb.from('handicap_history')
    .select('*, changed_by_player:players!changed_by (first_name, last_name)')
    .eq('player_id', playerId)
    .order('changed_at', { ascending: false });
  const p = ST.players.find(x => x.id === playerId);

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
      </tbody>
    </table>` : '<p style="color:#888;font-size:13px">No history yet.</p>'}
  `;
  openModal();
}

async function submitHandicap(playerId) {
  const value = parseFloat(document.getElementById('hc-value').value);
  if (isNaN(value)) { alert('Enter a valid handicap value'); return; }
  const notes = document.getElementById('hc-notes').value.trim();
  const { error: hErr } = await sb.from('handicap_history').insert({
    player_id:      playerId,
    handicap_value: value,
    changed_by:     ST.player.id,
    notes:          notes || null
  });
  if (hErr) { alert(hErr.message); return; }
  const { error: pErr } = await sb.from('players')
    .update({ current_handicap: value }).eq('id', playerId);
  if (pErr) { alert(pErr.message); return; }
  const p = ST.players.find(x => x.id === playerId);
  const name = p ? `${p.first_name} ${p.last_name}` : '';
  await renderPlayersTab();
  await openHandicapModal(playerId, name);
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
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    query = query.lte('event_date', yesterday.toISOString().slice(0, 10));
  } else if (mode === 'range') {
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

  const filterBar = `<div class="admin-filter-bar">
    <button class="admin-filter-btn${mode==='upcoming'?' active':''}" onclick="setAdminFilter('upcoming')">Upcoming</button>
    <button class="admin-filter-btn${mode==='past'?' active':''}" onclick="setAdminFilter('past')">Past</button>
    <button class="admin-filter-btn${mode==='range'?' active':''}" onclick="setAdminFilter('range')">Date Range</button>
    ${rangeInputs}
  </div>`;

  el.innerHTML = filterBar + ((events||[]).length
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
      title:       tmpl.name,
      event_date:  date,
      start_time:  tmpl.start_time,
      end_time:    tmpl.end_time,
      max_signups: tmpl.max_signups,
      template_id: tmpl.id,
      created_by:  ST.player.id
    });
    if (!error) created++;
  }
  alert(`Created ${created} event(s) for next week.`);
  await renderAdminEvents();
}

function getNextMonday() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
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
    </div>
  `);
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
      </div>
    `);
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
    </div>
  `).join('');

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
    </div>
  `);
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
    </div>
  `);
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

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDatetime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function ensurePlayers() {
  if (!ST.players.length) {
    const { data } = await sb.from('players').select('*').eq('active', true).order('last_name');
    ST.players = data || [];
  }
}

document.getElementById('view-app').addEventListener('click', () => ensurePlayers(), { once: true });
