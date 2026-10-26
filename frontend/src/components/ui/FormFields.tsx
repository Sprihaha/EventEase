import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from "react";
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
