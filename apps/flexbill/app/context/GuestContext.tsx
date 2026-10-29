"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  Suspense,
} from "react";
import { apiService } from "../utils/api";
import { useSearchParams } from "next/navigation";
import { authService } from "../services/auth.service";
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
  const [hasLinkedOrders, setHasLinkedOrders] = useState<boolean>(false);
  const searchParams = useSearchParams();

  // Use AuthContext directly instead of maintaining separate user state
  const { user, profile, isLoading: authLoading } = useAuth();
  const isLoaded = !authLoading;

  // Consolidated effect: Handle authentication state and guest/table context
  useEffect(() => {
    if (!isLoaded) {
      return; // CRITICAL: Wait for auth to load - THIS PREVENTS RACE CONDITIONS
    }

    const tableParam = searchParams?.get("table");
    const sessionParam = searchParams?.get("session");
    const storedGuestId = localStorage.getItem("even-guest-id");
    const storedTableNumber = localStorage.getItem("even-table-number");
    const storedRestaurantId = localStorage.getItem("even-restaurant-id");

    if (user) {
      // PRIORITY 1: User is authenticated

      // Step 1: Link guest orders if they exist and haven't been linked yet
      // IMPORTANTE: Esperar a que el profile cargue para tener el nombre correcto
      if (storedGuestId && user?.id && !hasLinkedOrders) {
        // Si el usuario está autenticado pero el perfil no ha cargado, esperar
        if (!profile?.firstName) {
          return; // Esperar a que el profile cargue
        }

        const userName =
          profile.firstName && profile.lastName
            ? `${profile.firstName} ${profile.lastName}`
            : profile.firstName;

        apiService
          .linkGuestOrdersToUser(
            storedGuestId,
            user.id,
            storedTableNumber || undefined,
            storedRestaurantId || undefined,
            userName,
          )
          .then((response) => {
            if (response.success) {
              setHasLinkedOrders(true);
              window.dispatchEvent(new CustomEvent("even:guestOrdersLinked"));
            } else {
              console.error("❌ Failed to link guest orders:", response.error);
            }
          })
          .catch((error) => {
            console.error("❌ Error linking guest orders:", error);
          });
      }

      // Step 2: Clear guest session but preserve table context
      if (isGuest) {
        clearGuestSession();
      }

      // Step 3: Set table context for authenticated user
      if (tableParam) {
        localStorage.setItem("even-table-number", tableParam);
        if (sessionParam) {
          localStorage.setItem("even-table-session", sessionParam);
        }
        apiService.setTableNumber(tableParam);
        setTableNumber(tableParam);
      }

      // Ensure we're not in guest mode
      setIsGuest(false);
      setGuestId(null);

      return; // Exit early for authenticated users
    }

    // PRIORITY 2: No authenticated user - handle guest session
    // Priority 2a: If URL has table parameter, set up guest session
    if (tableParam) {
      // Use existing guest ID if available, or create new one
      const guestIdToUse = storedGuestId || generateGuestId();

      // Store to localStorage FIRST to ensure persistence
      localStorage.setItem("even-table-number", tableParam);
      localStorage.setItem("even-guest-id", guestIdToUse);
      if (sessionParam) {
        localStorage.setItem("even-table-session", sessionParam);
      }

      // Restore guest name from localStorage if available
      const storedGuestName = localStorage.getItem("even-guest-name");

      setIsGuest(true);
      setGuestId(guestIdToUse);
      setTableNumber(tableParam);
      setGuestName(storedGuestName);
      apiService.setTableNumber(tableParam);
      return;
    }

    // Priority 2b: Restore existing guest session (only if no table param)
    if (storedGuestId && storedTableNumber) {
      const storedGuestName = localStorage.getItem("even-guest-name");
      setIsGuest(true);
      setGuestId(storedGuestId);
      setTableNumber(storedTableNumber);
      setGuestName(storedGuestName);
      return;
    }

    // Priority 3: No table param and no valid stored session - stay as non-guest
  }, [isLoaded, user, profile, searchParams, hasLinkedOrders]);

  const setAsGuest = (newTableNumber?: string) => {
    // Generate guest ID through apiService (which handles localStorage)
    const generatedGuestId = generateGuestId();

    // Ensure localStorage is updated immediately
    localStorage.setItem("even-guest-id", generatedGuestId);

    setIsGuest(true);
    setGuestId(generatedGuestId);

    if (newTableNumber) {
      localStorage.setItem("even-table-number", newTableNumber);
      apiService.setTableNumber(newTableNumber);
      setTableNumber(newTableNumber);
    }
  };

  const setAsAuthenticated = (userId: string) => {
    // Get auth token and set it in ApiService
    const currentUser = authService.getCurrentUser();
    if (currentUser?.token) {
      apiService.setAuthToken(currentUser.token);
    }

    // Clear guest session when user authenticates
    clearGuestSession();
  };

  const clearGuestSession = () => {
    // IMPORTANT: DO NOT remove guest-id immediately
    // It's needed for payment methods migration which happens after cart migration
    // The guest-id will be removed by PaymentContext after all migrations complete

    localStorage.removeItem("even-guest-name");

    // Only clear table context if user is not authenticated
    if (!user) {
      localStorage.removeItem("even-table-number");
      localStorage.removeItem("even-restaurant-id");
      setTableNumber(null);
    }

    // Immediately clear guest state
    setIsGuest(false);
    setGuestId(null);
    setGuestName(null);
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
