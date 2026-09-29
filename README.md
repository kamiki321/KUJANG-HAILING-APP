# KRI KUJANG Hailing Log — 6 Serverless Functions

Versi ini mempertahankan frontend dan database Neon dari versi sebelumnya, tetapi backend Vercel dirapikan menjadi **7 Serverless Functions (6 data + 1 auth)**.

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

Jangan mencampurkan file `api/` dari versi lama. Struktur `/api` berisi 7 file: 6 di atas + `auth.js`.


## Hierarki Ops → Trip → Hailing
- Setiap record hailing memiliki field `trip` bertipe PostgreSQL `TEXT`.
- Flow input: pilih Ops → isi/pilih Trip → input data hailing.
- Contoh: `Ops. Trisula Jaya - 26` → `Trip 1 : tanggal 23 - 28` → data hailing.
- Trip yang sudah digunakan ditampilkan sebagai saran saat memilih Ops.
- Data lama tetap kompatibel; kolom `trip` ditambahkan otomatis melalui migrasi `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.


## Login & Autentikasi

- Semua API data (`records`, `record`, `operations`, `operation`, `import`) **wajib login** (401 jika belum). `/api/health` tetap publik.
- Function ke-7: `/api/auth.js` → `GET /api/auth?action=me`, `POST /api/auth?action=login`, `POST /api/auth?action=logout`.
- Sesi disimpan di cookie `HttpOnly; Secure; SameSite=Lax` selama **30 hari** (diperpanjang otomatis selama dipakai) dan di tabel `sessions` (yang disimpan hanya hash token).
- **Refresh / tutup browser tidak logout.** Logout hanya lewat tombol **Log out** di header.
- Password di-hash dengan `scrypt` (bawaan Node, tanpa dependency baru). 5x salah password → akun terkunci 15 menit.

### Tabel

- `users` (id, username, name, password_hash, is_active, failed_attempts, locked_until, last_login_at, created_at, updated_at)
- `sessions` (id = hash token, user_id → users, created_at, expires_at, user_agent)

Dibuat otomatis saat function pertama kali dipanggil.

### Membuat akun pertama

Tambahkan Environment Variables di Vercel (Production), lalu redeploy:

```text
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<password kuat>
ADMIN_NAME=Nama Tampilan   (opsional)
```

Akun dibuat otomatis hanya jika tabel `users` masih kosong. Setelah login berhasil, `ADMIN_PASSWORD` boleh dihapus dari env.

Alternatif tanpa env (Neon SQL Editor):

```bash
node scripts/hash-password.js "PasswordBaru"
```
```sql
INSERT INTO users (id, username, name, password_hash)
VALUES ('usr_1', 'admin', 'Administrator', '<hasil hash di atas>');
```

Reset password: jalankan `UPDATE users SET password_hash='<hash baru>', failed_attempts=0, locked_until=NULL WHERE username='admin';` lalu `DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE username='admin');`
