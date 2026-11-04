import { useId, useRef, useState } from "react";
import { ImagePlus, Link2, X } from "lucide-react";
import EventImage from "../common/EventImage";
import { Button, Input } from "../ui";
import { MAX_POSTER_BYTES, POSTER_TYPES, uploadEventImage } from "../../lib/eventImageApi";

const UPLOADED = "/api/v1/media/event-images/";

// Posters appear as 16:11 cards, a wide banner on the event page and small squares, so a 16:9
// landscape picture with the subject in the centre crops well everywhere.
export const POSTER_RECOMMENDED = { width: 1600, height: 900 };
export const POSTER_MINIMUM = { width: 1200, height: 675 };

/** Pixel size of a picture the organiser chose, read in the browser before uploading. */
function pixelSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

/** Advice about a picture's size; null when it fits the recommendation. */
function sizeAdvice(size: { width: number; height: number }): string | null {
  const { width, height } = size;
  if (width < POSTER_MINIMUM.width || height < POSTER_MINIMUM.height)
    return `This picture is ${width} × ${height} px, smaller than ${POSTER_MINIMUM.width} × ${POSTER_MINIMUM.height} px, so it may look blurry. Use ${POSTER_RECOMMENDED.width} × ${POSTER_RECOMMENDED.height} px if you can.`;
  const ratio = width / height;
  if (ratio < 1.4 || ratio > 2.1)
    return `This picture is ${width} × ${height} px. It is not landscape 16:9, so the top and bottom or the sides will be cropped. Keep the main subject in the centre.`;
  return null;
}

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
  const [advice, setAdvice] = useState<{ text: string; ok: boolean } | null>(null);
  const uploaded = value.startsWith(UPLOADED);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setAdvice(null);
    if (!POSTER_TYPES.includes(file.type)) return setError("Choose a PNG or JPG image.");
    if (file.size > MAX_POSTER_BYTES) return setError("The image must be 5 MB or smaller.");
    const size = await pixelSize(file);
    setUploading(true);
    try {
      onChange((await uploadEventImage(file)).url);
      if (size) {
        const warning = sizeAdvice(size);
        setAdvice(warning ? { text: warning, ok: false } : { text: `Uploaded: ${size.width} × ${size.height} px. Good size.`, ok: true });
      }
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
        {/* 16:9, the recommended shape, so the preview shows roughly how the poster is framed. */}
        <div className="aspect-video w-48 shrink-0 overflow-hidden rounded-xl border border-brand-purple/15 bg-brand-lilac/30">
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
              <button type="button" disabled={disabled || uploading} onClick={() => { onChange(""); setAdvice(null); }}
                className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-danger">
                <X className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
          <p className="rounded-lg bg-brand-lilac/40 px-3 py-2 text-xs text-brand-deep">
            <span className="font-semibold">Recommended size: {POSTER_RECOMMENDED.width} × {POSTER_RECOMMENDED.height} px</span>{" "}
            (landscape 16:9). At least {POSTER_MINIMUM.width} × {POSTER_MINIMUM.height} px. Keep the main subject and any
            text in the centre, as the edges are cropped on event cards and the event page banner.
          </p>
          {advice && (
            <p role="status" className={advice.ok ? "text-xs font-semibold text-emerald-700" : "text-xs font-semibold text-brand-orange"}>
              {advice.text}
            </p>
          )}
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
