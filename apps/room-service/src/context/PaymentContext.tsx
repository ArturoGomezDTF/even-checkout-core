"use client";

import type { ReactNode } from "react";
import { PaymentProvider as BasePaymentProvider } from "@even/payments/react";
import { paymentService } from "../services/payment.service";
import { useGuest } from "./GuestContext";
import { useAuth } from "./AuthContext";

export {
  useHasPaymentMethods,
  usePayment,
  type PaymentContextValue as PaymentContextType,
} from "@even/payments/react";

export function PaymentProvider({ children }: { children: ReactNode }) {
  const { isGuest, guestId, setAsAuthenticated } = useGuest();
  const { user } = useAuth();

  return (
    <BasePaymentProvider
      service={paymentService}
      userId={user?.id ?? null}
      guestId={isGuest ? guestId : null}
      onUserSession={(userId) => {
        // Con usuario registrado se cierra la sesión de invitado.
        if (isGuest) setAsAuthenticated(userId);
        // NO eliminar guest_id aquí - CartContext lo necesita para migrar el
        // carrito; se borra después de migrar las tarjetas.
        if (localStorage.getItem("even-guest-id")) {
          localStorage.removeItem("even-room-number");
          localStorage.removeItem("even-restaurant-id");
          localStorage.removeItem("even-guest-name");
        }
      }}
    >
      {children}
    </BasePaymentProvider>
  );
}
