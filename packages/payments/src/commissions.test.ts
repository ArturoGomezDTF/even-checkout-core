import { describe, expect, it } from "vitest";
import {
  calculateCommissions,
  formatMXN,
  getCommissionRates,
} from "./commissions";

describe("getCommissionRates", () => {
  it("es tarifa plana 4% (2% cliente, 2% restaurante) sin importar el monto", () => {
    for (const amount of [0, 10, 40.01, 500, 100000]) {
      expect(getCommissionRates(amount)).toEqual({
        evenTotal: 4,
        clientPays: 2,
        restaurantPays: 2,
      });
    }
  });
});

describe("calculateCommissions", () => {
  it("cobra al cliente base + propina + 2% con IVA 16% sobre la comisión", () => {
    const b = calculateCommissions(100, 10);
    expect(b.subtotalForCommission).toBe(110);
    expect(b.evenCommissionClient).toBeCloseTo(2.2);
    expect(b.ivaEvenClient).toBeCloseTo(0.352);
    expect(b.evenClientCharge).toBe(2.55);
    expect(b.evenRestaurantCharge).toBe(2.55);
    expect(b.totalAmountCharged).toBe(112.55);
  });

  it("calcula el IVA de la propina sin cobrárselo al cliente", () => {
    const b = calculateCommissions(85, 50);
    expect(b.ivaTip).toBeCloseTo(8);
    expect(b.totalAmountCharged).toBe(
      Math.round((85 + 50 + b.evenClientCharge) * 100) / 100,
    );
  });

  it("con monto cero no cobra nada", () => {
    const b = calculateCommissions(0, 0);
    expect(b.totalAmountCharged).toBe(0);
    expect(b.evenClientCharge).toBe(0);
  });

  it("redondea la comisión a centavos", () => {
    const b = calculateCommissions(33.33, 0);
    expect(b.evenClientCharge).toBe(0.77);
    expect(b.totalAmountCharged).toBe(34.1);
  });
});

describe("formatMXN", () => {
  it("formatea con dos decimales y sufijo MXN", () => {
    expect(formatMXN(5)).toBe("$5.00 MXN");
    expect(formatMXN(1234.567)).toBe("$1234.57 MXN");
  });
});
