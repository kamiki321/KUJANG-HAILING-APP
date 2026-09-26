# KRI KUJANG Hailing Log — Vercel + Neon (CRUD Final)

## Architecture
- Frontend: `index.html`
- API: Vercel Serverless Functions
- Database: Neon PostgreSQL
- Master seed: `data/master.json`

## API routes
- `GET /api/health`
- `GET/POST /api/records`
- `GET/PUT/DELETE /api/records/:id`
- `POST /api/records/bulk-delete`
- `GET/POST /api/operations`
- `DELETE /api/operations/:id`
- `POST /api/import`

## Important
This version intentionally does **not** use one catch-all API file. Each CRUD route has its own Vercel function so that POST/PUT/DELETE routing is explicit and does not depend on catch-all path parsing.

## Deploy
1. Upload this project to GitHub.
2. Import the repository into Vercel.
3. Add Environment Variable:
   - `DATABASE_URL` = Neon PostgreSQL connection string.
4. Deploy / Redeploy.
5. Open `/api/health` and verify `ok: true` and the expected record count.

No SQLite file is used in Vercel. The first API request creates the tables and seeds `data/master.json` when the database is empty.
