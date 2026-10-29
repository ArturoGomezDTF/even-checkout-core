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
  joinTapPay: (tableNumber: string) => void;
  leaveTapPay: (tableNumber: string) => void;
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
  const { params } = useRestaurant();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const currentTapPayRoom = useRef<string | null>(null);

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
          clientType: "tap-pay",
        };

        if (isGuest && guestId) {
          // Usuario invitado
          authPayload.guestId = guestId;
          authPayload.guestName = guestName || "Invitado";
        } else if (user) {
          // Usuario autenticado - obtener token de localStorage
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

          // Reconectar a la sala de tap-pay si estaba en una
          if (currentTapPayRoom.current) {
            const [, restId, branch, table] =
              currentTapPayRoom.current.split(":");
            newSocket.emit("join:tappay", {
              restaurantId: restId,
              branchNumber: branch,
              tableNumber: table,
            });
          }
        });

        newSocket.on("disconnect", (reason) => {
          setIsConnected(false);
        });

        newSocket.on("tappay:joined", (data) => {
          currentTapPayRoom.current = data.roomName;
        });

        newSocket.on("tappay:left", (data) => {
          currentTapPayRoom.current = null;
        });

        newSocket.on("tappay:error", (error) => {
          console.error("⚠️ TapPay socket error:", error);
        });

        newSocket.on("connect_error", (error) => {
          console.error("❌ TapPay Socket connect error:", error.message);
          setIsConnected(false);
        });

        socketRef.current = newSocket;
        setSocket(newSocket);
      } catch (error) {
        console.error("❌ Error initializing TapPay socket:", error);
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

  const joinTapPay = useCallback(
    (tableNumber: string) => {
      if (socketRef.current && isConnected && params?.restaurantId) {
        socketRef.current.emit("join:tappay", {
          restaurantId: params.restaurantId,
          branchNumber: params.branchNumber || "1",
          tableNumber,
        });
      }
    },
    [isConnected, params?.restaurantId, params?.branchNumber],
  );

  const leaveTapPay = useCallback(
    (tableNumber: string) => {
      if (socketRef.current && isConnected && params?.restaurantId) {
        socketRef.current.emit("leave:tappay", {
          restaurantId: params.restaurantId,
          branchNumber: params.branchNumber || "1",
          tableNumber,
        });
        currentTapPayRoom.current = null;
      }
    },
    [isConnected, params?.restaurantId, params?.branchNumber],
  );

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        joinTapPay,
        leaveTapPay,
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
