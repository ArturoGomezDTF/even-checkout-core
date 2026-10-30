// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createUserDiscountsService,
  userDiscountDetailSuffix,
  type UserDiscount,
} from "./userDiscounts";

function setup(service = "room-service") {
  const request = vi.fn().mockResolvedValue({ success: true, data: [] });
  return { request, service: createUserDiscountsService(request, service) };
}

describe("userDiscountsService", () => {
  beforeEach(() => localStorage.clear());

  it("sin sesión no pega al API y devuelve lista vacía", async () => {
    const { request, service } = setup();
    expect(await service.getActive(7)).toEqual({ success: true, data: [] });
    expect(request).not.toHaveBeenCalled();
  });

  it("con sesión manda el service con el que se creó", async () => {
    localStorage.setItem("even_access_token", "t");
    const { request, service } = setup("pick-and-go");
    await service.getActive(7);
    expect(request).toHaveBeenCalledWith(
      "/user-discounts/active?restaurant_id=7&service=pick-and-go",
    );
  });

  it("claim manda POST con add_to_cart y nulls para vacíos", async () => {
    const { request, service } = setup();
    await service.claim("d1", null, null, true);
    const [endpoint, options] = request.mock.calls[0];
    expect(endpoint).toBe("/user-discounts/d1/claim");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      restaurant_id: null,
      branch_number: null,
      add_to_cart: true,
    });
  });
});

describe("userDiscountDetailSuffix", () => {
  it("une opciones y marca cantidades mayores a 1", () => {
    const d = {
      custom_fields: [
        {
          fieldId: "f",
          fieldName: "Tamaño",
          selectedOptions: [
            { optionId: "a", optionName: "16 oz", price: 0 },
            { optionId: "b", optionName: "Shot", price: 5, quantity: 2 },
          ],
        },
      ],
    } as UserDiscount;
    expect(userDiscountDetailSuffix(d)).toBe(" · 16 oz, Shot x2");
    expect(userDiscountDetailSuffix({} as UserDiscount)).toBe("");
  });
});
