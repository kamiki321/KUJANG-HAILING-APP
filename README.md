# KRI KUJANG Hailing Log — Vercel + Neon + Authentication

## Authentication

The application now requires login before the dashboard/API can be accessed.

Default account:
- Username: `kujang642`
- Password: `Kujang642Satkat1#`

The default password is represented in the server source only as a precomputed **scrypt hash**. The database never stores the plaintext password.

Recommended Vercel environment variables:
- `DATABASE_URL` — Neon connection string
- `AUTH_JWT_SECRET` — random secret, minimum 32 characters
- `DEFAULT_ADMIN_USERNAME` — defaults to `kujang642`
- `DEFAULT_ADMIN_PASSWORD` — optional; if provided, it must satisfy the password rules

## Password validation

Minimum 8 characters, at least:
- 1 uppercase letter
- 1 number
- 1 special character

Validation exists in both the browser and backend.

## Token/session design

- Access token: short-lived HMAC-SHA256 JWT (15 minutes), held by the browser in sessionStorage.
- Refresh token: cryptographically random opaque token, stored only as a SHA-256 hash in `user_sessions` and sent to the browser as an HttpOnly + Secure + SameSite=Lax cookie for 30 days.
- Refresh rotation: each refresh invalidates the previous refresh session and creates a new one.
- Logout: revokes the refresh session and clears the cookie.
- Browser refresh/reopen: the HttpOnly refresh cookie silently creates a new access token, keeping the user logged in.

## Database tables

Required user table:

```sql
CREATE TABLE "user" (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Additional session table:

```sql
CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The existing hailing/operations/vessels tables and CRUD/import behavior are retained.
