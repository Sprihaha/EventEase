"""Clear event image URLs that point at a developer's own machine.

Revision ID: 0016
Revises: 0015

Data fix only, no schema change. The first organiser Create Event form saved
http://localhost:8443/event-placeholder.svg as the poster, which only loads on that computer
(heuristic evaluation finding 8.1). Clearing it lets the site show its standard placeholder.
New localhost and private addresses are now rejected when an event is created or edited.
"""
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None

LOCAL_IMAGE = r"^https?://(localhost|127\.[0-9.]+|0\.0\.0\.0|\[::1\])([:/]|$)"


def upgrade():
    op.execute(f"UPDATE events SET image_url = NULL WHERE image_url ~* '{LOCAL_IMAGE}'")


def downgrade():
    # The cleared addresses never worked outside one computer, so there is nothing worth restoring.
    pass
