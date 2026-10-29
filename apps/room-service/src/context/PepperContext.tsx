"use client";

import { createContext, useContext, useState, useEffect, useRef } from "react";
import { useRestaurant } from "./RestaurantContext";

interface PepperMessage {
  id: string;
  role: "user" | "pepper";
  content: string;
}

interface PepperContextValue {
  messages: PepperMessage[];
  setMessages: React.Dispatch<React.SetStateAction<PepperMessage[]>>;
  sessionId: string | null;
  setSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  hasStartedChat: boolean;
  setHasStartedChat: React.Dispatch<React.SetStateAction<boolean>>;
}

const PepperContext = createContext<PepperContextValue | null>(null);

export function PepperProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<PepperMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hasStartedChat, setHasStartedChat] = useState(false);

  const { restaurantId } = useRestaurant();
  const prevRestaurantId = useRef(restaurantId);

  useEffect(() => {
    if (
      prevRestaurantId.current !== null &&
      prevRestaurantId.current !== restaurantId
    ) {
      setMessages([]);
      setSessionId(null);
      setHasStartedChat(false);
    }
    prevRestaurantId.current = restaurantId;
  }, [restaurantId]);

  return (
    <PepperContext.Provider
      value={{
        messages,
        setMessages,
        sessionId,
        setSessionId,
        hasStartedChat,
        setHasStartedChat,
      }}
    >
      {children}
    </PepperContext.Provider>
  );
}

export function usePepper() {
  const ctx = useContext(PepperContext);
  if (!ctx) throw new Error("usePepper must be used inside PepperProvider");
  return ctx;
}
