import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Users,
  Repeat,
  Camera,
  Rotate3d,
  Heart,
  ShieldCheck,
  Accessibility,
  Send,
} from "lucide-react";
import { useStore, currency } from "../lib/store";
import { Button, Badge, Card, Eyebrow, Textarea, cx } from "../components/ui";

const tabs = [
  { id: "feed", label: "Discussion", icon: Users },
  { id: "exchange", label: "Secure exchange", icon: Repeat },
  { id: "views", label: "Seat photos & 360°", icon: Camera },
  { id: "access", label: "Accessibility", icon: Accessibility },
] as const;

export default function Community() {
  const { posts, exchange, events, user, addPost } = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("feed");
  const [draft, setDraft] = useState("");

  const eventName = (id: string) => events.find((e) => e.id === id)?.title ?? "Event";

  const submit = () => {
    if (!draft.trim()) return;
    if (!user) return navigate("/login");
    addPost({ eventId: events[0].id, author: user.name.split(" ")[0], body: draft.trim() });
    setDraft("");
  };

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <Badge tone="accent">
        <Users className="h-3 w-3" /> EaseComms
      </Badge>
      <h1 className="mt-3 font-display text-5xl font-semibold tracking-tight">The community space</h1>
      <p className="mt-3 max-w-xl text-muted">
        Meet fellow fans, exchange tickets securely, share the real view from your seat, and find
        accessibility support — before and after you buy.
      </p>

      <div className="no-scrollbar mt-8 flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              "flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition",
              tab === t.id ? "border-accent bg-accent text-white" : "border-line text-muted hover:border-ink hover:text-ink",
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "feed" && (
          <div className="space-y-4">
            <Card className="p-4">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                placeholder="Ask about seats, find people to go with, share a tip…"
              />
              <div className="mt-3 flex justify-end">
                <Button size="sm" onClick={submit}>
                  <Send className="h-4 w-4" /> Post
                </Button>
              </div>
            </Card>
            {posts.map((p) => (
              <div key={p.id} className="flex gap-3 rounded-2xl border border-line p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-ink">
                  {p.author[0]}
                </div>
                <div className="flex-1">
                  <div className="text-sm">
                    <span className="font-semibold">{p.author}</span>{" "}
                    <span className="text-muted">on {eventName(p.eventId)} · {p.when}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{p.body}</p>
                  {p.photo && (
                    <img src={p.photo} alt="Seat view" className="mt-3 h-44 w-full max-w-md rounded-xl object-cover" />
                  )}
                  <button className="mt-2 flex items-center gap-1.5 text-sm text-muted hover:text-accent">
                    <Heart className="h-4 w-4" /> {p.likes}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "exchange" && (
          <div>
            <div className="mb-4 flex items-center gap-2 rounded-2xl bg-live/10 p-4 text-sm text-live">
              <ShieldCheck className="h-5 w-5 shrink-0" />
              Every listing is a verified one-to-one transfer at or below face value. No shady
              resellers, no scams — the platform re-issues the QR to the new owner.
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {exchange.map((x) => (
                <Card key={x.id} className="p-5">
                  <div className="flex items-center justify-between">
                    <Badge tone="live">
                      <ShieldCheck className="h-3 w-3" /> Verified transfer
                    </Badge>
                    <span className="text-sm text-muted">{x.tier}</span>
                  </div>
                  <h3 className="mt-3 font-display text-lg font-semibold">{eventName(x.eventId)}</h3>
                  <div className="mt-1 text-sm text-muted">
                    Seat {x.seat} · Listed by {x.sellerName}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                    <span className="font-display text-xl font-semibold">{currency(x.askPrice)}</span>
                    <Button size="sm">Request transfer</Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {tab === "views" && (
          <div>
            <div className="mb-4 flex items-center gap-2 rounded-2xl bg-accent-soft p-4 text-sm text-accent-ink">
              <Rotate3d className="h-5 w-5 shrink-0" />
              Explore 360° venue views and real, community-uploaded photos so you know exactly what
              you're paying for before you buy.
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {posts
                .filter((p) => p.photo)
                .concat(posts.filter((p) => p.photo))
                .slice(0, 6)
                .map((p, i) => (
                  <div key={i} className="group relative overflow-hidden rounded-2xl border border-line">
                    <img src={p.photo} alt="Seat view" className="h-44 w-full object-cover" />
                    <div className="absolute inset-0 flex items-end bg-gradient-to-t from-ink/70 to-transparent p-3">
                      <div className="text-white">
                        <div className="text-sm font-semibold">Section {p.section ?? "GA"}</div>
                        <div className="text-xs text-white/70">{eventName(p.eventId)}</div>
                      </div>
                    </div>
                    <button className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-ink">
                      <Rotate3d className="h-3 w-3" /> 360°
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {tab === "access" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: Accessibility, h: "Companion assistance", p: "Request a trained companion to help you navigate the venue, from entrance to seat and back." },
              { icon: Users, h: "In-built audio tour & voice guidance", p: "Turn-by-turn voice guidance around the venue plus an audio description of the event and facilities." },
              { icon: ShieldCheck, h: "Accessible community", p: "Connect with others before booking to ask about ramps, lifts, sensory rooms and quiet spaces." },
              { icon: Camera, h: "Verified access photos", p: "Community-shared photos of step-free routes, accessible seating and facilities." },
            ].map((f) => (
              <Card key={f.h} className="p-5">
                <f.icon className="h-6 w-6 text-accent" />
                <h3 className="mt-3 font-display text-lg font-semibold">{f.h}</h3>
                <p className="mt-1.5 text-sm text-muted">{f.p}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
