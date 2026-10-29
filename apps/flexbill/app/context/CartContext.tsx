"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { MenuItemData } from "../interfaces/menuItemData";
import { cartApi, CartItem as ApiCartItem } from "../services/cartApi";
import { useAuth } from "./AuthContext";
import { useRestaurant } from "./RestaurantContext";

// Interfaz para un item del carrito (frontend)
export interface CartItem extends MenuItemData {
  quantity: number;
  cartItemId?: string; // ID del item en el carrito (del backend)
}

// Estado del carrito
interface CartState {
  items: CartItem[];
  totalItems: number;
  totalPrice: number;
  userName: string;
  isLoading: boolean;
  // false hasta la primera respuesta del backend
  hasLoaded: boolean;
  cartId: string | null;
}

// Acciones del carrito
type CartAction =
  | { type: "ADD_ITEM"; payload: CartItem }
  | { type: "UPDATE_ITEM"; payload: { cartItemId: string; item: CartItem } }
  | { type: "REMOVE_ITEM"; payload: string } // cartItemId
  | {
      type: "UPDATE_QUANTITY";
      payload: { cartItemId: string; quantity: number };
    }
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

// Estado inicial
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
// no). Solo usa lo que define la identidad: id + extraPrice + optionIds.
function lineSignature(item: {
  id: number;
  extraPrice?: number;
  customFields?: CartItem["customFields"];
  isPromoItem?: boolean;
}) {
  const fields = (item.customFields || [])
    .map((f: any) => ({
      fieldId: f.fieldId,
      options: ((f.selectedOptions || []) as any[])
        .map((o) => o.optionId)
        .sort(),
    }))
    .sort((a, b) => String(a.fieldId).localeCompare(String(b.fieldId)));
  // isPromoItem entra en la firma para que un item de promo nunca se
  // mezcle localmente con uno agregado a precio normal — el backend
  // tampoco los mezcla, crea una fila nueva para el que no es promo.
  return JSON.stringify({
    id: item.id,
    extra: item.extraPrice || 0,
    fields,
    promo: item.isPromoItem || false,
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

// Reducer del carrito
function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "SET_LOADING":
      return {
        ...state,
        isLoading: action.payload,
      };

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
      return {
        ...state,
        userName: action.payload,
      };

    case "CLEAR_CART":
      return {
        ...initialState,
        userName: state.userName, // Mantener userName
        hasLoaded: true,
      };

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

    case "UPDATE_ITEM": {
      // Reemplazo en su lugar; si el backend fusionó líneas, refreshCart lo reconcilia
      const { cartItemId, item } = action.payload;
      const newItems = state.items.map((i) =>
        i.cartItemId === cartItemId ? { ...i, ...item, cartItemId } : i,
      );
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

// Helper para convertir ApiCartItem a CartItem
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
    promoActivationId: apiItem.promoActivationId || null,
    promoDiscountPercentage: apiItem.promoDiscountPercentage ?? null,
    userDiscountId: apiItem.userDiscountId || null,
  };
}

// Contexto del carrito con funciones
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

// Provider del carrito
export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const [orderNotes, setOrderNotes] = useState("");
  const { user, isLoading } = useAuth();
  const { restaurantId, branchNumber } = useRestaurant();

  // Establecer supabase_user_id y restaurant_id en cartApi cuando cambien
  useEffect(() => {
    if (!isLoading) {
      cartApi.setSupabaseUserId(user?.id || null);
    }
  }, [user, isLoading]);

  useEffect(() => {
    cartApi.setRestaurantId(restaurantId);
  }, [restaurantId]);

  useEffect(() => {
    cartApi.setBranchNumber(branchNumber);
  }, [branchNumber]);

  // Función para refrescar el carrito desde el backend
  const refreshCart = async () => {
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      const response = await cartApi.getCart();

      if (response.success && response.data) {
        const items = response.data.items.map(convertApiItemToCartItem);
        dispatch({
          type: "SET_CART",
          payload: {
            items,
            totalItems: response.data.total_items,
            totalPrice: response.data.total_amount,
            cartId: response.data.cart_id,
          },
        });
        setOrderNotes(response.data.order_notes || "");
      } else {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    } catch (error) {
      console.error("Error loading cart:", error);
      dispatch({ type: "SET_LOADING", payload: false });
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
    const signature = lineSignature(item);

    dispatch({
      type: "ADD_ITEM",
      payload: {
        ...item,
        quantity,
        cartItemId: undefined,
        specialInstructions: specialInstructions || null,
      } as CartItem,
    });

    try {
      const response = await cartApi.addToCart(
        item.id,
        quantity,
        item.customFields || [],
        item.extraPrice || 0,
        item.price,
        specialInstructions,
        item.userDiscountId ?? undefined,
      );

      if (response.success && response.data) {
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
      const fresh = await cartApi.getCart();
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
      const response = await cartApi.removeFromCart(item.cartItemId);
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
          specialInstructions: specialInstructions || undefined,
        } as CartItem,
      },
    });

    try {
      const response = await cartApi.updateCartItem(
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

  // Actualizar cantidad — optimistic update instantáneo con rollback en error
  const updateQuantity = async (cartItemId: string, quantity: number) => {
    const previousItems = state.items;
    const previousCartId = state.cartId;
    dispatch({ type: "UPDATE_QUANTITY", payload: { cartItemId, quantity } });

    try {
      const response = await cartApi.updateCartItemQuantity(
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

  // Decrementar item — maneja remoción si qty llega a 0
  const decrementItem = async (itemId: number) => {
    let item = state.items.find((i) => i.id === itemId);
    if (!item?.cartItemId) {
      const fresh = await cartApi.getCart();
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
        const response = await cartApi.removeFromCart(cartItemId);
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
        const response = await cartApi.updateCartItemQuantity(
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

      const response = await cartApi.clearCart();

      if (response.success) {
        setOrderNotes("");
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
      await cartApi.updateOrderNotes(notes.trim() || null);
    } catch (error) {
      console.error("Error updating order notes:", error);
    }
  };

  // Actualizar nombre de usuario
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

  // Cargar carrito al montar el componente o cuando cambie el restaurante.
  // isLoading/restaurantId se resuelven en pasos separados (auth, luego
  // restaurante); dedupe con un ref para no repetir el fetch en cada paso.
  const fetchedRestaurantRef = useRef<number | null>(null);
  useEffect(() => {
    if (!restaurantId || isLoading) return;
    if (fetchedRestaurantRef.current === restaurantId) return;
    fetchedRestaurantRef.current = restaurantId;
    refreshCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, isLoading]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// Hook personalizado para usar el carrito
export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
