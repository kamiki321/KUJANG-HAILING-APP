const crypto = require('crypto');
const { sql } = require('./_db');

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const COOKIE_NAME = 'kujang_refresh_token';

const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

function authError(message, status = 401) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function validatePassword(password) {
  return typeof password === 'string' && PASSWORD_RULE.test(password);
}

function passwordRuleMessage() {
  return 'Password minimal 8 karakter, mengandung 1 huruf uppercase, 1 angka, dan 1 karakter special.';
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function createAccessToken(user) {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_JWT_SECRET belum dikonfigurasi atau terlalu pendek. Gunakan minimal 32 karakter acak.');
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    sub: String(user.id),
    username: user.username,
    iat: now,
    exp: now + ACCESS_TTL_SECONDS
  }));
  const data = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function verifyAccessToken(token) {
  try {
    const secret = process.env.AUTH_JWT_SECRET;
    if (!secret || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!data.exp || data.exp <= now || !data.sub) return null;
    return data;
  } catch (_) { return null; }
}

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

function verifyPassword(password, encoded) {
  try {
    const [scheme, saltText, hashText] = String(encoded || '').split('$');
    if (scheme !== 'scrypt' || !saltText || !hashText) return false;
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(hashText, 'base64url');
    const actual = crypto.scryptSync(password, salt, expected.length, { N: 16384, r: 8, p: 1 });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (_) { return false; }
}

function randomRefreshToken() { return crypto.randomBytes(48).toString('base64url'); }
function hashRefreshToken(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }

function parseCookies(req) {
  const raw = req.headers?.cookie || '';
  const out = {};
  raw.split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function setRefreshCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${REFRESH_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`);
}

function clearRefreshCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
}

async function ensureAuthDatabase() {
  await sql`CREATE TABLE IF NOT EXISTS "user" (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at)`;

  const count = await sql`SELECT COUNT(*)::int AS count FROM "user"`;
  if (Number(count[0].count) === 0) {
    const username = process.env.DEFAULT_ADMIN_USERNAME || 'kujang642';
    const password = process.env.DEFAULT_ADMIN_PASSWORD;
    // The fallback is a precomputed scrypt hash of the requested default password.
    // The plaintext password is never stored in the database. Set DEFAULT_ADMIN_PASSWORD
    // in Vercel to replace it with a new initial password.
    const fallbackHash = 'scrypt$CFi4DalPS3ykbRT1RUYCQw$fxyAucJpDlOQQEyW1AMS2ZmqKQFuOtlZCUMpz8IZMImyqQimexgJtoqkgQDUcu1ZwlbdRK5qbb9UdqIIlTWm1A';
    const passwordHash = password ? (validatePassword(password) ? hashPassword(password) : (()=>{ throw new Error('DEFAULT_ADMIN_PASSWORD tidak memenuhi aturan password.'); })()) : fallbackHash;
    await sql`INSERT INTO "user"(username,password) VALUES(${username},${passwordHash})`;
  }
}

async function issueSession(user) {
  const refreshToken = randomRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  const sessionId = crypto.randomBytes(18).toString('base64url');
  await sql`INSERT INTO user_sessions(id,user_id,token_hash,expires_at)
    VALUES(${sessionId},${user.id},${tokenHash},NOW() + (${REFRESH_TTL_SECONDS} * INTERVAL '1 second'))`;
  return { accessToken: createAccessToken(user), refreshToken, sessionId };
}

async function rotateRefreshSession(refreshToken) {
  const tokenHash = hashRefreshToken(refreshToken);
  const rows = await sql`SELECT s.id,s.user_id,u.username,s.expires_at,s.revoked_at
    FROM user_sessions s JOIN "user" u ON u.id=s.user_id
    WHERE s.token_hash=${tokenHash} LIMIT 1`;
  if (!rows.length) throw authError('Refresh token tidak valid.', 401);
  const session = rows[0];
  if (session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) throw authError('Session sudah berakhir. Silakan login kembali.', 401);

  const next = await issueSession({ id: session.user_id, username: session.username });
  await sql`UPDATE user_sessions SET revoked_at=NOW(), last_used_at=NOW() WHERE id=${session.id}`;
  return { ...next, userId: session.user_id, username: session.username };
}

async function requireAuth(req) {
  const auth = String(req.headers?.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const payload = verifyAccessToken(token);
  if (!payload) throw authError('Sesi login tidak valid atau sudah berakhir.', 401);
  const rows = await sql`SELECT id,username,"createdAt","updatedAt" FROM "user" WHERE id=${Number(payload.sub)} LIMIT 1`;
  if (!rows.length) throw authError('Pengguna tidak ditemukan.', 401);
  return rows[0];
}

async function cleanupExpiredSessions() {
  await sql`DELETE FROM user_sessions WHERE expires_at < NOW() OR revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days'`;
}

module.exports = {
  COOKIE_NAME, ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS,
  validatePassword, passwordRuleMessage, hashPassword, verifyPassword,
  parseCookies, setRefreshCookie, clearRefreshCookie,
  ensureAuthDatabase, issueSession, rotateRefreshSession,
  requireAuth, cleanupExpiredSessions
};
