import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router";
import { Building2, Download, Upload, Armchair, Rotate3d, ExternalLink, Edit2, Check, Video, Film, Trash2, UploadCloud } from "lucide-react";
import {
  ApiError,
  backendDownloadVenueTemplate,
  backendImportVenue,
  backendUpdateVenue,
  backendListVenues,
  backendUpdateVenueEaseExplore,
  formatMediaEmbedUrl,
  type Venue,
} from "../../lib/backendApi";
import { Badge, Button, Card, Eyebrow, Field, InfoTooltip, Input, cx } from "../ui";
import { isVenueMatch } from "../community/easepix/seatMatching";
import VenueSeatMap from "./VenueSeatMap";

const emptyForm = { name: "", area: "", address: "", easeexplore360Url: "" };

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : "Something went wrong. Please try again.";
}

export function VenueSetup() {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [previewVenueId, setPreviewVenueId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lineErrors, setLineErrors] = useState<string[]>([]);
  const [templateError, setTemplateError] = useState("");

  // Editing venue details & seat map layout
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", area: "", address: "" });
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editFileInputKey, setEditFileInputKey] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [editLineErrors, setEditLineErrors] = useState<string[]>([]);

  const startEditingVenue = (venue: Venue) => {
    setEditingVenueId(venue.id);
    setEditForm({ name: venue.name, area: venue.area ?? "", address: venue.address ?? "" });
    setEditFile(null);
    setEditFileInputKey((k) => k + 1);
    setEditError("");
    setEditLineErrors([]);
  };

  const cancelEditingVenue = () => {
    setEditingVenueId(null);
    setEditFile(null);
    setEditError("");
    setEditLineErrors([]);
  };

  const saveVenueEdit = async (venueId: string) => {
    if (!editForm.name.trim() || !editForm.area.trim()) {
      setEditError("Name and Area are required.");
      return;
    }
    setSavingEdit(true);
    setEditError("");
    setEditLineErrors([]);
    try {
      const updated = await backendUpdateVenue(venueId, {
        name: editForm.name.trim(),
        area: editForm.area.trim(),
        address: editForm.address.trim(),
        file: editFile ?? undefined,
      });
      setVenues((current) => (current ? current.map((v) => (v.id === venueId ? updated : v)) : [updated]));
      setEditingVenueId(null);
      setEditFile(null);
      if (previewVenueId === venueId) {
        setPreviewVenueId(null);
        setTimeout(() => setPreviewVenueId(venueId), 50);
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.details?.errors) {
        setEditError(cause.message);
        setEditLineErrors(cause.details.errors as string[]);
      } else {
        setEditError(messageOf(cause));
      }
    } finally {
      setSavingEdit(false);
    }
  };

  // Editing 360 / Video URL for existing venue
  const [editingVenue360Id, setEditingVenue360Id] = useState<string | null>(null);
  const [venue360Input, setVenue360Input] = useState<string>("");
  const [saving360, setSaving360] = useState(false);

  // Target venue selection & scroll from EaseXplore Configure
  const [searchParams] = useSearchParams();
  const targetVenueParam = searchParams.get("venueId") || searchParams.get("venue");
  const [highlightedVenueId, setHighlightedVenueId] = useState<string | null>(null);
  const scrolledRef = useRef<string | null>(null);

  useEffect(() => {
    backendListVenues()
      .then(setVenues)
      .catch((cause) => setLoadError(messageOf(cause)));
  }, []);

  useEffect(() => {
    if (!venues || !targetVenueParam || scrolledRef.current === targetVenueParam) return;
    const matched = venues.find(
      (v) => v.id === targetVenueParam || isVenueMatch(v.name, targetVenueParam),
    );
    if (matched) {
      scrolledRef.current = targetVenueParam;
      setEditingVenue360Id(matched.id);
      setVenue360Input(matched.easeexplore360Url ?? "");
      setHighlightedVenueId(matched.id);

      const timer = setTimeout(() => {
        const el = document.getElementById(`venue-card-${matched.id}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);

      const fadeTimer = setTimeout(() => {
        setHighlightedVenueId(null);
      }, 4000);

      return () => {
        clearTimeout(timer);
        clearTimeout(fadeTimer);
      };
    }
  }, [venues, targetVenueParam]);

  const set = (key: keyof typeof emptyForm, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const canUpload = Boolean(file && form.name.trim() && form.area.trim()) && !saving;

  const downloadTemplate = async () => {
    setTemplateError("");
    try {
      await backendDownloadVenueTemplate();
    } catch (cause) {
      setTemplateError(messageOf(cause));
    }
  };

  const upload = async () => {
    if (!file || !canUpload) return;
    setSaving(true);
    setError("");
    setLineErrors([]);
    try {
      const venue = await backendImportVenue({
        name: form.name.trim(),
        area: form.area.trim(),
        address: form.address.trim(),
        file,
        easeexplore360Url: form.easeexplore360Url.trim() || undefined,
      });
      if (form.easeexplore360Url.trim() && venue?.id) {
        localStorage.setItem(`venue-media-${venue.id}`, form.easeexplore360Url.trim());
      }
      setVenues((current) => [venue, ...(current ?? []).filter((v) => v.id !== venue.id)]);
      setForm(emptyForm);
      setFile(null);
      setFileInputKey((k) => k + 1);
      setPhotoInputKey((k) => k + 1);
    } catch (cause) {
      setError(messageOf(cause));
      const details = cause instanceof ApiError ? cause.details.errors : undefined;
      if (Array.isArray(details)) setLineErrors(details.map(String));
    } finally {
      setSaving(false);
    }
  };

  const saveVenue360 = async (venueId: string, urlToSave?: string) => {
    setSaving360(true);
    try {
      const targetVal = (urlToSave !== undefined ? urlToSave : venue360Input).trim();
      const finalVal = targetVal || null;
      if (typeof window !== "undefined") {
        if (finalVal) {
          localStorage.setItem(`venue-media-${venueId}`, finalVal);
        } else {
          localStorage.removeItem(`venue-media-${venueId}`);
        }
      }
      try {
        await backendUpdateVenueEaseExplore(venueId, finalVal);
      } catch (err) {
        console.warn("Backend update venue easeexplore pending deployment, saved locally:", err);
      }
      setVenues((curr) => curr?.map((v) => (v.id === venueId ? { ...v, easeexplore360Url: finalVal } : v)) ?? null);
      setEditingVenue360Id(null);
    } catch (cause) {
      alert(messageOf(cause));
    } finally {
      setSaving360(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Eyebrow>Venue setup</Eyebrow>
            <h3 className="mt-1 font-brand text-2xl font-bold text-brand-deep">Upload a venue layout</h3>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Download the template, list each section and row with its seat numbers, then upload it. You only
              need to do this once per venue. Every event at that venue reuses the layout.
            </p>
          </div>
          <Button variant="outline" onClick={() => void downloadTemplate()}>
            <Download className="h-4 w-4" /> Download template
          </Button>
        </div>
        {templateError && <p role="alert" className="mt-3 text-sm text-danger">{templateError}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Venue name">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Area">
            <Input value={form.area} onChange={(e) => set("area", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address (optional)">
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Layout file (.xlsx or .csv)">
              <Input
                key={fileInputKey}
                type="file"
                accept=".xlsx,.csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
          </div>

          {/* EaseXplore 360° Option with Question Mark Tooltip */}
          <div className="sm:col-span-2 rounded-2xl border border-brand-purple/20 bg-brand-warm/30 p-4.5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-brand text-sm font-bold text-brand-deep flex items-center gap-1.5">
                <Rotate3d className="h-4 w-4 text-brand-orange" />
                Upload 360° view for EaseXplore option (optional)
              </span>

              {/* Question mark with hover tooltip */}
              <InfoTooltip
                title={
                  <span className="flex items-center gap-1.5">
                    <Rotate3d className="h-4 w-4 animate-spin text-brand-orange" /> What is EaseXplore?
                  </span>
                }
                tooltipClassName="w-80"
                content={
                  <>
                    <p className="text-[11px] text-white/90 leading-relaxed font-medium">
                      EaseXplore is EventEase&apos;s 360° immersive viewer. It allows ticket buyers and attendees to preview sightlines, elevations, and virtual tours of your venue before booking their seats.
                    </p>
                    <p className="mt-1.5 text-[10px] text-brand-orange/90 font-semibold">
                      💡 You can link to a 360° tour website (e.g., 360fyr, Matterport, virtual tour) or upload a 360° photo.
                    </p>
                  </>
                }
              />
            </div>

            <p className="text-xs text-muted mb-3.5">
              Either provide a link to your 360° virtual tour or upload a 360° panoramic image file.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-bold text-brand-deep mb-1 block">
                  360° Virtual Tour Link (URL)
                </label>
                <Input
                  placeholder="e.g. https://360fyr.com/tour/... or https://www.youtube.com/watch?v=..."
                  value={form.easeexplore360Url}
                  onChange={(e) => set("easeexplore360Url", e.target.value)}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-brand-deep mb-1 block">
                  Or Upload 360° Image File (.jpg, .png, .webp)
                </label>
                <Input
                  key={photoInputKey}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const pickedFile = e.target.files?.[0];
                    if (pickedFile) {
                      const reader = new FileReader();
                      reader.onload = () => {
                        set("easeexplore360Url", reader.result as string);
                      };
                      reader.readAsDataURL(pickedFile);
                    }
                  }}
                />
              </div>
            </div>
            {form.easeexplore360Url && (
              <p className="mt-2 text-xs font-semibold text-brand-purple flex items-center gap-1">
                ✓ 360° View configured for EaseXplore
              </p>
            )}
          </div>
        </div>

        {error && (
          <div role="alert" className="mt-5 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
            <p className="font-semibold">{error}</p>
            {lineErrors.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {lineErrors.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Button className="mt-6" disabled={!canUpload} onClick={() => void upload()}>
          <Upload className="h-4 w-4" /> {saving ? "Uploading…" : "Upload venue"}
        </Button>
      </Card>

      <div>
        <h3 className="mb-3 font-brand text-xl font-bold text-brand-deep">Your venues</h3>
        {loadError && <p role="alert" className="text-sm text-danger">{loadError}</p>}
        {!loadError && venues === null && <p className="text-sm text-muted">Loading venues…</p>}
        {venues?.length === 0 && (
          <Card className="p-8 text-center">
            <Building2 className="mx-auto h-10 w-10 text-muted" />
            <p className="mt-3 font-semibold">No venues yet</p>
            <p className="mt-1 text-sm text-muted">Upload your first venue layout above.</p>
          </Card>
        )}
        <div className="grid gap-5 lg:grid-cols-2">
          {venues?.map((venue) => {
            const isHighlighted = highlightedVenueId === venue.id;
            return (
              <Card
                key={venue.id}
                id={`venue-card-${venue.id}`}
                className={cx(
                  "p-5 flex flex-col justify-between transition-all duration-300 scroll-mt-24",
                  isHighlighted &&
                    "ring-3 ring-brand-orange ring-offset-2 shadow-2xl border-brand-orange/60 scale-[1.01]",
                )}
              >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-brand text-lg font-bold text-brand-deep">{venue.name}</h4>
                    <p className="mt-1 text-sm text-muted">
                      {[venue.area, venue.address].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Badge tone="accent">{venue.seatCount} seats</Badge>
                </div>

                {/* EaseXplore Video / 360 Tour Status & Editor */}
                <div className="mt-3 rounded-2xl border border-brand-line bg-brand-warm/30 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-brand-deep flex items-center gap-1.5">
                      <Video className="h-3.5 w-3.5 text-brand-orange" /> EaseXplore Video / 360° View:
                    </span>
                    {editingVenue360Id !== venue.id && (
                      <div className="flex items-center gap-1.5">
                        {venue.easeexplore360Url ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingVenue360Id(venue.id);
                                setVenue360Input(venue.easeexplore360Url ?? "");
                              }}
                              className="cursor-pointer rounded-lg px-2 py-1 text-brand-purple hover:bg-brand-purple/10 transition-colors flex items-center gap-1 text-[11px] font-bold"
                              title="Edit current link or details"
                              aria-label="Edit video link"
                            >
                              <Edit2 className="h-3 w-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingVenue360Id(venue.id);
                                setVenue360Input("");
                              }}
                              className="cursor-pointer rounded-lg px-2 py-1 text-brand-orange hover:bg-brand-orange/10 transition-colors flex items-center gap-1 text-[11px] font-bold"
                              title="Upload another video or attach new link"
                              aria-label="Upload another video or link"
                            >
                              <UploadCloud className="h-3 w-3" />
                              <span>Upload Another</span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingVenue360Id(venue.id);
                              setVenue360Input("");
                            }}
                            className="cursor-pointer rounded-lg px-2 py-1 text-brand-purple hover:bg-brand-purple/10 transition-colors flex items-center gap-1 text-[11px] font-bold"
                            title="Attach video or 360° view"
                            aria-label="Attach video or 360° view"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            <span>Attach</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {editingVenue360Id === venue.id ? (
                    <div className="mt-2.5 space-y-2.5 rounded-xl border border-brand-purple/20 bg-white p-3 shadow-xs">
                      <div className="text-[11px] font-bold text-brand-deep">
                        {venue.easeexplore360Url
                          ? (venue360Input ? `Edit Video / 360° View for ${venue.name}` : `Upload Another Video / 360° View for ${venue.name}`)
                          : `Attach Video or 360° View to ${venue.name}`}
                      </div>

                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] font-bold text-muted block mb-1">
                            1. Paste Video or 360° Tour Link (YouTube, Vimeo, 360fyr, MP4 URL)
                          </label>
                          <Input
                            placeholder="e.g. https://www.youtube.com/watch?v=... or https://360fyr.com/tour/..."
                            value={venue360Input}
                            onChange={(e) => setVenue360Input(e.target.value)}
                            className="text-xs"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-muted block mb-1">
                            2. Or Upload a Video File (.mp4, .webm, .mov) or 360 Image
                          </label>
                          <Input
                            type="file"
                            accept="video/*,image/*"
                            onChange={(e) => {
                              const picked = e.target.files?.[0];
                              if (picked) {
                                const reader = new FileReader();
                                reader.onload = () => {
                                  setVenue360Input(reader.result as string);
                                };
                                reader.readAsDataURL(picked);
                              }
                            }}
                            className="text-xs"
                          />
                        </div>
                      </div>

                      {/* Preview if attached */}
                      {venue360Input && (() => {
                        const media = formatMediaEmbedUrl(venue360Input);
                        return (
                          <div className="rounded-lg border border-brand-line bg-brand-warm/20 p-2 text-xs">
                            <span className="font-semibold text-brand-purple flex items-center gap-1 mb-1">
                              ✓ Media preview ready
                            </span>
                            {venue360Input.startsWith("data:video") || media.isDirectVideo ? (
                              <video src={media.embedUrl} controls className="h-28 w-full rounded object-cover" />
                            ) : venue360Input.startsWith("data:image") ? (
                              <img src={venue360Input} alt="Preview" className="h-28 w-full rounded object-cover" />
                            ) : media.isYoutube || media.isVimeo ? (
                              <iframe
                                src={media.embedUrl}
                                title="Video Preview"
                                className="h-32 w-full rounded border-0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              />
                            ) : (
                              <p className="truncate text-[11px] text-muted font-mono">{venue360Input}</p>
                            )}
                          </div>
                        );
                      })()}

                      <div className="flex items-center justify-between pt-1 border-t border-brand-line/60">
                        {venue.easeexplore360Url ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Remove attached video/tour from ${venue.name}?`)) {
                                void saveVenue360(venue.id, "");
                              }
                            }}
                            className="cursor-pointer text-[11px] font-bold text-red-500 hover:underline flex items-center gap-1"
                          >
                            <Trash2 className="h-3 w-3" /> Remove Video
                          </button>
                        ) : <span />}

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingVenue360Id(null)}
                            className="cursor-pointer text-xs font-semibold text-muted hover:text-brand-deep px-2 py-1"
                          >
                            Cancel
                          </button>
                          <Button
                            size="sm"
                            disabled={saving360}
                            onClick={() => void saveVenue360(venue.id, venue360Input)}
                          >
                            <Check className="h-3.5 w-3.5" /> Save Video
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : venue.easeexplore360Url ? (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-purple/10 px-2 py-0.5 text-[10px] font-extrabold text-brand-purple">
                          <Film className="h-3 w-3" /> Video / 360 Active
                        </span>
                        {!venue.easeexplore360Url.startsWith("data:") ? (
                          <a
                            href={venue.easeexplore360Url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-xs font-semibold text-brand-purple hover:underline flex items-center gap-1 max-w-[220px]"
                            title={venue.easeexplore360Url}
                          >
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            <span className="truncate">{venue.easeexplore360Url}</span>
                          </a>
                        ) : (
                          <span className="text-xs text-muted font-medium">Media file attached</span>
                        )}
                      </div>
                      <Badge tone="accent" className="shrink-0 text-[10px]">EaseXplore Active</Badge>
                    </div>
                  ) : (
                    <div className="mt-1">
                      <p className="text-[11px] text-muted italic">
                        No video or 360° view attached yet.
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-2">
                  {venue.sections.map((section) => (
                    <div
                      key={section.id}
                      className="flex items-center justify-between rounded-xl bg-mist/60 px-3 py-2.5 text-sm"
                    >
                      <span className="font-medium">{section.name}</span>
                      <span className="text-muted">
                        {section.rows.length} {section.rows.length === 1 ? "row" : "rows"}
                        {section.rows.length > 0 &&
                          ` (${section.rows[0]}${section.rows.length > 1 ? `–${section.rows[section.rows.length - 1]}` : ""})`}
                        {" · "}
                        {section.seatCount} seats
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Inline Venue & Seat Layout Editor */}
              {editingVenueId === venue.id && (
                <div className="mt-4 rounded-xl border border-brand-purple/30 bg-brand-lilac/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="font-brand text-sm font-bold text-brand-deep flex items-center gap-1.5">
                      <Edit2 className="h-4 w-4 text-brand-purple" /> Edit Venue & Seat Layout
                    </h5>
                    <span className="text-[11px] text-muted">Upload a new file to replace seat map</span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Venue name">
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        className="text-xs"
                      />
                    </Field>
                    <Field label="Area">
                      <Input
                        value={editForm.area}
                        onChange={(e) => setEditForm((f) => ({ ...f, area: e.target.value }))}
                        className="text-xs"
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Address (optional)">
                        <Input
                          value={editForm.address}
                          onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                          className="text-xs"
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="Replace Seat Layout file (.xlsx or .csv)">
                        <p className="mb-1 text-[11px] text-muted">
                          Leave blank to keep current seat layout, or pick a spreadsheet to replace sections and seats.
                        </p>
                        <Input
                          key={editFileInputKey}
                          type="file"
                          accept=".xlsx,.csv"
                          onChange={(e) => setEditFile(e.target.files?.[0] ?? null)}
                          className="text-xs"
                        />
                      </Field>
                    </div>
                  </div>

                  {editError && <p role="alert" className="text-xs font-semibold text-danger">{editError}</p>}
                  {editLineErrors.length > 0 && (
                    <ul className="max-h-24 overflow-y-auto space-y-1 text-xs text-danger font-mono bg-rose-50 p-2 rounded">
                      {editLineErrors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                    <Button size="sm" variant="outline" disabled={savingEdit} onClick={cancelEditingVenue}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={savingEdit || !editForm.name.trim() || !editForm.area.trim()}
                      onClick={() => void saveVenueEdit(venue.id)}
                    >
                      <Check className="h-3.5 w-3.5" /> {savingEdit ? "Saving…" : "Save layout changes"}
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <span className="text-xs text-muted">{venue.sections.length} sections</span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => (editingVenueId === venue.id ? cancelEditingVenue() : startEditingVenue(venue))}
                  >
                    <Edit2 className="h-4 w-4" /> {editingVenueId === venue.id ? "Cancel edit" : "Edit / Replace layout"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPreviewVenueId(previewVenueId === venue.id ? null : venue.id)}
                  >
                    <Armchair className="h-4 w-4" />
                    {previewVenueId === venue.id ? "Hide layout" : "View seat map"}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
        </div>

        {previewVenueId && (
          <div className="mt-8 border-t border-line pt-8">
            <VenueSeatMap initialVenueId={previewVenueId} />
          </div>
        )}
      </div>
    </div>
  );
}

export default VenueSetup;
