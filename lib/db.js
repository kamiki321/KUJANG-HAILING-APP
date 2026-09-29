const { neon } = require('@neondatabase/serverless');
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.NEON_DATABASE_URL;
if (!DATABASE_URL) throw new Error('Database URL belum dikonfigurasi. Tambahkan DATABASE_URL di Vercel Environment Variables.');
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
    trip TEXT,
    CONSTRAINT fk_hailing_operation FOREIGN KEY (ops_id) REFERENCES operations(id) ON UPDATE CASCADE ON DELETE SET NULL
  )`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS no INTEGER`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS date TEXT`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS time TEXT`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS posisi TEXT`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS destination TEXT`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS cargo TEXT`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS crew_count INTEGER`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS captain TEXT`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS captain_phone TEXT`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS owner TEXT`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS owner_phone TEXT`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS company TEXT`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS nominal BIGINT`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS raw_input TEXT`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS parser_confidence INTEGER`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS ops_id TEXT`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS ops_name TEXT`;
  await sql`ALTER TABLE hailing_records ADD COLUMN IF NOT EXISTS trip TEXT`;
  await sql`UPDATE hailing_records SET no=COALESCE(no,0)`;
  await sql`CREATE TABLE IF NOT EXISTS operation_trips (
    id TEXT PRIMARY KEY,
    ops_id TEXT NOT NULL,
    trip TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_operation_trip_operation FOREIGN KEY (ops_id) REFERENCES operations(id) ON DELETE CASCADE,
    CONSTRAINT uq_operation_trip UNIQUE (ops_id, trip)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_operation_trips_ops ON operation_trips(ops_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hailing_trip ON hailing_records(trip)`;
  // Backfill trips that already existed on hailing records into the dedicated trip registry.
  await sql`
    INSERT INTO operation_trips(id, ops_id, trip, created_at, updated_at)
    SELECT md5(h.ops_id || ':' || h.trip), h.ops_id, BTRIM(h.trip), NOW(), NOW()
    FROM hailing_records h
    WHERE h.ops_id IS NOT NULL AND BTRIM(COALESCE(h.trip,'')) <> ''
    ON CONFLICT (ops_id, trip) DO NOTHING
  `;
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

  // ---------- AUTH: users + sessions ----------
  await sql`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS role`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users (LOWER(username))`;
  await sql`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    user_agent TEXT,
    CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`;
}
module.exports = { sql, initDatabase };
