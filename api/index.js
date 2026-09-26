/**
 * KRI KUJANG Hailing Log - Single Vercel Serverless Function
 *
 * All /api/* endpoints are dispatched from this one function so the project
 * stays within the Vercel Hobby plan's Serverless Function limit.
 */
const path = require('path');

const routes = {
  '/health': './health.js',
  '/auth-login': './auth-login.js',
  '/auth-refresh': './auth-refresh.js',
  '/auth-logout': './auth-logout.js',
  '/auth-me': './auth-me.js',
  '/records': './records/index.js',
  '/records/bulk-delete': './records/bulk-delete.js',
  '/record': './record.js',
  '/operations': './operations/index.js',
  '/operation': './operation.js',
  '/import': './import.js'
};

function getPathname(req) {
  const raw = String(req.url || '/');
  try {
    const hinted = new URL(raw, 'http://localhost').searchParams.get('__route');
    if (hinted) {
      let p = String(hinted);
      if (!p.startsWith('/')) p = '/' + p;
      return p.replace(/\/$/, '') || '/';
    }
  } catch (_) {}

  let pathname;
  try {
    pathname = new URL(raw, 'http://localhost').pathname;
  } catch (_) {
    pathname = raw.split('?')[0] || '/';
  }

  // Vercel can expose the original rewritten path or the function path.
  // Normalize both forms to the internal /api endpoint namespace.
  pathname = pathname.replace(/^\/api(?:\/index(?:\.js)?)?/, '') || '/';
  if (!pathname.startsWith('/')) pathname = '/' + pathname;
  return pathname;
}

function getQuery(req) {
  const raw = String(req.url || '/');
  try {
    return new URL(raw, 'http://localhost').searchParams;
  } catch (_) {
    return new URLSearchParams(raw.includes('?') ? raw.slice(raw.indexOf('?')) : '');
  }
}

module.exports = async function handler(req, res) {
  const pathname = getPathname(req);

  // Keep req.query available because the existing route handlers use it.
  const params = getQuery(req);
  req.query = Object.fromEntries(params.entries());

  const routeFile = routes[pathname];
  if (!routeFile) {
    return res.status(404).json({
      error: 'API endpoint tidak ditemukan',
      path: pathname
    });
  }

  try {
    const handler = require(path.join(__dirname, '..', 'lib', 'api-internal', routeFile));
    return await handler(req, res);
  } catch (e) {
    console.error('API dispatcher error:', e);
    return res.status(e?.status || 500).json({ error: e?.message || 'Server error' });
  }
};
