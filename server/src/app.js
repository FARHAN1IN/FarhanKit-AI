import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import config from './config/index.js';
import apiRoutes from './routes/index.js';
import { notFound, errorHandler } from './middlewares/errorHandler.js';
import { serveUpload } from './controllers/upload.controller.js';

/** Builds the Express app (no listening) so it can be reused by tests. */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'img-src': ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : false }));
  app.use(express.json({ limit: '50kb' }));

  // API
  app.use('/api', apiRoutes);
  app.use('/api', notFound);

  // User uploads (logo, avatar, project images, résumé)
  app.get('/uploads/:name', serveUpload);

  // Frontend (static client folder)
  app.use(express.static(config.paths.client, { extensions: ['html'], maxAge: config.env === 'production' ? '1h' : 0 }));
  app.use(notFound);

  app.use(errorHandler);
  return app;
}
