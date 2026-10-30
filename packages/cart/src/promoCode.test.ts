// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { getStoredPromoCode, storePromoCode } from "./promoCode";

describe("promoCode", () => {
  beforeEach(() => localStorage.clear());

  it("guarda y lee el código por restaurante y sucursal", () => {
    storePromoCode(1, 2, "QR1");
    expect(getStoredPromoCode(1, 2)).toBe("QR1");
    expect(getStoredPromoCode(1, 3)).toBeNull();
    expect(localStorage.getItem("even-promo-code-1-2")).toBe("QR1");
  });

  it("devuelve null sin restaurante o sucursal", () => {
    expect(getStoredPromoCode(null, 2)).toBeNull();
    expect(getStoredPromoCode(1, null)).toBeNull();
  });
});
