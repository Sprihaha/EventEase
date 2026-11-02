import { useState, type ImgHTMLAttributes } from "react";

export const EVENT_IMAGE_FALLBACK = "/event-placeholder.svg";

const LOCAL_HOSTS = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\])$/i;

/**
 * The image to show for an event: its own URL, or the placeholder when the URL is missing or
 * points at someone's local machine (e.g. http://localhost:8443/...), which only works there.
 */
export function eventImageSrc(src: string | null | undefined): string {
  if (!src) return EVENT_IMAGE_FALLBACK;
  try {
    const url = new URL(src, window.location.origin);
    if (LOCAL_HOSTS.test(url.hostname) && !LOCAL_HOSTS.test(window.location.hostname)) return EVENT_IMAGE_FALLBACK;
  } catch {
    return EVENT_IMAGE_FALLBACK;
  }
  return src;
}

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & { src: string | null | undefined };

/** An event poster that falls back to the placeholder if the image is missing or fails to load. */
export default function EventImage({ src, alt, ...rest }: Props) {
  const wanted = eventImageSrc(src);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <img
      {...rest}
      src={failed === wanted ? EVENT_IMAGE_FALLBACK : wanted}
      alt={alt}
      onError={() => {
        if (wanted !== EVENT_IMAGE_FALLBACK) setFailed(wanted);
      }}
    />
  );
}
