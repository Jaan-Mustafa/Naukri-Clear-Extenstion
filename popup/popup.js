// Naukri Clear — Job Clipper Popup

let API_BASE = '';
let APP_BASE = '';

const states = {
  loading: document.getElementById('state-loading'),
  login: document.getElementById('state-login'),
  unsupported: document.getElementById('state-unsupported'),
  form: document.getElementById('state-form'),
  duplicate: document.getElementById('state-duplicate'),
  saved: document.getElementById('state-saved'),
  error: document.getElementById('state-error'),
  discover: document.getElementById('state-discover'),
};

let extractedData = null;
let apiToken = null;
let activeTab = 'track';

// Hosts that signal we're on a job application form → default to Apply tab.
// Listing/clipper hosts default to Track. Other pages fall back to last-used.
const APPLY_HOSTS = [
  'myworkdayjobs.com',
  'workday.com',
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'jobs.lever.co',
  'icims.com',
  'smartrecruiters.com',
  'bamboohr.com',
  'ashbyhq.com',
  'jobvite.com',
  'keka.com',
  'kekahire.com',
];
const TRACK_HOSTS = [
  'linkedin.com',
  'naukri.com',
  'indeed.com',
  'glassdoor.com',
];

function detectTabFromUrl(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (APPLY_HOSTS.some((h) => host.includes(h))) return 'apply';
    if (TRACK_HOSTS.some((h) => host.includes(h))) return 'track';
  } catch {
    // fall through
  }
  // Fall back to URL-signal detection — covers careers.* / */apply / */careers
  // on non-curated hosts so the Apply tab surfaces with a permission prompt.
  if (typeof window.NC_isApplyishUrl === 'function' && window.NC_isApplyishUrl(url)) {
    return 'apply';
  }
  return null;
}

function getLastTab() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['activeTab'], (r) => resolve(r.activeTab || null));
  });
}

function setLastTab(tab) {
  chrome.storage.local.set({ activeTab: tab });
}

function showTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.getElementById('track-panel').classList.toggle('hidden', tab !== 'track');
  document.getElementById('apply-panel').classList.toggle('hidden', tab !== 'apply');
  setLastTab(tab);

  // Lazy-init the Apply tab the first time (and every time) it's shown so a
  // fresh scan reflects the current page.
  if (tab === 'apply' && typeof window.NC_onApplyTabShown === 'function') {
    window.NC_onApplyTabShown();
  }
}

async function pickDefaultTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const detected = detectTabFromUrl(tab?.url);
  if (detected) return detected;
  const remembered = await getLastTab();
  return remembered || 'track';
}

function showState(name) {
  Object.values(states).forEach((el) => el.classList.add('hidden'));
  states[name].classList.remove('hidden');
}

async function getToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiToken'], (result) => {
      resolve(result.apiToken || null);
    });
  });
}

function storeToken(token) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ apiToken: token }, resolve);
  });
}

function clearToken() {
  return new Promise((resolve) => {
    chrome.storage.local.remove('apiToken', resolve);
  });
}

// Clear everything tied to the connected account: the token itself, the
// cached autofill profile, and any per-job clip drafts. UI preferences
// (active tab, log-on-submit) are left alone.
function clearAccountData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (all) => {
      const keysToRemove = ['apiToken', 'autofillProfileCache'];
      for (const k of Object.keys(all)) {
        if (k.startsWith('draft:')) keysToRemove.push(k);
      }
      chrome.storage.local.remove(keysToRemove, () => resolve());
    });
  });
}

function showConnectedAccount(user) {
  const wrap = document.getElementById('account-info');
  const email = document.getElementById('account-email');
  if (!wrap || !email) return;
  const label = user?.email || user?.name || 'Connected';
  email.textContent = label;
  email.title = label;
  wrap.classList.remove('hidden');
}

function hideConnectedAccount() {
  document.getElementById('account-info')?.classList.add('hidden');
}

function authHeaders() {
  return apiToken ? { Authorization: `Bearer ${apiToken}` } : {};
}

async function checkAuth() {
  if (!apiToken) return { ok: false, reason: 'no-token' };
  try {
    const res = await fetch(`${API_BASE}/api/me`, {
      headers: authHeaders(),
    });
    if (res.ok) {
      const user = await res.json();
      return { ok: true, user };
    }
    return { ok: false, reason: `Server returned ${res.status}` };
  } catch (err) {
    return { ok: false, reason: `Network error: ${err.message}` };
  }
}

async function checkDuplicate(jobLink) {
  if (!jobLink) return null;
  try {
    const res = await fetch(
      `${API_BASE}/api/applications/check-link?jobLink=${encodeURIComponent(jobLink)}`,
      { headers: authHeaders() }
    );
    if (res.ok) {
      const data = await res.json();
      return data.exists ? data : null;
    }
    return null;
  } catch {
    return null;
  }
}

async function saveApplication(payload) {
  const res = await fetch(`${API_BASE}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  return res.json();
}

const FORM_FIELD_IDS = ['company', 'role', 'location', 'salaryRange', 'source', 'stage', 'notes'];

function draftKey(jobLink) {
  return `draft:${jobLink || 'no-link'}`;
}

function loadDraft(jobLink) {
  return new Promise((resolve) => {
    const key = draftKey(jobLink);
    chrome.storage.local.get([key], (result) => resolve(result[key] || null));
  });
}

function saveDraft(jobLink, values) {
  chrome.storage.local.set({ [draftKey(jobLink)]: values });
}

function clearDraft(jobLink) {
  chrome.storage.local.remove(draftKey(jobLink));
}

function readFormValues() {
  const values = {};
  for (const id of FORM_FIELD_IDS) {
    values[id] = document.getElementById(id).value;
  }
  return values;
}

function fillForm(data, draft) {
  const values = { ...data, ...(draft || {}) };
  document.getElementById('company').value = values.company || '';
  document.getElementById('role').value = values.role || '';
  document.getElementById('location').value = values.location || '';
  document.getElementById('salaryRange').value = values.salaryRange || '';
  document.getElementById('source').value = values.source || data.source || '';
  if (values.stage) document.getElementById('stage').value = values.stage;
  if (values.notes !== undefined) document.getElementById('notes').value = values.notes;
  extractedData = data;
}

function wireDraftAutoSave() {
  const handler = () => {
    if (!extractedData) return;
    saveDraft(extractedData.jobLink, readFormValues());
  };
  for (const id of FORM_FIELD_IDS) {
    const el = document.getElementById(id);
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  }
}

async function extractFromPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;

  // Programmatically inject the content script to ensure it's loaded
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/extractor.js'],
    });
  } catch {
    // May fail if already injected or no permission — that's ok
  }

  // Small delay to let the script initialize
  await new Promise((r) => setTimeout(r, 300));

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });
    return response?.success ? response.data : null;
  } catch {
    return null;
  }
}

async function applyConfig() {
  const cfg = await loadConfig();
  API_BASE = cfg.API_BASE;
  APP_BASE = cfg.APP_BASE;
  const settingsLink = document.getElementById('settings-link');
  if (settingsLink) settingsLink.href = `${APP_BASE}/settings`;
  const savedLink = document.getElementById('saved-link');
  if (savedLink) savedLink.href = `${APP_BASE}/applications`;
}

async function init() {
  const defaultTab = await pickDefaultTab();
  showTab(defaultTab);

  showState('loading');
  await applyConfig();

  apiToken = await getToken();

  if (!apiToken) {
    hideConnectedAccount();
    showState('login');
    return;
  }

  const auth = await checkAuth();
  if (!auth.ok) {
    apiToken = null;
    await clearToken();
    hideConnectedAccount();
    showLoginError(`Could not verify token. ${auth.reason}`);
    return;
  }

  showConnectedAccount(auth.user);

  // Naukri search-results page → offer a bulk "scan into Discover" instead of
  // the single-job clip form.
  const [activeTabInfo] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (isNaukriSearchPage(activeTabInfo?.url)) {
    setupDiscoverScan();
    showState('discover');
    return;
  }

  const extracted = await extractFromPage();
  const data = extracted || (await emptyFormData());

  if (data.jobLink) {
    const duplicate = await checkDuplicate(data.jobLink);
    if (duplicate) {
      document.getElementById('duplicate-link').href = `${APP_BASE}/applications`;
      showState('duplicate');
      return;
    }
  }

  const draft = await loadDraft(data.jobLink);
  fillForm(data, draft);
  showState('form');
}

// A Naukri results/listing page (many jobs) — NOT a single job-detail page.
function isNaukriSearchPage(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (!u.hostname.toLowerCase().includes('naukri.com')) return false;
    if (u.pathname.includes('/job-listings-')) return false; // single job detail
    return /-jobs(-in-[a-z-]+)?\b/i.test(u.pathname) || u.pathname.includes('/jobs-in-');
  } catch {
    return false;
  }
}

let discoverScanWired = false;
function setupDiscoverScan() {
  const link = document.getElementById('discover-link');
  if (link) link.href = `${APP_BASE}/discover`;
  if (discoverScanWired) return;
  discoverScanWired = true;
  document.getElementById('discover-scan-btn').addEventListener('click', runDiscoverScan);
}

async function runDiscoverScan() {
  const btn = document.getElementById('discover-scan-btn');
  const status = document.getElementById('discover-status');
  const link = document.getElementById('discover-link');
  btn.disabled = true;
  btn.textContent = 'Scanning…';
  status.classList.remove('hidden');
  status.textContent = 'Reading jobs on this page…';
  link.classList.add('hidden');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');

    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/search-scanner.js'] });
    } catch {
      // already injected / activeTab grant — fine
    }
    await new Promise((r) => setTimeout(r, 300));

    const resp = await chrome.tabs.sendMessage(tab.id, { action: 'scan-search' });
    const jobs = resp?.success ? resp.jobs : [];
    if (!jobs.length) {
      status.textContent = 'No job cards found on this page. Scroll through the results, then try again.';
      btn.disabled = false;
      btn.textContent = 'Scan this page';
      return;
    }

    status.textContent = `Sending ${jobs.length} jobs to Naukri Clear…`;
    const res = await fetch(`${API_BASE}/api/discover/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ source: 'naukri', jobs }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();

    status.textContent = result.added > 0
      ? `Added ${result.added} new ${result.added === 1 ? 'job' : 'jobs'} (${result.duplicates} already saved).`
      : `No new jobs — all ${result.received} were already in your feed.`;
    link.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Scan again';
  } catch (err) {
    status.textContent = `Scan failed: ${err.message}`;
    btn.disabled = false;
    btn.textContent = 'Scan this page';
  }
}

async function emptyFormData() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';
  const jobLink = /^https?:\/\//.test(url) ? url.split('?')[0] : null;
  return {
    company: null,
    role: null,
    location: null,
    salaryRange: null,
    source: null,
    jobDescription: null,
    jobLink,
  };
}

function showLoginError(msg) {
  showState('login');
  const errorEl = document.getElementById('token-error');
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

// Token save handler
document.getElementById('save-token-btn').addEventListener('click', async () => {
  const input = document.getElementById('token-input');
  const btn = document.getElementById('save-token-btn');
  const token = input.value.trim();
  const errorEl = document.getElementById('token-error');

  if (!token) {
    errorEl.textContent = 'Paste your token from Settings.';
    errorEl.classList.remove('hidden');
    return;
  }

  if (!token.startsWith('nc_')) {
    errorEl.textContent = 'Invalid token. It should start with nc_';
    errorEl.classList.remove('hidden');
    return;
  }

  // Show loading state
  errorEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Connecting...';

  // Save and verify
  apiToken = token;
  await storeToken(token);

  const auth = await checkAuth();

  if (auth.ok) {
    showConnectedAccount(auth.user);
    const [activeTabInfo] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (isNaukriSearchPage(activeTabInfo?.url)) {
      setupDiscoverScan();
      showState('discover');
      return;
    }
    // Token works — continue to extraction, fall back to blank form if it fails
    const extracted = await extractFromPage();
    const data = extracted || (await emptyFormData());
    const duplicate = data.jobLink ? await checkDuplicate(data.jobLink) : null;
    if (duplicate) {
      document.getElementById('duplicate-link').href = `${APP_BASE}/applications`;
      showState('duplicate');
    } else {
      const draft = await loadDraft(data.jobLink);
      fillForm(data, draft);
      showState('form');
    }
  } else {
    // Token failed
    apiToken = null;
    await clearToken();
    btn.disabled = false;
    btn.textContent = 'Connect';
    errorEl.textContent = `Token verification failed. ${auth.reason}`;
    errorEl.classList.remove('hidden');
    input.value = '';
  }
});

// Form submit handler
document.getElementById('clip-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const saveBtn = document.getElementById('save-btn');
  const errorEl = document.getElementById('form-error');

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  errorEl.classList.add('hidden');

  const payload = {
    company: document.getElementById('company').value.trim(),
    role: document.getElementById('role').value.trim(),
    location: document.getElementById('location').value.trim() || null,
    salaryRange: document.getElementById('salaryRange').value.trim() || null,
    source: document.getElementById('source').value.trim() || null,
    stage: document.getElementById('stage').value,
    notes: document.getElementById('notes').value.trim() || null,
    jobLink: extractedData?.jobLink || null,
    jobDescription: extractedData?.jobDescription || null,
  };

  try {
    await saveApplication(payload);
    clearDraft(extractedData?.jobLink);
    showState('saved');
  } catch (err) {
    console.error('Save failed', err, 'payload:', payload);
    errorEl.textContent = `Failed to save: ${err.message || 'unknown error'}`;
    errorEl.classList.remove('hidden');
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save to Tracker';
  }
});

document.getElementById('retry-btn')?.addEventListener('click', () => init());

document.getElementById('disconnect-btn')?.addEventListener('click', async () => {
  const ok = window.confirm(
    "Disconnect this account? You'll need to paste your token again to reconnect."
  );
  if (!ok) return;
  apiToken = null;
  await clearAccountData();
  hideConnectedAccount();
  // Drop back to Track so the user sees the login screen immediately, even
  // if the side panel was previously on the Apply tab.
  showTab('track');
  init();
});

// Tab switching — manual override keeps that choice until next init().
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

wireDraftAutoSave();
init();

// Side panel stays open across tab switches — re-run extraction when the active tab
// changes or the active tab finishes loading a new URL.
chrome.tabs.onActivated.addListener(() => init());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id === tabId) init();
  });
});
