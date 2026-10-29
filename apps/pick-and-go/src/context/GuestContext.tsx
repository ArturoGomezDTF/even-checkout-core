"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  Suspense,
} from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "./AuthContext";

interface GuestContextType {
  isGuest: boolean;
  guestId: string | null;
  restaurantId: number | null;
  branchNumber: number | null;
  guestName: string | null;
  setAsGuest: (restaurantId?: number, branchNumber?: number) => void;
  setAsAuthenticated: (userId: string) => void;
  clearGuestSession: () => void;
  setGuestName: (name: string) => void;
  setRestaurantAndBranch: (restaurantId: number, branchNumber: number) => void;
}

const GuestContext = createContext<GuestContextType | undefined>(undefined);

interface GuestProviderProps {
  children: ReactNode;
}

function GuestProviderInternal({ children }: GuestProviderProps) {
  const [isGuest, setIsGuest] = useState<boolean>(false);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [restaurantId, setRestaurantId] = useState<number | null>(null);
  const [branchNumber, setBranchNumber] = useState<number | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading } = useAuth();

  // Note: Guest orders/cart migration is handled by CartContext
  // using cartService.migrateGuestCart() which properly migrates the cart
  // when user authenticates

  // Smart initialization: Auto-detect guest vs registered user context
  useEffect(() => {
    if (isLoading) return; // Wait for auth to load

    const restaurantParam = searchParams?.get("restaurant");
    const branchParam = searchParams?.get("branch");

    if (user) {
      // User is registered - clear any guest session
      if (isGuest) {
        //console.log("🔐 Registered user detected - clearing guest session");
        clearGuestSession();
      }
    } else {
      // No registered user - check if we should be guest

      const storedGuestId = localStorage.getItem("even-guest-id");
      const storedRestaurantId = localStorage.getItem("even-restaurant-id");
      const storedBranchNumber = localStorage.getItem("even-branch-number");

      // Priority 1: If URL has restaurant/branch parameters, use them
      if (restaurantParam || storedRestaurantId) {
        /*console.log(
          "🏪 Restaurant/branch detected - Setting up guest session"
        );*/

        // Use existing guest ID if available, or create new one
        const guestIdToUse = storedGuestId || generateGuestId();

        const restaurantIdToUse = restaurantParam
          ? parseInt(restaurantParam)
          : storedRestaurantId
            ? parseInt(storedRestaurantId)
            : null;

        const branchNumberToUse = branchParam
          ? parseInt(branchParam)
          : storedBranchNumber
            ? parseInt(storedBranchNumber)
            : null;

        // Store to localStorage FIRST to ensure persistence
        localStorage.setItem("even-guest-id", guestIdToUse);
        if (restaurantIdToUse) {
          localStorage.setItem(
            "even-restaurant-id",
            restaurantIdToUse.toString(),
          );
        }
        if (branchNumberToUse) {
          localStorage.setItem(
            "even-branch-number",
            branchNumberToUse.toString(),
          );
        }

        setIsGuest(true);
        setGuestId(guestIdToUse);
        setRestaurantId(restaurantIdToUse);
        setBranchNumber(branchNumberToUse);

        /*console.log("👤 Guest session configured:", {
          guestId: guestIdToUse,
          restaurantId: restaurantIdToUse,
          branchNumber: branchNumberToUse,
          wasRestored: !!storedGuestId,
        });*/
        return;
      }

      // Priority 2: Restore existing guest session
      if (storedGuestId) {
        const storedGuestName = localStorage.getItem("even-guest-name");
        setIsGuest(true);
        setGuestId(storedGuestId);
        setRestaurantId(
          storedRestaurantId ? parseInt(storedRestaurantId) : null,
        );
        setBranchNumber(
          storedBranchNumber ? parseInt(storedBranchNumber) : null,
        );
        setGuestName(storedGuestName);
        /*console.log("🔄 Restored guest session:", {
          guestId: storedGuestId,
          restaurantId: storedRestaurantId,
          branchNumber: storedBranchNumber,
          guestName: storedGuestName,
        });*/
        return;
      }

      // Priority 3: No params and no valid stored session - create guest session
      const newGuestId = generateGuestId();
      localStorage.setItem("even-guest-id", newGuestId);

      setIsGuest(true);
      setGuestId(newGuestId);
      setRestaurantId(null);
      setBranchNumber(null);

      /*console.log("👤 Created new Pick & Go guest session:", {
        guestId: newGuestId,
        restaurantId: null,
        branchNumber: null,
      });*/
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user, searchParams, isGuest]);

  const setAsGuest = (newRestaurantId?: number, newBranchNumber?: number) => {
    // Generate guest ID (which handles localStorage)
    const generatedGuestId = generateGuestId();

    // Ensure localStorage is updated immediately
    localStorage.setItem("even-guest-id", generatedGuestId);

    setIsGuest(true);
    setGuestId(generatedGuestId);

    if (newRestaurantId !== undefined) {
      localStorage.setItem("even-restaurant-id", newRestaurantId.toString());
      setRestaurantId(newRestaurantId);
    }

    if (newBranchNumber !== undefined) {
      localStorage.setItem("even-branch-number", newBranchNumber.toString());
      setBranchNumber(newBranchNumber);
    }

    /*console.log("👤 Set as guest user:", {
      guestId: generatedGuestId,
      restaurantId: newRestaurantId,
      branchNumber: newBranchNumber,
    });*/
  };

  const clearGuestSession = useCallback(() => {
    // NO eliminar el guest_id porque lo necesitamos para la migración del carrito
    // El guest_id debe preservarse para la migración del carrito en CartContext
    setIsGuest(false);
    setGuestId(null);
    setRestaurantId(null);
    setBranchNumber(null);
    setGuestName(null);
    localStorage.removeItem("even-guest-name");
    localStorage.removeItem("even-restaurant-id");
    localStorage.removeItem("even-branch-number");
    // NO eliminar even-guest-id aquí - lo necesitamos para migrar el carrito
    // El CartContext lo eliminará después de la migración exitosa
    /*console.log(
      "🗑️ Guest session cleared (guest_id preserved for cart migration)",
    );*/
  }, []);

  const setAsAuthenticated = useCallback(
    (userId: string) => {
      // Clear guest session when user authenticates
      clearGuestSession();
      //console.log("🔐 Set as authenticated user:", userId);
    },
    [clearGuestSession],
  );

  const setGuestNameHandler = (name: string) => {
    setGuestName(name);
    localStorage.setItem("even-guest-name", name);
    //console.log("👤 Guest name set:", name);
  };

  const setRestaurantAndBranch = (
    newRestaurantId: number,
    newBranchNumber: number,
  ) => {
    setRestaurantId(newRestaurantId);
    setBranchNumber(newBranchNumber);
    localStorage.setItem("even-restaurant-id", newRestaurantId.toString());
    localStorage.setItem("even-branch-number", newBranchNumber.toString());
    /*console.log("🏪 Restaurant and branch set:", {
      restaurantId: newRestaurantId,
      branchNumber: newBranchNumber,
    });*/
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
    restaurantId,
    branchNumber,
    guestName,
    setAsGuest,
    setAsAuthenticated,
    clearGuestSession,
    setGuestName: setGuestNameHandler,
    setRestaurantAndBranch,
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
  restaurantId: number | null;
  branchNumber: number | null;
} {
  const { guestId, restaurantId, branchNumber } = useGuest();
  return { guestId, restaurantId, branchNumber };
}
