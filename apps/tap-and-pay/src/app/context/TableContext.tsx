"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { TapPayOrder, DishOrder, ActiveUser } from "../types/order";
import { orderService } from "../services/order.service";
import { useAuth } from "./AuthContext";
import { useRestaurant } from "./RestaurantContext";
import { useOrderRealtime } from "../hooks/useOrderRealtime";
import type { PaymentType } from "../types/payment";

interface TableState {
  tableNumber: string;
  order: TapPayOrder | null;
  dishOrders: DishOrder[];
  activeUsers: ActiveUser[];
  isLoading: boolean;
  error: string | null;
  isSplitBillActive: boolean;
}

interface TableContextType {
  state: TableState;
  isSocketConnected: boolean;
  setTableNumber: (tableNumber: string) => void;
  loadTableData: () => Promise<void>;
  loadOrder: () => Promise<void>;
  loadDishOrders: () => Promise<void>;
  loadActiveUsers: () => Promise<void>;
  loadSplitPaymentStatus: () => Promise<void>;
  refreshAll: () => Promise<void>;
  processPayment: (
    paymentType: PaymentType,
    amount?: number,
    tipAmount?: number,
    paymentMethodId?: string,
    selectedItems?: string[],
  ) => Promise<void>;
  payDishOrder: (
    dishId: string,
    paymentMethodId?: string | null,
  ) => Promise<void>;
  payTableAmount: (
    amount: number,
    userId?: string,
    guestName?: string,
  ) => Promise<void>;
  initializeSplitBill: (
    numberOfPeople: number,
    userIds?: string[],
    guestNames?: string[],
  ) => Promise<void>;
  paySplitAmount: (userId?: string, guestName?: string) => Promise<void>;
  updateDishStatus: (
    dishId: string,
    status: DishOrder["status"],
  ) => Promise<void>;
}

const TableContext = createContext<TableContextType | undefined>(undefined);

export function TableProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TableState>({
    tableNumber: "",
    order: null,
    dishOrders: [],
    activeUsers: [],
    isLoading: false,
    error: null,
    isSplitBillActive: false,
  });

  const { user } = useAuth();
  const { restaurant, params } = useRestaurant();

  // Ref para acceder a loadTableData desde los handlers sin dependencias circulares
  const loadTableDataRef = useRef<(() => Promise<void>) | undefined>(undefined);

  // Handlers para eventos de socket en tiempo real
  const handleOrderCreated = useCallback((order: TapPayOrder) => {
    setState((prev) => ({
      ...prev,
      order,
      dishOrders: Array.isArray(order.items) ? order.items : [],
    }));
  }, []);

  const handlePaymentReceived = useCallback(() => {
    // Recargar todos los datos cuando se recibe un pago
    loadTableDataRef.current?.();
  }, []);

  const handleDishStatusChanged = useCallback(
    (dishId: string, status: DishOrder["status"]) => {
      setState((prev) => ({
        ...prev,
        dishOrders: prev.dishOrders.map((dish) =>
          dish.id === dishId ? { ...dish, status } : dish,
        ),
      }));
    },
    [],
  );

  const handleOrderStatusChanged = useCallback(
    (orderId: string, status: TapPayOrder["order_status"]) => {
      setState((prev) => ({
        ...prev,
        order: prev.order ? { ...prev.order, order_status: status } : null,
      }));
    },
    [],
  );

  const handleOrderCompleted = useCallback((order: TapPayOrder) => {
    setState((prev) => ({
      ...prev,
      order,
      dishOrders: Array.isArray(order.items) ? order.items : prev.dishOrders,
    }));
  }, []);

  const handleFullRefresh = useCallback(() => {
    loadTableDataRef.current?.();
  }, []);

  // Hook de real-time para escuchar eventos de socket
  const { isSocketConnected } = useOrderRealtime({
    tableNumber: state.tableNumber || null,
    enabled: !!state.tableNumber && !!params?.restaurantId,
    onOrderCreated: handleOrderCreated,
    onPaymentReceived: handlePaymentReceived,
    onDishStatusChanged: handleDishStatusChanged,
    onOrderStatusChanged: handleOrderStatusChanged,
    onOrderCompleted: handleOrderCompleted,
    onFullRefresh: handleFullRefresh,
  });

  // NO cargar automáticamente - la página llama a loadTableData cuando está lista
  // useEffect(() => {
  //   if (state.tableNumber && params?.restaurantId && params?.branchNumber) {
  //     loadTableData();
  //   }
  // }, [state.tableNumber, params?.restaurantId, params?.branchNumber]);

  const setTableNumber = useCallback((tableNumber: string) => {
    setState((prev) => ({ ...prev, tableNumber }));
  }, []);

  // Cargar orden activa
  const loadOrder = useCallback(async () => {
    if (!state.tableNumber || !params?.restaurantId || !params?.branchNumber)
      return;

    try {
      const response = await orderService.getActiveOrderByTable(
        params.restaurantId,
        params.branchNumber,
        state.tableNumber,
      );

      if (response.success) {
        // Si no hay orden (data es null), no es un error, simplemente no hay orden abierta
        setState((prev) => ({
          ...prev,
          order: response.data || null,
          isLoading: false,
          error: null,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          order: null,
          error: response.error?.message || "Error al cargar la orden",
          isLoading: false,
        }));
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: "Error al cargar la orden",
        isLoading: false,
      }));
    }
  }, [state.tableNumber, params?.restaurantId, params?.branchNumber]);

  // Cargar todos los datos de la mesa
  const loadTableData = useCallback(async () => {
    if (!state.tableNumber || !params?.restaurantId || !params?.branchNumber) {
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Primero cargar la orden
      const orderResponse = await orderService.getActiveOrderByTable(
        params.restaurantId,
        params.branchNumber,
        state.tableNumber,
      );

      if (orderResponse.success) {
        const order = orderResponse.data;

        // Si no hay orden, simplemente establecer estado vacío (no es un error)
        if (!order) {
          setState((prev) => ({
            ...prev,
            order: null,
            dishOrders: [],
            activeUsers: [],
            isSplitBillActive: false,
            isLoading: false,
            error: null,
          }));
          return;
        }

        // Los items ya vienen en la respuesta de la RPC function
        const dishOrders = Array.isArray(order.items) ? order.items : [];

        setState((prev) => ({
          ...prev,
          order,
          dishOrders,
        }));

        // Si hay orden, cargar usuarios activos y estado de split
        if (order?.order_id) {
          const [usersResponse, splitResponse] = await Promise.all([
            orderService.getActiveUsers(order.order_id),
            orderService.getSplitPaymentStatus(order.order_id),
          ]);

          setState((prev) => ({
            ...prev,
            activeUsers: Array.isArray(usersResponse.data)
              ? usersResponse.data
              : [],
            isSplitBillActive: splitResponse.data?.is_split_active || false,
            isLoading: false,
          }));
        } else {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      } else {
        setState((prev) => ({
          ...prev,
          order: null,
          dishOrders: [],
          error: orderResponse.error?.message || "Error al cargar la orden",
          isLoading: false,
        }));
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: "Error al cargar datos de la mesa",
        isLoading: false,
      }));
    }
  }, [state.tableNumber, params?.restaurantId, params?.branchNumber]);

  // Actualizar ref para que los handlers de socket puedan acceder
  loadTableDataRef.current = loadTableData;

  // Cargar platillos de la orden
  const loadDishOrders = useCallback(async () => {
    if (!state.order?.order_id) return;

    try {
      const response = await orderService.getOrderItems(state.order.order_id);

      if (response.success && response.data) {
        setState((prev) => ({
          ...prev,
          dishOrders: Array.isArray(response.data) ? response.data : [],
        }));
      }
    } catch (error) {
      console.error("Error loading dish orders:", error);
    }
  }, [state.order?.order_id]);

  // Cargar usuarios activos
  const loadActiveUsers = useCallback(async () => {
    if (!state.order?.order_id) return;

    try {
      const response = await orderService.getActiveUsers(state.order.order_id);

      if (response.success && response.data) {
        setState((prev) => ({
          ...prev,
          activeUsers: Array.isArray(response.data) ? response.data : [],
        }));
      }
    } catch (error) {
      console.error("Error loading active users:", error);
    }
  }, [state.order?.order_id]);

  // Cargar estado de split payment
  const loadSplitPaymentStatus = useCallback(async () => {
    if (!state.order?.order_id) return;

    try {
      const response = await orderService.getSplitPaymentStatus(
        state.order.order_id,
      );

      if (response.success && response.data) {
        setState((prev) => ({
          ...prev,
          isSplitBillActive: response.data.is_split_active || false,
        }));
      }
    } catch (error) {
      console.error("Error loading split payment status:", error);
    }
  }, [state.order?.order_id]);

  // Refrescar todos los datos
  const refreshAll = useCallback(async () => {
    await loadTableData();
  }, [loadTableData]);

  // Procesar pago
  const processPayment = useCallback(
    async (
      paymentType: PaymentType,
      amount?: number,
      tipAmount: number = 0,
      paymentMethodId?: string,
      selectedItems?: string[],
    ) => {
      if (!state.order?.order_id) {
        throw new Error("No hay orden activa");
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await orderService.processPayment({
          orderId: state.order.order_id,
          paymentType,
          amount,
          tipAmount,
          paymentMethodId: paymentMethodId || "",
          selectedItems,
          userId: user?.id,
          guestName: !user
            ? localStorage.getItem("even-guest-name") || undefined
            : undefined,
        });

        if (response.success) {
          await refreshAll();
        } else {
          throw new Error(
            response.error?.message || "Error al procesar el pago",
          );
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error
              ? error.message
              : "Error al procesar el pago",
          isLoading: false,
        }));
        throw error;
      }
    },
    [state.order?.order_id, user, refreshAll],
  );

  // Pagar un platillo
  const payDishOrder = useCallback(
    async (dishId: string, paymentMethodId?: string | null) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await orderService.payDishOrder(
          dishId,
          paymentMethodId || null,
        );

        if (response.success) {
          await refreshAll();
        } else {
          throw new Error(
            response.error?.message || "Error al pagar el platillo",
          );
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error
              ? error.message
              : "Error al pagar el platillo",
          isLoading: false,
        }));
        throw error;
      }
    },
    [refreshAll],
  );

  // Pagar un monto específico
  const payTableAmount = useCallback(
    async (amount: number, userId?: string, guestName?: string) => {
      if (!state.order?.order_id) {
        throw new Error("No hay orden activa");
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await orderService.payOrderAmount(
          state.order.order_id,
          amount,
          null,
          userId || user?.id,
          guestName,
        );

        if (response.success) {
          await refreshAll();
        } else {
          throw new Error(
            response.error?.message || "Error al pagar el monto",
          );
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : "Error al pagar el monto",
          isLoading: false,
        }));
        throw error;
      }
    },
    [state.order?.order_id, user, refreshAll],
  );

  // Inicializar split bill
  const initializeSplitBill = useCallback(
    async (
      numberOfPeople: number,
      userIds?: string[],
      guestNames?: string[],
    ) => {
      if (!state.order?.order_id) {
        throw new Error("No hay orden activa");
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await orderService.initializeSplitBill(
          state.order.order_id,
          numberOfPeople,
          userIds,
          guestNames,
        );

        if (response.success) {
          await refreshAll();
        } else {
          throw new Error(
            response.error?.message ||
              "Error al inicializar división de cuenta",
          );
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error
              ? error.message
              : "Error al inicializar división de cuenta",
          isLoading: false,
        }));
        throw error;
      }
    },
    [state.order?.order_id, refreshAll],
  );

  // Pagar parte del split
  const paySplitAmount = useCallback(
    async (userId?: string, guestName?: string) => {
      if (!state.order?.order_id) {
        throw new Error("No hay orden activa");
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await orderService.paySplitAmount(
          state.order.order_id,
          null,
          userId || user?.id,
          guestName,
        );

        if (response.success) {
          await refreshAll();
        } else {
          throw new Error(
            response.error?.message || "Error al pagar parte dividida",
          );
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error
              ? error.message
              : "Error al pagar parte dividida",
          isLoading: false,
        }));
        throw error;
      }
    },
    [state.order?.order_id, user, refreshAll],
  );

  // Actualizar estado de platillo
  const updateDishStatus = useCallback(
    async (dishId: string, status: DishOrder["status"]) => {
      try {
        const response = await orderService.updateDishStatus(dishId, status);

        if (response.success) {
          await loadDishOrders();
        } else {
          throw new Error(
            response.error?.message ||
              "Error al actualizar estado del platillo",
          );
        }
      } catch (error) {
        console.error("Error updating dish status:", error);
        throw error;
      }
    },
    [loadDishOrders],
  );

  return (
    <TableContext.Provider
      value={{
        state,
        isSocketConnected,
        setTableNumber,
        loadTableData,
        loadOrder,
        loadDishOrders,
        loadActiveUsers,
        loadSplitPaymentStatus,
        refreshAll,
        processPayment,
        payDishOrder,
        payTableAmount,
        initializeSplitBill,
        paySplitAmount,
        updateDishStatus,
      }}
    >
      {children}
    </TableContext.Provider>
  );
}

export function useTable() {
  const context = useContext(TableContext);
  if (!context) {
    throw new Error("useTable must be used within a TableProvider");
  }
  return context;
}
