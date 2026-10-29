"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { io, Socket } from "socket.io-client";
import { useGuest } from "./GuestContext";
import { useAuth } from "./AuthContext";
import { useRestaurant } from "./RestaurantContext";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  joinTable: (tableNumber: string) => void;
  leaveTable: (tableNumber: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

// Socket.IO necesita la URL base sin /api
const getSocketUrl = () => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  // Remover /api si está presente al final
  return apiUrl.replace(/\/api\/?$/, "");
};
const SOCKET_URL = getSocketUrl();

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const { guestId, guestName, isGuest } = useGuest();
  const { restaurantId, branchNumber } = useRestaurant();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const currentTableRoom = useRef<string | null>(null);

  // Inicializar socket cuando hay credenciales disponibles
  useEffect(() => {
    // Esperar a que auth cargue
    if (authLoading) return;

    // Necesitamos guestId (invitado) o user (autenticado)
    const hasCredentials = isGuest ? !!guestId : !!user;

    if (!hasCredentials) {
      // Sin credenciales, desconectar si hay socket
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // Si ya hay un socket conectado, no crear otro
    if (socketRef.current?.connected) {
      return;
    }

    const initSocket = async () => {
      try {
        // Preparar auth según tipo de usuario
        const authPayload: Record<string, unknown> = {
          clientType: "flexbill",
        };

        if (isGuest && guestId) {
          // Usuario invitado
          authPayload.guestId = guestId;
          authPayload.guestName = guestName || "Invitado";
        } else if (user) {
          // Usuario autenticado - obtener token de Supabase
          const token = localStorage.getItem("even-auth-token");
          if (token) {
            authPayload.token = token;
          } else {
            // Fallback a guest si no hay token
            authPayload.guestId = guestId || `guest-${Date.now()}`;
            authPayload.guestName = guestName || "Invitado";
          }
        }

        const newSocket = io(SOCKET_URL, {
          auth: authPayload,
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
        });

        newSocket.on("connect", () => {
          setIsConnected(true);

          // Reconectar a la sala de mesa si estaba en una
          if (currentTableRoom.current) {
            const [, restId, branch, table] =
              currentTableRoom.current.split(":");
            newSocket.emit("join:table", {
              restaurantId: restId,
              branchNumber: branch,
              tableNumber: table,
            });
          }
        });

        newSocket.on("disconnect", (reason) => {
          setIsConnected(false);
        });

        newSocket.on("table:joined", (data) => {
          currentTableRoom.current = data.roomName;
        });

        newSocket.on("table:left", (data) => {
          currentTableRoom.current = null;
        });

        newSocket.on("table:user-joined", (data) => {});

        newSocket.on("table:user-left", (data) => {});

        newSocket.on("table:error", (error) => {
          console.error("⚠️ Table socket error:", error);
        });

        newSocket.on("connect_error", (error) => {
          console.error("❌ FlexBill Socket connect error:", error.message);
          setIsConnected(false);
        });

        socketRef.current = newSocket;
        setSocket(newSocket);
      } catch (error) {
        console.error("❌ Error initializing FlexBill socket:", error);
      }
    };

    initSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [authLoading, user, isGuest, guestId, guestName]);

  const joinTable = useCallback(
    (tableNumber: string) => {
      if (socketRef.current && isConnected && restaurantId) {
        socketRef.current.emit("join:table", {
          restaurantId: restaurantId.toString(),
          branchNumber: branchNumber?.toString() || "main",
          tableNumber,
        });
      }
    },
    [isConnected, restaurantId, branchNumber],
  );

  const leaveTable = useCallback(
    (tableNumber: string) => {
      if (socketRef.current && isConnected && restaurantId) {
        socketRef.current.emit("leave:table", {
          restaurantId: restaurantId.toString(),
          branchNumber: branchNumber?.toString() || "main",
          tableNumber,
        });
        currentTableRoom.current = null;
      }
    },
    [isConnected, restaurantId, branchNumber],
  );

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        joinTable,
        leaveTable,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocketContext() {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error("useSocketContext must be used within a SocketProvider");
  }
  return context;
}
