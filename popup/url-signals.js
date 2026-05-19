// URL-based heuristics for deciding when the Apply tab should activate.
// Loaded before popup.js so both popup.js (tab default) and apply-tab.js
// (permission prompt) can use it.

(function () {
  if (window.NC_isApplyishUrl) return;

  // Hostname subdomain signals — careers.acme.com, jobs.acme.com, etc.
  const APPLY_HOST_PREFIX =
    /^(careers?|jobs?|hiring|recruiting|join|work|talent|apply)\./i;

  // Path signals — /apply, /careers/123, /apply-job, /jobs/positions/...
  // The (?=\/|\?|#|$) lookahead avoids matching /career-advice as "career".
  const APPLY_PATH =
    /\/(apply|application|applyjob|job[-_]?apply|careers?|jobs?|positions?|openings?|vacancies|join[-_]?us|work[-_]?with[-_]?us|hiring)(?=\/|\?|#|$)/i;

  function isApplyishUrl(urlStr) {
    if (!urlStr) return false;
    try {
      const url = new URL(urlStr);
      if (!/^https?:$/.test(url.protocol)) return false;
      if (APPLY_HOST_PREFIX.test(url.hostname)) return true;
      if (APPLY_PATH.test(url.pathname)) return true;
      return false;
    } catch {
      return false;
    }
  }

  function getOriginPattern(urlStr) {
    try {
      const url = new URL(urlStr);
      if (!/^https?:$/.test(url.protocol)) return null;
      return `${url.protocol}//${url.hostname}/*`;
    } catch {
      return null;
    }
  }

  function getHostname(urlStr) {
    try {
      return new URL(urlStr).hostname;
    } catch {
      return null;
    }
  }

  window.NC_isApplyishUrl = isApplyishUrl;
  window.NC_getOriginPattern = getOriginPattern;
  window.NC_getHostname = getHostname;
})();
