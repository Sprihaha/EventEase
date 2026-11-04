from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.event_images import load_image

router = APIRouter(prefix="/media", tags=["Media"])


@router.get("/event-images/{image_id}", summary="An uploaded event poster (public)",
            responses={200: {"content": {"image/png": {}, "image/jpeg": {}}}})
def event_image(image_id: str, db: Session = Depends(get_db)):
    data, content_type = load_image(db, image_id)
    # Each upload gets a new address, so browsers may keep it for a year.
    return Response(content=data, media_type=content_type, headers={
        "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"})
