# Ticketing and EaseXchange handoff

This is the normal FastAPI application, configured through the existing database/JWT/CORS environment variables. No development database URL or demo ticket ledger is embedded in runtime code. The frontend retains its deployed API default and accepts VITE_API_BASE_URL (or the legacy VITE_API_URL alias).

## Event lifecycle and ticketing

Existing organiser creation and admin approval/rejection are reused. Creation may supply initial ticket categories; the backend persists categories and assigned seats in the same event transaction. Public discovery continues to require APPROVED status. The frontend never inserts submitted events optimistically, loads all event pages, and displays rejection reasons.

B owns `tickets`, `event_seats`, and `seat_claims`. Existing category-only events are supported without inventing seats. Category counters and unique seat claims prevent overselling. Existing booking and payment services create holds, confirm simulated payments, issue tickets, expire reservations, and cancel/refund permitted bookings. Payments recheck event status and late callbacks refund rather than issue against expired holds.

`Booking.user_id` remains the original purchaser. Each new ticket has an explicit current owner. A null current owner on an old ticket resolves to its booking purchaser. Ticket history queries the current owner; purchase history continues to query original bookings and does not reveal QR codes belonging to someone else. Admission and any completed exchange block original-booking refunds, including tickets subsequently exchanged back to their purchaser.

QR verification is read-only. Organiser/admin check-in records admission atomically and prevents repeat admission. Organisers can admit only their own events. Legacy unauthenticated whole-booking transfer is disabled; swaps must go through mutual consent and settlement. The legacy JSON `/state` write routes are removed; old verification links resolve actual ticket codes.

## EaseXchange

D stores requests, match consent snapshots and simulated settlements, referencing B's existing individual ticket IDs. It creates no duplicate tickets.

Requests may be PUBLIC or DIRECT. Direct requests name a recipient customer username; the server resolves it to an active customer. Only that recipient sees the invitation or can match against it. Public discovery never exposes direct requests. Existing request-to-request interest remains supported for suggestions and direct invitations.

Public-listing interest also supports direct ticket selection: a signed-in customer privately loads compatible owned tickets and submits `offeredTicketId`, without first creating a public exchange request. The backend revalidates eligibility and creates an internal DIRECT response plus a PENDING match atomically. This private workflow response does not appear in public discovery and never creates a duplicate ticket. Both customers must still accept before settlement; expressing interest alone does not change ticket ownership.

Eligibility requires a valid, confirmed, unadmitted ticket, active owner, approved future organiser event and supported currency. One active request reserves each ticket for exchange. Bilateral matching checks event, category and section preferences. Expiry and live ticket revision checks invalidate stale consent. Participant-only acceptance produces READY; acceptance alone never changes ownership. Either participant can cancel before settlement, including READY matches.

Settlement is explicitly simulated, as required by the briefing. The participant receiving the higher-priced ticket pays the difference. Declines retain both ticket owners/codes; successful retry swaps just the two ticket owners, marks their exchange timestamps, rotates both QR codes, and completes the workflow in one transaction. Repeat successful settlement does not swap twice. Existing booking purchasers, payments and inventory totals remain intact.

Reward-point discounts are deferred until Package C supplies an authoritative balance/redemption ledger and agreed conversion contract. No frontend reward total is accepted as payment.

API prefix: `/api/v1`.

- B: event seats, booking creation/pay, my bookings/cancel, my ticket history, ticket QR/verify/check-in.
- D: `/exchanges` and its `/listings`, `/invitations`, `/eligible-tickets`, `/mine`, request matches/interest/cancel, and match detail/accept/reject/cancel/settle routes.
- Direct ticket-based public interest: `GET /exchanges/{request_id}/eligible-tickets` and `POST /exchanges/{request_id}/ticket-interest` with `offeredTicketId`. Both require customer authentication.
- Existing JWT customer and staff guards apply. Authority fields and prices come from backend records.

## Applied migrations and release requirements

Existing revisions 0001–0005 are unchanged. New revision 0006 follows 0005 and creates exchange requests and matches with workflow constraints, consent snapshots, recipient references and indexes. New revision 0007 follows 0006 and creates event seats, unique active seat claims, settlement rows, and nullable owner/seat/check-in/exchange timestamp columns on existing tickets. It adds foreign keys and lookup indexes, without rewriting existing purchasers or inventing seating for old events. No backfill, seed, or existing-row deletion is included.

Revisions **0006** and **0007** have now been applied successfully to the real Supabase database in schema **public**. Its confirmed revision is **0007 (head)**. Post-migration checks confirmed the five new tables, four nullable ticket columns, all eight existing users, and matching counts/content fingerprints for all 17 pre-existing application tables. A verified pre-migration custom-format PostgreSQL backup was retained.

Docker/application startup deliberately does not apply migrations automatically. Future database changes require a separately authorized migration release step; deploy the application only after its required schema revision is present. A code push alone does not prepare a database schema.

## Safe verification

`python scripts/run_isolated_checks.py -q` creates a new disposable local PostgreSQL instance, overrides all database settings and ignores `.env`. It creates tables from SQLAlchemy model metadata, runs tests, then stops/removes the instance. It never executes Alembic. All tests requesting the migration fixture skip, and the migration comparison module is excluded. This verifies application behaviour but does not verify migration execution or the existing shared database schema.

Validated state as of 21 October 2026:

- Local A/B/D application flows passed; the full two-customer Package D swap was validated locally.
- Direct ticket-based public-listing interest is implemented and covered by frontend/backend tests.
- Reset Demo Data was validated locally, including preservation and rollback checks.
- Package A and Package B ticket persistence were smoke-tested successfully against the real Supabase database, as reported by the user.
- The full two-customer Package D flow has **not** yet been repeated against real Supabase. Local validation and passing unit/build checks do not establish that result.
- The latest pre-push review on this Mac passed **29 frontend tests**, **118 backend unit tests**, TypeScript and the production build. The frontend count includes two mocked reset-component interaction tests using an externally supplied matching `react-test-renderer`; those tests otherwise skip when that optional dependency is unavailable. Backend reset unit tests use inert fake sessions. Offline API inspection found all 17 checked frontend routes and matching reviewed payload contracts.
- That pre-push review did not run integration tests, connect to a database, invoke a real reset, or start either application. The documentation-only update likewise performs none of those actions.

The manual smoke-test results above and the migration confirmation are separate from the latest automated pre-push checks. No full Supabase Package D validation is claimed.

## Reset Demo Data safety gates

The same configured SQLAlchemy session powers reset in every environment; the
service contains no hard-coded database target. Reset is disabled by default.
Local development requires DEMO_RESET_ENABLED=true. Production or a nonlocal
database additionally requires ALLOW_PRODUCTION_DEMO_RESET=true. Both flags
default false. No runtime .env file was edited or feature permanently enabled.

The only UI mount is Administrator Dashboard > Overview. GET
/api/v1/admin/reset-demo-data/target is admin-only and returns environment,
database host/port/name/schema and effective gate state, never connection URLs,
DB usernames/passwords or tokens. The UI shows a prominent production/nonlocal
warning. Its target fingerprint must match on submission, so a changed target
requires a fresh preview and confirmation.

POST /api/v1/admin/reset-demo-data independently requires authenticated active
ADMIN, no outstanding password change, current username/password, the exact
phrase DELETE ALL APPLICATION DATA, strict boolean acknowledged=true, the target
fingerprint, and the environment's configuration gates. The frontend password is
masked and never persisted; all form fields clear on success, failure or cancel,
and the form unmounts on logout or identity change.

The reviewed child-to-parent DELETE order clears exchange settlements/matches/
requests, seat claims, assistance requests, tickets, payments, booking items/
bookings, event seats, ticket categories, fraud signals, audit logs, events and
event sources. A metadata guard refuses an unexpected dependency that could
impact preserved data. Table locks and a five-second lock timeout remain; there
is one commit and a full rollback on failure. Foreign keys stay enabled. No
tables are dropped and no migrations run as part of reset.

Users, stable IDs, names/emails, password hashes, roles/status/password-change
state, refresh/reset tokens, login history, narration and accessibility settings
are preserved. Full preservation and original-credential login are validated in
a disposable local schema; the existing manual A/B/D data is not reset by this
task. Production tests exercise authorization logic only, never a real database.

See frontend checkout docs/RESET_DEMO_DATA_HARDENING.md for current-device test
results, exact local process-only startup instructions and remaining limits.
