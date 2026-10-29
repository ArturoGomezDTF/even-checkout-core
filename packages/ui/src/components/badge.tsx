import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

const variants = {
  grass: "bg-even-grass text-even-evergreen",
  soft: "bg-even-grass/20 text-even-evergreen",
  aqua: "bg-even-aqua text-even-evergreen",
  evergreen: "bg-even-evergreen text-white",
  neutral: "border border-stroke-soft/50 bg-surface text-muted",
} as const;

const sizes = {
  sm: "px-2 py-0.5 text-[10px] tracking-widest uppercase md:text-xs",
  md: "px-3 py-1 text-xs md:text-sm",
} as const;

export type BadgeProps = ComponentProps<"span"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function Badge({ variant = "grass", size = "md", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full font-medium", variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
