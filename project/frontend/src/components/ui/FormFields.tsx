import { forwardRef, useState, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cx } from "./cx";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-brand-deep">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-brand-purple/20 bg-white px-3.5 h-11 text-sm text-brand-text outline-none transition focus:border-brand-purple focus:ring-4 focus:ring-brand-purple/15 placeholder:text-muted/65";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}

/**
 * A password input with our own show/hide eye button, which stays visible at all times.
 * The browser's built-in reveal icon (Edge) is hidden in index.css because it disappears after the field loses focus.
 */
export function PasswordInput({
  shown: shownProp,
  onToggleShown,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { shown?: boolean; onToggleShown?: () => void }) {
  const [shownState, setShownState] = useState(false);
  const shown = shownProp ?? shownState;
  const toggle = onToggleShown ?? (() => setShownState((s) => !s));
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} className={cx(inputCls, "pr-14", props.className)} />
      <button
        type="button"
        aria-label={shown ? "Hide password" : "Show password"}
        title={shown ? "Hide password" : "Show password"}
        onClick={toggle}
        disabled={props.disabled}
        className="absolute right-1.5 top-1/2 flex h-9 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-brand-purple transition hover:bg-brand-purple/10 hover:text-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {shown ? <EyeOff className="h-6 w-6" /> : <Eye className="h-6 w-6" />}
      </button>
    </div>
  );
}

export { Select, type CustomSelectProps } from "./CustomSelect";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  (props, ref) => {
    return (
      <textarea
        ref={ref}
        {...props}
        className={cx(inputCls, "h-auto py-2.5 leading-relaxed", props.className)}
      />
    );
  }
);
Textarea.displayName = "Textarea";
