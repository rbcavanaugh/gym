
let searchQuery = '';
let wakeLock = null;

const SESSION_KEY = 'gym_session';
const PREFS_KEY = 'gym_prefs';
const SESSION_TTL = 2 * 60 * 60 * 1000;
const LONG_PRESS_MS = 600;

const state = {
  view: 'home',
  selectBank: 'exercises',
  exerciseBank: [],
  stretchBank: [],
  defaultExerciseBank: [],
  defaultStretchBank: [],
  selectedExercises: [],
  selectedStretches: [],
  nextGroup: 1,
  dark: true,
  wakelock: false,
  github: { owner: '', repo: '', pat: '' },
};

// --- Prefs ---

function deriveGitHubRepo() {
  const host = window.location.hostname;
  if (host.endsWith('.github.io')) {
    state.github.owner = host.split('.')[0];
    state.github.repo = window.location.pathname.split('/').filter(Boolean)[0] || '';
  }
}

function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ wakelock: state.wakelock }));
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const prefs = JSON.parse(raw);
      state.wakelock = prefs.wakelock || false;
    }
  } catch {}
}

// --- Wake Lock ---

async function requestWakeLock() {
  if (!state.wakelock || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {}
}

async function releaseWakeLock() {
  if (wakeLock) {
    await wakeLock.release();
    wakeLock = null;
  }
}

// --- Persistence ---

function saveSession() {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    lastSaved: Date.now(),
    view: state.view,
    selectBank: state.selectBank,
    selectedExercises: state.selectedExercises,
    selectedStretches: state.selectedStretches,
    nextGroup: state.nextGroup,
    dark: state.dark,
  }));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (Date.now() - data.lastSaved > SESSION_TTL) {
      localStorage.removeItem(SESSION_KEY);
      return false;
    }
    state.view = data.view || 'home';
    state.selectBank = data.selectBank || 'exercises';
    state.selectedExercises = data.selectedExercises || [];
    state.selectedStretches = data.selectedStretches || [];
    state.nextGroup = data.nextGroup || 1;
    state.dark = data.dark || false;

    state.selectedExercises.forEach(s => {
      if (!state.exerciseBank.find(i => i.name === s.name)) {
        state.exerciseBank.push({ name: s.name });
      }
    });
    state.selectedStretches.forEach(s => {
      if (!state.stretchBank.find(i => i.name === s.name)) {
        state.stretchBank.push({ name: s.name });
      }
    });
    state.exerciseBank.sort((a, b) => a.name.localeCompare(b.name));
    state.stretchBank.sort((a, b) => a.name.localeCompare(b.name));

    return true;
  } catch {
    return false;
  }
}

// --- CSV Loading ---

async function loadCSV(url) {
  const res = await fetch(url);
  const text = await res.text();
  return text.trim().split('\n').slice(1)
    .map(line => line.trim())
    .filter(Boolean)
    .map(name => ({ name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// --- View switching ---

function showView(name) {
  state.view = name;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`view-${name}`).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(t => {
    t.classList.toggle('active', t.dataset.view === name);
  });
  if (name === 'select') renderSelectView();
  if (name === 'workout') { renderWorkoutView(); requestWakeLock(); }
  else releaseWakeLock();
  if (name === 'settings') renderSettingsView();
  closeMenu();
  saveSession();
}

function openMenu() {
  document.getElementById('nav-menu').classList.remove('hidden');
  document.getElementById('nav-overlay').classList.remove('hidden');
}

function closeMenu() {
  document.getElementById('nav-menu').classList.add('hidden');
  document.getElementById('nav-overlay').classList.add('hidden');
}

// --- Select View ---

function renderSelectView() {
  const bank = state.selectBank === 'exercises' ? state.exerciseBank : state.stretchBank;
  const selected = state.selectBank === 'exercises' ? state.selectedExercises : state.selectedStretches;

  const groups = [...new Set(selected.filter(s => s.group !== null).map(s => s.group))].sort((a, b) => a - b);
  const groupDisplayNum = {};
  groups.forEach((g, i) => { groupDisplayNum[g] = i + 1; });

  document.querySelectorAll('.select-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.bank === state.selectBank);
  });

  const list = document.getElementById('bank-list');
  list.innerHTML = '';

  const query = searchQuery.toLowerCase();
  const filtered = query
    ? bank.filter(item => item.name.toLowerCase().includes(query))
    : bank;

  if (filtered.length === 0 && query) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const addBtn = document.createElement('button');
    addBtn.className = 'add-custom-btn';
    addBtn.textContent = `Add "${searchQuery}"`;
    addBtn.addEventListener('click', () => addCustomItem(searchQuery));
    empty.appendChild(addBtn);
    list.appendChild(empty);
    updateGroupBtn();
    return;
  }

  filtered.forEach(item => {
    const sel = selected.find(s => s.name === item.name);
    const div = document.createElement('div');
    div.className = 'bank-item' + (sel ? ' selected' : '');

    const nameSpan = document.createElement('span');
    nameSpan.textContent = item.name;
    div.appendChild(nameSpan);

    const right = document.createElement('span');
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '8px';

    if (sel && sel.group !== null) {
      const badge = document.createElement('span');
      badge.className = 'group-badge';
      badge.textContent = `S${groupDisplayNum[sel.group]}`;
      right.appendChild(badge);
    }

    const check = document.createElement('span');
    check.className = 'bank-item-check';
    check.textContent = sel ? '✓' : '';
    right.appendChild(check);

    div.appendChild(right);

    attachWorkoutEvents(div,
      () => toggleBankItem(item.name),
      () => showModal(item.name, 'Remove', () => deleteBankItem(item.name))
    );
    list.appendChild(div);
  });

  updateGroupBtn();
}

function toggleBankItem(name) {
  const arr = state.selectBank === 'exercises' ? state.selectedExercises : state.selectedStretches;
  const idx = arr.findIndex(s => s.name === name);

  if (idx >= 0) {
    const group = arr[idx].group;
    arr.splice(idx, 1);
    if (group !== null) cleanupGroup(arr, group);
  } else {
    arr.push({ uid: Date.now() + Math.random(), name, group: null, sets: 0 });
  }

  renderSelectView();
  saveSession();
}

function addCustomItem(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const bank = state.selectBank === 'exercises' ? state.exerciseBank : state.stretchBank;
  if (bank.find(i => i.name.toLowerCase() === trimmed.toLowerCase())) return;

  bank.push({ name: trimmed });
  bank.sort((a, b) => a.name.localeCompare(b.name));

  const selected = state.selectBank === 'exercises' ? state.selectedExercises : state.selectedStretches;
  selected.push({ uid: Date.now() + Math.random(), name: trimmed, group: null, sets: 0 });

  searchQuery = '';
  document.getElementById('search-input').value = '';
  document.getElementById('search-bar').classList.add('hidden');
  document.getElementById('search-btn').classList.remove('active');

  renderSelectView();
  saveSession();
}


function deleteBankItem(name) {
  const bank = state.selectBank === 'exercises' ? state.exerciseBank : state.stretchBank;
  const selectedArr = state.selectBank === 'exercises' ? state.selectedExercises : state.selectedStretches;

  const bankIdx = bank.findIndex(i => i.name === name);
  if (bankIdx >= 0) bank.splice(bankIdx, 1);

  const selIdx = selectedArr.findIndex(s => s.name === name);
  if (selIdx >= 0) {
    const group = selectedArr[selIdx].group;
    selectedArr.splice(selIdx, 1);
    if (group !== null) cleanupGroup(selectedArr, group);
  }

  renderSelectView();
  saveSession();
}

function cleanupGroup(arr, group) {
  // intentionally empty — group label persists until all members are removed
}

function updateGroupBtn() {
  const arr = state.selectBank === 'exercises' ? state.selectedExercises : state.selectedStretches;
  const ungrouped = arr.filter(s => s.group === null);
  document.getElementById('group-btn').disabled = ungrouped.length < 1;
}

function groupSelected() {
  const arr = state.selectBank === 'exercises' ? state.selectedExercises : state.selectedStretches;
  const ungrouped = arr.filter(s => s.group === null);
  if (ungrouped.length < 1) return;
  const g = state.nextGroup++;
  ungrouped.forEach(s => s.group = g);
  renderSelectView();
  saveSession();
}

// --- Workout View ---

function renderWorkoutView() {
  const list = document.getElementById('workout-list');
  list.innerHTML = '';

  if (state.selectedExercises.length === 0 && state.selectedStretches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No exercises selected';
    const btn = document.createElement('button');
    btn.className = 'add-custom-btn';
    btn.style.marginTop = '16px';
    btn.textContent = 'Select Exercises';
    btn.addEventListener('click', () => showView('select'));
    empty.appendChild(btn);
    list.appendChild(empty);
    return;
  }

  renderWorkoutSection(list, state.selectedExercises, 'exercises', 'Exercises');
  renderWorkoutSection(list, state.selectedStretches, 'stretches', 'Stretches');
}

function renderWorkoutSection(container, items, bank, label) {
  if (items.length === 0) return;

  const header = document.createElement('div');
  header.className = 'section-label';
  header.textContent = label;
  container.appendChild(header);

  const ungrouped = items.filter(i => i.group === null);
  const groupMap = {};
  items.filter(i => i.group !== null).forEach(i => {
    (groupMap[i.group] = groupMap[i.group] || []).push(i);
  });

  ungrouped.forEach(item => container.appendChild(makeWorkoutItem(item, bank)));

  let supersetNum = 1;
  Object.entries(groupMap).sort(([a], [b]) => Number(a) - Number(b)).forEach(([, groupItems]) => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'workout-group';

    const gLabel = document.createElement('div');
    gLabel.className = 'superset-label';
    gLabel.textContent = `Superset ${supersetNum++}`;
    groupDiv.appendChild(gLabel);

    groupItems.forEach(item => groupDiv.appendChild(makeWorkoutItem(item, bank)));
    container.appendChild(groupDiv);
  });
}

function makeWorkoutItem(item, bank) {
  const div = document.createElement('div');
  div.className = 'workout-item';

  const sets = item.sets ?? 0;

  const name = document.createElement('span');
  name.textContent = item.name;
  div.appendChild(name);

  const counter = document.createElement('span');
  counter.className = 'workout-item-sets' + (sets > 0 ? ' active' : '');
  counter.textContent = sets > 0 ? sets : '—';
  div.appendChild(counter);

  attachWorkoutEvents(div,
    () => incrementSets(item.uid, bank),
    () => showModal(item.name, 'Mark as Done', () => completeItem(item.uid, bank))
  );

  return div;
}

function incrementSets(uid, bank) {
  const arr = bank === 'exercises' ? state.selectedExercises : state.selectedStretches;
  const item = arr.find(s => s.uid === uid);
  if (!item) return;
  item.sets = (item.sets ?? 0) + 1;
  renderWorkoutView();
  saveSession();
}

function completeItem(uid, bank) {
  const arr = bank === 'exercises' ? state.selectedExercises : state.selectedStretches;
  const idx = arr.findIndex(s => s.uid === uid);
  if (idx < 0) return;
  const group = arr[idx].group;
  arr.splice(idx, 1);
  if (group !== null) cleanupGroup(arr, group);
  renderWorkoutView();
  saveSession();
}

// --- Long press ---

function attachWorkoutEvents(el, onTap, onLongPress) {
  let timer = null;
  let didLongPress = false;

  el.addEventListener('touchstart', () => {
    didLongPress = false;
    timer = setTimeout(() => {
      didLongPress = true;
      onLongPress();
    }, LONG_PRESS_MS);
  }, { passive: true });

  el.addEventListener('touchmove', () => {
    clearTimeout(timer);
    timer = null;
  });

  el.addEventListener('touchend', () => {
    clearTimeout(timer);
    timer = null;
  });

  el.addEventListener('touchcancel', () => {
    clearTimeout(timer);
    timer = null;
  });

  el.addEventListener('click', () => {
    if (!didLongPress) onTap();
    didLongPress = false;
  });
}

// --- Modal ---

let pendingAction = null;

function showModal(name, confirmLabel, action) {
  pendingAction = action;
  document.getElementById('modal-name').textContent = name;
  document.getElementById('modal-confirm').textContent = confirmLabel;
  document.getElementById('modal-cancel').style.display = '';
  document.getElementById('modal').classList.remove('hidden');
}

function showAlert(message) {
  pendingAction = null;
  document.getElementById('modal-name').textContent = message;
  document.getElementById('modal-confirm').textContent = 'OK';
  document.getElementById('modal-cancel').style.display = 'none';
  document.getElementById('modal').classList.remove('hidden');
}

function hideModal() {
  pendingAction = null;
  document.getElementById('modal').classList.add('hidden');
}

// --- Reset ---

function resetBank(bank) {
  const defaults = bank === 'exercises' ? state.defaultExerciseBank : state.defaultStretchBank;
  const defaultNames = new Set(defaults.map(i => i.name));

  if (bank === 'exercises') {
    state.exerciseBank = defaults.map(i => ({ ...i }));
    state.selectedExercises = [];
  } else {
    state.stretchBank = defaults.map(i => ({ ...i }));
    state.selectedStretches = [];
  }
  state.nextGroup = 1;

  if (state.view === 'select') renderSelectView();
  if (state.view === 'workout') renderWorkoutView();
  saveSession();
}

// --- Settings View ---

function renderSettingsView() {
  document.querySelectorAll('input[name="theme"]').forEach(r => {
    r.checked = r.value === (state.dark ? 'dark' : 'light');
  });
  document.querySelectorAll('input[name="wakelock"]').forEach(r => {
    r.checked = r.value === (state.wakelock ? 'on' : 'off');
  });
  document.getElementById('gh-pat').value = state.github.pat;
  updateGitHubActions();
}

function updateGitHubActions() {
  const { owner, repo, pat } = state.github;
  const enabled = !!(owner && repo && pat);
  document.querySelectorAll('.gh-push-btn').forEach(btn => btn.disabled = !enabled);
}

async function pushCSVToGitHub(bank) {
  const { owner, repo, pat } = state.github;
  const path = bank === 'exercises' ? 'exercises.csv' : 'stretches.csv';
  const items = bank === 'exercises' ? state.exerciseBank : state.stretchBank;
  const content = 'name\n' + items.map(i => i.name).join('\n') + '\n';

  setGitHubStatus('Pushing...');
  try {
    const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      headers: { 'Authorization': `Bearer ${pat}`, 'Accept': 'application/vnd.github+json' }
    });
    if (!getRes.ok) throw new Error(`${getRes.status}`);
    const { sha } = await getRes.json();

    const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Update ${path}`,
        content: btoa(unescape(encodeURIComponent(content))),
        sha,
      }),
    });
    if (!putRes.ok) throw new Error(`${putRes.status}`);
    setGitHubStatus('');
    showAlert(`${path} updated successfully`);
  } catch (e) {
    setGitHubStatus('');
    const msg = e instanceof TypeError
      ? `Update failed — no network connection`
      : `Update failed (${e.message})`;
    showAlert(msg);
  }
}

function setGitHubStatus(msg) {
  document.getElementById('gh-status').textContent = msg;
}

// --- Pull to refresh ---

function initPullToRefresh() {
  const view = document.getElementById('view-home');
  const indicator = document.getElementById('ptr-indicator');
  const THRESHOLD = 72;
  let startY = 0;
  let active = false;

  view.addEventListener('touchstart', e => {
    if (view.scrollTop === 0) {
      startY = e.touches[0].clientY;
      active = true;
    }
  }, { passive: true });

  view.addEventListener('touchmove', e => {
    if (!active) return;
    const dy = e.touches[0].clientY - startY;
    indicator.classList.toggle('visible', dy > 16);
  }, { passive: true });

  view.addEventListener('touchend', e => {
    if (!active) return;
    active = false;
    indicator.classList.remove('visible');
    const dy = e.changedTouches[0].clientY - startY;
    if (dy > THRESHOLD) triggerPWAUpdate();
  });
}

async function triggerPWAUpdate() {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update();
  }
  window.location.reload();
}

// --- Dark mode ---

function applyDark() {
  document.body.classList.toggle('dark', state.dark);
  document.getElementById('meta-theme').content = state.dark ? '#000000' : '#ffffff';
}

// --- Init ---

async function init() {
  [state.exerciseBank, state.stretchBank, state.defaultExerciseBank, state.defaultStretchBank] = await Promise.all([
    loadCSV('exercises.csv'),
    loadCSV('stretches.csv'),
    loadCSV('default_exercises.csv'),
    loadCSV('default_stretches.csv'),
  ]);

  loadSession();
  loadPrefs();
  deriveGitHubRepo();
  applyDark();

  document.querySelectorAll('input[name="wakelock"]').forEach(r => {
    r.addEventListener('change', () => {
      state.wakelock = r.value === 'on';
      savePrefs();
      if (state.view === 'workout') {
        state.wakelock ? requestWakeLock() : releaseWakeLock();
      }
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.view === 'workout') {
      requestWakeLock();
    }
  });

  document.getElementById('new-workout-btn').addEventListener('click', () => {
    state.selectedExercises = [];
    state.selectedStretches = [];
    state.nextGroup = 1;
    showView('select');
  });

  document.getElementById('hamburger').addEventListener('click', () => {
    const isOpen = !document.getElementById('nav-menu').classList.contains('hidden');
    isOpen ? closeMenu() : openMenu();
  });

  document.getElementById('nav-overlay').addEventListener('click', closeMenu);

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => showView(item.dataset.view));
  });

  document.querySelectorAll('.select-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.selectBank = tab.dataset.bank;
      renderSelectView();
    });
  });

  document.getElementById('gh-pat').addEventListener('input', e => {
    state.github.pat = e.target.value;
    updateGitHubActions();
  });

  document.querySelectorAll('.gh-push-btn').forEach(btn => {
    btn.addEventListener('click', () => pushCSVToGitHub(btn.dataset.bank));
  });

  document.querySelectorAll('.reset-btn').forEach(btn => {
    btn.addEventListener('click', () => resetBank(btn.dataset.bank));
  });

  document.getElementById('group-btn').addEventListener('click', groupSelected);
  document.querySelectorAll('input[name="theme"]').forEach(r => {
    r.addEventListener('change', () => {
      state.dark = r.value === 'dark';
      applyDark();
      saveSession();
    });
  });

  document.getElementById('done-btn').addEventListener('click', () => showView('workout'));

  const searchBtn = document.getElementById('search-btn');
  const searchBar = document.getElementById('search-bar');
  const searchInput = document.getElementById('search-input');

  searchBtn.addEventListener('click', () => {
    const open = !searchBar.classList.contains('hidden');
    if (open) {
      searchBar.classList.add('hidden');
      searchBtn.classList.remove('active');
      searchQuery = '';
      searchInput.value = '';
      renderSelectView();
    } else {
      searchBar.classList.remove('hidden');
      searchBtn.classList.add('active');
      searchInput.focus();
    }
  });

  searchInput.addEventListener('input', e => {
    searchQuery = e.target.value;
    renderSelectView();
  });

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') searchInput.blur();
  });

  document.getElementById('modal-confirm').addEventListener('click', () => {
    if (pendingAction) pendingAction();
    hideModal();
  });

  document.getElementById('modal-cancel').addEventListener('click', hideModal);

  document.getElementById('modal').addEventListener('click', e => {
    if (e.target === document.getElementById('modal')) hideModal();
  });

  initPullToRefresh();
  showView(state.view);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
}

document.addEventListener('DOMContentLoaded', init);
