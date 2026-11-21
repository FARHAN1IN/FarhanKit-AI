import { html, raw } from '../utils/dom.js';

/**
 * Renders the ATS score panel.
 * @param {ReturnType<import('./ats.js').scoreCv>} result
 * @param {{ open: boolean }} state  whether the "How to improve" list is expanded
 */
function renderFixes({ summary, bullets, skills }) {
  if (!summary && !bullets.length && !skills.list.length) return '';
  return html`<div class="ats__fixes">
    <p class="ats__fixes-title">✨ Quick fixes <span>— suggestions from the built-in improvement model</span></p>

    ${summary
      ? html`<div class="ats__fix">
          <p><strong>Model summary</strong> — edit it afterwards so it sounds like you</p>
          <blockquote>${summary}</blockquote>
          <button type="button" class="btn btn--ghost btn--sm" data-apply="summary">Use this summary</button>
        </div>`
      : ''}

    ${bullets.length
      ? html`<div class="ats__fix">
          <p><strong>Stronger wording</strong> — start each point with an action verb</p>
          <ul class="ats__diff">${bullets.slice(0, 3).map(
            (b) => html`<li><s>${b.before}</s><span>→ ${b.after}</span></li>`,
          )}</ul>
          ${bullets.length > 3 ? html`<p class="ats__note">…and ${bullets.length - 3} more</p>` : ''}
          <button type="button" class="btn btn--ghost btn--sm" data-apply="bullets">Apply ${bullets.length} fix${bullets.length > 1 ? 'es' : ''}</button>
        </div>`
      : ''}

    ${skills.list.length
      ? html`<div class="ats__fix">
          <p><strong>Skills often asked for${skills.role ? ` (${skills.role})` : ''}</strong> — click the ones you really have</p>
          <ul class="ats__tags">${skills.list.map(
            (s) => html`<li><button type="button" class="ats__tag ats__tag--suggest" data-add-skill="${s}">+ ${s}</button></li>`,
          )}</ul>
        </div>`
      : ''}
  </div>`;
}

const SECTION_LABEL = { contact: 'Contact', summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills', format: 'Format', keywords: 'Keywords' };

/**
 * AI review block.
 * @param {{ available: boolean, state: 'idle'|'loading'|'done'|'error', result?: object, error?: string, stale?: boolean }} ai
 */
const money = (price, currency) => `${Number(price).toLocaleString()} ${currency}`;
const STATUS_LABEL = { pending: '⏳ waiting for approval', approved: '✓ approved', rejected: '✕ rejected' };

/** "2 of 3 free reviews left" / "5 paid reviews left" */
function walletLine(w) {
  if (!w) return '';
  const parts = [];
  if (w.freeTotal) parts.push(`🎁 ${w.freeLeft} of ${w.freeTotal} free review${w.freeTotal > 1 ? 's' : ''} left`);
  if (w.credits) parts.push(`💳 ${w.credits} paid review${w.credits > 1 ? 's' : ''} left`);
  if (!w.freeLeft && !w.credits) parts.push('No AI reviews left');
  return parts.join(' · ');
}

/** Package choice + payment instructions + transaction form. */
function renderBuy(ai) {
  const { plan, buyForm: f } = ai;
  if (!plan?.packages?.length) return html`<p class="ats__note">Buying more reviews isn’t available right now.</p>`;
  const sending = ai.buyState === 'sending';
  return html`<form class="ats__buy" data-ai-buy-form novalidate>
    <p class="ats__ai-label">1. Choose a package</p>
    <div class="ats__packages">${plan.packages.map(
      (p, i) => html`<label class="ats__package"><input type="radio" name="packageIndex" value="${i}"${Number(f.packageIndex) === i ? raw(' checked') : ''}>
        <span><strong>${p.name}</strong> — ${p.credits} review${p.credits > 1 ? 's' : ''}</span><b>${money(p.price, plan.currency)}</b></label>`,
    )}</div>

    <p class="ats__ai-label">2. Pay</p>
    ${plan.instructions ? html`<p class="ats__note">${plan.instructions}</p>` : ''}
    ${plan.methods.length
      ? html`<ul class="ats__methods">${plan.methods.map((m) => html`<li><strong>${m.name}</strong>${m.details ? html` — ${m.details}` : ''}</li>`)}</ul>`
      : ''}
    <p class="ats__note">Your account: <strong>${ai.user?.email}</strong> — add it to the payment note if you can.</p>

    <p class="ats__ai-label">3. Tell us about your payment</p>
    <div class="ats__buy-grid">
      ${plan.methods.length
        ? html`<label class="cvb-field"><span>Paid with</span><select name="method">${plan.methods.map(
            (m) => html`<option${f.method === m.name ? raw(' selected') : ''}>${m.name}</option>`,
          )}</select></label>`
        : ''}
      <label class="cvb-field"><span>Transaction ID</span><input name="transactionId" value="${f.transactionId}" maxlength="80" placeholder="e.g. 8F3K29XQ" required></label>
      <label class="cvb-field"><span>Your name or number <em>(as on the payment)</em></span><input name="sender" value="${f.sender}" maxlength="80"></label>
    </div>
    ${ai.buyMsg ? html`<p class="${ai.buyMsgKind === 'error' ? 'ats__ai-error' : 'ats__note'}">${ai.buyMsg}</p>` : ''}
    <div class="ats__buy-actions">
      <button type="submit" class="btn btn--primary btn--sm"${sending ? raw(' disabled') : ''}>${sending ? 'Sending…' : 'Submit payment'}</button>
      <button type="button" class="cvb-link" data-ai-buy-close>Cancel</button>
    </div>
  </form>`;
}

function renderPayments(payments = []) {
  if (!payments.length) return '';
  return html`<div class="ats__payments">
    <p class="ats__ai-label">Your payments <button type="button" class="cvb-link ats__apply" data-ai-refresh>Check again</button></p>
    <ul class="ats__ai-list">${payments.map(
      (p) => html`<li>${p.packageName} (${p.credits} reviews, ${money(p.price, p.currency)}) · TX ${p.transactionId} — <span class="ats__pay--${p.status}">${STATUS_LABEL[p.status]}</span></li>`,
    )}</ul>
  </div>`;
}

/** Sign-up / log-in box shown instead of the AI review until the visitor has an account. */
function renderAuth(ai) {
  const a = ai.auth;
  const signup = a.mode === 'signup';
  const free = ai.plan?.freeReviews ?? 0;
  return html`<div class="ats__ai">
    <p class="ats__fixes-title">🤖 AI review <span>— several AI models check your CV together</span></p>
    <p class="ats__note">${signup
      ? `Create a free account to use the AI review${free ? ` — you get ${free} free review${free > 1 ? 's' : ''}` : ''}. Your free reviews and any reviews you buy stay with your account on every device.`
      : 'Log in to use your AI reviews.'}</p>
    <form class="ats__auth" data-ai-auth-form novalidate>
      ${signup ? html`<label class="cvb-field"><span>Name <em>(optional)</em></span><input name="name" maxlength="60" value="${a.form.name}" autocomplete="name"></label>` : ''}
      <label class="cvb-field"><span>Email</span><input name="email" type="email" maxlength="120" value="${a.form.email}" autocomplete="email" required></label>
      <label class="cvb-field"><span>Password${signup ? html` <em>(at least 8 characters)</em>` : ''}</span>
        <input name="password" type="password" maxlength="200" value="${a.form.password}" autocomplete="${signup ? 'new-password' : 'current-password'}" required></label>
      ${a.msg ? html`<p class="ats__ai-error">${a.msg}</p>` : ''}
      <div class="ats__buy-actions">
        <button type="submit" class="btn btn--primary btn--sm"${a.busy ? raw(' disabled') : ''}>${a.busy ? 'Please wait…' : signup ? 'Create free account' : 'Log in'}</button>
        <button type="button" class="cvb-link ats__apply" data-ai-auth-switch>${signup ? 'I already have an account — log in' : 'New here? Create a free account'}</button>
      </div>
    </form>
  </div>`;
}

function renderAi(ai) {
  if (!ai?.available) return '';
  if (!ai.user) return renderAuth(ai);
  const r = ai.result;
  const w = ai.wallet;
  const canReview = !w || w.freeLeft > 0 || w.credits > 0;
  const button = (label) => html`<button type="button" class="btn btn--primary btn--sm" data-ai-review${ai.state === 'loading' ? raw(' disabled') : ''}>${label}</button>`;

  return html`<div class="ats__ai">
    <div class="ats__ai-head">
      <p class="ats__fixes-title">🤖 AI review <span>— several AI models check your CV together</span></p>
      ${ai.state === 'loading'
        ? button('Reviewing… (≈20–60 s)')
        : canReview
          ? button(r ? 'Review again' : 'Get AI review')
          : html`<button type="button" class="btn btn--primary btn--sm" data-ai-buy>Buy AI reviews</button>`}
    </div>
    ${w ? html`<p class="ats__wallet">${walletLine(w)}${canReview && !ai.buyOpen ? html` · <button type="button" class="cvb-link ats__apply" data-ai-buy>Buy more</button>` : ''}</p>` : ''}
    <p class="ats__account">Signed in as <strong>${ai.user.email}</strong> · <button type="button" class="cvb-link ats__apply" data-ai-logout>Log out</button></p>
    ${ai.state === 'error' ? html`<p class="ats__ai-error">${ai.error}</p>` : ''}
    ${ai.buyOpen ? renderBuy(ai) : ''}
    ${renderPayments(ai.payments)}
    ${!r && ai.state !== 'loading' ? html`<p class="ats__note">Reads your CV like a recruiter and ATS would — paste a job ad in step 6 for a role-specific score. Your CV text is sent to the AI service for the review (photo excluded).</p>` : ''}
    ${r
      ? html`<div class="ats__ai-body${ai.stale ? ' is-stale' : ''}">
          ${ai.stale ? html`<p class="ats__note">You changed your CV since this review — click “Review again” for an updated score.</p>` : ''}
          <p class="ats__ai-score"><strong>${r.score}</strong>/100 ${r.hasJob ? 'for this job' : 'ATS-readiness'} — ${r.verdict}</p>
          ${r.models?.length
            ? html`<p class="ats__note">${r.models.length > 1 ? `Average of ${r.models.length} AI models` : 'From 1 AI model'}: ${r.models.map((m) => `${m.label} ${m.score}`).join(' · ')}${
                r.failed?.length ? ` (${Object.entries(r.failed.reduce((m, n) => ({ ...m, [n]: (m[n] ?? 0) + 1 }), {})).map(([n, c]) => (c > 1 ? `${c}× ${n}` : n)).join(', ')} didn’t answer)` : ''
              }</p>`
            : ''}

          ${r.strengths.length ? html`<p class="ats__ai-label">Strengths</p><ul class="ats__ai-list">${r.strengths.map((s) => html`<li>✓ ${s}</li>`)}</ul>` : ''}

          ${r.improvements.length
            ? html`<p class="ats__ai-label">What to fix</p>
              <ol class="ats__ai-list">${r.improvements.map(
                (i) => html`<li><span class="ats__ai-sec">${SECTION_LABEL[i.section] ?? i.section}</span> ${i.issue} <em>→ ${i.suggestion}</em></li>`,
              )}</ol>`
            : ''}

          ${r.rewrittenSummary
            ? html`<div class="ats__fix">
                <p><strong>AI summary</strong> — check it's accurate, then use it</p>
                <blockquote>${r.rewrittenSummary}</blockquote>
                <button type="button" class="btn btn--ghost btn--sm" data-ai-summary>Use this summary</button>
              </div>`
            : ''}

          ${r.rewrittenBullets.length
            ? html`<div class="ats__fix">
                <p><strong>AI-improved points</strong> — replace any “[X]” with your real numbers</p>
                <ul class="ats__diff">${r.rewrittenBullets.map(
                  (b, i) => html`<li><s>${b.original}</s><span>→ ${b.improved}</span>
                    <button type="button" class="cvb-link ats__apply" data-ai-bullet="${i}">Apply</button></li>`,
                )}</ul>
              </div>`
            : ''}

          ${r.keywords.missing.length
            ? html`<p class="ats__ai-label">Missing keywords (click to add the ones you have)</p>
              <ul class="ats__tags">${r.keywords.missing.map(
                (k) => html`<li><button type="button" class="ats__tag ats__tag--missing" data-add-skill="${k}">+ ${k}</button></li>`,
              )}</ul>`
            : ''}
          <p class="ats__note ats__disclaimer">AI can make mistakes — keep everything on your CV true.</p>
        </div>`
      : ''}
  </div>`;
}

/**
 * @param {ReturnType<import('./ats-improve.js').suggestImprovements>} [fixes]
 */
export function renderAtsPanel(result, { open, fixes, ai }) {
  const { score, grade, checks, keywords, notes } = result;
  const todo = checks.filter((c) => c.tip);

  return html`<section class="ats ats--${grade.key}" aria-label="ATS score">
    <div class="ats__head">
      <div class="ats__ring" style="--p:${score}" role="img" aria-label="ATS score ${score} out of 100">
        <span>${score}</span>
      </div>
      <div>
        <p class="ats__title">ATS score · <strong>${grade.label}</strong></p>
        <p class="ats__sub">${todo.length ? `${todo.length} way${todo.length > 1 ? 's' : ''} to improve` : 'Your CV is ATS-friendly!'}${
          keywords ? ` · job match ${keywords.pct}%` : ''
        }</p>
      </div>
    </div>

    ${renderAi(ai)}

    ${keywords
      ? html`<div class="ats__keywords">
          <p><strong>Job keywords:</strong> ${keywords.matched.length}/${keywords.matched.length + keywords.missing.length} found</p>
          ${keywords.missing.length
            ? html`<p class="ats__hint">Missing — click to add to your skills (only if you really have them):</p>
                <ul class="ats__tags">${keywords.missing.map(
                  (k) => html`<li><button type="button" class="ats__tag ats__tag--missing" data-add-skill="${k}">+ ${k}</button></li>`,
                )}</ul>`
            : ''}
          ${keywords.matched.length
            ? html`<ul class="ats__tags">${keywords.matched.map((k) => html`<li><span class="ats__tag ats__tag--ok">✓ ${k}</span></li>`)}</ul>`
            : ''}
        </div>`
      : html`<p class="ats__hint">Tip: paste a job description in step 6 to check keyword match.</p>`}

    ${fixes ? renderFixes(fixes) : ''}

    <details class="ats__details"${open ? raw(' open') : ''}>
      <summary>How to improve</summary>
      <ul class="ats__checks">
        ${checks.map(
          (c) => html`<li class="${c.tip ? 'is-todo' : 'is-done'}">
            <span class="ats__icon" aria-hidden="true">${c.tip ? '!' : '✓'}</span>
            <div>
              <div class="ats__check-head"><span>${c.label}</span><span class="ats__pts">${c.got}/${c.max}</span></div>
              ${c.tip ? html`<p>${c.tip}</p>` : ''}
              ${c.tip && fixes?.examples[c.id] ? html`<p class="ats__example"><b>Model:</b> ${fixes.examples[c.id]}</p>` : ''}
            </div>
          </li>`,
        )}
      </ul>
      ${notes.map((n) => html`<p class="ats__note">ℹ ${n}</p>`)}
      <p class="ats__note ats__disclaimer">Estimated from common ATS and recruiter guidelines — real systems vary.</p>
    </details>
  </section>`;
}
