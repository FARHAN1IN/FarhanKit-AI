import { Router } from 'express';
import requireAdmin from '../middlewares/auth.js';
import validateBody from '../middlewares/validate.js';

/** Public reads + admin writes for a collection resource. */
export function crudRouter(controller, schema, { router = Router() } = {}) {
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.post('/', requireAdmin, validateBody(schema), controller.create);
  router.patch('/:id', requireAdmin, validateBody(schema, { partial: true }), controller.update);
  router.delete('/:id', requireAdmin, controller.remove);
  return router;
}

/** Public read + admin full replace for a single-document resource. */
export function documentRouter(controller, schema) {
  const router = Router();
  router.get('/', controller.get);
  router.put('/', requireAdmin, validateBody(schema), controller.replace);
  return router;
}
