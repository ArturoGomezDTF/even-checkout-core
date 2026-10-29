"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { Branch, BranchContextType } from "@/types/branch.types";
import { branchService } from "@/services/branch.service";

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const [selectedBranchNumber, setSelectedBranchNumber] = useState<number | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [branchInitialized, setBranchInitialized] = useState(false);

  // Sincronizar selectedBranchNumber con el query param de la URL
  useEffect(() => {
    const branchNumberFromUrl = searchParams.get("branch");
    if (branchNumberFromUrl) {
      const branchNum = parseInt(branchNumberFromUrl);
      if (!isNaN(branchNum) && branchNum !== selectedBranchNumber) {
        setSelectedBranchNumber(branchNum);
      }
    }
  }, [searchParams]);

  const fetchBranches = useCallback(async (restaurantId: number) => {
    setIsLoading(true);
    try {
      const response = await branchService.getBranches(restaurantId);
      if (response.success && response.data) {
        setBranches(response.data);

        // Obtener branch de la URL
        const branchNumberFromUrl = searchParams.get("branch");

        // Si hay branch en la URL, usarlo
        if (branchNumberFromUrl) {
          const branchNum = parseInt(branchNumberFromUrl);
          if (!isNaN(branchNum)) {
            setSelectedBranchNumber(branchNum);
          }
        } else if (response.data.length > 0) {
          // Si no hay branch en la URL, seleccionar la primera sucursal por defecto
          setSelectedBranchNumber(response.data[0].branch_number);
        }
      }
    } catch (error) {
      console.error("Error fetching branches:", error);
    } finally {
      setIsLoading(false);
      setBranchInitialized(true);
    }
  }, [searchParams]);

  return (
    <BranchContext.Provider
      value={{
        selectedBranchNumber,
        branches,
        isLoading,
        branchInitialized,
        setSelectedBranchNumber,
        fetchBranches,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (context === undefined) {
    throw new Error("useBranch must be used within a BranchProvider");
  }
  return context;
}
