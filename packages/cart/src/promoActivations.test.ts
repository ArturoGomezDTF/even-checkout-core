import { describe, expect, it, vi } from "vitest";
import {
  createPromoActivationsService,
  promoItemDetailSuffix,
  type PromoActivationItem,
} from "./promoActivations";

function setup() {
  const request = vi.fn().mockResolvedValue({ success: true, data: [] });
  return { request, service: createPromoActivationsService(request) };
}

describe("promoActivationsService", () => {
  it("getActive arma la URL con restaurante y sucursal", async () => {
    const { request, service } = setup();
    await service.getActive(7, 2);
    expect(request).toHaveBeenCalledWith(
      "/promotions/active?restaurant_id=7&branch_number=2",
    );
  });

  it("getActive agrega el promo_code codificado", async () => {
    const { request, service } = setup();
    await service.getActive(7, 2, "A B&C");
    expect(request).toHaveBeenCalledWith(
      "/promotions/active?restaurant_id=7&branch_number=2&promo_code=A%20B%26C",
    );
  });

  it("claim manda POST con nulls para los campos vacíos", async () => {
    const { request, service } = setup();
    await service.claim("act-1");
    const [endpoint, options] = request.mock.calls[0];
    expect(endpoint).toBe("/promotions/act-1/claim");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      restaurant_id: null,
      branch_number: null,
      promo_code: null,
    });
  });

  it("claim incluye restaurante, sucursal y código", async () => {
    const { request, service } = setup();
    await service.claim("act-1", 7, 2, "QR1");
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      restaurant_id: 7,
      branch_number: 2,
      promo_code: "QR1",
    });
  });

  it("getClaimedOrderDiscount pega al endpoint de promo de cuenta", async () => {
    const { request, service } = setup();
    await service.getClaimedOrderDiscount(7, 2);
    expect(request).toHaveBeenCalledWith(
      "/promotions/claimed-order-discount?restaurant_id=7&branch_number=2",
    );
  });
});

describe("promoItemDetailSuffix", () => {
  const item = (custom_fields: PromoActivationItem["custom_fields"]) =>
    ({ id: "1", menu_item_id: 1, menu_items: null, custom_fields }) as PromoActivationItem;

  it("vacío sin personalización", () => {
    expect(promoItemDetailSuffix(item(null))).toBe("");
  });

  it("une opciones y marca cantidades mayores a 1", () => {
    expect(
      promoItemDetailSuffix(
        item([
          {
            fieldId: "f",
            fieldName: "Tamaño",
            selectedOptions: [
              { optionId: "a", optionName: "16 oz", price: 0 },
              { optionId: "b", optionName: "Shot", price: 5, quantity: 2 },
            ],
          },
        ]),
      ),
    ).toBe(" · 16 oz, Shot x2");
  });
});
