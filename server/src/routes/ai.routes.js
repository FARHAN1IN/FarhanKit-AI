import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import config from '../config/index.js';
import requireAdmin from '../middlewares/auth.js';
import validateBody from '../middlewares/validate.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';
import { aiReviewSchema, aiPaymentSchema, aiDecisionSchema, aiGrantSchema, aiProviderSchema, aiAccountUpdateSchema } from '../validators/index.js';
import { aiProviderService, presetsForAdmin } from '../services/ai-providers.service.js';
import * as ai from '../services/ai.service.js';
import * as billing from '../services/ai-billing.service.js';
import { loadUser, requireUser } from '../middlewares/user-auth.js';
import { publicUser, userService } from '../services/user.service.js';

const router = Router();

const limiter = (perHour, message) =>
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: config.env === 'test' ? 1000 : perHour,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { message } },
  });

const requireAi = asyncHandler(async (_req, _res, next) => {
  if (!(await ai.isAvailable())) throw new AppError('AI review is not available.', 503);
  next();
});

/** Plan as shown to visitors. */
const publicPlan = (plan) => ({
  freeReviews: plan.freeReviews,
  currency: plan.currency,
  packages: plan.packages,
  methods: plan.methods,
  instructions: plan.instructions,
});

router.get('/status', loadUser, asyncHandler(async (req, res) => {
  if (!(await ai.isAvailable())) return res.json({ success: true, data: { available: false } });
  const plan = await billing.getPlan();
  const user = req.user;
  res.json({
    success: true,
    data: {
      available: true,
      user: publicUser(user),
      wallet: user ? await billing.balance(user, plan) : null,
      plan: publicPlan(plan),
      payments: user ? await billing.userPayments(user.id) : [],
    },
  });
}));

router.post(
  '/ats-review',
  limiter(config.ai.perHour, 'Too many AI reviews in a short time — please try again in an hour.'),
  requireAi,
  requireUser, // free reviews are counted per account
  validateBody(aiReviewSchema),
  asyncHandler(async (req, res) => {
    // Nothing to review yet → refuse before any free/paid review is used up
    if (ai.contentWords(req.body) < ai.MIN_REVIEW_WORDS) {
      throw AppError.badRequest('Your CV is almost empty — add a summary and at least one job, project or education before asking for an AI review.', { code: 'CV_TOO_SHORT' });
    }
    const ticket = await billing.reserve(req.user.id); // 402 when nothing is left
    let review;
    try {
      review = await ai.reviewCv(req.body);
    } catch (err) {
      await billing.refund(ticket); // failed reviews don't cost anything
      throw err;
    }
    const { userRepository } = await import('../repositories/index.js');
    res.json({ success: true, data: { ...review, wallet: await billing.balance(await userRepository.findById(req.user.id)) } });
  }),
);

router.post(
  '/payments',
  limiter(10, 'Too many payment submissions — please try again later.'),
  requireAi,
  requireUser,
  validateBody(aiPaymentSchema),
  asyncHandler(async (req, res) => {
    const payment = await billing.submitPayment(req.user, req.body);
    res.status(201).json({ success: true, data: { payment, payments: await billing.userPayments(req.user.id) } });
  }),
);

/* ---------- Admin: AI models (API keys) ---------- */
router.get('/providers', requireAdmin, asyncHandler(async (_req, res) => {
  res.json({ success: true, data: { providers: await aiProviderService.list(), presets: presetsForAdmin() } });
}));

router.post('/providers', requireAdmin, validateBody(aiProviderSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await aiProviderService.create(req.body) });
}));

router.patch('/providers/:id', requireAdmin, validateBody(aiProviderSchema, { partial: true }), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await aiProviderService.update(req.params.id, req.body) });
}));

router.delete('/providers/:id', requireAdmin, asyncHandler(async (req, res) => {
  await aiProviderService.remove(req.params.id);
  res.status(204).end();
}));

router.post('/providers/:id/test', requireAdmin, asyncHandler(async (req, res) => {
  const p = await aiProviderService.getForCall(req.params.id);
  if (!p) throw AppError.notFound('AI model not found');
  const result = { ...(await ai.testProvider(p)), at: new Date().toISOString() };
  await aiProviderService.saveTestResult(p.id, result);
  res.json({ success: true, data: result });
}));

router.get('/providers/:id/models', requireAdmin, asyncHandler(async (req, res) => {
  const p = await aiProviderService.getForCall(req.params.id);
  if (!p) throw AppError.notFound('AI model not found');
  res.json({ success: true, data: await ai.listModels(p) });
}));

/* ---------- Admin: approve payments, grant credits ---------- */
router.get('/payments', requireAdmin, asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await billing.listPayments() });
}));

router.patch('/payments/:id', requireAdmin, validateBody(aiDecisionSchema), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await billing.decidePayment(req.params.id, req.body.status) });
}));

router.get('/accounts', requireAdmin, asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await billing.listAccounts() });
}));

router.patch('/accounts/:id', requireAdmin, validateBody(aiAccountUpdateSchema), asyncHandler(async (req, res) => {
  if (req.body.logout) await userService.logoutUser(req.params.id);
  res.json({ success: true, data: await billing.updateAccount(req.params.id, req.body) });
}));

router.post('/accounts/logout-all', requireAdmin, asyncHandler(async (_req, res) => {
  await userService.logoutAll();
  res.json({ success: true });
}));

router.delete('/accounts/:id', requireAdmin, asyncHandler(async (req, res) => {
  await billing.deleteAccount(req.params.id);
  res.status(204).end();
}));

router.get('/accounts/stats', requireAdmin, asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await billing.accountStats() });
}));

router.post('/accounts/grant', requireAdmin, validateBody(aiGrantSchema), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await billing.grantCredits(req.body.email, req.body.credits) });
}));

export default router;
