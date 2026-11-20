/**
 * Tiny dependency-free, recursive schema validator.
 *
 * Rule shape:
 *   { type: 'string' | 'number' | 'boolean' | 'array' | 'object',
 *     required, min, max, pattern, message, enum,
 *     of:     'string' | <schema>   (array items),
 *     itemMax: number               (max length of each string item),
 *     schema: <schema>              (object fields) }
 *
 * Returns { value, errors } — value contains only known, sanitized fields;
 * errors is a flat map like { "stats[0].label": "label is required" } or null.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_RE = /^https?:\/\/\S+$/i;
const LINK = /^(https?:\/\/|mailto:|\/)\S*$/i; // absolute URL or site-relative path
const HEX = /^#[0-9a-f]{6}$/i;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const patterns = { EMAIL, URL: URL_RE, LINK, HEX, MONTH };

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function validateString(v, rule, field) {
  if (typeof v !== 'string') return [null, `${field} must be a string`];
  v = v.trim();
  if (rule.min && v.length < rule.min) return [null, `${field} must be at least ${rule.min} characters`];
  if (rule.max && v.length > rule.max) return [null, `${field} must be at most ${rule.max} characters`];
  if (rule.pattern && !rule.pattern.test(v)) return [null, rule.message ?? `${field} is invalid`];
  if (rule.enum && !rule.enum.includes(v)) return [null, `${field} must be one of: ${rule.enum.join(', ')}`];
  return [v, null];
}

export function validate(schema, input = {}, { partial = false } = {}, prefix = '') {
  const value = {};
  const errors = {};
  if (!isPlainObject(input)) input = {};

  for (const [field, rule] of Object.entries(schema)) {
    const key = prefix + field;
    let v = input[field];
    const missing = v === undefined || v === null || v === '';

    if (missing) {
      if (rule.required && (!partial || v === '' || v === null)) errors[key] = `${field} is required`;
      // An explicit empty string on an optional text field means "clear it".
      else if (v === '' && rule.type === 'string') value[field] = '';
      continue;
    }

    let err = null;
    switch (rule.type) {
      case 'string':
        [v, err] = validateString(v, rule, field);
        break;

      case 'number':
        if (typeof v !== 'number' || Number.isNaN(v)) err = `${field} must be a number`;
        else if (rule.min !== undefined && v < rule.min) err = `${field} must be ≥ ${rule.min}`;
        else if (rule.max !== undefined && v > rule.max) err = `${field} must be ≤ ${rule.max}`;
        break;

      case 'boolean':
        if (typeof v !== 'boolean') err = `${field} must be true or false`;
        break;

      case 'array': {
        if (!Array.isArray(v)) { err = `${field} must be a list`; break; }
        if (rule.max && v.length > rule.max) { err = `${field} may contain at most ${rule.max} items`; break; }
        if (rule.of === 'string' || !rule.of) {
          const out = [];
          for (const item of v) {
            if (typeof item !== 'string') { err = `${field} must be a list of text`; break; }
            const s = item.trim();
            if (rule.itemMax && s.length > rule.itemMax) { err = `each ${field} item must be at most ${rule.itemMax} characters`; break; }
            if (s) out.push(s);
          }
          v = out;
        } else {
          v = v.map((item, i) => {
            const r = validate(rule.of, item, {}, `${key}[${i}].`);
            if (r.errors) Object.assign(errors, r.errors);
            return r.value;
          });
        }
        break;
      }

      case 'object': {
        if (!isPlainObject(v)) { err = `${field} must be an object`; break; }
        const r = validate(rule.schema, v, { partial }, `${key}.`);
        if (r.errors) Object.assign(errors, r.errors);
        v = r.value;
        break;
      }

      default:
        err = `${field} has an unsupported type`;
    }

    if (err) errors[key] = err;
    else value[field] = v;
  }

  return { value, errors: Object.keys(errors).length ? errors : null };
}
