// Satu function untuk semua kebutuhan auth:
//   GET  /api/auth?action=me      -> cek sesi (dipakai saat halaman dibuka / di-refresh)
//   POST /api/auth?action=login   -> login, set cookie sesi
//   POST /api/auth?action=logout  -> logout (dipanggil HANYA oleh tombol Log out di header)
const {
  cors, json, body, ensureInitialized, sql,
  verifyPassword, hashPassword, createSession, destroySession, getSessionUser,
  setSessionCookie, clearSessionCookie, MAX_FAILED, LOCK_MINUTES
} = require('../lib/lib');

let dummyHash = null; // untuk menyamakan waktu respon saat username tidak ada

module.exports = async (req, res) => {
  cors(res);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    await ensureInitialized();
    const action = String(req.query?.action || '');

    if (action === 'me') {
      if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
      const user = await getSessionUser(req, res);
      if (!user) return json(res, 401, { error: 'Belum login', code: 'UNAUTHENTICATED' });
      return json(res, 200, { user });
    }

    if (action === 'logout') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
      await destroySession(req);
      clearSessionCookie(res);
      return json(res, 200, { ok: true });
    }

    if (action === 'login') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
      const b = await body(req);
      const username = String(b.username || '').trim();
      const password = String(b.password || '');
      if (!username || !password) return json(res, 400, { error: 'Username dan password wajib diisi' });
      if (username.length > 100 || password.length > 200) return json(res, 400, { error: 'Input terlalu panjang' });

      const rows = await sql`SELECT id,username,name,password_hash,is_active,failed_attempts,locked_until FROM users WHERE LOWER(username)=LOWER(${username})`;
      const u = rows[0];

      if (u && u.locked_until && new Date(u.locked_until) > new Date()) {
        const mins = Math.max(1, Math.ceil((new Date(u.locked_until) - new Date()) / 60000));
        return json(res, 429, { error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${mins} menit.` });
      }

      let ok = false;
      if (u) ok = await verifyPassword(password, u.password_hash);
      else { dummyHash = dummyHash || await hashPassword('dummy-password'); await verifyPassword(password, dummyHash); }

      if (!u || !ok || !u.is_active) {
        if (u) {
          const attempts = (u.failed_attempts || 0) + 1;
          if (attempts >= MAX_FAILED) {
            await sql`UPDATE users SET failed_attempts=0, locked_until=NOW() + make_interval(mins => ${LOCK_MINUTES}::int) WHERE id=${u.id}`;
          } else {
            await sql`UPDATE users SET failed_attempts=${attempts} WHERE id=${u.id}`;
          }
        }
        return json(res, 401, { error: 'Username atau password salah' });
      }

      await sql`UPDATE users SET failed_attempts=0, locked_until=NULL, last_login_at=NOW() WHERE id=${u.id}`;
      const token = await createSession(u.id, req);
      setSessionCookie(res, token);
      return json(res, 200, { user: { id: u.id, username: u.username, name: u.name } });
    }

    return json(res, 400, { error: 'Action tidak dikenal' });
  } catch (e) {
    console.error('auth route error', e);
    return json(res, 500, { error: 'Terjadi kesalahan pada server' });
  }
};
