from fastapi import APIRouter

from app.api.v1 import admin, auth, bookings, events, organiser, payments, tickets

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(events.router)
api_router.include_router(admin.router)
api_router.include_router(organiser.router)
api_router.include_router(bookings.router)
api_router.include_router(payments.router)
api_router.include_router(tickets.router)

