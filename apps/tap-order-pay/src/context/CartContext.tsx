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
import {
  cartReducer as baseCartReducer,
  computeTotals,
  initialCartState,
  lineSignature,
  type CartState as BaseCartState,
} from "@even/cart";
import { MenuItemData } from "../interfaces/menuItemData";
import { cartApi, CartItem as ApiCartItem } from "../services/cart.service";
import { useAuth } from "./AuthContext";
import { useRestaurant } from "./RestaurantContext";

export interface CartItem extends MenuItemData {
  quantity: number;
  cartItemId?: string;
  specialInstructions?: string;
  isPromoItem?: boolean;
  promoDiscountPercentage?: number | null;
  userDiscountId?: string | null;
}

type CartState = BaseCartState<CartItem>;

const initialState: CartState = initialCartState;

const cartReducer = baseCartReducer<CartItem>;

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
    quantity: apiItem.quantity,
    cartItemId: apiItem.id,
    specialInstructions: apiItem.specialInstructions,
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
  const [orderNotes, setOrderNotes] = useState("");
  const { user, isLoading, isAuthenticated } = useAuth();
  const { restaurantId, branchNumber } = useRestaurant();

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

  // Migrar carrito cuando el usuario inicia sesión.
  // migrate_guest_cart_to_user REEMPLAZA el carrito de la cuenta con el del
  // invitado (no los combina), así que dos llamadas SOLAPADAS son destructivas:
  // la segunda alcanza a leer el carrito de invitado antes de que la primera lo
  // borre, y termina pisando lo que aquélla ya había migrado — dejando el
  // carrito vacío. Este efecto puede dispararse más de una vez para el mismo
  // login (también depende de restaurantId/isAuthenticated, que pueden cambiar
  // en un render aparte), así que el ref lo hace idempotente por guest_id.
  // (Repetirla en un mount posterior sí es seguro: el RPC ya no encuentra
  // carrito de invitado y devuelve sin tocar el de la cuenta.)
  const migratedGuestIdRef = useRef<string | null>(null);
  useEffect(() => {
    const migrateCartIfNeeded = async () => {
      if (!isLoading && user?.id && restaurantId) {
        const guestId = cartApi.getGuestIdForUser();
        if (guestId && migratedGuestIdRef.current !== guestId) {
          migratedGuestIdRef.current = guestId;
          try {
            const response = await cartApi.migrateGuestCart(guestId, user.id);
            if (response.success && response.data) {
              await refreshCart();
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("even:cartMigrationComplete"),
                );
              }
            } else {
              await refreshCart();
            }
          } catch (error) {
            console.error("❌ Error migrating cart:", error);
            // Falló de verdad (no por duplicado) — permitir reintentar.
            migratedGuestIdRef.current = null;
          }
        }
      }
    };
    migrateCartIfNeeded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isLoading, restaurantId, isAuthenticated]);

  const wasAuthenticatedRef = useRef(false);
  useEffect(() => {
    if (isLoading) return;
    if (wasAuthenticatedRef.current && !isAuthenticated) {
      refreshCart();
    }
    wasAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated, isLoading]);

  // Token de "gana la última carga": si dos refreshCart se solapan, la
  // respuesta que salió antes pero llegó después ya no puede pisar el estado
  // más reciente (ej. la carga inicial contra la que corre después de migrar
  // el carrito de invitado).
  const loadTokenRef = useRef(0);

  const refreshCart = async () => {
    const token = ++loadTokenRef.current;
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      const response = await cartApi.getCart();

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
      const response = await cartApi.addToCart(
        item.id,
        quantity,
        item.customFields || [],
        item.extraPrice || 0,
        item.price,
        specialInstructions ?? undefined,
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
      // cartItemId aún no llegó — fetch fresco para obtenerlo
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

  const clearCart = async () => {
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      const response = await cartApi.clearCart();
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

  const setUserName = (name: string) => {
    dispatch({ type: "SET_USER_NAME", payload: name });
  };

  const updateOrderNotes = async (notes: string) => {
    setOrderNotes(notes);
    try {
      await cartApi.updateOrderNotes(notes.trim() || null);
    } catch (error) {
      console.error("Error updating order notes:", error);
    }
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

  // Cargar carrito al montar o cuando cambie la identidad/restaurante
  useEffect(() => {
    if (restaurantId && !isLoading) {
      refreshCart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, isLoading]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
