import { html, mount, raw } from '../../utils/dom.js';
import { setStatus, showErrors } from '../form.js';
import { initPasswordToggles } from '../password-toggle.js';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : '');

/** Admin → AI models: the AI providers (and their API keys) used for the ATS AI review. */
export const aiModelsView = {
  id: 'ai-models',
  label: 'AI models',

  async render(root, ctx) {
    let presets = [];
    let providers = [];
    let editing = null; // provider being edited, or null for "add new"
    let newType = 'gemini'; // provider chosen in the "add" form

    const presetOf = (type) => presets.find((p) => p.type === type) ?? presets[0];

    const testLine = (t, id) =>
      t
        ? html`<p class="ai-test ${t.ok ? 'is-ok' : 'is-bad'}">${t.ok ? `✓ Working — answered in ${(t.ms / 1000).toFixed(1)} s` : `✕ ${t.error}`}
            <small>· tested ${fmtDate(t.at)}</small></p>
            ${!t.ok && id
              ? html`<div class="ai-fix">
                  ${t.suggestedModel ? html`<button class="btn btn--primary btn--sm" type="button" data-use-model="${id}" data-model="${t.suggestedModel}">Use ${t.suggestedModel}</button>` : ''}
                  ${/HTTP 404|HTTP 400/.test(t.error) ? html`<button class="btn btn--ghost btn--sm" type="button" data-pick-model="${id}">Pick a model from the provider</button>` : ''}
                </div>`
              : ''}`
        : '';

    let modelChoices = null; // models loaded from the provider for the edit form
    let modelsMsg = '';

    /** "Models your key can use": a button, then a dropdown filled from the provider. */
    const pickerInner = () => html`<span>Models your key can use</span>
      ${modelChoices?.length
        ? html`<select data-model-choice>
            <option value="">— choose a model (${modelChoices.length} found) —</option>
            ${modelChoices.map((m) => html`<option${m === editing?.model ? raw(' selected') : ''}>${m}</option>`)}
          </select>`
        : html`<button class="btn btn--ghost" type="button" data-load-models>Load models from provider</button>`}
      ${modelsMsg ? html`<small class="muted">${modelsMsg}</small>` : ''}`;

    async function loadModels() {
      const box = () => root.querySelector('[data-model-picker]');
      if (!editing || !box()) return;
      modelsMsg = 'Asking the provider…';
      mount(box(), pickerInner());
      try {
        modelChoices = await ctx.client.aiProviderModels(editing.id);
        modelsMsg = modelChoices.length
          ? 'Pick one, then “Save changes”. Names with “flash”, “mini” or “instant” are usually fast and free-tier friendly.'
          : 'The provider returned no chat models — type the model name above.';
      } catch (err) {
        modelChoices = null;
        modelsMsg = `Couldn’t load models: ${err.message}`;
      }
      if (box()) mount(box(), pickerInner());
    }

    const formMarkup = () => {
      const p = editing ?? {};
      const type = p.type ?? newType;
      const preset = presetOf(type);
      // URL is only needed for custom/local providers (or an edited model that already uses a non-default URL)
      const showUrl = type === 'custom' || type === 'ollama' || Boolean(editing && editing.baseUrl !== preset?.baseUrl);
      return html`<form class="card form" data-provider-form data-scope novalidate>
        <h3>${editing ? `Edit “${editing.label}”` : 'Add an AI model'}</h3>
        <div class="form__grid">
          <label class="field"><span>Provider</span>
            <select name="type"${editing ? raw(' disabled') : ''}>${presets.map(
              (x) => html`<option value="${x.type}"${x.type === type ? raw(' selected') : ''}>${x.label}</option>`,
            )}</select>
            ${preset?.keyUrl ? html`<small class="muted">Free key: <a class="link" href="${preset.keyUrl}" target="_blank" rel="noopener">${preset.keyUrl.replace(/^https?:\/\//, '')} ↗</a></small>` : ''}
          </label>
          <label class="field"><span>Name <em class="muted">(shown to visitors in the review)</em></span>
            <input name="label" maxlength="60" value="${p.label ?? ''}" placeholder="${preset?.label ?? ''}">
          </label>
          <div class="field field--wide"><span>API key ${preset?.needsKey ? html`<span class="req">*</span>` : html`<em class="muted">(optional)</em>`}
              ${editing?.keyHint ? html`<em class="muted"> — saved: ${editing.keyHint}. Leave empty to keep it.</em>` : ''}</span>
            <div class="password-field">
              <input id="ai-key-input" name="apiKey" type="password" autocomplete="off" maxlength="400" placeholder="${editing?.keyHint ? 'Leave empty to keep the saved key' : 'Paste your API key'}">
              <button class="password-field__toggle" type="button" data-toggle-password="ai-key-input" aria-controls="ai-key-input"></button>
            </div>
            <small class="field__error" data-error-for="apiKey"></small>
          </div>
          <label class="field"><span>Model</span>
            <input name="model" maxlength="150" value="${p.model ?? ''}" placeholder="${preset?.model || 'e.g. gpt-4o-mini'}">
            <small class="muted">Leave empty for the default${preset?.model ? ` (${preset.model})` : ''}.</small>
            <small class="field__error" data-error-for="model"></small>
          </label>
          ${editing && editing.source === 'admin' ? html`<div class="field" data-model-picker>${pickerInner()}</div>` : ''}
          <label class="field"${showUrl ? '' : raw(' hidden')} data-url-field><span>API URL <em class="muted">(OpenAI-compatible, ends before /chat/completions)</em></span>
            <input name="baseUrl" maxlength="300" value="${p.baseUrl ?? ''}" placeholder="${preset?.baseUrl || 'https://api.example.com/v1'}">
            <small class="field__error" data-error-for="baseUrl"></small>
          </label>
          <label class="field field--check field--wide"><input type="checkbox" name="enabled"${p.enabled === false ? '' : raw(' checked')}> Use this model for AI reviews</label>
        </div>
        <div class="admin__form-actions">
          <button class="btn btn--primary" type="submit">${editing ? 'Save changes' : 'Add model'}</button>
          ${editing ? html`<button class="btn btn--ghost" type="button" data-cancel>Cancel</button>` : ''}
          <p class="form-status"></p>
        </div>
      </form>`;
    };

    const listMarkup = () =>
      providers.length
        ? html`<div class="admin__list">${providers.map(
            (p) => html`<article class="card admin-item${p.enabled ? '' : ' is-off'}">
              <div class="admin-item__head">
                <div>
                  <h3>${p.label} ${p.enabled ? html`<span class="tag tag--accent">On</span>` : html`<span class="tag">Off</span>`}</h3>
                  <small>${presetOf(p.type)?.label ?? p.type} · ${p.model}${p.keyHint ? ` · key ${p.keyHint}` : ''}${p.source === 'env' ? ' · set in server .env / Render' : ''}</small>
                </div>
                <div class="admin-item__actions">
                  <button class="btn btn--ghost btn--sm" type="button" data-test="${p.id}">Test</button>
                  ${p.source === 'admin'
                    ? html`<button class="btn btn--ghost btn--sm" type="button" data-toggle-on="${p.id}">${p.enabled ? 'Turn off' : 'Turn on'}</button>
                        <button class="btn btn--ghost btn--sm" type="button" data-edit="${p.id}">Edit</button>
                        <button class="btn btn--danger btn--sm" type="button" data-delete="${p.id}">Delete</button>`
                    : ''}
                </div>
              </div>
              ${p.keyProblem ? html`<p class="ai-test is-bad">${p.keyProblem}</p>` : ''}
              <div data-test-result="${p.id}">${testLine(p.lastTest, p.source === 'admin' ? p.id : null)}</div>
            </article>`,
          )}</div>`
        : html`<p class="empty">No AI models yet — add one above. Gemini and Groq give free keys in a minute.</p>`;

    const render = () => {
      const active = providers.filter((p) => p.enabled).length;
      mount(root, html`
        <div class="cv-bar">
          <div>
            <h2>AI models</h2>
            <p>${active
              ? `${active} model${active > 1 ? 's' : ''} on — every model that is on reviews each CV and the results are merged.`
              : 'No model is on — the “AI review” button is hidden from visitors.'}</p>
          </div>
        </div>
        ${formMarkup()}
        <h3 class="ai-list-title">Your models</h3>
        ${listMarkup()}
        <p class="form__note">API keys are stored encrypted and are never shown again after saving. Prices and free reviews are under Settings → “AI review — free &amp; paid”.</p>
      `);
      initPasswordToggles(root);
    };

    const load = async () => {
      ({ providers, presets } = await ctx.client.aiProviders());
    };

    // Provider changed in the "add" form → redraw it with that provider's defaults and hints.
    root.onchange = (e) => {
      if (e.target.matches('[data-model-choice]')) {
        if (e.target.value) e.target.form.model.value = e.target.value; // fill the Model field
        return;
      }
      if (e.target.name !== 'type' || editing) return;
      newType = e.target.value;
      render();
    };

    root.onsubmit = async (e) => {
      if (!e.target.matches('[data-provider-form]')) return;
      e.preventDefault();
      const form = e.target;
      const status = form.querySelector('.form-status');
      const body = {
        type: editing?.type ?? form.type.value,
        label: form.label.value.trim(),
        model: form.model.value.trim(),
        baseUrl: form.baseUrl.value.trim(),
        apiKey: form.apiKey.value.trim(),
        enabled: form.enabled.checked,
      };
      form.querySelectorAll('[data-error-for]').forEach((el) => { el.textContent = ''; });
      setStatus(status, '', 'Saving…');
      try {
        const saved = editing ? await ctx.client.updateAiProvider(editing.id, body) : await ctx.client.createAiProvider(body);
        editing = null;
        newType = 'gemini';
        await load();
        render();
        // test the new/changed model right away
        await runTest(saved.id);
      } catch (err) {
        if (err.status === 401) return ctx.handleAuthError(err);
        showErrors(form, err, status);
      }
    };

    async function runTest(id) {
      const box = root.querySelector(`[data-test-result="${id}"]`);
      if (box) mount(box, html`<p class="ai-test">Testing…</p>`);
      try {
        const result = await ctx.client.testAiProvider(id);
        const p = providers.find((x) => x.id === id);
        if (p) p.lastTest = result;
        if (box) mount(box, testLine(result, p?.source === 'admin' ? id : null));
      } catch (err) {
        ctx.handleError(err);
      }
    }

    root.onclick = async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      try {
        if (t.dataset.test) return runTest(t.dataset.test);
        if (t.dataset.useModel) {
          // one click: switch to the model the provider suggested, then re-test
          const p = providers.find((x) => x.id === t.dataset.useModel);
          await ctx.client.updateAiProvider(p.id, { type: p.type, model: t.dataset.model });
          await load();
          render();
          return runTest(p.id);
        }
        if (t.hasAttribute('data-load-models')) return loadModels();
        if (t.dataset.pickModel || t.dataset.edit) {
          editing = providers.find((p) => p.id === (t.dataset.pickModel || t.dataset.edit));
          modelChoices = null;
          modelsMsg = '';
          render();
          if (t.dataset.pickModel) await loadModels();
          root.querySelector('[data-provider-form]').scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        if (t.hasAttribute('data-cancel')) {
          editing = null;
          return render();
        }
        if (t.dataset.toggleOn) {
          const p = providers.find((x) => x.id === t.dataset.toggleOn);
          await ctx.client.updateAiProvider(p.id, { type: p.type, enabled: !p.enabled });
        } else if (t.dataset.delete) {
          if (!confirm('Delete this AI model and its saved key?')) return;
          await ctx.client.deleteAiProvider(t.dataset.delete);
          if (editing?.id === t.dataset.delete) editing = null;
        } else return;
        await load();
        render();
      } catch (err) {
        ctx.handleError(err);
      }
    };

    await load();
    render();
  },
};
