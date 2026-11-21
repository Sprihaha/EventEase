"""EasePoints: computed from what a customer has actually done, so every account starts at 0.

Earned  = approved EasePix photos + EaseConnect questions + completed ticket exchanges.
Balance = earned - points redeemed for exchange discounts (easepoints_redemptions).
Keep the numbers in sync with EASEPOINTS_RULES in frontend/src/lib/easePoints.ts.
"""

import uuid
from dataclasses import asdict, dataclass

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, aliased

from app.core.errors import AppError
from app.db.models.community import EaseConnectPost, EasePix
from app.db.models.easepoints import EasePointsRedemption
from app.db.models.exchange import ExchangeMatch, ExchangeMatchStatus, ExchangeRequest

POINTS_PER_APPROVED_PHOTO = 23
POINTS_PER_COMPLETED_EXCHANGE = 5
POINTS_PER_QUALIFYING_QUESTION = 7
REDEMPTION_COST_POINTS = 100
DISCOUNT_PERCENT = 10


@dataclass
class EasePointsSummary:
    balance: int
    earned: int
    redeemed: int
    approved_photos: int
    questions: int
    completed_exchanges: int

    def as_dict(self) -> dict:
        return asdict(self)


def _approved_photos(db: Session, user_id: uuid.UUID) -> int:
    return db.scalar(select(func.count()).select_from(EasePix).where(
        EasePix.user_id == user_id, EasePix.status == "APPROVED")) or 0


def _questions(db: Session, user_id: uuid.UUID) -> int:
    # Top-level question posts that are still up. Posts carrying a photo earn EasePix points instead.
    return db.scalar(select(func.count()).select_from(EaseConnectPost).where(
        EaseConnectPost.user_id == user_id,
        EaseConnectPost.parent_id.is_(None),
        EaseConnectPost.is_question.is_(True),
        or_(EaseConnectPost.is_removed.is_(False), EaseConnectPost.is_removed.is_(None)),
        EaseConnectPost.photo_url.is_(None),
        EaseConnectPost.easepix_id.is_(None),
    )) or 0


def _completed_exchanges(db: Session, user_id: uuid.UUID) -> int:
    req_a, req_b = aliased(ExchangeRequest), aliased(ExchangeRequest)
    return db.scalar(
        select(func.count(ExchangeMatch.id))
        .join(req_a, req_a.id == ExchangeMatch.request_a_id)
        .join(req_b, req_b.id == ExchangeMatch.request_b_id)
        .where(ExchangeMatch.status == ExchangeMatchStatus.COMPLETED,
               or_(req_a.requester_user_id == user_id, req_b.requester_user_id == user_id))
    ) or 0


def _redeemed(db: Session, user_id: uuid.UUID) -> int:
    return db.scalar(select(func.coalesce(func.sum(EasePointsRedemption.points), 0)).where(
        EasePointsRedemption.user_id == user_id)) or 0


def summary(db: Session, user_id: uuid.UUID) -> EasePointsSummary:
    photos = _approved_photos(db, user_id)
    questions = _questions(db, user_id)
    exchanges = _completed_exchanges(db, user_id)
    earned = (photos * POINTS_PER_APPROVED_PHOTO + questions * POINTS_PER_QUALIFYING_QUESTION
              + exchanges * POINTS_PER_COMPLETED_EXCHANGE)
    redeemed = int(_redeemed(db, user_id))
    return EasePointsSummary(balance=max(0, earned - redeemed), earned=earned, redeemed=redeemed,
                             approved_photos=photos, questions=questions, completed_exchanges=exchanges)


def discount_for(amount_cents: int) -> int:
    return round(amount_cents * DISCOUNT_PERCENT / 100)


def redeem_for_exchange(db: Session, user_id: uuid.UUID, match_id: uuid.UUID, amount_cents: int) -> EasePointsRedemption:
    """Spend REDEMPTION_COST_POINTS for a 10% discount on this exchange. The caller commits."""
    if amount_cents <= 0:
        raise AppError(409, "EASEPOINTS_NOT_APPLICABLE",
                       "EasePoints discounts only apply when there is a price difference to pay.")
    existing = db.scalar(select(EasePointsRedemption).where(EasePointsRedemption.match_id == match_id))
    if existing is not None:
        return existing
    if summary(db, user_id).balance < REDEMPTION_COST_POINTS:
        raise AppError(409, "EASEPOINTS_INSUFFICIENT",
                       f"You need {REDEMPTION_COST_POINTS} EasePoints to redeem a discount.")
    redemption = EasePointsRedemption(user_id=user_id, match_id=match_id, points=REDEMPTION_COST_POINTS,
                                      discount_cents=discount_for(amount_cents))
    db.add(redemption)
    db.flush()
    return redemption
