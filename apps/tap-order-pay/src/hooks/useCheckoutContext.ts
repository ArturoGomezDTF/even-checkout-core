import { useState, useEffect } from "react";
import type { MsiConfig } from "@/types/payment.types";

export type PaymentProviderCode = "ecartpay" | "clip" | null;

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") ||
  "http://localhost:5000";

const EMPTY_MSI_CONFIG: MsiConfig = { isActive: false, visaMc: [], amex: [] };

interface AgentStatus {
  hasIntegration: boolean;
  isAgentConnected: boolean;
  isActive: boolean;
  providerName: string | null;
  isTurnoOpen: boolean | null;
  requiresAgent: boolean;
  credentialsComplete: boolean;
}

const toAgentStatus = (data: any): AgentStatus => ({
  hasIntegration: data.hasIntegration ?? false,
  isAgentConnected: data.isAgentConnected ?? false,
  isActive: data.isActive ?? false,
  providerName: data.providerName ?? null,
  isTurnoOpen: data.isTurnoOpen ?? null,
  requiresAgent: data.requiresAgent ?? true,
  credentialsComplete: data.credentialsComplete ?? false,
});

// #97: proveedor, MSI, agente POS y alta demanda del checkout en una sola llamada.
export function useCheckoutContext(
  restaurantId: string | number | null,
  branchNumber: number | null,
) {
  const [provider, setProvider] = useState<PaymentProviderCode>(null);
  const [msiConfig, setMsiConfig] = useState<MsiConfig>(EMPTY_MSI_CONFIG);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [isHighDemand, setIsHighDemand] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId || !branchNumber) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/tap-orders/checkout-context/${restaurantId}/${branchNumber}`,
        );
        if (!res.ok) throw new Error("Failed to fetch checkout context");
        const { data } = await res.json();
        if (cancelled) return;
        setProvider((data.provider as PaymentProviderCode) ?? null);
        setMsiConfig(data.msi ?? EMPTY_MSI_CONFIG);
        setAgentStatus(data.agentStatus ? toAgentStatus(data.agentStatus) : null);
        setIsHighDemand(!!data.orderFlowStatus?.is_high_demand);
      } catch (err) {
        console.error("useCheckoutContext error:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [restaurantId, branchNumber]);

  // Ping fresco al pagar: el contexto pudo quedar viejo si el agente se cayó después.
  const refetchAgentStatus = async (): Promise<AgentStatus | null> => {
    if (!restaurantId || !branchNumber) return null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(
        `${API_BASE_URL}/api/pos/restaurant/${restaurantId}/branch/${branchNumber}/agent-status`,
        { signal: controller.signal },
      );
      clearTimeout(timeoutId);
      if (!res.ok) return null;
      return toAgentStatus(await res.json());
    } catch {
      return null;
    }
  };

  const hasActivePOS =
    agentStatus !== null && agentStatus.hasIntegration && agentStatus.isActive;

  // Mismo criterio que useAgentStatus: sin agente local basta con credenciales completas.
  const isPOSReady = agentStatus?.requiresAgent
    ? agentStatus.isAgentConnected
    : (agentStatus?.credentialsComplete ?? false);

  const isAgentDisconnected = hasActivePOS && !isPOSReady;

  const isTurnoClosed =
    hasActivePOS &&
    !!agentStatus?.requiresAgent &&
    agentStatus.isAgentConnected &&
    agentStatus.isTurnoOpen === false;

  return {
    provider,
    msiConfig,
    agentStatus,
    isHighDemand,
    isLoading,
    isAgentDisconnected,
    isTurnoClosed,
    refetchAgentStatus,
  };
}
