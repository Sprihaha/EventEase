import { useEffect } from "react";
import { useWebSearchable } from "../../lib/seoSettings";

export interface SEOProps {
  title?: string;
  description?: string;
  canonicalPath?: string;
  image?: string;
  type?: "website" | "article" | "event";
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
}

const SITE_URL = "https://eventease-frontend.onrender.com";
const DEFAULT_TITLE = "EventEase - Accessible Events, Discovery & Community Ticketing";
const DEFAULT_DESC =
  "Discover, book, and experience accessible events with EventEase. Inclusive ticketing, seat companion requests, and community ticket exchange.";
const DEFAULT_IMAGE = `${SITE_URL}/EventEase_logo.png`;

export default function SEO({
  title,
  description = DEFAULT_DESC,
  canonicalPath,
  image = DEFAULT_IMAGE,
  type = "website",
  structuredData,
}: SEOProps) {
  const [searchable] = useWebSearchable();

  useEffect(() => {
    // 1. Update Document Title
    const fullTitle = title ? `${title} | EventEase` : DEFAULT_TITLE;
    document.title = fullTitle;

    // Helper to update or create meta tags
    const setMeta = (attrName: "name" | "property", attrVal: string, content: string) => {
      let el = document.querySelector(`meta[${attrName}="${attrVal}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attrName, attrVal);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    // 2. Robots Meta Directive (Controls searchability)
    setMeta("name", "robots", searchable ? "index, follow" : "noindex, nofollow");

    // 3. Primary Meta Tags
    setMeta("name", "description", description);

    // 4. Open Graph Tags
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description);
    setMeta("property", "og:type", type);
    const absoluteImg = image.startsWith("http")
      ? image
      : `${SITE_URL}${image.startsWith("/") ? "" : "/"}${image}`;
    setMeta("property", "og:image", absoluteImg);

    const canonicalUrl = canonicalPath
      ? `${SITE_URL}${canonicalPath.startsWith("/") ? "" : "/"}${canonicalPath}`
      : window.location.href;
    setMeta("property", "og:url", canonicalUrl);

    // 5. Twitter Card Tags
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", absoluteImg);

    // 6. Canonical Link
    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute("href", canonicalUrl);

    // 7. Schema.org JSON-LD Structured Data (active only when searchable)
    const scriptId = "eventease-structured-data";
    let scriptEl = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (structuredData && searchable) {
      if (!scriptEl) {
        scriptEl = document.createElement("script");
        scriptEl.id = scriptId;
        scriptEl.type = "application/ld+json";
        document.head.appendChild(scriptEl);
      }
      scriptEl.textContent = JSON.stringify(structuredData);
    } else if (scriptEl) {
      scriptEl.remove();
    }

    return () => {
      const s = document.getElementById(scriptId);
      if (s) s.remove();
    };
  }, [title, description, canonicalPath, image, type, structuredData, searchable]);

  return null;
}
