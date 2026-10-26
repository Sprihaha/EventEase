import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { ApiError, downloadBackendReport } from "../../lib/backendApi";
import { Button } from "../ui";

export type ReportFormat = "pdf" | "xlsx";

type Props = {
  label: string;
  /** Backend path (with query string) for the chosen format, e.g. "/organiser/analytics/export?format=pdf". */
  buildPath: (format: ReportFormat) => string;
  /** File name used if the server does not send one. */
  fallbackName: (format: ReportFormat) => string;
  /** Return a message to stop the download (for example an invalid date range). */
  validate?: () => string | null;
};

const formats: { id: ReportFormat; name: string; hint: string; icon: typeof FileText }[] = [
  { id: "pdf", name: "PDF report", hint: "Charts and summary, ready to present", icon: FileText },
  { id: "xlsx", name: "Excel workbook", hint: "Charts plus the full data tables", icon: FileSpreadsheet },
];

export default function ReportDownload({ label, buildPath, fallbackName, validate }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ReportFormat | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  const run = async (format: ReportFormat) => {
    setOpen(false);
    setError("");
    setDone("");
    const problem = validate?.();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(format);
    try {
      const name = await downloadBackendReport(buildPath(format), fallbackName(format));
      setDone(`Downloaded ${name}`);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        setError("Please log in again to download this report.");
      } else if (reason instanceof ApiError && reason.status === 403) {
        setError("Your account is not allowed to download this report.");
      } else if (reason instanceof ApiError) {
        setError(reason.message);
      } else {
        setError("Could not reach the server. Check your connection and try again.");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={box} className="relative">
      <Button
        type="button"
        variant="outline"
        disabled={busy !== null}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {busy ? "Preparing report…" : label}
        <ChevronDown className="h-4 w-4" />
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl border border-line bg-paper p-2 shadow-xl"
        >
          {formats.map(({ id, name, hint, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              onClick={() => run(id)}
              className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-brand-purple/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-purple" />
              <span>
                <span className="block text-sm font-semibold text-brand-deep">{name}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {(error || done) && (
        <p
          role={error ? "alert" : "status"}
          className={`absolute right-0 top-full z-20 mt-2 w-72 text-right text-sm font-medium ${
            error ? "text-danger" : "text-live"
          }`}
        >
          {error || done}
        </p>
      )}
    </div>
  );
}
