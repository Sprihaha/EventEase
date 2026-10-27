import { useEffect, useState } from "react";

const STORAGE_KEY = "eventease_web_searchable";
const EVENT_NAME = "eventease:web-searchable-changed";

export function getWebSearchable(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === null) return true;
  return stored === "true";
}

export function setWebSearchable(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");

  // Immediately apply to document meta
  applyRobotsMeta(enabled);

  // Notify all components in the current window
  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, { detail: { webSearchable: enabled } })
  );
}

export function applyRobotsMeta(enabled: boolean): void {
  if (typeof document === "undefined") return;
  let robotsMeta = document.querySelector('meta[name="robots"]');
  if (!robotsMeta) {
    robotsMeta = document.createElement("meta");
    robotsMeta.setAttribute("name", "robots");
    document.head.appendChild(robotsMeta);
  }
  robotsMeta.setAttribute(
    "content",
    enabled ? "index, follow" : "noindex, nofollow"
  );
}

export function useWebSearchable(): [boolean, (val: boolean) => void] {
  const [searchable, setSearchableState] = useState<boolean>(getWebSearchable);

  useEffect(() => {
    // Initial sync
    applyRobotsMeta(searchable);

    const handleCustomEvent = (e: Event) => {
      const custom = e as CustomEvent<{ webSearchable: boolean }>;
      if (custom.detail && typeof custom.detail.webSearchable === "boolean") {
        setSearchableState(custom.detail.webSearchable);
      } else {
        setSearchableState(getWebSearchable());
      }
    };

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setSearchableState(getWebSearchable());
      }
    };

    window.addEventListener(EVENT_NAME, handleCustomEvent);
    window.addEventListener("storage", handleStorageEvent);

    return () => {
      window.removeEventListener(EVENT_NAME, handleCustomEvent);
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [searchable]);

  const updateSearchable = (val: boolean) => {
    setWebSearchable(val);
    setSearchableState(val);
  };

  return [searchable, updateSearchable];
}
