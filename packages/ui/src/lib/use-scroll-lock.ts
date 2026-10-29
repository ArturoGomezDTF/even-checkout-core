"use client";

import { useEffect } from "react";
import { lockScroll, unlockScroll } from "./scroll-lock";

/** Bloquea el scroll del body mientras `active` sea true. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    lockScroll();
    return unlockScroll;
  }, [active]);
}
