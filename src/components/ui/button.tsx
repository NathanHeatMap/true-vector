"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Button — shadcn-style, True Vector colour tokens.
 *
 * Variants:
 *   - primary: filled near-black (default for primary actions per wireframes)
 *   - accent:  filled deep-blue (for agent-driven "Run …" actions)
 *   - outline: bordered, white background (secondary actions)
 *   - ghost:   no border, hover surface (tertiary)
 *   - danger:  red border (destructive actions like dismiss/pause)
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-tv-accent)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--color-tv-text)] text-white hover:bg-[var(--color-tv-text-2)]",
        accent:
          "bg-[var(--color-tv-accent)] text-white hover:opacity-90",
        outline:
          "bg-white text-[var(--color-tv-text)] border border-[var(--color-tv-border)] hover:bg-[var(--color-tv-surface-2)]",
        ghost:
          "text-[var(--color-tv-text)] hover:bg-[var(--color-tv-surface-2)]",
        danger:
          "bg-white text-[var(--color-tv-danger)] border border-[var(--color-tv-danger)] hover:bg-[var(--color-tv-danger-soft)]",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-10 px-4",
        lg: "h-11 px-5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
