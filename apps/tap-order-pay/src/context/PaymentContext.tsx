"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { paymentService, PaymentMethod } from "../services/payment.service";
import { useGuest } from "./GuestContext";
import { useAuth } from "./AuthContext";

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
  const { user, isAuthenticated } = useAuth();

  const hasPaymentMethods = paymentMethods.length > 0;

  const refreshPaymentMethods = async () => {
    // Fetch payment methods for both authenticated users and guests

    // For registered users - prioritize user over guest session
    if (user) {
      // NO eliminar guest_id aquí - CartContext lo necesita para migrar el carrito
      // El CartContext se encargará de limpiarlo después de la migración exitosa
      const guestIdBefore = localStorage.getItem("even-guest-id");
      if (guestIdBefore) {
        // Solo limpiar table/restaurant/name, NO el guest_id
        localStorage.removeItem("even-table-number");
        localStorage.removeItem("even-restaurant-id");
        localStorage.removeItem("even-guest-name");
      }

      setIsLoading(true);
      try {
        // Set auth token from AuthContext (token is automatically managed)
        // No need to manually get token since paymentService handles it through AuthContext

        const response = await paymentService.getPaymentMethods();

        if (response.success) {
          // Handle different possible response structures
          let methods: PaymentMethod[] = [];

          // Check if paymentMethods is directly in response (not in data)
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
        const response = await paymentService.getPaymentMethods();

        if (response.success) {
          // Handle different possible response structures
          let methods: PaymentMethod[] = [];

          // Check if paymentMethods is directly in response (not in data)
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
      // Auth token is automatically managed by AuthContext and paymentService

      const response =
        await paymentService.setDefaultPaymentMethod(paymentMethodId);
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
      throw new Error("Debes estar autenticado para eliminar tarjetas");
    }

    // Optimistic update: remove immediately, restore on failure
    const deletedMethod = paymentMethods.find(
      (pm) => pm.id === paymentMethodId,
    );
    removePaymentMethod(paymentMethodId);

    try {
      const response =
        await paymentService.deletePaymentMethod(paymentMethodId);

      if (!response.success) {
        console.error("❌ Delete payment method failed:", response.error);
        if (deletedMethod) addPaymentMethod(deletedMethod);
        throw new Error(
          response.error?.message || "No se pudo eliminar la tarjeta",
        );
      }
    } catch (error) {
      console.error("❌ Error deleting payment method:", error);
      if (deletedMethod) addPaymentMethod(deletedMethod);
      throw error;
    }
  };

  const migrateGuestPaymentMethods = async () => {
    // Get guest ID from localStorage
    const guestIdToMigrate = localStorage.getItem("even-guest-id");

    if (!guestIdToMigrate) {
      return;
    }

    if (!user) {
      return;
    }

    try {
      const response =
        await paymentService.migrateGuestPaymentMethods(guestIdToMigrate);

      if (response.success) {
        // Refresh payment methods to show the migrated ones
        await refreshPaymentMethods();

        // IMPORTANTE: Solo eliminar el guest-id después de que TODAS las migraciones se completen
        // Esto incluye: cart migration (ejecutada en CartContext) + payment methods migration

        localStorage.removeItem("even-guest-id");
      } else {
        console.error(
          "❌ Failed to migrate payment methods:",
          response.error?.message,
        );
      }
    } catch (error) {
      console.error("❌ Error migrating payment methods:", error);
    }
  };

  // Load payment methods when user context changes
  useEffect(() => {
    // If user is authenticated, clear any guest session
    if (user && isGuest) {
      setAsAuthenticated(user.id);
    }

    refreshPaymentMethods();
  }, [isAuthenticated, user?.id, isGuest, guestId, setAsAuthenticated]);

  // Auto-migrate guest payment methods when user authenticates
  useEffect(() => {
    const autoMigrate = async () => {
      // Solo ejecutar cuando:
      // 1. El usuario está autenticado
      // 2. Hay un guest-id en localStorage
      const guestIdInStorage = localStorage.getItem("even-guest-id");

      if (user && guestIdInStorage) {
        // Esperar un poco para asegurarse de que el CartContext termine su migración primero
        await new Promise((resolve) => setTimeout(resolve, 1500));

        await migrateGuestPaymentMethods();
      }
    };

    autoMigrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Solo ejecutar cuando cambie el user ID (login/logout)

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
