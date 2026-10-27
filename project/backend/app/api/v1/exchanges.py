from fastapi import APIRouter, Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.config import get_settings
from app.core.deps import require_customer
from app.core.errors import AppError
from app.db.models import User
from app.db.session import get_db
from app.schemas.exchange import (CreateExchangeRequest, EligibleTicketView, ExchangeListingView,
                                  ExchangeMatchView, ExchangeRequestView, ExpressInterest, MyExchangesView)
from app.services import exchanges
from app.services.exchange_ticketing import TicketingGateway, get_exchange_ticketing
from app.schemas.exchange import SettleExchange, TicketInterest, ExchangeCategoryOption, ExchangeActivityView

router = APIRouter(prefix="/exchanges", tags=["EaseXchange"])


def _run(db, fn, *args):
    try:
        return fn(db, *args)
    except IntegrityError as exc:
        db.rollback()
        if getattr(getattr(exc.orig, "diag", None), "constraint_name", None) == "uq_exchange_requests_active_ticket":
            raise AppError(409, "TICKET_RESERVED", "this ticket already has an active exchange request") from exc
        raise
    except Exception:
        db.rollback()
        raise


@router.get("/listings", response_model=list[ExchangeListingView])
def listings(db: Session = Depends(get_db), gateway: TicketingGateway = Depends(get_exchange_ticketing)):
    return _run(db, exchanges.listings, gateway)


@router.get("/invitations", response_model=list[ExchangeListingView])
def invitations(user: User = Depends(require_customer), db: Session = Depends(get_db),
                gateway: TicketingGateway = Depends(get_exchange_ticketing)):
    try:
        return exchanges.listings(db, gateway, recipient=user)
    except Exception:
        db.rollback()
        raise


@router.get("/eligible-tickets", response_model=list[EligibleTicketView])
def eligible(user: User = Depends(require_customer), db: Session = Depends(get_db),
             gateway: TicketingGateway = Depends(get_exchange_ticketing)):
    return _run(db, exchanges.eligible_tickets, gateway, user)


@router.get("/mine", response_model=MyExchangesView)
def mine(user: User = Depends(require_customer), db: Session = Depends(get_db),
         gateway: TicketingGateway = Depends(get_exchange_ticketing)):
    return _run(db, exchanges.mine, gateway, user)


@router.get("/eligible-tickets/{ticket_id}/options", response_model=list[ExchangeCategoryOption])
def options(ticket_id: str, user: User = Depends(require_customer), db: Session = Depends(get_db),
            gateway: TicketingGateway = Depends(get_exchange_ticketing)):
    return _run(db, exchanges.preference_options, gateway, user, ticket_id)


@router.get("/activity", response_model=list[ExchangeActivityView])
def activity(user: User = Depends(require_customer), db: Session = Depends(get_db),
             gateway: TicketingGateway = Depends(get_exchange_ticketing)):
    return _run(db, exchanges.activity, gateway, user)


@router.post("", response_model=ExchangeRequestView, status_code=201)
def create(body: CreateExchangeRequest, user: User = Depends(require_customer), db: Session = Depends(get_db),
           gateway: TicketingGateway = Depends(get_exchange_ticketing)):
    return _run(db, exchanges.create, gateway, get_settings(), user, body)


@router.get("/matches/{match_id}", response_model=ExchangeMatchView)
def match(match_id: UUID, user: User = Depends(require_customer), db: Session = Depends(get_db),
          gateway: TicketingGateway = Depends(get_exchange_ticketing)):
    return _run(db, exchanges.get_match, gateway, user, match_id)


@router.post("/matches/{match_id}/accept", response_model=ExchangeMatchView)
def accept(match_id: UUID, user: User = Depends(require_customer), db: Session = Depends(get_db),
           gateway: TicketingGateway = Depends(get_exchange_ticketing)):
    return _run(db, exchanges.act_on_match, gateway, user, match_id, "accept")


@router.post("/matches/{match_id}/reject", response_model=ExchangeMatchView)
def reject(match_id: UUID, user: User = Depends(require_customer), db: Session = Depends(get_db),
           gateway: TicketingGateway = Depends(get_exchange_ticketing)):
    return _run(db, exchanges.act_on_match, gateway, user, match_id, "reject")


@router.post("/matches/{match_id}/cancel", response_model=ExchangeMatchView)
def cancel_match(match_id: UUID, user: User = Depends(require_customer), db: Session = Depends(get_db),
                 gateway: TicketingGateway = Depends(get_exchange_ticketing)):
    return _run(db, exchanges.act_on_match, gateway, user, match_id, "cancel")


@router.post("/matches/{match_id}/settle", response_model=ExchangeMatchView)
def settle(match_id: UUID, body: SettleExchange, user: User = Depends(require_customer), db: Session = Depends(get_db),
           gateway: TicketingGateway = Depends(get_exchange_ticketing)):
    return _run(db, exchanges.settle, gateway, get_settings(), user, match_id, body.payment_method)


@router.get("/{request_id}/matches", response_model=list[ExchangeListingView])
def suggestions(request_id: UUID, user: User = Depends(require_customer), db: Session = Depends(get_db),
                gateway: TicketingGateway = Depends(get_exchange_ticketing)):
    return _run(db, exchanges.suggestions, gateway, user, request_id)


@router.post("/{request_id}/interest", response_model=ExchangeMatchView)
def interest(request_id: UUID, body: ExpressInterest, user: User = Depends(require_customer), db: Session = Depends(get_db),
             gateway: TicketingGateway = Depends(get_exchange_ticketing)):
    return _run(db, exchanges.interest, gateway, get_settings(), user, request_id, body.target_request_id)


@router.get("/{request_id}/eligible-tickets", response_model=list[EligibleTicketView])
def interest_tickets(request_id: UUID, user: User = Depends(require_customer), db: Session = Depends(get_db),
                     gateway: TicketingGateway = Depends(get_exchange_ticketing)):
    return _run(db, exchanges.interest_tickets, gateway, get_settings(), user, request_id)


@router.post("/{request_id}/ticket-interest", response_model=ExchangeMatchView)
def ticket_interest(request_id: UUID, body: TicketInterest, user: User = Depends(require_customer),
                    db: Session = Depends(get_db), gateway: TicketingGateway = Depends(get_exchange_ticketing)):
    return _run(db, exchanges.ticket_interest, gateway, get_settings(), user, request_id, body.offered_ticket_id)


@router.post("/{request_id}/cancel", response_model=ExchangeRequestView)
def cancel_request(request_id: UUID, user: User = Depends(require_customer), db: Session = Depends(get_db),
                   gateway: TicketingGateway = Depends(get_exchange_ticketing)):
    return _run(db, exchanges.cancel_request, gateway, user, request_id)
