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
  tableNumber: string | null;
  guestName: string | null;
  setAsGuest: (tableNumber?: string) => void;
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
  const [tableNumber, setTableNumber] = useState<string | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading } = useAuth();

  // Note: Guest orders/cart migration is handled by CartContext
  // using cartApi.migrateGuestCart() which properly migrates the cart
  // when user authenticates

  // Smart initialization: Auto-detect guest vs registered user context
  useEffect(() => {
    if (isLoading) return; // Wait for auth to load

    const tableParam = searchParams?.get("table");

    if (user) {
      // User is registered - clear any guest session
      if (isGuest) {
        clearGuestSession();
      }
    } else {
      // No registered user - ensure guest ID exists

      const storedGuestId = localStorage.getItem("even-guest-id");
      const storedTableNumber = localStorage.getItem("even-table-number");

      // Priority 1: If URL has table parameter, use it (even if restoring session)
      if (tableParam) {
        // Use existing guest ID if available, or create new one
        const guestIdToUse = storedGuestId || generateGuestId();

        // Store to localStorage FIRST to ensure persistence
        localStorage.setItem("even-table-number", tableParam);
        localStorage.setItem("even-guest-id", guestIdToUse);

        setIsGuest(true);
        setGuestId(guestIdToUse);
        setTableNumber(tableParam);
        return;
      }

      // Priority 2: Restore existing guest session (only if no table param)
      if (storedGuestId && storedTableNumber) {
        const storedGuestName = localStorage.getItem("even-guest-name");
        setIsGuest(true);
        setGuestId(storedGuestId);
        setTableNumber(storedTableNumber);
        setGuestName(storedGuestName);
        return;
      }

      // Priority 3: No registered user and no existing session - create guest ID automatically
      // This ensures we always have a guest_id for tracking purposes
      if (!storedGuestId) {
        const newGuestId = generateGuestId();
        setIsGuest(true);
        setGuestId(newGuestId);
      }
    }
  }, [isLoading, user, searchParams]);

  const setAsGuest = (newTableNumber?: string) => {
    // Generate guest ID through apiService (which handles localStorage)
    const generatedGuestId = generateGuestId();

    // Ensure localStorage is updated immediately
    localStorage.setItem("even-guest-id", generatedGuestId);

    setIsGuest(true);
    setGuestId(generatedGuestId);

    if (newTableNumber) {
      localStorage.setItem("even-table-number", newTableNumber);
      setTableNumber(newTableNumber);
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
    setTableNumber(null);
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
    tableNumber,
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
  tableNumber: string | null;
} {
  const { guestId, tableNumber } = useGuest();
  return { guestId, tableNumber };
}
