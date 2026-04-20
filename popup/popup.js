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
};

let extractedData = null;
let apiToken = null;

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
  showState('loading');
  await applyConfig();

  apiToken = await getToken();

  if (!apiToken) {
    showState('login');
    return;
  }

  const auth = await checkAuth();
  if (!auth.ok) {
    apiToken = null;
    await clearToken();
    showLoginError(`Could not verify token. ${auth.reason}`);
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
