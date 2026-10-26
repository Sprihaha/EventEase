import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeftRight, Building2, ChevronDown } from "lucide-react";
import { getCurrentOrganisation } from "../../lib/organisation";

// Header button for organisers: shows the organisation chosen for this session and offers
// "Switch organisation". Re-reads the choice on every render (the layout re-renders on navigation).
export function OrganisationSwitcher() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const organisation = getCurrentOrganisation();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={organisation ? `Organisation: ${organisation.name}` : "Select your organisation"}
        className="flex max-w-[14rem] cursor-pointer items-center gap-2 rounded-full border border-brand-orange/30 bg-brand-orange/5 px-3 py-1.5 text-sm font-semibold text-brand-deep transition hover:border-brand-orange focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-orange/30"
      >
        <Building2 className="h-4 w-4 shrink-0 text-brand-orange" />
        <span className="truncate">{organisation?.name ?? "Select organisation"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-60 rounded-2xl border border-brand-purple/15 bg-white p-2 shadow-xl">
          {organisation && <p className="px-3 pb-2 pt-1 text-xs text-muted">Working for <strong className="text-brand-deep">{organisation.name}</strong></p>}
          <button
            role="menuitem"
            type="button"
            onClick={() => { setOpen(false); navigate("/select-organisation"); }}
            className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-brand-text transition hover:bg-brand-lilac hover:text-brand-purple"
          >
            <ArrowLeftRight className="h-4 w-4 text-brand-purple" />
            Switch organisation
          </button>
        </div>
      )}
    </div>
  );
}
