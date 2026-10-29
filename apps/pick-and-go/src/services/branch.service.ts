import { requestWithAuth, type ApiResponse } from "./request-helper";
import type { Branch } from "@/types/branch.types";

class BranchService {
  /**
   * Obtener todas las sucursales activas de un restaurante
   */
  async getBranches(restaurantId: number): Promise<ApiResponse<Branch[]>> {
    return await requestWithAuth<Branch[]>(
      `/restaurants/${restaurantId}/branches`
    );
  }

  /**
   * Obtener información de una sucursal específica
   */
  async getBranchById(
    restaurantId: number,
    branchId: number
  ): Promise<ApiResponse<Branch>> {
    return await requestWithAuth<Branch>(
      `/restaurants/${restaurantId}/branches/${branchId}`
    );
  }
}

export const branchService = new BranchService();
