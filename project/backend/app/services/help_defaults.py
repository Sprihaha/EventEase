"""Starting content for EaseHelp. Shown until an administrator saves their own version.

The numbers come from the platform settings (app.core.config) and the EasePoints rules, so the
help text matches how EventEase actually behaves when this content is first shown.
"""
from app.core.config import get_settings

EASEPOINTS_PER_PHOTO = 23
EASEPOINTS_PER_EXCHANGE = 5
EASEPOINTS_PER_QUESTION = 7
EASEPOINTS_PER_DISCOUNT = 100


def default_features() -> list[dict]:
    s = get_settings()
    return [
        {
            "key": "discover",
            "name": "Discover",
            "package": "A",
            "tagline": "Find concerts, theatre, sports and cultural events in Singapore.",
            "description": (
                "Browse upcoming events, search by name, artist or venue, filter by category and price, "
                "and sort by date. Each event page shows the venue, date, ticket tiers and prices. "
                "Sign in with your EventEase account to book."
            ),
        },
        {
            "key": "tickets",
            "name": "Tickets & checkout",
            "package": "B",
            "tagline": "Pick your exact seats, pay, and keep your tickets on your phone.",
            "description": (
                f"Choose seats on the live seat map. Selected seats are held for you for "
                f"{s.BOOKING_HOLD_MINUTES} minutes while you check out, and you can buy up to "
                f"{s.PURCHASE_LIMIT_PER_EVENT} tickets per event. Have a promo code from the organiser? Enter it at "
                f"checkout and press Apply before you reserve. Your tickets, with their QR codes, are "
                f"under My tickets. QR codes are released {s.SALES_CLOSE_DAYS_BEFORE_EVENT} days before the event."
            ),
        },
        {
            "key": "easecomms",
            "name": "EaseComms",
            "package": "C",
            "tagline": "The community home for every event.",
            "description": (
                "EaseComms brings together everything shared about an event: EaseConnect discussions, "
                "EasePix seat views, EaseXplore venue tours and EaseXchange ticket swaps."
            ),
        },
        {
            "key": "easeconnect",
            "name": "EaseConnect",
            "package": "C",
            "tagline": "Talk with other attendees and read organiser announcements.",
            "description": (
                "Post questions and tips, reply to others, and save posts to read later. Announcements from "
                "the event organiser are marked so you can tell them apart from attendee posts."
            ),
        },
        {
            "key": "easepix",
            "name": "EasePix",
            "package": "C",
            "tagline": "See the view from a seat before you buy.",
            "description": (
                "Browse photos other attendees took from their seats, filtered by venue and section. "
                "Share your own seat view after an event: each approved photo earns "
                f"{EASEPOINTS_PER_PHOTO} EasePoints. Only upload photos you took yourself."
            ),
        },
        {
            "key": "easexplore",
            "name": "EaseXplore",
            "package": "C",
            "tagline": "Take a 360° tour of the venue.",
            "description": (
                "Look around the venue in 360° and switch between sections to get a feel for the space, "
                "the stage and the walk to your seat before the day."
            ),
        },
        {
            "key": "easepoints",
            "name": "EasePoints",
            "package": "C",
            "tagline": "Rewards for helping the community.",
            "description": (
                f"Earn {EASEPOINTS_PER_PHOTO} points for each approved EasePix photo, "
                f"{EASEPOINTS_PER_EXCHANGE} for each completed EaseXchange swap and "
                f"{EASEPOINTS_PER_QUESTION} for each qualifying question. "
                f"{EASEPOINTS_PER_DISCOUNT} points give 10% off the price difference of one ticket swap; "
                "only one discount can be used per swap, and unused points carry forward."
            ),
        },
        {
            "key": "easexchange",
            "name": "EaseXchange",
            "package": "D",
            "tagline": "Swap tickets safely with other fans, without scalpers.",
            "description": (
                "Offer a ticket you own and say which seat or tier you would like instead. When another "
                "attendee's offer matches, you both compare the seats side by side and accept. If one ticket "
                "costs more, the difference is settled when the swap completes, and the QR codes update "
                f"straight away. Requests stay open for {min(s.EXCHANGE_REQUEST_TTL_HOURS, 72)} hours; a match must "
                f"be accepted within {s.EXCHANGE_MATCH_TTL_MINUTES} minutes."
            ),
        },
        {
            "key": "easeguide",
            "name": "EaseGuide",
            "package": "E",
            "tagline": "Ask for help at the venue.",
            "description": (
                "For any confirmed booking, tell us what support you need (for example step-free access, "
                "a companion or help finding your seat) and choose a basic, moderate or full level of "
                "assistance. Follow each request and the staff assigned to it under My assistance requests."
            ),
        },
        {
            "key": "easevoice",
            "name": "EaseVoice",
            "package": "E",
            "tagline": "Have any text read aloud.",
            "description": (
                "Switch EaseVoice on from its tab at the bottom-right of the page, then highlight words anywhere "
                "on EventEase and it reads them out. Open the tab to change the reading speed or stop it. "
                "For larger text, use the text-size button in the top bar."
            ),
        },
        {
            "key": "easeanalytics",
            "name": "EaseAnalytics",
            "package": "E",
            "tagline": "Sales insights for organisers.",
            "description": (
                "Organisers see confirmed bookings, tickets sold, revenue over time and demand per ticket tier "
                "for each of their events, and can download the same figures as a PDF or Excel report."
            ),
        },
    ]


def default_terms() -> str:
    s = get_settings()
    return f"""These terms apply to everyone who uses EventEase. By creating an account or booking a ticket, you agree to them.

## About EventEase
EventEase is a student project built for a university course. Payments are simulated: no real money is charged and no real tickets are issued.

## Your account
- Keep your password private. You are responsible for activity on your account.
- Give accurate details when you sign up. One person, one account.
- We may suspend accounts that break these terms, including suspected fraud or ticket scalping.

## Bookings and tickets
- Prices are in Singapore dollars (SGD) and include all fees shown at checkout.
- Selected seats are held for {s.BOOKING_HOLD_MINUTES} minutes while you check out. If you do not pay in time, they are released.
- You can buy up to {s.PURCHASE_LIMIT_PER_EVENT} tickets per event.
- Ticket sales close {s.SALES_CLOSE_DAYS_BEFORE_EVENT} days before an event. QR codes are released at the same time.
- You can cancel a booking up to {s.CANCELLATION_CUTOFF_HOURS} hours before the event starts, unless the event page says otherwise. Refunds follow each event's policy.
- Tickets are personal. Reselling them outside EventEase is not allowed; use EaseXchange to swap.

## EaseXchange
- You can only offer tickets you own.
- Requests stay open for {min(s.EXCHANGE_REQUEST_TTL_HOURS, 72)} hours. A match must be accepted by both people within {s.EXCHANGE_MATCH_TTL_MINUTES} minutes.
- When a swap completes, ticket ownership and QR codes change immediately and cannot be undone.

## Community content (EaseComms, EaseConnect, EasePix)
- Only post content you created or have permission to share.
- Be respectful. No harassment, hate speech, spam, advertising or personal information about other people.
- Seat-view photos are checked before they appear. We may remove any post or photo that breaks these terms.
- By posting, you allow EventEase to show your content on the platform.

## EasePoints
- Points have no cash value and cannot be transferred or sold.
- {EASEPOINTS_PER_DISCOUNT} points give 10% off the price difference of one EaseXchange swap. Only one discount applies per swap.
- Points earned through misuse (for example, photos that are not your own) may be removed.

## Accessibility and assistance
- EaseGuide requests are passed to the venue team to help plan your visit. We will do our best to meet every request, but cannot guarantee specific arrangements.
- EaseVoice reads text aloud in your browser and does not store what it reads.

## Privacy
- We collect only what we need to run your account and bookings, and handle personal data in line with Singapore's Personal Data Protection Act (PDPA).
- Organisers see sales totals for their events, not your personal payment details.

## Changes to these terms
We may update these terms. The latest version is always on this page.

## Contact
For questions about these terms, contact the EventEase team.
"""
