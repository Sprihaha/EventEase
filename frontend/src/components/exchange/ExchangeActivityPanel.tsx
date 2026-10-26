import { Link } from "react-router";
import { getExchangeActivity } from "../../lib/exchangeApi";
import { useStore } from "../../lib/store";
import useExchangeResource from "../../lib/useExchangeResource";
import { Button } from "../ui";

const messages: Record<string, string> = {
  EXCHANGE_OPEN: "Exchange request available",
  EXCHANGE_MATCHED: "Exchange proposal received — review both tickets",
  EXCHANGE_PENDING: "Exchange proposal received — both users must review",
  EXCHANGE_ACCEPTED: "The other participant accepted",
  EXCHANGE_READY: "Both accepted — ready for settlement; the user receiving the higher value pays the difference",
  EXCHANGE_SETTLEMENT_FAILED: "Simulated settlement declined — tickets unchanged",
  EXCHANGE_COMPLETED: "Exchange completed — your received ticket and fresh QR are in My Tickets",
  EXCHANGE_REJECTED: "Exchange rejected",
  EXCHANGE_CANCELLED: "Exchange cancelled",
  EXCHANGE_EXPIRED: "Exchange expired",
};

export function ExchangeActivityPanel() {
  const { user } = useStore();
  const activity = useExchangeResource(user ? `activity:${user.id}` : null, getExchangeActivity);
  if (!user) return null;
  return (
    <details className="rounded-2xl border border-brand-purple/20 bg-brand-lilac/40 p-4" open>
      <summary className="cursor-pointer font-semibold text-brand-purple">Exchange activity</summary>
      <Button className="my-3" size="sm" variant="outline" disabled={activity.status === "loading"} onClick={activity.reload}>Refresh activity</Button>
      {activity.status === "loading" && !activity.data && <p role="status">Loading exchange activity…</p>}
      {activity.error && <p role="alert">{activity.error}</p>}
      {activity.data?.length === 0 && <p className="text-sm text-muted">No exchange activity yet.</p>}
      <ul className="max-h-64 space-y-3 overflow-y-auto text-sm">
        {activity.data?.map(item => (
          <li key={item.id} className="rounded-xl bg-white p-3">
            <Link className="font-semibold text-brand-purple underline" to={item.matchId
              ? `/community?tab=exchange&view=mine&match=${encodeURIComponent(item.matchId)}`
              : `/community?tab=exchange&view=${item.ownAction ? "mine" : "invitations"}`}>
              {item.eventName} · {item.action === "EXCHANGE_ACCEPTED" && item.ownAction ? "You accepted" : messages[item.action] ?? "Exchange updated"}
            </Link>
            <time className="mt-1 block text-xs text-muted" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("en-SG")}</time>
            {item.action === "EXCHANGE_COMPLETED" && <Link className="text-brand-purple underline" to="/dashboard/customer">Open My Tickets</Link>}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default ExchangeActivityPanel;
