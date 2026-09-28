# KRI KUJANG Hailing Log — Vercel + Neon CRUD FIXED

Versi ini memakai Vercel Serverless Functions + Neon PostgreSQL.

## Endpoint

- `GET /api/health`
- `GET /api/records`
- `POST /api/records`
- `GET /api/record?id=...`
- `PUT /api/record?id=...`
- `DELETE /api/record?id=...`
- `POST /api/records/bulk-delete`
- `GET /api/operations`
- `POST /api/operations`
- `DELETE /api/operation?id=...`
- `POST /api/import`

### Mengapa `/api/record?id=` dan `/api/operation?id=`?

Vercel deployment sebelumnya mengembalikan 404 untuk dynamic function path `/api/records/:id` dan `/api/operations/:id`. Versi ini menggunakan function file statis + query parameter untuk menghilangkan masalah routing tersebut.

## Database

Environment variable yang wajib:

```text
DATABASE_URL=postgresql://...neon.tech/...?...sslmode=require
```

Schema:

- `operations`
- `hailing_records`
- `vessels`

Delete record dan delete operation secara eksplisit melepaskan child/reference terlebih dahulu. Ini membuat aplikasi tetap kompatibel dengan database Neon yang sebelumnya dibuat dengan definisi foreign key lama.

## Import

Import menggunakan bulk PostgreSQL JSON ingestion (`jsonb_to_recordset`) agar tidak melakukan ratusan request database satu per satu. Mode `replace` menghapus child table terlebih dahulu (`vessels` → `hailing_records` → `operations`) sehingga tidak terkena foreign-key constraint dari schema lama.

## Frontend feedback

Operasi CRUD/import menampilkan dialog `Berhasil` atau `Gagal` setelah response database diterima.

## Deploy

1. Upload seluruh folder project ke GitHub.
2. Hubungkan repository ke Vercel.
3. Set `DATABASE_URL` pada Environment Variables Production.
4. Deploy ulang tanpa cache bila perlu.
5. Tes:
   - `/api/health`
   - `/api/records`

## Validasi yang sudah dilakukan

Automated mock integration test telah dijalankan untuk:

- health
- GET records
- GET operations
- POST record
- PUT record
- DELETE record satu per satu
- bulk delete
- POST operation
- DELETE operation dengan record yang masih mereferensikannya
- import replace
- frontend JavaScript syntax
- seluruh API JavaScript syntax

Hasil: seluruh skenario mock API di atas mengembalikan status yang diharapkan dan test berakhir dengan `ALL API MOCK TESTS PASSED`.

Catatan: pengujian mock tidak menggantikan pengujian terhadap database Neon production. Setelah deploy, tetap lakukan smoke test pada URL Vercel.
