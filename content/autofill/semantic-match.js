// Score each scanned field against the taxonomy; produce matches + unresolved.

(function () {
  if (window.NC_matchFields) return;

  const CONFIDENCE_THRESHOLD = 0.7;

  function scoreField(field, entry) {
    const sig = field.signals;
    const p = entry.patterns || {};
    let best = 0;

    // autocomplete attribute is the gold signal
    if (p.autocomplete && sig.autocomplete) {
      const accepted = p.autocomplete.split('|');
      if (accepted.includes(sig.autocomplete.toLowerCase())) {
        best = Math.max(best, 1.0);
      }
    }

    // type attribute (email, tel)
    if (p.type && field.type === p.type) {
      best = Math.max(best, 0.95);
    }

    // name attribute
    if (p.name) {
      if (sig.name && p.name.test(sig.name)) best = Math.max(best, 0.9);
      if (sig.id && p.name.test(sig.id)) best = Math.max(best, 0.85);
    }

    // label / aria-label / placeholder
    if (p.label) {
      const haystack = [sig.label, sig.ariaLabel, sig.placeholder]
        .filter(Boolean)
        .join(' | ');
      if (haystack && p.label.test(haystack)) best = Math.max(best, 0.85);
    }

    return best * (entry.weight || 1);
  }

  function matchFields(fields, taxonomy) {
    const matches = [];
    const unresolved = [];
    // Track which profile paths have already been bound; first match wins to
    // avoid filling the same profile field into two inputs.
    const usedPaths = new Set();

    for (const field of fields) {
      let best = null;
      for (const entry of taxonomy) {
        if (usedPaths.has(entry.profilePath)) continue;
        const score = scoreField(field, entry);
        if (score >= CONFIDENCE_THRESHOLD && (!best || score > best.score)) {
          best = {
            profilePath: entry.profilePath,
            score,
            valueType: entry.valueType || null,
          };
        }
      }
      if (best) {
        usedPaths.add(best.profilePath);
        matches.push({
          field,
          profilePath: best.profilePath,
          confidence: best.score,
          valueType: best.valueType,
        });
      } else {
        unresolved.push(field);
      }
    }

    return { matches, unresolved };
  }

  window.NC_matchFields = matchFields;
})();
