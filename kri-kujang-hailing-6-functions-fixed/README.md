# KRI KUJANG Hailing Log — 6 Serverless Functions

Versi ini mempertahankan frontend dan database Neon dari versi sebelumnya, tetapi backend Vercel dirapikan menjadi **tepat 6 Serverless Functions**.

## 6 Functions

1. `/api/health.js` → `GET /api/health`
2. `/api/import.js` → `POST /api/import`
3. `/api/operation.js` → `DELETE /api/operation?id=...`
4. `/api/operations.js` → `GET/POST /api/operations`
5. `/api/record.js` → `GET/PUT/DELETE /api/record?id=...`
6. `/api/records.js` → `GET/POST /api/records` dan `POST /api/records/bulk-delete`

Helper database dan helper API berada di `/lib`, **di luar `/api`**, sehingga tidak dihitung sebagai Serverless Functions.

## Runtime

Node.js ditentukan melalui `package.json`:

```json
"engines": {
  "node": "24.x"
}
```

Tidak ada `runtime` custom di `vercel.json`.

## Database

Environment variable wajib:

```text
DATABASE_URL=postgresql://...neon.tech/...?sslmode=require
```

Schema otomatis dibuat untuk:

- `operations`
- `hailing_records`
- `vessels`

## Dashboard

Dashboard menampilkan **seluruh record yang Belum Transfer** dari data `records` yang dimuat dari database, bukan hanya 10 record. Tabel tersebut juga memiliki search khusus.

## Deploy

1. Ganti seluruh isi repository GitHub dengan isi folder ini.
2. Pastikan tidak ada file lama seperti `now.json` atau folder `.vercel` yang ikut masuk repository.
3. Pastikan `DATABASE_URL` tersedia di Vercel Environment Variables untuk Production.
4. Deploy ulang.
5. Uji:
   - `/api/health`
   - `/api/records`
   - `/api/operations`

### Penting

Jangan mencampurkan file `api/` dari versi lama. Struktur `/api` harus berisi tepat enam file JavaScript di atas.
