# KRI KUJANG Hailing Log — Vercel + Neon PostgreSQL

## Vercel Hobby: single Serverless Function

This version consolidates the entire API into **one Vercel Serverless Function**:

```text
api/index.js
```

All API paths are internally dispatched by `api/index.js`. The implementation modules live outside the `api/` directory under `lib/api-internal/`, so Vercel does not count them as additional Serverless Functions.

### API endpoints

- `GET /api/health`
- `POST /api/auth-login`
- `POST /api/auth-refresh`
- `POST /api/auth-logout`
- `GET /api/auth-me`
- `GET /api/records`
- `POST /api/records`
- `GET /api/record?id=...`
- `PUT /api/record?id=...`
- `DELETE /api/record?id=...`
- `POST /api/records/bulk-delete`
- `GET /api/operations`
- `POST /api/operations`
- `DELETE /api/operation?id=...`
- `POST /api/import`

## Environment variables

Set these in Vercel:

```text
DATABASE_URL=...
AUTH_JWT_SECRET=...
DEFAULT_ADMIN_USERNAME=kujang642
DEFAULT_ADMIN_PASSWORD=...
```

`AUTH_JWT_SECRET` should be at least 32 random characters.

## Deploy

1. Extract this ZIP.
2. Import the project into Vercel.
3. Configure the environment variables above.
4. Deploy.

The existing Neon database is used; this refactor does not intentionally reset the application data.
