# EventEase — Frontend Client

An accessible, modern web application for event discovery, ticket purchasing, and event operations, serving **Customers**, **Event Organizers**, and **Platform Administrators**.

> [!NOTE]
> This directory contains the **Frontend Client** application built with React, Vite, TypeScript, and Tailwind CSS. The backend API service is maintained and documented in its dedicated `backend` branch.

---

## 🌟 Key Features

### 1. 🎟️ Event Discovery & Ticketing
- **Live Event Catalog**: Search, filter by category (Music, Tech, Sports, Arts, Community), and browse upcoming events.
- **Interactive Seat Map**: Real-time visualization of seat tiers, pricing, and availability.
- **Frictionless Booking & QR Passes**: Instant ticket reservation with automated digital QR code pass generation (`qrcode`) and verification references.

### 2. ♿ Inclusive by Design (EaseVoice & Accessibility)
- **Accessibility Engine**: Full customization options including high-contrast modes, dyslexia-friendly fonts, adjustable text sizing, and motion reduction.
- **EaseVoice Narration**: Integrated speech synthesis and audio narration to assist visually impaired attendees.
- **Assistance Request System**: Specialized workflows for attendees to submit on-site accessibility requests directly linked to their bookings.

### 3. 👥 Role-Based Portals & Dashboards
- **Customer Dashboard** (`/dashboard/customer`): View active tickets, download QR entry passes, inspect booking history, and manage assistance requests.
- **Organizer Dashboard** (`/dashboard/organizer`): Manage events, track ticket sales and capacity quotas, inspect real-time venue operations maps, and resolve attendee assistance requests.
- **Admin Dashboard** (`/dashboard/admin`): Access system-wide metrics (`EaseAnalytics`), monitor platform health, manage EaseVoice narration settings, and verify attendee tickets via reference scanner (`/verify/:ref`).

---

## 🛠️ Technology Stack

| Category | Technology |
| :--- | :--- |
| **Framework & UI** | [React 19](https://react.dev/), [TypeScript 5.7](https://www.typescriptlang.org/) |
| **Build & Tooling** | [Vite 8](https://vitejs.dev/) |
| **Routing** | [React Router 7](https://reactrouter.com/) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) via `@tailwindcss/vite` |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Utilities** | `qrcode` (QR code generation), `oxfmt` (code formatting) |

---

## 📂 Project Structure

```text
frontend/
├── public/             # Static public assets
├── src/
│   ├── components/     # Reusable UI components
│   │   ├── AssistanceQueue.tsx     # Organizer assistance request queue
│   │   ├── DashboardShell.tsx      # Dashboard layout wrapper
│   │   ├── EaseAnalytics.tsx       # Admin analytics visualization
│   │   ├── EaseVoice.tsx           # Voice narration component
│   │   ├── EventCard.tsx           # Event listing card component
│   │   ├── Layout.tsx              # Main navigation & footer shell
│   │   ├── OperationsSeatMap.tsx   # Live venue seat occupancy map
│   │   ├── SeatMap.tsx             # Interactive ticket seat selector
│   │   └── ui.tsx                  # Core atomic UI primitives
│   ├── lib/            # Utilities and services
│   │   ├── accessibility.tsx       # Accessibility context & state
│   │   ├── backendApi.ts           # REST API client for backend service
│   │   ├── data.ts                 # Data models & mock catalog items
│   │   ├── eventsApi.ts            # External events integration
│   │   └── store.tsx               # Global application state management
│   ├── pages/          # Application views & route handlers
│   │   ├── AccessibilitySettings.tsx
│   │   ├── AdminDashboard.tsx
│   │   ├── AssistanceRequestForm.tsx
│   │   ├── AssistanceRequests.tsx
│   │   ├── Browse.tsx
│   │   ├── CustomerDashboard.tsx
│   │   ├── EaseVoiceNarration.tsx
│   │   ├── EventDetail.tsx
│   │   ├── Home.tsx
│   │   ├── Login.tsx
│   │   ├── OrganizerDashboard.tsx
│   │   ├── Verify.tsx
│   │   └── VerifyEmail.tsx
│   ├── routes.tsx      # React Router route definitions
│   ├── App.tsx         # Main application container
│   ├── main.tsx        # Application root entry point
│   └── index.css       # Global styles & Tailwind CSS imports
├── .env.example        # Environment variable template
├── package.json        # Dependencies & NPM scripts
├── tsconfig.json       # TypeScript configuration
└── vite.config.ts      # Vite configuration & plugin setup
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your machine:
- **Node.js** (v18.0.0 or later, v20+ recommended)
- **npm** (v9+ or **pnpm**)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in this directory (or copy from `.env.example`):

```bash
cp .env.example .env
```

Configure your environment settings:

```env
# URL to EventEase FastAPI backend service
# (Defaults to production backend https://eventease-backend-fbpd.onrender.com if omitted)
VITE_API_BASE_URL=http://localhost:8000

# Optional: Ticketmaster Discovery API key for live external events
VITE_TICKETMASTER_API_KEY=
```

### 3. Run the Development Server

Start the local Vite development server:

```bash
npm run dev
```

The application will be available at:
`http://localhost:8443` (or the port specified in your console output).

---

## 📜 Available NPM Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Vite development server with Hot Module Replacement (HMR). |
| `npm run build` | Compiles TypeScript and creates an optimized production bundle in `dist/`. |
| `npm run preview` | Locally serves the production build from `dist/` for verification. |
| `npm run format` | Formats source code using `oxfmt`. |

---

## 🔌 Backend Integration

The frontend client communicates with the EventEase **FastAPI Backend Service**:

- **API Base Route**: `/api/v1`
- **Authentication**: JWT Bearer token authentication stored in browser `localStorage`.
- **Default Deployed API**: `https://eventease-backend-fbpd.onrender.com`
- **Local API Target**: Set `VITE_API_BASE_URL=http://localhost:8000` when running the backend locally.

For backend setup, database migrations, and API endpoint documentation, refer to the **`README.md`** on the **`backend`** branch.
