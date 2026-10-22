import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
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
import { useStore } from "../lib/store";
import SecureExchange from "../components/SecureExchange";
import { Button, Badge, Card, Textarea, cx } from "../components/ui";

const tabs = [
  { id: "feed", label: "Discussion", icon: Users },
  { id: "exchange", label: "Secure exchange", icon: Repeat },
  { id: "views", label: "Seat photos & 360°", icon: Camera },
  { id: "access", label: "Accessibility", icon: Accessibility },
] as const;

export default function Community() {
  const { posts, events, user, addPost } = useStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab = tabs.find((item) => item.id === requestedTab)?.id ?? "feed";
  const [draft, setDraft] = useState("");
  const setTab = (id: (typeof tabs)[number]["id"]) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", id);
      next.delete("view");
      return next;
    });
  };

  const eventName = (id: string) => events.find((e) => e.id === id)?.title ?? "Event";

  const submit = () => {
    if (!draft.trim()) return;
    if (!user) return navigate("/login");
    addPost({ eventId: events[0].id, author: user.name.split(" ")[0], body: draft.trim() });
    setDraft("");
  };

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <Badge tone="neutral" className="border-0 bg-brand-orange text-white font-bold shadow-sm">
        <Users className="h-3 w-3" /> EaseComms
      </Badge>
      <h1 className="mt-3 font-brand text-4xl sm:text-5xl font-bold tracking-tight text-brand-deep">
        The community space
      </h1>
      <p className="mt-3 max-w-xl text-sm sm:text-base leading-relaxed text-muted">
        Meet fellow fans, exchange tickets securely, share the real view from your seat, and find
        accessibility support — before and after you buy.
      </p>

      <div className="no-scrollbar mt-8 flex gap-2.5 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              "cursor-pointer flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm transition",
              tab === t.id
                ? "border-brand-purple bg-brand-purple text-white shadow-md font-bold"
                : "border-brand-purple/15 bg-white text-muted hover:border-brand-purple hover:text-brand-deep font-semibold",
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "feed" && (
          <div className="space-y-4">
            <Card className="border border-brand-purple/15 bg-white p-5 shadow-sm rounded-3xl">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                placeholder="Ask about seats, find people to go with, share a tip…"
              />
              <div className="mt-3.5 flex justify-end">
                <Button size="sm" onClick={submit}>
                  <Send className="h-4 w-4" /> Post
                </Button>
              </div>
            </Card>
            {posts.map((p) => (
              <div
                key={p.id}
                className="flex gap-3.5 rounded-2xl border border-brand-purple/15 bg-white p-5 shadow-sm"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-purple to-brand-magenta font-bold text-white shadow-sm">
                  {p.author[0]}
                </div>
                <div className="flex-1">
                  <div className="text-sm">
                    <span className="font-bold text-brand-deep">{p.author}</span>{" "}
                    <span className="text-muted">on {eventName(p.eventId)} · {p.when}</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{p.body}</p>
                  {p.photo && (
                    <img
                      src={p.photo}
                      alt="Seat view"
                      className="mt-3.5 h-48 w-full max-w-md rounded-xl object-cover shadow-sm"
                    />
                  )}
                  <button className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-brand-magenta cursor-pointer">
                    <Heart className="h-4 w-4" /> {p.likes}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "exchange" && <SecureExchange key={user?.id ?? "public"} />}

        {tab === "views" && (
          <div>
            <div className="mb-5 flex items-center gap-2.5 rounded-2xl border border-brand-purple/20 bg-brand-lilac/60 p-4.5 text-sm font-medium text-brand-deep shadow-sm">
              <Rotate3d className="h-5 w-5 shrink-0 text-brand-purple" />
              Explore 360° venue views and real, community-uploaded photos so you know exactly what
              you're paying for before you buy.
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {posts
                .filter((p) => p.photo)
                .concat(posts.filter((p) => p.photo))
                .slice(0, 6)
                .map((p, i) => (
                  <div
                    key={i}
                    className="group relative overflow-hidden rounded-2xl border border-brand-purple/15 bg-white shadow-sm"
                  >
                    <img
                      src={p.photo}
                      alt="Seat view"
                      className="h-48 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 flex items-end bg-gradient-to-t from-brand-deep/85 via-brand-deep/30 to-transparent p-4">
                      <div className="text-white">
                        <div className="font-brand text-sm font-bold">Section {p.section ?? "GA"}</div>
                        <div className="text-xs text-white/75">{eventName(p.eventId)}</div>
                      </div>
                    </div>
                    <button className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-brand-deep/85 px-3 py-1 text-xs font-bold text-white backdrop-blur shadow-sm">
                      <Rotate3d className="h-3.5 w-3.5 text-brand-orange" /> 360°
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {tab === "access" && (
          <div className="grid gap-5 sm:grid-cols-2">
            {[
              { icon: Accessibility, h: "Companion assistance", p: "Request a trained companion to help you navigate the venue, from entrance to seat and back." },
              { icon: Users, h: "In-built audio tour & voice guidance", p: "Turn-by-turn voice guidance around the venue plus an audio description of the event and facilities." },
              { icon: ShieldCheck, h: "Accessible community", p: "Connect with others before booking to ask about ramps, lifts, sensory rooms and quiet spaces." },
              { icon: Camera, h: "Verified access photos", p: "Community-shared photos of step-free routes, accessible seating and facilities." },
            ].map((f) => (
              <Card key={f.h} className="border border-brand-purple/15 bg-white p-6 shadow-sm rounded-3xl">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-lilac text-brand-purple">
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-brand text-lg font-bold text-brand-deep">{f.h}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.p}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
