import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

const variants = {
  /** Círculo blanco con borde: cerrar, volver, +/- de cantidad. */
  default: "border border-gray-300 bg-white text-even-evergreen hover:bg-gray-200",
  primary: "bg-even-grass text-even-evergreen hover:opacity-90",
  ghost: "bg-transparent text-current hover:bg-black/5",
} as const;

const sizes = {
  sm: "size-8",
  md: "size-10 md:size-12 lg:size-14",
} as const;

export type IconButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  /** Obligatorio: el botón solo tiene un icono. */
  "aria-label": string;
};

export function IconButton({ variant = "default", size = "md", type = "button", className, ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform duration-200 active:scale-95",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-even-evergreen",
        "disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
