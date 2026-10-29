"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { MenuItemData } from "../interfaces/menuItemData";
import { cartService, CartItem as ApiCartItem } from "../services/cart.service";
import { useAuth } from "./AuthContext";
import { useGuest } from "./GuestContext";
import { useRestaurant } from "./RestaurantContext";

export interface CartItem extends MenuItemData {
  quantity: number;
  cartItemId?: string;
  isPromoItem?: boolean;
  promoDiscountPercentage?: number | null;
  userDiscountId?: string | null;
}

interface CartState {
  items: CartItem[];
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

type CartAction =
  | { type: "ADD_ITEM"; payload: CartItem }
  | { type: "REMOVE_ITEM"; payload: string } // cartItemId
  | {
      type: "UPDATE_QUANTITY";
      payload: { cartItemId: string; quantity: number };
    }
  | { type: "UPDATE_ITEM"; payload: { cartItemId: string; item: CartItem } }
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
        items: CartItem[];
        totalItems: number;
        totalPrice: number;
        cartId: string | null;
      };
    };

const initialState: CartState = {
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
function lineSignature(item: {
  id: number;
  extraPrice?: number;
  customFields?: CartItem["customFields"];
  specialInstructions?: string | null;
}) {
  const fields = (item.customFields || [])
    .map((f: any) => ({
      fieldId: f.fieldId,
      options: ((f.selectedOptions || []) as any[])
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

function computeTotals(items: CartItem[]) {
  return {
    totalItems: items.reduce((s, i) => s + i.quantity, 0),
    totalPrice: items.reduce(
      (s, i) => s + (i.price + (i.extraPrice || 0)) * i.quantity,
      0,
    ),
  };
}

function cartReducer(state: CartState, action: CartAction): CartState {
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
      return { ...initialState, userName: state.userName, hasLoaded: true };

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

function convertApiItemToCartItem(apiItem: ApiCartItem): CartItem {
  return {
    id: apiItem.menu_item_id,
    name: apiItem.name,
    description: apiItem.description || "",
    price: apiItem.price,
    images: apiItem.images || [],
    features: apiItem.features || [],
    discount: apiItem.discount || 0,
    customFields: (apiItem.customFields || []).map((field) => ({
      fieldId: field.fieldId,
      fieldName: field.fieldName,
      origin: field.origin,
      selectedOptions: field.selectedOptions.map((opt) => ({
        optionId: opt.optionId,
        optionName: opt.optionName,
        price: opt.price,
        quantity: opt.quantity ?? 0,
      })),
    })),
    extraPrice: apiItem.extraPrice || 0,
    specialInstructions: apiItem.specialInstructions || null,
    quantity: apiItem.quantity,
    cartItemId: apiItem.id,
    isPromoItem: apiItem.isPromoItem || false,
    promoDiscountPercentage: apiItem.promoDiscountPercentage ?? null,
    userDiscountId: apiItem.userDiscountId || null,
  };
}

interface CartContextType {
  state: CartState;
  addItem: (
    item: MenuItemData,
    quantity?: number,
    specialInstructions?: string | null,
  ) => Promise<void>;
  removeItem: (itemId: number) => Promise<void>;
  decrementItem: (itemId: number) => Promise<void>;
  updateQuantity: (cartItemId: string, quantity: number) => Promise<void>;
  updateItem: (
    cartItemId: string,
    item: MenuItemData,
    quantity: number,
    specialInstructions?: string | null,
  ) => Promise<boolean>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
  setUserName: (name: string) => void;
  orderNotes: string;
  setOrderNotes: (notes: string) => void;
  updateOrderNotes: (notes: string) => Promise<void>;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const [orderNotes, setOrderNotes] = React.useState("");
  const { user, isLoading: authLoading } = useAuth();
  const {
    guestId,
    restaurantId: guestRestaurantId,
    branchNumber: guestBranchNumber,
  } = useGuest();
  const { restaurantId } = useRestaurant();

  useEffect(() => {
    if (!authLoading) {
      cartService.setSupabaseUserId(user?.id || null);
    }
  }, [user, authLoading]);

  useEffect(() => {
    const effectiveRestaurantId = restaurantId || guestRestaurantId;
    if (effectiveRestaurantId) {
      cartService.setRestaurantId(effectiveRestaurantId);
    }
  }, [restaurantId, guestRestaurantId]);

  useEffect(() => {
    if (guestBranchNumber) {
      cartService.setBranchNumber(guestBranchNumber);
    }
  }, [guestBranchNumber]);

  // Limpiar el carrito autenticado al cerrar sesión, sin requerir recarga.
  const wasAuthenticatedRef = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    const isAuthenticated = !!user?.id;
    if (wasAuthenticatedRef.current && !isAuthenticated) {
      refreshCart();
    }
    wasAuthenticatedRef.current = isAuthenticated;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]);

  // Token de "gana la última carga": si dos refreshCart se solapan, la
  // respuesta que salió antes pero llegó después ya no puede pisar el estado
  // más reciente (ej. la carga disparada por el cambio de identidad al iniciar
  // sesión contra la que corre después de migrar el carrito de invitado).
  const loadTokenRef = useRef(0);

  // Refrescar carrito completo desde el backend (solo carga inicial y migración)
  const refreshCart = async () => {
    const token = ++loadTokenRef.current;
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      const response = await cartService.getCart();

      // Ya salió otra carga después de ésta: manda la más reciente.
      if (token !== loadTokenRef.current) return;

      if (response.success && response.data) {
        const items = response.data.items.map(convertApiItemToCartItem);
        dispatch({
          type: "SET_CART",
          payload: {
            items,
            ...computeTotals(items),
            cartId: response.data.cart_id,
          },
        });
        setOrderNotes(response.data.order_notes || "");
      } else {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    } catch (error) {
      console.error("Error loading cart:", error);
      if (token === loadTokenRef.current) {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    }
  };

  // Agregar item — optimistic update instantáneo, sin bloquear UI
  const addItem = async (
    item: MenuItemData,
    quantity: number = 1,
    specialInstructions?: string | null,
  ) => {
    const previousItems = state.items;
    const previousCartId = state.cartId;
    // Normalizar las instrucciones igual que como se guardan en el estado y se
    // mandan al backend, para que la firma prediga correctamente el dedup del
    // servidor (y SET_CART_ITEM_ID selle la línea correcta).
    const normalizedInstructions = specialInstructions || null;
    const signature = lineSignature({
      ...item,
      specialInstructions: normalizedInstructions,
    });

    dispatch({
      type: "ADD_ITEM",
      payload: {
        ...item,
        quantity,
        cartItemId: undefined,
        specialInstructions: normalizedInstructions,
      } as CartItem,
    });

    try {
      const response = await cartService.addToCart(
        item.id,
        quantity,
        item.customFields || [],
        item.extraPrice || 0,
        item.price,
        specialInstructions,
        item.userDiscountId ?? undefined,
      );

      if (response.success && response.data) {
        // Actualizar cartItemId real (solo para items nuevos, no incrementos)
        dispatch({
          type: "SET_CART_ITEM_ID",
          payload: {
            signature,
            cartItemId: response.data.cart_item_id,
          },
        });
      } else {
        console.error("Error adding item to cart:", response.error);
        dispatch({
          type: "SET_CART",
          payload: {
            items: previousItems,
            ...computeTotals(previousItems),
            cartId: previousCartId,
          },
        });
      }
    } catch (error) {
      console.error("Error adding item to cart:", error);
      dispatch({
        type: "SET_CART",
        payload: {
          items: previousItems,
          ...computeTotals(previousItems),
          cartId: previousCartId,
        },
      });
    }
  };

  // Eliminar item — optimistic update instantáneo con rollback en error
  const removeItem = async (itemId: number) => {
    let item = state.items.find((i) => i.id === itemId);
    if (!item?.cartItemId) {
      // cartItemId aún no llegó — fetch fresco para obtenerlo
      const fresh = await cartService.getCart();
      if (fresh.success && fresh.data) {
        const freshItems = fresh.data.items.map(convertApiItemToCartItem);
        dispatch({
          type: "SET_CART",
          payload: {
            items: freshItems,
            ...computeTotals(freshItems),
            cartId: fresh.data.cart_id,
          },
        });
        item = freshItems.find((i) => i.id === itemId);
      }
      if (!item?.cartItemId) return;
    }

    const previousItems = state.items;
    const previousCartId = state.cartId;
    dispatch({ type: "REMOVE_ITEM", payload: item.cartItemId });

    try {
      const response = await cartService.removeFromCart(item.cartItemId);
      if (!response.success) {
        console.error("Error removing item from cart:", response.error);
        dispatch({
          type: "SET_CART",
          payload: {
            items: previousItems,
            ...computeTotals(previousItems),
            cartId: previousCartId,
          },
        });
      }
    } catch (error) {
      console.error("Error removing item from cart:", error);
      dispatch({
        type: "SET_CART",
        payload: {
          items: previousItems,
          ...computeTotals(previousItems),
          cartId: previousCartId,
        },
      });
    }
  };

  // Actualizar cantidad — optimistic update instantáneo con rollback en error
  const updateQuantity = async (cartItemId: string, quantity: number) => {
    const previousItems = state.items;
    const previousCartId = state.cartId;
    dispatch({ type: "UPDATE_QUANTITY", payload: { cartItemId, quantity } });

    try {
      const response = await cartService.updateCartItemQuantity(
        cartItemId,
        quantity,
      );
      if (!response.success) {
        console.error("Error updating quantity:", response.error);
        dispatch({
          type: "SET_CART",
          payload: {
            items: previousItems,
            ...computeTotals(previousItems),
            cartId: previousCartId,
          },
        });
      }
    } catch (error) {
      console.error("Error updating quantity:", error);
      dispatch({
        type: "SET_CART",
        payload: {
          items: previousItems,
          ...computeTotals(previousItems),
          cartId: previousCartId,
        },
      });
    }
  };

  // Editar una línea — optimistic update, luego refresco para reconciliar fusiones
  const updateItem = async (
    cartItemId: string,
    item: MenuItemData,
    quantity: number,
    specialInstructions?: string | null,
  ): Promise<boolean> => {
    const previousItems = state.items;
    const previousCartId = state.cartId;
    const rollback = () =>
      dispatch({
        type: "SET_CART",
        payload: {
          items: previousItems,
          ...computeTotals(previousItems),
          cartId: previousCartId,
        },
      });

    dispatch({
      type: "UPDATE_ITEM",
      payload: {
        cartItemId,
        item: {
          ...item,
          quantity,
          cartItemId,
          specialInstructions: specialInstructions || null,
        } as CartItem,
      },
    });

    try {
      const response = await cartService.updateCartItem(
        cartItemId,
        item.id,
        quantity,
        item.customFields || [],
        item.extraPrice || 0,
        item.price,
        specialInstructions,
      );
      if (!response.success) {
        console.error("Error updating cart item:", response.error);
        rollback();
        return false;
      }
      refreshCart();
      return true;
    } catch (error) {
      console.error("Error updating cart item:", error);
      rollback();
      return false;
    }
  };

  // Decrementar cantidad — maneja cartItemId undefined con fetch fresco
  const decrementItem = async (itemId: number) => {
    let item = state.items.find((i) => i.id === itemId);
    if (!item?.cartItemId) {
      const fresh = await cartService.getCart();
      if (fresh.success && fresh.data) {
        const freshItems = fresh.data.items.map(convertApiItemToCartItem);
        dispatch({
          type: "SET_CART",
          payload: {
            items: freshItems,
            ...computeTotals(freshItems),
            cartId: fresh.data.cart_id,
          },
        });
        item = freshItems.find((i) => i.id === itemId);
      }
      if (!item?.cartItemId) return;
    }

    const cartItemId = item.cartItemId;
    const newQuantity = item.quantity - 1;
    const previousItems = state.items;
    const previousCartId = state.cartId;

    if (newQuantity <= 0) {
      dispatch({ type: "REMOVE_ITEM", payload: cartItemId });
      try {
        const response = await cartService.removeFromCart(cartItemId);
        if (!response.success) {
          dispatch({
            type: "SET_CART",
            payload: {
              items: previousItems,
              ...computeTotals(previousItems),
              cartId: previousCartId,
            },
          });
        }
      } catch {
        dispatch({
          type: "SET_CART",
          payload: {
            items: previousItems,
            ...computeTotals(previousItems),
            cartId: previousCartId,
          },
        });
      }
    } else {
      dispatch({
        type: "UPDATE_QUANTITY",
        payload: { cartItemId, quantity: newQuantity },
      });
      try {
        const response = await cartService.updateCartItemQuantity(
          cartItemId,
          newQuantity,
        );
        if (!response.success) {
          dispatch({
            type: "SET_CART",
            payload: {
              items: previousItems,
              ...computeTotals(previousItems),
              cartId: previousCartId,
            },
          });
        }
      } catch {
        dispatch({
          type: "SET_CART",
          payload: {
            items: previousItems,
            ...computeTotals(previousItems),
            cartId: previousCartId,
          },
        });
      }
    }
  };

  // Limpiar carrito
  const clearCart = async () => {
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      const response = await cartService.clearCart();

      if (response.success) {
        dispatch({ type: "CLEAR_CART" });
      } else {
        console.error("Error clearing cart:", response.error);
        dispatch({ type: "SET_LOADING", payload: false });
      }
    } catch (error) {
      console.error("Error clearing cart:", error);
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  // Actualizar notas de la orden (persiste en DB)
  const updateOrderNotes = async (notes: string) => {
    setOrderNotes(notes);
    try {
      await cartService.updateOrderNotes(notes.trim() || null);
    } catch (error) {
      console.error("Error updating order notes:", error);
    }
  };

  const setUserName = (name: string) => {
    dispatch({ type: "SET_USER_NAME", payload: name });
  };

  const value: CartContextType = {
    state,
    addItem,
    removeItem,
    decrementItem,
    updateQuantity,
    updateItem,
    clearCart,
    refreshCart,
    setUserName,
    orderNotes,
    setOrderNotes,
    updateOrderNotes,
  };

  // migrate_guest_cart_to_user REEMPLAZA el carrito de la cuenta con el del
  // invitado (no los combina), así que dos llamadas SOLAPADAS son destructivas:
  // la segunda alcanza a leer el carrito de invitado antes de que la primera lo
  // borre, y termina pisando lo que aquélla ya había migrado — dejando el
  // carrito vacío. Este ref hace la migración idempotente por guest_id mientras
  // viva el componente. (Repetirla en un mount posterior sí es seguro: el RPC ya
  // no encuentra carrito de invitado y devuelve sin tocar el de la cuenta.)
  //
  // OJO: el guest_id NO se borra aquí. PaymentContext todavía lo necesita para
  // migrar los métodos de pago cuando escucha "even:cartMigrationComplete", y es
  // él quien lo borra al terminar esa segunda migración.
  const migratedGuestIdRef = useRef<string | null>(null);
  // Migración en vuelo. Este efecto se vuelve a disparar durante el mismo
  // login (al autenticarse, GuestContext limpia guestId, que es dependencia),
  // y esa segunda corrida saltaría la migración por el ref de arriba y
  // cargaría el carrito de la cuenta cuando todavía está vacío — el mismo
  // rebote al menú, por otra puerta. Así que toda carga espera a la migración
  // que ya esté corriendo antes de pedir el carrito.
  const migrationRef = useRef<Promise<boolean> | null>(null);

  // Cargar el carrito al montar o cuando cambie la identidad/restaurante.
  // Si el login trae un carrito de invitado pendiente, la migración corre ANTES
  // de pedir el carrito, en secuencia dentro de la misma función. Antes esto
  // vivía en dos efectos separados que se disparaban en paralelo al iniciar
  // sesión: el GET directo solía responder primero — con el carrito de la cuenta
  // todavía vacío — justo en el instante en que order-confirm decide si
  // rebotarte al menú por "no hay nada que confirmar".
  useEffect(() => {
    const effectiveRestaurantId = restaurantId || guestRestaurantId;
    const hasIdentity = user?.id || guestId;

    if (!effectiveRestaurantId || !hasIdentity || authLoading) return;

    // Nunca lanza: resuelve true solo si migró items de verdad.
    const migrateGuestCart = async (
      storedGuestId: string,
      userId: string,
    ): Promise<boolean> => {
      try {
        const response = await cartService.migrateGuestCart(
          storedGuestId,
          userId,
        );
        if (response.success && response.data) return true;
        console.warn("⚠️ Migration completed but no data returned:", response);
      } catch (error) {
        console.error("❌ Error migrating cart:", error);
        // Falló de verdad (no por duplicado) — permitir reintentar.
        migratedGuestIdRef.current = null;
      }
      return false;
    };

    const loadCart = async () => {
      let startedMigration = false;

      if (user?.id) {
        const storedGuestId = localStorage.getItem("even-guest-id");

        if (storedGuestId && migratedGuestIdRef.current !== storedGuestId) {
          migratedGuestIdRef.current = storedGuestId;
          startedMigration = true;
          migrationRef.current = migrateGuestCart(storedGuestId, user.id);
        }
      }

      // Si hay una migración corriendo (la haya lanzado esta corrida o la
      // anterior), esperarla: pedir el carrito antes lo traería vacío.
      const migrated = migrationRef.current
        ? await migrationRef.current
        : false;

      await refreshCart();

      if (startedMigration && migrated && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("even:cartMigrationComplete"));
      }
    };

    loadCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, guestRestaurantId, user?.id, guestId, authLoading]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
