import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

const variants = {
  /** Tarjeta blanca: items de menú, tarjetas guardadas, historial. */
  default: "rounded-2xl border border-stroke-soft/50 bg-white shadow-sm",
  /** Recuadro gris claro para destacar un dato dentro de un modal o formulario. */
  surface: "rounded-lg border border-stroke-soft/50 bg-surface md:rounded-xl",
  /** Bloque oscuro de marca. */
  brand: "rounded-2xl bg-even-evergreen text-white",
} as const;

const paddings = {
  none: "",
  sm: "p-2 md:p-3 lg:p-4",
  md: "p-4 md:p-5 lg:p-6",
} as const;

export type CardProps = ComponentProps<"div"> & {
  variant?: keyof typeof variants;
  padding?: keyof typeof paddings;
};

export function Card({ variant = "default", padding = "md", className, ...props }: CardProps) {
  return <div className={cn(variants[variant], paddings[padding], className)} {...props} />;
}
