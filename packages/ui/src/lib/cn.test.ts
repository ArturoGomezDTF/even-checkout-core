import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("descarta valores falsos", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("deja ganar la clase de la app sobre la del componente", () => {
    expect(cn("bg-even-grass px-6", "bg-even-evergreen")).toBe("px-6 bg-even-evergreen");
  });

  it("no confunde color de texto con tamaño de texto", () => {
    expect(cn("text-xs text-muted", "text-danger")).toBe("text-xs text-danger");
  });
});
