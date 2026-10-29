import { cn } from "../lib/cn";
import { EvenAsterisk } from "./even-asterisk";

export type FullScreenLoaderProps = {
  /** Texto para lectores de pantalla. Las apps lo pasan traducido. */
  label?: string;
  className?: string;
};

/** Pantalla de carga de marca: asterisco Grass girando sobre Evergreen. */
export function FullScreenLoader({ label = "Cargando", className }: FullScreenLoaderProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn("fixed inset-0 z-50 flex items-center justify-center bg-even-evergreen", className)}
    >
      <EvenAsterisk className="size-20 animate-asterisk-spin md:size-24" />
    </div>
  );
}
