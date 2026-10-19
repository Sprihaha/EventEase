import { useSearchParams, useParams, Link } from "react-router";
import { CheckCircle2, XCircle, ShieldCheck, Ticket } from "lucide-react";
import { useStore, fmtDate } from "../lib/store";
import { Button, Badge, Card } from "../components/ui";

export default function Verify() {
  const { ref } = useParams();
  const [params] = useSearchParams();
  const seats = params.get("seats");
  const { bookings, events } = useStore();

  const booking = bookings.find((b) => b.ref === ref);
  const ev = booking ? events.find((e) => e.id === booking.eventId) : undefined;
  const valid = booking && booking.status === "confirmed";

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 py-20 text-center">
      <Badge tone="neutral" className="border-0 bg-brand-orange text-white font-bold shadow-sm">
        <ShieldCheck className="h-3 w-3" /> Gate check-in
      </Badge>

      <Card className="mt-6 w-full overflow-hidden border border-brand-purple/15 bg-white shadow-xl rounded-3xl">
        <div className={valid ? "bg-emerald-50 p-8 border-b border-emerald-100" : "bg-rose-50 p-8 border-b border-rose-100"}>
          {valid ? (
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
          ) : (
            <XCircle className="mx-auto h-16 w-16 text-rose-600" />
          )}
          <h1 className="mt-4 font-brand text-3xl font-bold text-brand-deep">
            {valid ? "Valid ticket" : booking ? "Ticket not valid" : "Ticket not found"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {valid
              ? "Admit this guest. QR authenticity confirmed."
              : booking
                ? `This ticket is marked "${booking.status}" and cannot be used for entry.`
                : `No booking matches reference ${ref}.`}
          </p>
        </div>

        {booking && (
          <div className="space-y-2 p-6 text-left text-sm">
            <Row label="Reference" value={booking.ref} />
            {ev && <Row label="Event" value={ev.title} />}
            {ev && <Row label="Date" value={fmtDate(ev.date)} />}
            <Row label="Seats" value={seats || booking.seats.map((s) => s.seat).join(", ")} />
            <Row label="Status" value={booking.status} />
          </div>
        )}
      </Card>

      <Link to="/" className="mt-6">
        <Button variant="outline">
          <Ticket className="h-4 w-4 text-brand-orange" /> Back to EventEase
        </Button>
      </Link>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-brand-purple/10 py-2.5 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-bold text-brand-deep capitalize">{value}</span>
    </div>
  );
}
