from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.deps import client_ip, require_admin
from app.db.models import User
from app.db.session import get_db
from app.schemas.help import HelpPageIn, HelpPageOut
from app.services import help as service

router = APIRouter(tags=["EaseHelp"])


@router.get("/help", response_model=HelpPageOut, summary="EaseHelp: what each Ease feature does, and the terms (public)")
def get_help(db: Session = Depends(get_db)):
    return service.get_help_page(db)


@router.put("/admin/help", response_model=HelpPageOut,
            summary="Replace the EaseHelp page (administrators only; send every feature and the terms)")
def put_help(body: HelpPageIn, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return service.update_help_page(db, admin, body, client_ip(request))
