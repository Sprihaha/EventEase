import { useEffect, useRef, useState } from "react";
import { Clock, RefreshCw, LogOut } from "lucide-react";

export type SessionExpiredModalProps = {
  isOpen: boolean;
  onConfirm: () => void;
  onKeepLoggedIn?: () => void | Promise<void>;
};

export default function SessionExpiredModal({
  isOpen,
  onConfirm,
  onKeepLoggedIn,
}: SessionExpiredModalProps) {
  const [countdown, setCountdown] = useState(5);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const keepLoggedInBtnRef = useRef<HTMLButtonElement>(null);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    if (!isOpen) return;

    setCountdown(5);
    setIsRefreshing(false);

    // Auto-focus "Keep me logged in" button so keyboard users can immediately stay logged in
    const focusTimer = setTimeout(() => {
      keepLoggedInBtnRef.current?.focus();
    }, 50);

    // 5-second countdown timer. If user makes no choice within 5s, auto logout
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onConfirmRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Block ESC key dismissal
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      clearTimeout(focusTimer);
      clearInterval(timer);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeepLoggedIn = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      if (onKeepLoggedIn) {
        await onKeepLoggedIn();
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      aria-describedby="session-expired-desc"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-deep/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="relative w-full max-w-sm rounded-3xl border border-brand-purple/20 bg-white p-6 sm:p-7 text-center shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-orange/15 text-brand-orange shadow-inner">
          <Clock className="h-7 w-7 text-brand-orange" aria-hidden="true" />
          <span
            className="absolute -top-1.5 -right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-orange px-1 text-xs font-bold text-white shadow-md animate-pulse"
            aria-live="polite"
          >
            {countdown}s
          </span>
        </div>

        <h2 id="session-expired-title" className="font-brand text-xl font-bold text-brand-deep">
          Session Expiring
        </h2>

        <p id="session-expired-desc" className="mt-2.5 text-sm leading-relaxed text-muted">
          Your session has reached its limit. You will be logged out in{" "}
          <span className="font-bold text-brand-orange">{countdown}s</span> unless you choose to stay logged in.
        </p>

        {/* 5-second animated countdown bar */}
        <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-brand-purple/10">
          <div
            className="h-full bg-gradient-to-r from-brand-purple to-brand-orange transition-all duration-1000 ease-linear"
            style={{ width: `${(countdown / 5) * 100}%` }}
          />
        </div>

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <button
            type="button"
            id="session-expired-logout-btn"
            onClick={onConfirm}
            disabled={isRefreshing}
            className="order-2 sm:order-1 flex-1 cursor-pointer items-center justify-center rounded-xl border border-brand-purple/20 bg-white py-2.5 px-3 text-xs sm:text-sm font-semibold text-brand-deep transition-all hover:bg-brand-lilac/30 hover:border-brand-purple/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/20 disabled:opacity-50 inline-flex gap-1.5"
          >
            <LogOut className="h-4 w-4 text-muted" />
            <span>Log out</span>
          </button>

          <button
            ref={keepLoggedInBtnRef}
            type="button"
            id="session-expired-keep-btn"
            onClick={handleKeepLoggedIn}
            disabled={isRefreshing}
            className="order-1 sm:order-2 flex-1 cursor-pointer items-center justify-center rounded-xl bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange py-2.5 px-3 text-xs sm:text-sm font-bold text-white shadow-lg shadow-brand-purple/25 transition-all hover:opacity-95 hover:shadow-xl active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/40 disabled:opacity-50 inline-flex gap-1.5"
          >
            {isRefreshing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin text-white" />
                <span>Extending...</span>
              </>
            ) : (
              <span>Keep me logged in</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
