import { Building2 } from "lucide-react";
import { getCurrentOrganisation } from "../../lib/organisation";

// Header badge for organisers: shows the company name for this session.
// No switch dropdown option is shown; organisers sign out to switch accounts/companies.
export function OrganisationSwitcher() {
  const organisation = getCurrentOrganisation();
  if (!organisation?.name) return null;

  return (
    <div
      aria-label={`Organisation: ${organisation.name}`}
      className="flex max-w-[14rem] items-center gap-2 rounded-full border border-brand-orange/30 bg-brand-orange/5 px-3.5 py-1.5 text-sm font-semibold text-brand-deep select-none shadow-sm"
    >
      <Building2 className="h-4 w-4 shrink-0 text-brand-orange" />
      <span className="truncate">{organisation.name}</span>
    </div>
  );
}
