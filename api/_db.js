const { neon } = require('@neondatabase/serverless');

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.NEON_DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('Database URL belum dikonfigurasi. Tambahkan DATABASE_URL atau POSTGRES_URL di Vercel Environment Variables.');
}

const sql = neon(DATABASE_URL);

async function initDatabase() {
  await sql`CREATE TABLE IF NOT EXISTS operations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS hailing_records (
    id TEXT PRIMARY KEY,
    no INTEGER NOT NULL,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    date TEXT,
    time TEXT,
    posisi TEXT,
    destination TEXT,
    cargo TEXT,
    crew_count INTEGER,
    captain TEXT,
    captain_phone TEXT,
    owner TEXT,
    owner_phone TEXT,
    company TEXT,
    nominal BIGINT,
    raw_input TEXT,
    parser_confidence INTEGER,
    ops_id TEXT,
    ops_name TEXT,
    CONSTRAINT fk_hailing_operation FOREIGN KEY (ops_id) REFERENCES operations(id) ON UPDATE CASCADE ON DELETE SET NULL
  )`;

  await sql`CREATE TABLE IF NOT EXISTS vessels (
    id TEXT PRIMARY KEY,
    hailing_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    gt TEXT,
    CONSTRAINT fk_vessel_hailing FOREIGN KEY (hailing_id) REFERENCES hailing_records(id) ON DELETE CASCADE
  )`;

  await sql`CREATE INDEX IF NOT EXISTS idx_hailing_date ON hailing_records(date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hailing_ops ON hailing_records(ops_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hailing_owner ON hailing_records(owner)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vessels_hailing ON vessels(hailing_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vessels_name ON vessels(name)`;
}

async function tableCount(table) {
  const rows = table === 'hailing_records'
    ? await sql`SELECT COUNT(*)::int AS count FROM hailing_records`
    : await sql`SELECT COUNT(*)::int AS count FROM operations`;
  return rows[0].count;
}

module.exports = { sql, initDatabase, tableCount };
