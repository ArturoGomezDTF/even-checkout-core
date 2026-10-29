import { useState, useEffect } from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") ||
  "http://localhost:5000";

export type PaymentProviderCode = "ecartpay" | "clip" | null;

export function usePaymentProvider(restaurantId: string | number | null) {
  const [provider, setProvider] = useState<PaymentProviderCode>(null);
  const [isLoadingProvider, setIsLoadingProvider] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setIsLoadingProvider(false);
      return;
    }

    const fetchProvider = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/payment-providers/resolve/${restaurantId}`,
        );
        if (!res.ok) throw new Error("Failed to fetch payment provider");
        const data = await res.json();
        setProvider((data.provider as PaymentProviderCode) ?? null);
      } catch (err) {
        console.error("usePaymentProvider error:", err);
        setProvider(null);
      } finally {
        setIsLoadingProvider(false);
      }
    };

    fetchProvider();
  }, [restaurantId]);

  return { provider, isLoadingProvider };
}
