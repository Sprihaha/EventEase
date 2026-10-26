import type { ReactNode } from "react";

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-bold uppercase tracking-[0.2em] text-brand-orange">
      {children}
    </div>
  );
}

export default Eyebrow;
