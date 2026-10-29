"use client";

import { useState, useEffect } from "react";
import { paymentService, type MsiConfig } from "@/app/services/payment.service";

const EMPTY_CONFIG: MsiConfig = { isActive: false, visaMc: [], amex: [] };

export function useMsiConfig() {
  const [msiConfig, setMsiConfig] = useState<MsiConfig>(EMPTY_CONFIG);
  const [isMsiLoading, setIsMsiLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await paymentService.getMsiConfiguration();
        if (!cancelled && result.success && result.data) {
          setMsiConfig(result.data);
        }
      } catch {
        // Network error: keep EMPTY_CONFIG, MSI section won't render
      } finally {
        if (!cancelled) setIsMsiLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { msiConfig, isMsiLoading };
}
