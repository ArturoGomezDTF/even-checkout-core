"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { apiService, PaymentMethod } from "../utils/api";
import { useGuest } from "./GuestContext";
import { useAuth } from "./AuthContext";
import { authService } from "../services/auth.service";
import { paymentService } from "../services/payment.service";

interface PaymentContextType {
  paymentMethods: PaymentMethod[];
  isLoading: boolean;
  hasPaymentMethods: boolean;
  addPaymentMethod: (paymentMethod: PaymentMethod) => void;
  refreshPaymentMethods: () => Promise<void>;
  removePaymentMethod: (paymentMethodId: string) => void;
  setDefaultPaymentMethod: (paymentMethodId: string) => Promise<void>;
  deletePaymentMethod: (paymentMethodId: string) => Promise<void>;
  migrateGuestPaymentMethods: () => Promise<void>;
}

const PaymentContext = createContext<PaymentContextType | undefined>(undefined);

interface PaymentProviderProps {
  children: ReactNode;
}

export function PaymentProvider({ children }: PaymentProviderProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { isGuest, guestId, setAsAuthenticated } = useGuest();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const hasPaymentMethods = paymentMethods.length > 0;

  const refreshPaymentMethods = async () => {
    // For registered users - prioritize user over guest session
    if (isAuthenticated && user) {
      // Get current user with token from authService
      const currentUser = authService.getCurrentUser();
      const userToken = currentUser?.token;

      // Wait for token to be available
      if (!userToken) {
        setPaymentMethods([]);
        return;
      }

      setIsLoading(true);
      try {
        apiService.setAuthToken(userToken);

        const response = await apiService.getPaymentMethods();
        if (response.success) {
          let methods: PaymentMethod[] = [];
          if ((response as any).paymentMethods) {
            methods = (response as any).paymentMethods;
          } else if (response.data?.paymentMethods) {
            methods = response.data.paymentMethods;
          } else if (Array.isArray(response.data)) {
            methods = response.data;
          }
          setPaymentMethods(methods);
        } else {
          setPaymentMethods([]);
        }
      } catch (error) {
        console.error(
          "❌ Error fetching payment methods for registered user:",
          error,
        );
        setPaymentMethods([]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // For guests, ensure we have a guest ID
    if (isGuest && guestId) {
      setIsLoading(true);
      try {
        const response = await apiService.getPaymentMethods();
        if (response.success) {
          let methods: PaymentMethod[] = [];
          if ((response as any).paymentMethods) {
            methods = (response as any).paymentMethods;
          } else if (response.data?.paymentMethods) {
            methods = response.data.paymentMethods;
          } else if (Array.isArray(response.data)) {
            methods = response.data;
          }
          setPaymentMethods(methods);
        } else {
          setPaymentMethods([]);
        }
      } catch (error) {
        console.error("❌ Error fetching payment methods for guest:", error);
        setPaymentMethods([]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // No valid authentication context
    setPaymentMethods([]);
  };

  const addPaymentMethod = (paymentMethod: PaymentMethod) => {
    setPaymentMethods((prev) => [...prev, paymentMethod]);
  };

  const removePaymentMethod = (paymentMethodId: string) => {
    setPaymentMethods((prev) => prev.filter((pm) => pm.id !== paymentMethodId));
  };

  const setDefaultPaymentMethod = async (paymentMethodId: string) => {
    // Only registered users can set default payment methods
    if (!user) {
      throw new Error("Only registered users can set default payment methods");
    }

    try {
      // Get Supabase auth token
      const currentUser = await authService.getCurrentUser();
      if (currentUser?.token) {
        apiService.setAuthToken(currentUser.token);
      }

      const response =
        await apiService.setDefaultPaymentMethod(paymentMethodId);
      if (response.success) {
        // Update local state to reflect the new default
        setPaymentMethods((prev) =>
          prev.map((pm) => ({
            ...pm,
            isDefault: pm.id === paymentMethodId,
          })),
        );
      } else {
        throw new Error(
          response.error?.message || "Failed to set default payment method",
        );
      }
    } catch (error) {
      console.error("❌ Error setting default payment method:", error);
      throw error;
    }
  };

  const deletePaymentMethod = async (paymentMethodId: string) => {
    if (!user && !isGuest) {
      throw new Error("No active session");
    }

    // Optimistic update: remove immediately, restore on failure
    const deletedMethod = paymentMethods.find(
      (pm) => pm.id === paymentMethodId,
    );
    removePaymentMethod(paymentMethodId);

    try {
      if (isGuest && guestId) {
        apiService.setGuestInfo(guestId);
      } else {
        const currentUser = await authService.getCurrentUser();
        if (currentUser?.token) {
          apiService.setAuthToken(currentUser.token);
        }
      }

      const response = await apiService.deletePaymentMethod(paymentMethodId);
      if (!response.success) {
        throw new Error(
          response.error?.message || "Failed to delete payment method",
        );
      }
    } catch (error) {
      console.error("❌ Error deleting payment method:", error);
      if (deletedMethod) addPaymentMethod(deletedMethod);
      throw error;
    }
  };

  const migrateGuestPaymentMethods = async () => {
    const guestIdInStorage = localStorage.getItem("even-guest-id");

    if (!user || !guestIdInStorage) {
      return;
    }

    try {
      // Get Supabase auth token
      const currentUser = await authService.getCurrentUser();
      if (currentUser?.token) {
        apiService.setAuthToken(currentUser.token);
      }

      const response =
        await paymentService.migrateGuestPaymentMethods(guestIdInStorage);

      if (response.success) {
        // Refresh payment methods to show migrated ones
        await refreshPaymentMethods();

        // IMPORTANT: Only delete guest-id after ALL migrations complete
        // This includes: guest orders linking (done in GuestContext) + payment methods migration

        localStorage.removeItem("even-guest-id");
      } else {
        console.error("❌ Payment methods migration failed:", response.error);
      }
    } catch (error) {
      console.error("❌ Error migrating payment methods:", error);
    }
  };

  // Load payment methods when user context changes.
  // authLoading/isGuest/guestId resolve in separate steps; dedupe on the
  // actual identity (user id or guest id) so we don't refetch on every step.
  const fetchedIdentityRef = useRef<string | null>(null);
  useEffect(() => {
    if (authLoading) return;

    // If user is authenticated, clear any guest session
    if (isAuthenticated && user && isGuest) {
      setAsAuthenticated(user.id);
    }

    const identityKey =
      isAuthenticated && user?.id
        ? `user:${user.id}`
        : isGuest && guestId
          ? `guest:${guestId}`
          : "none";

    if (fetchedIdentityRef.current === identityKey) return;
    fetchedIdentityRef.current = identityKey;

    refreshPaymentMethods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authLoading,
    isAuthenticated,
    user?.id,
    isGuest,
    guestId,
    setAsAuthenticated,
  ]);

  // Auto-migrate guest payment methods after guest orders are linked (GuestContext dispatches this event)
  useEffect(() => {
    if (!user) return;
    const handleGuestOrdersLinked = async () => {
      const guestIdInStorage = localStorage.getItem("even-guest-id");
      if (guestIdInStorage) {
        await migrateGuestPaymentMethods();
      }
    };
    window.addEventListener("even:guestOrdersLinked", handleGuestOrdersLinked);
    return () => {
      window.removeEventListener(
        "even:guestOrdersLinked",
        handleGuestOrdersLinked,
      );
    };
  }, [user?.id]);

  const value: PaymentContextType = {
    paymentMethods,
    isLoading,
    hasPaymentMethods,
    addPaymentMethod,
    refreshPaymentMethods,
    removePaymentMethod,
    setDefaultPaymentMethod,
    deletePaymentMethod,
    migrateGuestPaymentMethods,
  };

  return (
    <PaymentContext.Provider value={value}>{children}</PaymentContext.Provider>
  );
}

// Custom hook to use payment context
export function usePayment(): PaymentContextType {
  const context = useContext(PaymentContext);
  if (context === undefined) {
    throw new Error("usePayment must be used within a PaymentProvider");
  }
  return context;
}

// Helper hook to check if user has payment methods
export function useHasPaymentMethods(): boolean {
  const { hasPaymentMethods } = usePayment();
  return hasPaymentMethods;
}
