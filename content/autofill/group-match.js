// Detects "repeating-group" fields (multi-entry Experience, Education, etc.)
// by parsing indexed field names and binds each group to one profile array
// entry. Generic across naming conventions — handles Keka (Spring MVC),
// Greenhouse / Lever variants, PHP/Laravel, Express-validator, and snake_case.
//
// Always reassigns (no version guard) so taxonomy/parser updates land on
// every re-injection without a manual hard-refresh.

(function () {

  // ---------- Naming-pattern parsers ----------
  //
  // Returns { section, index, field } if the input name looks like an indexed
  // group field; null otherwise. Order matters — more specific patterns first.
  function parseIndexedName(raw) {
    if (!raw) return null;

    // 1. Spring MVC / Keka: ExperienceDetails[0].companyName
    let m = raw.match(/^([A-Za-z][\w]*)\[(\d+)\]\.(.+)$/);
    if (m) return { section: m[1], index: +m[2], field: m[3] };

    // 2. PHP / Laravel:  experiences[0][companyName]
    m = raw.match(/^([A-Za-z][\w]*)\[(\d+)\]\[([^\]]+)\]$/);
    if (m) return { section: m[1], index: +m[2], field: m[3] };

    // 3. Express-validator / dot-with-index:  experiences.0.companyName
    m = raw.match(/^([A-Za-z][\w]*)\.(\d+)\.(.+)$/);
    if (m) return { section: m[1], index: +m[2], field: m[3] };

    // 4. Snake_case with index:  experiences_0_company_name  /  educationDate_0_year
    m = raw.match(/^([A-Za-z][\w]*?)_(\d+)_(.+)$/);
    if (m) return { section: m[1], index: +m[2], field: m[3] };

    return null;
  }

  // ---------- Section name → profile array path ----------
  // Normalize: lowercase, strip _ - and whitespace, drop "details"/"history"
  // suffix. So "ExperienceDetails", "work_experience", "WorkExperiences" all
  // collapse to "experience" → profile.experiences.
  const SECTION_MAP = {
    experience: 'experiences',
    experiences: 'experiences',
    workexperience: 'experiences',
    workhistory: 'experiences',
    employment: 'experiences',
    employmenthistory: 'experiences',
    pastemployment: 'experiences',
    job: 'experiences',
    jobs: 'experiences',
    workdetail: 'experiences',
    workdetails: 'experiences',

    education: 'education',
    educations: 'education',
    academic: 'education',
    academichistory: 'education',
    academicbackground: 'education',
    qualification: 'education',
    qualifications: 'education',
    schooling: 'education',
    degree: 'education',
    degrees: 'education',
  };

  function normalizeSection(s) {
    return s
      .toLowerCase()
      .replace(/[_\-\s]/g, '')
      .replace(/details?$/, '')
      .replace(/list$/, '');
  }

  function profileArrayFor(sectionName) {
    return SECTION_MAP[normalizeSection(sectionName)] || null;
  }

  // ---------- Field name → profile entry field ----------
  // Each array has its own field vocabulary. Lookups are normalized to lowercase
  // with separators stripped, so "Company Name", "company_name", "companyName"
  // all collapse to "companyname".
  const EXPERIENCE_FIELDS = {
    companyname: 'companyName',
    company: 'companyName',
    employer: 'companyName',
    employername: 'companyName',
    organization: 'companyName',
    organisation: 'companyName',

    jobtitle: 'jobTitle',
    title: 'jobTitle',
    position: 'jobTitle',
    positionheld: 'jobTitle',
    designation: 'jobTitle',
    role: 'jobTitle',

    dateofjoining: 'dateOfJoining',
    joiningdate: 'dateOfJoining',
    startdate: 'dateOfJoining',
    joindate: 'dateOfJoining',
    starton: 'dateOfJoining',
    fromdate: 'dateOfJoining',
    from: 'dateOfJoining',
    workedfrom: 'dateOfJoining',
    employedfrom: 'dateOfJoining',

    dateofrelieving: 'dateOfRelieving',
    relievingdate: 'dateOfRelieving',
    enddate: 'dateOfRelieving',
    exitdate: 'dateOfRelieving',
    leavedate: 'dateOfRelieving',
    todate: 'dateOfRelieving',
    to: 'dateOfRelieving',
    workedto: 'dateOfRelieving',
    employedto: 'dateOfRelieving',

    location: 'location',
    city: 'location',
    workplace: 'location',
    worklocation: 'location',
    placeofwork: 'location',

    currentlyworking: 'currentlyWorking',
    currentlyworkinghere: 'currentlyWorking',
    iscurrent: 'currentlyWorking',
    current: 'currentlyWorking',
    presentlyworking: 'currentlyWorking',
    presentemployer: 'currentlyWorking',

    roledescription: 'roleDescription',
    description: 'roleDescription',
    jobdescription: 'roleDescription',
    responsibilities: 'roleDescription',
    rolesandresponsibilities: 'roleDescription',
    keyresponsibilities: 'roleDescription',
    jobresponsibilities: 'roleDescription',
    workdescription: 'roleDescription',
    summary: 'roleDescription',
    rolesummary: 'roleDescription',
    achievements: 'roleDescription',
    keyachievements: 'roleDescription',
    accomplishments: 'roleDescription',
    whatyoudid: 'roleDescription',
    notes: 'roleDescription',
  };

  const EDUCATION_FIELDS = {
    course: 'course',
    degree: 'course',
    qualification: 'course',
    coursename: 'course',
    program: 'course',

    branch: 'branch',
    specialization: 'branch',
    specialisation: 'branch',
    fieldofstudy: 'branch',
    major: 'branch',
    stream: 'branch',
    discipline: 'branch',
    branchspecialization: 'branch',

    startdate: 'startDate',
    startofcourse: 'startDate',
    dateofjoining: 'startDate',
    joiningdate: 'startDate',
    fromdate: 'startDate',
    yearfrom: 'startDate',

    enddate: 'endDate',
    endofcourse: 'endDate',
    dateofcompletion: 'endDate',
    completiondate: 'endDate',
    passingyear: 'endDate',
    graduationyear: 'endDate',
    yearofpassing: 'endDate',
    todate: 'endDate',
    yearto: 'endDate',

    university: 'university',
    college: 'university',
    institution: 'university',
    school: 'university',
    universitycollege: 'university',
    schoolname: 'university',
    boardname: 'university',

    location: 'location',
    city: 'location',
    placeofstudy: 'location',
  };

  function normalizeFieldKey(s) {
    return s.toLowerCase().replace(/[_\-\s]/g, '');
  }

  function fieldKeyFor(profileArrayName, rawFieldName) {
    const norm = normalizeFieldKey(rawFieldName);
    if (profileArrayName === 'experiences') return EXPERIENCE_FIELDS[norm] || null;
    if (profileArrayName === 'education') return EDUCATION_FIELDS[norm] || null;
    return null;
  }

  // ---------- Main entry ----------
  // Walks all scanned fields, parses indexed names, and produces matches in
  // the same shape semantic-match emits — so applyMatches can consume them
  // unchanged.
  //
  //   matches:  [{ field, profilePath, valueType }]
  //             profilePath is dot-notation, e.g. "experiences.0.companyName",
  //             so the existing getProfileValue walks it correctly.
  //   consumed: Set<HTMLElement> — fields to remove from semantic-match's
  //             input so they don't get bound twice or to the wrong slot.
  function matchGroupedFields(fields, profile) {
    const matches = [];
    const consumed = new Set();

    for (const field of fields) {
      const sig = field.signals;
      const parsed = parseIndexedName(sig.name) || parseIndexedName(sig.id);
      if (!parsed) continue;

      const profileArrayName = profileArrayFor(parsed.section);
      if (!profileArrayName) {
        // Indexed field, but not a section we recognize. Don't consume —
        // a single-field taxonomy entry may still bind it sensibly.
        continue;
      }

      const profileField = fieldKeyFor(profileArrayName, parsed.field);
      if (!profileField) {
        // Indexed and in a known section, but unknown sub-field. Consume
        // anyway so semantic-match doesn't grab "Title" → currentRole.title
        // when it actually belongs to experiences[2].jobTitle.
        consumed.add(field.element);
        continue;
      }

      // Only emit a match if profile actually has data at this index/field.
      const arr = profile && profile[profileArrayName];
      const entry = Array.isArray(arr) ? arr[parsed.index] : null;
      const value = entry ? entry[profileField] : null;
      if (value === null || value === undefined || value === '') {
        // Consume so single-field matcher doesn't grab it, but don't fill.
        consumed.add(field.element);
        continue;
      }

      matches.push({
        field,
        profilePath: `${profileArrayName}.${parsed.index}.${profileField}`,
        valueType: profileField === 'currentlyWorking' ? 'boolean' : null,
      });
      consumed.add(field.element);
    }

    return { matches, consumed };
  }

  window.NC_matchGroupedFields = matchGroupedFields;
})();
