# EventEase

[![React](https://img.shields.io/badge/React-19.0-blue?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-purple?logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0-red?logo=sqlalchemy&logoColor=white)](https://www.sqlalchemy.org/)

**EventEase** is a modern, accessible, full-stack event discovery, ticketing, and venue operations platform tailored for concerts, theatre, sports, and cultural events in Singapore. Built with a **React 19** frontend and a **FastAPI + PostgreSQL** backend, EventEase bridges attendee accessibility with enterprise-grade ticketing and venue management.

> 🚀 **Live Deployments:**
> - **Frontend Application**: [https://eventease-frontend-invd.onrender.com](https://eventease-frontend-invd.onrender.com)
> - **Backend API & Docs**: [https://eventease-backend-qkbl.onrender.com](https://eventease-backend-qkbl.onrender.com) | [Swagger UI](https://eventease-backend-qkbl.onrender.com/api/docs) | [Health Check](https://eventease-backend-qkbl.onrender.com/health)

---

## 🌟 Key Features

### 🎟️ Event Discovery & Frictionless Ticketing
- **Live Event Catalog**: Real-time search, category filtering (Music, Tech, Sports, Arts, Community), date range, and price sorting.
- **Interactive Seat Map**: Dynamic venue layout visualization with tier pricing, capacity limits, and seat selection.
- **Concurrency-Safe Reservation**: 10-minute temporary seat holding backed by atomic database row updates to prevent overselling.
- **Purchase Limits**: Configurable customer limits (default: max 6 tickets per event) to mitigate scalping.
- **Digital QR Passes**: Automatic QR code pass generation (`qrcode`) and instant gate verification at `/verify/:ref`.

### ♿ Inclusive by Design (EaseVoice & Accessibility)
- **EaseVoice Audio Narration**: Client-side speech synthesis providing vocal walkthroughs of event listings and schedules for visually impaired attendees.
- **Accessibility Engine**: User-toggleable high-contrast themes, dyslexia-friendly typography, customizable text scaling, and reduced motion settings.
- **On-Site Assistance Requests**: Integrated workflow allowing attendees to submit specialized on-site accessibility requirements (e.g., wheelchair access, guide dogs, audio loops) linked to their bookings.

### 👥 Role-Based Portals & Dashboards
- **Customer Portal** (`/dashboard/customer`): Manage active passes, download QR entry passes, inspect order history, process eligible cancellations (up to 48 hours before events), and submit assistance requests.
- **Organizer Portal** (`/dashboard/organizer`): Create and edit events, configure ticket tiers, monitor real-time sales and quotas, inspect live venue occupancy (`OperationsSeatMap`), and manage attendee assistance requests.
- **Administrator Portal** (`/dashboard/admin`): System-wide health monitoring (`EaseAnalytics`), ticket gate verification scanner, EaseVoice narration configuration, external event ingestion, and fraud signal auditing.

### 🛡️ Security, Privacy & Integrity
- **Authentication**: JWT access tokens (15-min TTL) paired with secure HTTP-only refresh cookies.
- **Role-Based Access Control (RBAC)**: Strict separation between `CUSTOMER`, `ORGANISER`, and `ADMIN` privileges.
- **PDPA Compliance**: Automated 90-day retention policies for authentication logs and IP histories; sensitive contact details are masked across administrative interfaces.
- **Fraud & Scalping Detection**: Automated rate-limiting, failed login lockout counters, and heuristic fraud alerts.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | [React 19](https://react.dev/), [TypeScript 5.7](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/), [React Router 7](https://reactrouter.com/) |
| **Styling & Icons** | [Tailwind CSS v4](https://tailwindcss.com/) via `@tailwindcss/vite`, [Lucide React](https://lucide.dev/) |
| **Backend API** | [FastAPI](https://fastapi.tiangolo.com/) (Python 3.12), [Pydantic v2](https://docs.pydantic.dev/) |
| **Database & ORM** | [PostgreSQL 14+](https://www.postgresql.org/), [SQLAlchemy 2.0](https://www.sqlalchemy.org/), [Alembic](https://alembic.sqlalchemy.org/) |
| **Payments & Integrations** | Stripe / Mock Payment Provider, Ticketmaster Discovery API Adapter |
| **Testing & Tooling** | `pytest`, `Docker Compose`, `qrcode`, Web Speech API |

---

## 📂 Project Structure

```text
EventEase/
├── backend/
│   ├── app/
│   │   ├── api/v1/         # Versioned REST endpoints (auth, events, bookings, admin, etc.)
│   │   ├── core/           # Security, config, rate limiting, and dependencies
│   │   ├── db/             # SQLAlchemy models, sessions, and database migrations
│   │   ├── schemas/        # Pydantic validation schemas
│   │   ├── services/       # Business logic (ticketing, fraud, payments, email)
│   │   ├── cli.py          # Administrative CLI commands (seeding, maintenance)
│   │   └── main.py         # FastAPI application entry point
│   ├── tests/              # Pytest test suite (unit and integration)
│   ├── alembic/            # Database schema migrations
│   └── requirements.txt    # Python production and development dependencies
├── frontend/
│   ├── src/
│   │   ├── components/     # UI primitives, SeatMap, EaseAnalytics, AssistanceQueue
│   │   ├── lib/            # API client (backendApi.ts), global store, accessibility context
│   │   ├── pages/          # Application views (Home, Browse, Dashboards, Verify, etc.)
│   │   ├── routes.tsx      # React Router 7 route definitions
│   │   └── App.tsx         # Main application container
│   ├── public/             # Static public assets (logos, icons, robots, sitemap)
│   ├── package.json        # Frontend scripts and dependencies
│   └── vite.config.ts      # Vite build configuration
├── logos/                  # Brand wordmark and logo asset files
├── docker-compose.yml      # Multi-container full-stack orchestration
└── README.md               # Unified project documentation
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js**: `v18.0.0` or higher (`v20+` recommended) & `npm`
- **Python**: `3.12+`
- **Database**: PostgreSQL 14+ (local instance, Docker, or hosted Supabase)

---

### 1. Backend Setup

1. **Navigate to the backend directory and activate a virtual environment**:
   ```bash
   cd backend
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # macOS/Linux:
   source .venv/bin/activate
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements-dev.txt
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Update database connection settings and set a secure JWT_SECRET
   ```

4. **Apply database migrations and seed default data**:
   ```bash
   alembic upgrade head
   python -m app.cli seed-admin      # Generates initial administrator credentials
   python -m app.cli seed-sample     # Optional: Populates sample events for local development
   ```

5. **Start the API development server**:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   Interactive Swagger documentation will be available at: **`http://localhost:8000/api/docs`**

---

### 2. Frontend Setup

1. **Navigate to the frontend directory**:
   ```bash
   cd ../frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Ensure VITE_API_BASE_URL points to your backend (default: http://localhost:8000)
   ```

4. **Start the frontend development server**:
   ```bash
   npm run dev
   ```
   The application will be live at: **`http://localhost:5173`**

---

### 3. Docker Compose (Alternative)

To spin up the entire application stack using Docker:

```bash
docker compose up --build
```

* **Frontend Application**: `http://localhost:3000`
* **FastAPI Backend & Docs**: `http://localhost:8000/api/docs`
* **PostgreSQL Database**: `localhost:5432`

---

## ⚙️ Configuration & Environment Variables

### Backend Configuration (`backend/.env`)

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `APP_ENV` | `development` | Environment mode (`development`, `test`, `production`) |
| `DATABASE_URL` | — | PostgreSQL connection string (`postgresql://user:pass@host:5432/dbname`) |
| `DB_SCHEMA` | `public` | Database schema name |
| `JWT_SECRET` | — | Secret key used for signing JWT access tokens (minimum 32 characters) |
| `ACCESS_TOKEN_TTL_MINUTES` | `15` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | Refresh token cookie lifetime |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed frontend origin for CORS and password reset redirection |
| `PURCHASE_LIMIT_PER_EVENT` | `6` | Maximum tickets a single customer can reserve per event |
| `BOOKING_HOLD_MINUTES` | `10` | Temporary seat hold expiration window |
| `CANCELLATION_CUTOFF_HOURS`| `48` | Minimum advance notice required for customer refunds |
| `PAYMENT_PROVIDER` | `mock` | Payment gateway (`mock` or `stripe`) |
| `TICKETMASTER_API_KEY` | — | Optional API key for syncing external Ticketmaster events |
| `DATA_RETENTION_DAYS` | `90` | PDPA data retention window for security logs and IPs |

### Frontend Configuration (`frontend/.env`)

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` | Base URL for FastAPI REST service |

---

## 📡 Core API Reference

All backend endpoints are prefixed with `/api/v1`. Full interactive documentation and schema definitions are served at `/api/docs`.

### Authentication (`/api/v1/auth`)
- `POST /login` — Authenticate user and issue access token with HTTP-only refresh cookie
- `POST /signup` — Register customer or organizer account
- `GET /username-available` — Real-time validation of username availability
- `POST /refresh` — Refresh access token using secure session cookie
- `POST /logout` — Revoke session and clear cookies
- `POST /forgot-password` & `POST /reset-password` — Password recovery workflow
- `POST /change-password` 🔒 — Mandatory or voluntary password update

### Events (`/api/v1/events`)
- `GET /events` — Public catalog search with category, date, price, and pagination filters
- `GET /events/{id}` 🔒 — Retrieve detailed event specifications, venue seating, and pricing tiers

### Customer & Bookings (`/api/v1`)
- `POST /bookings` 🔒 — Reserve seats with temporary 10-minute hold (supports `Idempotency-Key`)
- `POST /bookings/{id}/pay` 🔒 — Confirm payment and transition hold to confirmed booking
- `GET /me/bookings` 🔒 — Retrieve attendee's upcoming and past bookings
- `POST /me/bookings/{id}/cancel` 🔒 — Cancel reservation and initiate inventory restock and refund
- `GET /verify/{ref}` — Verify authenticity of a ticket reference or digital QR pass

### Organizer Operations (`/api/v1/organiser`)
- `GET /events` & `POST /events` 🔒 — View and create managed events
- `PATCH /events/{id}` 🔒 — Modify event parameters and venue schedules
- `POST /events/{id}/ticket-categories` 🔒 — Configure ticket tiers, quotas, and pricing
- `GET /events/{id}/sales` 🔒 — Inspect sales figures, ticket distribution, and remaining capacity

### Administration (`/api/v1/admin`)
- `GET /events` & `POST /events/{id}/approve|reject|suspend` 🔒 — Event moderation pipeline
- `POST /events/import` 🔒 — Bulk ingestion of curated events (CSV / JSON)
- `POST /sources/ticketmaster/sync` 🔒 — Synchronize external events via Ticketmaster Discovery API
- `GET /users` & `POST /users/{id}/suspend` 🔒 — User account governance
- `GET /fraud-signals` & `GET /audit-logs` 🔒 — Platform security and compliance monitoring

---

## 🧪 Testing & Quality Assurance

### Running Backend Tests
The backend test suite covers authentication rules, concurrency safeguards, overselling prevention, fraud detection, and role guards:

```bash
cd backend

# Run the complete test suite
python -m pytest

# Run unit tests only (no database required)
python -m pytest tests/unit
```

### Frontend Code Quality
Validate TypeScript types and formatting:

```bash
cd frontend

# Run TypeScript type check
npm run build
```

---

## 📄 License & Attribution

This project is developed as part of the NTU Mini Capstone (Full Stack) Project. All rights reserved.
