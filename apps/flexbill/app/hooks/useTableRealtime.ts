"use client";

import { useEffect, useRef } from "react";
import { useSocketContext } from "../context/SocketContext";
import type {
  DishOrder,
  TableSummary,
  ActiveUser,
  EqualSplitSelection,
} from "../services/table.service";

// Payloads de eventos del servidor
interface DishCreatedPayload {
  dish: DishOrder;
  timestamp: string;
}

interface DishStatusPayload {
  dishId: string;
  status: DishOrder["status"];
  timestamp: string;
}

interface DishPaidPayload {
  dishId: string;
  paidBy: string;
  timestamp: string;
}

interface TableSummaryPayload {
  summary: TableSummary;
  timestamp: string;
}

interface UserJoinedPayload {
  user: {
    id?: string;
    user_id?: string | null;
    guest_id?: string | null;
    guest_name?: string | null;
    table_number?: string;
    restaurant_id?: number;
    branch_number?: number;
    total_paid_individual?: number;
    total_paid_amount?: number;
    updated_at?: string;
  };
  timestamp: string;
}

interface UserLeftPayload {
  userId?: string;
  guestId?: string;
  tableNumber?: string;
}

interface EqualSplitUpdatePayload {
  selection: EqualSplitSelection | null;
  timestamp: string;
}

interface UseTableRealtimeOptions {
  tableNumber: string | null;
  enabled?: boolean;
  onDishCreated?: (dish: DishOrder) => void;
  onDishStatusChanged?: (dishId: string, status: DishOrder["status"]) => void;
  onDishPaid?: (dishId: string, paidBy: string) => void;
  onSummaryUpdate?: (summary: TableSummary) => void;
  onUserJoined?: (user: ActiveUser) => void;
  onUserLeft?: (userId: string) => void;
  onFullRefresh?: () => void;
  onEqualSplitUpdate?: (selection: EqualSplitSelection | null) => void;
}

export function useTableRealtime(options: UseTableRealtimeOptions) {
  const {
    tableNumber,
    enabled = true,
    onDishCreated,
    onDishStatusChanged,
    onDishPaid,
    onSummaryUpdate,
    onUserJoined,
    onUserLeft,
    onFullRefresh,
    onEqualSplitUpdate,
  } = options;

  const { socket, isConnected, joinTable, leaveTable } = useSocketContext();
  const previousTableNumber = useRef<string | null>(null);

  // Unirse/abandonar sala de mesa
  useEffect(() => {
    if (!enabled || !isConnected || !tableNumber) return;

    // Si cambio el numero de mesa, abandonar la anterior
    if (
      previousTableNumber.current &&
      previousTableNumber.current !== tableNumber
    ) {
      leaveTable(previousTableNumber.current);
    }

    // Unirse a la nueva mesa
    joinTable(tableNumber);
    previousTableNumber.current = tableNumber;

    return () => {
      if (tableNumber) {
        leaveTable(tableNumber);
      }
    };
  }, [enabled, isConnected, tableNumber, joinTable, leaveTable]);

  // Escuchar eventos del socket
  useEffect(() => {
    if (!socket || !enabled) return;

    const handleDishCreated = (data: DishCreatedPayload) => {
      onDishCreated?.(data.dish);
    };

    const handleDishStatus = (data: DishStatusPayload) => {
      onDishStatusChanged?.(data.dishId, data.status);
    };

    const handleDishPaid = (data: DishPaidPayload) => {
      onDishPaid?.(data.dishId, data.paidBy);
    };

    const handleSummaryUpdate = (data: TableSummaryPayload) => {
      onSummaryUpdate?.(data.summary);
    };

    const handleUserJoined = (data: UserJoinedPayload) => {
      // El servidor emite la fila real de active_table_users bajo `user`
      const joined = data.user;
      if (!joined) return;

      const user: ActiveUser = {
        id: joined.id ?? "",
        restaurant_id: joined.restaurant_id ?? 0,
        branch_number: joined.branch_number ?? 0,
        table_number: joined.table_number ?? "",
        user_id: joined.user_id ?? undefined,
        guest_id: joined.guest_id ?? undefined,
        guest_name: joined.guest_name ?? "",
        total_paid_individual: joined.total_paid_individual ?? 0,
        total_paid_amount: joined.total_paid_amount ?? 0,
        updated_at: joined.updated_at ?? new Date().toISOString(),
      };
      onUserJoined?.(user);
    };

    const handleUserLeft = (data: UserLeftPayload) => {
      const userId = data.userId || data.guestId || "";
      onUserLeft?.(userId);
    };

    const handleFullRefresh = () => {
      onFullRefresh?.();
    };

    const handleEqualSplitUpdate = (data: EqualSplitUpdatePayload) => {
      onEqualSplitUpdate?.(data.selection);
    };

    // Registrar listeners
    socket.on("table:dish-created", handleDishCreated);
    socket.on("table:dish-status", handleDishStatus);
    socket.on("table:dish-paid", handleDishPaid);
    socket.on("table:summary-update", handleSummaryUpdate);
    socket.on("table:user-joined", handleUserJoined);
    socket.on("table:user-left", handleUserLeft);
    socket.on("table:full-refresh", handleFullRefresh);
    socket.on("table:equal-split-update", handleEqualSplitUpdate);

    return () => {
      // Limpiar listeners
      socket.off("table:dish-created", handleDishCreated);
      socket.off("table:dish-status", handleDishStatus);
      socket.off("table:dish-paid", handleDishPaid);
      socket.off("table:summary-update", handleSummaryUpdate);
      socket.off("table:user-joined", handleUserJoined);
      socket.off("table:user-left", handleUserLeft);
      socket.off("table:full-refresh", handleFullRefresh);
      socket.off("table:equal-split-update", handleEqualSplitUpdate);
    };
  }, [
    socket,
    enabled,
    onDishCreated,
    onDishStatusChanged,
    onDishPaid,
    onSummaryUpdate,
    onUserJoined,
    onUserLeft,
    onFullRefresh,
    onEqualSplitUpdate,
  ]);

  return {
    isSocketConnected: isConnected,
  };
}
