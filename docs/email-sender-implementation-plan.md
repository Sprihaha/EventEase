# EventEase — Email Sender Implementation Plan

Oct 27, 2026

## Goal and current state

**Goal.** Change the address that sends EventEase's emails, and make those emails work on the deployed site, not only on a developer's laptop.

**Current state.**

- No email address is written in the code. The sender is configured through environment variables that the backend reads at start-up (`backend/app/core/config.py`).
- Locally, `backend/.env` uses Gmail SMTP with the account `eventeasegendol.noreply@gmail.com` and a Gmail App Password.
- The deployed backend on Render cannot send these emails: **Render's free plan blocks outgoing SMTP**, so verification and reset emails never arrive there.
- All emails go through one mail layer (`backend/app/services/mail/base.py`), which already supports four transports: `console` (prints to the log), `smtp`, `resend` and `sendgrid`. Switching provider is a configuration change, not a code change.
- Sending is “fail-safe”: if an email fails, the error is logged and the user's action (for example sign-up) still completes. This means a broken email setup **fails silently** for users, so it must be tested on purpose.

**Emails that use this sender.**

| Email | Sent when |
| --- | --- |
| Verify your EventEase email | A new account signs up, or asks to resend the link |
| Reminder to verify your email | An older, unverified account is reminded |
| Reset your EventEase password | Forgot-password is requested for a verified email |
| Your EventEase password was changed | A password is changed |
| Organiser account decision | An admin approves or rejects an organiser sign-up |
| Organisation request submitted, approved or not approved | An organiser asks to add an organisation, and the admin decides |
| Event decision or suspension | An admin approves, rejects or suspends an event (organiser and affected customers) |
| Your tickets / Booking cancelled | A booking is confirmed or cancelled |

## Approach

There are two separate jobs: changing **which account** sends the emails, and choosing **how** the deployed backend sends them.

| Option | Works locally | Works on Render free plan | Needs | Notes |
| --- | --- | --- | --- | --- |
| Gmail SMTP (`smtp`) | Yes | **No**, SMTP is blocked | A Gmail account with 2-Step Verification and an App Password | What we use today; Gmail limits daily sending |
| Resend (`resend`) | Yes | Yes, it sends over HTTPS | A Resend API key and, to email any user, a domain we own verified in Resend | Without a verified domain, Resend only delivers to the account owner's own address |
| SendGrid (`sendgrid`) | Yes | Yes, it sends over HTTPS | A SendGrid API key and a verified sender | Check SendGrid's current free-plan terms before choosing |
| Upgrade Render to a paid plan | — | Yes, keeps Gmail SMTP | A paid Render instance | Simplest code-wise, but costs money and keeps Gmail's limits |

**Recommendation.**

1. **Locally:** keep Gmail SMTP, and change the account if needed (section below). It is free and already works.
2. **On Render:** switch to **Resend**, sending from an address on a domain the team owns (for example `no-reply@<our-domain>`). The code already supports it, so the change is only environment variables plus a one-time domain setup.
3. If the team has no domain, use SendGrid with a verified single sender, or upgrade Render, and record that decision in this doc.

No code change is needed for any of these options.

## Step by step: change the sender locally (Gmail)

**Time needed:** about 15 minutes.

1. **Prepare the Gmail account.** Sign in to the new sending account and open Google Account → Security. Turn on 2-Step Verification, then create an **App password** named “EventEase”. Copy the 16-character code. The normal Gmail password will not work.
2. **Edit `backend/.env`** (never `.env.example`) and set:

   ```
   MAIL_TRANSPORT=smtp
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USERNAME=new-address@gmail.com
   SMTP_PASSWORD=<16-character app password, no spaces>
   MAIL_FROM=EventEase <new-address@gmail.com>
   ```

   `MAIL_FROM` is the name and address recipients see. With Gmail it must match `SMTP_USERNAME`, otherwise Gmail rewrites it.
3. **Check the link address.** `FRONTEND_URL` decides where the links inside emails point. Locally it should point at your local site (for example `http://localhost:8443`); on Render it must be the deployed frontend URL.
4. **Restart the backend.** Settings are read only at start-up, and auto-reload is unreliable on some machines, so stop the server and start it again:

   ```
   cd backend
   .venv/Scripts/python -m uvicorn app.main:app --port 8000
   ```
5. **Send a test email** using the checklist below, starting with forgot-password on a verified account.

**Every teammate does this on their own machine.** `.env` is not in Git, so changing it on one laptop changes nothing for anyone else.

## Step by step: make emails send from Render (Resend)

**Time needed:** about 1 hour, mostly waiting for the domain to verify.

1. **Create a Resend account** with a shared team email, so the account does not belong to one person.
2. **Add and verify the domain.** In Resend, add the team's domain. Resend shows a few DNS records (for SPF and DKIM). Add them exactly as shown at the place where the domain is registered, then wait until Resend shows the domain as *Verified*.
3. **Create an API key** in Resend with sending access only. Copy it once; Resend will not show it again.
4. **Set the Render environment variables.** In the Render dashboard, open the **backend** service → *Environment* and set:

   | Variable | Value |
   | --- | --- |
   | `MAIL_TRANSPORT` | `resend` |
   | `RESEND_API_KEY` | the key from step 3 |
   | `MAIL_FROM` | `EventEase <no-reply@our-domain>` (must be on the verified domain) |
   | `FRONTEND_URL` | `https://eventease-frontend-invd.onrender.com` |

   These variables are marked `sync: false` in `backend/render.yaml`, which means they are set in the dashboard and never committed. The SMTP variables can be left empty on Render.
5. **Redeploy.** Saving the variables triggers a redeploy; if not, choose *Manual Deploy → Deploy latest commit*.
6. **Check the logs.** Send a test email (checklist below), then look at the backend's logs on Render. A line starting with `Failed to send mail to` means the key, the sender address or the domain is wrong.
7. **Confirm delivery** in the Resend dashboard, which shows each email as delivered, bounced or rejected.

**If the team chooses SendGrid instead,** follow the same steps with `MAIL_TRANSPORT=sendgrid` and `SENDGRID_API_KEY`, and verify the sender address in SendGrid first.

## Testing checklist

Run this once locally after changing the account, and again on Render after switching provider. Use a test account with an email you can open, **never** the protected Janice, John or Jay accounts, and remember that the local backend writes to the shared database.

- [ ] **Sign-up verification.** Sign up a new customer. The “Verify your EventEase email” message arrives from the new sender, and its link opens the right site and verifies the account.
- [ ] **Resend link.** Ask for the verification link again; the new link works and the old one no longer does.
- [ ] **Forgot password.** Request a reset for the verified test account. The email arrives, the link opens the reset page, and it works only once.
- [ ] **Password changed notice.** Change the password while signed in; the notice email arrives.
- [ ] **Organiser decision.** Sign up a test organiser and approve or reject it as admin; the decision email arrives.
- [ ] **Sender and spam check.** The sender name shows as “EventEase”, the address is the new one, and the email lands in the inbox rather than spam.
- [ ] **Failure is visible.** Temporarily set a wrong API key or password, trigger one email, and confirm a `Failed to send mail to` line appears in the backend log. Then restore the correct value.
- [ ] **Automated tests still pass.** Run `backend/scripts/run_isolated_checks.py`. Tests use a fake mailer, so they should be unaffected by the change.
- [ ] **Clean up** the test accounts afterwards, or ask an admin to suspend them.

## Secrets, rollback and open questions

**Handling secrets.**

- App passwords and API keys go only in `backend/.env` (local) or the Render dashboard (deployed). Never put them in code, `.env.example`, commit messages, screenshots or chat.
- Stage files by name when committing (`git add <file>`), so `.env` can never slip into a commit.
- Share credentials with teammates through a password manager, not in a group chat.
- If a key or app password is ever exposed, revoke it in Gmail or Resend straight away and create a new one.

**Rollback.** Keep the old values until the new setup has passed the checklist. To go back, restore the previous `MAIL_TRANSPORT`, `MAIL_FROM` and credential values and restart (locally) or redeploy (Render). Setting `MAIL_TRANSPORT=console` is a safe fallback: emails are printed to the backend log instead of sent, which is handy for local testing.

**Open questions for the team.**

| Question | Why it matters | Owner |
| --- | --- | --- |
| Does the team own a domain we can send from? | Resend needs a verified domain to email real users | Team |
| Which shared email should own the Resend and Gmail accounts? | Avoids losing access when one person leaves | Team |
| Do we stay on Render's free plan? | Decides between Resend/SendGrid and paid SMTP | Team |

**Done when** the new sender passes every item in the testing checklist, both locally and on the Render deployment.
