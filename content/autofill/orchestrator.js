// Top-level autofill orchestrator. Handles messages from the popup,
// runs scan → match → (optionally) apply, and reports a summary back.

(function () {
  if (window.__nc_autofill_orchestrator_installed) return;
  window.__nc_autofill_orchestrator_installed = true;

  const ATS_PATTERNS = [
    { name: 'workday', match: /workday\.com|myworkdayjobs\.com/i },
    { name: 'greenhouse', match: /greenhouse\.io/i },
    { name: 'lever', match: /lever\.co/i },
    { name: 'icims', match: /icims\.com/i },
    { name: 'smartrecruiters', match: /smartrecruiters\.com/i },
    { name: 'bamboohr', match: /bamboohr\.com/i },
    { name: 'ashby', match: /ashbyhq\.com/i },
    { name: 'jobvite', match: /jobvite\.com/i },
    { name: 'linkedin', match: /linkedin\.com/i },
    { name: 'naukri', match: /naukri\.com/i },
  ];

  function detectAts(url) {
    for (const ats of ATS_PATTERNS) {
      if (ats.match.test(url)) return ats.name;
    }
    return 'generic';
  }

  function labelOf(field) {
    return (
      field.signals.label ||
      field.signals.ariaLabel ||
      field.signals.placeholder ||
      field.signals.name ||
      field.signals.id ||
      'Unnamed field'
    );
  }

  function summarize(fields, matches, unresolved) {
    return {
      ok: true,
      ats: detectAts(location.href),
      totalFields: fields.length,
      matchedCount: matches.length,
      unresolvedCount: unresolved.length,
      // Cap at 10 so the popup doesn't render a wall of text
      unresolvedLabels: unresolved.slice(0, 10).map(labelOf),
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || (msg.action !== 'autofill-scan' && msg.action !== 'autofill-fill')) {
      return false;
    }

    try {
      const fields = window.NC_scanFields();
      const { matches, unresolved } = window.NC_matchFields(fields, window.NC_TAXONOMY);

      if (msg.action === 'autofill-scan') {
        sendResponse(summarize(fields, matches, unresolved));
        return false;
      }

      // autofill-fill
      const profile = msg.profile || {};
      const applyResult = window.NC_applyMatches(matches, profile);
      sendResponse({
        ...summarize(fields, matches, unresolved),
        filled: applyResult.filled,
        filledPaths: applyResult.filledPaths,
        errors: applyResult.errors,
      });
      return false;
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
      return false;
    }
  });
})();
