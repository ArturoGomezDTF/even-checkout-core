import type { ComponentProps } from "react";
import { cn } from "../lib/cn";
import { Spinner } from "./spinner";

const variants = {
  /** CTA principal: verde Grass sobre texto Evergreen. */
  primary: "bg-even-grass text-even-evergreen hover:opacity-90",
  /** Acción fuerte sobre fondos claros. */
  secondary: "bg-even-evergreen text-white hover:opacity-90",
  outline: "border border-even-evergreen bg-transparent text-even-evergreen hover:bg-even-evergreen/5",
  ghost: "bg-transparent text-even-evergreen hover:bg-black/5",
  /** Botón blanco para pantallas con fondo Evergreen. */
  light: "bg-white text-black hover:bg-gray-50",
} as const;

const sizes = {
  sm: "px-4 py-2 text-sm",
  md: "px-6 py-3 text-base",
  lg: "px-6 py-3 text-base md:py-4 md:text-lg lg:py-5 lg:text-xl",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Muestra un spinner y desactiva el botón mientras corre la acción. */
  loading?: boolean;
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: Pick<ButtonProps, "variant" | "size" | "fullWidth" | "className"> = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all active:scale-95",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-even-evergreen",
    "disabled:pointer-events-none disabled:opacity-40",
    variants[variant],
    sizes[size],
    fullWidth && "w-full",
    className,
  );
}

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  disabled,
  type = "button",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...props}
    >
      {loading && <Spinner size="sm" label={null} />}
      {children}
    </button>
  );
}
