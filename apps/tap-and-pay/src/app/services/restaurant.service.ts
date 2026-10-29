const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

export interface Restaurant {
  id: number;
  name: string;
  logo_url?: string;
  opening_hours?: Record<string, { open: string; close: string }>;
  [key: string]: unknown;
}

class RestaurantService {
  // Obtener información de un restaurante por ID
  async getRestaurantById(restaurantId: number): Promise<Restaurant> {
    try {
      const response = await fetch(`${API_URL}/restaurants/${restaurantId}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Restaurant not found");
        }
        throw new Error("Failed to fetch restaurant");
      }

      const result: ApiResponse<Restaurant> = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Failed to fetch restaurant");
      }

      return result.data;
    } catch (error) {
      console.error("Error fetching restaurant:", error);
      throw error;
    }
  }

  // Obtener restaurante por ID y branch
  async getRestaurantByBranch(
    restaurantId: number,
    branchNumber: number
  ): Promise<Restaurant> {
    try {
      const response = await fetch(
        `${API_URL}/restaurants/${restaurantId}/${branchNumber}/complete`
      );

      if (!response.ok) {
        // Fallback a solo el restaurante si no existe el endpoint con branch
        if (response.status === 404) {
          return this.getRestaurantById(restaurantId);
        }
        throw new Error("Failed to fetch restaurant data");
      }

      const result: ApiResponse<{ restaurant: Restaurant }> = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Failed to fetch restaurant data");
      }

      return result.data.restaurant;
    } catch (error) {
      console.error("Error fetching restaurant by branch:", error);
      // Fallback to just restaurant
      return this.getRestaurantById(restaurantId);
    }
  }
}

export const restaurantService = new RestaurantService();
