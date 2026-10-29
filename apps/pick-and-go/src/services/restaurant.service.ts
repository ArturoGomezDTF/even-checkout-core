import { Restaurant } from "../interfaces/restaurant";
import { MenuSection } from "../interfaces/category";
import { requestWithAuth, type ApiResponse } from "./request-helper";

interface RestaurantWithMenu {
  restaurant: Restaurant;
  menu: MenuSection[];
}

export interface ValidationResult {
  valid: boolean;
  error?:
    | "RESTAURANT_NOT_FOUND"
    | "BRANCH_NOT_FOUND"
    | "NO_BRANCHES"
    | "SERVICE_NOT_AVAILABLE"
    | "VALIDATION_ERROR";
}

class RestaurantService {
  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    return requestWithAuth<T>(endpoint, options);
  }
  // Obtener información de un restaurante por ID
  async getRestaurantById(restaurantId: number): Promise<Restaurant> {
    const result = await this.request<Restaurant>(
      `/restaurants/${restaurantId}`
    );

    if (!result.success || !result.data) {
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : "Failed to fetch restaurant"
      );
    }

    return result.data;
  }

  // Obtener menú completo de un restaurante
  async getRestaurantMenu(restaurantId: number): Promise<MenuSection[]> {
    const result = await this.request<MenuSection[]>(
      `/restaurants/${restaurantId}/menu`
    );

    if (!result.success || !result.data) {
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : "Failed to fetch restaurant menu"
      );
    }

    return result.data;
  }

  // Obtener restaurante con su menú completo en una sola petición
  async getRestaurantWithMenu(
    restaurantId: number
  ): Promise<RestaurantWithMenu> {
    const result = await this.request<RestaurantWithMenu>(
      `/restaurants/${restaurantId}/complete`
    );

    if (!result.success || !result.data) {
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : "Failed to fetch restaurant data"
      );
    }

    return result.data;
  }

  // Obtener restaurante con su menú filtrado por sucursal en una sola petición
  async getRestaurantWithMenuByBranch(
    restaurantId: number,
    branchNumber: number
  ): Promise<RestaurantWithMenu> {
    const result = await this.request<RestaurantWithMenu>(
      `/restaurants/${restaurantId}/${branchNumber}/complete`
    );

    if (!result.success || !result.data) {
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : "Failed to fetch restaurant data"
      );
    }

    return result.data;
  }

  // Obtener todos los restaurantes activos
  async getAllRestaurants(): Promise<Restaurant[]> {
    const result = await this.request<Restaurant[]>("/restaurants");

    if (!result.success || !result.data) {
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : "Failed to fetch restaurants"
      );
    }

    return result.data;
  }

  // Validar que el restaurante y opcionalmente la sucursal existan
  async validateRestaurantAndBranch(
    restaurantId: number,
    branchNumber: number | null,
    service?: string
  ): Promise<ValidationResult> {
    try {
      // Construir la URL con o sin branchNumber
      let endpoint = branchNumber
        ? `/restaurants/${restaurantId}/branches/${branchNumber}/validate`
        : `/restaurants/${restaurantId}/validate`;

      // Agregar el parámetro service si se proporciona
      if (service) {
        endpoint += `?service=${encodeURIComponent(service)}`;
      }

      const response = await this.request<ValidationResult>(endpoint);

      if (!response.success) {
        return {
          valid: false,
          error: "VALIDATION_ERROR",
        };
      }

      return response.data || { valid: false, error: "VALIDATION_ERROR" };
    } catch (error) {
      console.error("Error validating restaurant/branch:", error);
      return {
        valid: false,
        error: "VALIDATION_ERROR",
      };
    }
  }
}

// Exportar instancia única del servicio
export const restaurantService = new RestaurantService();
