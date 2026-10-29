import { useState, useEffect } from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") ||
  "http://localhost:5000";

interface AgentStatus {
  hasIntegration: boolean;
  isAgentConnected: boolean;
  isActive: boolean;
  providerName: string | null;
  isTurnoOpen: boolean | null;
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

  const isAgentRequired = hasActivePOS && !agentStatus.isAgentConnected;
  const isAgentDisconnected = hasActivePOS && !agentStatus.isAgentConnected;
  const isTurnoClosed =
    hasActivePOS &&
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
