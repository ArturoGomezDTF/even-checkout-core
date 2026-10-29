import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

const tones = {
  /** Fondo Offwhite con texto Evergreen (por defecto). */
  light: "bg-background text-foreground",
  /** Fondo Evergreen de marca: login, errores, estados de pago. */
  brand: "bg-even-evergreen text-white",
} as const;

export type ScreenProps = ComponentProps<"div"> & {
  tone?: keyof typeof tones;
};

/** Contenedor de pantalla completa que respeta la barra de Safari iOS. */
export function Screen({ tone = "light", className, ...props }: ScreenProps) {
  return <div className={cn("relative flex min-h-screen-safe flex-col", tones[tone], className)} {...props} />;
}

const widths = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
} as const;

export type ContainerProps = ComponentProps<"div"> & {
  width?: keyof typeof widths;
};

/** Columna centrada con el padding lateral estándar de las apps. */
export function Container({ width = "sm", className, ...props }: ContainerProps) {
  return <div className={cn("mx-auto w-full px-5 md:px-8 lg:px-10", widths[width], className)} {...props} />;
}

export type StackProps = ComponentProps<"div"> & {
  gap?: "sm" | "md" | "lg";
};

const gaps = {
  sm: "gap-2",
  md: "gap-3 md:gap-4 lg:gap-5",
  lg: "gap-6 md:gap-8 lg:gap-10",
} as const;

/** Columna con separación vertical uniforme. */
export function Stack({ gap = "md", className, ...props }: StackProps) {
  return <div className={cn("flex flex-col", gaps[gap], className)} {...props} />;
}
