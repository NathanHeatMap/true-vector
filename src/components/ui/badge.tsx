import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge / pill — used for state labels, urgency, status.
 *
 * IMPORTANT: per UX safeguards §6 — never convey meaning by colour alone.
 * Every coloured badge also carries a text label.
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
  {
    variants: {
      tone: {
        accent: "bg-[var(--color-tv-accent)] text-white",
        accentSoft:
          "bg-[var(--color-tv-accent-soft)] text-[var(--color-tv-accent)] border border-[var(--color-tv-accent)]",
        success:
          "bg-[var(--color-tv-success-soft)] text-[var(--color-tv-success)] border border-[var(--color-tv-success)]",
        warn:
          "bg-[var(--color-tv-warn-soft)] text-[var(--color-tv-warn)] border border-[var(--color-tv-warn)]",
        danger:
          "bg-[var(--color-tv-danger-soft)] text-[var(--color-tv-danger)] border border-[var(--color-tv-danger)]",
        neutral:
          "bg-white text-[var(--color-tv-text-2)] border border-[var(--color-tv-border)]",
        dark: "bg-[var(--color-tv-text)] text-white",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
