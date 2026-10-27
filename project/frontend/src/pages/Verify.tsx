import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { useStore } from "../lib/store";
import { verifyTicket, checkInTicket, type Verification } from "../lib/ticketingApi";
import { Button, Badge, Card } from "../components/ui";

export default function Verify() {
  const { ref = "" } = useParams();
  const { user } = useStore();
  const [result, setResult] = useState<Verification | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setResult(null); setError(""); setMessage("");
    verifyTicket(ref, controller.signal).then(setResult).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Verification unavailable."); });
    return () => controller.abort();
  }, [ref]);
  const checkin = async () => {
    setBusy(true); setError("");
    try { const check = await checkInTicket(ref); setMessage(check.message); setResult(await verifyTicket(ref)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Check-in was not confirmed. Refresh before retrying."); }
    finally { setBusy(false); }
  };
  return <div className="mx-auto max-w-lg px-5 py-14 text-center"><Badge tone="accent">Ticket verification</Badge><Card className="mt-6 space-y-4 p-7"><h1 className="font-brand text-3xl font-bold">{result ? result.valid ? "Valid ticket" : "Ticket unavailable for entry" : error ? "Ticket not verified" : "Checking ticket…"}</h1>{error && <p role="alert" className="text-danger">{error}</p>}{result && <><h2 className="text-xl font-bold">{result.eventTitle}</h2><p>Seat {result.seatLabel ?? "General Admission"}</p><p>{result.message}</p>{result.checkedInAt && <p>Admitted: {new Date(result.checkedInAt).toLocaleString("en-SG")}</p>}{result.valid && (user?.role === "admin" || user?.role === "organizer") && <Button disabled={busy} onClick={checkin}>{busy ? "Recording…" : "Admit guest & record check-in"}</Button>}{result.valid && user?.role !== "admin" && user?.role !== "organizer" && <p className="text-sm text-muted">Gate staff must sign in to record admission.</p>}</>}{message && <p role="status">{message}</p>}</Card><Link to="/dashboard/customer"><Button variant="outline" className="mt-6">Back to my tickets</Button></Link></div>;
}
