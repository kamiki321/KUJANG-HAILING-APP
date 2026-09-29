const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { sql, initDatabase } = require('./db');
const scrypt = promisify(crypto.scrypt);
const MASTER_FILE = path.join(process.cwd(), 'data', 'master.json');
let initialized = false;
let initPromise = null;
const now = () => new Date().toISOString();
const makeId = () => crypto.randomBytes(9).toString('base64url') + Date.now().toString(36);
function json(res, status, body) { return res.status(status).json(body); }
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
async function body(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  }
  return new Promise((resolve, reject) => {
    let s='';
    req.on('data', c => { s += c; if (s.length > 10*1024*1024) reject(new Error('Payload terlalu besar')); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error('JSON request tidak valid')); } });
    req.on('error', reject);
  });
}
async function ensureInitialized() {
  if (initialized) return;
  if (!initPromise) initPromise = (async () => {
    await initDatabase();
    await seedAdmin();
    const c = await sql`SELECT COUNT(*)::int AS count FROM hailing_records`;
    if (c[0].count === 0 && fs.existsSync(MASTER_FILE)) {
      const master = JSON.parse(fs.readFileSync(MASTER_FILE, 'utf8'));
      if (Array.isArray(master)) for (const item of master) await saveRecord(item, item.id);
    }
    initialized = true;
  })().catch(e => { initPromise=null; throw e; });
  await initPromise;
}
async function nextNo() { const r=await sql`SELECT COALESCE(MAX(no),0)+1 AS n FROM hailing_records`; return Number(r[0].n); }
async function ensureOperation(id,name) {
  if (!id || !name) return;
  const t=now();
  await sql`INSERT INTO operations(id,name,created_at,updated_at) VALUES(${id},${String(name)},${t},${t}) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,updated_at=EXCLUDED.updated_at`;
}
function normalize(input={}, existing={}) {
  const r={...existing,...input};
  return { id:r.id||makeId(), no:Number(r.no)>0?Number(r.no):null, createdAt:r.createdAt||now(), updatedAt:now(), date:r.date||null,time:r.time||null,posisi:r.posisi??'-',destination:r.destination??'',cargo:r.cargo??'',crewCount:r.crewCount===''||r.crewCount==null?null:Number(r.crewCount),captain:r.captain||null,captainPhone:r.captainPhone||null,owner:r.owner||null,ownerPhone:r.ownerPhone||null,company:r.company||null,nominal:r.nominal===''||r.nominal==null?null:Number(r.nominal),rawInput:r.rawInput??null,parserConfidence:r.parserConfidence==null?null:Number(r.parserConfidence),opsId:r.opsId||null,opsName:r.opsName||null,trip:r.trip==null?'':String(r.trip).trim(),vessels:Array.isArray(r.vessels)?r.vessels:[]};
}
function mapVessels(rows) { return rows.map(v=>({id:v.id,name:v.name,...(v.type?{type:v.type}:{}),...(v.gt!=null?{gt:v.gt}:{})})); }
function mapRecord(row,vessels) { return {id:row.id,no:row.no,createdAt:row.created_at,updatedAt:row.updated_at,vessels,posisi:row.posisi,destination:row.destination,cargo:row.cargo,...(row.crew_count!=null?{crewCount:row.crew_count}:{}),...(row.captain?{captain:row.captain}:{}),...(row.captain_phone?{captainPhone:row.captain_phone}:{}),...(row.owner?{owner:row.owner}:{}),...(row.owner_phone?{ownerPhone:row.owner_phone}:{}),...(row.company?{company:row.company}:{}),...(row.nominal!=null?{nominal:Number(row.nominal)}:{}),...(row.raw_input!=null?{rawInput:row.raw_input}:{}),...(row.parser_confidence!=null?{parserConfidence:row.parser_confidence}:{}),...(row.date?{date:row.date}:{}),...(row.time?{time:row.time}:{}),...(row.ops_id?{opsId:row.ops_id}:{}),...(row.ops_name?{opsName:row.ops_name}:{}),trip:row.trip||''}; }
async function getRecord(id) { const r=await sql`SELECT * FROM hailing_records WHERE id=${id}`; if(!r.length)return null; const v=await sql`SELECT id,name,type,gt FROM vessels WHERE hailing_id=${id} ORDER BY id`; return mapRecord(r[0],mapVessels(v)); }
async function allRecords() { const rows=await sql`SELECT * FROM hailing_records ORDER BY no ASC`; const v=await sql`SELECT id,hailing_id,name,type,gt FROM vessels ORDER BY hailing_id,id`; const m=new Map(); for(const x of v){if(!m.has(x.hailing_id))m.set(x.hailing_id,[]);m.get(x.hailing_id).push({id:x.id,name:x.name,...(x.type?{type:x.type}:{}),...(x.gt!=null?{gt:x.gt}:{})});} return rows.map(r=>mapRecord(r,m.get(r.id)||[])); }
async function saveRecord(input,id=null) {
  let existing=null, existingVessels=[];
  if(id){ const rows=await sql`SELECT * FROM hailing_records WHERE id=${id}`; existing=rows[0]||null; if(existing){const vr=await sql`SELECT id,name,type,gt FROM vessels WHERE hailing_id=${id} ORDER BY id`; existingVessels=mapVessels(vr);} }
  const ex=existing?{id:existing.id,no:existing.no,createdAt:existing.created_at,updatedAt:existing.updated_at,date:existing.date,time:existing.time,posisi:existing.posisi,destination:existing.destination,cargo:existing.cargo,crewCount:existing.crew_count,captain:existing.captain,captainPhone:existing.captain_phone,owner:existing.owner,ownerPhone:existing.owner_phone,company:existing.company,nominal:existing.nominal,rawInput:existing.raw_input,parserConfidence:existing.parser_confidence,opsId:existing.ops_id,opsName:existing.ops_name,trip:existing.trip||'',vessels:existingVessels}:{};
  const r=normalize({...input,id:id||input?.id},ex); if(!r.no)r.no=await nextNo(); if(r.opsId&&r.opsName)await ensureOperation(r.opsId,r.opsName);
  await sql`INSERT INTO hailing_records(id,no,created_at,updated_at,date,time,posisi,destination,cargo,crew_count,captain,captain_phone,owner,owner_phone,company,nominal,raw_input,parser_confidence,ops_id,ops_name,trip) VALUES(${r.id},${r.no},${r.createdAt},${r.updatedAt},${r.date},${r.time},${r.posisi},${r.destination},${r.cargo},${r.crewCount},${r.captain},${r.captainPhone},${r.owner},${r.ownerPhone},${r.company},${r.nominal},${r.rawInput},${r.parserConfidence},${r.opsId},${r.opsName},${r.trip}) ON CONFLICT(id) DO UPDATE SET no=EXCLUDED.no,updated_at=EXCLUDED.updated_at,date=EXCLUDED.date,time=EXCLUDED.time,posisi=EXCLUDED.posisi,destination=EXCLUDED.destination,cargo=EXCLUDED.cargo,crew_count=EXCLUDED.crew_count,captain=EXCLUDED.captain,captain_phone=EXCLUDED.captain_phone,owner=EXCLUDED.owner,owner_phone=EXCLUDED.owner_phone,company=EXCLUDED.company,nominal=EXCLUDED.nominal,raw_input=EXCLUDED.raw_input,parser_confidence=EXCLUDED.parser_confidence,ops_id=EXCLUDED.ops_id,ops_name=EXCLUDED.ops_name,trip=EXCLUDED.trip`;
  if(Array.isArray(input.vessels) || !existing){ await sql`DELETE FROM vessels WHERE hailing_id=${r.id}`; for(const v of r.vessels){if(!v||!String(v.name||'').trim())continue; await sql`INSERT INTO vessels(id,hailing_id,name,type,gt) VALUES(${v.id||makeId()},${r.id},${String(v.name).trim()},${v.type||null},${v.gt==null?null:String(v.gt)})`;}}
  return getRecord(r.id);
}
// ================= AUTH =================
const SESSION_COOKIE = 'kk_session';
const SESSION_DAYS = 30;               // sesi bertahan 30 hari, tidak hilang saat refresh / browser ditutup
const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
const MAX_FAILED = 5;                  // salah password 5x -> terkunci sementara
const LOCK_MINUTES = 15;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password), salt, 64);
  return 'scrypt$' + salt.toString('base64') + '$' + key.toString('base64');
}
async function verifyPassword(password, stored) {
  try {
    const [alg, s, k] = String(stored || '').split('$');
    if (alg !== 'scrypt' || !s || !k) return false;
    const expected = Buffer.from(k, 'base64');
    const key = await scrypt(String(password), Buffer.from(s, 'base64'), expected.length);
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch { return false; }
}
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

// Akun admin pertama dibuat otomatis dari env ADMIN_USERNAME + ADMIN_PASSWORD (hanya jika tabel users masih kosong).
async function seedAdmin() {
  const c = await sql`SELECT COUNT(*)::int AS count FROM users`;
  if (c[0].count > 0) return;
  const username = String(process.env.ADMIN_USERNAME || '').trim();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!username || !password) {
    console.warn('[auth] Tabel users kosong. Set ADMIN_USERNAME & ADMIN_PASSWORD di Vercel Environment Variables untuk membuat akun pertama.');
    return;
  }
  const hash = await hashPassword(password);
  await sql`INSERT INTO users(id,username,name,password_hash) VALUES(${makeId()},${username},${process.env.ADMIN_NAME || username},${hash}) ON CONFLICT DO NOTHING`;
}

function parseCookies(req) {
  const out = {};
  String(req.headers?.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
}
async function createSession(userId, req) {
  const token = crypto.randomBytes(32).toString('hex');
  const ua = String(req.headers?.['user-agent'] || '').slice(0, 300);
  await sql`DELETE FROM sessions WHERE expires_at < NOW()`;
  await sql`INSERT INTO sessions(id,user_id,expires_at,user_agent) VALUES(${sha256(token)},${userId},NOW() + make_interval(days => ${SESSION_DAYS}::int),${ua})`;
  return token; // token asli hanya dikirim ke browser (cookie); yang disimpan di DB hanya hash-nya
}
async function destroySession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) await sql`DELETE FROM sessions WHERE id=${sha256(token)}`;
}
async function getSessionUser(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const h = sha256(token);
  const rows = await sql`SELECT u.id,u.username,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=${h} AND s.expires_at>NOW() AND u.is_active=TRUE`;
  if (!rows.length) return null;
  // sliding expiration: perpanjang sesi selama masih dipakai
  const ext = await sql`UPDATE sessions SET expires_at=NOW() + make_interval(days => ${SESSION_DAYS}::int) WHERE id=${h} AND expires_at < NOW() + interval '15 days' RETURNING id`;
  if (ext.length && res) setSessionCookie(res, token);
  return rows[0];
}
// Dipakai di semua API data: kembalikan user, atau kirim 401 dan return null.
async function requireAuth(req, res) {
  const user = await getSessionUser(req, res);
  if (!user) { res.status(401).json({ error: 'Belum login atau sesi berakhir', code: 'UNAUTHENTICATED' }); return null; }
  req.user = user;
  return user;
}

module.exports={hashPassword,verifyPassword,seedAdmin,setSessionCookie,clearSessionCookie,createSession,destroySession,getSessionUser,requireAuth,MAX_FAILED,LOCK_MINUTES,sql,now,makeId,json,cors,body,ensureInitialized,saveRecord,getRecord,allRecords};
