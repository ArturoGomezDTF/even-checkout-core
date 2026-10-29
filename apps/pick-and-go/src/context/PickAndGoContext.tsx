"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { useGuest } from "@/context/GuestContext";
import { PickAndGoOrder } from "@/services/pickandgo.service";
import { usePickAndGo } from "@/hooks/usePickAndGo";
import { useRestaurant } from "@/context/RestaurantContext";
import { useBranch } from "@/context/BranchContext";
import { useCart } from "@/context/CartContext";

// Import enhanced cart utilities from TableContext
import {
  CartItem,
  CustomField,
  calculateTotals,
  addItemToCart,
  updateCartItemQuantity,
  removeItemFromCart,
  clearCart,
  getUserAuthInfo,
  saveGuestInfo,
  generateGuestId,
  validateCartItem,
  validateCustomFields,
} from "@/utils/cartHelpers";

// Import dedicated services
import { pickAndGoService } from "@/services/pickandgo.service";

// ===============================================
// ENHANCED TYPES AND INTERFACES
// ===============================================

// CartItem is now imported from cartHelpers with full custom fields support

interface PickAndGoState {
  // Orden actual
  currentOrder: PickAndGoOrder | null;

  // Items del carrito (antes de confirmar orden)
  cartItems: CartItem[];
  cartTotal: number;
  cartItemCount: number;

  // Estados de carga y error
  loading: boolean;
  error: string | null;

  // Enhanced customer info with authentication support
  customerInfo: {
    name: string;
    phone?: string;
    email?: string;
    isAuthenticated?: boolean;
    userId?: string;
    guestId?: string;
  } | null;

  // Estado del flujo
  currentStep:
    | "menu"
    | "cart"
    | "checkout"
    | "payment"
    | "confirmation"
    | "tracking";

  // Metadatos de la sesión
  sessionData: Record<string, any>;

  // Enhanced restaurant context (replacing table functionality)
  restaurantId?: string;
}

type PickAndGoAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_CURRENT_ORDER"; payload: PickAndGoOrder | null }
  | { type: "ADD_TO_CART"; payload: CartItem }
  | {
      type: "REMOVE_FROM_CART";
      payload: { id: string; customFields?: CustomField[] };
    }
  | {
      type: "UPDATE_CART_QUANTITY";
      payload: { id: string; quantity: number; customFields?: CustomField[] };
    }
  | { type: "CLEAR_CART" }
  | { type: "SET_CUSTOMER_INFO"; payload: PickAndGoState["customerInfo"] }
  | { type: "SET_CURRENT_STEP"; payload: PickAndGoState["currentStep"] }
  | { type: "UPDATE_SESSION_DATA"; payload: Record<string, any> }
  | { type: "SET_RESTAURANT_ID"; payload: string }
  | { type: "SYNC_TOTALS" };

// ===============================================
// REDUCER
// ===============================================

const initialState: PickAndGoState = {
  currentOrder: null,
  cartItems: [],
  cartTotal: 0,
  cartItemCount: 0,
  loading: false,
  error: null,
  customerInfo: null,
  currentStep: "menu",
  sessionData: {},
  restaurantId: undefined,
};

function pickAndGoReducer(
  state: PickAndGoState,
  action: PickAndGoAction,
): PickAndGoState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.payload };

    case "SET_ERROR":
      return { ...state, error: action.payload };

    case "SET_CURRENT_ORDER":
      return { ...state, currentOrder: action.payload };

    case "ADD_TO_CART": {
      // Use enhanced cart logic from TableContext
      const updatedItems = addItemToCart(state.cartItems, action.payload);
      const { totalItems, totalPrice } = calculateTotals(updatedItems);

      return {
        ...state,
        cartItems: updatedItems,
        cartTotal: totalPrice,
        cartItemCount: totalItems,
      };
    }

    case "REMOVE_FROM_CART": {
      // Use enhanced removal logic with custom fields support
      const updatedItems = removeItemFromCart(
        state.cartItems,
        action.payload.id,
        action.payload.customFields,
      );
      const { totalItems, totalPrice } = calculateTotals(updatedItems);

      return {
        ...state,
        cartItems: updatedItems,
        cartTotal: totalPrice,
        cartItemCount: totalItems,
      };
    }

    case "UPDATE_CART_QUANTITY": {
      // Use enhanced quantity update logic with custom fields support
      const updatedItems = updateCartItemQuantity(
        state.cartItems,
        action.payload.id,
        action.payload.quantity,
        action.payload.customFields,
      );
      const { totalItems, totalPrice } = calculateTotals(updatedItems);

      return {
        ...state,
        cartItems: updatedItems,
        cartTotal: totalPrice,
        cartItemCount: totalItems,
      };
    }

    case "CLEAR_CART": {
      const emptyCart = clearCart();
      const { totalItems, totalPrice } = calculateTotals(emptyCart);

      return {
        ...state,
        cartItems: emptyCart,
        cartTotal: totalPrice,
        cartItemCount: totalItems,
      };
    }

    case "SYNC_TOTALS": {
      // Recalculate totals from current cart items
      const { totalItems, totalPrice } = calculateTotals(state.cartItems);
      return {
        ...state,
        cartTotal: totalPrice,
        cartItemCount: totalItems,
      };
    }

    case "SET_RESTAURANT_ID":
      return {
        ...state,
        restaurantId: action.payload,
      };

    case "SET_CUSTOMER_INFO":
      return { ...state, customerInfo: action.payload };

    case "SET_CURRENT_STEP":
      return { ...state, currentStep: action.payload };

    case "UPDATE_SESSION_DATA":
      return {
        ...state,
        sessionData: { ...state.sessionData, ...action.payload },
      };

    default:
      return state;
  }
}

// ===============================================
// CONTEXTO
// ===============================================

interface PickAndGoContextType {
  state: PickAndGoState;
  dispatch: React.Dispatch<PickAndGoAction>;

  // Enhanced cart actions with custom fields support
  addToCart: (item: Omit<CartItem, "id">) => void;
  removeFromCart: (itemId: string, customFields?: CustomField[]) => void;
  updateCartQuantity: (
    itemId: string,
    quantity: number,
    customFields?: CustomField[],
  ) => void;
  clearCart: () => void;
  syncCartTotals: () => void;

  // Order actions
  createOrder: () => Promise<PickAndGoOrder | null>;
  confirmOrder: () => Promise<void>;
  trackOrder: (orderId: string) => Promise<void>;

  // Enhanced customer management
  setCustomerInfo: (info: PickAndGoState["customerInfo"]) => void;
  initializeCustomerFromAuth: () => void;
  saveGuestInfo: (name: string) => void;

  // Flow management
  setCurrentStep: (step: PickAndGoState["currentStep"]) => void;
  updateSessionData: (data: Record<string, any>) => void;
  setRestaurantId: (restaurantId: string) => void;

  // Utilities
  clearError: () => void;
  validateItem: (item: Partial<CartItem>) => boolean;
}

const PickAndGoContext = createContext<PickAndGoContextType | undefined>(
  undefined,
);

// ===============================================
// PROVIDER
// ===============================================

interface PickAndGoProviderProps {
  children: ReactNode;
}

export function PickAndGoProvider({ children }: PickAndGoProviderProps) {
  const [state, dispatch] = useReducer(pickAndGoReducer, initialState);
  const { user, profile, isLoading } = useAuth();
  const { guestId } = useGuest();
  const pickAndGoHook = usePickAndGo();
  const { orderNotes, setOrderNotes, updateOrderNotes } = useCart();

  // Get restaurant context - needed for robust order creation
  const { restaurantId } = useRestaurant();
  const { selectedBranchNumber } = useBranch();

  const isLoaded = !isLoading;

  // ===============================================
  // UTILITY FUNCTIONS (defined early)
  // ===============================================

  const setCustomerInfo = useCallback(
    (info: PickAndGoState["customerInfo"]) => {
      dispatch({ type: "SET_CUSTOMER_INFO", payload: info });
    },
    [],
  );

  const initializeCustomerFromAuth = useCallback(() => {
    const authInfo = getUserAuthInfo(isLoaded, user, profile);

    setCustomerInfo({
      name: authInfo.displayName,
      email: authInfo.email || undefined,
      isAuthenticated: authInfo.isAuthenticated,
      userId: authInfo.userId || undefined,
      guestId: authInfo.guestId || guestId || undefined,
    });

    /*console.log("👤 Customer initialized:", {
      authenticated: authInfo.isAuthenticated,
      name: authInfo.displayName,
    });*/
  }, [isLoaded, user, profile, guestId, setCustomerInfo]);

  // Initialize customer info when user authentication changes
  useEffect(() => {
    if (isLoaded) {
      initializeCustomerFromAuth();
    }
  }, [isLoaded, initializeCustomerFromAuth]);

  // Sync loading and error state from hook
  useEffect(() => {
    dispatch({ type: "SET_LOADING", payload: pickAndGoHook.loading });
  }, [pickAndGoHook.loading]);

  useEffect(() => {
    dispatch({ type: "SET_ERROR", payload: pickAndGoHook.error });
  }, [pickAndGoHook.error]);

  useEffect(() => {
    dispatch({
      type: "SET_CURRENT_ORDER",
      payload: pickAndGoHook.currentOrder,
    });
  }, [pickAndGoHook.currentOrder]);

  // ===============================================
  // ACCIONES
  // ===============================================

  // ===============================================
  // ENHANCED CART ACTIONS
  // ===============================================

  const addToCart = (item: Omit<CartItem, "id">) => {
    // Validate item before adding
    if (!validateItem(item)) {
      console.error("❌ Invalid item data:", item);
      dispatch({ type: "SET_ERROR", payload: "Invalid item data" });
      return;
    }

    const cartItem: CartItem = {
      ...item,
      id: `${item.name}-${Date.now()}-${Math.random()}`,
    };

    dispatch({ type: "ADD_TO_CART", payload: cartItem });
    /*console.log(
      "🛒 Item added to cart:",
      cartItem.name,
      cartItem.customFields ? "with custom fields" : "",
    );*/
  };

  const removeFromCart = (itemId: string, customFields?: CustomField[]) => {
    dispatch({
      type: "REMOVE_FROM_CART",
      payload: { id: itemId, customFields },
    });
    /*console.log(
      "🗑️ Item removed from cart:",
      itemId,
      customFields ? "with custom fields" : "",
    );*/
  };

  const updateCartQuantity = (
    itemId: string,
    quantity: number,
    customFields?: CustomField[],
  ) => {
    dispatch({
      type: "UPDATE_CART_QUANTITY",
      payload: { id: itemId, quantity, customFields },
    });
    /*console.log(
      "🔄 Cart quantity updated:",
      itemId,
      quantity,
      customFields ? "with custom fields" : "",
    );*/
  };

  const clearCart = () => {
    dispatch({ type: "CLEAR_CART" });
    //console.log("🧹 Cart cleared");
  };

  const syncCartTotals = () => {
    dispatch({ type: "SYNC_TOTALS" });
  };

  // ===============================================
  // GUEST MANAGEMENT (continued)
  // ===============================================

  const saveGuestInfoLocal = (name: string) => {
    const guestId = generateGuestId();
    saveGuestInfo(name, guestId);

    setCustomerInfo({
      name,
      isAuthenticated: false,
      guestId,
    });

    //console.log("👤 Guest info saved:", { name, guestId });
  };

  // ===============================================
  // ENHANCED ORDER MANAGEMENT
  // ===============================================

  // ===============================================
  // SIMPLIFIED CREATE ORDER (now just for cart → checkout transition)
  // ===============================================

  const createOrder = async (): Promise<PickAndGoOrder | null> => {
    // This function now just prepares the transition from cart to checkout
    // The actual dish order creation happens in confirmOrder() using TableContext logic

    if (state.cartItems.length === 0) {
      console.error("❌ Cannot create order: empty cart");
      dispatch({ type: "SET_ERROR", payload: "Cart is empty" });
      return null;
    }

    // Initialize customer info if not set
    if (!state.customerInfo?.name) {
      const authInfo = getUserAuthInfo(isLoaded, user, profile);
      setCustomerInfo({
        name: authInfo.displayName,
        email: authInfo.email || undefined,
        isAuthenticated: authInfo.isAuthenticated,
        userId: authInfo.userId || undefined,
        guestId: authInfo.guestId || guestId || undefined,
      });
    }

    try {
      // Create a mock order object for UI transition
      const mockOrder: PickAndGoOrder = {
        id: `mock_${Date.now()}`,
        clerk_user_id: state.customerInfo?.userId || null,
        customer_name: state.customerInfo?.name || "Customer",
        customer_phone: state.customerInfo?.phone,
        customer_email: state.customerInfo?.email,
        total_amount: state.cartTotal,
        restaurant_id: parseInt(restaurantId?.toString() || "1"),
        branch_number: selectedBranchNumber || 1,
        payment_status: "pending",
        order_status: "active",
        cooking_status: "preparing",
        session_data: {
          ...state.sessionData,
          cartItemCount: state.cartItemCount,
          pickupPreference: "asap",
        },
        prep_metadata: {
          estimatedItems: state.cartItems.length,
          cartTotal: state.cartTotal,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      dispatch({ type: "SET_CURRENT_ORDER", payload: mockOrder });
      setCurrentStep("checkout");
      //console.log("✅ Order prepared for checkout:", mockOrder.id);

      return mockOrder;
    } catch (error) {
      console.error("💥 Error preparing order:", error);
      dispatch({
        type: "SET_ERROR",
        payload: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  };

  // ===============================================
  // ROBUST ORDER CONFIRMATION (adapted from TableContext)
  // ===============================================

  const confirmOrder = async () => {
    // Enhanced validation - similar to TableContext submitOrder
    if (state.cartItems.length === 0) {
      console.error("❌ Cannot confirm order: empty cart");
      dispatch({ type: "SET_ERROR", payload: "Cart is empty" });
      return;
    }

    if (!state.customerInfo?.name) {
      console.error("❌ Cannot confirm order: missing customer info");
      dispatch({ type: "SET_ERROR", payload: "Customer information required" });
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });

    try {
      // Save guest info BEFORE getting authInfo if not authenticated
      if (!user && typeof window !== "undefined" && state.customerInfo?.name) {
        localStorage.setItem("even-guest-name", state.customerInfo.name);
        if (!localStorage.getItem("even-guest-id")) {
          const newGuestId = generateGuestId();
          localStorage.setItem("even-guest-id", newGuestId);
        }
      }

      // Use robust authentication logic
      const authInfo = getUserAuthInfo(isLoaded, user, profile);

      // Log authentication info for debugging
      /*console.log("🔐 Auth info:", {
        isAuthenticated: authInfo.isAuthenticated,
        userId: authInfo.userId,
        guestId: authInfo.guestId,
        displayName: authInfo.displayName,
      });*/

      // Ensure we have at least userId or guestName
      if (!authInfo.userId && !authInfo.displayName) {
        throw new Error(
          "Missing user identification. Please provide customer name.",
        );
      }

      // STEP 1: Create Pick & Go order first
      //console.log("🆕 Creating Pick & Go order...");
      const orderResponse = await pickAndGoHook.createOrder({
        clerk_user_id: authInfo.userId,
        customer_name:
          state.customerInfo?.name || authInfo.displayName || "Guest",
        customer_phone: state.customerInfo?.phone,
        customer_email: state.customerInfo?.email,
        restaurant_id: parseInt(restaurantId?.toString() || "1"),
        branch_number: selectedBranchNumber || 1,
        total_amount: state.cartTotal,
        session_data: {
          ...state.sessionData,
          cartItemCount: state.cartItemCount,
          pickupPreference: "asap",
        },
        prep_metadata: {
          estimatedItems: state.cartItems.length,
          cartTotal: state.cartTotal,
        },
        order_notes: orderNotes.trim() || null,
      });
      updateOrderNotes(""); // limpia en DB y en estado

      if (!orderResponse) {
        throw new Error("Failed to create Pick & Go order");
      }

      //console.log("✅ Pick & Go order created:", orderResponse.id);
      dispatch({ type: "SET_CURRENT_ORDER", payload: orderResponse });

      // STEP 2: Create individual dish orders for each cart item
      /*console.log(
        "🍽️ Creating dish orders for",
        state.cartItems.length,
        "items",
      );*/

      for (const item of state.cartItems) {
        const response = await pickAndGoService.createDishOrder(
          orderResponse.id, // pickAndGoOrderId from the order we just created
          {
            item: item.name, // item name
            quantity: item.quantity, // quantity from cart
            price: item.price, // price (already includes discounts)
            userId: authInfo.userId, // userId from Supabase if authenticated, null if guest
            guestId: authInfo.guestId, // guestId only if guest user
            guestName: authInfo.displayName, // Real name or guest name
            images: item.images || (item.image ? [item.image] : []), // images array
            customFields: item.customFields, // custom fields selected
            extraPrice: item.extraPrice || 0, // extra price from custom fields
            menuItemId: item.id, // menu_item_id,
          },
        );

        if (!response.success) {
          throw new Error(
            response.error?.message ||
              `Failed to create dish order for ${item.name}`,
          );
        }

        //console.log("✅ Dish order created:", item.name, "x", item.quantity);
      }

      // Clear cart and update state
      clearCart();
      setCurrentStep("confirmation");
      dispatch({ type: "SET_LOADING", payload: false });

      //console.log("🎉 All dish orders created successfully for Pick & Go!");
    } catch (error) {
      console.error("💥 Error confirming Pick & Go order:", error);
      dispatch({
        type: "SET_ERROR",
        payload:
          error instanceof Error ? error.message : "Failed to confirm order",
      });
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  const trackOrder = async (orderId: string) => {
    try {
      await pickAndGoHook.getOrder(orderId);
      setCurrentStep("tracking");
      //console.log("✅ Now tracking order:", orderId);
    } catch (error) {
      console.error("💥 Error tracking order:", error);
    }
  };

  // ===============================================
  // UTILITY FUNCTIONS
  // ===============================================

  const setCurrentStep = (step: PickAndGoState["currentStep"]) => {
    dispatch({ type: "SET_CURRENT_STEP", payload: step });
  };

  const updateSessionData = (data: Record<string, any>) => {
    dispatch({ type: "UPDATE_SESSION_DATA", payload: data });
  };

  const setRestaurantId = useCallback((restaurantId: string) => {
    dispatch({ type: "SET_RESTAURANT_ID", payload: restaurantId });
  }, []);

  const clearError = () => {
    dispatch({ type: "SET_ERROR", payload: null });
    pickAndGoHook.clearError();
  };

  const validateItem = (item: Partial<CartItem>): boolean => {
    return validateCartItem(item) && validateCustomFields(item.customFields);
  };

  // ===============================================
  // CONTEXT VALUE
  // ===============================================

  const contextValue: PickAndGoContextType = {
    state,
    dispatch,
    // Enhanced cart actions
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    syncCartTotals,
    // Order actions
    createOrder,
    confirmOrder,
    trackOrder,
    // Enhanced customer management
    setCustomerInfo,
    initializeCustomerFromAuth,
    saveGuestInfo: saveGuestInfoLocal,
    // Flow management
    setCurrentStep,
    updateSessionData,
    setRestaurantId,
    // Utilities
    clearError,
    validateItem,
  };

  return (
    <PickAndGoContext.Provider value={contextValue}>
      {children}
    </PickAndGoContext.Provider>
  );
}

// ===============================================
// HOOK
// ===============================================

export function usePickAndGoContext() {
  const context = useContext(PickAndGoContext);
  if (!context) {
    throw new Error(
      "usePickAndGoContext must be used within a PickAndGoProvider",
    );
  }
  return context;
}
