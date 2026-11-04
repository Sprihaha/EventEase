import { useId, useRef, useState } from "react";
import { ImagePlus, Link2, X } from "lucide-react";
import EventImage from "../common/EventImage";
import { Button, Input } from "../ui";
import { MAX_POSTER_BYTES, POSTER_TYPES, uploadEventImage } from "../../lib/eventImageApi";

const UPLOADED = "/api/v1/media/event-images/";

/**
 * Event poster: upload a PNG or JPG from the computer, or paste a link to an image online.
 * Either way the result is one image address, saved with the event.
 */
export default function PosterField({ value, onChange, disabled }: {
  value: string; onChange: (url: string) => void; disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const urlId = useId();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const uploaded = value.startsWith(UPLOADED);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (!POSTER_TYPES.includes(file.type)) return setError("Choose a PNG or JPG image.");
    if (file.size > MAX_POSTER_BYTES) return setError("The image must be 5 MB or smaller.");
    setUploading(true);
    try {
      onChange((await uploadEventImage(file)).url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The image could not be uploaded.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = ""; // allow choosing the same file again
    }
  };

  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-brand-deep">Poster image (optional)</span>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="h-28 w-44 shrink-0 overflow-hidden rounded-xl border border-brand-purple/15 bg-brand-lilac/30">
          <EventImage src={value || null} alt="Poster preview" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="sr-only" tabIndex={-1}
              aria-hidden="true" onChange={(e) => void pick(e.target.files?.[0])} />
            <Button type="button" size="sm" variant="outline" disabled={disabled || uploading}
              onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-4 w-4" /> {uploading ? "Uploading…" : uploaded ? "Replace picture" : "Upload picture"}
            </Button>
            <span className="text-xs text-muted">PNG or JPG, up to 5 MB</span>
            {value && (
              <button type="button" disabled={disabled || uploading} onClick={() => onChange("")}
                className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-danger">
                <X className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
          <div>
            <label htmlFor={urlId} className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Link2 className="h-3.5 w-3.5" /> Or paste an image URL
            </label>
            <Input id={urlId} type="url" placeholder="https://…" disabled={disabled || uploading}
              value={uploaded ? "" : value} onChange={(e) => onChange(e.target.value)} />
            {uploaded && <p className="mt-1 text-xs text-muted">Using your uploaded picture.</p>}
          </div>
          {error && <p role="alert" className="text-xs font-semibold text-danger">{error}</p>}
        </div>
      </div>
    </div>
  );
}
