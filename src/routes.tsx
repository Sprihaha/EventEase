import { createBrowserRouter } from "react-router";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Browse from "./pages/Browse";
import EventDetail from "./pages/EventDetail";
import Community from "./pages/Community";
import Login from "./pages/Login";
import CustomerDashboard from "./pages/CustomerDashboard";
import OrganizerDashboard from "./pages/OrganizerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import Verify from "./pages/Verify";
import VerifyEmail from "./pages/VerifyEmail";

function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-5 py-32 text-center">
      <h1 className="font-display text-6xl font-semibold">404</h1>
      <p className="mt-3 text-muted">This page took an early exit.</p>
      <a href="/" className="mt-6 inline-block text-accent hover:underline">
        Back to home →
      </a>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Home },
      { path: "events", Component: Browse },
      { path: "events/:id", Component: EventDetail },
      { path: "community", Component: Community },
      { path: "login", Component: Login },
      { path: "dashboard/customer", Component: CustomerDashboard },
      { path: "dashboard/organizer", Component: OrganizerDashboard },
      { path: "dashboard/admin", Component: AdminDashboard },
      { path: "verify/:ref", Component: Verify },
      { path: "verify-email/:code", Component: VerifyEmail },
      { path: "*", Component: NotFound },
    ],
  },
]);
