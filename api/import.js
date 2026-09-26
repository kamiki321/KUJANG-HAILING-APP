const { cors, json, body, ensureInitialized, allRecords, sql } = require('./_lib');
const { requireAuth } = require('./_auth');

function cleanString(v) {
  return v == null ? null : String(v);
}
function cleanNumber(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function cleanTimestamp(v, fallback = null) {
  if (v == null || v === '') return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

function makeImportPayload(data) {
  const records = data.map((item, i) => ({
    id: String(item?.id || `import-${Date.now()}-${i}`),
    no: cleanNumber(item?.no),
    createdAt: cleanTimestamp(item?.createdAt, new Date().toISOString()),
    updatedAt: new Date().toISOString(),
    date: cleanString(item?.date),
    time: cleanString(item?.time),
    posisi: item?.posisi == null ? '-' : String(item.posisi),
    destination: cleanString(item?.destination) || '',
    cargo: cleanString(item?.cargo) || '',
    crewCount: cleanNumber(item?.crewCount),
    captain: cleanString(item?.captain),
    captainPhone: cleanString(item?.captainPhone),
    owner: cleanString(item?.owner),
    ownerPhone: cleanString(item?.ownerPhone),
    company: cleanString(item?.company),
    nominal: cleanNumber(item?.nominal),
    rawInput: cleanString(item?.rawInput),
    parserConfidence: cleanNumber(item?.parserConfidence),
    opsId: item?.opsId && item?.opsName ? String(item.opsId) : null,
    opsName: item?.opsId && item?.opsName ? String(item.opsName) : null
  }));

  const operations = [];
  const opSeen = new Set();
  for (const r of records) {
    if (r.opsId && r.opsName && !opSeen.has(r.opsId)) {
      opSeen.add(r.opsId);
      operations.push({ id: r.opsId, name: r.opsName });
    }
  }

  const vessels = [];
  const vesselIds = new Set();
  for (const item of data) {
    const hailingId = String(item?.id || '');
    if (!hailingId || !Array.isArray(item?.vessels)) continue;
    for (let vi = 0; vi < item.vessels.length; vi++) {
      const v = item.vessels[vi] || {};
      const name = String(v.name || '').trim();
      if (!name) continue;
      let vesselId = String(v.id || `${hailingId}-${vi + 1}`);
      if (vesselIds.has(vesselId)) vesselId = `${hailingId}-${vi + 1}-${vesselIds.size}`;
      vesselIds.add(vesselId);
      vessels.push({
        id: vesselId,
        hailingId,
        name,
        type: cleanString(v.type),
        gt: v.gt == null ? null : String(v.gt)
      });
    }
  }
  return { records, operations, vessels };
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    await ensureInitialized();
    await requireAuth(req);
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    const payloadBody = await body(req);
    if (!payloadBody || typeof payloadBody !== 'object') {
      return json(res, 400, { error: 'Payload import tidak ditemukan atau bukan JSON object' });
    }

    const mode = payloadBody.mode || 'merge';
    const data = payloadBody.data;
    if (!Array.isArray(data)) return json(res, 400, { error: 'Data import harus berupa array' });
    if (!data.length) return json(res, 400, { error: 'Tidak ada data untuk diimpor' });
    if (!['merge', 'replace'].includes(mode)) return json(res, 400, { error: 'Mode import tidak valid' });

    const payload = makeImportPayload(data);

    // All statements below are ordered to remain compatible with an older
    // Neon schema even if its FK was created without ON DELETE CASCADE.
    if (mode === 'replace') {
      await sql`DELETE FROM vessels`;
      await sql`DELETE FROM hailing_records`;
      await sql`DELETE FROM operations`;
    } else {
      const recordIdsJson = JSON.stringify(payload.records.map(r => ({ id: r.id })));
      await sql`DELETE FROM vessels
        WHERE hailing_id IN (
          SELECT id FROM jsonb_to_recordset(${recordIdsJson}::jsonb) AS x(id text)
        )`;
    }

    if (payload.operations.length) {
      const operationsJson = JSON.stringify(payload.operations);
      await sql`INSERT INTO operations(id,name,created_at,updated_at)
        SELECT id,name,NOW(),NOW()
        FROM jsonb_to_recordset(${operationsJson}::jsonb) AS x(id text,name text)
        ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,updated_at=NOW()`;
    }

    const recordsJson = JSON.stringify(payload.records);
    await sql`INSERT INTO hailing_records(
      id,no,created_at,updated_at,date,time,posisi,destination,cargo,crew_count,captain,captain_phone,owner,owner_phone,company,nominal,raw_input,parser_confidence,ops_id,ops_name
    )
    SELECT
      id,
      COALESCE(no, ROW_NUMBER() OVER (ORDER BY id)::int),
      "createdAt","updatedAt",date,time,posisi,destination,cargo,"crewCount",captain,"captainPhone",owner,"ownerPhone",company,nominal,"rawInput","parserConfidence","opsId","opsName"
    FROM jsonb_to_recordset(${recordsJson}::jsonb) AS x(
      id text,no int,"createdAt" timestamptz,"updatedAt" timestamptz,date text,time text,posisi text,destination text,cargo text,"crewCount" int,captain text,"captainPhone" text,owner text,"ownerPhone" text,company text,nominal bigint,"rawInput" text,"parserConfidence" int,"opsId" text,"opsName" text
    )
    ON CONFLICT(id) DO UPDATE SET
      no=EXCLUDED.no,updated_at=EXCLUDED.updated_at,date=EXCLUDED.date,time=EXCLUDED.time,posisi=EXCLUDED.posisi,destination=EXCLUDED.destination,cargo=EXCLUDED.cargo,crew_count=EXCLUDED.crew_count,captain=EXCLUDED.captain,captain_phone=EXCLUDED.captain_phone,owner=EXCLUDED.owner,owner_phone=EXCLUDED.owner_phone,company=EXCLUDED.company,nominal=EXCLUDED.nominal,raw_input=EXCLUDED.raw_input,parser_confidence=EXCLUDED.parser_confidence,ops_id=EXCLUDED.ops_id,ops_name=EXCLUDED.ops_name`;

    if (payload.vessels.length) {
      const vesselsJson = JSON.stringify(payload.vessels);
      await sql`INSERT INTO vessels(id,hailing_id,name,type,gt)
        SELECT id,"hailingId",name,type,gt
        FROM jsonb_to_recordset(${vesselsJson}::jsonb) AS x(id text,"hailingId" text,name text,type text,gt text)
        ON CONFLICT(id) DO UPDATE SET
          hailing_id=EXCLUDED.hailing_id,name=EXCLUDED.name,type=EXCLUDED.type,gt=EXCLUDED.gt`;
    }

    return json(res, 200, {
      ok: true,
      count: data.length,
      mode,
      records: await allRecords()
    });
  } catch (e) {
    console.error('import error', e);
    const status = e?.code === 'INVALID_JSON' ? 400 : 500;
    return json(res, status, { error: e.message || 'Server error' });
  }
};
