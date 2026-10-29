"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  PaymentProvider as BasePaymentProvider,
  usePayment,
} from "@even/payments/react";
import { paymentService } from "../services/payment.service";
import { useGuest } from "./GuestContext";
import { useAuth } from "./AuthContext";

export {
  useHasPaymentMethods,
  usePayment,
  type PaymentContextValue as PaymentContextType,
} from "@even/payments/react";

// Las tarjetas del invitado se migran cuando CartContext avisa que terminó su
// migración (y no con un temporizador): CartContext necesita el guest_id hasta
// ese momento y es esta migración la que lo borra al terminar.
function GuestPaymentMigration({ enabled }: { enabled: boolean }) {
  const { migrateGuestPaymentMethods } = usePayment();
  const migrateRef = useRef(migrateGuestPaymentMethods);
  useEffect(() => {
    migrateRef.current = migrateGuestPaymentMethods;
  });

  useEffect(() => {
    if (!enabled) return;
    const handleCartMigrationComplete = () => {
      if (localStorage.getItem("even-guest-id")) void migrateRef.current();
    };
    window.addEventListener(
      "even:cartMigrationComplete",
      handleCartMigrationComplete,
    );
    return () => {
      window.removeEventListener(
        "even:cartMigrationComplete",
        handleCartMigrationComplete,
      );
    };
  }, [enabled]);

  return null;
}

export function PaymentProvider({ children }: { children: ReactNode }) {
  const { isGuest, guestId, setAsAuthenticated } = useGuest();
  const { user, isLoading: authLoading } = useAuth();

  // Hasta que la auth termine de cargar no se pide nada, para no traer las
  // tarjetas de un invitado que está por convertirse en usuario.
  const userId = authLoading ? null : (user?.id ?? null);

  return (
    <BasePaymentProvider
      service={paymentService}
      userId={userId}
      guestId={!authLoading && isGuest ? guestId : null}
      migrationDelayMs={null}
      onUserSession={(id) => {
        // Con usuario registrado se cierra la sesión de invitado.
        if (isGuest) setAsAuthenticated(id);
        // NO eliminar guest_id aquí - CartContext lo necesita para migrar el
        // carrito; se borra después de migrar las tarjetas.
        if (localStorage.getItem("even-guest-id")) {
          localStorage.removeItem("even-table-number");
          localStorage.removeItem("even-restaurant-id");
          localStorage.removeItem("even-guest-name");
        }
      }}
    >
      <GuestPaymentMigration enabled={userId !== null} />
      {children}
    </BasePaymentProvider>
  );
}
