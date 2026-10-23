import { useEffect, useState } from "react";
import { Building2, Download, Upload, Armchair } from "lucide-react";
import {
  ApiError,
  backendDownloadVenueTemplate,
  backendImportVenue,
  backendListVenues,
  type Venue,
} from "../lib/backendApi";
import { Badge, Button, Card, Eyebrow, Field, Input } from "./ui";
import VenueSeatMap from "./VenueSeatMap";

const emptyForm = { name: "", area: "", address: "" };

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : "Something went wrong. Please try again.";
}

export default function VenueSetup() {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [previewVenueId, setPreviewVenueId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lineErrors, setLineErrors] = useState<string[]>([]);
  const [templateError, setTemplateError] = useState("");

  useEffect(() => {
    backendListVenues()
      .then(setVenues)
      .catch((cause) => setLoadError(messageOf(cause)));
  }, []);

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
      });
      setVenues((current) => [venue, ...(current ?? []).filter((v) => v.id !== venue.id)]);
      setForm(emptyForm);
      setFile(null);
      setFileInputKey((k) => k + 1);
    } catch (cause) {
      setError(messageOf(cause));
      const details = cause instanceof ApiError ? cause.details.errors : undefined;
      if (Array.isArray(details)) setLineErrors(details.map(String));
    } finally {
      setSaving(false);
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
          {venues?.map((venue) => (
            <Card key={venue.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-brand text-lg font-bold text-brand-deep">{venue.name}</h4>
                  <p className="mt-1 text-sm text-muted">
                    {[venue.area, venue.address].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Badge tone="accent">{venue.seatCount} seats</Badge>
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
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <span className="text-xs text-muted">{venue.sections.length} sections</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPreviewVenueId(previewVenueId === venue.id ? null : venue.id)}
                >
                  <Armchair className="h-4 w-4" />
                  {previewVenueId === venue.id ? "Hide layout" : "View seat map"}
                </Button>
              </div>
            </Card>
          ))}
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