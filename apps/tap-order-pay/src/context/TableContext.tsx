"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  ReactNode,
} from "react";

// Importar tipos
import { TapOrder } from "@/services/taporders.service";

// Estado de la mesa con tap-orders (SIN carrito - ahora está en CartContext)
interface TableState {
  tableNumber: string;
  tapOrders: TapOrder[];
  isLoading: boolean;
  error: string | null;
}

// Acciones para el sistema de tap-orders (SIN acciones de carrito)
type TableAction =
  | { type: "SET_TABLE_NUMBER"; payload: string }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_TAP_ORDERS"; payload: TapOrder[] };

// Estado inicial
const initialState: TableState = {
  tableNumber: "",
  tapOrders: [],
  isLoading: false,
  error: null,
};

// Reducer para el sistema de tap-orders (SIN lógica de carrito)
function tableReducer(state: TableState, action: TableAction): TableState {
  switch (action.type) {
    case "SET_TABLE_NUMBER":
      return {
        ...state,
        tableNumber: action.payload,
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

    case "SET_TAP_ORDERS":
      return {
        ...state,
        tapOrders: Array.isArray(action.payload) ? action.payload : [],
        isLoading: false,
        error: null,
      };

    default:
      return state;
  }
}

// Contexto de la mesa
const TableContext = createContext<{
  state: TableState;
  dispatch: React.Dispatch<TableAction>;
} | null>(null);

// Provider del contexto de mesa
export function TableProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(tableReducer, initialState);

  return (
    <TableContext.Provider
      value={{
        state,
        dispatch,
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
