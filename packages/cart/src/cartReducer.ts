/**
 * Reducer puro del carrito compartido por tap-order-pay, room-service y
 * pick-and-go. Cada app lo usa con su propio `CartItem`; aquí solo se exige la
 * forma mínima que necesita la lógica de líneas y totales.
 */
export interface CartLineOption {
  optionId: string;
  price?: number;
  quantity?: number;
}

export interface CartLineField {
  fieldId: string;
  selectedOptions: CartLineOption[];
}

export interface CartLine {
  id: number;
  price: number;
  quantity: number;
  extraPrice?: number;
  customFields?: CartLineField[];
  specialInstructions?: string | null;
  cartItemId?: string;
}

export interface CartState<T extends CartLine = CartLine> {
  items: T[];
  totalItems: number;
  totalPrice: number;
  userName: string;
  isLoading: boolean;
  // false hasta que el carrito se resuelve por primera vez contra el backend.
  // Distingue "todavia no se que hay" de "ya se que esta vacio": sin esto, una
  // pantalla que rebota por carrito vacio lo hace en el primer render, antes
  // de que exista una sola respuesta del servidor.
  hasLoaded: boolean;
  cartId: string | null;
}

export type CartAction<T extends CartLine = CartLine> =
  | { type: "ADD_ITEM"; payload: T }
  | { type: "REMOVE_ITEM"; payload: string } // cartItemId
  | {
      type: "UPDATE_QUANTITY";
      payload: { cartItemId: string; quantity: number };
    }
  | { type: "UPDATE_ITEM"; payload: { cartItemId: string; item: T } }
  | {
      type: "SET_CART_ITEM_ID";
      payload: {
        signature: string;
        cartItemId: string;
      };
    }
  | { type: "CLEAR_CART" }
  | { type: "SET_USER_NAME"; payload: string }
  | { type: "SET_LOADING"; payload: boolean }
  | {
      type: "SET_CART";
      payload: {
        items: T[];
        totalItems: number;
        totalPrice: number;
        cartId: string | null;
      };
    };

export const initialCartState: CartState<never> = {
  items: [],
  totalItems: 0,
  totalPrice: 0,
  userName: "",
  isLoading: false,
  hasLoaded: false,
  cartId: null,
};

// Firma estable que identifica una "línea" del carrito independientemente de
// la forma del objeto customFields (el dish page incluye fieldType, el backend
// no). DEBE particionar las líneas igual que el dedup del backend (RPC
// add_to_cart), que trata dos items como el mismo solo si coinciden
// menu_item_id + custom_fields + extra_price + special_instructions. Por eso
// la firma incluye las instrucciones especiales y la cantidad/precio de cada
// opción (no solo el optionId): si no, la UI fusiona en una sola línea cosas
// que el servidor guarda por separado, mostrando un total menor al que
// realmente se cobra. (Bug del poke ×4 — folio 002, Saku.)
export function lineSignature(item: {
  id: number;
  extraPrice?: number;
  customFields?: CartLineField[];
  specialInstructions?: string | null;
}) {
  const fields = (item.customFields || [])
    .map((f) => ({
      fieldId: f.fieldId,
      options: (f.selectedOptions || [])
        .map((o) => ({
          optionId: o.optionId,
          quantity: o.quantity ?? 1,
          price: o.price ?? 0,
        }))
        .sort((a, b) => String(a.optionId).localeCompare(String(b.optionId))),
    }))
    .sort((a, b) => String(a.fieldId).localeCompare(String(b.fieldId)));
  return JSON.stringify({
    id: item.id,
    extra: item.extraPrice || 0,
    instructions: item.specialInstructions ?? null,
    fields,
  });
}

export function computeTotals(items: CartLine[]) {
  return {
    totalItems: items.reduce((s, i) => s + i.quantity, 0),
    totalPrice: items.reduce(
      (s, i) => s + (i.price + (i.extraPrice || 0)) * i.quantity,
      0,
    ),
  };
}

export function cartReducer<T extends CartLine>(
  state: CartState<T>,
  action: CartAction<T>,
): CartState<T> {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };

    case "SET_CART":
      return {
        ...state,
        items: action.payload.items,
        totalItems: action.payload.totalItems,
        totalPrice: action.payload.totalPrice,
        cartId: action.payload.cartId,
        isLoading: false,
        hasLoaded: true,
      };

    case "SET_USER_NAME":
      return { ...state, userName: action.payload };

    case "CLEAR_CART":
      return { ...initialCartState, userName: state.userName, hasLoaded: true };

    case "ADD_ITEM": {
      const newItem = action.payload;
      const sig = lineSignature(newItem);
      const existing = state.items.find((i) => lineSignature(i) === sig);
      const newItems = existing
        ? state.items.map((i) =>
            i === existing
              ? { ...i, quantity: i.quantity + newItem.quantity }
              : i,
          )
        : [...state.items, { ...newItem, cartItemId: undefined }];
      return { ...state, ...computeTotals(newItems), items: newItems };
    }

    case "REMOVE_ITEM": {
      const newItems = state.items.filter(
        (i) => i.cartItemId !== action.payload,
      );
      return { ...state, ...computeTotals(newItems), items: newItems };
    }

    case "UPDATE_QUANTITY": {
      const { cartItemId, quantity } = action.payload;
      const newItems =
        quantity <= 0
          ? state.items.filter((i) => i.cartItemId !== cartItemId)
          : state.items.map((i) =>
              i.cartItemId === cartItemId ? { ...i, quantity } : i,
            );
      return { ...state, ...computeTotals(newItems), items: newItems };
    }

    case "UPDATE_ITEM": {
      // Si la línea editada queda igual a otra, se fusiona (mismo dedup que el backend)
      const { cartItemId, item } = action.payload;
      const sig = lineSignature(item);
      const duplicate = state.items.find(
        (i) => i.cartItemId !== cartItemId && lineSignature(i) === sig,
      );
      const newItems = duplicate
        ? state.items
            .filter((i) => i.cartItemId !== cartItemId)
            .map((i) =>
              i === duplicate
                ? { ...i, quantity: i.quantity + item.quantity }
                : i,
            )
        : state.items.map((i) =>
            i.cartItemId === cartItemId ? { ...i, ...item, cartItemId } : i,
          );
      return { ...state, ...computeTotals(newItems), items: newItems };
    }

    case "SET_CART_ITEM_ID": {
      const { signature, cartItemId } = action.payload;
      // Sellar solo el primer pendiente que coincida — evita asignar el mismo
      // cartItemId a varias filas (lo que haría que + las mueva juntas).
      let stamped = false;
      const newItems = state.items.map((i) => {
        if (!stamped && !i.cartItemId && lineSignature(i) === signature) {
          stamped = true;
          return { ...i, cartItemId };
        }
        return i;
      });
      return { ...state, items: newItems };
    }

    default:
      return state;
  }
}
