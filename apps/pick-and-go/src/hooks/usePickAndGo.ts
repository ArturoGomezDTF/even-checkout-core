import { useState, useCallback } from "react";
import {
  pickAndGoService,
  PickAndGoOrder,
  CreateOrderRequest,
  AddItemRequest,
} from "@/services/pickandgo.service";

// Hook personalizado para gestionar el estado y operaciones de Pick & Go
export const usePickAndGo = () => {
  // Estados del hook
  const [currentOrder, setCurrentOrder] = useState<PickAndGoOrder | null>(null);
  const [userOrders, setUserOrders] = useState<PickAndGoOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Crear nueva orden Pick & Go
  const createOrder = useCallback(async (orderData: CreateOrderRequest) => {
    try {
      setLoading(true);
      setError(null);

      const result = await pickAndGoService.createOrder(orderData);

      if (result.success && "data" in result && result.data) {
        setCurrentOrder(result.data);
        //console.log("✅ Order created in hook:", result.data.id);
        return result.data;
      } else {
        throw new Error("Failed to create order");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create order";
      setError(errorMessage);
      console.error("💥 Error creating order in hook:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Obtener orden por ID
  const getOrder = useCallback(async (orderId: string) => {
    try {
      setLoading(true);
      setError(null);

      const result = await pickAndGoService.getOrder(orderId);

      if (result.success && "data" in result && result.data) {
        setCurrentOrder(result.data);
        //console.log("✅ Order retrieved in hook:", result.data.id);
        return result.data;
      } else {
        throw new Error("Failed to get order");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to get order";
      setError(errorMessage);
      console.error("💥 Error getting order in hook:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Obtener órdenes del usuario
  const getUserOrders = useCallback(
    async (
      userId: string,
      filters?: {
        order_status?: string;
        payment_status?: string;
        limit?: number;
      },
    ) => {
      try {
        setLoading(true);
        setError(null);

        const result = await pickAndGoService.getUserOrders(userId, filters);

        if (result.success && "data" in result && result.data) {
          setUserOrders(result.data);
          //console.log("✅ User orders retrieved in hook:", result.data.length);
          return result.data;
        } else {
          throw new Error("Failed to get user orders");
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to get user orders";
        setError(errorMessage);
        console.error("💥 Error getting user orders in hook:", err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Agregar item a la orden actual
  const addItemToOrder = useCallback(
    async (itemData: AddItemRequest) => {
      if (!currentOrder) {
        throw new Error("No active order to add items to");
      }

      try {
        setLoading(true);
        setError(null);

        const result = await pickAndGoService.addItemToOrder(
          currentOrder.id,
          itemData,
        );

        if (result.success && "data" in result && result.data) {
          // Actualizar la orden actual con el nuevo item
          setCurrentOrder((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              items: [...(prev.items || []), result.data!],
              total_amount:
                prev.total_amount +
                itemData.price * itemData.quantity +
                (itemData.extra_price || 0),
            };
          });

          //console.log("✅ Item added to order in hook:", result.data.id);
          return result.data;
        } else {
          throw new Error("Failed to add item to order");
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to add item to order";
        setError(errorMessage);
        console.error("💥 Error adding item to order in hook:", err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [currentOrder],
  );

  // Actualizar estado de la orden actual
  const updateOrderStatus = useCallback(
    async (orderStatus: string, prepMetadata?: Record<string, any>) => {
      if (!currentOrder) {
        throw new Error("No active order to update");
      }

      try {
        setLoading(true);
        setError(null);

        const result = await pickAndGoService.updateOrderStatus(
          currentOrder.id,
          orderStatus,
          prepMetadata,
        );

        if (result.success && "data" in result && result.data) {
          setCurrentOrder(result.data);
          /*console.log(
            "✅ Order status updated in hook:",
            result.data.order_status,
          );*/
          return result.data;
        } else {
          throw new Error("Failed to update order status");
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to update order status";
        setError(errorMessage);
        console.error("💥 Error updating order status in hook:", err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [currentOrder],
  );

  // Actualizar estado de pago de la orden actual
  const updatePaymentStatus = useCallback(
    async (paymentStatus: "pending" | "paid") => {
      if (!currentOrder) {
        throw new Error("No active order to update payment");
      }

      try {
        setLoading(true);
        setError(null);

        const result = await pickAndGoService.updatePaymentStatus(
          currentOrder.id,
          paymentStatus,
        );

        if (result.success && "data" in result && result.data) {
          setCurrentOrder(result.data);
          /*console.log(
            "✅ Payment status updated in hook:",
            result.data.payment_status,
          );*/
          return result.data;
        } else {
          throw new Error("Failed to update payment status");
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to update payment status";
        setError(errorMessage);
        console.error("💥 Error updating payment status in hook:", err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [currentOrder],
  );

  // Calcular tiempo estimado de preparación
  const estimatePrepTime = useCallback(
    async (
      items: Array<{ item: string; quantity: number }>,
      restaurantId?: number,
    ) => {
      try {
        setLoading(true);
        setError(null);

        const result = await pickAndGoService.estimatePrepTime(
          items,
          restaurantId,
        );

        if (result.success && "data" in result && result.data) {
          /*console.log(
            "✅ Prep time estimated in hook:",
            result.data.estimated_minutes,
            "minutes",
          );*/
          return result.data;
        } else {
          throw new Error("Failed to estimate prep time");
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to estimate prep time";
        setError(errorMessage);
        console.error("💥 Error estimating prep time in hook:", err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Limpiar orden actual
  const clearCurrentOrder = useCallback(() => {
    setCurrentOrder(null);
    setError(null);
    //console.log("🧹 Current order cleared");
  }, []);

  // Limpiar errores
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Refrescar orden actual
  const refreshCurrentOrder = useCallback(async () => {
    if (!currentOrder) return;

    try {
      await getOrder(currentOrder.id);
    } catch (err) {
      console.error("💥 Error refreshing current order:", err);
    }
  }, [currentOrder, getOrder]);

  // Estados calculados
  const hasActiveOrder = currentOrder !== null;
  const currentOrderItems = currentOrder?.items || [];
  const currentOrderTotal = currentOrder?.total_amount || 0;
  const currentOrderItemCount = currentOrderItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  return {
    // Estados
    currentOrder,
    userOrders,
    loading,
    error,
    hasActiveOrder,
    currentOrderItems,
    currentOrderTotal,
    currentOrderItemCount,

    // Acciones
    createOrder,
    getOrder,
    getUserOrders,
    addItemToOrder,
    updateOrderStatus,
    updatePaymentStatus,
    estimatePrepTime,
    clearCurrentOrder,
    clearError,
    refreshCurrentOrder,
  };
};
