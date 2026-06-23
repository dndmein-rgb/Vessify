"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors duration-150",
          "disabled:cursor-not-allowed disabled:opacity-50",
          variant === "primary" &&
            "bg-accent text-white hover:bg-accent-light/90 active:bg-accent-muted",
          variant === "secondary" &&
            "bg-surface border border-border text-text-primary hover:bg-surfaceHover",
          variant === "ghost" && "text-text-secondary hover:text-text-primary hover:bg-surfaceHover",
          className,
        )}
        {...props}
      >
        {loading && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
