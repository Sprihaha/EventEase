"""Shared test helpers. Test passwords are generated at runtime, never hard-coded."""

import itertools
from functools import lru_cache

from app.core.security import generate_password, hash_password
from app.db.models import Role, User

PASSWORD = generate_password(16)
_counter = itertools.count(1)


@lru_cache
def password_hash() -> str:
    return hash_password(PASSWORD)


def unique_name(prefix: str = "user") -> str:
    return f"{prefix}{next(_counter)}"[:15]


def make_user(db, role: Role = Role.CUSTOMER, username: str | None = None, *, organisation: bool = True,
              **fields) -> User:
    """Organisers get an approved test organisation unless organisation=False."""
    username = username or unique_name(role.value.lower()[:4])
    user = User(
        username=username,
        email=fields.pop("email", None if role == Role.ADMIN else f"{username}@example.com"),
        phone_e164=fields.pop("phone_e164", None if role == Role.ADMIN else "+6591234567"),
        password_hash=fields.pop("password_hash", password_hash()),
        role=role,
        **fields,
    )
    db.add(user)
    db.commit()
    if role == Role.ORGANISER and organisation:
        add_membership(db, user)
    return user


def add_membership(db, user: User, name: str = "Test Organisation", status=None):
    """Give a user an organisation membership (approved by default), creating the organisation if needed."""
    from sqlalchemy import select

    from app.db.models import MembershipSource, MembershipStatus, Organisation, OrganisationMembership

    organisation = db.scalar(select(Organisation).where(Organisation.name == name))
    if organisation is None:
        organisation = Organisation(name=name, listed=True)
        db.add(organisation)
        db.flush()
    membership = OrganisationMembership(user_id=user.id, organisation_id=organisation.id,
                                        organisation_email=f"{user.username}@org.example.com",
                                        status=status or MembershipStatus.APPROVED, source=MembershipSource.ADMIN)
    db.add(membership)
    db.commit()
    return membership


def login(client, identifier: str, password: str = PASSWORD) -> dict:
    response = client.post("/api/v1/auth/login", json={"identifier": identifier, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


def auth_header(client, identifier: str, password: str = PASSWORD) -> dict:
    return {"Authorization": f"Bearer {login(client, identifier, password)['accessToken']}"}


def forgot_password(client, username: str, email: str):
    return client.post("/api/v1/auth/forgot-password", json={"username": username, "email": email})


def error_of(response) -> dict:
    return response.json()["error"]


def make_event(db, *, organiser=None, origin=None, status=None, days=10, hours=3, title="Sample Event",
               categories=(), **fields):
    """Create an event `days` from now. categories: iterable of (type, price_cents, quantity)."""
    from datetime import timedelta

    from app.core.security import utcnow
    from app.db.models import Event, EventCategory, EventOrigin, EventStatus, TicketCategory, TicketCategoryType

    origin = origin or (EventOrigin.ORGANISER if organiser else EventOrigin.EXTERNAL)
    start = fields.pop("start_at", utcnow() + timedelta(days=days))
    event = Event(
        origin=origin,
        organiser_id=organiser.id if organiser else None,
        title=title,
        category=fields.pop("category", EventCategory.CONCERT),
        venue_name=fields.pop("venue_name", "Esplanade Concert Hall"),
        area=fields.pop("area", "Marina Bay"),
        start_at=start,
        end_at=fields.pop("end_at", start + timedelta(hours=hours)),
        status=status or EventStatus.APPROVED,
        capacity=fields.pop("capacity", 1000 if organiser else None),
        source_name=fields.pop("source_name", None if organiser else "Manual"),
        external_id=fields.pop("external_id", None if organiser else unique_name("ext")),
        external_url=fields.pop("external_url", None if organiser else "https://example.org/event"),
        **fields,
    )
    db.add(event)
    db.flush()
    for kind, price, quantity in categories:
        db.add(TicketCategory(event_id=event.id, type=TicketCategoryType(kind), name=str(kind), price_cents=price,
                              quantity_total=quantity))
    db.commit()
    return event


def admin_headers(client, db) -> dict:
    admin = make_user(db, role=Role.ADMIN)
    return auth_header(client, admin.username)


def layout_csv(*lines) -> bytes:
    """Venue layout upload content. lines: (section, row, first, last[, accessible])."""
    from app.services.venue_layout import COLUMNS

    rows = [",".join(COLUMNS)] + [",".join(f'"{v}"' for v in line) for line in lines]
    return ("\n".join(rows) + "\n").encode()


def make_venue(db, organiser, *lines, name=None, area="Marina Bay"):
    """A stored venue. lines: (section, row, first, last); defaults to one 10-seat section."""
    from app.db.models import Venue, VenueSeat, VenueSection

    venue = Venue(organiser_id=organiser.id, name=name or unique_name("venue"), area=area)
    sections: dict[str, VenueSection] = {}
    for section_name, row, first, last in lines or (("Hall", "A", 1, 10),):
        section = sections.get(section_name)
        if section is None:
            section = sections[section_name] = VenueSection(name=section_name, position=len(sections))
            venue.sections.append(section)
        for number in range(first, last + 1):
            section.seats.append(VenueSeat(row_label=row, number=number, is_accessible=False,
                                           position=len(section.seats)))
    db.add(venue)
    db.commit()
    return venue
