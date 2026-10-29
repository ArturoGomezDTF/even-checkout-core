"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  Suspense,
} from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "./AuthContext";

interface GuestContextType {
  isGuest: boolean;
  guestId: string | null;
  roomNumber: string | null;
  guestName: string | null;
  setAsGuest: (roomNumber?: string) => void;
  setAsAuthenticated: (userId: string) => void;
  clearGuestSession: () => void;
  setGuestName: (name: string) => void;
}

const GuestContext = createContext<GuestContextType | undefined>(undefined);

interface GuestProviderProps {
  children: ReactNode;
}

function GuestProviderInternal({ children }: GuestProviderProps) {
  const [isGuest, setIsGuest] = useState<boolean>(false);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [roomNumber, setRoomNumber] = useState<string | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading } = useAuth();

  // Note: Guest orders/cart migration is handled by CartContext
  // using cartApi.migrateGuestCart() which properly migrates the cart
  // when user authenticates

  // Smart initialization: Auto-detect guest vs registered user context
  useEffect(() => {
    if (isLoading) return; // Wait for auth to load

    const roomParam = searchParams?.get("room");

    if (user) {
      // User is registered - clear any guest session
      if (isGuest) {
        ("🔐 Registered user detected - clearing guest session");
        clearGuestSession();
      }
    } else {
      // No registered user - check if we should be guest

      const storedGuestId = localStorage.getItem("even-guest-id");
      const storedRoomNumber = localStorage.getItem("even-room-number");

      // Priority 1: If URL has room parameter, use it (even if restoring session)
      if (roomParam) {
        // Use existing guest ID if available, or create new one
        const guestIdToUse = storedGuestId || generateGuestId();

        // Store to localStorage FIRST to ensure persistence
        localStorage.setItem("even-room-number", roomParam);
        localStorage.setItem("even-guest-id", guestIdToUse);

        setIsGuest(true);
        setGuestId(guestIdToUse);
        setRoomNumber(roomParam);

        return;
      }

      // Priority 2: Restore existing guest session (only if no room param)
      if (storedGuestId && storedRoomNumber) {
        const storedGuestName = localStorage.getItem("even-guest-name");
        setIsGuest(true);
        setGuestId(storedGuestId);
        setRoomNumber(storedRoomNumber);
        setGuestName(storedGuestName);

        return;
      }

      // Priority 3: No room param and no valid stored session - stay as non-guest
    }
  }, [isLoading, user, searchParams]);

  const setAsGuest = (newRoomNumber?: string) => {
    // Generate guest ID through apiService (which handles localStorage)
    const generatedGuestId = generateGuestId();

    // Ensure localStorage is updated immediately
    localStorage.setItem("even-guest-id", generatedGuestId);

    setIsGuest(true);
    setGuestId(generatedGuestId);

    if (newRoomNumber) {
      localStorage.setItem("even-room-number", newRoomNumber);
      setRoomNumber(newRoomNumber);
    }
  };

  const setAsAuthenticated = (userId: string) => {
    // Clear guest session when user authenticates
    clearGuestSession();
  };

  const clearGuestSession = () => {
    // NO llamar a apiService.clearGuestSession() porque elimina el guest_id
    // El guest_id debe preservarse para la migración del carrito en CartContext
    setIsGuest(false);
    setGuestId(null);
    setRoomNumber(null);
    setGuestName(null);
    localStorage.removeItem("even-guest-name");
    // NO eliminar even-guest-id aquí - lo necesitamos para migrar el carrito
    // El CartContext lo eliminará después de la migración exitosa
  };

  const setGuestNameHandler = (name: string) => {
    setGuestName(name);
    localStorage.setItem("even-guest-name", name);
  };

  // Helper function to generate guest ID
  const generateGuestId = (): string => {
    if (typeof window !== "undefined") {
      let guestId = localStorage.getItem("even-guest-id");

      if (!guestId) {
        guestId = `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem("even-guest-id", guestId);
      }

      return guestId;
    }
    return `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  const value: GuestContextType = {
    isGuest,
    guestId,
    roomNumber,
    guestName,
    setAsGuest,
    setAsAuthenticated,
    clearGuestSession,
    setGuestName: setGuestNameHandler,
  };

  return (
    <GuestContext.Provider value={value}>{children}</GuestContext.Provider>
  );
}

export function GuestProvider({ children }: GuestProviderProps) {
  return (
    <Suspense fallback={<div style={{ display: "none" }} />}>
      <GuestProviderInternal>{children}</GuestProviderInternal>
    </Suspense>
  );
}

// Custom hook to use guest context
export function useGuest(): GuestContextType {
  const context = useContext(GuestContext);
  if (context === undefined) {
    throw new Error("useGuest must be used within a GuestProvider");
  }
  return context;
}

// Helper hook to check if user is guest
export function useIsGuest(): boolean {
  const { isGuest } = useGuest();
  return isGuest;
}

// Helper hook to get guest info
export function useGuestInfo(): {
  guestId: string | null;
  roomNumber: string | null;
} {
  const { guestId, roomNumber } = useGuest();
  return { guestId, roomNumber };
}
