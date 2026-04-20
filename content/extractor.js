// Naukri Clear — Job Clipper Content Script

(function () {
  // Try to extract job data from JSON-LD structured data (most reliable)
  function extractFromJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data['@type'] === 'JobPosting') {
          const salary = data.baseSalary?.value?.value;
          const locations = data.jobLocation?.address?.addressLocality;
          const location = Array.isArray(locations) ? locations.join(', ') : locations;

          return {
            role: data.title || null,
            company: data.hiringOrganization?.name || null,
            location: location || null,
            salaryRange: (salary && salary !== 'Not disclosed') ? salary : null,
            jobDescription: data.description ? stripHtml(data.description).substring(0, 5000) : null,
            jobLink: window.location.href.split('?')[0],
          };
        }
      } catch {
        // invalid JSON, skip
      }
    }
    return null;
  }

  function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  function extractLinkedIn() {
    // LinkedIn doesn't use JSON-LD on logged-in pages, so use DOM selectors

    // Role: find link to /jobs/view/
    const jobTitleLink = document.querySelector('a[href*="/jobs/view/"]');
    const role = jobTitleLink?.textContent?.trim();

    // Job link from the title anchor
    const rawHref = jobTitleLink?.href || '';
    const jobLink = rawHref.split('?')[0] ||
      (() => {
        const jobId = new URLSearchParams(window.location.search).get('currentJobId');
        return jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : window.location.href.split('?')[0];
      })();

    // Company: find link to /company/
    let company = null;
    const companyLinks = document.querySelectorAll('a[href*="/company/"]');
    for (const link of companyLinks) {
      const text = link.textContent?.trim();
      if (text && text.length > 1 && text.length < 100) {
        company = text;
        break;
      }
    }

    // Location: find spans with city/country patterns
    let location = null;
    const allSpans = document.querySelectorAll('span');
    for (const span of allSpans) {
      const text = span.textContent?.trim();
      if (!text || text.length > 100 || text.length < 3) continue;
      if (/India|Remote|Hybrid|United States|USA|UK|Canada|Singapore|Dubai/i.test(text) &&
          /,/.test(text) && !/ago|clicked|apply|people/i.test(text)) {
        location = text;
        break;
      }
      if (/^[A-Z][a-zA-Z\s]+,\s*[A-Z][a-zA-Z\s]+/.test(text) &&
          !/ago|clicked|apply|people|save|share/i.test(text)) {
        location = text;
        break;
      }
    }

    const description =
      document.querySelector('.jobs-description__content')?.innerText?.trim() ??
      document.querySelector('.jobs-description-content__text')?.innerText?.trim() ??
      document.querySelector('article')?.innerText?.trim() ??
      null;

    return {
      company: company || null,
      role: role || null,
      location: location || null,
      salaryRange: null,
      jobDescription: description ? description.substring(0, 5000) : null,
      jobLink,
      source: 'LinkedIn',
    };
  }

  function extractIndeed() {
    const jsonLd = extractFromJsonLd();
    if (jsonLd?.role && jsonLd?.company) {
      jsonLd.source = 'Indeed';
      return jsonLd;
    }

    const role =
      document.querySelector('h1.jobsearch-JobInfoHeader-title')?.textContent?.trim() ??
      document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]')?.textContent?.trim() ??
      document.querySelector('h1')?.textContent?.trim();

    const company =
      document.querySelector('[data-testid="inlineHeader-companyName"] a')?.textContent?.trim() ??
      document.querySelector('[data-testid="inlineHeader-companyName"]')?.textContent?.trim() ??
      document.querySelector('.jobsearch-InlineCompanyRating a')?.textContent?.trim();

    const location =
      document.querySelector('[data-testid="inlineHeader-companyLocation"]')?.textContent?.trim() ??
      document.querySelector('[data-testid="job-location"]')?.textContent?.trim();

    const salary =
      document.querySelector('#salaryInfoAndJobType')?.textContent?.trim() ??
      document.querySelector('[data-testid="attribute_snippet_testid"]')?.textContent?.trim();

    const description =
      document.querySelector('#jobDescriptionText')?.innerText?.trim() ??
      document.querySelector('.jobsearch-jobDescriptionText')?.innerText?.trim();

    return {
      company: company || null,
      role: role || null,
      location: location || null,
      salaryRange: salary || null,
      jobDescription: description ? description.substring(0, 5000) : null,
      jobLink: window.location.href.split('?')[0],
      source: 'Indeed',
    };
  }

  function extractNaukri() {
    // Try JSON-LD first (Naukri embeds JobPosting structured data)
    const jsonLd = extractFromJsonLd();
    if (jsonLd?.role && jsonLd?.company) {
      jsonLd.source = 'Naukri';
      return jsonLd;
    }

    // Fallback to DOM selectors
    const role =
      document.querySelector('h1.styles_jd-header-title__rZwM1')?.textContent?.trim() ??
      document.querySelector('h1.jd-header-title')?.textContent?.trim() ??
      document.querySelector('h1')?.textContent?.trim();

    const company =
      document.querySelector('.styles_jd-header-comp-name__MvqAI a')?.textContent?.trim() ??
      document.querySelector('.jd-header-comp-name a')?.textContent?.trim() ??
      document.querySelector('[data-company-name]')?.textContent?.trim();

    const location =
      document.querySelector('.styles_jhc__loc___Du2H')?.textContent?.trim() ??
      document.querySelector('.loc_a11y')?.textContent?.trim();

    const salary =
      document.querySelector('.styles_jhc__salary__jdfEC')?.textContent?.trim() ??
      document.querySelector('.salary')?.textContent?.trim();

    const description =
      document.querySelector('.styles_JDC__dang-inner-html__h0K4t')?.innerText?.trim() ??
      document.querySelector('.dang-inner-html')?.innerText?.trim() ??
      document.querySelector('.job-desc')?.innerText?.trim();

    return {
      company: company || null,
      role: role || null,
      location: location || null,
      salaryRange: salary || null,
      jobDescription: description ? description.substring(0, 5000) : null,
      jobLink: window.location.href.split('?')[0],
      source: 'Naukri',
    };
  }

  function hasJobPostingJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      try {
        const data = JSON.parse(s.textContent);
        if (data['@type'] === 'JobPosting') return true;
      } catch { /* ignore */ }
    }
    return false;
  }

  function isJobPage() {
    const host = window.location.hostname;
    const path = window.location.pathname;
    const search = window.location.search;

    if (host.includes('linkedin.com')) {
      if (path.includes('/jobs/view/') || path.includes('/jobs/collections/')) return true;
      if (search.includes('currentJobId=')) return true;
    } else if (host.includes('indeed.com')) {
      if (path.includes('/viewjob') || path.includes('/job/')) return true;
      if (search.includes('vjk=') || search.includes('jk=')) return true;
    } else if (host.includes('naukri.com')) {
      if (path.includes('/job-listings-') || path.includes('/jobs/')) return true;
      if (/-jobs-\d+/.test(path)) return true;
    } else {
      return false;
    }

    // Fallback: structured data says it's a job posting
    return hasJobPostingJsonLd();
  }

  function detectAndExtract() {
    if (!isJobPage()) return null;

    const host = window.location.hostname;
    if (host.includes('linkedin.com')) return extractLinkedIn();
    if (host.includes('indeed.com')) return extractIndeed();
    if (host.includes('naukri.com')) return extractNaukri();

    return null;
  }

  function extractWithRetry(retries, delay) {
    return new Promise((resolve) => {
      function attempt(remaining) {
        const data = detectAndExtract();
        // On a non-job page, data is null — don't retry.
        // On a job page with SPA-loaded content, retry until role+company appear or retries exhaust.
        const complete = data && data.role && data.company;
        if (data === null || complete || remaining <= 0) {
          resolve(data);
          return;
        }
        setTimeout(() => attempt(remaining - 1), delay);
      }
      attempt(retries);
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'extract') {
      extractWithRetry(5, 500).then((data) => {
        sendResponse({ success: !!data, data });
      });
      return true;
    }
  });
})();
