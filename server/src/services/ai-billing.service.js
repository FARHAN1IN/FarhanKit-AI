/**
 * AI review billing per ACCOUNT: each signed-up visitor gets the free reviews set in admin,
 * then buys packages by manual payment (bank / mobile wallet) that the admin approves.
 *
 * Tied to the account (not the browser), so incognito windows, VPNs or other devices don't
 * reset free reviews — and paid credits follow the person everywhere.
 */
import AppError from '../utils/AppError.js';
import { userRepository, aiPaymentRepository } from '../repositories/index.js';
import { settingsService } from './index.js';
import { canonicalEmail } from './user.service.js';

/* Serialize read-modify-write operations so parallel requests can't double-spend. */
let lock = Promise.resolve();
const exclusive = (fn) => {
  const run = lock.then(fn, fn);
  lock = run.catch(() => {});
  return run;
};

export async function getPlan() {
  return (await settingsService.get()).aiPlan;
}

/** What the signed-in visitor can still use. */
export async function balance(user, plan) {
  plan ??= await getPlan();
  return {
    email: user.email,
    freeLeft: Math.max(0, plan.freeReviews - (user.freeUsed ?? 0)),
    freeTotal: plan.freeReviews,
    credits: user.credits ?? 0,
  };
}

/** Takes one review from the account (free first, then paid). Returns a ticket for refund(). */
export function reserve(userId) {
  return exclusive(async () => {
    const plan = await getPlan();
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError('Please log in again.', 401, { code: 'LOGIN_REQUIRED' });
    const { freeLeft } = await balance(user, plan);
    if (freeLeft > 0) {
      await userRepository.update(user.id, { freeUsed: (user.freeUsed ?? 0) + 1 });
      return { userId, kind: 'free' };
    }
    if ((user.credits ?? 0) > 0) {
      await userRepository.update(user.id, { credits: user.credits - 1 });
      return { userId, kind: 'paid' };
    }
    throw new AppError('You have used all your free AI reviews. Buy more reviews to continue.', 402, { code: 'NO_CREDITS' });
  });
}

/** Gives the review back if the AI call failed. */
export function refund(ticket) {
  return exclusive(async () => {
    const user = await userRepository.findById(ticket.userId);
    if (!user) return;
    if (ticket.kind === 'free') await userRepository.update(user.id, { freeUsed: Math.max(0, (user.freeUsed ?? 0) - 1) });
    else await userRepository.update(user.id, { credits: (user.credits ?? 0) + 1 });
  });
}

/* ---------------- Payments ---------------- */

const publicPayment = (p) => ({
  id: p.id, packageName: p.packageName, credits: p.credits, price: p.price, currency: p.currency,
  method: p.method, transactionId: p.transactionId, status: p.status, createdAt: p.createdAt,
});

export async function userPayments(userId) {
  return (await aiPaymentRepository.findAll())
    .filter((p) => p.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)
    .map(publicPayment);
}

export async function submitPayment(user, { packageIndex, method, transactionId, sender }) {
  const plan = await getPlan();
  const pkg = plan.packages[packageIndex];
  if (!pkg) throw AppError.badRequest('Please choose a package.');
  if (plan.methods.length && !plan.methods.some((m) => m.name === method)) throw AppError.badRequest('Please choose a payment method.');

  const all = await aiPaymentRepository.findAll();
  if (all.filter((p) => p.userId === user.id && p.status === 'pending').length >= 3) {
    throw new AppError('You already have 3 payments waiting for approval — please wait until they are checked.', 429);
  }
  const tx = transactionId.trim();
  if (all.some((p) => p.transactionId.toLowerCase() === tx.toLowerCase() && p.status !== 'rejected')) {
    throw new AppError('This transaction ID was already submitted.', 409);
  }

  const payment = await aiPaymentRepository.create({
    userId: user.id,
    userEmail: user.email,
    packageName: pkg.name,
    credits: pkg.credits,
    price: pkg.price,
    currency: plan.currency,
    method: method || '',
    transactionId: tx,
    sender: sender?.trim() ?? '',
    status: 'pending',
  });
  return publicPayment(payment);
}

/* ---------------- Admin ---------------- */

export async function listPayments() {
  const order = { pending: 0, approved: 1, rejected: 2 };
  return (await aiPaymentRepository.findAll()).sort(
    (a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt),
  );
}

export function decidePayment(id, status) {
  return exclusive(async () => {
    const payment = await aiPaymentRepository.findById(id);
    if (!payment) throw AppError.notFound('Payment not found');
    if (payment.status !== 'pending') throw AppError.badRequest(`This payment was already ${payment.status}.`);
    if (status === 'approved') {
      const user = payment.userId && (await userRepository.findById(payment.userId));
      if (!user) throw AppError.notFound('This payment is not linked to an existing account — add the reviews with “Give reviews by email”.');
      await userRepository.update(user.id, { credits: (user.credits ?? 0) + payment.credits });
    }
    return aiPaymentRepository.update(id, { status, decidedAt: new Date().toISOString() });
  });
}

/** Adds (or removes, with a negative number) reviews by account email — for payments agreed outside the site. */
export function grantCredits(email, credits) {
  return exclusive(async () => {
    const canonical = canonicalEmail(email);
    const user = (await userRepository.findAll()).find((u) => u.canonicalEmail === canonical);
    if (!user) throw AppError.notFound('No account with that email.');
    const updated = await userRepository.update(user.id, { credits: Math.max(0, (user.credits ?? 0) + credits) });
    return { email: updated.email, credits: updated.credits, freeUsed: updated.freeUsed };
  });
}

/** Small overview for the admin. */
export async function accountStats() {
  const users = await userRepository.findAll();
  return { accounts: users.length, withCredits: users.filter((u) => (u.credits ?? 0) > 0).length };
}

/* ---------------- Admin: users list ---------------- */

/** Every visitor account with its review balance and payment summary (newest first). */
export async function listAccounts() {
  const [users, payments, plan] = await Promise.all([userRepository.findAll(), aiPaymentRepository.findAll(), getPlan()]);
  return users
    .map((u) => {
      const own = payments.filter((p) => p.userId === u.id);
      const approved = own.filter((p) => p.status === 'approved');
      const spent = {};
      approved.forEach((p) => { spent[p.currency] = (spent[p.currency] ?? 0) + Number(p.price); });
      return {
        id: u.id,
        email: u.email,
        name: u.name ?? '',
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt ?? null,
        freeUsed: u.freeUsed ?? 0,
        freeLeft: Math.max(0, plan.freeReviews - (u.freeUsed ?? 0)),
        freeTotal: plan.freeReviews,
        credits: u.credits ?? 0,
        payments: { approved: approved.length, pending: own.filter((p) => p.status === 'pending').length, spent },
      };
    })
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

/** Admin changes to one account: add/remove paid reviews and/or give the free reviews back. */
export function updateAccount(id, { addCredits = 0, resetFree = false }) {
  return exclusive(async () => {
    const user = await userRepository.findById(id);
    if (!user) throw AppError.notFound('Account not found');
    const patch = {};
    if (addCredits) patch.credits = Math.max(0, (user.credits ?? 0) + addCredits);
    if (resetFree) patch.freeUsed = 0;
    await userRepository.update(id, patch);
    return (await listAccounts()).find((a) => a.id === id);
  });
}

/** Deletes a visitor account (their payment history stays, with the email). */
export async function deleteAccount(id) {
  if (!(await userRepository.remove(id))) throw AppError.notFound('Account not found');
}
