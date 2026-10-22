# EventEase Backend

REST API for EventEase, a ticketing platform for concerts, theatre, sports and
cultural events in Singapore. Built with **FastAPI, SQLAlchemy 2, Alembic and
PostgreSQL**. All endpoints are versioned under `/api/v1`, and interactive docs
are served at **`/api/docs`**.

- Currency is SGD; every price is an **integer number of cents**.
- Timestamps are stored in UTC. Date-only filters and timezone-less input are
  interpreted as Asia/Singapore time.
- Every error uses one shape:
  `{"error": {"code": "USERNAME_TAKEN", "message": "username is taken", "details": {}}}`

## Contents

1. [Quick start](#quick-start)
2. [Configuration](#configuration)
3. [Database, migrations and seeding](#database-migrations-and-seeding)
4. [Running the tests](#running-the-tests)
5. [API overview](#api-overview)
6. [Design notes and assumptions](#design-notes-and-assumptions)
7. [Deployment](#deployment)

## Quick start

Requirements: Python 3.12 and a PostgreSQL 14+ database (local, Docker or Supabase).

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate      macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt

cp .env.example .env              # PowerShell: Copy-Item .env.example .env
# edit .env: database settings and JWT_SECRET (any 32+ random characters)

alembic upgrade head              # create / upgrade the schema
python -m app.cli seed-admin      # prints the generated admin password ONCE
python -m app.cli seed-sample     # optional: labelled sample events (dev only)
uvicorn app.main:app --reload     # http://localhost:8000/api/docs
```

### With Docker Compose (Postgres + API)

```bash
cp .env.example .env              # set POSTGRES_PASSWORD (any local value) and JWT_SECRET
docker compose up --build
docker compose exec api python -m app.cli seed-admin
```

The API container runs `alembic upgrade head` before it starts.

### npm-style aliases

`package.json` maps the spec's commands onto the Python CLI. Activate the
virtualenv first.

| npm script | Runs |
|---|---|
| `npm run seed:admin` | `python -m app.cli seed-admin` |
| `npm run admin:reset-password -- --username eventeaseadmin` | `python -m app.cli admin-reset-password --username eventeaseadmin` |
| `npm run migrate` | `alembic upgrade head` |
| `npm test` | `python -m pytest` |

## Configuration

All configuration comes from environment variables or `.env`. See
[.env.example](.env.example) for the full list. Never commit `.env`.

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | `development`, `test` or `production` |
| `DATABASE_URL` *or* `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME` | – | PostgreSQL connection |
| `DB_SSLMODE` | `require` | `disable` for local Docker |
| `DB_SCHEMA` | `public` (EventEase sets `eventease`) | Schema holding the EventEase tables |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | `5` / `5` | Keep the total below your pooler's client limit (Supabase session pooler: 15) |
| `JWT_SECRET` | – | **Required in production**, at least 32 characters |
| `ACCESS_TOKEN_TTL_MINUTES` / `REFRESH_TOKEN_TTL_DAYS` | `15` / `7` | Token lifetimes |
| `ADMIN_USERNAME` | `eventeaseadmin` | Default administrator |
| `ADMIN_PASSWORD` | *(blank)* | Optional; leave blank to generate one on first seed |
| `AUTO_SEED_ADMIN` | `true` | Seed on startup if no admin exists (see [Default administrator](#default-administrator)) |
| `CORS_ORIGINS` / `CORS_ORIGIN_REGEX` | localhost / `*.figma.site`, `*.figma.com` | Allowed frontend origins (credentials enabled) |
| `FRONTEND_URL` | `http://localhost:5173` | Used in password-reset links |
| `TICKETMASTER_API_KEY` | *(blank)* | Enables the Ticketmaster Discovery adapter |
| `PURCHASE_LIMIT_PER_EVENT` | `6` | Max tickets per customer per event |
| `BOOKING_HOLD_MINUTES` | `10` | Seats held while awaiting payment |
| `CANCELLATION_CUTOFF_HOURS` | `48` | Customers can cancel up to this long before the event |
| `PAYMENT_PROVIDER` | `mock` | `mock` or `stripe` (with `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) |
| `MAIL_TRANSPORT` | `console` | Development transport that prints emails to stdout |
| `RATE_*` | see `app/core/config.py` | Per-IP / per-identifier rate limits (`count/seconds`) |
| `FRAUD_*` | see `app/core/config.py` | Fraud detection thresholds |
| `DATA_RETENTION_DAYS` | `90` | PDPA retention for login attempts and sign-up IPs |

## Database, migrations and seeding

```bash
alembic upgrade head                                   # apply migrations
alembic revision --autogenerate -m "describe change"   # after editing app/db/models
python -m app.cli seed-admin                           # idempotent
python -m app.cli admin-reset-password --username eventeaseadmin
python -m app.cli seed-sample                          # refuses to run in production
python -m app.cli ingest-events                        # Ticketmaster sync (needs API key)
python -m app.cli purge-old-data                       # PDPA retention (also runs daily in the API)
```

### Legacy tables

Migration `0001` renames the old `users`, `events` and `eventease_state` tables
to `legacy_*`. No data is dropped. It only renames tables in `DB_SCHEMA`.

On Supabase, those tables are owned by `postgres`, not by the application role.
In that case the migration stops with instructions instead of guessing.

**EventEase uses `DB_SCHEMA=eventease`** (set in `render.yaml` and
`.env.example`), so the new tables live in their own schema and the legacy
tables stay untouched in `public`. The alternative, if you ever want the tables
in `public`, is to run [scripts/rename_legacy_tables.sql](scripts/rename_legacy_tables.sql)
in the Supabase SQL editor first.

### Default administrator

- Username: `ADMIN_USERNAME` (default `eventeaseadmin`). It is reserved, so
  sign-up treats it as taken.
- Password: no password is ever hard-coded.
  - If `ADMIN_PASSWORD` is set and passes the password rules, it is used.
  - Otherwise a 20-character password is generated with a CSPRNG and printed
    **once** to the console. It is never logged or written to a file.
- The account has no email address, so forgot-password does not apply to it.
  Recover access with `admin-reset-password`, which works on the server only,
  never over HTTP.
- The account is created with `mustChangePassword = true`. Until the password
  is changed:
  - login returns `"redirectTo": "/admin/change-password"`;
  - every admin route returns `403 PASSWORD_CHANGE_REQUIRED`.
- **In production, startup seeding only happens when `ADMIN_PASSWORD` is set.**
  A generated password would otherwise end up in the host's log store. If you
  don't set it, run `python -m app.cli seed-admin` from the Render shell.

## Running the tests

```bash
python -m pytest            # about 213 tests
python -m pytest tests/unit # rule tests only; no database needed
```

Integration tests run against real PostgreSQL inside an isolated schema
(`TEST_DB_SCHEMA`, default `eventease_test`):

- The schema is created by running the real Alembic migrations and dropped at
  the end.
- The suite refuses to run against `public`.
- Point `TEST_DATABASE_URL` at a dedicated test database to keep tests off a
  shared server.
- Set `KEEP_TEST_SCHEMA=1` to inspect the schema after a run.

Coverage highlights:

- Every username, password, email and phone rule, with exact error messages.
- Login (unknown user, wrong password, lockout, redirect for each role).
- Sign-up suggestions are verified against the database.
- An admin cannot be created through sign-up.
- The admin seed is idempotent and contains no hard-coded password.
- Role guards, plus a deny-by-default check over every route.
- Organisers are isolated from each other's events.
- **Concurrent booking cannot oversell.**
- Cancellation restores inventory and issues a refund.
- Every fraud detector.

## API overview

Endpoints marked 🔒 need `Authorization: Bearer <accessToken>`.

**Auth** (`/api/v1/auth`)

- Login and sign-up:
  - `POST /login`: body `{identifier, password}`. Unknown identifier → `404 SIGNUP_REQUIRED`; wrong password → `401 INVALID_CREDENTIALS`.
  - `POST /signup`: role is `CUSTOMER` or `ORGANISER` only; `ADMIN` → `403 ROLE_NOT_ALLOWED`.
  - `GET /username-available?username=`: same codes and suggestions as sign-up.
- Passwords:
  - `POST /forgot-password`: always `200`.
  - `POST /reset-password`.
  - 🔒 `POST /change-password`.
- Session:
  - `POST /refresh` and `POST /logout`: use the httpOnly refresh cookie.
  - 🔒 `GET /me`.

**Events**

- `GET /api/v1/events`: public. Query params: `q`, `category`, `dateFrom`, `dateTo`, `location`, `priceMin`, `priceMax` (SGD), `sort` (`date`, `-date`, `price`, `-price`), `page`, `pageSize`.
- 🔒 `GET /api/v1/events/{id}`: returns `401 LOGIN_REQUIRED` with `details.eventId` when not logged in.

**Customer** 🔒

- `POST /api/v1/bookings` (optional `Idempotency-Key` header)
- `POST /api/v1/bookings/{id}/pay`
- `GET /api/v1/me/bookings?when=upcoming|past|all`
- `GET /api/v1/me/bookings/{id}`
- `POST /api/v1/me/bookings/{id}/cancel`
- `GET /api/v1/me/tickets/history`

**Organiser** 🔒 (`/api/v1/organiser/events`)

- `POST` · `GET` · `GET /{id}` · `PATCH /{id}`
- `GET|POST /{id}/ticket-categories` · `PATCH|DELETE /{id}/ticket-categories/{categoryId}`
- `GET /{id}/sales`

**Admin** 🔒 (`/api/v1/admin`)

- Events:
  - `GET /events` · `GET /events/{id}`
  - `POST /events/{id}/approve | reject | suspend | unsuspend`
  - `POST /events/import` (CSV or JSON)
  - `POST /sources/ticketmaster/sync`
- Users: `GET /users` · `POST /users/{id}/suspend | unsuspend`
- Monitoring:
  - `GET /fraud-signals` · `POST /fraud-signals/{id}/review | dismiss`
  - `GET /audit-logs`

### Login responses for the frontend

```json
{ "accessToken": "...", "tokenType": "Bearer", "expiresIn": 900,
  "user": { "id": "...", "username": "...", "role": "CUSTOMER" },
  "redirectTo": "/customer/dashboard", "mustChangePassword": false }
```

- Keep the access token in memory. The refresh token is set as an httpOnly
  cookie scoped to `/api/v1/auth`.
- Call `/refresh` with `credentials: "include"`.
- In production the cookie is `SameSite=None; Secure`, because the frontend and
  API live on different sites.

### Importing curated events

CSV columns or JSON keys:

- **Required:** `sourceName`, `title`, `category`, `venueName`, `startAt`, `externalUrl`.
- **Optional:** `externalId`, `shortDescription`, `description`, `area`, `endAt`, `imageUrl`, `priceMin`, `priceMax` (SGD).

Rows are de-duplicated by `(sourceName, externalId)`. If `externalId` is
missing, it is derived from the URL. Invalid rows are reported per row and do
not block the rest of the import.

## Design notes and assumptions

- **Real events only.** Imported and Ticketmaster events have
  `origin = EXTERNAL`. They are never purchasable here and link to the official
  page instead. Sample data is fictional, titled `[SAMPLE] …`, flagged
  `is_sample` and hidden in production.
- **Ticketmaster Discovery API.** Terms were checked on 2026-10-17:
  - default quota is 5,000 calls/day at 5 requests/second;
  - content may only be cached for reasonable periods, and must be removed
    within 24 hours on request;
  - you may not derive revenue from the API.

  The adapter only lists events, links back to Ticketmaster, and prunes them a
  week after they end. **Confirm with Ticketmaster before any commercial use.**
- **Overselling.** Each purchase reserves seats with one conditional
  `UPDATE … WHERE total - sold - held >= n`. A DB check constraint
  (`sold + held <= total`) backs it up.
- **Purchase limit.** The limit is enforced under a row lock on the customer.
  It counts both PENDING_PAYMENT and CONFIRMED tickets.
- **Ticket pricing.** "Price cannot be reduced below what's sold" is read as:
  once a category has sales, its price may go up but not down, and quantity
  cannot fall below sold + held.
- **Suspensions.** Suspending an event cancels unpaid holds and emails affected
  customers. Confirmed bookings are **not** refunded automatically.
- **Event status.** Besides `REVIEW_IN_PROGRESS`, `APPROVED` and `REJECTED`,
  events can be `SUSPENDED`.
- **Account enumeration (accepted).** Login returns `SIGNUP_REQUIRED` for
  unknown identifiers, and `username-available` reveals taken names. Both are
  required by the spec and mitigated with rate limits.
- **Lockout.** 5 consecutive failures lock an account for 15 minutes. The
  counter lives in the database. `forgotPasswordAvailable` is `false` for the
  admin, which has no email.
- **Username and password rules.**
  - Usernames allow digits 0–8 only (9 is rejected, as specified).
  - An empty username fails with `USERNAME_INVALID_CHARS`.
  - A password "symbol" is any character that isn't an ASCII letter, a digit or
    whitespace. Passwords are capped at 128 characters.
- **PDPA.**
  - Contact details are only returned to their owner (`/auth/me`). Admin views
    mask them.
  - Fraud signals store a masked phone number, never the raw one.
  - Login attempts and sign-up IPs are purged after `DATA_RETENTION_DAYS`.
- **Rate limiting** is in memory, which is fine for one instance. Use a shared
  store before scaling out. Lockout and fraud data are already in the database.
- **Connection pooling.** The Supabase session pooler ignores libpq startup
  options, so `search_path` is set on every new connection. Use the session
  pooler (port 5432) or a direct connection, **not** transaction mode (6543).

## Deployment

The Render blueprint is in [render.yaml](render.yaml).

1. Set the database variables, `ADMIN_PASSWORD` (or seed later from the shell),
   `CORS_ORIGINS` and `FRONTEND_URL`. `JWT_SECRET` is generated automatically.
2. Keep `DB_SCHEMA=eventease`; the first deploy creates that schema and its
   tables (see [Legacy tables](#legacy-tables)).
3. The container runs `alembic upgrade head` and serves with
   `--proxy-headers`, so client IPs come from `X-Forwarded-For`.
4. `/health` reports `{"status": "healthy", "database": "connected"}`.
