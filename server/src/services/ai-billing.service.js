/**
 * AI review billing: free reviews per visitor + paid credits bought by manual payment.
 *
 * Visitors have no account. Each browser gets a "wallet" (random id in an HttpOnly cookie)
 * holding { freeUsed, credits, code }. Free reviews are also capped per IP address so
 * clearing the browser can't reset them forever.
 *
 * Paying: visitor picks a package, pays you outside the site (bank / mobile wallet),
 * submits the transaction id → payment is "pending" → admin approves → credits are added.
 */
import { createHash, randomBytes } from 'node:crypto';
import config from '../config/index.js';
import AppError from '../utils/AppError.js';
import { parseCookies } from '../utils/cookies.js';
import { aiWalletRepository, aiPaymentRepository, aiIpUsageRepository } from '../repositories/index.js';
import { settingsService } from './index.js';

export const WALLET_COOKIE = 'cv_ai_wallet';
const IP_FACTOR = 2; // an IP (home/office network) may use up to 2× the free reviews

/* Serialize read-modify-write operations so parallel requests can't double-spend. */
let lock = Promise.resolve();
const exclusive = (fn) => {
  const run = lock.then(fn, fn);
  lock = run.catch(() => {});
  return run;
};

const ipKey = (req) => createHash('sha256').update(`${req.ip}|${config.session.secret}`).digest('hex').slice(0, 32);
const newCode = () => randomBytes(5).toString('hex').toUpperCase().slice(0, 8);

export async function getPlan() {
  return (await settingsService.get()).aiPlan;
}

/** Finds the visitor's wallet from the cookie, or creates one (and sets the cookie). */
export async function getWallet(req, res) {
  const id = parseCookies(req.headers.cookie)[WALLET_COOKIE];
  const existing = id && (await aiWalletRepository.findById(id));
  if (existing) return existing;

  const wallet = await aiWalletRepository.create({ code: newCode(), freeUsed: 0, credits: 0 });
  res.cookie(WALLET_COOKIE, wallet.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.env === 'production',
    path: '/api',
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
  return wallet;
}

async function ipUsed(req) {
  return (await aiIpUsageRepository.getDocument())[ipKey(req)] ?? 0;
}

async function bumpIp(req, delta) {
  const doc = await aiIpUsageRepository.getDocument();
  const k = ipKey(req);
  doc[k] = Math.max(0, (doc[k] ?? 0) + delta);
  await aiIpUsageRepository.saveDocument(doc);
}

/** What the visitor can still use. */
export async function balance(wallet, req, plan) {
  plan ??= await getPlan();
  const free = Math.max(0, Math.min(plan.freeReviews - wallet.freeUsed, plan.freeReviews * IP_FACTOR - (await ipUsed(req))));
  return { code: wallet.code, freeLeft: free, freeTotal: plan.freeReviews, credits: wallet.credits };
}

/** Takes one review from the wallet (free first, then paid). Returns a ticket for refund(). */
export function reserve(walletId, req) {
  return exclusive(async () => {
    const plan = await getPlan();
    const wallet = await aiWalletRepository.findById(walletId);
    const { freeLeft } = await balance(wallet, req, plan);
    if (freeLeft > 0) {
      await aiWalletRepository.update(wallet.id, { freeUsed: wallet.freeUsed + 1 });
      await bumpIp(req, 1);
      return { walletId, kind: 'free' };
    }
    if (wallet.credits > 0) {
      await aiWalletRepository.update(wallet.id, { credits: wallet.credits - 1 });
      return { walletId, kind: 'paid' };
    }
    throw new AppError('You have used all your free AI reviews. Buy more reviews to continue.', 402, { code: 'NO_CREDITS' });
  });
}

/** Gives the review back if the AI call failed. */
export function refund(ticket, req) {
  return exclusive(async () => {
    const wallet = await aiWalletRepository.findById(ticket.walletId);
    if (!wallet) return;
    if (ticket.kind === 'free') {
      await aiWalletRepository.update(wallet.id, { freeUsed: Math.max(0, wallet.freeUsed - 1) });
      await bumpIp(req, -1);
    } else {
      await aiWalletRepository.update(wallet.id, { credits: wallet.credits + 1 });
    }
  });
}

/* ---------------- Payments ---------------- */

const publicPayment = (p) => ({
  id: p.id, packageName: p.packageName, credits: p.credits, price: p.price, currency: p.currency,
  method: p.method, transactionId: p.transactionId, status: p.status, createdAt: p.createdAt,
});

export async function walletPayments(walletId) {
  return (await aiPaymentRepository.findAll())
    .filter((p) => p.walletId === walletId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)
    .map(publicPayment);
}

export async function submitPayment(wallet, { packageIndex, method, transactionId, sender }) {
  const plan = await getPlan();
  const pkg = plan.packages[packageIndex];
  if (!pkg) throw AppError.badRequest('Please choose a package.');
  if (plan.methods.length && !plan.methods.some((m) => m.name === method)) throw AppError.badRequest('Please choose a payment method.');

  const all = await aiPaymentRepository.findAll();
  if (all.filter((p) => p.walletId === wallet.id && p.status === 'pending').length >= 3) {
    throw new AppError('You already have 3 payments waiting for approval — please wait until they are checked.', 429);
  }
  const tx = transactionId.trim();
  if (all.some((p) => p.transactionId.toLowerCase() === tx.toLowerCase() && p.status !== 'rejected')) {
    throw new AppError('This transaction ID was already submitted.', 409);
  }

  const payment = await aiPaymentRepository.create({
    walletId: wallet.id,
    walletCode: wallet.code,
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
      const wallet = await aiWalletRepository.findById(payment.walletId);
      if (!wallet) throw AppError.notFound('The visitor’s wallet no longer exists.');
      await aiWalletRepository.update(wallet.id, { credits: wallet.credits + payment.credits });
    }
    return aiPaymentRepository.update(id, { status, decidedAt: new Date().toISOString() });
  });
}

/** Adds (or removes, with a negative number) credits by wallet code — for payments agreed outside the site. */
export function grantCredits(code, credits) {
  return exclusive(async () => {
    const wallet = (await aiWalletRepository.findAll()).find((w) => w.code === code.trim().toUpperCase());
    if (!wallet) throw AppError.notFound('No visitor with that wallet code.');
    const updated = await aiWalletRepository.update(wallet.id, { credits: Math.max(0, wallet.credits + credits) });
    return { code: updated.code, credits: updated.credits, freeUsed: updated.freeUsed };
  });
}
