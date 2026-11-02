import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { createPortal } from "react-dom";
import { Bell, X } from "lucide-react";
import { getExchangeActivity } from "../lib/exchangeApi";
import useExchangeResource from "../lib/useExchangeResource";
import {
  EXCHANGE_ACTIVITY_CHANGED, exchangeNotifications, notificationLink,
  notificationMessage, notificationReadKey, parseReadNotifications,
} from "../lib/exchangeNotifications";
import type { ExchangeActivity } from "../lib/exchangeTypes";

function readSaved(key: string) {
  try { return parseReadNotifications(localStorage.getItem(key)); }
  catch { return []; }
}

// Layout keys this component by customer ID so account changes discard private state.
export default function ExchangeNotifications({ userId }: { userId: string }) {
  const activity = useExchangeResource(`notification-activity:${userId}`, getExchangeActivity);
  const items = exchangeNotifications(activity.data ?? []);
  const storageKey = notificationReadKey(userId);
  const [readIds, setReadIds] = useState(() => readSaved(storageKey));
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<ExchangeActivity | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const unread = items.filter(item => !readIds.includes(item.id)).length;

  function markRead(ids: string[]) {
    // Merge saved state too, so another tab's reads are retained.
    const next = [...new Set([...readSaved(storageKey), ...readIds, ...ids])].slice(-500);
    setReadIds(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep session state when storage is unavailable. */ }
  }

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setReadIds(readSaved(storageKey));
    };
    const refresh = () => activity.refresh();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", refresh);
    window.addEventListener(EXCHANGE_ACTIVITY_CHANGED, refresh);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(EXCHANGE_ACTIVITY_CHANGED, refresh);
    };
  }, [storageKey, activity.refresh]);

  useEffect(() => {
    if (activity.status !== "success" || !activity.data) return;
    const notifications = exchangeNotifications(activity.data);
    if (seen.current) {
      const fresh = notifications.find(item => !seen.current!.has(item.id) && !readSaved(storageKey).includes(item.id));
      if (fresh) setToast(fresh);
      for (const item of notifications) seen.current.add(item.id);
    } else {
      // The first successful load establishes history without replaying old toasts.
      seen.current = new Set(notifications.map(item => item.id));
    }
  }, [activity.data, activity.status, storageKey]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const follow = (item: ExchangeActivity) => { markRead([item.id]); setOpen(false); setToast(null); };

  return <div ref={container} className="relative">
    <button ref={trigger} type="button" aria-label={`Exchange notifications, ${unread} unread`}
      aria-expanded={open} aria-controls={panelId}
      onClick={() => { setOpen(value => !value); activity.refresh(); }}
      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-brand-purple hover:bg-brand-lilac focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-orange/30">
      <Bell className="h-5 w-5" aria-hidden="true" />
      {unread > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 rounded-full bg-brand-orange px-1.5 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
    </button>
    {open && <section id={panelId} aria-label="Exchange notifications" className="fixed left-3 right-3 top-20 z-50 rounded-2xl border border-brand-purple/15 bg-white p-4 shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-3 sm:w-96">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-brand font-bold text-brand-deep">Exchange notifications</h2>
        <button type="button" disabled={!unread} onClick={() => markRead(items.map(item => item.id))}
          className="text-xs font-semibold text-brand-purple underline disabled:opacity-40">Mark all as read</button>
      </div>
      <p className="mt-1 text-xs text-muted">Read status is saved in this browser. Updates about every 30 seconds.</p>
      {activity.status === "loading" && !activity.data && <p role="status" className="py-4 text-sm">Loading notifications…</p>}
      {activity.error && <div role="alert" className="mt-3 text-sm"><p>{activity.error}</p><button type="button" onClick={activity.reload} className="text-brand-purple underline">Retry notifications</button></div>}
      {activity.status === "success" && !items.length && <p className="py-6 text-sm text-muted">No exchange notifications yet.</p>}
      <ul className="mt-3 max-h-[min(65vh,480px)] space-y-2 overflow-y-auto">
        {items.map(item => <li key={item.id} className={`rounded-xl p-3 ${readIds.includes(item.id) ? "bg-brand-warm" : "bg-brand-lilac/60"}`}>
          <Link to={notificationLink(item)} onClick={() => follow(item)} className="block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple">
            <span className="block text-xs font-bold text-brand-purple">{item.eventName}{!readIds.includes(item.id) && <span className="ml-2">· Unread</span>}</span>
            <span className="mt-1 block text-sm text-brand-deep">{notificationMessage(item)}</span>
            <time dateTime={item.createdAt} className="mt-1 block text-xs text-muted">{new Date(item.createdAt).toLocaleString("en-SG")}</time>
          </Link>
          {item.action === "EXCHANGE_COMPLETED" && <Link to="/dashboard/customer" onClick={() => follow(item)} className="mt-2 inline-block text-xs font-semibold text-brand-purple underline">Open My Tickets</Link>}
        </li>)}
      </ul>
      <Link to="/community?tab=exchange&view=activity" onClick={() => setOpen(false)} className="mt-3 inline-block text-sm font-semibold text-brand-purple underline">View exchange activity</Link>
    </section>}
    {toast && createPortal(<aside role="status" className="fixed bottom-5 left-4 right-4 z-50 flex items-start gap-3 rounded-2xl border border-brand-purple/20 bg-white p-4 shadow-xl sm:left-auto sm:w-96">
      <Link to={notificationLink(toast)} onClick={() => follow(toast)} className="flex-1 text-sm text-brand-deep"><strong className="block text-brand-purple">{toast.eventName}</strong>{notificationMessage(toast)}</Link>
      <button type="button" aria-label="Dismiss notification" onClick={() => setToast(null)} className="rounded p-1 hover:bg-brand-lilac"><X className="h-4 w-4" /></button>
    </aside>, document.body)}
  </div>;
}
