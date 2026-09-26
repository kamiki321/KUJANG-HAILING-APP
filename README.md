# KRI KUJANG Hailing Log — Vercel Edition

Versi deployment online menggunakan **Vercel + Neon PostgreSQL**.

## Arsitektur

- Frontend: `index.html`
- API: `api/[...path].js`
- Database: Neon PostgreSQL
- Seed/master data: `data/master.json`
- Hosting: Vercel

SQLite lokal dari versi desktop tidak digunakan di Vercel karena filesystem serverless tidak cocok untuk database file yang harus persisten.

## Deploy paling mudah

### 1. Upload project ke GitHub

Buat repository baru lalu upload seluruh isi folder ini.

### 2. Import repository ke Vercel

Di Vercel pilih **Add New → Project**, lalu pilih repository GitHub.

### 3. Hubungkan Neon

Di Vercel tambahkan database PostgreSQL melalui Marketplace/Neon, atau gunakan database Neon yang sudah ada.

Pastikan environment variable berikut tersedia pada project:

```text
DATABASE_URL
```

Untuk Production, Preview, dan Development aktifkan sesuai kebutuhan.

### 4. Deploy

Klik **Deploy**.

Pada request pertama API akan:

1. membuat tabel `operations`, `hailing_records`, dan `vessels`;
2. membuat index;
3. membaca `data/master.json`;
4. memasukkan 49 record master apabila database masih kosong.

### 5. Test

Buka:

```text
https://DOMAIN-VERCEL-ANDA.vercel.app/api/health
```

Kemudian aplikasi:

```text
https://DOMAIN-VERCEL-ANDA.vercel.app
```

## Database

### operations
- `id TEXT PRIMARY KEY`
- `name TEXT`
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

### hailing_records
- `id TEXT PRIMARY KEY`
- `no INTEGER`
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`
- `date TEXT`
- `time TEXT`
- `posisi TEXT`
- `destination TEXT`
- `cargo TEXT`
- `crew_count INTEGER`
- `captain TEXT`
- `captain_phone TEXT`
- `owner TEXT`
- `owner_phone TEXT`
- `company TEXT`
- `nominal BIGINT`
- `raw_input TEXT`
- `parser_confidence INTEGER`
- `ops_id TEXT`
- `ops_name TEXT`

### vessels
- `id TEXT PRIMARY KEY`
- `hailing_id TEXT`
- `name TEXT`
- `type TEXT`
- `gt TEXT`

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

## Catatan

Jangan membuka `index.html` dengan `file:///...` untuk versi online. Frontend membutuhkan API Vercel.

Untuk backup master, file `data/master.json` tetap disertakan.
