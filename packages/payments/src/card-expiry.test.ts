import { describe, expect, it } from "vitest";
import { getCardExpiryYears } from "./card-expiry";

describe("getCardExpiryYears", () => {
  it("incluye 2050 (tarjetas EcartPay) desde 2026", () => {
    const years = getCardExpiryYears(new Date("2026-11-02"));
    expect(years[0]).toBe("26");
    expect(years).toContain("50");
    expect(years).toHaveLength(30);
  });

  it("cruza el cambio de siglo con 2 dígitos", () => {
    const years = getCardExpiryYears(new Date("2095-01-01"), 7);
    expect(years).toEqual(["95", "96", "97", "98", "99", "00", "01"]);
  });
});
