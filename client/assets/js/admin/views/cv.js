import { api } from '../../services/api.js';
import { html, mount } from '../../utils/dom.js';
import { createCvBuilder } from '../../cv/builder.js';
import { fromPortfolio } from '../../cv/template.js';
import { setStatus } from '../form.js';

const portfolioCv = async () => {
  const [profile, experience, skills] = await Promise.all([api.profile(), api.experience(), api.skills()]);
  return fromPortfolio(profile, experience, skills);
};

/** Admin → My CV: simple builder with live preview; powers the site's "Download CV" button. */
export const cvView = {
  id: 'cv',
  label: 'My CV',

  async render(root, ctx) {
    const saved = await api.cvData();
    const isNew = !saved?.name;
    const data = isNew ? await portfolioCv() : saved;

    mount(
      root,
      html`<div class="cv-bar">
          <div>
            <h2>My CV</h2>
            <p>${isNew ? 'Pre-filled from your portfolio. Adjust anything, then save.' : 'Edit your CV, then save. The site’s “Download CV” button uses this.'}</p>
          </div>
          <div class="cv-bar__actions">
            <button class="btn btn--ghost btn--sm" type="button" data-refill>Refill from portfolio</button>
            <button class="btn btn--ghost btn--sm" type="button" data-save>Save</button>
            <button class="btn btn--primary btn--sm" type="button" data-download>Save &amp; download PDF</button>
            <p class="form-status" role="status"></p>
          </div>
        </div>
        <div data-builder></div>`,
    );

    const status = root.querySelector('.form-status');
    const builder = createCvBuilder(root.querySelector('[data-builder]'), {
      data,
      uploadPhoto: async (file) => (await ctx.client.upload(file)).url,
      onChange: () => setStatus(status, '', 'Unsaved changes'),
    });

    async function save() {
      const cv = builder.getData();
      if (!cv.name) {
        setStatus(status, 'error', 'Please enter your name.');
        return false;
      }
      setStatus(status, '', 'Saving…');
      try {
        await ctx.client.saveCvData(cv);
        setStatus(status, 'success', 'Saved.');
        return true;
      } catch (err) {
        if (ctx.handleAuthError(err)) return false;
        const details = Object.entries(err.details ?? {}).map(([k, m]) => `${k}: ${m}`);
        setStatus(status, 'error', [err.message, ...details].join(' — '));
        return false;
      }
    }

    root.querySelector('.cv-bar__actions').addEventListener('click', async (e) => {
      if (e.target.closest('[data-save]')) await save();

      if (e.target.closest('[data-download]')) {
        const tab = window.open('', '_blank'); // open now so pop-up blockers allow it
        const ok = await save();
        if (!ok) tab?.close();
        else if (tab) tab.location = '/cv?print=1';
        else location.href = '/cv?print=1'; // pop-ups blocked: use this tab
      }

      if (e.target.closest('[data-refill]')) {
        if (!confirm('Replace the form with the data from your portfolio (Profile, Experience, Skills)?')) return;
        builder.setData(await portfolioCv());
        setStatus(status, '', 'Refilled from portfolio — not saved yet');
      }
    });
  },
};
