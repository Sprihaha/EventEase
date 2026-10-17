from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


def _build_engine():
    settings = get_settings()
    engine = create_engine(
        settings.database_url,
        connect_args={"sslmode": settings.DB_SSLMODE},
        echo=settings.SQL_ECHO,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=20,
    )
    schema = settings.DB_SCHEMA

    # Connection poolers (e.g. Supabase's) ignore libpq startup `options`, so the
    # schema and timezone are set explicitly on every new DBAPI connection.
    # Requires a session-mode pooler or a direct connection (not transaction mode).
    @event.listens_for(engine, "connect")
    def _set_session(dbapi_connection, _record):
        with dbapi_connection.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{schema}"')
            cursor.execute("SET TIME ZONE 'UTC'")
        dbapi_connection.commit()

    return engine


engine = _build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
