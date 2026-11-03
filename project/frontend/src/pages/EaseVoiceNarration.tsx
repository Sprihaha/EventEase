import { ShieldX, Volume2 } from "lucide-react";
import { useStore } from "../lib/store";
import { Badge, Card } from "../components/ui";
import EaseVoiceBehaviourSettings from "../components/voice/EaseVoiceBehaviourSettings";

/** Admin only: how EaseVoice behaves for every visitor (read highlighted text, idle prompt). */
export default function EaseVoiceNarration({ embedded = false }: { embedded?: boolean }) {
  const { user } = useStore();

  if (user?.role !== "admin") {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-xl items-center px-5 py-16 text-center">
        <Card className="w-full p-10">
          <ShieldX className="mx-auto h-12 w-12 text-danger" />
          <h1 className="mt-5 font-brand text-3xl font-bold text-brand-deep">
            Access denied: admins only
          </h1>
          <p className="mt-3 text-sm text-muted">
            EaseVoice settings can only be changed by an EventEase administrator.
          </p>
        </Card>
      </div>
    );
  }
  return (
    <div className={embedded ? "" : "mx-auto max-w-4xl px-5 py-14"}>
      <Badge tone="accent"><Volume2 className="h-3 w-3" /> Admin only</Badge>
      <h1 className="mt-4 font-brand text-3xl sm:text-4xl font-bold tracking-tight text-brand-deep">
        <span className="font-feature italic font-black">EaseVoice</span> settings
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        EaseVoice reads out any text a visitor highlights and offers help when they have been inactive.
        It sits as a small tab at the bottom-right of every page.
      </p>

      <EaseVoiceBehaviourSettings />
    </div>
  );
}
