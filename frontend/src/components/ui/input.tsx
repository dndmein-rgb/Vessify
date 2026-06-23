"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted",
          "focus:border-accent-light focus:outline-none focus:ring-1 focus:ring-accent-light/40",
          "transition-colors duration-150",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
