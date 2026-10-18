def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "database": "connected"}


def test_health_database_failure(client, monkeypatch):
    from sqlalchemy.orm import Session

    def broken_execute(*args, **kwargs):
        raise RuntimeError("connection lost")

    monkeypatch.setattr(Session, "execute", broken_execute)
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"status": "unhealthy", "database": "disconnected"}


def test_unknown_route_uses_error_format(client):
    response = client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    assert response.json() == {"error": {"code": "NOT_FOUND", "message": "Not Found", "details": {}}}


def test_openapi_docs_served(client):
    assert client.get("/api/docs").status_code == 200
    assert client.get("/api/openapi.json").json()["info"]["title"] == "EventEase API"
