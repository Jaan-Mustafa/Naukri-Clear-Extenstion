// ADR-023 Phase 3a — reads Naukri search-results cards already rendered in the
// user's logged-in session and returns them as a normalized array. The data is
// on the page (Naukri's own JS fetched it with the user's session), so we just
// read the DOM — no API keys, no Nkparam, no scraping of anything personal.
(function () {
  function txt(el) {
    return el && el.textContent ? el.textContent.trim() : null;
  }

  // "12-16 Lacs PA" / "1-5 Cr" -> { salaryMin, salaryMax, currency:'INR' }
  function parseSalary(s) {
    if (!s) return {};
    const m = s.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(Lacs?|Lakhs?|Cr)/i);
    if (!m) return {};
    const a = parseFloat(m[1]);
    const b = parseFloat(m[2]);
    const mult = /cr/i.test(m[3]) ? 1e7 : 1e5;
    return { salaryMin: Math.round(a * mult), salaryMax: Math.round(b * mult), currency: 'INR' };
  }

  function pick(card, selectors) {
    for (const sel of selectors) {
      const el = card.querySelector(sel);
      const t = txt(el);
      if (t) return t;
    }
    return null;
  }

  function scanNaukri() {
    // Job cards have changed class names over time, so anchor on the job-link
    // pattern: every result card contains an <a> to a /job-listings- detail page.
    const anchors = Array.from(
      document.querySelectorAll('a.title, a[href*="/job-listings-"]')
    );
    const jobs = [];
    const seen = new Set();

    for (const a of anchors) {
      const href = (a.href || '').split('?')[0];
      if (!href || !/naukri\.com/.test(href) || seen.has(href)) continue;
      // climb to the card container (a few levels up)
      let card = a;
      for (let i = 0; i < 4 && card.parentElement; i++) {
        card = card.parentElement;
        if (card.className && /jobtuple|job-tuple|srp|cust-job/i.test(card.className)) break;
      }

      const title = txt(a) || a.getAttribute('title');
      const company = pick(card, ['a.comp-name', '.comp-name', 'a.subTitle', '.subTitle', '[class*="comp-name"]']);
      const location = pick(card, ['.locWdth', 'span.locWdth', '.loc', '.location', '[class*="loc"]']);
      const experienceRange = pick(card, ['.expwdth', 'span.expwdth', '.exp', '[class*="exp"]']);
      const salaryText = pick(card, ['.sal-wrap span', '.sal', 'span.sal', '[class*="sal"]']);
      const skills =
        Array.from(card.querySelectorAll('.tags-gt .tag-li, ul.tags li, .tag-li, [class*="tag-li"]'))
          .map(txt)
          .filter(Boolean)
          .join(', ') || null;

      if (!title || !company) continue;
      seen.add(href);
      jobs.push({
        title,
        company,
        url: href,
        jobUrlDirect: href,
        location,
        experienceRange,
        skills,
        ...parseSalary(salaryText),
      });
    }
    return jobs;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.action === 'scan-search') {
      try {
        sendResponse({ success: true, jobs: scanNaukri() });
      } catch (e) {
        sendResponse({ success: false, error: String(e) });
      }
    }
    return false;
  });
})();
