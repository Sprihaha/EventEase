from datetime import datetime
from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import utcnow
from app.db.models import Event
from app.db.session import get_db
from app.services.events import publicly_visible

router = APIRouter(tags=["SEO"])


def generate_sitemap_xml(db: Session, base_url: str) -> str:
    """Generate dynamic XML sitemap containing core pages and all approved public events."""
    base = base_url.rstrip("/")
    now = utcnow()
    stmt = publicly_visible(select(Event), now).order_by(Event.start_at.asc())
    events = db.execute(stmt).scalars().all()

    urls: list[dict[str, str | None]] = [
        {"loc": f"{base}/", "priority": "1.0", "changefreq": "daily", "lastmod": None},
        {"loc": f"{base}/events", "priority": "0.9", "changefreq": "hourly", "lastmod": None},
        {"loc": f"{base}/community", "priority": "0.7", "changefreq": "daily", "lastmod": None},
    ]

    for event in events:
        lastmod = event.updated_at or event.created_at or event.start_at
        urls.append(
            {
                "loc": f"{base}/events/{event.id}",
                "priority": "0.8",
                "changefreq": "daily",
                "lastmod": lastmod.strftime("%Y-%m-%d") if lastmod else None,
            }
        )

    xml_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for item in urls:
        xml_lines.append("  <url>")
        xml_lines.append(f"    <loc>{item['loc']}</loc>")
        if item.get("lastmod"):
            xml_lines.append(f"    <lastmod>{item['lastmod']}</lastmod>")
        xml_lines.append(f"    <changefreq>{item['changefreq']}</changefreq>")
        xml_lines.append(f"    <priority>{item['priority']}</priority>")
        xml_lines.append("  </url>")
    xml_lines.append("</urlset>")
    xml_lines.append("")

    return "\n".join(xml_lines)


@router.get("/sitemap.xml", summary="Dynamic XML sitemap of all public pages and active events")
def sitemap_xml(db: Session = Depends(get_db)):
    settings = get_settings()
    content = generate_sitemap_xml(db, settings.FRONTEND_URL)
    return Response(content=content, media_type="application/xml; charset=utf-8")
