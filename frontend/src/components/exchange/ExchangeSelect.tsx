import { ChevronDown } from "lucide-react";
import { Select } from "../ui";

export function ExchangeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <Select
        {...props}
        className={`cursor-pointer hover:border-brand-purple disabled:cursor-not-allowed ${props.className ?? ""}`}
      />
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-brand-purple" />
    </span>
  );
}

export default ExchangeSelect;
