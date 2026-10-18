import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.engine import URL

# Load environment variables from .env file
load_dotenv()

def build_database_url():
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return database_url.replace("postgres://", "postgresql://", 1)

    required = {
        "DB_USER": os.getenv("DB_USER"),
        "DB_PASSWORD": os.getenv("DB_PASSWORD"),
        "DB_HOST": os.getenv("DB_HOST"),
        "DB_NAME": os.getenv("DB_NAME"),
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise RuntimeError(f"Missing database settings: {', '.join(missing)}")

    drivername = "postgresql"
    try:
        import psycopg  # noqa: F401
        drivername = "postgresql+psycopg"
    except ImportError:
        try:
            import psycopg2  # noqa: F401
            drivername = "postgresql+psycopg2"
        except ImportError:
            pass

    return URL.create(
        drivername=drivername,
        username=required["DB_USER"],
        password=required["DB_PASSWORD"],
        host=required["DB_HOST"],
        port=int(os.getenv("DB_PORT", "5432")),
        database=required["DB_NAME"],
    )


engine = create_engine(
    build_database_url(),
    connect_args={"sslmode": os.getenv("DB_SSLMODE", "require")},
    echo=os.getenv("SQL_ECHO", "false").lower() == "true",
    pool_pre_ping=True,
)

# Session factory for DB interactions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for SQLAlchemy models
Base = declarative_base()

# Dependency for FastAPI to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
