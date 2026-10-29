"use client";

import CartView from "@/app/components/CartView";
import ValidationError from "@/app/components/ValidationError";
import HighDemandBanner from "@/app/components/HighDemandBanner";
import { useValidateAccess } from "@/app/hooks/useValidateAccess";
import { useEffect, useRef, useState } from "react";

export default function CartPage() {
  const { validationError, restaurantId, branchNumber } = useValidateAccess();
  const [showHighDemandBanner, setShowHighDemandBanner] = useState(false);

  useEffect(() => {
    document.title = "Mi Carrito | Flex Bill";
    return () => {
      document.title = "Even Flex Bill";
    };
  }, []);

  // React Strict Mode double-invoca los effects al montar; dedupe con un
  // ref (persiste entre esos invokes) para no pedir el status dos veces.
  const fetchedFlowStatusKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!restaurantId || !branchNumber) return;

    const key = `${restaurantId}:${branchNumber}`;
    if (fetchedFlowStatusKeyRef.current === key) return;
    fetchedFlowStatusKeyRef.current = key;

    const API_BASE =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
    fetch(
      `${API_BASE}/restaurants/${restaurantId}/${branchNumber}/order-flow-status`,
    )
      .then((r) => r.json())
      .then(({ data }) => {
        if (data?.is_flexbill_high_demand) setShowHighDemandBanner(true);
      })
      .catch(() => {});
  }, [restaurantId, branchNumber]);

  // Mostrar error de validación si existe
  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  return (
    <>
      {showHighDemandBanner && (
        <HighDemandBanner onDismiss={() => setShowHighDemandBanner(false)} />
      )}
      <CartView />
    </>
  );
}
