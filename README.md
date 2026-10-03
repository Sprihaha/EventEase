# EventEase Backend

This is the backend repository for EventEase, built with Python, FastAPI, and Pydantic for robust data validation.

## Tech Stack
- **FastAPI**: A modern, fast (high-performance) web framework for building APIs.
- **Pydantic**: Data validation and settings management using Python type annotations.
- **Uvicorn**: An ASGI web server implementation for Python.

## Setup Instructions

1. **Create a virtual environment (optional but recommended)**
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the server**
   ```bash
   uvicorn main:app --reload
   ```

4. **Access the API**
   - The API will be available at `http://localhost:8000`
   - Interactive API documentation (Swagger UI) is available at `http://localhost:8000/docs`
   - Alternative API documentation (ReDoc) is available at `http://localhost:8000/redoc`

## Environment

Copy `.env.example` to `.env` and replace the placeholders with the Session
Pooler values shown by **Connect → Session pooler** in Supabase. The database
password and deployment secrets must never be committed.

`CORS_ORIGINS` is a comma-separated list. Add the published EventEase frontend
URL before deploying.

The API persists the frontend's events, bookings, exchange listings, community
posts, fraud alerts, and organizer accounts in the `eventease_state` PostgreSQL
table. Ticket verification reads the same shared state through
`GET /tickets/{ref}`.

## Validation Engine Features
The validation is handled seamlessly by Pydantic models defined in `models.py`:
- Built-in type checking (e.g., ensuring an integer is passed for IDs).
- Email validation using `pydantic[email]`.
- Custom validators:
  - Ensures event dates are in the future.
  - Ensures passwords contain at least one digit and one uppercase letter.
  - Enforces minimum and maximum string lengths.

## Docker Usage

You can easily run this application using Docker Compose. This ensures it runs consistently and automatically watches for code changes.

1. **Start the application**
   ```bash
   docker-compose up --build
   ```
   *Note: Add the `-d` flag (`docker-compose up -d --build`) to run it in the background.*

2. **Access the API**
   - The API will be available at `http://localhost:8000`
   - Interactive API documentation (Swagger UI) is available at `http://localhost:8000/docs`

3. **Stop the application**
   ```bash
   docker-compose down
   ```

## Render Deployment

1. Create a Render Blueprint from this repository and select the `backend`
   branch.
2. Render detects `render.yaml` and builds the Docker image.
3. Enter `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `CORS_ORIGINS` in Render's
   environment settings.
4. Wait for `/health` to report `{"status":"ok","database":"connected"}`.
5. Set the frontend's `VITE_API_URL` to the Render service URL and republish it.
