/**
 * ATS (Applicant Tracking System) readiness score — pure functions, no DOM.
 *
 * scoreCv(cv, jobDescription?) → {
 *   score: 0–100, grade: { key, label },
 *   checks: [{ id, label, got, max, tip }],     // tip is '' when the check is fully met
 *   keywords: null | { matched[], missing[], pct },
 *   notes: string[]                              // unscored advice
 * }
 *
 * Without a job description the checks add up to 100.
 * With one (15+ words), checks count for 75% and keyword match for 25%.
 * This is a heuristic of what ATS software and recruiters look for — not any vendor's real algorithm.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const ACTION_VERBS = new Set(
  `achieved analyzed architected automated boosted built championed coached collaborated completed configured
  contributed served ran conducted coordinated created cut decreased delivered deployed designed developed directed drove enabled engineered
  established exceeded expanded generated grew handled headed implemented improved increased initiated integrated
  introduced launched led maintained managed mentored migrated modernized negotiated optimized orchestrated
  organized oversaw planned prepared presented produced programmed published reduced redesigned refactored
  resolved restructured revamped saved scaled secured shipped simplified solved spearheaded streamlined
  supervised supported taught tested trained transformed tripled doubled upgraded won wrote`.split(/\s+/),
);

// Common words + job-ad boilerplate that are never useful keywords.
const STOP = new Set(
  `a about above across after again all also am among an and any are as at be because been before being below
  between both but by can could did do does doing down during each few for from further had has have having he her
  here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or
  other our ours out over own same she should so some such than that the their theirs them then there these they
  this those through to too under until up us very was we were what when where which while who whom why will with
  would you your yours yourself
  ability able apply applicant applicants candidate candidates company role roles position positions job jobs work
  working works team teams year years experience experienced strong excellent good great well within including
  include includes etc must may plus preferred required requirement requirements responsibilities responsible
  qualifications qualification skill skills knowledge understanding opportunity opportunities join looking seeking
  help new using use used per day days week weeks based environment equal employer benefits salary location remote
  hybrid office full time part ideal ideally world class fast paced dynamic passion passionate highly key level
  minimum least one two three four five across like want offer offers make makes making get across ensure etc
  hiring hire hires senior junior mid entry lead role's build builds building write writes writing develop develops
  design designs create creates maintain maintains collaborate collaborates support supports provide provides deliver
  delivers implement implements manage manages drive drives application applications solution solutions product
  products client clients customer customers business closely related relevant similar various multiple daily
  and/or e.g i.e`.split(/\s+/),
);

const words = (text = '') => text.trim().split(/\s+/).filter(Boolean).length;
const lines = (text = '') => text.split('\n').map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Extracts the most frequent meaningful terms from a job description. */
export function extractKeywords(text, limit = 20) {
  // Keeps tech terms intact: node.js, c++, c#, ci/cd
  const tokens = text.toLowerCase().match(/[a-z][a-z0-9+#./]*[a-z0-9+#]|[a-z]/g) ?? [];
  const freq = new Map();
  tokens.forEach((t, i) => {
    if (t.length < 2 || STOP.has(t) || /^\d+$/.test(t)) return;
    const entry = freq.get(t) ?? { term: t, count: 0, first: i };
    entry.count += 1;
    freq.set(t, entry);
  });
  return [...freq.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, limit)
    .map((e) => e.term);
}

/** Whole-word match, tolerant of simple word forms ("api" ↔ "apis", "test" ↔ "testing"). */
function contains(haystack, term) {
  const base = term.length > 3 && term.endsWith('s') ? term.slice(0, -1) : term;
  return new RegExp(`(^|[^a-z0-9])${escapeRe(base)}(s|es|ing|ed)?($|[^a-z0-9+#])`).test(haystack);
}

function cvText(cv) {
  return [
    cv.title, cv.summary, ...(cv.skills ?? []), ...(cv.languages ?? []),
    ...(cv.experience ?? []).flatMap((e) => [e.role, e.company, e.details]),
    ...(cv.education ?? []).flatMap((e) => [e.degree, e.school]),
  ].filter(Boolean).join('\n').toLowerCase();
}

export function gradeOf(score) {
  if (score >= 85) return { key: 'excellent', label: 'Excellent' };
  if (score >= 70) return { key: 'good', label: 'Good' };
  if (score >= 50) return { key: 'fair', label: 'Fair' };
  return { key: 'poor', label: 'Needs work' };
}

export function scoreCv(cv, jobDescription = '') {
  const checks = [];
  const add = (id, label, got, max, tip) => checks.push({ id, label, got: Math.round(got), max, tip: got >= max ? '' : tip });

  // 1. Name & target title (10)
  add('identity', 'Name and job title', (cv.name ? 5 : 0) + (cv.title ? 5 : 0), 10,
    !cv.name ? 'Add your full name.' : 'Add the job title you are targeting — ATS match it against the role.');

  // 2. Contact details (15)
  const emailOk = EMAIL.test(cv.email ?? '');
  add('contact', 'Contact details', (emailOk ? 7 : 0) + (cv.phone ? 5 : 0) + (cv.location ? 3 : 0), 15,
    !cv.email ? 'Add a professional email address.'
      : !emailOk ? 'Your email address doesn’t look valid.'
      : !cv.phone ? 'Add a phone number so recruiters can reach you.'
      : 'Add your city and country — many ATS filter candidates by location.');

  // 3. Summary (10)
  const sw = words(cv.summary);
  add('summary', 'Professional summary', sw >= 30 && sw <= 80 ? 10 : (sw >= 15 && sw <= 120) ? 5 : 0, 10,
    sw > 120 ? `Shorten your summary to under 80 words (now ${sw}).`
      : `Write a 2–4 sentence summary (30–80 words) with your title and top skills${sw ? ` — now ${sw} words` : ''}.`);

  // 4. Work experience (20)
  const jobs = (cv.experience ?? []).filter((e) => e.role || e.company);
  const complete = jobs.filter((e) => e.role && e.company && e.dates).length;
  add('experience', 'Work experience', jobs.length ? 10 + (complete === jobs.length ? 10 : 10 * (complete / jobs.length)) : 0, 20,
    !jobs.length ? 'Add at least one job, internship, project or volunteer role.'
      : 'Give every job a title, company and dates — ATS use dates to calculate experience.');

  // 5. Achievements (15)
  const bullets = jobs.flatMap((e) => lines(e.details));
  const avg = jobs.length ? bullets.length / jobs.length : 0;
  const verbShare = bullets.length ? bullets.filter((b) => ACTION_VERBS.has(b.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, ''))).length / bullets.length : 0;
  const metricShare = bullets.length ? bullets.filter((b) => /\d/.test(b)).length / bullets.length : 0;
  const achGot = (avg >= 2 ? 8 : avg >= 1 ? 4 : 0) + (verbShare >= 0.5 ? 4 : verbShare > 0 ? 2 : 0) + (metricShare >= 0.33 ? 3 : metricShare > 0 ? 1.5 : 0);
  add('achievements', 'Achievement points', achGot, 15,
    avg < 2 ? 'Describe each job with 2–5 points, one per line.'
      : verbShare < 0.5 ? 'Start points with action verbs: Led, Built, Improved, Reduced…'
      : 'Add numbers to show impact, e.g. “Cut page load time by 40%”.');

  // 6. Education (10)
  const edu = (cv.education ?? []).filter((e) => e.degree || e.school);
  add('education', 'Education', edu.some((e) => e.degree && e.school) ? 10 : edu.length ? 5 : 0, 10,
    !edu.length ? 'Add your highest degree, diploma or course.' : 'Include both the degree and the school name.');

  // 7. Skills (15)
  const sc = (cv.skills ?? []).length;
  add('skills', 'Skills', sc >= 8 ? 15 : sc >= 5 ? 10 : sc >= 1 ? 5 : 0, 15,
    `List at least 8 relevant skills — ATS match them against the job (now ${sc}).`);

  // 8. Length (5) — content words, excluding name/contact lines
  const total = words(cvText(cv));
  add('length', 'Length', total >= 150 && total <= 900 ? 5 : (total >= 80 && total <= 1200) ? 3 : 0, 5,
    total > 900 ? `Your CV is long (${total} words) — keep the most relevant points.`
      : `Your CV is short (${total} words) — add detail to experience and summary (aim for 150+).`);

  const base = checks.reduce((s, c) => s + c.got, 0);

  // Optional: keyword match against a job description
  let keywords = null;
  let score = base;
  if (words(jobDescription) >= 15) {
    const terms = extractKeywords(jobDescription);
    const text = cvText(cv);
    const matched = terms.filter((t) => contains(text, t));
    const missing = terms.filter((t) => !matched.includes(t));
    const pct = terms.length ? matched.length / terms.length : 0;
    keywords = { matched, missing, pct: Math.round(pct * 100) };
    score = base * 0.75 + pct * 25;
  }

  const notes = ['Simple one-column layout with standard section headings — easy for ATS to read.'];
  if (cv.photo) notes.push('Photos are common in some countries but discouraged in the US/UK — remove it when applying there.');

  score = Math.round(score);
  return { score, grade: gradeOf(score), checks, keywords, notes };
}
