from logging.config import fileConfig

from alembic import context
from sqlalchemy import text

import app.db.models  # noqa: F401  (registers all models)
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import engine

config = context.config
if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def include_object(obj, name, type_, reflected, compare_to):
    return not (type_ == "table" and name == "alembic_version")


def run_migrations_online() -> None:
    schema = get_settings().DB_SCHEMA
    with engine.connect() as connection:
        if schema != "public":
            connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
            connection.commit()
        # Pin search_path on this connection so unqualified DDL lands in `schema` only.
        connection.execute(text(f'SET search_path TO "{schema}"'))
        connection.commit()
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            version_table_schema=schema,
            compare_type=True,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    raise SystemExit("Offline migrations are not supported; run against a database.")
run_migrations_online()
