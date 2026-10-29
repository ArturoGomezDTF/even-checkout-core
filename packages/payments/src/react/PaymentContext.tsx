"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PaymentService } from "../payment-service";
import type { PaymentMethod } from "../types";

export const GUEST_ID_STORAGE_KEY = "even-guest-id";

export interface PaymentContextValue {
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

export interface PaymentProviderProps {
  children: ReactNode;
  service: PaymentService;
  /** Usuario registrado; tiene prioridad sobre la sesión de invitado. */
  userId: string | null;
  /** Sesión de invitado activa (null si no hay). */
  guestId: string | null;
  /**
   * Se llama al cargar métodos con un usuario registrado. Aquí cada app limpia
   * su sesión de invitado (en Tap Order & Pay: `setAsAuthenticated` y las
   * llaves de mesa/restaurante, pero NO el guest id, que el carrito necesita
   * para migrar).
   */
  onUserSession?: (userId: string) => void;
  /** guest id pendiente de migrar a la cuenta. Por defecto lee localStorage. */
  getMigratableGuestId?: () => string | null;
  /** Tras migrar las tarjetas. Por defecto borra el guest id de localStorage. */
  onGuestMigrated?: () => void;
  /**
   * Espera antes de migrar, para que el carrito migre primero. `null` desactiva
   * la migración automática: la app llama a `migrateGuestPaymentMethods` cuando
   * sabe que el carrito terminó (p. ej. con un evento).
   */
  migrationDelayMs?: number | null;
}

const PaymentContext = createContext<PaymentContextValue | undefined>(undefined);

function readGuestId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(GUEST_ID_STORAGE_KEY);
}

function clearGuestId() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(GUEST_ID_STORAGE_KEY);
}

/** El backend ha devuelto la lista en `paymentMethods`, `data.paymentMethods` o `data`. */
export function extractPaymentMethods(response: unknown): PaymentMethod[] {
  if (!response || typeof response !== "object") return [];
  const r = response as {
    paymentMethods?: PaymentMethod[];
    data?: { paymentMethods?: PaymentMethod[] } | PaymentMethod[];
  };
  if (Array.isArray(r.paymentMethods)) return r.paymentMethods;
  if (Array.isArray(r.data)) return r.data;
  if (Array.isArray(r.data?.paymentMethods)) return r.data.paymentMethods;
  return [];
}

export function PaymentProvider({
  children,
  service,
  userId,
  guestId,
  onUserSession,
  getMigratableGuestId = readGuestId,
  onGuestMigrated = clearGuestId,
  migrationDelayMs = 1500,
}: PaymentProviderProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Descarta respuestas de una sesión anterior (login/logout a mitad de fetch).
  const requestSeq = useRef(0);

  // Los callbacks de la app suelen ser funciones inline; se leen por ref para
  // no relanzar los efectos en cada render.
  const callbacks = useRef({ onUserSession, getMigratableGuestId, onGuestMigrated });
  useEffect(() => {
    callbacks.current = { onUserSession, getMigratableGuestId, onGuestMigrated };
  });

  const refreshPaymentMethods = useCallback(async () => {
    const seq = ++requestSeq.current;
    if (!userId && !guestId) {
      setPaymentMethods([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await service.getPaymentMethods();
      if (seq !== requestSeq.current) return;
      setPaymentMethods(response.success ? extractPaymentMethods(response) : []);
    } catch (error) {
      if (seq !== requestSeq.current) return;
      console.error("Error fetching payment methods:", error);
      setPaymentMethods([]);
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, [service, userId, guestId]);

  const addPaymentMethod = useCallback((paymentMethod: PaymentMethod) => {
    setPaymentMethods((prev) => [...prev, paymentMethod]);
  }, []);

  const removePaymentMethod = useCallback((paymentMethodId: string) => {
    setPaymentMethods((prev) => prev.filter((pm) => pm.id !== paymentMethodId));
  }, []);

  const setDefaultPaymentMethod = useCallback(
    async (paymentMethodId: string) => {
      if (!userId) {
        throw new Error("Only registered users can set default payment methods");
      }
      const response = await service.setDefaultPaymentMethod(paymentMethodId);
      if (!response.success) {
        throw new Error(
          response.error?.message || "Failed to set default payment method",
        );
      }
      setPaymentMethods((prev) =>
        prev.map((pm) => ({ ...pm, isDefault: pm.id === paymentMethodId })),
      );
    },
    [service, userId],
  );

  const paymentMethodsRef = useRef(paymentMethods);
  useEffect(() => {
    paymentMethodsRef.current = paymentMethods;
  });

  const deletePaymentMethod = useCallback(
    async (paymentMethodId: string) => {
      if (!userId && !guestId) {
        throw new Error("Debes estar autenticado para eliminar tarjetas");
      }

      // Optimista: se quita ya y se restaura si falla.
      const deleted = paymentMethodsRef.current.find((pm) => pm.id === paymentMethodId);
      const restore = () => {
        if (deleted) setPaymentMethods((prev) => [...prev, deleted]);
      };
      removePaymentMethod(paymentMethodId);

      let response: Awaited<ReturnType<PaymentService["deletePaymentMethod"]>>;
      try {
        response = await service.deletePaymentMethod(paymentMethodId);
      } catch (error) {
        restore();
        throw error;
      }
      if (!response.success) {
        restore();
        throw new Error(response.error?.message || "No se pudo eliminar la tarjeta");
      }
    },
    [service, userId, guestId, removePaymentMethod],
  );

  const migrateGuestPaymentMethods = useCallback(async () => {
    const guestIdToMigrate = callbacks.current.getMigratableGuestId();
    if (!guestIdToMigrate || !userId) return;

    try {
      const response = await service.migrateGuestPaymentMethods(guestIdToMigrate);
      if (!response.success) {
        console.error("Failed to migrate payment methods:", response.error?.message);
        return;
      }
      await refreshPaymentMethods();
      // El guest id se borra solo cuando terminaron carrito y tarjetas.
      callbacks.current.onGuestMigrated();
    } catch (error) {
      console.error("Error migrating payment methods:", error);
    }
  }, [service, userId, refreshPaymentMethods]);

  useEffect(() => {
    if (userId) callbacks.current.onUserSession?.(userId);
    // Recargar al cambiar de sesión es justo sincronizar con el backend; el
    // setState síncrono es solo `isLoading` / la lista vacía sin sesión.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshPaymentMethods();
  }, [userId, refreshPaymentMethods]);

  // Migración automática al iniciar sesión. Solo depende del usuario:
  // `migrateGuestPaymentMethods` cambia con guestId y no debe relanzarla.
  const migrateRef = useRef(migrateGuestPaymentMethods);
  useEffect(() => {
    migrateRef.current = migrateGuestPaymentMethods;
  });
  useEffect(() => {
    if (!userId || migrationDelayMs === null) return;
    if (!callbacks.current.getMigratableGuestId()) return;
    const timer = setTimeout(() => void migrateRef.current(), migrationDelayMs);
    return () => clearTimeout(timer);
  }, [userId, migrationDelayMs]);

  const value = useMemo<PaymentContextValue>(
    () => ({
      paymentMethods,
      isLoading,
      hasPaymentMethods: paymentMethods.length > 0,
      addPaymentMethod,
      refreshPaymentMethods,
      removePaymentMethod,
      setDefaultPaymentMethod,
      deletePaymentMethod,
      migrateGuestPaymentMethods,
    }),
    [
      paymentMethods,
      isLoading,
      addPaymentMethod,
      refreshPaymentMethods,
      removePaymentMethod,
      setDefaultPaymentMethod,
      deletePaymentMethod,
      migrateGuestPaymentMethods,
    ],
  );

  return <PaymentContext.Provider value={value}>{children}</PaymentContext.Provider>;
}

export function usePayment(): PaymentContextValue {
  const context = useContext(PaymentContext);
  if (context === undefined) {
    throw new Error("usePayment must be used within a PaymentProvider");
  }
  return context;
}

export function useHasPaymentMethods(): boolean {
  return usePayment().hasPaymentMethods;
}
