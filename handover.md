# Handover: Eventfinda import, EventEase organisation, sales cut-off and QR release

Status at 31 Oct 2026.

**Where things stand**

- The backend and website code is **committed and pushed to `main`**.
- **Migration 0015 is applied to the shared database** (step 3 is done). The migration went on before the team's OK was collected, at the user's decision, so **tell the team now** (step 2).
- The EventEase organisation and `admin_eventease` account **exist**.
- **The `QR_RELEASE` job is switched OFF** in the database so no real customers get emailed. Switch it on only after decision B in section 4.
- The `EVENTFINDA_SYNC` job is on, but only backends with the Eventfinda login can import. Backends without it log "Skipped".
- Backend tests pass, apart from 12 failures that were already there before this work.
- The website type-checks and builds, but **it has never been opened and clicked through**.
- The import has never run against the real database.

**Next up:** step 2 (tell the team), step 4 (run the import), step 5 (click through), step 7 (Render).

Passwords and API logins are not in this file. They are in `project/backend/.env`, which Git ignores.

---

## 1. What was agreed

The team wants real Singapore events on EventEase that customers can buy on our own site.

- **Source:** the Eventfinda API. It gives title, venue, category, dates, image and description. It gives **no organiser and no ticket tiers or prices**, so EventEase generates those.
- **EventEase organisation:** self-run and hidden from sign-up. It does appear in the organiser sign-in dropdown, otherwise its members could not log in.
- **Default account:** organiser `admin_eventease`, locked like Janice, John and Jay. It is the organisation's manager.
- **Members:** only `admin_eventease` can create EventEase accounts (username, email, temporary password). They are approved at once with no admin request, their email counts as verified, and they must change the password at first login. They cannot create accounts themselves. The user will create Jane this way as a test.
- **Import:** runs only from the scheduler, by reusing the old "Ticketmaster Event Sync" job. Events show "Imported by System", belong to EventEase and are approved immediately. Repeat runs only add new events and never overwrite edits.
- **Skipped events:** business, conference, workshop, virtual and cancelled events, and events starting within 30 days.
- **Tiers:** VIP > Standard = Special Assistance > Concession, with random prices. Random 200 to 2,000 seats per event, VIP the smallest share and Standard the largest.
- **Members' own events:** still need admin approval, shown in a separate EventEase section on the admin page.
- **Every event on the site:**
  - Ticket sales close 30 days before the start.
  - Before that, tickets show Confirmed with no QR code, and EaseXchange works.
  - From then on, each customer gets their QR code by email, and EaseXchange closes for that ticket.
- **Browse:** 10 events per page by default, with 20 and 50 options.
- **Username rule:** underscores are now allowed.

---

## 2. What is done

### Backend (`project/backend`)

| Area | Where | Notes |
|---|---|---|
| Migration 0015 | `alembic/versions/0015_eventease_and_eventfinda.py` | Adds `events.organisation_id`, `organisations.manager_id`, `bookings.qr_released_at`; relaxes the event owner check; replaces `TICKETMASTER_SYNC` with `EVENTFINDA_SYNC` (keeps its 6-hour schedule and history, switched on); adds `QR_RELEASE` (daily 07:00 SGT) |
| Setup command | `python -m app.cli seed-eventease` | Creates the organisation and manager; safe to run twice; reads the password from `.env` |
| Members | `services/organisations.py`, `api/v1/organisations.py` | `GET/POST /me/organisation/members`; `GET /organisations?purpose=signin`; requests to join EventEase are refused (`ORGANISATION_INVITE_ONLY`) |
| Shared events | `core/deps.py`, `services/organiser.py`, `services/analytics.py` | The website sends `X-Organisation-Id`; `managed_by()` and `can_manage()` decide access. Normal organisers behave as before |
| Import | `services/ingestion/eventfinda.py`, `services/scheduler.py` | Fetch, filter, map, generate tiers, save |
| Sales cut-off | `services/events.py` (`sales_close_at`), `services/bookings/policy.py` | Setting `SALES_CLOSE_DAYS_BEFORE_EVENT`, default 30; error `SALES_CLOSED` |
| QR release | `services/bookings/qr_release.py`, `queries.py`, `notifications.py`, `api/v1/tickets.py`, `services/exchange_ticketing.py` | Ticket codes are hidden from the API until release; the confirmation email no longer contains codes; a QR or check-in before release gets `QR_NOT_RELEASED` |
| Admin data | `services/admin.py` | Event rows now carry `organisationName` and `imported` |

### Website (`project/frontend/src`)

- `lib/currentOrganisation.ts` (new); both request helpers send the organisation header.
- `pages/Login.tsx`: the sign-in dropdown uses its own list that includes EventEase.
- `pages/OrganizerDashboard.tsx`: shows everything the backend returns, adds a Team tab for the manager only and an "Imported by System" badge.
- `components/OrganisationTeam.tsx` (new): team list and create-account form.
- `components/TicketTierEditor.tsx` (new): edits tier price and seats under My events. No such screen existed before, so organisers had no way to change prices.
- `pages/AdminDashboard.tsx`: separate "EventEase events" and "Other organisers" sections.
- `pages/EventDetail.tsx`: "Ticket sales closed" banner, "Organised by", and Confirmed without QR.
- `pages/CustomerDashboard.tsx`: Confirmed badge, "QR code available from", Exchange only before release.
- `pages/Browse.tsx`: pagination, kept in the page address as `page` and `size`.
- `pages/SelectOrganisation.tsx`: reloads the page after choosing, because the event list depends on the organisation.

### Also in the working folder

- Type-error fixes in teammates' files: `Profile.tsx`, `OrganizerDashboard.tsx` (missing imports that would crash its screens), `OperationsSeatMap.tsx`, `SecureExchange.tsx`.
- The old top-level `backend/`, `frontend/` and `node_modules/` folders were deleted. They were not tracked by Git. Everything now lives in `project/`.
- `project/backend/.env` and `project/frontend/.env` hold the local settings, including the Eventfinda login and manager details.

### Test results

| Check | Result |
|---|---|
| Backend tests | 1,371 passed, 12 failed, 3 skipped. After that run I made a small locking change to the QR release job and re-ran only its 5 tests, which passed. Run the full suite once more before committing |
| Frontend type check and build | Pass |
| Migration 0015 | Applied, undone and re-applied on a throwaway database built through the real migration chain; job history moved correctly |
| `alembic check` | Reports one gap, not from this work: see item 7 in section 5 |
| Browser testing | **Not done** |
| Frontend automated tests | None exist for these screens |

New tests are in `tests/integration/test_eventease.py`. Existing tests were moved to dates beyond the 30-day cut-off, and helpers `with_ticket_codes` and `release_qr` were added to `tests/helpers.py`.

---

## 3. Remaining work, in order

### Step 1: Decide the questions in section 4

Decisions A and B change what happens the moment the migration and jobs go live, so settle them first.

### Step 2: Tell the team and get their OK

The team's agreement to migration 0015 is **still outstanding**. Tell them:

- It changes the shared `events`, `organisations` and `bookings` tables. Existing rows are not changed.
- Once it is applied, **every teammate's backend needs this code**, or it will fail on the changed tables and scheduler jobs.
- The 30-day rule and hidden QR codes apply to all events, including ones they are testing.
- Their local `.env` files need no change to run, but only a backend with the Eventfinda login can import.

### Step 3: Apply to the shared database

Run from `project/backend`:

```
git pull                                  # first check for new teammate work
.venv/Scripts/python -m alembic current
```

- Proceed only if it reports **0014**. If it reports something else, a teammate has a migration of their own: wait for their file, renumber ours if needed, and **never stamp or force a version**.

```
.venv/Scripts/python -m alembic upgrade head
.venv/Scripts/python -m app.cli seed-eventease
```

- Restart the backend without `--reload`, because reload is unreliable on this machine. Stop whatever is on port 8000 first.

```
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

- Start the website with `npm run dev` in `project/frontend`, at http://localhost:5173.

To undo: `alembic downgrade 0014`. **Warning:** undoing deletes every imported event, and it fails if any imported event already has bookings.

### Step 4: Run the import once

In Developer Settings, run "Eventfinda Event Import" now.

- **Expect about 5 events, not 25.** On today's data, 39 events break down as 5 to import, 24 starting within 30 days, 9 business or conference, and 1 virtual.
- Check the job log for the summary line. "Skipped: …" means the login or organisation is missing.

### Step 5: Click through everything

- [ ] Sign-up dropdown does not list EventEase; organiser sign-in dropdown does.
- [ ] Sign up as an organiser typing "EventEase": refused with a clear message.
- [ ] Log in as `admin_eventease` with EventEase chosen: Team tab shows; imported events are in My events with the badge.
- [ ] Team tab: create Jane. No admin request appears. Check the emailed text has no password.
- [ ] Log in as Jane: forced to change password, then sees the imported events, and no Team tab.
- [ ] As Jane, "Manage ticket tiers": change a price and seats, confirm on the event page.
- [ ] As Jane, create an event with the normal form: it appears under "EventEase events" for the admin and needs approval.
- [ ] Log in as a normal organiser: EventEase events are not visible, and their own events still work.
- [ ] Browse: imported events show; 10/20/50 and page numbers work (fewer than 11 events shows no page buttons); refreshing keeps the page; changing a filter returns to page 1.
- [ ] As a customer, buy an imported event: Confirmed, no QR; email has no ticket code; Exchange button present.
- [ ] Open an event inside 30 days: "Ticket sales closed" banner, buying is disabled.
- [ ] Developer Settings: set the business date to within 30 days of that event and run "Ticket QR Release": QR shows and the email arrives with codes. **Use a test account you own** (see decision B). Note that the QR screens themselves follow the real date; only the job uses the simulated date.
- [ ] After release, Exchange is gone for that ticket and swaps are refused.
- [ ] Reset the business date afterwards.
- [ ] Gate check-in works on a released ticket, including for an EventEase member.
- [ ] Phone width: Team page, tier editor, Browse pager.

### Step 6: Commit and push

Only when the user asks. Project rules:

- Pull first. Work on `main` directly.
- **Stage files by name**, never `git add .`.
- **Never commit `.env` or `.env.example`.**
- **No "Co-Authored-By: Claude" line** in commit messages.
- Run the full test suite and frontend build first.

Include this file only if the team wants it in the repo.

### Step 7: Live site (Render)

- Add these to the backend service's Environment settings, and to `project/render.yaml` with `sync: false`, which currently lists none of them: `EVENTFINDA_USERNAME`, `EVENTFINDA_PASSWORD`.
- `seed-eventease` does not need to run again, because the database is shared.
- Fix email first, or release emails will not arrive: Render's free plan blocks SMTP. See `docs/email-sender-implementation-plan.md`.

---

## 4. Decisions needed

**A. Only about 5 events can be imported today.**
Most Eventfinda events start within 30 days, so they are skipped, and the same rule closes sales on them. Pagination will also barely show. Options: keep it and let events build up with each 6-hour run (more only appear as Eventfinda lists further ahead); lower `SALES_CLOSE_DAYS_BEFORE_EVENT`; or import those events with sales shown as closed. This was the user's decision (skip them), so check they are happy with the number.

**B. The first QR release run will email real customers.**
`QR_RELEASE` is switched on by the migration. Its first run covers every confirmed booking for events now inside 30 days, including real accounts in the shared database. Also, a backend with `MAIL_TRANSPORT=console` will mark bookings released while only printing the email, so the customer never gets it. Recommendation: switch the job off straight after migrating, and keep it on only on one backend with real email. Confirm how this should run.

**C. Existing customers' QR codes will disappear.**
Confirmed bookings for events more than 30 days away will stop showing their QR until release. That follows the rule, but it changes what those people see today, and earlier confirmation emails already contained their codes.

**D. Seats are random, not based on the venue.**
The user first said availability depends on the venue, then chose random 200 to 2,000. Eventfinda gives no capacity. A small venue can get 2,000 seats. Random is what is built.

**E. Prices are invented.**
Fine for a project demo with mock payments. Not suitable for selling real tickets to real events.

**F. Event details are locked once approved.**
This is the existing rule for all events. Since imported events start approved, members can change tiers and prices but **not** the title, description or dates. If "manage like my own event" should include those, `EDITABLE` in `services/organiser.py` needs a change for imported events.

**G. `admin_eventease` email.**
Set to a `+eventease` address on the team's sending inbox, in `.env`. The user never specified one. Password resets for this account are blocked by the lock in any case.

---

## 5. Known issues not fixed

1. **12 existing test failures**, present before this work:
   - `test_admin`: route protection (`test_every_route_is_protected...`)
   - `test_bookings`: `test_expired_hold_releases_seats`, `test_stripe_webhook_disabled_with_mock_provider`
   - `test_demo_reset` (integration, 2) and `tests/unit/test_demo_reset.py` (3)
   - `test_dip_refactor`: session factory
   - `test_live_ticketing`: `test_seat_selection_constraints_and_hold_expiry`
   - `test_scheduler_and_clock`: `test_business_clock_and_scheduler`
   - `test_mail`: `test_sendgrid_mailer_send`. It appears to contact the real SendGrid service, since the log shows a 401 from it; a test should not do that.
   - The two hold-expiry failures are worth checking first: paying after a hold expired seems to succeed in that test.
2. **The disposable-database test runner was deleted** by a teammate's cleanup (`bad4930`), but `tests/conftest.py` still points to it. To run tests safely:
   - Recover it: `git show c551e74:backend/scripts/run_isolated_checks.py`.
   - Change its `root` to `project/backend`.
   - Copy the `tzdata` package's `zoneinfo` folder into `.venv/Lib/site-packages/pgserver/pginstall/share/postgresql/timezone`, because the test database has no timezone data otherwise.
   - Never point tests at the shared database. Consider restoring the runner to the repo.
3. **Migration tests are skipped**: the runner excludes `test_schema.py`, so migration 0015 was tested with a separate throwaway script.
4. **Members cannot preview an in-review EventEase event on the public page** unless they created it (`can_view` in `services/events.py`). They can still see it in My events.
5. **If two backends run the import together**, the second can fail on the unique rule. No duplicates can result, and the next run recovers.
6. **Ticketmaster leftovers:** the job is gone, but the admin route, the `ingest-events` command, `services/ingestion/ticketmaster.py` and `frontend/src/lib/eventsApi.ts` remain. The user said not to involve Ticketmaster, so these can be removed.
7. **`venues.easeexplore_360_url`** is in the model with no migration. A fresh database will lack it. Check whether the shared database has it, and add a migration if a teammate has not.
8. **Migration 0012 alters `easepix`**, which no migration creates, so a brand-new database cannot run the migrations from scratch.
9. **`lib/api/*.ts` duplicates `lib/backendApi.ts`.** The store uses `backendApi.ts`. Only `lib/api/client.ts` was updated with the organisation header; the event mapping was changed in `backendApi.ts` only.
10. **The Eventfinda login and manager password were shared in chat.** Consider changing the manager password. It cannot be changed through the app while the account is locked, so that needs a deliberate one-off change.

---

## 6. Settings

Add these to `project/backend/.env`. Do not put real values in `.env.example`, and do not commit that file.

| Setting | Purpose |
|---|---|
| `EVENTFINDA_USERNAME`, `EVENTFINDA_PASSWORD` | Eventfinda API login |
| `EVENTEASE_MANAGER_EMAIL`, `EVENTEASE_MANAGER_PASSWORD` | Only used by `seed-eventease` |
| `SALES_CLOSE_DAYS_BEFORE_EVENT` | Optional, default 30 |

Website: `project/frontend/.env` needs `VITE_API_BASE_URL=http://localhost:8000` for local testing.
