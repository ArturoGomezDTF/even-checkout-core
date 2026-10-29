"use client";

import { useEffect, useMemo, useState } from "react";
import { createApiClient } from "@even/api-client";
import { createPaymentService, type PaymentMethod } from "@even/payments";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; methods: PaymentMethod[] };

export function PaymentMethods() {
  const service = useMemo(
    () => createPaymentService(createApiClient({ baseUrl: process.env.NEXT_PUBLIC_API_URL })),
    [],
  );
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    service.getPaymentMethods().then((result) => {
      if (cancelled) return;
      if (result.success && result.data) {
        setState({ status: "ready", methods: result.data.paymentMethods });
      } else {
        setState({ status: "error", message: result.error?.message ?? "No se pudieron cargar tus tarjetas" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [service]);

  if (state.status === "loading") {
    return <p className="mt-4 text-gray-500">Cargando tarjetas…</p>;
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="mt-4 text-red-600">
        {state.message}
      </p>
    );
  }
  if (state.methods.length === 0) {
    return <p className="mt-4 text-gray-500">No tienes tarjetas guardadas.</p>;
  }

  return (
    <ul aria-label="Tarjetas guardadas" className="mt-4 space-y-2">
      {state.methods.map((method) => (
        <li key={method.id} className="flex items-center justify-between rounded border px-4 py-3">
          <span className="capitalize">
            {method.cardBrand} •••• {method.lastFourDigits}
          </span>
          {method.isDefault && <span className="text-sm text-green-700">Predeterminada</span>}
        </li>
      ))}
    </ul>
  );
}
