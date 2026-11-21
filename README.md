# Personal Portfolio

A full dynamic portfolio website: a **Node.js/Express REST API** and a **vanilla JS frontend** that renders every section from the API. Includes a contact form that stores messages and an **admin panel** to manage projects and read messages.

## Quick start

```bash
cd server
npm install
cp .env.example .env      # then set SESSION_SECRET to 32+ random characters
npm run admin:set -- admin "your-strong-password"   # create the admin account
npm run dev               # http://localhost:4000
```

- Site: <http://localhost:4000>
- Admin: <http://localhost:4000/admin> (sign in with your username + password)
- Tests: `npm test`

**Forgot your password?** Run `npm run admin:set -- <username> <new-password>` again. It overwrites the account and signs out every session.

## Make it yours — everything is editable from `/admin`

Nothing on the public page is hard-coded; the HTML is an empty shell filled from the API.

| Admin tab | Controls | Stored in |
| --- | --- | --- |
| **Profile** | Name, title, logo text / logo image, photo, rotating roles, tagline, about, email, location, résumé PDF, stats, social links | `profile.json` |
| **Settings** | Browser title, SEO description, favicon, accent colors, footer text, hero greeting & button labels, contact button & success message, **section order / visibility / headings / menu labels** | `settings.json` |
| **Projects** | Add / edit / delete, cover image upload, tags, category, featured, order | `projects.json` |
| **Experience** | Timeline entries (empty end = "Present") | `experience.json` |
| **Skills** | Skill groups with levels | `skills.json` |
| **Messages** | Contact form inbox | `messages.json` (gitignored) |

Uploaded files (images, PDF, max 5 MB) are stored in `server/uploads/` and served at `/uploads/…`.

### CV

There's one simple CV builder: 5 short steps (About you, Summary, Experience, Education, Skills) with a live preview. It's used in two places:

- **Admin → My CV:** your own CV, pre-filled from your portfolio and saved to `data/cv.json`. The site's **Download CV** button opens [`/cv`](client/cv.html) with the "Save as PDF" dialog. If you upload your own PDF under Profile → Résumé / CV, that file is downloaded instead, as `Your-Name-CV.pdf`.
- **Public [`/cv-maker`](client/cv-maker.html):** any visitor makes and downloads their own CV. Nothing is sent to the server; the draft is kept in their browser's localStorage.

Both are controlled under **Settings → CV download**: show or hide the button, the top-bar button and the CV Maker, and change their labels.

Code: `client/assets/js/cv/template.js` (data model + the CV design), `cv/builder.js` (form + live preview), `cv.js` and `cv-maker.js` (pages), and `admin/views/cv.js` (admin tab).

## Architecture

```
portfolio/
├── server/                     # Backend — layered architecture
│   ├── data/                   # JSON "database"
│   ├── src/
│   │   ├── config/             # Env-driven configuration
│   │   ├── routes/             # URL → middleware → controller wiring (crudRouter / documentRouter factories)
│   │   ├── controllers/        # HTTP layer (generic CRUD + document controller factories)
│   │   ├── services/           # Business logic (collection + document service factories)
│   │   ├── repositories/       # Data access (atomic JSON file storage)
│   │   ├── middlewares/        # Auth, validation, error handling
│   │   ├── validators/         # Request schemas
│   │   ├── utils/              # AppError, asyncHandler
│   │   ├── app.js              # Express app factory (testable)
│   │   └── server.js           # Entry point / graceful shutdown
│   └── tests/                  # node:test integration tests
└── client/                     # Frontend — no build step
    ├── index.html              # Public site shell
    ├── admin.html              # Admin panel
    └── assets/
        ├── css/                # variables → base → layout → components
        ├── img/
        └── js/
            ├── config.js       # API base URL
            ├── services/       # API client (all fetch calls live here)
            ├── core/           # Theme, scroll-reveal
            ├── utils/          # Safe HTML templating, icons
            ├── components/     # One module per page section
            ├── admin/          # Admin panel: main.js, form.js (form toolkit), views/
            └── main.js         # Bootstraps the page
```

**Request flow:** `route → middleware (auth/validate) → controller → service → repository → data/*.json`

Each layer only talks to the one below it. To move to a real database (MongoDB, PostgreSQL…), write a new repository class with the same methods (`findAll`, `findById`, `create`, `update`, `remove`, `getDocument`, `saveDocument`) and swap it in `src/repositories/index.js`. Nothing else changes.

## API

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | — | Health check |
| GET / PUT | `/api/profile` | PUT: Admin | Profile |
| GET / PUT | `/api/settings` | PUT: Admin | Site settings |
| GET / POST / PATCH / DELETE | `/api/skills[/:id]` | writes: Admin | Skill groups |
| GET / POST / PATCH / DELETE | `/api/experience[/:id]` | writes: Admin | Timeline (current first) |
| POST | `/api/uploads` | Admin | Upload image/PDF (multipart field `file`) |
| GET | `/api/cv` | — | Downloads the uploaded CV as `<Name>-CV.pdf` (404 if none) |
| GET / PUT | `/api/cv/data` | PUT: Admin | CV builder data (My CV) |
| GET | `/api/projects?category=&tag=&featured=` | — | Projects, filterable |
| GET | `/api/projects/categories` | — | Distinct categories |
| GET | `/api/projects/:id` | — | One project |
| POST | `/api/projects` | Admin | Create project |
| PATCH | `/api/projects/:id` | Admin | Update project |
| DELETE | `/api/projects/:id` | Admin | Delete project |
| POST | `/api/contact` | — (rate-limited 5/15 min) | Send a message |
| GET | `/api/contact/messages` | Admin | List messages |
| PATCH | `/api/contact/messages/:id` | Admin | Mark read/unread |
| DELETE | `/api/contact/messages/:id` | Admin | Delete message |

| POST | `/api/auth/login` | — (rate-limited) | `{ username, password }` → sets session cookie |
| POST | `/api/auth/logout` | — | Clears the session cookie |
| GET | `/api/auth/me` | Admin | Current username |
| PUT | `/api/auth/account` | Admin | `{ currentPassword, username?, newPassword? }` |

Admin = a valid session cookie from `/api/auth/login`.

## Security notes

- Helmet security headers + strict Content-Security-Policy (no inline scripts)
- All dynamic text is HTML-escaped on render; URLs are scheme-checked
- Request validation on every write, 50 KB body limit, rate-limited contact form + honeypot field
- Admin login: password stored as a salted **scrypt** hash (`data/admin.json`, gitignored), never in plain text
- Sessions: HMAC-signed token in an **HttpOnly, SameSite=Strict** cookie (Secure in production) that expires after `SESSION_TTL_HOURS` (default 2). Changing the username or password revokes all sessions
- Login is rate-limited (10 failed attempts / 15 min / IP), and unknown usernames take as long as wrong passwords
- `/admin` always starts signed out
- For production: use HTTPS, set a strong `SESSION_SECRET`, and set `NODE_ENV=production`

## Deploy for free (Render + MongoDB Atlas)

Render's free plan wipes the disk on every restart, so online the site stores its data and
uploaded images in a free MongoDB Atlas database (set `MONGODB_URI`). On first start the database
is filled with the content committed in `server/data` and `server/uploads`.

1. **MongoDB Atlas** (https://www.mongodb.com/cloud/atlas/register) → create a free **M0** cluster.
   - *Database Access*: add a user + password.
   - *Network Access*: allow `0.0.0.0/0` (Render's free plan has no fixed IP).
   - *Connect → Drivers*: copy the `mongodb+srv://…` string, insert the password and add a database
     name before `?`, e.g. `…mongodb.net/farhankit?retryWrites=true&w=majority`.
2. **Render** (https://render.com, sign in with GitHub) → **New → Blueprint** → choose this repo.
   Fill in `MONGODB_URI`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` (and optionally `GEMINI_API_KEY`).
3. Open `https://<your-service>.onrender.com` — admin at `/admin`.

Notes: the free instance sleeps after 15 minutes without visitors (the next visit takes ~30–50 s).
Add more free AI keys (`GROQ_API_KEY`, `OPENROUTER_API_KEY`) under the service's *Environment* tab.
After the first start you can delete `ADMIN_PASSWORD` there and change the password in admin → Account.

## AI models for the ATS review

Admin → **AI models**: add any number of AI providers with their API keys — Google Gemini, Groq,
OpenRouter (all have free keys), a local Ollama, or any other OpenAI-compatible API by URL.
Every model that is switched on reviews each CV and the results are merged (average score,
combined tips). Keys are stored encrypted (AES-256-GCM, derived from `SESSION_SECRET`) and are
never sent back to the browser — only their last 4 characters are shown. **Test** checks a key
right away. If `SESSION_SECRET` ever changes, saved keys must be entered again.
Keys set as environment variables (`GEMINI_API_KEY`, …) still work and are listed read-only.
