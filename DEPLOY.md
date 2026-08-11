# Deploying Pack Group to pack.com.na (Namhost cPanel)

This is a Node.js/Express app serving both the public site (the
HTML/CSS/JS files) and the admin dashboard, backed by a single SQLite
file (`db/pack.db`) read through `sql.js` — pure JavaScript, no native
compilation, so it installs cleanly on Namhost shared hosting.

**Project layout on the server — everything lives in ONE flat folder:**

```
pack-group-website/          <- cPanel "Application root" points HERE
├── index.html, real-estate.html, ...   <- public site, served as static files
├── assets/
├── shared.css, shared.js
├── app.js                   <- Passenger "Application startup file"
├── server.js
├── package.json
└── db/pack.db               <- the live database (NOT committed to git)
```

`server.js` resolves the public site as `path.join(__dirname, "./")` —
i.e. the _same_ folder `server.js` itself lives in. This only applies to
the deployed server: locally in this repo, `backend/` stays a nested
subfolder (nothing here needs to move on your machine) — the flat
layout only has to exist once the files land on cPanel.

Because everything sits in one folder, `server.js` also blocks direct
public access to every internal-only entry at that top level (`db/`,
`routes/`, `middleware/`, `views/`, `node_modules/`, `server.js`,
`app.js`, `package.json`, `package-lock.json`, `.env`, `.env.production`,
`.gitignore`, `README.md`) — otherwise `GET /db/pack.db` would serve the
database (with the admin password hash) to anyone. This is already
verified working locally against a flat copy of the project.

---

## STEP 1 — cPanel: Setup Node.js App

- Log into cPanel → **Setup Node.js App**
- Create new application:
  - **Node.js version**: highest available (18.x+)
  - **Application mode**: Production
  - **Application root**: wherever you upload the project, e.g.
    `pack-group-website` — the SAME folder that will contain `index.html`
  - **Application URL**: `pack.com.na`
  - **Application startup file**: `app.js`
- Click Create — note the path to the virtual environment it creates
  (you'll see a line like `source /home/youruser/nodevenv/.../bin/activate`
  in the app's "how to run" instructions — you don't need to run this
  yourself, cPanel's buttons below do it for you)

## STEP 2 — Upload files

- Two zips: one with the public site files (`index.html`, `assets/`,
  `shared.css`/`.js`, etc.), one with the backend (`server.js`, `app.js`,
  `routes/`, `db/`, `views/`, `middleware/`, `package.json` — excluding
  `node_modules/`, `.env`, `.env.production`; whether `db/pack.db` and
  `public/uploads/` are included depends on whether this is a fresh
  install or you're bringing existing data, see Step 5)
- Upload both zips via cPanel File Manager to the SAME destination
  folder (e.g. your home directory or wherever the Application root
  points)
- Extract **both zips into that same folder** — since each zip's files
  sit at its own root, extracting both there merges them into the flat
  layout shown above (`index.html` and `server.js` end up as siblings).
  Do not extract the backend zip into a `backend/` subfolder.

## STEP 3 — Set environment variables

- In **Setup Node.js App**, open the app you created, find **Environment
  Variables**
- Add each of these (see `backend/.env.production` locally for a
  reference of the keys — generate your own `SESSION_SECRET`, don't
  reuse a value that has ever been committed anywhere):
  - `NODE_ENV=production`
  - `SESSION_SECRET=` — a long random string (e.g. `openssl rand -hex 32`)
  - `ADMIN_EMAIL=` — the client's chosen admin login email
  - `ADMIN_PASSWORD=` — a strong password, changed after first login
  - `PORT=3000` (Passenger overrides this internally, but the app reads
    `process.env.PORT` so it's harmless to set)
- Do not upload `.env` or `.env.production` — set secrets only through
  this UI

## STEP 4 — Install dependencies

- In **Setup Node.js App**, click **Run NPM Install**
- This runs `npm install` inside the Application root, using Passenger's
  own virtual environment — not your local `node_modules`
- Should complete cleanly: `sql.js` and `better-sqlite3-session-store`
  are both pure JavaScript, nothing here needs compiling

## STEP 5 — Database

**If this is a fresh install with no existing `pack.db`:**

- Use **Run JS Script** in Setup Node.js App, or SSH in and run:
  ```
  node db/seed.js
  ```
  (from the Application root)
- This creates `db/pack.db` with the admin account (from the
  `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars above) and the default hero
  slides
- Verify `pack.db` now exists in `db/`

**If you are redeploying and `pack.db` already has real data (listings,
leads, hero slides, settings) — the normal case after the first
deploy, or if your backend zip already included it:**

- Confirm `db/pack.db` is present (via File Manager, or included in
  your backend zip already)
- Do **NOT** run `node db/seed.js` — it detects the existing file and
  exits immediately without touching it:
  ```
  Database already exists — skipping seed.
  Run with --force to reset (WARNING: deletes all data).
  ```
  `--force` additionally requires typing "yes" at an interactive
  prompt, so it cannot run destructively by accident. There is no
  reason to ever pass `--force` against the live server's database.

## STEP 6 — Start the app

- Click **Restart** in Setup Node.js App
- Visit `pack.com.na` — confirm the homepage loads
- Visit `pack.com.na/admin/login` — confirm the login page loads
- Log in with the admin credentials from Step 3, confirm the dashboard
  loads with the real listing/lead counts

## STEP 7 — Test uploads folder

- From the admin dashboard, try uploading a property image
- Confirm the file appears in `public/uploads/`
- Confirm the image displays on the property's public listing page
- If uploads fail with a permissions error, SSH in and run:
  ```
  chmod 755 public/uploads
  ```

## STEP 8 — DNS / domain check

- `pack.com.na` should already point at this cPanel account
- If the site doesn't load after Step 6, check that **Application URL**
  in Setup Node.js App matches the domain exactly (no www vs non-www
  mismatch)
- If `www.pack.com.na` should also work, add it as an alias in cPanel
  → Aliases, and set up a redirect to the non-www version

## STEP 9 — SSL

- cPanel → **SSL/TLS** → Let's Encrypt (or AutoSSL)
- Issue a free certificate for `pack.com.na` (and `www.pack.com.na` if
  used)
- The session cookie is set with `secure: true` whenever
  `NODE_ENV=production` (see Step 3), which requires HTTPS to work —
  **do not attempt to log into `/admin` in production before SSL is
  active**, the session cookie will silently fail to persist over HTTP
  and login will appear to do nothing

---

## Clean URLs

The public site uses clean URLs (`/real-estate`, `/listings`,
`/listing/shambo-view`, etc.) instead of `.html` extensions. Every old
`.html` URL 301-redirects to its clean equivalent, so nothing that
already linked to or bookmarked the old URLs breaks. `/admin/*` and
`/api/*` routes are unaffected — they were never `.html`-based.

## Notes on the sql.js migration

- `pack.db` is a completely ordinary SQLite file — the same file that
  worked with `better-sqlite3` locally works with `sql.js` after
  upload, no conversion needed
- sql.js keeps the whole database in memory and writes the full file
  back to disk after every write. At this site's traffic volume that's
  irrelevant, but it does mean the app should always be stopped
  cleanly (via Restart/Stop in cPanel, not a hard kill) before you
  manually copy `pack.db` around, so a write isn't caught mid-flight
