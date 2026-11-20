/**
 * ATS improvement model — rule-based, runs entirely in the browser (no AI service, nothing sent).
 *
 * suggestImprovements(cv, result) → {
 *   summary: string | '',                        // model summary when the current one is missing/weak
 *   bullets: [{ before, after }],                // weak experience lines rewritten with action verbs
 *   skills: { role, list[] },                    // skills commonly expected for the job title
 *   examples: { [checkId]: string },             // model example for each check
 * }
 * improveLine(line) → stronger wording for one experience line (unchanged if nothing to fix).
 */
import { ACTION_VERBS } from './ats.js';

/* ---------- 1. Bullet rewriting ---------- */

// Weak openers → strong action verbs
const WEAK = [
  [/^(i\s+)?(was\s+)?responsible\s+for\s+/i, 'Managed '],
  [/^(i\s+)?(was\s+)?in\s+charge\s+of\s+/i, 'Led '],
  [/^(i\s+)?(was\s+)?(involved|participated)\s+in\s+/i, 'Contributed to '],
  [/^(i\s+)?worked\s+on\s+/i, 'Developed '],
  [/^(i\s+)?worked\s+with\s+/i, 'Collaborated with '],
  [/^(i\s+)?worked\s+as\s+/i, 'Served as '],
  [/^(i\s+)?helped\s+(to\s+|with\s+)?/i, 'Supported '],
  [/^(i\s+)?assisted\s+(with\s+|in\s+)?/i, 'Supported '],
  [/^(i\s+)?took\s+care\s+of\s+/i, 'Managed '],
  [/^(i\s+)?did\s+/i, 'Completed '],
  [/^(i\s+)?made\s+/i, 'Created '],
  [/^(my\s+)?(main\s+)?(tasks|duties)\s+(included|were|was)\s*:?\s*/i, ''],
];

const IRREGULAR = { build: 'built', lead: 'led', write: 'wrote', run: 'ran', drive: 'drove', grow: 'grew', cut: 'cut', win: 'won', teach: 'taught', oversee: 'oversaw', make: 'created', do: 'completed', set: 'set' };

/** "manage" / "managing" / "manages" → "Managed" (only if it's a known action verb). */
function toPast(word) {
  const w = word.toLowerCase();
  if (ACTION_VERBS.has(w)) return null; // already strong
  const stems = [w];
  if (w.endsWith('ing')) stems.push(w.slice(0, -3), `${w.slice(0, -3)}e`);
  if (w.endsWith('es')) stems.push(w.slice(0, -2));
  if (w.endsWith('s')) stems.push(w.slice(0, -1));
  for (const s of stems) {
    const options = [IRREGULAR[s], `${s}ed`, `${s}d`, s.replace(/y$/, 'ied'), s.replace(/([^aeiou])([aeiou])([bdgmnpt])$/, '$1$2$3$3ed')];
    const hit = options.find((o) => o && ACTION_VERBS.has(o));
    if (hit) return hit;
  }
  return null;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function improveLine(line) {
  const [, prefix, body] = line.match(/^(\s*(?:[-*•]\s*)?)(.*)$/);
  let text = body.trim();
  if (!text) return line;

  for (const [re, verb] of WEAK) {
    if (re.test(text)) { text = text.replace(re, verb); break; }
  }
  text = text.replace(/^i\s+/i, ''); // "I built…" → "built…"

  const [first, ...rest] = text.split(/\s+/);
  const past = toPast(first.replace(/[^a-z]/gi, ''));
  if (past) text = [past, ...rest].join(' ');

  text = cap(text);
  return text === body.trim() ? line : prefix + text;
}

/* ---------- 2. Skills expected for common roles ---------- */
const ROLE_SKILLS = [
  [/front.?end|react|angular|vue|ui developer/i, 'Frontend developer', ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'Responsive design', 'Git', 'REST APIs', 'Accessibility', 'Testing']],
  [/back.?end|node|\bjava\b|python|php|\.net|django|laravel|\bapi\b/i, 'Backend developer', ['Node.js', 'Python', 'SQL', 'REST APIs', 'PostgreSQL', 'Docker', 'Git', 'Unit testing', 'AWS', 'Linux']],
  [/\bdata\b|analyst|analytics|scientist|\bbi\b/i, 'Data analyst', ['SQL', 'Excel', 'Python', 'Power BI', 'Tableau', 'Data visualization', 'Statistics', 'Pandas', 'Reporting', 'Data cleaning']],
  [/design|\bux\b|\bui\b|graphic/i, 'Designer', ['Figma', 'UI design', 'UX research', 'Wireframing', 'Prototyping', 'Design systems', 'Typography', 'Adobe Photoshop', 'Adobe Illustrator', 'Usability testing']],
  [/full.?stack|web|software|developer|engineer|programmer|devops/i, 'Software developer', ['JavaScript', 'TypeScript', 'React', 'Node.js', 'SQL', 'REST APIs', 'Git', 'Docker', 'Testing', 'Agile']],
  [/accountant|accounting|finance|financial|audit|bookkeep/i, 'Accountant', ['Financial reporting', 'Excel', 'QuickBooks', 'Bookkeeping', 'Budgeting', 'Reconciliation', 'Tax preparation', 'IFRS', 'Payroll', 'Auditing']],
  [/sales|business development|account (manager|executive)/i, 'Sales', ['CRM', 'Salesforce', 'Lead generation', 'Negotiation', 'Pipeline management', 'Client relationships', 'Cold calling', 'Presentations', 'Market research', 'Forecasting']],
  [/market|seo|social media|content|brand/i, 'Marketing', ['SEO', 'Google Analytics', 'Content marketing', 'Social media', 'Copywriting', 'Email marketing', 'Google Ads', 'Campaign management', 'Canva', 'A/B testing']],
  [/teach|tutor|lecturer|instructor|educat/i, 'Teacher', ['Lesson planning', 'Classroom management', 'Curriculum development', 'Assessment', 'Differentiated instruction', 'Google Classroom', 'Online teaching', 'Mentoring', 'Parent communication', 'Communication']],
  [/nurse|nursing|medical|health|clinic|care/i, 'Healthcare', ['Patient care', 'Vital signs', 'Medication administration', 'EHR', 'Infection control', 'CPR/BLS', 'Patient education', 'Care planning', 'Documentation', 'Teamwork']],
  [/\bhr\b|human resources|recruit|talent|people/i, 'HR', ['Recruitment', 'Onboarding', 'Interviewing', 'HRIS', 'Employee relations', 'Performance management', 'Payroll', 'Labor law', 'Training', 'Sourcing']],
  [/support|customer|service|help.?desk|call cent/i, 'Customer support', ['Customer service', 'Troubleshooting', 'Zendesk', 'Ticketing systems', 'CRM', 'Problem solving', 'Conflict resolution', 'Communication', 'Product knowledge', 'Empathy']],
  [/project|product|manager|scrum|coordinator/i, 'Project manager', ['Project planning', 'Agile', 'Scrum', 'Jira', 'Stakeholder management', 'Risk management', 'Budgeting', 'Roadmapping', 'Team leadership', 'Reporting']],
];
const GENERIC_SKILLS = ['Communication', 'Teamwork', 'Problem solving', 'Time management', 'Microsoft Office', 'Leadership', 'Attention to detail', 'Adaptability'];

function suggestSkills(cv) {
  const have = new Set((cv.skills ?? []).map((s) => s.toLowerCase()));
  const title = cv.title || cv.experience?.[0]?.role || '';
  const match = ROLE_SKILLS.find(([re]) => re.test(title));
  const list = (match ? match[2] : GENERIC_SKILLS).filter((s) => !have.has(s.toLowerCase())).slice(0, 8);
  return { role: match ? match[1] : '', list };
}

/* ---------- 3. Model summary ---------- */
function yearsOfExperience(cv) {
  const years = [];
  const now = new Date().getFullYear();
  for (const e of cv.experience ?? []) {
    years.push(...(e.dates?.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number));
    if (/present|now|current|today/i.test(e.dates ?? '')) years.push(now);
  }
  return years.length ? Math.max(...years) - Math.min(...years) : 0;
}

const joinList = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0] ?? '');

function modelSummary(cv, keywords) {
  const title = cv.title || cv.experience?.[0]?.role;
  if (!title) return '';
  const years = yearsOfExperience(cv);
  const matched = new Set(keywords?.matched ?? []);
  // Skills that match the job ad first, then the rest
  const skills = [...(cv.skills ?? [])].sort((a, b) => matched.has(b.toLowerCase()) - matched.has(a.toLowerCase())).slice(0, 4);
  const company = cv.experience?.find((e) => e.company)?.company;

  return [
    `${cap(title)} with ${years >= 1 ? `${years}+ years of` : 'hands-on'} experience${company ? `, most recently at ${company}` : ''}.`,
    skills.length ? `Skilled in ${joinList(skills)}.` : '',
    'Known for delivering high-quality work on time, solving problems independently and collaborating closely with teams and stakeholders.',
    `Looking to bring these strengths to a new ${title.toLowerCase()} role and keep growing.`,
  ].filter(Boolean).join(' ');
}

/* ---------- 4. Model examples per check ---------- */
const EXAMPLES = {
  identity: '“Frontend Developer” — use the exact title from the job ad.',
  contact: 'jane.doe@gmail.com · +1 555 123 4567 · Berlin, Germany',
  summary: '“Frontend developer with 4 years of experience building fast, accessible web apps in React and TypeScript. Led the redesign of an online shop that raised sales by 18%.”',
  experience: 'Frontend Developer · Acme Inc. · Jan 2021 – Present',
  achievements: '“Reduced page load time by 40% by optimizing images and caching” — verb + what you did + result.',
  education: 'B.Sc. Computer Science · State University · 2018 – 2022',
  skills: 'Hard skills from the job ad first (React, SQL), then tools (Git, Figma), then soft skills (Teamwork).',
  length: 'One page: a 3-line summary, 3–5 points per recent job, 1–2 for older ones.',
};

/* ---------- Public API ---------- */
export function suggestImprovements(cv, result) {
  const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]));

  const bullets = (cv.experience ?? [])
    .flatMap((e) => (e.details ?? '').split('\n'))
    .filter((l) => l.trim())
    .map((before) => ({ before: before.replace(/^\s*[-*•]\s*/, '').trim(), after: improveLine(before).replace(/^\s*[-*•]\s*/, '').trim() }))
    .filter((b) => b.before !== b.after);

  const skills = byId.skills?.tip || (cv.skills ?? []).length < 12 ? suggestSkills(cv) : { role: '', list: [] };

  return {
    summary: byId.summary?.tip ? modelSummary(cv, result.keywords) : '',
    bullets,
    skills,
    examples: EXAMPLES,
  };
}
