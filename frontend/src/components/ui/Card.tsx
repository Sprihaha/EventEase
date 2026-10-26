import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({
  children,
  className,
  ...props
}: CardProps) {
  return (
    <div
      {...props}
      className={cx(
        "rounded-3xl border border-brand-purple/10 bg-white shadow-[0_4px_24px_-8px_rgba(50,19,79,0.06)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export default Card;
