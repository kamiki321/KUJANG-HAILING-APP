const { cors, json, body, ensureInitialized, getRecord, saveRecord, sql } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    await ensureInitialized();
    const id = String(req.query?.id || '').trim();
    if (!id) return json(res, 400, { error: 'ID data hailing wajib diisi' });

    if (req.method === 'GET') {
      const record = await getRecord(id);
      return record ? json(res, 200, record) : json(res, 404, { error: 'Record tidak ditemukan' });
    }

    if (req.method === 'PUT') {
      if (!(await getRecord(id))) return json(res, 404, { error: 'Record tidak ditemukan' });
      return json(res, 200, await saveRecord(await body(req), id));
    }

    if (req.method === 'DELETE') {
      const existing = await getRecord(id);
      if (!existing) return json(res, 404, { error: 'Record tidak ditemukan' });
      // Explicit child delete keeps this working even when an older Neon schema
      // was created without ON DELETE CASCADE.
      await sql`DELETE FROM vessels WHERE hailing_id=${id}`;
      const result = await sql`DELETE FROM hailing_records WHERE id=${id}`;
      if (!Number(result.count || 0)) return json(res, 404, { error: 'Record tidak ditemukan' });
      return json(res, 200, { ok: true, id, deleted: 1 });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('record route error', e);
    return json(res, 500, { error: e.message || 'Server error' });
  }
};
