# Pack Group — Backend

Node.js + Express backend with SQLite database and EJS admin dashboard.

## Quick Start

```bash
cd backend
npm install
cp .env.example .env   # edit .env with your credentials
npm run seed           # creates DB and seeds admin + initial data
npm start              # starts server on PORT (default 3000)
```

For development with auto-reload:
```bash
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable         | Description                              | Default        |
|-----------------|------------------------------------------|----------------|
| `PORT`          | HTTP port to listen on                   | `3000`         |
| `NODE_ENV`      | `production` or `development`            | `development`  |
| `SESSION_SECRET`| Long random string for session signing   | *(required)*   |
| `ADMIN_NAME`    | Name for the seeded admin account        | `Admin`        |
| `ADMIN_EMAIL`   | Email to log into /admin/login           | *(required)*   |
| `ADMIN_PASSWORD`| Password for admin account               | *(required)*   |

## Admin Dashboard

Visit `/admin/login` after starting the server.

**Pages:**
- `/admin/dashboard` — overview stats + recent leads
- `/admin/properties` — manage property listings
- `/admin/insurance` — manage insurance products
- `/admin/leads` — view and update enquiries
- `/admin/settings` — site-wide text/contact settings
- `/admin/account` — change email / password

## Public API

| Method | Endpoint                    | Description                       |
|--------|-----------------------------|-----------------------------------|
| GET    | `/api/properties`           | All available properties          |
| GET    | `/api/properties/featured`  | Featured + available only         |
| GET    | `/api/properties/:slug`     | Single property with images       |
| GET    | `/api/insurance`            | Active insurance products         |
| POST   | `/api/leads`                | Submit an enquiry (rate-limited)  |

## Deploy to Railway

1. Push repo to GitHub
2. Create new Railway project → deploy from GitHub
3. Set all env vars in Railway dashboard
4. Railway auto-detects `npm start` in `backend/`

The SQLite database file lives at `backend/db/pack.db` (auto-created on first start).
