import { useEffect, useRef } from "react";
import { Clock } from "lucide-react";

type SessionExpiredModalProps = {
  isOpen: boolean;
  onConfirm: () => void;
};

export default function SessionExpiredModal({ isOpen, onConfirm }: SessionExpiredModalProps) {
  const okButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus the OK button when modal opens
      okButtonRef.current?.focus();

      // Block ESC key dismissal
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
        }
      };

      window.addEventListener("keydown", handleKeyDown, true);
      return () => window.removeEventListener("keydown", handleKeyDown, true);
    }
  }, [isOpen]);

  if (!isOpen) return null;

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
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-orange/15 text-brand-orange shadow-inner">
          <Clock className="h-7 w-7 text-brand-orange" aria-hidden="true" />
        </div>

        <h2 id="session-expired-title" className="font-brand text-xl font-bold text-brand-deep">
          Session Expired
        </h2>

        <p id="session-expired-desc" className="mt-2.5 text-sm leading-relaxed text-muted">
          Session expired, please login again.
        </p>

        <div className="mt-6">
          <button
            ref={okButtonRef}
            type="button"
            id="session-expired-ok-btn"
            onClick={onConfirm}
            className="w-full cursor-pointer rounded-xl bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange py-3 text-sm font-bold text-white shadow-lg shadow-brand-purple/25 transition-all hover:opacity-95 hover:shadow-xl active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/40"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
