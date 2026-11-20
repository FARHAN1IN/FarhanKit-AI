import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import config from '../config/index.js';
import requireAdmin from '../middlewares/auth.js';
import validateBody from '../middlewares/validate.js';
import { contactSchema } from '../validators/index.js';
import * as ctrl from '../controllers/contact.controller.js';

const router = Router();

// Anti-spam: 5 messages per IP per 15 minutes
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.env === 'test' ? 1000 : 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many messages, please try again later.' } },
});

router.post('/', contactLimiter, validateBody(contactSchema), ctrl.submitMessage);

// Admin inbox
router.get('/messages', requireAdmin, ctrl.listMessages);
router.patch('/messages/:id', requireAdmin, ctrl.markMessageRead);
router.delete('/messages/:id', requireAdmin, ctrl.deleteMessage);

export default router;
