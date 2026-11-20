/**
 * Create or reset the admin account.
 *   npm run admin:set -- <username> <password>
 */
import { authService } from '../src/services/auth.service.js';

const [username, password] = process.argv.slice(2);

if (!username || !password) {
  console.error('Usage: npm run admin:set -- <username> <password>');
  process.exit(1);
}
if (!/^[a-zA-Z0-9._@-]{3,40}$/.test(username)) {
  console.error('Username must be 3–40 characters: letters, numbers, . _ @ -');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

await authService.setCredentials(username, password);
console.log(`Admin account "${username}" saved. All existing sessions have been signed out.`);
