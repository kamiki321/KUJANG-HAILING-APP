# KRI KUJANG Hailing Log — Vercel + Neon

Versi ini dibuat khusus untuk deployment Vercel dengan database PostgreSQL Neon.

## Struktur

- `index.html` — frontend existing
- `api/[...path].js` — REST API serverless
- `api/_db.js` — koneksi + schema PostgreSQL
- `data/master.json` — master data 49 record untuk seed awal
- `vercel.json` — konfigurasi Vercel

## Environment Variable

Di Vercel → Project → Settings → Environment Variables, tambahkan:

`DATABASE_URL`

Connection string PostgreSQL dari Neon.

Kode juga mengenali `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, dan `NEON_DATABASE_URL` jika `DATABASE_URL` tidak tersedia.

## Deploy

1. Upload repository ini ke GitHub.
2. Import repository ke Vercel.
3. Pastikan Environment Variable database tersedia untuk Production/Preview sesuai kebutuhan.
4. Deploy/Re-deploy.
5. Buka `/api/health` pada domain Vercel.

Contoh response:

```json
{"ok":true,"database":"neon-postgresql","records":49,"dbTime":"..."}
```

## API

- `GET /api/health`
- `GET /api/records`
- `POST /api/records`
- `PUT /api/records/:id`
- `DELETE /api/records/:id`
- `POST /api/records/bulk-delete`
- `GET /api/operations`
- `POST /api/operations`
- `DELETE /api/operations/:id`
- `POST /api/import`

## Perbaikan Vercel

Handler menerima JSON melalui `req.body` jika Vercel sudah mem-parsing request, dan memiliki fallback pembacaan stream untuk runtime Node lain. Ini penting untuk operasi POST/PUT seperti Input Hailing, Edit, Nominal, dan Import.

## Database

Tabel:

- `operations`
- `hailing_records`
- `vessels`

Saat database kosong, `data/master.json` akan digunakan sebagai seed otomatis.


## CRUD FIXED (Vercel)
- Added robust result dialog for success/failure on Hailing CRUD, nominal CRUD, and Operations CRUD.
- Fixed partial record updates so adding/editing/removing nominal does not erase vessel data.
- Fixed bulk-delete route ordering in the Vercel catch-all API.
- Redeploy the entire project after replacing the current deployment.
