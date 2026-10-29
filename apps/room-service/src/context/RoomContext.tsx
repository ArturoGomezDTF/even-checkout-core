"use client";

import React, { createContext, useContext, useReducer, ReactNode } from "react";

// Importar tipos
import { RoomOrder } from "@/services/roomorders.service";

// Estado de la habitación con room-orders (SIN carrito - ahora está en CartContext)
interface RoomState {
  roomNumber: string;
  roomOrders: RoomOrder[];
  isLoading: boolean;
  error: string | null;
}

// Acciones para el sistema de room-orders (SIN acciones de carrito)
type RoomAction =
  | { type: "SET_ROOM_NUMBER"; payload: string }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_ROOM_ORDERS"; payload: RoomOrder[] };

// Estado inicial
const initialState: RoomState = {
  roomNumber: "",
  roomOrders: [],
  isLoading: false,
  error: null,
};

// Reducer para el sistema de tap-orders (SIN lógica de carrito)
function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case "SET_ROOM_NUMBER":
      return {
        ...state,
        roomNumber: action.payload,
      };

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

    case "SET_ROOM_ORDERS":
      return {
        ...state,
        roomOrders: Array.isArray(action.payload) ? action.payload : [],
        isLoading: false,
        error: null,
      };

    default:
      return state;
  }
}

// Contexto de la mesa
const RoomContext = createContext<{
  state: RoomState;
  dispatch: React.Dispatch<RoomAction>;
} | null>(null);

// Provider del contexto de mesa
export function RoomProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(roomReducer, initialState);

  return (
    <RoomContext.Provider
      value={{
        state,
        dispatch,
      }}
    >
      {children}
    </RoomContext.Provider>
  );
}

// Hook personalizado para usar el contexto de mesa
export function useRoom() {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error("useRoom must be used within a RoomProvider");
  }
  return context;
}
