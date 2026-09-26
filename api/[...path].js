const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { sql, initDatabase } = require('./_db');

const MASTER_FILE = path.join(process.cwd(), 'data', 'master.json');
let initialized = false;
let initializationPromise = null;

const now = () => new Date().toISOString();
const makeId = () => crypto.randomBytes(9).toString('base64url') + Date.now().toString(36);

function normalizeRecord(input = {}, existing = {}) {
  const r = { ...existing, ...input };
  return {
    id: r.id || makeId(),
    no: Number.isFinite(Number(r.no)) && Number(r.no) > 0 ? Number(r.no) : null,
    createdAt: r.createdAt || now(),
    updatedAt: now(),
    date: r.date || null,
    time: r.time || null,
    posisi: r.posisi ?? '-',
    destination: r.destination ?? '',
    cargo: r.cargo ?? '',
    crewCount: r.crewCount === '' || r.crewCount == null ? null : Number(r.crewCount),
    captain: r.captain || null,
    captainPhone: r.captainPhone || null,
    owner: r.owner || null,
    ownerPhone: r.ownerPhone || null,
    company: r.company || null,
    nominal: r.nominal === '' || r.nominal == null ? null : Number(r.nominal),
    rawInput: r.rawInput ?? null,
    parserConfidence: r.parserConfidence == null ? null : Number(r.parserConfidence),
    opsId: r.opsId || null,
    opsName: r.opsName || null,
    vessels: Array.isArray(r.vessels) ? r.vessels : []
  };
}

async function ensureInitialized() {
  if (initialized) return;
  if (!initializationPromise) {
    initializationPromise = (async () => {
      await initDatabase();
      const count = await sql`SELECT COUNT(*)::int AS count FROM hailing_records`;
      if (count[0].count === 0 && fs.existsSync(MASTER_FILE)) {
        const master = JSON.parse(fs.readFileSync(MASTER_FILE, 'utf8'));
        if (Array.isArray(master) && master.length) {
          for (const item of master) await saveRecord(item, item.id);
        }
      }
      initialized = true;
    })().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }
  await initializationPromise;
}

async function nextNo() {
  const rows = await sql`SELECT COALESCE(MAX(no), 0) + 1 AS n FROM hailing_records`;
  return Number(rows[0].n);
}

async function ensureOperation(id, name) {
  if (!id || !name) return;
  const t = now();
  await sql`
    INSERT INTO operations (id, name, created_at, updated_at)
    VALUES (${id}, ${String(name)}, ${t}, ${t})
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = EXCLUDED.updated_at
  `;
}

function mapRecord(row, vessels) {
  return {
    id: row.id,
    no: row.no,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    vessels,
    posisi: row.posisi,
    destination: row.destination,
    cargo: row.cargo,
    ...(row.crew_count != null ? { crewCount: row.crew_count } : {}),
    ...(row.captain ? { captain: row.captain } : {}),
    ...(row.captain_phone ? { captainPhone: row.captain_phone } : {}),
    ...(row.owner ? { owner: row.owner } : {}),
    ...(row.owner_phone ? { ownerPhone: row.owner_phone } : {}),
    ...(row.company ? { company: row.company } : {}),
    ...(row.nominal != null ? { nominal: Number(row.nominal) } : {}),
    ...(row.raw_input != null ? { rawInput: row.raw_input } : {}),
    ...(row.parser_confidence != null ? { parserConfidence: row.parser_confidence } : {}),
    ...(row.date ? { date: row.date } : {}),
    ...(row.time ? { time: row.time } : {}),
    ...(row.ops_id ? { opsId: row.ops_id } : {}),
    ...(row.ops_name ? { opsName: row.ops_name } : {})
  };
}

async function getRecord(id) {
  const rows = await sql`SELECT * FROM hailing_records WHERE id = ${id}`;
  if (!rows.length) return null;
  const vessels = await sql`SELECT id, name, type, gt FROM vessels WHERE hailing_id = ${id} ORDER BY id`;
  return mapRecord(rows[0], vessels.map(v => ({
    id: v.id,
    name: v.name,
    ...(v.type ? { type: v.type } : {}),
    ...(v.gt != null ? { gt: v.gt } : {})
  })));
}

async function allRecords() {
  const rows = await sql`SELECT * FROM hailing_records ORDER BY no ASC`;
  if (!rows.length) return [];
  const vessels = await sql`SELECT id, hailing_id, name, type, gt FROM vessels ORDER BY hailing_id, id`;
  const byHailing = new Map();
  for (const v of vessels) {
    if (!byHailing.has(v.hailing_id)) byHailing.set(v.hailing_id, []);
    byHailing.get(v.hailing_id).push({
      id: v.id,
      name: v.name,
      ...(v.type ? { type: v.type } : {}),
      ...(v.gt != null ? { gt: v.gt } : {})
    });
  }
  return rows.map(r => mapRecord(r, byHailing.get(r.id) || []));
}

async function saveRecord(input, id = null) {
  let existing = null;
  if (id) {
    const rows = await sql`SELECT * FROM hailing_records WHERE id = ${id}`;
    existing = rows[0] || null;
  }

  const existingObject = existing ? {
    id: existing.id,
    no: existing.no,
    createdAt: existing.created_at,
    updatedAt: existing.updated_at,
    date: existing.date,
    time: existing.time,
    posisi: existing.posisi,
    destination: existing.destination,
    cargo: existing.cargo,
    crewCount: existing.crew_count,
    captain: existing.captain,
    captainPhone: existing.captain_phone,
    owner: existing.owner,
    ownerPhone: existing.owner_phone,
    company: existing.company,
    nominal: existing.nominal,
    rawInput: existing.raw_input,
    parserConfidence: existing.parser_confidence,
    opsId: existing.ops_id,
    opsName: existing.ops_name
  } : {};

  const r = normalizeRecord({ ...input, id: id || input?.id }, existingObject);
  if (!r.no) r.no = await nextNo();
  if (r.opsId && r.opsName) await ensureOperation(r.opsId, r.opsName);

  await sql`
    INSERT INTO hailing_records
      (id, no, created_at, updated_at, date, time, posisi, destination, cargo, crew_count,
       captain, captain_phone, owner, owner_phone, company, nominal, raw_input,
       parser_confidence, ops_id, ops_name)
    VALUES
      (${r.id}, ${r.no}, ${r.createdAt}, ${r.updatedAt}, ${r.date}, ${r.time}, ${r.posisi},
       ${r.destination}, ${r.cargo}, ${r.crewCount}, ${r.captain}, ${r.captainPhone},
       ${r.owner}, ${r.ownerPhone}, ${r.company}, ${r.nominal}, ${r.rawInput},
       ${r.parserConfidence}, ${r.opsId}, ${r.opsName})
    ON CONFLICT (id) DO UPDATE SET
      no = EXCLUDED.no,
      updated_at = EXCLUDED.updated_at,
      date = EXCLUDED.date,
      time = EXCLUDED.time,
      posisi = EXCLUDED.posisi,
      destination = EXCLUDED.destination,
      cargo = EXCLUDED.cargo,
      crew_count = EXCLUDED.crew_count,
      captain = EXCLUDED.captain,
      captain_phone = EXCLUDED.captain_phone,
      owner = EXCLUDED.owner,
      owner_phone = EXCLUDED.owner_phone,
      company = EXCLUDED.company,
      nominal = EXCLUDED.nominal,
      raw_input = EXCLUDED.raw_input,
      parser_confidence = EXCLUDED.parser_confidence,
      ops_id = EXCLUDED.ops_id,
      ops_name = EXCLUDED.ops_name
  `;

  await sql`DELETE FROM vessels WHERE hailing_id = ${r.id}`;
  for (const v of r.vessels) {
    if (!v || !String(v.name || '').trim()) continue;
    await sql`
      INSERT INTO vessels (id, hailing_id, name, type, gt)
      VALUES (${v.id || makeId()}, ${r.id}, ${String(v.name).trim()}, ${v.type || null}, ${v.gt == null ? null : String(v.gt)})
    `;
  }

  return getRecord(r.id);
}

async function readBody(req) {
  // Vercel's Node runtime may expose an already-parsed JSON body.
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
      try { return req.body ? JSON.parse(req.body) : {}; }
      catch { throw new Error('JSON request tidak valid'); }
    }
  }

  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Payload terlalu besar'));
        if (typeof req.destroy === 'function') req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('JSON request tidak valid')); }
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    await ensureInitialized();
    const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'GET' && pathname === '/api/health') {
      const count = await sql`SELECT COUNT(*)::int AS count FROM hailing_records`;
      const dbCheck = await sql`SELECT NOW() AS now`;
      return res.status(200).json({ ok: true, database: 'neon-postgresql', records: count[0].count, dbTime: dbCheck[0].now });
    }

    if (req.method === 'GET' && pathname === '/api/operations') {
      const rows = await sql`SELECT id, name, created_at AS "createdAt", updated_at AS "updatedAt" FROM operations ORDER BY created_at ASC`;
      return res.status(200).json(rows);
    }

    if (req.method === 'GET' && pathname === '/api/records') {
      return res.status(200).json(await allRecords());
    }

    if (pathname === '/api/records' && req.method === 'POST') {
      return res.status(201).json(await saveRecord(await readBody(req)));
    }

    const recordMatch = pathname.match(/^\/api\/records\/([^/]+)$/);
    if (recordMatch) {
      const id = decodeURIComponent(recordMatch[1]);
      if (req.method === 'PUT') {
        if (!(await getRecord(id))) return res.status(404).json({ error: 'Record tidak ditemukan' });
        return res.status(200).json(await saveRecord(await readBody(req), id));
      }
      if (req.method === 'DELETE') {
        const result = await sql`DELETE FROM hailing_records WHERE id = ${id}`;
        return result.count ? res.status(200).json({ ok: true }) : res.status(404).json({ error: 'Record tidak ditemukan' });
      }
    }

    if (pathname === '/api/records/bulk-delete' && req.method === 'POST') {
      const { ids = [] } = await readBody(req);
      if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids harus array' });
      let deleted = 0;
      for (const id of ids) {
        const result = await sql`DELETE FROM hailing_records WHERE id = ${id}`;
        deleted += result.count || 0;
      }
      return res.status(200).json({ ok: true, deleted });
    }

    if (pathname === '/api/operations' && req.method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Nama operasi wajib diisi' });
      const id = body.id || makeId();
      const t = now();
      await sql`
        INSERT INTO operations (id, name, created_at, updated_at)
        VALUES (${id}, ${name}, ${t}, ${t})
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = EXCLUDED.updated_at
      `;
      return res.status(201).json({ id, name, createdAt: t, updatedAt: t });
    }

    const opMatch = pathname.match(/^\/api\/operations\/([^/]+)$/);
    if (opMatch && req.method === 'DELETE') {
      const id = decodeURIComponent(opMatch[1]);
      const result = await sql`DELETE FROM operations WHERE id = ${id}`;
      return result.count ? res.status(200).json({ ok: true }) : res.status(404).json({ error: 'Operasi tidak ditemukan' });
    }

    if (pathname === '/api/import' && req.method === 'POST') {
      const { mode = 'merge', data = [] } = await readBody(req);
      if (!Array.isArray(data)) return res.status(400).json({ error: 'Data import harus berupa array' });
      if (mode === 'replace') {
        await sql`DELETE FROM hailing_records`;
        await sql`DELETE FROM operations`;
      }
      for (const item of data) await saveRecord(item, item.id);
      return res.status(200).json({ ok: true, count: data.length, records: await allRecords() });
    }

    return res.status(404).json({ error: 'API endpoint tidak ditemukan' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};
