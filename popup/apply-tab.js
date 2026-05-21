// Apply tab — autofill orchestration in the popup.
// Communicates with content/autofill/* modules via chrome.tabs.sendMessage.

(function () {
  const PROFILE_CACHE_KEY = 'autofillProfileCache';

  // In-flight backend fetch — used to dedup calls and let handleFillClick
  // await an Apply-tab-open prefetch that's still running.
  let profilePromise = null;

  const STATES = ['loading', 'noform', 'permission', 'ready', 'filled', 'error', 'noprofile'];

  // Tracks the origin pattern most recently shown in the permission prompt
  // so the grant button knows what to request.
  let pendingPermissionOrigin = null;

  function showApplyState(name) {
    for (const s of STATES) {
      const el = document.getElementById(`state-apply-${s}`);
      if (el) el.classList.toggle('hidden', s !== name);
    }
  }

  function hasOriginPermission(origin) {
    return new Promise((resolve) => {
      chrome.permissions.contains({ origins: [origin] }, (granted) => resolve(granted));
    });
  }

  function requestOriginPermission(origin) {
    return new Promise((resolve) => {
      chrome.permissions.request({ origins: [origin] }, (granted) => resolve(granted));
    });
  }

  function getApiToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['apiToken'], (r) => resolve(r.apiToken || null));
    });
  }

  function getCachedView() {
    return new Promise((resolve) => {
      chrome.storage.local.get([PROFILE_CACHE_KEY], (r) =>
        resolve(r[PROFILE_CACHE_KEY] || null),
      );
    });
  }

  function setCachedView(view) {
    return new Promise((resolve) => {
      chrome.storage.local.set(
        { [PROFILE_CACHE_KEY]: { ...view, fetchedAt: Date.now() } },
        () => resolve(),
      );
    });
  }

  function viewIsEmpty(view) {
    return !view || (!view.data && !view.defaultResumeId);
  }

  // Single fetch to /api/autofill/profile. Returns
  //   { data: AutofillProfileData | null, defaultResumeId: number | null }
  // on success, or null on any failure (no token, network error, 401, 404,
  // malformed). The caller treats empty data + empty resume as "no profile".
  async function fetchAutofillView() {
    const apiToken = await getApiToken();
    if (!apiToken) return null;
    let cfg;
    try {
      cfg = await loadConfig();
    } catch {
      return null;
    }
    try {
      const res = await fetch(`${cfg.API_BASE}/api/autofill/profile`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      if (!res.ok) return null;
      const json = await res.json();
      return {
        data: json?.data || null,
        defaultResumeId: json?.defaultResumeId || null,
      };
    } catch (err) {
      console.warn('[Naukri Clear] autofill view fetch failed:', err);
      return null;
    }
  }

  // Kick off (or reuse) a backend fetch. Caches the result on success.
  function prefetchProfile() {
    profilePromise = (async () => {
      const fresh = await fetchAutofillView();
      if (fresh && !viewIsEmpty(fresh)) {
        await setCachedView(fresh);
        return fresh;
      }
      return null;
    })();
    return profilePromise;
  }

  // Resolution order:
  //   1. In-flight prefetch (from initApplyTab)
  //   2. Cached view (offline / previous session)
  //   3. Fresh fetch (cold path, no prefetch happened)
  // Returns null when no profile data AND no default resume are available.
  // Caller routes to the "Set up your autofill profile" state in that case.
  async function getAutofillView() {
    if (profilePromise) {
      const fresh = await profilePromise;
      if (fresh) return fresh;
    }

    const cached = await getCachedView();
    if (cached && !viewIsEmpty(cached)) {
      return { data: cached.data || null, defaultResumeId: cached.defaultResumeId || null };
    }

    const synced = await fetchAutofillView();
    if (synced && !viewIsEmpty(synced)) {
      await setCachedView(synced);
      return synced;
    }

    return null;
  }

  // ---------- Resume bytes (Phase 2 resume upload) ----------

  function arrayBufferToBase64(buffer) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([buffer]);
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const idx = result.indexOf(',');
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(blob);
    });
  }

  // Returns { name, type, base64 } or null. Uses the API-side proxy at
  // /api/resumes/{id}/file rather than the signed R2 URL — that way the
  // request stays on api.naukriclear.com (already in our host_permissions)
  // and we don't hit R2 CORS rejection from the chrome-extension:// origin.
  // base64 is what gets passed through chrome.tabs.sendMessage to the
  // content script (raw binary doesn't survive JSON serialization).
  async function fetchResumePayload(resumeId) {
    if (!resumeId) return null;
    const apiToken = await getApiToken();
    if (!apiToken) return null;
    let cfg;
    try {
      cfg = await loadConfig();
    } catch {
      return null;
    }
    try {
      const res = await fetch(`${cfg.API_BASE}/api/resumes/${resumeId}/file`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      const base64 = await arrayBufferToBase64(buffer);

      // Filename comes from Content-Disposition: inline; filename="resume.pdf"
      const dispo = res.headers.get('content-disposition') || '';
      const match = dispo.match(/filename="?([^";]+)"?/i);
      const name = (match && match[1]) || 'resume.pdf';
      const type = res.headers.get('content-type') || 'application/pdf';

      return { name, type, base64 };
    } catch (err) {
      console.warn('[Naukri Clear] resume bytes fetch failed:', err);
      return null;
    }
  }

  async function openAutofillProfilePage() {
    try {
      const cfg = await loadConfig();
      chrome.tabs.create({ url: `${cfg.APP_BASE}/profile/autofill` });
    } catch (err) {
      console.warn('[Naukri Clear] could not open profile page:', err);
    }
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
        'content/autofill/group-match.js',
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

  async function fillPage(profile, resume) {
    const tab = await getActiveTab();
    if (!tab?.id) return { ok: false, error: 'no-tab' };
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'autofill-fill',
        profile,
        resume,
      });
      return response || { ok: false, error: 'no-response' };
    } catch (err) {
      return { ok: false, error: err.message || 'fill-failed' };
    }
  }

  // ---------- Quick Copy ----------

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildCopyItems(p) {
    const items = [];
    function cat(label) { items.push({ type: 'category', label }); }
    function add(label, value) {
      if (value === null || value === undefined || value === '') return;
      items.push({ label, value: String(value) });
    }

    const fullName = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ').trim();
    if (fullName || p.email || p.phone) {
      cat('Identity');
      if (fullName) add('Full Name', fullName);
      if (p.firstName) add('First Name', p.firstName);
      if (p.middleName) add('Middle Name', p.middleName);
      if (p.lastName) add('Last Name', p.lastName);
      add('Email', p.email);
      add('Phone', p.phone);
      add('Date of Birth', p.dateOfBirth);
      add('Gender', p.gender);
    }

    const cityState = p.address && [p.address.city, p.address.state].filter(Boolean).join(', ');
    const loc = p.currentLocation || cityState;
    if (loc || (p.address && p.address.line1)) {
      cat('Location');
      add('Current Location', loc);
      if (p.address) {
        const parts = [p.address.line1, p.address.city, p.address.state, p.address.postalCode, p.address.country].filter(Boolean);
        if (parts.length) add('Full Address', parts.join(', '));
      }
    }

    if (p.links && (p.links.linkedin || p.links.github || p.links.portfolio)) {
      cat('Links');
      add('LinkedIn', p.links.linkedin);
      add('GitHub', p.links.github);
      add('Portfolio', p.links.portfolio);
    }

    if (p.currentRole && (p.currentRole.company || p.currentRole.title)) {
      cat('Current Role');
      add('Company', p.currentRole.company);
      add('Job Title', p.currentRole.title);
      add('Current CTC', p.currentRole.currentCtc);
    }

    if (p.comp && (p.comp.expectedCtc || p.comp.noticePeriodDays != null)) {
      cat('Compensation');
      add('Expected CTC', p.comp.expectedCtc);
      if (p.comp.noticePeriodDays != null) add('Notice Period', `${p.comp.noticePeriodDays} days`);
    }

    if (p.experience && p.experience.totalYears != null) {
      cat('Experience');
      add('Total Years', `${p.experience.totalYears} years`);
    }

    if (p.workAuth) {
      cat('Work Authorization');
      if (p.workAuth.authorizedToWork != null)
        add('Authorized to Work', p.workAuth.authorizedToWork ? 'Yes' : 'No');
      if (p.workAuth.requiresSponsorship != null)
        add('Requires Sponsorship', p.workAuth.requiresSponsorship ? 'Yes' : 'No');
    }

    if (Array.isArray(p.experiences) && p.experiences.length > 0) {
      cat('Work Experience');
      p.experiences.forEach((exp, i) => {
        const title = [exp.jobTitle, exp.companyName].filter(Boolean).join(' at ');
        const end = exp.currentlyWorking ? 'Present' : exp.dateOfRelieving;
        const period = [exp.dateOfJoining, end].filter(Boolean).join(' → ');
        const parts = [title, period, exp.location].filter(Boolean);
        if (parts.length) add(`Experience ${i + 1}`, parts.join('\n'));
      });
    }

    if (Array.isArray(p.education) && p.education.length > 0) {
      cat('Education');
      p.education.forEach((edu, i) => {
        const degree = [edu.course, edu.branch].filter(Boolean).join(', ');
        const where = edu.university ? `at ${edu.university}` : '';
        const period = [edu.startDate, edu.endDate].filter(Boolean).join(' → ');
        const parts = [degree, where, period, edu.location].filter(Boolean);
        if (parts.length) add(`Education ${i + 1}`, parts.join('\n'));
      });
    }

    return items;
  }

  function copyToClipboard(value, btn) {
    const done = () => {
      const prev = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = prev; btn.classList.remove('copied'); }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(() => {
        execCopy(value);
        done();
      });
    } else {
      execCopy(value);
      done();
    }
  }

  function execCopy(value) {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }

  function renderQuickCopy(profile) {
    const section = document.getElementById('quick-copy-section');
    const list = document.getElementById('quick-copy-list');
    if (!section || !list || !profile) return;

    const items = buildCopyItems(profile);
    if (!items.length) return;

    list.innerHTML = '';
    for (const item of items) {
      if (item.type === 'category') {
        const div = document.createElement('div');
        div.className = 'copy-category';
        div.textContent = item.label;
        list.appendChild(div);
      } else {
        const wrapper = document.createElement('div');
        wrapper.className = 'copy-item';
        wrapper.innerHTML = `
          <div class="copy-meta">
            <span class="copy-label">${escHtml(item.label)}</span>
            <button class="copy-btn" type="button">Copy</button>
          </div>
          <div class="copy-value">${escHtml(item.value)}</div>
        `;
        const btn = wrapper.querySelector('.copy-btn');
        btn.addEventListener('click', () => copyToClipboard(item.value, btn));
        list.appendChild(wrapper);
      }
    }

    section.classList.remove('hidden');
  }

  function formatAtsName(ats) {
    if (!ats || ats === 'generic') return 'Generic form';
    return ats.charAt(0).toUpperCase() + ats.slice(1);
  }

  function showPermissionPrompt(hostname, origin) {
    pendingPermissionOrigin = origin;
    const hostEl = document.getElementById('apply-perm-host');
    if (hostEl) hostEl.textContent = hostname || 'this site';
    showApplyState('permission');
  }

  function showNoForm(hostname) {
    const hostEl = document.getElementById('apply-force-host');
    if (hostEl) hostEl.textContent = hostname || 'this site';
    // Stash the origin pattern on the button for the force-enable handler.
    const forceBtn = document.getElementById('apply-force-enable');
    if (forceBtn) forceBtn.dataset.origin = pendingPermissionOrigin || '';
    showApplyState('noform');
  }

  async function initApplyTab() {
    showApplyState('loading');

    // Kick off backend profile fetch in parallel with scanning. Resolves
    // by the time the user clicks Fill on a typical form (~hundreds of ms).
    // Also populates Quick Copy as soon as profile data lands — fall back
    // to cached data when the backend is unreachable so the user can still
    // copy answers offline.
    prefetchProfile().then(async (view) => {
      if (view?.data) {
        renderQuickCopy(view.data);
        return;
      }
      const cached = await getCachedView();
      if (cached?.data) renderQuickCopy(cached.data);
    });

    const tab = await getActiveTab();
    if (!tab?.id || !isInjectableUrl(tab.url)) {
      pendingPermissionOrigin = null;
      showNoForm(null);
      return;
    }

    const origin =
      (typeof window.NC_getOriginPattern === 'function' && window.NC_getOriginPattern(tab.url)) ||
      null;
    const hostname =
      (typeof window.NC_getHostname === 'function' && window.NC_getHostname(tab.url)) ||
      null;
    pendingPermissionOrigin = origin;

    if (origin) {
      const granted = await hasOriginPermission(origin);
      if (!granted) {
        // Page looks like an application form? Surface the permission ask.
        // Otherwise stay quiet — the user gets a "force enable" link on noform.
        const applyish =
          typeof window.NC_isApplyishUrl === 'function' && window.NC_isApplyishUrl(tab.url);
        if (applyish) {
          showPermissionPrompt(hostname, origin);
        } else {
          showNoForm(hostname);
        }
        return;
      }
    }

    const result = await scanPage();

    if (!result.ok) {
      if (result.error === 'unsupported-page') {
        showNoForm(hostname);
        return;
      }
      document.getElementById('apply-error-message').textContent =
        `Couldn't scan the page (${result.error}).`;
      showApplyState('error');
      return;
    }

    if (result.totalFields === 0) {
      showNoForm(hostname);
      return;
    }

    document.getElementById('apply-ats-badge').textContent = formatAtsName(result.ats);
    document.getElementById('apply-total-count').textContent = result.totalFields;
    document.getElementById('apply-matched-count').textContent = result.matchedCount;

    showApplyState('ready');
  }

  async function handleGrantClick() {
    if (!pendingPermissionOrigin) {
      initApplyTab();
      return;
    }
    const btn = document.getElementById('apply-grant-btn');
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Waiting for grant...';
    const granted = await requestOriginPermission(pendingPermissionOrigin);
    btn.disabled = false;
    btn.textContent = original;
    if (granted) {
      // Permission lands — re-run init from scratch; this will now inject + scan.
      initApplyTab();
    }
    // If denied we just stay on the permission prompt; user can hit "Not now"
    // to drop back to noform.
  }

  async function handleForceEnableClick() {
    const tab = await getActiveTab();
    if (!tab?.url) return;
    const origin =
      (typeof window.NC_getOriginPattern === 'function' && window.NC_getOriginPattern(tab.url)) ||
      null;
    const hostname =
      (typeof window.NC_getHostname === 'function' && window.NC_getHostname(tab.url)) ||
      null;
    if (!origin) return;
    showPermissionPrompt(hostname, origin);
  }

  async function handleFillClick() {
    const btn = document.getElementById('apply-fill-btn');
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Filling...';

    const view = await getAutofillView();
    if (!view) {
      btn.disabled = false;
      btn.textContent = original;
      showApplyState('noprofile');
      return;
    }

    // Resume fetch happens in parallel with… nothing else in handleFillClick,
    // so just await it inline. Typical PDFs are 50KB-2MB so this is fast.
    btn.textContent = view.defaultResumeId ? 'Fetching resume...' : 'Filling...';
    const resume = view.defaultResumeId
      ? await fetchResumePayload(view.defaultResumeId)
      : null;

    btn.textContent = 'Filling...';
    const result = await fillPage(view.data || {}, resume);

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
    const resumeNote = result.resumeUploaded
      ? ` Resume uploaded${result.resumeTarget ? ` to "${result.resumeTarget}"` : ''}.`
      : '';
    document.getElementById('apply-unresolved-text').textContent = unresolvedCount
      ? `${unresolvedCount} field${unresolvedCount === 1 ? '' : 's'} still need your input — review and submit.${resumeNote}`
      : `All matched fields filled. Review the form and submit.${resumeNote}`;

    showApplyState('filled');
  }

  // Wire DOM events once at load
  document.getElementById('apply-fill-btn')?.addEventListener('click', handleFillClick);
  document.getElementById('apply-rescan-noform')?.addEventListener('click', initApplyTab);
  document.getElementById('apply-rescan-ready')?.addEventListener('click', initApplyTab);
  document.getElementById('apply-refill-btn')?.addEventListener('click', initApplyTab);
  document.getElementById('apply-retry-btn')?.addEventListener('click', initApplyTab);
  document.getElementById('apply-grant-btn')?.addEventListener('click', handleGrantClick);
  document.getElementById('apply-skip-perm')?.addEventListener('click', () => {
    // User declined the soft prompt — drop back to noform so they can still
    // force-enable later if they change their mind.
    const hostEl = document.getElementById('apply-perm-host');
    showNoForm(hostEl?.textContent || null);
  });
  document.getElementById('apply-force-enable')?.addEventListener('click', handleForceEnableClick);
  document.getElementById('apply-open-profile')?.addEventListener('click', openAutofillProfilePage);
  document.getElementById('apply-noprofile-rescan')?.addEventListener('click', initApplyTab);

  // Quick Copy toggle — expand/collapse the snippet list
  document.getElementById('quick-copy-toggle')?.addEventListener('click', () => {
    const toggle = document.getElementById('quick-copy-toggle');
    const list = document.getElementById('quick-copy-list');
    if (!toggle || !list) return;
    const isOpen = !list.classList.contains('hidden');
    list.classList.toggle('hidden', isOpen);
    toggle.setAttribute('aria-expanded', String(!isOpen));
  });

  // If permission lands via Chrome's settings UI (or any other path), reinit.
  if (chrome.permissions?.onAdded) {
    chrome.permissions.onAdded.addListener(() => {
      // Only reinit if the user is currently looking at the Apply tab.
      const panel = document.getElementById('apply-panel');
      if (panel && !panel.classList.contains('hidden')) {
        initApplyTab();
      }
    });
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
