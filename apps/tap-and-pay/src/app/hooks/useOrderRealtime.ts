"use client";

import { useEffect, useRef } from "react";
import { useSocketContext } from "../context/SocketContext";
import type { TapPayOrder, DishOrder } from "../types/order";

// Payloads de eventos del servidor
interface OrderCreatedPayload {
  order: TapPayOrder;
  timestamp: string;
}

interface PaymentReceivedPayload {
  orderId: string;
  amount: number;
  paymentType: string;
  userId?: string;
  guestName?: string;
  timestamp: string;
}

interface DishStatusPayload {
  dishId: string;
  status: DishOrder["status"];
  timestamp: string;
}

interface OrderStatusPayload {
  orderId: string;
  status: TapPayOrder["order_status"];
  timestamp: string;
}

interface OrderCompletedPayload {
  order: TapPayOrder;
  timestamp: string;
}

interface UseOrderRealtimeOptions {
  tableNumber: string | null;
  enabled?: boolean;
  onOrderCreated?: (order: TapPayOrder) => void;
  onPaymentReceived?: (paymentInfo: PaymentReceivedPayload) => void;
  onDishStatusChanged?: (dishId: string, status: DishOrder["status"]) => void;
  onOrderStatusChanged?: (
    orderId: string,
    status: TapPayOrder["order_status"],
  ) => void;
  onOrderCompleted?: (order: TapPayOrder) => void;
  onFullRefresh?: () => void;
}

export function useOrderRealtime(options: UseOrderRealtimeOptions) {
  const {
    tableNumber,
    enabled = true,
    onOrderCreated,
    onPaymentReceived,
    onDishStatusChanged,
    onOrderStatusChanged,
    onOrderCompleted,
    onFullRefresh,
  } = options;

  const { socket, isConnected, joinTapPay, leaveTapPay } = useSocketContext();
  const previousTableNumber = useRef<string | null>(null);

  // Unirse/abandonar sala de tap-pay
  useEffect(() => {
    if (!enabled || !isConnected || !tableNumber) return;

    // Si cambió el número de mesa, abandonar la anterior
    if (
      previousTableNumber.current &&
      previousTableNumber.current !== tableNumber
    ) {
      leaveTapPay(previousTableNumber.current);
    }

    // Unirse a la nueva sala
    joinTapPay(tableNumber);
    previousTableNumber.current = tableNumber;

    return () => {
      if (tableNumber) {
        leaveTapPay(tableNumber);
      }
    };
  }, [enabled, isConnected, tableNumber, joinTapPay, leaveTapPay]);

  // Escuchar eventos del socket
  useEffect(() => {
    if (!socket || !enabled) return;

    const handleOrderCreated = (data: OrderCreatedPayload) => {
      onOrderCreated?.(data.order);
    };

    const handlePaymentReceived = (data: PaymentReceivedPayload) => {
      onPaymentReceived?.(data);
    };

    const handleDishStatus = (data: DishStatusPayload) => {
      onDishStatusChanged?.(data.dishId, data.status);
    };

    const handleOrderStatus = (data: OrderStatusPayload) => {
      onOrderStatusChanged?.(data.orderId, data.status);
    };

    const handleOrderCompleted = (data: OrderCompletedPayload) => {
      onOrderCompleted?.(data.order);
    };

    const handleFullRefresh = () => {
      onFullRefresh?.();
    };

    // Registrar listeners para eventos de tap-pay
    socket.on("tappay:order-created", handleOrderCreated);
    socket.on("tappay:payment-received", handlePaymentReceived);
    socket.on("tappay:dish-status-changed", handleDishStatus);
    socket.on("tappay:order-status-changed", handleOrderStatus);
    socket.on("tappay:order-completed", handleOrderCompleted);
    socket.on("tappay:full-refresh", handleFullRefresh);

    return () => {
      // Limpiar listeners
      socket.off("tappay:order-created", handleOrderCreated);
      socket.off("tappay:payment-received", handlePaymentReceived);
      socket.off("tappay:dish-status-changed", handleDishStatus);
      socket.off("tappay:order-status-changed", handleOrderStatus);
      socket.off("tappay:order-completed", handleOrderCompleted);
      socket.off("tappay:full-refresh", handleFullRefresh);
    };
  }, [
    socket,
    enabled,
    onOrderCreated,
    onPaymentReceived,
    onDishStatusChanged,
    onOrderStatusChanged,
    onOrderCompleted,
    onFullRefresh,
  ]);

  return {
    isSocketConnected: isConnected,
  };
}
