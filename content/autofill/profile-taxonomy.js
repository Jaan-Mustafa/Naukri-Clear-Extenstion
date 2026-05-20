// Canonical profile-field taxonomy.
// Each entry maps a profile path (dot notation) to signal patterns the field
// must satisfy. Higher-weight signals win. Anything scoring < 0.7 is unresolved.

// Always reassign — taxonomy is pure data and we want updates to land
// immediately on re-injection without needing a version dance.
(function () {
  window.NC_TAXONOMY = [
    // Identity
    {
      profilePath: 'firstName',
      patterns: {
        autocomplete: 'given-name',
        name: /^(first|given)[\s_-]?name$|^fname$/i,
        label: /\b(first|given)\s*name\b/i,
      },
      weight: 1.0,
    },
    {
      profilePath: 'middleName',
      patterns: {
        autocomplete: 'additional-name',
        name: /^middle[\s_-]?name$|^mname$/i,
        label: /\bmiddle\s*name\b/i,
      },
      weight: 0.95,
    },
    {
      profilePath: 'lastName',
      patterns: {
        autocomplete: 'family-name',
        name: /^(last|family|sur)[\s_-]?name$|^lname$|surname/i,
        label: /\b(last|family|sur)\s*name\b|surname/i,
      },
      weight: 1.0,
    },
    {
      profilePath: 'gender',
      patterns: {
        autocomplete: 'sex',
        name: /^(gender|sex)$/i,
        label: /\b(gender|sex)\b/i,
      },
      weight: 0.9,
    },
    {
      profilePath: 'currentLocation',
      patterns: {
        name: /current[\s_-]?location|present[\s_-]?location|current[\s_-]?city/i,
        label: /\b(current location|present location|current city|where (are |do )?you (currently )?(live|based|located))\b/i,
      },
      weight: 0.9,
    },
    {
      profilePath: 'email',
      patterns: {
        autocomplete: 'email',
        type: 'email',
        name: /e?[\s_-]?mail/i,
        label: /e[\s-]?mail/i,
      },
      weight: 1.0,
    },
    {
      profilePath: 'phone',
      patterns: {
        autocomplete: 'tel',
        type: 'tel',
        name: /phone|mobile|tel(ephone)?/i,
        label: /\b(phone|mobile|telephone|contact number)\b/i,
      },
      weight: 0.95,
    },

    // Address
    {
      profilePath: 'address.line1',
      patterns: {
        autocomplete: 'street-address|address-line1',
        name: /address[\s_-]?(line)?[\s_-]?1?$|^street/i,
        label: /\b(street address|address line 1|address)\b/i,
      },
      weight: 0.9,
    },
    {
      profilePath: 'address.city',
      patterns: {
        autocomplete: 'address-level2',
        name: /^city$|town/i,
        label: /\b(city|town)\b/i,
      },
      weight: 0.9,
    },
    {
      profilePath: 'address.state',
      patterns: {
        autocomplete: 'address-level1',
        name: /state|province|region/i,
        label: /\b(state|province|region)\b/i,
      },
      weight: 0.85,
    },
    {
      profilePath: 'address.postalCode',
      patterns: {
        autocomplete: 'postal-code',
        name: /(zip|postal|pin)[\s_-]?code/i,
        label: /\b(zip|postal code|pin ?code|postcode)\b/i,
      },
      weight: 0.95,
    },
    {
      profilePath: 'address.country',
      patterns: {
        autocomplete: 'country|country-name',
        name: /country/i,
        label: /\bcountry\b/i,
      },
      weight: 0.9,
    },

    // Links
    {
      profilePath: 'links.linkedin',
      patterns: {
        autocomplete: 'url',
        name: /linkedin/i,
        label: /linkedin( profile| url)?/i,
      },
      weight: 0.95,
    },
    {
      profilePath: 'links.github',
      patterns: {
        name: /github/i,
        label: /github( profile| url)?/i,
      },
      weight: 0.95,
    },
    {
      profilePath: 'links.portfolio',
      patterns: {
        name: /portfolio|website|personal[\s_-]?(site|url)/i,
        label: /\b(portfolio|website|personal (site|url))\b/i,
      },
      weight: 0.85,
    },

    // Current role
    {
      profilePath: 'currentRole.company',
      patterns: {
        name: /current[\s_-]?(company|employer)/i,
        label: /\bcurrent (company|employer)\b|present employer/i,
      },
      weight: 0.85,
    },
    {
      profilePath: 'currentRole.title',
      patterns: {
        name: /current[\s_-]?(title|role|designation)|job[\s_-]?title/i,
        label: /\bcurrent (title|role|designation)\b|\bjob title\b/i,
      },
      weight: 0.8,
    },
    {
      profilePath: 'currentRole.currentCtc',
      patterns: {
        name: /current[\s_-]?(ctc|salary|comp)/i,
        label: /\bcurrent (ctc|salary|compensation|package)\b/i,
      },
      weight: 0.9,
    },

    // Comp expectations
    {
      profilePath: 'comp.expectedCtc',
      patterns: {
        name: /expected[\s_-]?(ctc|salary|comp)/i,
        label: /\bexpected (ctc|salary|compensation)\b|desired (salary|comp)/i,
      },
      weight: 0.9,
    },
    {
      profilePath: 'comp.noticePeriodDays',
      patterns: {
        name: /notice[\s_-]?period|available[\s_-]?to[\s_-]?join|joining[\s_-]?days|days[\s_-]?to[\s_-]?join/i,
        label: /\b(notice period|available to join|earliest start|joining (in )?days|days to join)\b/i,
      },
      weight: 0.9,
    },

    // Experience
    {
      profilePath: 'experience.totalYears',
      patterns: {
        name: /(total|years)[\s_-]?(of)?[\s_-]?(experience|exp)|^yoe$/i,
        label: /\b(total )?(years of )?experience\b|\byoe\b/i,
      },
      weight: 0.85,
    },

    // Work auth
    {
      profilePath: 'workAuth.authorizedToWork',
      patterns: {
        label: /authori[sz]ed.+(work|employment)|legally.+(work|employ)/i,
      },
      weight: 0.85,
      valueType: 'boolean',
    },
    {
      profilePath: 'workAuth.requiresSponsorship',
      patterns: {
        label: /require.+sponsorship|need.+(work )?visa|sponsorship( required| needed)?/i,
      },
      weight: 0.85,
      valueType: 'boolean',
    },
  ];
})();
