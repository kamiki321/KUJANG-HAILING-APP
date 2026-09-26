# KRI KUJANG Hailing Log — Vercel + Neon

Versi deployment Vercel dengan Neon PostgreSQL.

## Perbaikan import
- `/api/import` menerima body JSON dari Vercel `req.body`, `rawBody`, atau request stream.
- Tidak lagi gagal dengan `Unexpected end of JSON input` ketika body sudah diproses oleh runtime.
- `master.json` yang kosong/tidak valid tidak lagi membuat `/api/health` dan CRUD ikut gagal.
- Import merge/replace menggunakan bulk PostgreSQL (`jsonb_to_recordset`) untuk mengurangi jumlah query dan mencegah timeout.
- Import `replace` menghapus child `vessels` sebelum `hailing_records` untuk kompatibilitas dengan FK lama.
- Timestamp import dinormalisasi sebelum dikirim ke PostgreSQL.
- ID vessel yang duplikat dalam satu import dinormalisasi agar tidak merusak proses import.

## Environment
Set di Vercel:

`DATABASE_URL=postgresql://...`

## API
- `GET /api/health`
- `GET /api/records`
- `POST /api/records`
- `PUT /api/record?id=ID`
- `DELETE /api/record?id=ID`
- `POST /api/records/bulk-delete`
- `GET /api/operations`
- `POST /api/operations`
- `DELETE /api/operation?id=ID`
- `POST /api/import`

## Setelah deploy
1. Buka `/api/health` dan pastikan `ok: true`.
2. Buka `/api/records` dan pastikan data tersedia.
3. Test import JSON melalui UI.
4. Jika import gagal, dialog akan menampilkan pesan API yang sebenarnya, bukan error JSON parser generik.
