"use client";

import { useEffect, useRef } from "react";

/**
 * Hace que el back del dispositivo cierre modales/steps apilados en vez
 * de salir de la página. Las capas abiertas se apilan (LIFO) en un stack
 * global compartido con un único listener de `popstate`, así el back
 * solo afecta a la más interna, sin cascada hacia las de abajo.
 */

type StackEntry = {
  id: number;
  onBack: (rearm: () => void) => void;
};

let stack: StackEntry[] = [];
let nextId = 0;
let ignoreNextPopstate = 0;
let listenerAttached = false;

function ensureListener() {
  if (listenerAttached || typeof window === "undefined") return;
  listenerAttached = true;
  window.addEventListener("popstate", () => {
    if (ignoreNextPopstate > 0) {
      ignoreNextPopstate -= 1;
      return;
    }
    const entry = stack[stack.length - 1];
    if (!entry) return;
    stack = stack.slice(0, -1);
    const rearm = () => {
      stack = [...stack, entry];
      window.history.pushState({ evenModalGuard: entry.id }, "");
    };
    entry.onBack(rearm);
  });
}

/**
 * onBack se llama cuando el back le toca a esta capa. Por defecto
 * debe cerrarla; si en cambio llama a `rearm()`, absorbe el back sin
 * cerrarse (ej. retroceder un step interno).
 */
export function useModalBackClose(
  isOpen: boolean,
  onBack: (rearm: () => void) => void,
) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!isOpen) return;
    ensureListener();

    const id = nextId++;
    const entry: StackEntry = {
      id,
      onBack: (rearm) => onBackRef.current(rearm),
    };
    stack = [...stack, entry];
    window.history.pushState({ evenModalGuard: id }, "");

    return () => {
      const isTop = stack.length > 0 && stack[stack.length - 1].id === id;
      stack = stack.filter((e) => e.id !== id);
      // Cerrado por otra vía (X/backdrop): consumir la entrada para no
      // dejarla "muerta".
      if (
        isTop &&
        (window.history.state as { evenModalGuard?: number } | null)
          ?.evenModalGuard === id
      ) {
        ignoreNextPopstate += 1;
        window.history.back();
      }
    };
  }, [isOpen]);
}
