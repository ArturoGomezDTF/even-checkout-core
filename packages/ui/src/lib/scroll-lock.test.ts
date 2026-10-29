import { afterEach, describe, expect, it, vi } from "vitest";
import { lockScroll, unlockScroll } from "./scroll-lock";

describe("lockScroll / unlockScroll", () => {
  afterEach(() => {
    document.body.removeAttribute("style");
    document.documentElement.removeAttribute("style");
  });

  it("fija el body y restaura la posición de scroll al soltar", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    Object.defineProperty(window, "scrollY", { value: 240, configurable: true });

    lockScroll();
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("-240px");

    unlockScroll();
    expect(document.body.style.position).toBe("");
    expect(scrollTo).toHaveBeenCalledWith(0, 240);
  });

  it("solo libera cuando se suelta el último lock", () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    lockScroll();
    lockScroll();
    unlockScroll();
    expect(document.body.style.position).toBe("fixed");
    unlockScroll();
    expect(document.body.style.position).toBe("");
  });

  it("ignora unlocks de más", () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    unlockScroll();
    lockScroll();
    expect(document.body.style.position).toBe("fixed");
    unlockScroll();
  });
});
