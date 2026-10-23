import { useEffect, useState } from "react";
import { Building2, Accessibility, MapPin, Layers, Info } from "lucide-react";
import {
  backendListVenues,
  backendGetVenueLayout,
  type Venue,
  type VenueLayout,
} from "../lib/backendApi";
import { Badge, Card, Select, Button, Eyebrow, cx } from "./ui";

export default function VenueSeatMap({
  initialVenueId,
  onNavigateToSetup,
}: {
  initialVenueId?: string;
  onNavigateToSetup?: () => void;
}) {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>(initialVenueId ?? "");
  const [layout, setLayout] = useState<VenueLayout | null>(null);
  const [loadingLayout, setLoadingLayout] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    backendListVenues()
      .then((list) => {
        setVenues(list);
        if (list.length > 0 && !selectedId) {
          setSelectedId(initialVenueId && list.some((v) => v.id === initialVenueId) ? initialVenueId : list[0].id);
        }
      })
      .catch((cause) => {
        setLoadError(cause instanceof Error ? cause.message : "Could not load venues.");
      });
  }, [initialVenueId]);

  useEffect(() => {
    if (!selectedId) {
      setLayout(null);
      return;
    }
    const controller = new AbortController();
    setLoadingLayout(true);
    backendGetVenueLayout(selectedId)
      .then((data) => {
        if (!controller.signal.aborted) {
          setLayout(data);
          setLoadingLayout(false);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setLoadingLayout(false);
          setLoadError(cause instanceof Error ? cause.message : "Could not load venue layout.");
        }
      });
    return () => controller.abort();
  }, [selectedId]);

  if (loadError) {
    return (
      <Card className="p-8 text-center" role="alert">
        <p className="font-semibold text-danger">Error loading venue seat map</p>
        <p className="mt-2 text-sm text-muted">{loadError}</p>
      </Card>
    );
  }

  if (venues === null) {
    return <Card className="p-8 text-center text-sm text-muted">Loading your venues…</Card>;
  }

  if (venues.length === 0) {
    return (
      <Card className="p-10 text-center">
        <Building2 className="mx-auto h-12 w-12 text-muted" />
        <h3 className="mt-4 font-brand text-2xl font-bold text-brand-deep">No venue layouts yet</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Upload an Excel or CSV layout in the <strong>Venue setup</strong> tab to view and manage physical seat maps.
        </p>
        {onNavigateToSetup && (
          <Button className="mt-6" onClick={onNavigateToSetup}>
            Go to Venue setup
          </Button>
        )}
      </Card>
    );
  }

  const selectedVenue = venues.find((v) => v.id === selectedId) ?? venues[0];
  const totalAccessible = layout?.sections.reduce(
    (sum, sec) => sum + sec.rows.reduce((rSum, row) => rSum + row.seats.filter((s) => s.isAccessible).length, 0),
    0,
  ) ?? 0;

  return (
    <div className="space-y-6">
      {/* Top Banner & Venue Selector */}
      <Card className="p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <Eyebrow>Venue layout blueprint</Eyebrow>
            <h2 className="mt-1 font-brand text-2xl font-bold text-brand-deep">
              {selectedVenue?.name ?? "Venue seat map"}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-brand-orange" />
                {[selectedVenue?.area, selectedVenue?.address].filter(Boolean).join(" · ")}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-brand-purple" />
                {selectedVenue?.sections.length} sections
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-brand-deep">Venue:</label>
            <Select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="min-w-[16rem]"
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.seatCount} seats)
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Quick Venue Stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-line pt-5 sm:grid-cols-4">
          <div className="rounded-xl bg-mist/60 p-3 text-center">
            <div className="text-xs text-muted">Total capacity</div>
            <div className="mt-1 font-brand text-xl font-bold text-brand-deep">{selectedVenue?.seatCount ?? 0}</div>
          </div>
          <div className="rounded-xl bg-mist/60 p-3 text-center">
            <div className="text-xs text-muted">Sections</div>
            <div className="mt-1 font-brand text-xl font-bold text-brand-deep">{selectedVenue?.sections.length ?? 0}</div>
          </div>
          <div className="rounded-xl bg-mist/60 p-3 text-center">
            <div className="text-xs text-muted">Accessible seats</div>
            <div className="mt-1 flex items-center justify-center gap-1 font-brand text-xl font-bold text-brand-purple">
              <Accessibility className="h-4 w-4" /> {totalAccessible}
            </div>
          </div>
          <div className="rounded-xl bg-mist/60 p-3 text-center">
            <div className="text-xs text-muted">Status</div>
            <div className="mt-1">
              <Badge tone="live">Ready for events</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* The Physical Seating Blueprint */}
      <Card className="p-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <h3 className="font-brand text-xl font-bold text-brand-deep">Physical seating blueprint</h3>
            <p className="mt-1 text-sm text-muted">
              This physical seat structure is shared and reused across all events hosted at {selectedVenue?.name}.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-brand-lilac/40 px-3 py-1.5 text-xs font-semibold text-brand-purple">
            <Info className="h-4 w-4" /> Blueprint view (no ticket sales)
          </div>
        </div>

        {loadingLayout && (
          <p className="py-12 text-center text-sm text-muted">Rendering physical layout…</p>
        )}

        {!loadingLayout && layout && (
          <div>
            {/* Visual Stage */}
            <div className="mx-auto mb-8 w-2/3 rounded-t-[100%] border-t-2 border-brand-purple/40 py-2.5 text-center font-brand text-xs font-bold uppercase tracking-widest text-brand-purple">
              Stage / Performance Area
            </div>

            {/* Sections & Rows */}
            <div className="space-y-8 overflow-x-auto">
              {layout.sections.map((section) => (
                <section
                  key={section.id}
                  aria-label={section.name}
                  className="rounded-2xl border border-brand-purple/15 bg-mist/20 p-5"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <h4 className="font-brand text-base font-bold text-brand-deep">
                      Section: {section.name}
                    </h4>
                    <span className="text-xs font-medium text-muted">
                      {section.rows.reduce((sum, r) => sum + r.seats.length, 0)} seats · {section.rows.length} rows
                    </span>
                  </div>

                  <div className="space-y-3">
                    {section.rows.map((row) => (
                      <div key={row.label} className="flex items-center justify-center gap-2">
                        <span className="w-8 text-right font-mono text-xs font-bold text-muted">
                          {row.label}
                        </span>
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          {row.seats.map((seat) => (
                            <div
                              key={seat.id}
                              title={`Section ${section.name} · Row ${row.label} · Seat ${seat.number}${
                                seat.isAccessible ? " (Wheelchair accessible)" : ""
                              }`}
                              className={cx(
                                "flex h-9 w-9 items-center justify-center rounded-lg border text-xs font-bold transition-all shadow-sm",
                                seat.isAccessible
                                  ? "border-brand-purple/40 bg-brand-purple text-white shadow-brand-purple/20"
                                  : "border-brand-purple/20 bg-brand-lilac/70 text-brand-deep hover:scale-105 hover:bg-brand-purple hover:text-white",
                              )}
                            >
                              {seat.isAccessible ? (
                                <Accessibility className="h-4 w-4" />
                              ) : (
                                seat.number
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {/* Blueprint Legend */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 border-t border-line pt-6 text-xs text-muted">
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-md border border-brand-purple/20 bg-brand-lilac/70"></span>
                Standard physical seat
              </span>
              <span className="flex items-center gap-2">
                <span className="flex h-4 w-4 items-center justify-center rounded-md bg-brand-purple text-white">
                  <Accessibility className="h-3 w-3" />
                </span>
                Accessible seat (Wheelchair)
              </span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
