"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { MenuItemData } from "../interfaces/menuItemData";
import { ApiResponse } from "../utils/api";
import { tableService } from "../services/table.service";
import type {
  DishOrder,
  TableSummary,
  ActiveUser,
  EqualSplitSelection,
} from "../services/table.service";
// Tipo para respuestas con estructura anidada { data: { data: T } }
interface NestedDataResponse<T> {
  data: T;
}
import { useAuth } from "./AuthContext";
import { useRestaurant } from "./RestaurantContext";
import { paymentService } from "../services/payment.service";
import { useTableRealtime } from "../hooks/useTableRealtime";

// Interfaz para un item del carrito (mantiene la misma funcionalidad)
export interface CartItem extends MenuItemData {
  quantity: number;
  customFields?: {
    fieldId: string;
    fieldName: string;
    selectedOptions: Array<{
      optionId: string;
      optionName: string;
      price: number;
    }>;
  }[];
  extraPrice?: number;
}

// Nuevo estado de la mesa basado en platillos
interface TableState {
  tableNumber: string;
  tableSummary: ApiResponse<NestedDataResponse<TableSummary>> | null;
  dishOrders: DishOrder[];
  activeUsers: ActiveUser[];
  // Selección de "Dividir cuenta" vigente para la mesa — null si nadie la
  // fijó todavía (o si nunca se pidió, ver loadEqualSplitSelection).
  equalSplitSelection: EqualSplitSelection | null;
  currentUserName: string;
  currentUserItems: CartItem[];
  currentUserTotalItems: number;
  currentUserTotalPrice: number;
  isLoading: boolean;
  error: string | null;
}

// Nuevas acciones para el sistema de platillos
type TableAction =
  | { type: "SET_TABLE_NUMBER"; payload: string }
  | { type: "ADD_ITEM_TO_CURRENT_USER"; payload: MenuItemData }
  | { type: "REMOVE_ITEM_FROM_CURRENT_USER"; payload: number }
  | {
      type: "UPDATE_QUANTITY_CURRENT_USER";
      payload: {
        id: number;
        quantity: number;
        customFields?: CartItem["customFields"];
      };
    }
  | { type: "SET_CURRENT_USER_NAME"; payload: string }
  | { type: "CLEAR_CURRENT_USER_CART" }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | {
      type: "SET_TABLE_SUMMARY";
      payload: ApiResponse<NestedDataResponse<TableSummary>> | null;
    }
  | { type: "SET_DISH_ORDERS"; payload: DishOrder[] }
  | { type: "SET_ACTIVE_USERS"; payload: ActiveUser[] }
  | {
      type: "SET_EQUAL_SPLIT_SELECTION";
      payload: EqualSplitSelection | null;
    }
  | {
      type: "UPDATE_DISH_STATUS";
      payload: { dishId: string; status: DishOrder["status"] };
    }
  | {
      type: "UPDATE_DISH_PAYMENT_STATUS";
      payload: { dishId: string; paymentStatus: DishOrder["payment_status"] };
    };

// Nuevo estado inicial
const initialState: TableState = {
  tableNumber: "",
  tableSummary: null,
  dishOrders: [],
  activeUsers: [],
  equalSplitSelection: null,
  currentUserName: "",
  currentUserItems: [],
  currentUserTotalItems: 0,
  currentUserTotalPrice: 0,
  isLoading: false,
  error: null,
};

// Función para calcular totales (incluye extraPrice)
const calculateTotals = (items: CartItem[]) => {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce(
    (sum, item) => sum + (item.price + (item.extraPrice || 0)) * item.quantity,
    0,
  );
  return { totalItems, totalPrice };
};

// Nuevo reducer para el sistema de platillos
function tableReducer(state: TableState, action: TableAction): TableState {
  switch (action.type) {
    case "SET_TABLE_NUMBER":
      return {
        ...state,
        tableNumber: action.payload,
      };

    // Mantener la funcionalidad del carrito (con comparación de custom fields)
    case "ADD_ITEM_TO_CURRENT_USER": {
      // Función helper para comparar custom fields
      const areCustomFieldsEqual = (
        cf1?: CartItem["customFields"],
        cf2?: CartItem["customFields"],
      ) => {
        if (!cf1 && !cf2) return true;
        if (!cf1 || !cf2) return false;
        if (cf1.length !== cf2.length) return false;

        return cf1.every((field1, index) => {
          const field2 = cf2[index];
          if (field1.fieldId !== field2.fieldId) return false;
          if (field1.selectedOptions.length !== field2.selectedOptions.length)
            return false;

          return field1.selectedOptions.every((opt1, idx) => {
            const opt2 = field2.selectedOptions[idx];
            return opt1.optionId === opt2.optionId;
          });
        });
      };

      const existingItem = state.currentUserItems.find(
        (item) =>
          item.id === action.payload.id &&
          areCustomFieldsEqual(item.customFields, action.payload.customFields),
      );

      let newItems: CartItem[];
      if (existingItem) {
        newItems = state.currentUserItems.map((item) =>
          item.id === action.payload.id &&
          areCustomFieldsEqual(item.customFields, action.payload.customFields)
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      } else {
        newItems = [
          ...state.currentUserItems,
          { ...action.payload, quantity: 1 },
        ];
      }

      const { totalItems, totalPrice } = calculateTotals(newItems);

      return {
        ...state,
        currentUserItems: newItems,
        currentUserTotalItems: totalItems,
        currentUserTotalPrice: totalPrice,
      };
    }

    case "REMOVE_ITEM_FROM_CURRENT_USER": {
      const newItems = state.currentUserItems.filter(
        (item) => item.id !== action.payload,
      );
      const { totalItems, totalPrice } = calculateTotals(newItems);

      return {
        ...state,
        currentUserItems: newItems,
        currentUserTotalItems: totalItems,
        currentUserTotalPrice: totalPrice,
      };
    }

    case "UPDATE_QUANTITY_CURRENT_USER": {
      // Función helper para comparar custom fields (reutilizada)
      const areCustomFieldsEqual = (
        cf1?: CartItem["customFields"],
        cf2?: CartItem["customFields"],
      ) => {
        if (!cf1 && !cf2) return true;
        if (!cf1 || !cf2) return false;
        if (cf1.length !== cf2.length) return false;

        return cf1.every((field1, index) => {
          const field2 = cf2[index];
          if (field1.fieldId !== field2.fieldId) return false;
          if (field1.selectedOptions.length !== field2.selectedOptions.length)
            return false;

          return field1.selectedOptions.every((opt1, idx) => {
            const opt2 = field2.selectedOptions[idx];
            return opt1.optionId === opt2.optionId;
          });
        });
      };

      const newItems = state.currentUserItems
        .map((item) =>
          item.id === action.payload.id &&
          areCustomFieldsEqual(item.customFields, action.payload.customFields)
            ? { ...item, quantity: action.payload.quantity }
            : item,
        )
        .filter((item) => item.quantity > 0);

      const { totalItems, totalPrice } = calculateTotals(newItems);

      return {
        ...state,
        currentUserItems: newItems,
        currentUserTotalItems: totalItems,
        currentUserTotalPrice: totalPrice,
      };
    }

    case "SET_CURRENT_USER_NAME":
      return {
        ...state,
        currentUserName: action.payload,
      };

    case "CLEAR_CURRENT_USER_CART":
      return {
        ...state,
        currentUserItems: [],
        currentUserTotalItems: 0,
        currentUserTotalPrice: 0,
      };

    // Nuevas acciones para el sistema de platillos
    case "SET_LOADING":
      return {
        ...state,
        isLoading: action.payload,
      };

    case "SET_ERROR":
      return {
        ...state,
        error: action.payload,
        isLoading: false,
      };

    case "SET_TABLE_SUMMARY":
      return {
        ...state,
        tableSummary: action.payload,
        isLoading: false,
        error: null,
      };

    case "SET_DISH_ORDERS":
      return {
        ...state,
        dishOrders: Array.isArray(action.payload) ? action.payload : [],
        isLoading: false,
        error: null,
      };

    case "SET_ACTIVE_USERS":
      return {
        ...state,
        activeUsers: Array.isArray(action.payload) ? action.payload : [],
      };

    case "SET_EQUAL_SPLIT_SELECTION":
      return {
        ...state,
        equalSplitSelection: action.payload,
      };

    case "UPDATE_DISH_STATUS": {
      const updatedOrders = state.dishOrders.map((order) =>
        order.dish_order_id === action.payload.dishId
          ? { ...order, status: action.payload.status }
          : order,
      );
      return {
        ...state,
        dishOrders: updatedOrders,
      };
    }

    case "UPDATE_DISH_PAYMENT_STATUS": {
      const updatedOrders = state.dishOrders.map((order) =>
        order.dish_order_id === action.payload.dishId
          ? { ...order, payment_status: action.payload.paymentStatus }
          : order,
      );
      return {
        ...state,
        dishOrders: updatedOrders,
      };
    }

    default:
      return state;
  }
}

// Nuevo contexto de la mesa
const TableContext = createContext<{
  state: TableState;
  dispatch: React.Dispatch<TableAction>;
  // Funciones del carrito (mantiene funcionalidad existente)
  submitOrder: (
    userName?: string,
    cartItems?: CartItem[],
    branchNumber?: string,
    orderNotes?: string | null,
  ) => Promise<void>;
  // Nuevas funciones para el sistema de platillos
  loadTableData: () => Promise<void>;
  loadTableSummary: () => Promise<void>;
  loadDishOrders: () => Promise<void>;
  loadActiveUsers: () => Promise<void>;
  // Trae la selección de "Dividir cuenta" vigente de la mesa desde el
  // backend — no se pide automáticamente en loadTableData, se llama
  // puntualmente desde payment-options al tocar "Dividir cuenta".
  loadEqualSplitSelection: () => Promise<EqualSplitSelection | null>;
  // Funciones de pago
  payDishOrder: (
    dishId: string,
    paymentMethodId?: string | null,
  ) => Promise<void>;
  payTableAmount: (
    amount: number,
    userId?: string,
    guestName?: string,
  ) => Promise<void>;
  // Unirse a la mesa/cuenta sin ordenar
  joinTableWithoutOrdering: (userName?: string) => Promise<void>;
  // Best-effort: jala platillos agregados directo en el POS
  syncOrderFromPOS: () => Promise<void>;
  // Función para actualizar estado de platillo (cocina)
  updateDishStatus: (
    dishId: string,
    status: DishOrder["status"],
  ) => Promise<void>;
} | null>(null);

// Nuevo Provider del contexto de mesa
export function TableProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(tableReducer, initialState);
  const { user, profile, isLoading } = useAuth();
  const { restaurantId, branchNumber } = useRestaurant();

  // Ref para evitar cargas duplicadas
  const lastLoadedTable = React.useRef<string | null>(null);
  const isLoadingRef = React.useRef(false);

  // Cargar resumen de la mesa (definido primero para usar en otros callbacks)
  const loadTableSummary = useCallback(async () => {
    if (!state.tableNumber || !restaurantId || !branchNumber) return;

    try {
      const response = await tableService.getTableSummary(
        restaurantId.toString(),
        branchNumber.toString(),
        state.tableNumber,
      );

      if (response.success && response.data) {
        dispatch({ type: "SET_TABLE_SUMMARY", payload: response });
      } else {
        dispatch({
          type: "SET_ERROR",
          payload: response.error?.message || "Failed to load table summary",
        });
      }
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: "Network error occurred" });
    }
  }, [state.tableNumber, restaurantId, branchNumber]);

  // Cargar órdenes de platillos
  const loadDishOrders = useCallback(async () => {
    if (!state.tableNumber || !restaurantId || !branchNumber) return;

    try {
      const response = await tableService.getTableOrders(
        restaurantId.toString(),
        branchNumber.toString(),
        state.tableNumber,
      );

      if (response.success && Array.isArray(response?.data?.data)) {
        const dishOrders = response.data.data;
        // Defensa contra una respuesta vacía transitoria (p. ej. un refresh
        // disparado por socket que cae justo en medio de una escritura en
        // el backend) — si veníamos de una lista con contenido y de repente
        // llega vacía, ignoramos este resultado en vez de vaciar la mesa en
        // pantalla; el siguiente refresh (socket o poll) trae el estado ya
        // consistente. Solo aplica cuando había platillos antes: una mesa
        // que de verdad empieza vacía sigue funcionando igual.
        if (dishOrders.length === 0 && state.dishOrders.length > 0) {
          console.warn(
            "⚠️ loadDishOrders: respuesta vacía con dishOrders previos no vacíos, ignorando (probable race transitoria)",
          );
          return;
        }
        dispatch({ type: "SET_DISH_ORDERS", payload: dishOrders });
      } else {
        dispatch({
          type: "SET_ERROR",
          payload: response.error?.message || "Failed to load dish orders",
        });
      }
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: "Network error occurred" });
    }
  }, [state.tableNumber, restaurantId, branchNumber, state.dishOrders]);

  // Cargar usuarios activos
  const loadActiveUsers = useCallback(async () => {
    if (!state.tableNumber || !restaurantId || !branchNumber) return;

    try {
      const response = await tableService.getActiveUsers(
        restaurantId.toString(),
        branchNumber.toString(),
        state.tableNumber,
      );

      // response.data es el body crudo del backend ({ success, data: ActiveUser[] }),
      // así que el arreglo real está en response.data.data.
      if (response.success && response.data) {
        dispatch({ type: "SET_ACTIVE_USERS", payload: response.data.data });
      }
    } catch (error) {
      console.error("Error loading active users:", error);
    }
  }, [state.tableNumber, restaurantId, branchNumber]);

  // Trae la selección de "Dividir cuenta" vigente — devuelve el valor
  // directamente (además de despacharlo) para que el caller (payment-options)
  // pueda decidir sin esperar un segundo render.
  const loadEqualSplitSelection = useCallback(async () => {
    if (!state.tableNumber || !restaurantId || !branchNumber) return null;

    try {
      const response = await tableService.getEqualSplitSelection(
        restaurantId.toString(),
        branchNumber.toString(),
        state.tableNumber,
      );

      if (response.success && response.data) {
        const selection: EqualSplitSelection | null = response.data.data;
        dispatch({ type: "SET_EQUAL_SPLIT_SELECTION", payload: selection });
        return selection;
      }
      return null;
    } catch (error) {
      console.error("Error loading equal split selection:", error);
      return null;
    }
  }, [state.tableNumber, restaurantId, branchNumber]);

  // Cargar todos los datos de la mesa
  const loadTableData = useCallback(async () => {
    if (!state.tableNumber) return;

    dispatch({ type: "SET_LOADING", payload: true });

    try {
      await Promise.all([
        loadTableSummary(),
        loadDishOrders(),
        loadActiveUsers(),
      ]);
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: "Error loading table data" });
    }
  }, [state.tableNumber, loadTableSummary, loadDishOrders, loadActiveUsers]);

  // Cargar todos los datos cuando se establece el número de mesa
  useEffect(() => {
    // Evitar cargas duplicadas
    if (
      state.tableNumber &&
      state.tableNumber !== lastLoadedTable.current &&
      !isLoadingRef.current
    ) {
      lastLoadedTable.current = state.tableNumber;
      isLoadingRef.current = true;

      loadTableData().finally(() => {
        isLoadingRef.current = false;
      });
    }
  }, [state.tableNumber, loadTableData]);

  // Callbacks para eventos de socket en tiempo real
  const handleDishCreated = useCallback(
    (dish: DishOrder) => {
      dispatch({
        type: "SET_DISH_ORDERS",
        payload: [...state.dishOrders, dish],
      });
    },
    [state.dishOrders],
  );

  const handleDishStatusChanged = useCallback(
    (dishId: string, status: DishOrder["status"]) => {
      dispatch({ type: "UPDATE_DISH_STATUS", payload: { dishId, status } });
    },
    [],
  );

  const handleDishPaid = useCallback((dishId: string) => {
    dispatch({
      type: "UPDATE_DISH_PAYMENT_STATUS",
      payload: { dishId, paymentStatus: "paid" },
    });
  }, []);

  const handleSummaryUpdate = useCallback(() => {
    loadTableSummary();
  }, [loadTableSummary]);

  const handleUserJoined = useCallback(
    (user: ActiveUser) => {
      // Validar que user no sea undefined
      if (!user) {
        console.warn("⚠️ handleUserJoined received undefined user, ignoring");
        return;
      }
      // Upsert por id: si el socket nos devuelve el join de alguien que ya
      // está en la lista (p. ej. el propio cliente recibiendo su eco del
      // join, o un refetch en curso que ya lo trajo), reemplazamos en vez
      // de duplicar la fila.
      const alreadyExists = state.activeUsers.some((u) => u.id === user.id);
      const updatedUsers = alreadyExists
        ? state.activeUsers.map((u) => (u.id === user.id ? user : u))
        : [...state.activeUsers, user];

      dispatch({
        type: "SET_ACTIVE_USERS",
        payload: updatedUsers,
      });
    },
    [state.activeUsers],
  );

  const handleUserLeft = useCallback(
    (userId: string) => {
      const updatedUsers = state.activeUsers.filter(
        (u) => u && u.user_id !== userId && u.guest_name !== userId,
      );
      dispatch({ type: "SET_ACTIVE_USERS", payload: updatedUsers });
    },
    [state.activeUsers],
  );

  const handleFullRefresh = useCallback(() => {
    loadTableData();
  }, [loadTableData]);

  // Dispatch directo (no refetch): el payload ya trae la selección completa
  // (o null si se invalidó por un comensal nuevo), así que no hace falta ir
  // a buscarla de nuevo.
  const handleEqualSplitUpdate = useCallback(
    (selection: EqualSplitSelection | null) => {
      dispatch({ type: "SET_EQUAL_SPLIT_SELECTION", payload: selection });
    },
    [],
  );

  // Hook de socket para tiempo real
  const { isSocketConnected } = useTableRealtime({
    tableNumber: state.tableNumber || null,
    enabled: !!state.tableNumber,
    onDishCreated: handleDishCreated,
    onDishStatusChanged: handleDishStatusChanged,
    onDishPaid: handleDishPaid,
    onSummaryUpdate: handleSummaryUpdate,
    onUserJoined: handleUserJoined,
    onUserLeft: handleUserLeft,
    onFullRefresh: handleFullRefresh,
    onEqualSplitUpdate: handleEqualSplitUpdate,
  });

  // Función para enviar orden (adaptada al nuevo sistema)
  const submitOrder = async (
    userName?: string,
    cartItems?: CartItem[],
    branchNumberParam?: string,
    orderNotes?: string | null,
  ) => {
    const finalUserName = userName || state.currentUserName;
    // Usar cartItems pasados como parámetro, o fallback a state.currentUserItems (legacy)
    const itemsToOrder = cartItems || state.currentUserItems;
    // Usar branchNumber pasado como parámetro, o fallback al del contexto
    const finalBranchNumber =
      branchNumberParam || branchNumber?.toString() || "1";

    if (!state.tableNumber || !finalUserName || itemsToOrder.length === 0) {
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });

    try {
      // Esperar a que auth termine de cargar
      if (isLoading) {
        dispatch({ type: "SET_LOADING", payload: false });
        throw new Error("Por favor espera mientras verificamos tu sesión");
      }

      // Determinar si el usuario está autenticado
      const isAuthenticated = !!user;
      const userId = isAuthenticated ? user.id : null;

      // Solo usar guestId si NO está autenticado
      const guestId =
        !isAuthenticated && typeof window !== "undefined"
          ? localStorage.getItem("even-guest-id")
          : null;

      // Si está autenticado pero el perfil no ha cargado, esperar
      if (isAuthenticated && !profile?.firstName) {
        dispatch({ type: "SET_LOADING", payload: false });
        throw new Error("Por favor espera mientras cargamos tu perfil");
      }

      // Usar nombre real del perfil si está autenticado, sino el proporcionado
      // IMPORTANTE: Si está autenticado, SIEMPRE usar el nombre del perfil
      const displayName = isAuthenticated
        ? profile?.firstName && profile?.lastName
          ? `${profile.firstName} ${profile.lastName}`
          : profile!.firstName!
        : finalUserName;

      // Guardar nombre para vinculación posterior (solo si no está autenticado)
      if (!isAuthenticated && typeof window !== "undefined") {
        localStorage.setItem("even-guest-name", finalUserName);
      }

      // Crear todas las órdenes del carrito en UNA sola petición.
      // El backend emite un único print job → un ticket por impresora/categoría
      // en lugar de un ticket por item.
      const response = await tableService.createMultipleDishOrders(
        restaurantId?.toString() || "1", // restaurantId del contexto
        finalBranchNumber, // branchNumber del contexto o parámetro
        state.tableNumber,
        userId, // userId si está autenticado, null si es invitado
        displayName, // Nombre real o guest name
        itemsToOrder.map((item) => ({
          item: item.name,
          quantity: item.quantity,
          price: item.price,
          images: item.images,
          customFields: item.customFields,
          extraPrice: item.extraPrice,
          menuItemId: item.id,
          specialInstructions: item.specialInstructions || null,
          is_promo_item: item.isPromoItem || false,
          promoActivationId: item.promoActivationId || null,
          userDiscountId: item.userDiscountId || null,
        })),
        guestId, // guestId solo si es invitado
        orderNotes, // notas de la orden
      );

      if (!response.success) {
        console.error("❌ Error creando orden:", response.error);
        throw new Error(
          response.error?.message || "Failed to create dish order",
        );
      }

      // Actualizar el nombre del usuario en el estado si se pasó como parámetro
      if (userName) {
        dispatch({ type: "SET_CURRENT_USER_NAME", payload: finalUserName });
      }

      // Limpiar carrito actual (legacy)
      dispatch({ type: "CLEAR_CURRENT_USER_CART" });

      // Recargar datos de la mesa (fire-and-forget: el pedido ya se creó con
      // éxito arriba, esto solo refresca la data en caché — no debe hacer
      // que el pedido se reporte como fallido si este refresh es lento o falla)
      loadTableData().catch((err) =>
        console.error("Error reloading table data after order:", err),
      );
    } catch (error) {
      console.error("❌ submitOrder - Error:", error);
      dispatch({
        type: "SET_ERROR",
        payload:
          error instanceof Error ? error.message : "Network error occurred",
      });
      throw error; // Re-throw para que los componentes puedan manejarlo
    }
  };

  // Nuevas funciones de pago
  const payDishOrder = async (
    dishId: string,
    paymentMethodId?: string | null,
  ) => {
    if (!state.tableNumber) return;

    dispatch({ type: "SET_LOADING", payload: true });

    try {
      await paymentService.payDishOrder(dishId, paymentMethodId || null);

      // Actualizar el estado del platillo localmente
      dispatch({
        type: "UPDATE_DISH_PAYMENT_STATUS",
        payload: { dishId, paymentStatus: "paid" },
      });

      // Recargar datos de la mesa
      await loadTableData();
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: "Network error occurred" });
    }
  };

  const payTableAmount = async (
    amount: number,
    userId?: string,
    guestName?: string,
  ) => {
    if (!state.tableNumber || !branchNumber) return;

    dispatch({ type: "SET_LOADING", payload: true });

    try {
      // Si no se proporciona userId o guestName, usar el usuario actual
      let finalUserId = userId;
      let finalGuestName = guestName;

      if (!finalUserId && !finalGuestName) {
        // Determinar si el usuario está autenticado
        const isAuthenticated = !isLoading && user;

        if (isAuthenticated) {
          finalUserId = user.id;
          finalGuestName =
            profile?.firstName && profile?.lastName
              ? `${profile.firstName} ${profile.lastName}`
              : profile?.firstName || state.currentUserName;
        } else {
          // Usuario invitado
          finalGuestName = state.currentUserName;
        }
      }

      const response = await paymentService.payTableAmount({
        restaurantId: restaurantId?.toString() || "1",
        branchNumber: branchNumber.toString(),
        tableNumber: state.tableNumber,
        amount,
        userId: finalUserId,
        guestName: finalGuestName,
        paymentMethodId: null,
      });

      if (response.success) {
        // Recargar datos de la mesa
        await loadTableData();
      } else {
        dispatch({
          type: "SET_ERROR",
          payload: response.error?.message || "Failed to pay table amount",
        });
      }
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: "Network error occurred" });
    }
  };

  // Resuelve la identidad de la sesión actual (autenticada o invitado)
  const resolveCurrentIdentity = () => {
    const isAuthenticated = !isLoading && !!user;
    if (isAuthenticated) {
      return {
        userId: user!.id as string,
        guestId: null as string | null,
        guestName:
          profile?.firstName && profile?.lastName
            ? `${profile.firstName} ${profile.lastName}`
            : profile?.firstName || state.currentUserName,
      };
    }
    const guestId =
      typeof window !== "undefined"
        ? localStorage.getItem("even-guest-id")
        : null;
    return {
      userId: null as string | null,
      guestId,
      guestName: state.currentUserName,
    };
  };

  // Unirse a la mesa/cuenta sin ordenar (p. ej. alguien que solo quiere pagar/dividir)
  const joinTableWithoutOrdering = async (userName?: string) => {
    if (!state.tableNumber || !branchNumber) return;

    try {
      const { userId, guestId, guestName } = resolveCurrentIdentity();
      const finalGuestName = userName || guestName;

      await paymentService.joinTable({
        restaurantId: restaurantId?.toString() || "1",
        branchNumber: branchNumber.toString(),
        tableNumber: state.tableNumber,
        userId,
        guestId,
        // Antes se mandaba null para usuarios logueados (la identidad va
        // por userId) — pero addActiveUser en el backend hace UPDATE
        // guest_name = <esto> sin condicionar, así que un join posterior a
        // un pedido ya hecho borraba el nombre real que el pedido había
        // dejado guardado. Se manda siempre el nombre real ya resuelto.
        guestName: finalGuestName,
      });

      await loadActiveUsers();
    } catch (error) {
      console.error("Error joining table:", error);
    }
  };

  // Best-effort: jala platillos agregados directo en el POS (fuera de la app)
  // antes de refrescar. No lanza error si no hay POS integrado o el agente
  // está desconectado — el refresh local sigue de todas formas.
  const syncOrderFromPOS = async () => {
    if (!state.tableNumber || !restaurantId || !branchNumber) return;

    try {
      await tableService.syncOrderFromPOS(
        restaurantId.toString(),
        branchNumber.toString(),
        state.tableNumber,
      );
    } catch (error) {
      console.error("Error syncing order from POS:", error);
    }
  };

  // Polling automático: jala del POS cada 25s mientras haya una orden activa en la mesa y no esté pagada.
  // Best-effort (syncOrderFromPOS ya traga errores), así que esto solo
  // automatiza lo que hoy dispara el botón "Actualizar".
  const tableStatus = state.tableSummary?.data?.data?.status;
  const hasActiveOrder = !!state.tableSummary?.data?.data;
  useEffect(() => {
    if (!state.tableNumber || !hasActiveOrder || tableStatus === "paid") return;

    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      syncOrderFromPOS().then(() => loadTableData());
    }, 25000);

    return () => clearInterval(interval);
  }, [state.tableNumber, hasActiveOrder, tableStatus]);

  // Función para actualizar estado de platillo (cocina)
  const updateDishStatus = async (
    dishId: string,
    status: DishOrder["status"],
  ) => {
    try {
      const response = await tableService.updateDishStatus(dishId, status);

      if (response.success) {
        // Actualizar el estado del platillo localmente
        dispatch({
          type: "UPDATE_DISH_STATUS",
          payload: { dishId, status },
        });
      } else {
        dispatch({
          type: "SET_ERROR",
          payload: response.error?.message || "Failed to update dish status",
        });
      }
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: "Network error occurred" });
    }
  };

  return (
    <TableContext.Provider
      value={{
        state,
        dispatch,
        // Funciones del carrito (mantiene funcionalidad existente)
        submitOrder,
        // Nuevas funciones para el sistema de platillos
        loadTableData,
        loadTableSummary,
        loadDishOrders,
        loadActiveUsers,
        loadEqualSplitSelection,
        // Funciones de pago
        payDishOrder,
        payTableAmount,
        joinTableWithoutOrdering,
        syncOrderFromPOS,
        // Función para actualizar estado de platillo (cocina)
        updateDishStatus,
      }}
    >
      {children}
    </TableContext.Provider>
  );
}

// Hook personalizado para usar el contexto de mesa
export function useTable() {
  const context = useContext(TableContext);
  if (!context) {
    throw new Error("useTable must be used within a TableProvider");
  }
  return context;
}
