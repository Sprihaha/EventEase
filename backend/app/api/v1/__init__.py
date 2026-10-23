from fastapi import APIRouter

from app.api.v1 import accessibility, admin, analytics, assistance, auth, bookings, community, events, organiser, payments, tickets
from app.api.v1 import exchanges

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(events.router)
api_router.include_router(admin.router)
api_router.include_router(organiser.router)
api_router.include_router(bookings.router)
api_router.include_router(payments.router)
api_router.include_router(tickets.router)
api_router.include_router(assistance.router)
api_router.include_router(accessibility.router)
api_router.include_router(analytics.router)
api_router.include_router(exchanges.router)
api_router.include_router(community.router)

