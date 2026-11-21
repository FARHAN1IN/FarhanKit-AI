/**
 * Turns the plain text of a CV into the CV builder's fields — rule-based, no AI.
 *
 *   parseCv(text) → { cv: { name, title, email, phone, location, links[], summary,
 *                            experience[{role,company,dates,details}], education[{degree,school,year}],
 *                            skills[], languages[], projects[{name,details}], certifications[] },
 *                     found: { …counts } }
 */

/* ---------------- section headings ---------------- */
const SECTION_NAMES = {
  summary: ['summary', 'professional summary', 'profile', 'professional profile', 'about', 'about me', 'objective', 'career objective', 'career summary', 'personal statement', 'executive summary'],
  experience: ['experience', 'professional experience', 'work experience', 'employment', 'employment history', 'work history', 'career history', 'relevant experience', 'internship', 'internships', 'internship experience', 'experience & internships', 'job experience'],
  education: ['education', 'education history', 'academic background', 'academic qualifications', 'academic qualification', 'educational qualification', 'educational qualifications', 'educational background', 'qualifications'],
  skills: ['skills', 'technical skills', 'key skills', 'core skills', 'core competencies', 'competencies', 'skills & tools', 'skills and tools', 'tools', 'technologies', 'expertise', 'areas of expertise', 'skill set', 'skillset', 'it skills', 'computer skills'],
  projects: ['projects', 'personal projects', 'academic projects', 'key projects', 'selected projects', 'project experience', 'project', 'notable projects'],
  certifications: ['certifications', 'certification', 'certificates', 'certifications & training', 'certifications and training', 'certification & training', 'training', 'trainings', 'courses', 'licenses & certifications', 'licenses and certifications', 'training & internship', 'training & internships', 'training & certifications', 'achievements', 'awards', 'awards & certifications', 'honors & awards'],
  languages: ['languages', 'language', 'language proficiency'],
  contact: ['contact', 'contacts', 'contact information', 'contact info', 'contact details', 'personal details', 'personal information', 'personal info'],
  ignore: ['references', 'reference', 'interests', 'hobbies', 'strength', 'strengths', 'declaration', 'extracurricular activities', 'extra-curricular activities', 'activities', 'volunteering', 'volunteer experience', 'soft skills'],
};
const HEADING = new Map(Object.entries(SECTION_NAMES).flatMap(([section, names]) => names.map((n) => [n, section])));

const normHeading = (line) => line.toLowerCase().replace(/[^a-z& ]+/g, ' ').replace(/\s+/g, ' ').trim();
const HEADING_COMPACT = new Map([...HEADING].map(([name, section]) => [name.replace(/[^a-z]/g, ''), section]));
const headingOf = (line) => {
  if (line.length > 60) return null;
  const direct = HEADING.get(normHeading(line));
  if (direct) return direct;
  // letter-spaced headings like "E X P E R I E N C E"
  const tokens = line.trim().split(/\s+/);
  if (tokens.length >= 4 && tokens.filter((t) => t.length <= 2).length >= tokens.length * 0.6) {
    return HEADING_COMPACT.get(line.toLowerCase().replace(/[^a-z]/g, '')) ?? null;
  }
  return null;
};

/* ---------------- dates ---------------- */
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE_PART = `(?:${MONTH}\\s*,?\\s*(?:19|20)\\d{2}|\\d{1,2}[/.](?:19|20)\\d{2}|(?:19|20)\\d{2})`;
const OPEN_END = '(?:present|current|now|ongoing|running|till\\s+date|to\\s+date|date)';
const RANGE_RE = new RegExp(`${DATE_PART}\\s*(?:–|—|-|to|until)\\s*(?:${DATE_PART}|${OPEN_END})`, 'i');
const SINGLE_RE = new RegExp(`${MONTH}\\s*,?\\s*(?:19|20)\\d{2}|\\b(?:19|20)\\d{2}\\b`, 'i');
const DATE_TAIL = '(?:\\s*\\((?:contract(?:ual)?|part[- ]time|full[- ]time|remote|internship|freelance)\\))?';

function findDates(line) {
  const m = line.match(new RegExp(`(${RANGE_RE.source})${DATE_TAIL}`, 'i')) ?? line.match(new RegExp(`(${MONTH}\\s*,?\\s*(?:19|20)\\d{2})${DATE_TAIL}`, 'i'));
  if (!m) return null;
  const pretty = m[0]
    .replace(/\s*(–|—|-|to|until)\s*/i, ' – ')
    .replace(/\s*\(/, ' (')
    .replace(/\b(\w)(\w*)/g, (w, a, b) => (/^(present|current|now|ongoing|running)$/i.test(w) ? a.toUpperCase() + b.toLowerCase() : w))
    .trim();
  return { text: m[0], pretty };
}

/* ---------------- line helpers ---------------- */
const BULLET_RE = /^\s*(?:[●•▪▫◦‣∙·*➢➤►▶✓✔◆◇■□\-–]|o(?=\s))\s*/;
const isBullet = (line) => BULLET_RE.test(line);
const stripBullet = (line) => line.replace(BULLET_RE, '').trim();
const ICONS = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{FE0F}]/gu;
const cleanSep = (s) => s.replace(/^[\s|,;:·–—-]+|[\s|,;:·–—-]+$/g, '').trim();
const titleCase = (s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : s);

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const URL_RE = /(?:https?:\/\/|www\.)[^\s|,]+|\b(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com)\/[^\s|,]+/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
const isPhone = (s) => (s.match(/\d/g) ?? []).length >= 9 && !/^(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}$/.test(s.trim());

/** Join lines the PDF broke apart: dangling date ranges, split URLs. */
function normalize(text) {
  const lines = text
    .split('\n')
    // symbol bullets (➢ ✓ ► …) become "• " before decorative icons (📧 📞 …) are removed
    .map((l) =>
      l
        .replace(/^\s*[➢➤►▶✓✔◆◇■□]\s*/u, '• ')
        .replace(ICONS, '')
        .replace(/^([●•▪▫◦‣∙·*-]?)\s*\|\s*/u, '$1 ') // "● | text" (gap after the bullet symbol)
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  const out = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (prev && new RegExp(`(?:–|—|-|to)\\s*(?:${MONTH})?\\s*$`, 'i').test(prev) && /^((19|20)\d{2}|present|current)\b/i.test(line) && SINGLE_RE.test(prev)) {
      out[out.length - 1] = `${prev} ${line}`; // "Feb 2026 –Aug" + "2026"
    } else if (prev && /(https?:\/\/|www\.)\S*[-/]$/.test(prev) && /^[\w./#?=&%-]+$/.test(line) && !headingOf(line) && !/^\p{Lu}{3,}$/u.test(line)) {
      out[out.length - 1] = prev + line; // URL split over two lines
    } else out.push(line);
  }
  return out;
}

/* ---------------- section parsers ---------------- */

/**
 * Does this plain line continue the previous point (wrapped text) rather than start a new one?
 * New point only when the previous one ended a sentence and this line starts with a capital.
 */
const continues = (prev, line) => !/[.!?]["')]?$/.test(prev.trim()) || /^[\p{Ll}(\d%&]/u.test(line);

/** Experience-like blocks: role line, "Company | dates" line, bullets (and wrapped bullet lines). */
function parseEntries(lines) {
  const entries = [];
  let cur = null;
  let lastBullet = false;
  const start = (role = '') => entries.push((cur = { role, company: '', dates: '', details: [] }));

  lines.forEach((raw, i) => {
    if (isBullet(raw)) {
      if (!cur) start();
      cur.details.push(stripBullet(raw));
      lastBullet = true;
      return;
    }
    const line = raw;
    const d = findDates(line);
    if (d) {
      const rest = cleanSep(line.replace(d.text, ''));
      if (cur && cur.role && !cur.company && !cur.dates && !cur.details.length) {
        cur.dates = d.pretty;
        if (rest) cur.company = rest;
        else {
          // "Frontend Developer at Shop BD" on the line above, date alone on this line
          const m = cur.role.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i) ?? cur.role.match(/^(.+?)\s*\|\s*(.+)$/);
          if (m) [cur.role, cur.company] = [cleanSep(m[1]), cleanSep(m[2])];
        }
      } else {
        start();
        cur.dates = d.pretty;
        const [role, company] = splitRoleCompany(rest);
        cur.role = role;
        cur.company = company;
      }
      lastBullet = false;
      return;
    }
    const next = lines[i + 1];
    const nextIsDateLine = next && !isBullet(next) && findDates(next);
    // A job title above a date line: starts with a capital, short, no full stop — not the
    // wrapped end of the previous point ("and strengthening overall reliability.").
    const looksLikeRole = /^[\p{Lu}\d]/u.test(line) && line.length < 90 && !/[.]$/.test(line);
    if (nextIsDateLine && looksLikeRole) {
      start(line);
      lastBullet = false;
    } else if (lastBullet && cur?.details.length && continues(cur.details[cur.details.length - 1], line)) {
      cur.details[cur.details.length - 1] += ` ${line}`; // wrapped point
    } else if (cur && cur.role && !cur.company && !cur.dates && !cur.details.length) {
      cur.company = line;
    } else if (!cur) {
      start(line);
    } else {
      cur.details.push(line); // a point without a bullet character
      lastBullet = true;
    }
  });

  return entries
    .map((e) => ({ role: e.role, company: e.company, dates: e.dates, details: e.details.map((x) => x.trim()).filter(Boolean).join('\n') }))
    .filter((e) => e.role || e.company || e.details);
}

function splitRoleCompany(text) {
  const m =
    text.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i) ??
    text.match(/^(.+?)\s*[|·•]\s*(.+)$/) ??
    text.match(/^(.+?)\s*,\s*(.+)$/) ??
    text.match(/^(.+?)\s+[–—-]\s+(.+)$/);
  return m ? [cleanSep(m[1]), cleanSep(m[2])] : [text, ''];
}

function parseEducation(lines) {
  const out = [];
  const rest = [];
  for (const line of lines) {
    // "▪ B.Sc in CSE, Some University, 2021-2025" → one entry per line
    if (isBullet(line) && findDates(line)) {
      const d = findDates(line);
      const [degree, school] = splitRoleCompany(cleanSep(stripBullet(line).replace(d.text, '')));
      out.push({ degree, school, year: d.pretty });
    } else rest.push(line);
  }
  for (const e of parseEntries(rest)) {
    out.push({ degree: e.role || e.details.split('\n')[0] || '', school: e.company, year: e.dates });
  }
  return out.filter((e) => e.degree || e.school);
}

function parseProjects(lines) {
  const projects = [];
  let cur = null;
  let lastBullet = false;
  lines.forEach((line, i) => {
    if (isBullet(line)) {
      if (!cur) projects.push((cur = { name: '', details: [] }));
      cur.details.push(stripBullet(line));
      lastBullet = true;
      return;
    }
    const next = lines[i + 1];
    // A title: short capitalised line, after the previous point is finished, followed by a
    // bullet or a capitalised line (works with and without bullet characters).
    const prevDone = !cur || !cur.details.length || !continues(cur.details[cur.details.length - 1], line);
    const looksLikeTitle = prevDone && !/[.,;:]$/.test(line) && /^[\p{Lu}\d]/u.test(line) && line.length < 100 && (!next || isBullet(next) || /^[\p{Lu}]/u.test(next));
    if (looksLikeTitle || !cur) {
      projects.push((cur = { name: line, details: [] }));
      lastBullet = false;
    } else if (cur.details.length && continues(cur.details[cur.details.length - 1], line)) {
      cur.details[cur.details.length - 1] += ` ${line}`;
    } else {
      cur.details.push(line);
      lastBullet = true;
    }
  });
  return projects.map((p) => ({ name: p.name, details: p.details.join('\n') })).filter((p) => p.name || p.details);
}

/** "Category: a, b, c" lines (wrapped lines joined) or plain lists → flat skill list. */
function parseSkills(lines) {
  const plain = lines.map(stripBullet).filter((l) => l && !/^[,;]$/.test(l));
  const hasCategories = plain.filter((l) => /^[^:]{2,45}:/.test(l)).length >= 2;
  const chunks = [];
  for (const line of plain) {
    if (!hasCategories || /^[^:]{2,45}:/.test(line) || !chunks.length) chunks.push(line);
    else chunks[chunks.length - 1] += ` ${line}`;
  }
  const items = chunks.flatMap((c) => (hasCategories ? c.replace(/^[^:]{2,45}:/, '') : c).split(/[,;•▪·|]|\s{2,}/));
  return uniqueClean(items, 60, 60);
}

function uniqueClean(items, max, itemMax) {
  const seen = new Set();
  const out = [];
  for (let s of items) {
    s = s.replace(/\s+/g, ' ').replace(/^[\s.:-]+|[\s.:]+$/g, '').trim();
    if (!s || s.length > itemMax || /^[(){}[\]]+$/.test(s)) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** One item per line/bullet; wrapped lines (starting in lower case) are joined. */
function parseList(lines) {
  const out = [];
  for (const line of lines) {
    const text = stripBullet(line);
    if (!text) continue;
    if (!isBullet(line) && out.length && /^[\p{Ll}(]/u.test(text)) out[out.length - 1] += ` ${text}`;
    else out.push(text);
  }
  return out;
}

/* ---------------- header: name, title, contacts ---------------- */
function isContactLine(line) {
  return EMAIL_RE.test(line) || /https?:\/\/|www\.|linkedin|github/i.test(line) || (line.match(PHONE_RE) ?? []).some(isPhone) || /^(present|permanent|current)?\s*address\s*:/i.test(line);
}

function findName(lines, email) {
  const emailWords = (email.split('@')[0] ?? '').toLowerCase().replace(/[^a-z]+/g, ' ').split(' ').filter((w) => w.length > 2);
  const looksLikeName = (s) => /^[\p{L}.'-]+(?: [\p{L}.'-]+){0,3}$/u.test(s) && s.split(' ').every((w) => /^[\p{Lu}]/u.test(w)) && !headingOf(s);
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    let s = lines[i];
    // "FARHANUL" + "ISLAM" on two lines
    if (/^[\p{Lu}]{2,}$/u.test(s) && /^[\p{Lu}]{2,}$/u.test(lines[i + 1] ?? '') && !headingOf(s) && !headingOf(lines[i + 1])) s = `${s} ${lines[i + 1]}`;
    if (!looksLikeName(s)) continue;
    const score = (i < 3 ? 3 : 0) + (emailWords.some((w) => s.toLowerCase().includes(w)) ? 5 : 0) + (s.split(' ').length >= 2 ? 1 : 0);
    candidates.push({ s, score, i });
  }
  candidates.sort((a, b) => b.score - a.score || a.i - b.i);
  return candidates[0] ? titleCase(candidates[0].s) : '';
}

function findLocation(lines) {
  for (const line of lines) {
    const m = line.match(/^(?:present\s+|current\s+)?(?:address|location|city|lives? in)\s*:\s*(.+)$/i);
    if (m) {
      const parts = m[1].split(',').map((p) => p.trim()).filter(Boolean);
      return parts.slice(-2).join(', ');
    }
  }
  return lines.find((l) => /^[\p{L} .'-]+,\s*[\p{L} .'-]+$/u.test(l) && l.split(' ').length <= 5 && !headingOf(l)) ?? '';
}

/* ---------------- main ---------------- */
export function parseCv(text) {
  const lines = normalize(text);

  // split into sections
  const sections = { header: [] };
  let current = 'header';
  for (const line of lines) {
    const h = headingOf(line);
    if (h) {
      current = h;
      sections[current] ??= [];
      continue;
    }
    // inline "Languages: English, Bangla" (plural only — "language: C++" inside skills stays a skill)
    const inline = line.match(/^languages\s*:\s*(.+)$/i);
    if (inline) {
      (sections.languages ??= []).push(inline[1]);
      continue;
    }
    sections[current].push(line);
  }

  // header/contact lines split on " | " so "email | phone | City, Country" is read item by item
  const contactLines = [...sections.header, ...(sections.contact ?? [])].flatMap((l) => l.split(/\s+\|\s+/)).map((l) => l.trim()).filter(Boolean);
  const all = lines.join('\n');
  const email = (contactLines.join(' ').match(EMAIL_RE) ?? all.match(EMAIL_RE) ?? [''])[0].toLowerCase();
  const phone = ([...contactLines.join(' ').matchAll(PHONE_RE)].map((m) => m[0]).find(isPhone) ?? '').trim();
  const links = uniqueClean(
    (all.match(URL_RE) ?? []).map((u) => u.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[/.)]+$/, '')).filter((u) => !u.includes('@')),
    5,
    200,
  );

  const name = findName([...sections.header, ...lines], email);
  const headerRest = sections.header.filter((l) => !isContactLine(l) && titleCase(l) !== name && !name.toLowerCase().includes(l.toLowerCase()));
  const location = findLocation(contactLines);
  const title = headerRest.find((l) => l !== location && !/\d/.test(l) && l.split(' ').length <= 8 && !/,/.test(l) && !/^(address|permanent)/i.test(l)) ?? '';

  const experience = parseEntries(sections.experience ?? []);
  const education = parseEducation(sections.education ?? []);
  const projects = parseProjects(sections.projects ?? []);
  const skills = parseSkills(sections.skills ?? []);
  const languages = uniqueClean((sections.languages ?? []).flatMap((l) => stripBullet(l).split(/[,;•▪·|]|\s{2,}/)).map((s) => s.replace(/\(.*?\)/g, '')), 15, 40);
  const certifications = uniqueClean(parseList(sections.certifications ?? []), 30, 160);
  const summary = (sections.summary ?? []).map(stripBullet).join(' ').replace(/\s+/g, ' ').trim().slice(0, 1500);

  const cv = {
    name: name.slice(0, 80),
    title: title.slice(0, 100),
    email: email.slice(0, 120),
    phone: phone.slice(0, 40),
    location: location.slice(0, 80),
    links,
    summary,
    experience: experience.slice(0, 15).map((e) => ({ role: e.role.slice(0, 100), company: e.company.slice(0, 100), dates: e.dates.slice(0, 60), details: e.details.slice(0, 2000) })),
    education: education.slice(0, 10).map((e) => ({ degree: e.degree.slice(0, 120), school: e.school.slice(0, 120), year: e.year.slice(0, 40) })),
    skills,
    languages,
    projects: projects.slice(0, 12).map((p) => ({ name: p.name.slice(0, 120), details: p.details.slice(0, 1000) })),
    certifications,
  };

  return {
    cv,
    found: {
      contact: [cv.email, cv.phone, cv.location].filter(Boolean).length + cv.links.length,
      summary: Boolean(cv.summary),
      experience: cv.experience.length,
      education: cv.education.length,
      skills: cv.skills.length,
      projects: cv.projects.length,
      certifications: cv.certifications.length,
      languages: cv.languages.length,
    },
  };
}
