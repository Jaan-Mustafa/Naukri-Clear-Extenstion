// Top-level autofill orchestrator. Handles messages from the popup,
// runs scan → match → (optionally) apply, and reports a summary back.

(function () {
  // The orchestrator's listener is sticky — we can't unregister an old
  // chrome.runtime.onMessage handler from a previous injection. Versioning
  // it means the latest listener checks the version and old listeners no-op.
  const VERSION = 3;
  if (window.__nc_autofill_orchestrator_version === VERSION) return;
  window.__nc_autofill_orchestrator_version = VERSION;

  const ATS_PATTERNS = [
    { name: 'workday', match: /workday\.com|myworkdayjobs\.com/i },
    { name: 'greenhouse', match: /greenhouse\.io/i },
    { name: 'lever', match: /lever\.co/i },
    { name: 'icims', match: /icims\.com/i },
    { name: 'smartrecruiters', match: /smartrecruiters\.com/i },
    { name: 'bamboohr', match: /bamboohr\.com/i },
    { name: 'ashby', match: /ashbyhq\.com/i },
    { name: 'jobvite', match: /jobvite\.com/i },
    { name: 'keka', match: /keka\.com|kekahire\.com/i },
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

      // File inputs (resume upload) are handled separately because they
      // need a real File object, not a profile field value.
      let resumeResult = { uploaded: 0, target: null };
      if (msg.resume && typeof window.NC_applyResume === 'function') {
        resumeResult = window.NC_applyResume(fields, msg.resume);
      }

      // Don't surface file inputs in the unresolved list — they're handled
      // by the resume pass, not the text-field matcher, so leaving them in
      // gives the false impression the user still needs to upload manually.
      const resolvedUnresolved = unresolved.filter((f) => {
        const el = f.element;
        if (!(el instanceof HTMLInputElement) || el.type !== 'file') return true;
        if (typeof window.NC_isResumeInput === 'function' && window.NC_isResumeInput(f)) {
          // Resume-like file input: hide it only if we successfully uploaded
          return resumeResult.uploaded === 0;
        }
        return true;
      });

      sendResponse({
        ...summarize(fields, matches, resolvedUnresolved),
        filled: applyResult.filled,
        filledPaths: applyResult.filledPaths,
        errors: applyResult.errors,
        resumeUploaded: resumeResult.uploaded,
        resumeTarget: resumeResult.target,
      });
      return false;
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
      return false;
    }
  });
})();
