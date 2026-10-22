import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Accessibility, ArrowLeft, Calendar, Check } from "lucide-react";
import { useStore, fmtDate } from "../lib/store";
import type { AssistanceLevel } from "../lib/data";
import { Badge, Button, Card, Field, Textarea, cx } from "../components/ui";

const levels: { value: AssistanceLevel; copy: string }[] = [
  { value: "Basic", copy: "Occasional guidance at key points." },
  { value: "Moderate", copy: "Support during arrival, seating, and departure." },
  { value: "Full support", copy: "Continuous companion assistance throughout." },
];

export default function AssistanceRequestForm() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { user, bookings, events, assistanceRequests, addAssistanceRequest } = useStore();
  const booking = bookings.find((item) => item.id === bookingId);
  const event = booking ? events.find((item) => item.id === booking.eventId) : undefined;
  const [supportNeeds, setSupportNeeds] = useState("");
  const [level, setLevel] = useState<AssistanceLevel>("Basic");
  const [error, setError] = useState("");
  const maxLength = 500;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, []);

  const openRequest = assistanceRequests.find(
    (request) =>
      request.bookingId === bookingId &&
      ["Submitted", "Assigned", "In progress"].includes(request.status),
  );
  const eligible =
    booking?.status === "confirmed" && event && new Date(event.date).getTime() > Date.now();

  if (!user) {
    return <Navigate to="/login" replace state={{ returnTo: `/assistance/request/${bookingId}` }} />;
  }

  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (!supportNeeds.trim()) {
      setError("Please describe the support you need.");
      return;
    }
    if (!booking || !event || !eligible || openRequest) return;
    addAssistanceRequest(booking.id, event.id, supportNeeds.trim(), level);
    navigate("/assistance");
  };

  if (!booking || !event || !eligible || openRequest) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 text-center">
        <Accessibility className="mx-auto h-12 w-12 text-brand-orange" />
        <h1 className="mt-4 font-brand text-4xl font-bold text-brand-deep">Request unavailable</h1>
        <p className="mt-3 text-sm sm:text-base text-muted">
          {!eligible
            ? "Assistance can only be requested for confirmed, upcoming bookings."
            : "This booking already has an open assistance request."}
        </p>
        <Button className="mt-6" onClick={() => navigate("/assistance")}>
          View assistance requests
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/customer")} className="-ml-3 cursor-pointer">
        <ArrowLeft className="h-4 w-4" /> Back to my tickets
      </Button>
      <Badge tone="neutral" className="mt-5 border-0 bg-brand-orange text-white font-bold shadow-sm">
        <Accessibility className="h-3 w-3" /> EaseGuide
      </Badge>
      <h1 className="mt-4 font-brand text-4xl sm:text-5xl font-bold tracking-tight text-brand-deep">
        Request assistance
      </h1>

      <Card className="mt-8 overflow-hidden border border-brand-purple/15 bg-white shadow-sm rounded-3xl">
        <div className="border-b border-brand-purple/10 bg-brand-lilac/30 p-6">
          <h2 className="font-brand text-2xl font-bold text-brand-deep">{event.title}</h2>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            <Calendar className="h-4 w-4 text-brand-purple" /> {fmtDate(event.date)} · {event.venue}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-7 p-6 sm:p-8">
          <div>
            <Field label="Support needs">
              <Textarea
                rows={5}
                maxLength={maxLength}
                required
                value={supportNeeds}
                onChange={(input) => {
                  setSupportNeeds(input.target.value);
                  if (input.target.value.trim()) setError("");
                }}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "support-needs-error support-needs-count" : "support-needs-count"}
                placeholder="Tell us what would make your event journey easier."
                className="focus-visible:ring-4 focus-visible:ring-brand-purple/20"
              />
            </Field>
            <div className="mt-2 flex justify-between gap-4 text-xs font-medium">
              {error ? <span id="support-needs-error" className="font-semibold text-danger">{error}</span> : <span />}
              <span id="support-needs-count" className="text-muted">{supportNeeds.length}/{maxLength}</span>
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-bold text-brand-deep">Assistance level</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {levels.map((option) => (
                <label
                  key={option.value}
                  className={cx(
                    "cursor-pointer rounded-2xl border p-4 transition focus-within:ring-4 focus-within:ring-brand-purple/20",
                    level === option.value
                      ? "border-brand-purple bg-brand-lilac/60 shadow-sm"
                      : "border-brand-purple/15 bg-brand-warm/60 hover:border-brand-purple hover:bg-brand-lilac/30",
                  )}
                >
                  <input
                    type="radio"
                    name="assistance-level"
                    value={option.value}
                    checked={level === option.value}
                    onChange={() => setLevel(option.value)}
                    className="sr-only"
                  />
                  <span className="flex items-center justify-between font-bold text-brand-deep">
                    {option.value}
                    {level === option.value && <Check className="h-4 w-4 text-brand-purple" />}
                  </span>
                  <span className="mt-2 block text-xs leading-relaxed text-muted">{option.copy}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-3 border-t border-brand-purple/10 pt-6">
            <Button type="submit">Submit request</Button>
            <Button type="button" variant="outline" onClick={() => navigate("/dashboard/customer")}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
