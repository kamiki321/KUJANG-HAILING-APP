const { cors, json, body, ensureInitialized } = require('./_lib');
const { sql } = require('./_db');
const { validatePassword, passwordRuleMessage, verifyPassword, issueSession, setRefreshCookie } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    await ensureInitialized();
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const b = await body(req);
    const username = String(b.username || '').trim();
    const password = typeof b.password === 'string' ? b.password : '';
    if (!username || !password) return json(res, 400, { error: 'Username dan password wajib diisi.' });
    if (!validatePassword(password)) return json(res, 400, { error: passwordRuleMessage(), code: 'PASSWORD_FORMAT_INVALID' });

    const rows = await sql`SELECT id,username,password,"createdAt","updatedAt" FROM "user" WHERE username=${username} LIMIT 1`;
    if (!rows.length || !verifyPassword(password, rows[0].password)) {
      return json(res, 401, { error: 'Username atau password salah.', code: 'INVALID_CREDENTIALS' });
    }
    const user = { id: rows[0].id, username: rows[0].username };
    const session = await issueSession(user);
    setRefreshCookie(res, session.refreshToken);
    return json(res, 200, { ok: true, accessToken: session.accessToken, user });
  } catch (e) {
    console.error('auth login error', e);
    return json(res, e.status || 500, { error: e.message || 'Login gagal.' });
  }
};
