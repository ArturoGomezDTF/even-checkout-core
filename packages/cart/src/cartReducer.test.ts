import { describe, expect, it } from "vitest";
import {
  cartReducer,
  computeTotals,
  initialCartState,
  lineSignature,
  type CartLine,
  type CartState,
} from "./cartReducer";

const line = (over: Partial<CartLine> = {}): CartLine => ({
  id: 1,
  price: 100,
  quantity: 1,
  ...over,
});

const stateWith = (items: CartLine[]): CartState => ({
  ...initialCartState,
  ...computeTotals(items),
  items,
});

describe("computeTotals", () => {
  it("suma cantidades y precio + extra por cantidad", () => {
    expect(
      computeTotals([
        line({ quantity: 2, price: 50, extraPrice: 10 }),
        line({ id: 2, quantity: 1, price: 30 }),
      ]),
    ).toEqual({ totalItems: 3, totalPrice: 150 });
  });
});

describe("lineSignature", () => {
  const withOptions = (
    options: Array<{ optionId: string; quantity?: number; price?: number }>,
  ) => line({ customFields: [{ fieldId: "f", selectedOptions: options }] });

  it("no depende del orden de campos ni de opciones", () => {
    const a = line({
      customFields: [
        {
          fieldId: "a",
          selectedOptions: [{ optionId: "1" }, { optionId: "2" }],
        },
        { fieldId: "b", selectedOptions: [{ optionId: "3" }] },
      ],
    });
    const b = line({
      customFields: [
        { fieldId: "b", selectedOptions: [{ optionId: "3" }] },
        {
          fieldId: "a",
          selectedOptions: [{ optionId: "2" }, { optionId: "1" }],
        },
      ],
    });
    expect(lineSignature(a)).toBe(lineSignature(b));
  });

  it("distingue instrucciones especiales, pero null y undefined son lo mismo", () => {
    expect(
      lineSignature(line({ specialInstructions: "sin cebolla" })),
    ).not.toBe(lineSignature(line()));
    expect(lineSignature(line({ specialInstructions: null }))).toBe(
      lineSignature(line()),
    );
  });

  it("distingue cantidad y precio de cada opción (bug del poke x4)", () => {
    expect(
      lineSignature(withOptions([{ optionId: "1", quantity: 2 }])),
    ).not.toBe(lineSignature(withOptions([{ optionId: "1", quantity: 1 }])));
    expect(lineSignature(withOptions([{ optionId: "1", price: 5 }]))).not.toBe(
      lineSignature(withOptions([{ optionId: "1", price: 0 }])),
    );
    expect(lineSignature(withOptions([{ optionId: "1" }]))).toBe(
      lineSignature(withOptions([{ optionId: "1", quantity: 1, price: 0 }])),
    );
  });

  it("distingue extraPrice y producto", () => {
    expect(lineSignature(line({ extraPrice: 10 }))).not.toBe(
      lineSignature(line()),
    );
    expect(lineSignature(line({ id: 2 }))).not.toBe(lineSignature(line()));
  });
});

describe("cartReducer", () => {
  it("ADD_ITEM suma a la línea igual y agrega la distinta sin cartItemId", () => {
    let s = cartReducer(initialCartState as CartState, {
      type: "ADD_ITEM",
      payload: line({ cartItemId: "x" }),
    });
    expect(s.items[0].cartItemId).toBeUndefined();
    s = cartReducer(s, { type: "ADD_ITEM", payload: line({ quantity: 2 }) });
    expect(s.items).toHaveLength(1);
    expect(s.items[0].quantity).toBe(3);
    s = cartReducer(s, {
      type: "ADD_ITEM",
      payload: line({ specialInstructions: "extra salsa" }),
    });
    expect(s.items).toHaveLength(2);
    expect(s.totalItems).toBe(4);
    expect(s.totalPrice).toBe(400);
  });

  it("SET_CART_ITEM_ID sella solo el primer pendiente que coincide", () => {
    const sig = lineSignature(line());
    const s = cartReducer(
      stateWith([
        line(),
        line({ cartItemId: "ya" }),
        line({ specialInstructions: "a" }),
      ]),
      {
        type: "SET_CART_ITEM_ID",
        payload: { signature: sig, cartItemId: "nuevo" },
      },
    );
    expect(s.items.map((i) => i.cartItemId)).toEqual([
      "nuevo",
      "ya",
      undefined,
    ]);
    const again = cartReducer(s, {
      type: "SET_CART_ITEM_ID",
      payload: { signature: sig, cartItemId: "otro" },
    });
    expect(again.items.map((i) => i.cartItemId)).toEqual([
      "nuevo",
      "ya",
      undefined,
    ]);
  });

  it("REMOVE_ITEM y UPDATE_QUANTITY con cartItemId vacío no tocan líneas pendientes", () => {
    const base = stateWith([line(), line({ id: 2, cartItemId: "b" })]);
    expect(
      cartReducer(base, { type: "REMOVE_ITEM", payload: "b" }).items,
    ).toHaveLength(1);
    const q = cartReducer(base, {
      type: "UPDATE_QUANTITY",
      payload: { cartItemId: "b", quantity: 4 },
    });
    expect(q.items[1].quantity).toBe(4);
    expect(q.totalItems).toBe(5);
    const removed = cartReducer(base, {
      type: "UPDATE_QUANTITY",
      payload: { cartItemId: "b", quantity: 0 },
    });
    expect(removed.items).toHaveLength(1);
  });

  it("UPDATE_ITEM reemplaza en su lugar, o fusiona si la línea editada queda igual a otra", () => {
    const base = stateWith([
      line({ cartItemId: "a" }),
      line({ cartItemId: "b", specialInstructions: "x", quantity: 2 }),
    ]);
    const replaced = cartReducer(base, {
      type: "UPDATE_ITEM",
      payload: {
        cartItemId: "b",
        item: line({ specialInstructions: "y", quantity: 2 }),
      },
    });
    expect(replaced.items).toHaveLength(2);
    expect(replaced.items[1]).toMatchObject({
      cartItemId: "b",
      specialInstructions: "y",
    });

    const merged = cartReducer(base, {
      type: "UPDATE_ITEM",
      payload: { cartItemId: "b", item: line({ quantity: 2 }) },
    });
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]).toMatchObject({ cartItemId: "a", quantity: 3 });
    expect(merged.totalItems).toBe(3);
  });

  it("SET_CART marca hasLoaded y CLEAR_CART conserva el nombre", () => {
    let s = cartReducer(initialCartState as CartState, {
      type: "SET_USER_NAME",
      payload: "Ana",
    });
    expect(s.hasLoaded).toBe(false);
    s = cartReducer(s, {
      type: "SET_CART",
      payload: {
        items: [line()],
        totalItems: 1,
        totalPrice: 100,
        cartId: "c1",
      },
    });
    expect(s).toMatchObject({
      hasLoaded: true,
      cartId: "c1",
      isLoading: false,
    });
    s = cartReducer(s, { type: "CLEAR_CART" });
    expect(s).toMatchObject({
      items: [],
      userName: "Ana",
      hasLoaded: true,
      cartId: null,
    });
  });
});
