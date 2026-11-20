import config from './config/index.js';
import { createApp } from './app.js';
import { authService } from './services/auth.service.js';

if (await authService.bootstrapFromEnv()) {
  console.log(`[auth] Admin account "${config.bootstrapAdmin.username}" created from ADMIN_USERNAME/ADMIN_PASSWORD.`);
} else if (!(await authService.isConfigured())) {
  console.warn('[auth] No admin account yet — run: npm run admin:set -- <username> <password>');
}

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[server] ${config.env} - http://localhost:${config.port}`);
});

const shutdown = (signal) => {
  console.log(`[server] ${signal} received, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
