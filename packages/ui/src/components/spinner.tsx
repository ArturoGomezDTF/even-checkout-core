import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

const sizes = {
  sm: "size-4",
  md: "size-5 md:size-6",
  lg: "size-8 md:size-10 lg:size-12",
} as const;

export type SpinnerProps = Omit<ComponentProps<"svg">, "children"> & {
  size?: keyof typeof sizes;
  /** Texto para lectores de pantalla (las apps lo pasan traducido). `null` lo vuelve decorativo. */
  label?: string | null;
};

export function Spinner({ size = "md", label = "Cargando", className, ...props }: SpinnerProps) {
  return (
    <svg
      role={label === null ? undefined : "status"}
      aria-label={label ?? undefined}
      aria-hidden={label === null || undefined}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("animate-spin", sizes[size], className)}
      {...props}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
