import { Router } from 'express';
import requireAdmin from '../middlewares/auth.js';
import { uploadSingle } from '../middlewares/upload.js';
import { uploadFile } from '../controllers/upload.controller.js';

const router = Router();

router.post('/', requireAdmin, uploadSingle, uploadFile);

export default router;
