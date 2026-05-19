// Apply matched profile values to their fields with React/Vue-safe events.

(function () {
  if (window.NC_applyMatches) return;

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
          setNativeInputValue(el, String(raw));
          filled++;
          filledPaths.push(m.profilePath);
        }
      } catch (err) {
        errors.push({ path: m.profilePath, message: err.message });
      }
    }

    return { filled, filledPaths, errors };
  }

  window.NC_applyMatches = applyMatches;
})();
