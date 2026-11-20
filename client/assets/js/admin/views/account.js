import { html, mount } from '../../utils/dom.js';
import { setStatus, showErrors } from '../form.js';
import { initPasswordToggles } from '../password-toggle.js';

const passwordField = (id, name, label, autocomplete, hint = '') => html`
  <div class="field">
    <label for="${id}">${label}${hint ? html` <em class="muted">${hint}</em>` : ''}</label>
    <div class="password-field">
      <input id="${id}" name="${name}" type="password" autocomplete="${autocomplete}" maxlength="200">
      <button class="password-field__toggle" type="button" data-toggle-password="${id}" aria-controls="${id}"></button>
    </div>
    <small class="field__error" data-error-for="${name}"></small>
  </div>`;

export const accountView = {
  id: 'account',
  label: 'Account',

  async render(root, ctx) {
    const { username } = await ctx.client.me();
    mount(
      root,
      html`<form class="card form form--doc admin__account" data-scope novalidate>
        <h2>Account</h2>
        <p class="muted">Change your login username and/or password. Your current password is required. Other signed-in sessions are signed out.</p>
        <label class="field">
          <span>Username</span>
          <input name="username" value="${username}" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="40">
          <small class="field__error" data-error-for="username"></small>
        </label>
        ${passwordField('acc-new', 'newPassword', 'New password', 'new-password', '(min 8 characters — leave empty to keep)')}
        ${passwordField('acc-confirm', 'confirmPassword', 'Confirm new password', 'new-password')}
        ${passwordField('acc-current', 'currentPassword', 'Current password', 'current-password')}
        <div class="admin__form-actions">
          <button class="btn btn--primary" type="submit">Update account</button>
          <p class="form-status" role="status"></p>
        </div>
      </form>`,
    );

    const form = root.querySelector('form');
    initPasswordToggles(form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = form.querySelector('.form-status');
      const f = form.elements;
      const body = {
        currentPassword: f.currentPassword.value,
        username: f.username.value.trim(),
        newPassword: f.newPassword.value,
      };

      if (body.newPassword && body.newPassword !== f.confirmPassword.value) {
        return showErrors(form, { message: 'Validation failed', details: { confirmPassword: 'Passwords do not match' } }, status);
      }
      if (!body.currentPassword) {
        return showErrors(form, { message: 'Validation failed', details: { currentPassword: 'Enter your current password' } }, status);
      }
      if (!body.newPassword) delete body.newPassword;

      setStatus(status, '', 'Saving…');
      try {
        const res = await ctx.client.updateAccount(body);
        ctx.setUser(res.username);
        f.currentPassword.value = f.newPassword.value = f.confirmPassword.value = '';
        form.querySelectorAll('.field__error').forEach((el) => (el.textContent = ''));
        initPasswordToggles(form); // re-mask all fields
        setStatus(status, 'success', 'Account updated.');
      } catch (err) {
        if (!ctx.handleAuthError(err)) showErrors(form, err, status);
      }
    });
  },
};
