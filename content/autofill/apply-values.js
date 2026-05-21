// Apply matched profile values to their fields with React/Vue-safe events.

// Bump NC_AUTOFILL_VERSION when this file (or any of its peers) changes its
// public API surface (e.g. adding window.NC_applyResume for Phase 2). The
// orchestrator/installer compares against the previous value and forces a
// fresh install when they differ, so we don't ship broken state to tabs
// that were injected by an older build.
(function () {
  const VERSION = 4;
  if (window.NC_applyMatches && window.NC_AUTOFILL_VERSION === VERSION) return;
  window.NC_AUTOFILL_VERSION = VERSION;

  function setNativeInputValue(input, value) {
    // React's synthetic event system tracks the previous value on the DOM node
    // itself. To trigger onChange we have to call the native setter, then
    // dispatch a synthetic input + change event.
    const proto =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setSelectValue(select, value) {
    select.value = value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setCheckbox(input, value) {
    const target = Boolean(value);
    if (input.checked !== target) {
      input.click();
    }
  }

  function getProfileValue(profile, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), profile);
  }

  // ---------- Date format adapter ----------
  // Profile stores dates as either "YYYY-MM" (from type=month picker) or
  // "YYYY-MM-DD" (from type=date). Forms accept many formats; we reshape
  // to match the field's placeholder when we can recognize the pattern.
  const MONTHS_LONG = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  function formatDateForField(rawValue, field) {
    if (typeof rawValue !== 'string') return String(rawValue);
    const placeholder = (field.signals && field.signals.placeholder) || '';

    // "YYYY-MM" — our type=month picker output
    let m = rawValue.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      const year = m[1];
      const monthIdx = parseInt(m[2], 10) - 1;
      const monthName = MONTHS_LONG[monthIdx] || m[2];
      // "16 June 2014" / "1 June 2014" — day-first long
      if (/^\d{1,2}\s+[a-z]+\s+\d{4}/i.test(placeholder)) return `1 ${monthName} ${year}`;
      // "June 2014" — month-year
      if (/^[a-z]+\s+\d{4}$/i.test(placeholder)) return `${monthName} ${year}`;
      // "06/2014" or "MM/YYYY"
      if (/^(\d{1,2}\/\d{4}|MM\/YYYY)$/i.test(placeholder)) return `${m[2]}/${year}`;
      // "2014-06" — keep as-is
      return rawValue;
    }

    // "YYYY-MM-DD" — our type=date picker output
    m = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const year = m[1];
      const monthIdx = parseInt(m[2], 10) - 1;
      const monthName = MONTHS_LONG[monthIdx] || m[2];
      const day = parseInt(m[3], 10);
      // "16 June 2014"
      if (/^\d{1,2}\s+[a-z]+\s+\d{4}/i.test(placeholder)) return `${day} ${monthName} ${year}`;
      // "June 16, 2014" — US style
      if (/^[a-z]+\s+\d{1,2},?\s+\d{4}/i.test(placeholder)) return `${monthName} ${day}, ${year}`;
      // "06/16/2014" — US slash
      if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(placeholder) || /^MM\/DD\/YYYY/i.test(placeholder)) {
        return `${m[2]}/${m[3]}/${year}`;
      }
      // "16/06/2014" — UK / IN slash
      if (/^DD\/MM\/YYYY/i.test(placeholder)) return `${m[3]}/${m[2]}/${year}`;
      // ISO — keep
      return rawValue;
    }

    return rawValue;
  }

  function matchSelectOption(select, value) {
    const target = String(value).trim().toLowerCase();
    const opts = Array.from(select.options);
    // 1. exact value match
    let found = opts.find((o) => o.value.toLowerCase() === target);
    if (found) return found;
    // 2. exact label match
    found = opts.find((o) => o.textContent.trim().toLowerCase() === target);
    if (found) return found;
    // 3. label contains target (e.g. "India (IN)" matches "India")
    found = opts.find((o) => o.textContent.trim().toLowerCase().includes(target));
    if (found) return found;
    // 4. yes/no fallback for boolean fields
    if (target === 'true' || target === 'yes') {
      found = opts.find((o) => /^(yes|true)$/i.test(o.textContent.trim()));
      if (found) return found;
    }
    if (target === 'false' || target === 'no') {
      found = opts.find((o) => /^(no|false)$/i.test(o.textContent.trim()));
      if (found) return found;
    }
    return null;
  }

  function applyMatches(matches, profile) {
    let filled = 0;
    const errors = [];
    const filledPaths = [];

    for (const m of matches) {
      const raw = getProfileValue(profile, m.profilePath);
      if (raw === null || raw === undefined || raw === '') continue;

      const el = m.field.element;
      try {
        if (el.tagName === 'SELECT') {
          const opt = matchSelectOption(el, raw);
          if (opt) {
            setSelectValue(el, opt.value);
            filled++;
            filledPaths.push(m.profilePath);
          }
        } else if (el.type === 'checkbox') {
          setCheckbox(el, raw);
          filled++;
          filledPaths.push(m.profilePath);
        } else if (el.type === 'radio') {
          // Find the radio in the same group whose value matches
          const group = document.querySelectorAll(
            `input[type=radio][name="${CSS.escape(el.name || '')}"]`
          );
          const target = String(raw).toLowerCase();
          for (const radio of group) {
            if (
              radio.value.toLowerCase() === target ||
              (radio.labels &&
                Array.from(radio.labels).some((l) =>
                  l.textContent.trim().toLowerCase().includes(target)
                ))
            ) {
              if (!radio.checked) radio.click();
              filled++;
              filledPaths.push(m.profilePath);
              break;
            }
          }
        } else {
          // Date-shaped values (YYYY-MM or YYYY-MM-DD) get reshaped to the
          // form's preferred format based on its placeholder, so a profile
          // "2014-06" lands as "1 June 2014" on a Keka-style input.
          setNativeInputValue(el, formatDateForField(String(raw), m.field));
          filled++;
          filledPaths.push(m.profilePath);
        }
      } catch (err) {
        errors.push({ path: m.profilePath, message: err.message });
      }
    }

    return { filled, filledPaths, errors };
  }

  // ---------- File input handling (resume upload) ----------

  function base64ToBytes(base64) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function buildFileFromPayload(payload) {
    if (!payload || !payload.base64) return null;
    try {
      const bytes = base64ToBytes(payload.base64);
      return new File([bytes], payload.name || 'resume.pdf', {
        type: payload.type || 'application/pdf',
      });
    } catch {
      return null;
    }
  }

  function isResumeInput(field) {
    const el = field.element;
    if (!(el instanceof HTMLInputElement) || el.type !== 'file') return false;
    const haystack = [
      field.signals.name,
      field.signals.id,
      field.signals.label,
      field.signals.placeholder,
      field.signals.ariaLabel,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    // Empty signals → can't confidently match; skip rather than upload to
    // an unrelated file input (e.g. profile picture).
    if (!haystack) return false;
    return /resume|cv|curriculum|attach[a-z]*|upload[\s_-]*resume/.test(haystack);
  }

  function setFileInput(input, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Walk all scanned fields, find resume-like file inputs, and upload the
  // provided resume payload to each. Returns the number of inputs filled.
  function applyResume(fields, resumePayload) {
    const file = buildFileFromPayload(resumePayload);
    if (!file) return { uploaded: 0, target: null };
    let uploaded = 0;
    let target = null;
    for (const field of fields) {
      if (!isResumeInput(field)) continue;
      try {
        setFileInput(field.element, file);
        uploaded++;
        if (!target) {
          target =
            field.signals.label ||
            field.signals.ariaLabel ||
            field.signals.name ||
            field.signals.id ||
            'Resume';
        }
      } catch (err) {
        // Some forms wrap file inputs in shadow DOM or restrict file
        // assignment — swallow and continue rather than 500ing the fill.
        console.warn('[Naukri Clear] file input assignment failed:', err);
      }
    }
    return { uploaded, target };
  }

  window.NC_applyMatches = applyMatches;
  window.NC_applyResume = applyResume;
  window.NC_isResumeInput = isResumeInput;
})();
