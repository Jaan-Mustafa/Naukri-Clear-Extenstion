// Discover form fields on the page and build FieldDescriptors for matching.

(function () {
  if (window.NC_scanFields) return;

  function isVisible(el) {
    if (!el || !el.offsetParent) {
      // offsetParent is null for display:none; check explicit hidden too
      const style = window.getComputedStyle(el);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  function getLabel(input) {
    // 1. Explicit <label for="id">
    if (input.id) {
      try {
        const lab = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        if (lab) return lab.textContent.trim();
      } catch {
        // CSS.escape may throw on unusual IDs; fall through
      }
    }
    // 2. Wrapping <label>
    const wrap = input.closest('label');
    if (wrap) {
      const clone = wrap.cloneNode(true);
      // Remove the input itself so its placeholder doesn't pollute the label text
      clone.querySelectorAll('input, textarea, select').forEach((n) => n.remove());
      const text = clone.textContent.trim();
      if (text) return text;
    }
    // 3. aria-labelledby
    const labelledBy = input.getAttribute('aria-labelledby');
    if (labelledBy) {
      const refs = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean);
      if (refs.length) return refs.map((el) => el.textContent.trim()).join(' ');
    }
    return null;
  }

  function scanFields() {
    const selector = [
      'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image])',
      'textarea',
      'select',
    ].join(', ');

    const nodes = Array.from(document.querySelectorAll(selector)).filter((el) => {
      if (el.disabled) return false;
      if (el.readOnly) return false;
      // File inputs are commonly hidden behind styled dropzones (Workday,
      // Lever, some Greenhouse layouts). Setting input.files on a hidden
      // <input type="file"> still triggers the change event the form's
      // React/Vue state machine watches, so we keep them in scope.
      if (el.tagName === 'INPUT' && el.type === 'file') return true;
      if (!isVisible(el)) return false;
      return true;
    });

    return nodes.map((el, index) => ({
      element: el,
      index,
      type: (el.type || el.tagName).toLowerCase(),
      tagName: el.tagName.toLowerCase(),
      signals: {
        label: getLabel(el),
        placeholder: el.getAttribute('placeholder'),
        name: el.getAttribute('name'),
        id: el.id || null,
        ariaLabel: el.getAttribute('aria-label'),
        autocomplete: el.getAttribute('autocomplete'),
      },
      required: el.required === true,
      options:
        el.tagName === 'SELECT'
          ? Array.from(el.options).map((o) => ({
              value: o.value,
              label: o.textContent.trim(),
            }))
          : null,
    }));
  }

  window.NC_scanFields = scanFields;
})();
