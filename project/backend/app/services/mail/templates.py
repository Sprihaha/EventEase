"""Email templates for EventEase customer notifications.

Features professional, mobile-responsive HTML layouts incorporating:
- Official EventEase Ticket Banner Logo
- GenDoL (Generations of Doing, Limberly) Parent Company Branding
- High contrast, gate-admission pass cards with real scannable QR codes
- Universal email client support (Gmail, Outlook, Apple Mail)
"""

import functools
import html
import io
from pathlib import Path
from typing import Sequence

import qrcode


@functools.lru_cache(maxsize=1)
def get_branding_images() -> dict[str, tuple[bytes, str, str]]:
    """Loads the brand logos from disk for inline email embedding (CID)."""
    base_dir = Path(__file__).resolve().parent.parent.parent / "static" / "images"
    res: dict[str, tuple[bytes, str, str]] = {}
    ee_logo = base_dir / "eventease_logo.png"
    if ee_logo.is_file():
        res["eventease_logo"] = (ee_logo.read_bytes(), "image/png", "eventease_logo.png")
    gendol_logo = base_dir / "gendol_company_logo.jpg"
    if gendol_logo.is_file():
        res["gendol_company_logo"] = (gendol_logo.read_bytes(), "image/jpeg", "gendol_company_logo.jpg")
    return res


def generate_ticket_qr_png(ticket_code: str, base_url: str = "https://eventease-ggz2.onrender.com") -> bytes:
    """Generates a PNG QR code encoding the ticket check-in verification URL."""
    verify_url = f"{base_url.rstrip('/')}/verify/{ticket_code}"
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=6,
        border=2,
    )
    qr.add_data(verify_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#1e0b36", back_color="#ffffff")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def build_ticket_release_email(
    username: str,
    event_title: str,
    event_venue: str,
    when_str: str,
    ticket_codes: Sequence[str],
    dashboard_url: str,
    support_email: str = "admin.gendol@gmail.com",
    base_url: str | None = None,
) -> tuple[str, str, dict[str, tuple[bytes, str, str]]]:
    """Builds plain-text, responsive HTML, and inline QR images for ticket release notification."""
    safe_user = html.escape(username or "Valued Guest")
    safe_title = html.escape(event_title)
    safe_venue = html.escape(event_venue)
    safe_when = html.escape(when_str)
    safe_url = html.escape(dashboard_url)
    safe_support = html.escape(support_email)

    effective_base = base_url or dashboard_url.split("/dashboard")[0] if "/dashboard" in dashboard_url else dashboard_url

    # 1. Plain text version
    code_lines = "\n".join(f"  • Pass #{idx + 1}: {code}" for idx, code in enumerate(ticket_codes))
    text_body = f"""============================================================
                     EVENT EASE
          OFFICIAL DIGITAL TICKET RELEASE & PASS
============================================================

Hi {username},

Your digital QR tickets for '{event_title}' are now released and ready for gate admission.

EVENT DETAILS:
• Event:       {event_title}
• Date & Time: {when_str} (SGT)
• Venue:       {event_venue}

YOUR ADMISSION PASSES ({len(ticket_codes)} ticket(s)):
{code_lines}

HOW TO ENTER AT THE GATE:
1. Scan your digital QR pass from this email or in your dashboard at the gate scanner.
2. Bring an official photo ID matching your EventEase account.

View in dashboard:
{dashboard_url}

------------------------------------------------------------
EventEase is engineered and operated by GenDoL
(Generations of Doing, Limberly)
Registered in Singapore • Secure Event Management Infrastructure
Support: {support_email}
============================================================
"""

    # 2. HTML passes cards with embedded QR code images
    inline_images: dict[str, tuple[bytes, str, str]] = {}
    ticket_cards_html = ""
    for idx, code in enumerate(ticket_codes):
        safe_code = html.escape(code)
        qr_cid = f"qr_pass_{idx}"
        qr_png_bytes = generate_ticket_qr_png(code, effective_base)
        inline_images[qr_cid] = (qr_png_bytes, "image/png", f"{qr_cid}.png")

        ticket_cards_html += f"""
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px; background-color: #faf5ff; border: 1.5px dashed #a855f7; border-radius: 14px; overflow: hidden;">
          <tr>
            <td style="padding: 18px 20px 16px 20px; text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 12px;">
                <tr>
                  <td align="left" style="font-size: 11px; font-weight: 700; color: #7e22ce; text-transform: uppercase; letter-spacing: 1.2px;">
                    ADMISSION PASS #{idx + 1}
                  </td>
                  <td align="right" style="font-size: 11px; font-weight: 700; color: #16a34a;">
                    &#10003; GATE READY
                  </td>
                </tr>
              </table>

              <!-- QR Code Card Container -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto; background-color: #ffffff; border: 1px solid #e9d5ff; border-radius: 12px; padding: 12px; box-shadow: 0 2px 8px rgba(126, 34, 206, 0.08);">
                <tr>
                  <td align="center">
                    <img src="cid:{qr_cid}" alt="QR Ticket Code" width="160" height="160" style="display: block; width: 160px; height: 160px; border: 0;" />
                  </td>
                </tr>
              </table>

              <div style="margin-top: 10px; font-family: 'SF Mono', Monaco, Consolas, 'Courier New', monospace; font-size: 14px; font-weight: 700; color: #581c87; letter-spacing: 1.5px;">
                {safe_code}
              </div>
              <div style="margin-top: 4px; font-size: 11px; color: #6b7280;">
                Scan QR code at venue gate turnstile for admission
              </div>
            </td>
          </tr>
        </table>
        """

    # 3. Full Responsive HTML Template
    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Your Digital Tickets for {safe_title} are Ready</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f3f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1f2937;">

  <!-- Outer Canvas Table -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f3f9; padding: 30px 12px;">
    <tr>
      <td align="center">

        <!-- Main Email Container (600px max) -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 18px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 7, 40, 0.08); border: 1px solid #e5e7eb;">
          
          <!-- Brand Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e0b36 0%, #3b0764 45%, #701a75 75%, #c2410c 100%); padding: 32px 24px 28px 24px; text-align: center;">
              <!-- EventEase Ticket Banner Logo -->
              <img src="cid:eventease_logo" alt="EventEase - The Ultimate Event Experience" width="340" style="display: block; margin: 0 auto; max-width: 90%; height: auto; border: 0;" />
              <div style="margin-top: 12px; font-size: 12px; color: #f3e8ff; letter-spacing: 2.5px; text-transform: uppercase; font-weight: 600;">
                Official Digital Gate Pass
              </div>
            </td>
          </tr>

          <!-- Primary Body Content -->
          <tr>
            <td style="padding: 32px 28px 20px 28px;">
              <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 800; color: #111827; letter-spacing: -0.3px;">
                Your Tickets Are Ready! &#127919;
              </h1>
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #4b5563;">
                Hi <strong style="color: #111827;">{safe_user}</strong>,<br>
                Your digital passes and secure QR admission codes for <strong style="color: #6b21a8;">{safe_title}</strong> are now released and ready for gate check-in.
              </p>

              <!-- Event Overview Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #fdf4ff; border: 1px solid #f0abfc; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 18px 20px;">
                    <div style="font-size: 11px; font-weight: 800; color: #a21caf; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 6px;">
                      EVENT DETAILS
                    </div>
                    <div style="font-size: 18px; font-weight: 700; color: #1f2937; margin-bottom: 12px;">
                      {safe_title}
                    </div>
                    
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="24" valign="top" style="font-size: 15px; line-height: 1.5;">&#128197;</td>
                        <td style="font-size: 14px; color: #374151; line-height: 1.5; padding-left: 6px; padding-bottom: 8px;">
                          <strong>Date &amp; Time:</strong><br>
                          {safe_when} (SGT)
                        </td>
                      </tr>
                      <tr>
                        <td width="24" valign="top" style="font-size: 15px; line-height: 1.5;">&#128205;</td>
                        <td style="font-size: 14px; color: #374151; line-height: 1.5; padding-left: 6px;">
                          <strong>Venue:</strong><br>
                          {safe_venue}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Section: Your Ticket Passes -->
              <div style="margin-bottom: 12px;">
                <div style="font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 12px;">
                  Your Digital Gate Passes ({len(ticket_codes)} pass{"" if len(ticket_codes) == 1 else "es"}):
                </div>
                {ticket_cards_html}
              </div>

              <!-- Primary CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 26px 0;">
                <tr>
                  <td align="center">
                    <a href="{safe_url}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 34px; border-radius: 10px; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.35); letter-spacing: 0.3px;">
                      View in dashboard
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Admission Guidelines Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 18px;">
                    <div style="font-size: 12px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px;">
                      &#128161; Entry &amp; Gate Guidelines
                    </div>
                    <ul style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.6; color: #64748b;">
                      <li><strong>Mobile Access:</strong> Present your QR code on your mobile device at the turnstiles for fast admission.</li>
                      <li><strong>Identification:</strong> Keep an official ID ready that matches your EventEase account profile.</li>
                      <li><strong>Arrival:</strong> We recommend arriving 30-45 minutes before showtime to clear security checks comfortably.</li>
                      <li><strong>Assistance:</strong> Wheelchair routes and EaseGuide companion assistance are available at on-site service counters.</li>
                    </ul>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer / GenDoL Corporate Branding -->
          <tr>
            <td style="background-color: #fafbfc; border-top: 1px solid #edf0f5; padding: 28px 24px 24px 24px; text-align: center;">
              
              <!-- GenDoL Company Logo -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto 12px auto;">
                <tr>
                  <td align="center">
                    <img src="cid:gendol_company_logo" alt="GenDoL - Generations of Doing, Limberly" width="150" style="display: block; max-width: 100%; height: auto; border: 0;" />
                  </td>
                </tr>
              </table>

              <div style="font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                EventEase &bull; Operated by GenDoL (Generations of Doing, Limberly)
              </div>
              <div style="font-size: 11px; color: #6b7280; line-height: 1.5; max-width: 440px; margin: 0 auto 12px auto;">
                Singapore Registered Enterprise &bull; Secure Ticketing &amp; Access Infrastructure.<br>
                For questions or support, contact us at <a href="mailto:{safe_support}" style="color: #7c3aed; text-decoration: none;">{safe_support}</a>.
              </div>

              <div style="font-size: 10px; color: #9ca3af;">
                &copy; 2026 GenDoL &amp; EventEase. All rights reserved. Strictly confidential.
              </div>
            </td>
          </tr>

        </table>
        <!-- End Main Email Container -->

      </td>
    </tr>
  </table>

</body>
</html>
"""
    return text_body, html_body, inline_images


def build_booking_confirmation_email(
    username: str,
    event_title: str,
    ticket_count: int,
    total_amount_str: str,
    release_date_str: str | None,
    dashboard_url: str,
    support_email: str = "admin.gendol@gmail.com",
) -> tuple[str, str]:
    """Builds both plain-text and responsive HTML booking confirmation notifications."""
    safe_user = html.escape(username or "Valued Guest")
    safe_title = html.escape(event_title)
    safe_total = html.escape(total_amount_str)
    safe_url = html.escape(dashboard_url)
    safe_support = html.escape(support_email)

    if release_date_str:
        release_note_text = (
            f"Your dynamic QR tickets will be released and emailed on {release_date_str}. "
            f"Until then, you can swap seats on EaseXchange."
        )
        release_note_html = (
            f"Your dynamic QR tickets will be released on <strong>{html.escape(release_date_str)}</strong>. "
            f"Until then, your booking is guaranteed and eligible for verified seat swap on EaseXchange."
        )
    else:
        release_note_text = "Your digital QR tickets are already available in your customer dashboard."
        release_note_html = "Your digital QR tickets are ready right now in your customer dashboard."

    text_body = f"""============================================================
                     EVENT EASE
             BOOKING & PAYMENT CONFIRMATION
============================================================

Hi {username},

Thank you! We've received your payment and your booking for '{event_title}' is confirmed.

BOOKING SUMMARY:
• Event:         {event_title}
• Tickets:       {ticket_count} ticket(s)
• Total Paid:    {total_amount_str}

ADMISSION STATUS:
{release_note_text}

View in dashboard:
{dashboard_url}

------------------------------------------------------------
EventEase is engineered and operated by GenDoL
(Generations of Doing, Limberly)
Registered in Singapore • Secure Event Management Infrastructure
Support: {support_email}
============================================================
"""

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmed: {safe_title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f3f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f3f9; padding: 30px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 18px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 7, 40, 0.08); border: 1px solid #e5e7eb;">
          
          <!-- Brand Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e0b36 0%, #3b0764 45%, #701a75 75%, #c2410c 100%); padding: 32px 24px 28px 24px; text-align: center;">
              <img src="cid:eventease_logo" alt="EventEase" width="340" style="display: block; margin: 0 auto; max-width: 90%; height: auto; border: 0;" />
              <div style="margin-top: 12px; font-size: 12px; color: #f3e8ff; letter-spacing: 2.5px; text-transform: uppercase; font-weight: 600;">
                Official Booking Confirmation
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 28px 24px 28px;">
              <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 800; color: #111827;">
                Payment Confirmed &#10003;
              </h1>
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #4b5563;">
                Hi <strong style="color: #111827;">{safe_user}</strong>,<br>
                Thank you for booking with EventEase. Your payment for <strong style="color: #6b21a8;">{safe_title}</strong> has been processed successfully.
              </p>

              <!-- Summary Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #fdf4ff; border: 1px solid #f0abfc; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 18px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size: 13px; color: #6b7280; padding-bottom: 6px;">Event</td>
                        <td align="right" style="font-size: 15px; font-weight: 700; color: #111827; padding-bottom: 6px;">{safe_title}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 13px; color: #6b7280; padding-bottom: 6px;">Quantity</td>
                        <td align="right" style="font-size: 14px; font-weight: 600; color: #111827; padding-bottom: 6px;">{ticket_count} ticket(s)</td>
                      </tr>
                      <tr>
                        <td style="font-size: 13px; color: #6b7280; padding-top: 6px; border-top: 1px dashed #e9d5ff;">Total Paid</td>
                        <td align="right" style="font-size: 16px; font-weight: 800; color: #7c3aed; padding-top: 6px; border-top: 1px dashed #e9d5ff;">{safe_total}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- QR Release Status Notice -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 18px; font-size: 13px; line-height: 1.6; color: #475569;">
                    <strong style="color: #1e293b;">&#128274; Gate QR Code Release:</strong><br>
                    {release_note_html}
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
                <tr>
                  <td align="center">
                    <a href="{safe_url}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 34px; border-radius: 10px; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.35);">
                      View in dashboard
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer / GenDoL Branding -->
          <tr>
            <td style="background-color: #fafbfc; border-top: 1px solid #edf0f5; padding: 26px 24px 22px 24px; text-align: center;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto 10px auto;">
                <tr>
                  <td align="center">
                    <img src="cid:gendol_company_logo" alt="GenDoL" width="150" style="display: block; max-width: 100%; height: auto; border: 0;" />
                  </td>
                </tr>
              </table>
              <div style="font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 4px;">
                EventEase &bull; Operated by GenDoL (Generations of Doing, Limberly)
              </div>
              <div style="font-size: 11px; color: #6b7280; line-height: 1.5; margin-bottom: 10px;">
                Singapore Registered Enterprise &bull; Support: <a href="mailto:{safe_support}" style="color: #7c3aed; text-decoration: none;">{safe_support}</a>
              </div>
              <div style="font-size: 10px; color: #9ca3af;">
                &copy; 2026 GenDoL &amp; EventEase. All rights reserved.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
"""
    return text_body, html_body
