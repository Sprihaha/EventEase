import { useState } from "react";
import { Globe, GlobeLock, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { useWebSearchable } from "../../lib/seoSettings";
import { Badge, Button, Card, cx } from "../ui";

export interface WebSearchableControlProps {
  variant?: "card" | "compact" | "banner";
  className?: string;
}

// UI Visibility toggle: set to true to restore the searchable toggle and settings across the UI.
export const SHOW_WEB_SEARCHABLE_UI = false;

export default function WebSearchableControl({
  variant = "card",
  className,
}: WebSearchableControlProps) {
  if (!SHOW_WEB_SEARCHABLE_UI) return null;

  const [searchable, setSearchable] = useWebSearchable();
  const [toast, setToast] = useState<string | null>(null);

  const toggle = () => {
    const next = !searchable;
    setSearchable(next);
    setToast(
      next
        ? "Web Searchability Activated: Site is now indexable by Google & Bing."
        : "Web Searchability Deactivated: 'noindex, nofollow' applied."
    );
    window.setTimeout(() => setToast(null), 3500);
  };

  if (variant === "compact") {
    return (
      <div className={cx("inline-flex items-center gap-2", className)}>
        <button
          type="button"
          onClick={toggle}
          title={searchable ? "Web Searchable: Active (Click to deactivate)" : "Web Searchable: Deactivated (Click to activate)"}
          className={cx(
            "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition cursor-pointer shadow-sm border",
            searchable
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              : "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"
          )}
        >
          {searchable ? (
            <>
              <Globe className="h-3.5 w-3.5 text-emerald-600 animate-pulse" />
              <span>Searchable: ON</span>
            </>
          ) : (
            <>
              <GlobeLock className="h-3.5 w-3.5 text-rose-600" />
              <span>Searchable: OFF</span>
            </>
          )}
        </button>
      </div>
    );
  }

  if (variant === "banner") {
    if (searchable) return null;
    return (
      <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-xs font-medium text-amber-900 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
          <span>
            <strong>Web Search Indexing is Deactivated:</strong> Search engines are instructed not to index this site (<code className="bg-amber-100 px-1 py-0.5 rounded">noindex, nofollow</code>).
          </span>
        </div>
        <button
          onClick={toggle}
          className="shrink-0 bg-amber-600 text-white hover:bg-amber-700 font-semibold px-2.5 py-1 rounded text-xs transition"
        >
          Activate Indexing
        </button>
      </div>
    );
  }

  return (
    <Card className={cx("p-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div
            className={cx(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition",
              searchable
                ? "bg-emerald-100 text-emerald-700"
                : "bg-rose-100 text-rose-700"
            )}
          >
            {searchable ? (
              <Globe className="h-6 w-6" />
            ) : (
              <GlobeLock className="h-6 w-6" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="font-brand text-xl font-bold text-brand-deep">
                Web Search Engine Visibility
              </h3>
              <Badge tone={searchable ? "live" : "danger"}>
                {searchable ? "Live & Searchable" : "Deactivated (noindex)"}
              </Badge>
            </div>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
              {searchable
                ? "Search engines (Googlebot, Bingbot) can crawl and index public events, categories, and community discussions. Schema.org structured data and dynamic sitemaps are active."
                : "All pages currently output '<meta name=\"robots\" content=\"noindex, nofollow\">'. Search engines will discard this site from search results and cease crawling."}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:items-end gap-2">
          <Button
            variant={searchable ? "outline" : "primary"}
            onClick={toggle}
            className={cx(
              "font-brand font-semibold shadow-sm transition",
              searchable
                ? "border-rose-300 text-rose-700 hover:bg-rose-50"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            )}
          >
            {searchable ? (
              <>
                <GlobeLock className="mr-2 h-4 w-4" /> Deactivate Searchability
              </>
            ) : (
              <>
                <Globe className="mr-2 h-4 w-4" /> Activate Web Searchability
              </>
            )}
          </Button>
          <span className="text-[11px] text-muted">
            Current directive:{" "}
            <code className="font-mono text-brand-deep font-semibold">
              {searchable ? "index, follow" : "noindex, nofollow"}
            </code>
          </span>
        </div>
      </div>

      {toast && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-brand-deep p-3 text-xs text-white shadow-md animate-fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-brand-purple/10 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <div className="flex items-center gap-4">
          <span>
            Robots file:{" "}
            <a
              href="/robots.txt"
              target="_blank"
              rel="noreferrer"
              className="text-brand-purple font-semibold hover:underline inline-flex items-center gap-1"
            >
              /robots.txt <ExternalLink className="h-3 w-3" />
            </a>
          </span>
          <span>
            Sitemap:{" "}
            <a
              href="/sitemap.xml"
              target="_blank"
              rel="noreferrer"
              className="text-brand-purple font-semibold hover:underline inline-flex items-center gap-1"
            >
              /sitemap.xml <ExternalLink className="h-3 w-3" />
            </a>
          </span>
        </div>
        <span className="italic">Applies instantly across all routes</span>
      </div>
    </Card>
  );
}
