import { useEffect, useState } from "react";
import { Accessibility, Type } from "lucide-react";
import { cx } from "../ui";

export function AccessibilityBar() {
  const [big, setBig] = useState(false);

  useEffect(() => {
    document.documentElement.style.fontSize = big ? "18px" : "16px";
  }, [big]);

  return (
    <div className="flex items-center gap-1 rounded-full border border-brand-purple/15 bg-brand-lilac/40 p-1">
      <Accessibility
        className="ml-1.5 mr-0.5 h-4 w-4 text-brand-purple"
        aria-hidden
      />
      <button
        onClick={() => setBig((v) => !v)}
        aria-pressed={big}
        title="Toggle larger text"
        className={cx(
          "flex h-8 w-8 items-center justify-center rounded-full transition cursor-pointer",
          big
            ? "bg-brand-orange text-white"
            : "text-brand-deep/75 hover:bg-white hover:text-brand-deep",
        )}
      >
        <Type className="h-4 w-4" />
      </button>
    </div>
  );
}

export default AccessibilityBar;
