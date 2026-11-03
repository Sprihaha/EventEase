import { request } from "./backendApi";

/** One Ease feature on the EaseHelp page. `package` is the work package (A–E) it belongs to. */
export type HelpFeature = { key: string; name: string; package: string; tagline: string; description: string };
export type HelpPage = { features: HelpFeature[]; terms: string; updatedAt?: string | null };

export const HELP_LIMITS = { features: 30, name: 60, package: 40, tagline: 160, description: 2000, terms: 20000 };

export function fetchHelpPage() {
  return request<HelpPage>("/help");
}

/** Administrators only: replaces the whole page. */
export function saveHelpPage(page: Omit<HelpPage, "updatedAt">) {
  return request<HelpPage>("/admin/help", { method: "PUT", body: JSON.stringify(page) }, true);
}

/** A page-address-safe key from a feature name: "Tickets & checkout" -> "tickets-checkout". */
export function keyFromName(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "feature";
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
  return key;
}
