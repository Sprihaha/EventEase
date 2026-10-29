"""Synchronous in-process Event Bus supporting the Observer Pattern.

Decouples core business workflows from cross-cutting observers (fraud detection,
audit listeners, telemetry, external webhooks) satisfying the Open/Closed Principle.
"""

import logging
from typing import Any, Callable
from sqlalchemy.orm import Session

logger = logging.getLogger("eventease.events")

EventListener = Callable[..., Any]
_SUBSCRIBERS: dict[str, list[EventListener]] = {}


def subscribe(event_name: str, listener: EventListener) -> None:
    """Subscribes a listener callback to a specific domain event."""
    subscribers = _SUBSCRIBERS.setdefault(event_name, [])
    if listener not in subscribers:
        subscribers.append(listener)


def unsubscribe(event_name: str, listener: EventListener) -> None:
    """Removes a listener callback from a domain event."""
    if event_name in _SUBSCRIBERS:
        _SUBSCRIBERS[event_name] = [l for l in _SUBSCRIBERS[event_name] if l != listener]


def clear_subscribers() -> None:
    """Clears all event subscribers (useful for test isolation)."""
    _SUBSCRIBERS.clear()


def publish(db: Session, event_name: str, **payload: Any) -> None:
    """Publishes a domain event to all registered listeners.

    Each listener is executed with isolated error handling: an exception in a
    listener is logged and isolated without aborting other listeners or
    the caller's transaction.
    """
    listeners = list(_SUBSCRIBERS.get(event_name, []))
    for listener in listeners:
        try:
            listener(db=db, **payload)
        except Exception:
            logger.exception(
                "Event listener %s failed for event '%s'",
                getattr(listener, "__name__", str(listener)),
                event_name,
            )

