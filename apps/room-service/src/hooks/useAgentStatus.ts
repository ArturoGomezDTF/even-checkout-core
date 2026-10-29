import { useState, useEffect } from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") ||
  "http://localhost:5000";

interface AgentStatus {
  hasIntegration: boolean;
  isAgentConnected: boolean;
  isActive: boolean;
  providerName: string | null;
  isTurnoOpen: boolean | null;
  requiresAgent: boolean;
  credentialsComplete: boolean;
}

export function useAgentStatus(
  restaurantId: string | number | null,
  branchNumber: number | null,
) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [isLoadingAgentStatus, setIsLoadingAgentStatus] = useState(true);

  useEffect(() => {
    if (!restaurantId || !branchNumber) {
      setIsLoadingAgentStatus(false);
      return;
    }

    const fetchStatus = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/pos/restaurant/${restaurantId}/branch/${branchNumber}/agent-status`,
        );
        if (!res.ok) throw new Error("Failed to fetch agent status");
        const data = await res.json();
        setAgentStatus({
          hasIntegration: data.hasIntegration ?? false,
          isAgentConnected: data.isAgentConnected ?? false,
          isActive: data.isActive ?? false,
          providerName: data.providerName ?? null,
          isTurnoOpen: data.isTurnoOpen ?? null,
          requiresAgent: data.requiresAgent ?? true,
          credentialsComplete: data.credentialsComplete ?? false,
        });
      } catch (err) {
        console.error("useAgentStatus error:", err);
        setAgentStatus(null);
      } finally {
        setIsLoadingAgentStatus(false);
      }
    };

    fetchStatus();
  }, [restaurantId, branchNumber]);

  const hasActivePOS =
    agentStatus !== null && agentStatus.hasIntegration && agentStatus.isActive;

  // Proveedores con agente local (ej. SoftRestaurant) necesitan el socket
  // conectado; proveedores sin agente (ej. Givex, API directa) solo
  // necesitan credenciales completas — nunca hay un agente que conectar.
  const isPOSReady = agentStatus?.requiresAgent
    ? agentStatus.isAgentConnected
    : (agentStatus?.credentialsComplete ?? false);

  const isAgentRequired = hasActivePOS && !isPOSReady;
  const isAgentDisconnected = hasActivePOS && !isPOSReady;

  // Turno cerrado solo aplica a proveedores con agente local
  const isTurnoClosed =
    hasActivePOS &&
    !!agentStatus?.requiresAgent &&
    agentStatus.isAgentConnected &&
    agentStatus.isTurnoOpen === false;

  return {
    agentStatus,
    isLoadingAgentStatus,
    isAgentRequired,
    isAgentDisconnected,
    isTurnoClosed,
  };
}
