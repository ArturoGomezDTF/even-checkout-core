import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Une clases condicionales y resuelve conflictos de Tailwind, para que el className de la app gane.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
