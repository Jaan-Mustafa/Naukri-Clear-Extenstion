// Apply tab — autofill orchestration in the popup.
// Communicates with content/autofill/* modules via chrome.tabs.sendMessage.

(function () {
  const PROFILE_KEY = 'autofillProfile';
  const LOG_TOGGLE_KEY = 'autofillLogOnSubmit';

  // Mock profile — used when no profile is stored yet. Lets users test the
  // Fill flow before the backend profile API and web-app editor land.
  const MOCK_PROFILE = {
    firstName: 'Rizabul',
    lastName: 'Md',
    email: 'rizabul.md@example.com',
    phone: '+919876543210',
    address: {
      line1: '123 MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
      country: 'India',
    },
    links: {
      linkedin: 'https://www.linkedin.com/in/rizabul-md',
      github: 'https://github.com/rizabul-md',
      portfolio: 'https://rizabul.dev',
    },
    currentRole: {
      company: 'Acme Corp',
      title: 'Software Engineer',
      currentCtc: '20 LPA',
    },
    comp: {
      expectedCtc: '30 LPA',
      noticePeriodDays: 60,
    },
    experience: {
      totalYears: 4,
    },
    workAuth: {
      authorizedToWork: true,
      requiresSponsorship: false,
    },
  };

  const STATES = ['loading', 'noform', 'ready', 'filled', 'error'];

  function showApplyState(name) {
    for (const s of STATES) {
      const el = document.getElementById(`state-apply-${s}`);
      if (el) el.classList.toggle('hidden', s !== name);
    }
  }

  function getProfile() {
    return new Promise((resolve) => {
      chrome.storage.local.get([PROFILE_KEY], (r) => {
        const p = r[PROFILE_KEY];
        if (p) return resolve(p);
        chrome.storage.local.set({ [PROFILE_KEY]: MOCK_PROFILE }, () =>
          resolve(MOCK_PROFILE)
        );
      });
    });
  }

  function getLogOnSubmitPref() {
    return new Promise((resolve) => {
      chrome.storage.local.get([LOG_TOGGLE_KEY], (r) => {
        resolve(r[LOG_TOGGLE_KEY] !== false); // default ON
      });
    });
  }

  function setLogOnSubmitPref(v) {
    chrome.storage.local.set({ [LOG_TOGGLE_KEY]: v });
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  }

  function isInjectableUrl(url) {
    if (!url) return false;
    return /^https?:/i.test(url);
  }

  async function injectScripts(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        'content/autofill/profile-taxonomy.js',
        'content/autofill/scan-form.js',
        'content/autofill/semantic-match.js',
        'content/autofill/apply-values.js',
        'content/autofill/orchestrator.js',
      ],
    });
  }

  async function scanPage() {
    const tab = await getActiveTab();
    if (!tab?.id || !isInjectableUrl(tab.url)) {
      return { ok: false, error: 'unsupported-page' };
    }
    try {
      await injectScripts(tab.id);
    } catch (err) {
      return { ok: false, error: err.message || 'injection-failed' };
    }
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'autofill-scan',
      });
      return response || { ok: false, error: 'no-response' };
    } catch (err) {
      return { ok: false, error: err.message || 'no-response' };
    }
  }

  async function fillPage(profile) {
    const tab = await getActiveTab();
    if (!tab?.id) return { ok: false, error: 'no-tab' };
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'autofill-fill',
        profile,
      });
      return response || { ok: false, error: 'no-response' };
    } catch (err) {
      return { ok: false, error: err.message || 'fill-failed' };
    }
  }

  function formatAtsName(ats) {
    if (!ats || ats === 'generic') return 'Generic form';
    return ats.charAt(0).toUpperCase() + ats.slice(1);
  }

  function renderUnresolved(listEl, wrapEl, labels) {
    listEl.innerHTML = '';
    if (!labels || !labels.length) {
      wrapEl.classList.add('hidden');
      return;
    }
    for (const lbl of labels) {
      const li = document.createElement('li');
      li.textContent = lbl;
      listEl.appendChild(li);
    }
    wrapEl.classList.remove('hidden');
  }

  async function initApplyTab() {
    showApplyState('loading');

    const result = await scanPage();

    if (!result.ok) {
      if (result.error === 'unsupported-page') {
        showApplyState('noform');
        return;
      }
      document.getElementById('apply-error-message').textContent =
        `Couldn't scan the page (${result.error}).`;
      showApplyState('error');
      return;
    }

    if (result.totalFields === 0) {
      showApplyState('noform');
      return;
    }

    document.getElementById('apply-ats-badge').textContent = formatAtsName(result.ats);
    document.getElementById('apply-total-count').textContent = result.totalFields;
    document.getElementById('apply-matched-count').textContent = result.matchedCount;

    renderUnresolved(
      document.getElementById('apply-unresolved-list'),
      document.getElementById('apply-unresolved'),
      result.unresolvedLabels
    );

    showApplyState('ready');
  }

  async function handleFillClick() {
    const btn = document.getElementById('apply-fill-btn');
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Filling...';

    const profile = await getProfile();
    const result = await fillPage(profile);

    btn.disabled = false;
    btn.textContent = original;

    if (!result.ok) {
      document.getElementById('apply-error-message').textContent =
        `Couldn't fill the form (${result.error}).`;
      showApplyState('error');
      return;
    }

    document.getElementById('apply-filled-count').textContent = result.filled || 0;

    const unresolvedCount = result.unresolvedCount || 0;
    document.getElementById('apply-unresolved-text').textContent = unresolvedCount
      ? `${unresolvedCount} field${unresolvedCount === 1 ? '' : 's'} still need your input — review and submit.`
      : 'All matched fields filled. Review the form and submit.';

    renderUnresolved(
      document.getElementById('apply-still-unresolved-list'),
      document.getElementById('apply-still-unresolved'),
      result.unresolvedLabels
    );

    showApplyState('filled');
  }

  // Wire DOM events once at load
  document.getElementById('apply-fill-btn')?.addEventListener('click', handleFillClick);
  document.getElementById('apply-rescan-noform')?.addEventListener('click', initApplyTab);
  document.getElementById('apply-rescan-ready')?.addEventListener('click', initApplyTab);
  document.getElementById('apply-refill-btn')?.addEventListener('click', initApplyTab);
  document.getElementById('apply-retry-btn')?.addEventListener('click', initApplyTab);

  const logToggle = document.getElementById('apply-log-toggle');
  if (logToggle) {
    getLogOnSubmitPref().then((v) => {
      logToggle.checked = v;
    });
    logToggle.addEventListener('change', () => setLogOnSubmitPref(logToggle.checked));
  }

  // popup.js will call this whenever the Apply tab becomes active.
  window.NC_onApplyTabShown = initApplyTab;

  // Handle the bootstrap race: popup.js may have already picked Apply as the
  // default tab before this script defined NC_onApplyTabShown. If the Apply
  // panel is visible at load time, kick off the scan ourselves.
  const applyPanel = document.getElementById('apply-panel');
  if (applyPanel && !applyPanel.classList.contains('hidden')) {
    initApplyTab();
  }
})();
