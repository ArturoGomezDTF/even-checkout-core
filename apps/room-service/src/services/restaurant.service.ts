import { Restaurant } from "../interfaces/restaurant";
import { MenuSection } from "../interfaces/category";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

interface RestaurantWithMenu {
  restaurant: Restaurant;
  menu: MenuSection[];
}

export interface Branch {
  id: string;
  client_id: string;
  branch_number: number;
  name: string;
  address: string;
  rooms: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
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

  // Obtener menú completo de un restaurante
  async getRestaurantMenu(restaurantId: number): Promise<MenuSection[]> {
    try {
      const response = await fetch(
        `${API_URL}/restaurants/${restaurantId}/menu`
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Restaurant not found");
        }
        throw new Error("Failed to fetch restaurant menu");
      }

      const result: ApiResponse<MenuSection[]> = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Failed to fetch restaurant menu");
      }

      return result.data;
    } catch (error) {
      console.error("Error fetching restaurant menu:", error);
      throw error;
    }
  }

  // Obtener restaurante con su menú completo en una sola petición
  async getRestaurantWithMenu(
    restaurantId: number
  ): Promise<RestaurantWithMenu> {
    try {
      const response = await fetch(
        `${API_URL}/restaurants/${restaurantId}/complete`
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Restaurant not found");
        }
        throw new Error("Failed to fetch restaurant data");
      }

      const result: ApiResponse<RestaurantWithMenu> = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Failed to fetch restaurant data");
      }

      return result.data;
    } catch (error) {
      console.error("Error fetching restaurant with menu:", error);
      throw error;
    }
  }

  // Obtener restaurante con su menú filtrado por sucursal en una sola petición
  async getRestaurantWithMenuByBranch(
    restaurantId: number,
    branchNumber: number
  ): Promise<RestaurantWithMenu> {
    try {
      const response = await fetch(
        `${API_URL}/restaurants/${restaurantId}/${branchNumber}/complete`
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Restaurant or branch not found");
        }
        throw new Error("Failed to fetch restaurant data");
      }

      const result: ApiResponse<RestaurantWithMenu> = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Failed to fetch restaurant data");
      }

      return result.data;
    } catch (error) {
      console.error("Error fetching restaurant with menu by branch:", error);
      throw error;
    }
  }

  // Obtener todos los restaurantes activos
  async getAllRestaurants(): Promise<Restaurant[]> {
    try {
      const response = await fetch(`${API_URL}/restaurants`);

      if (!response.ok) {
        throw new Error("Failed to fetch restaurants");
      }

      const result: ApiResponse<Restaurant[]> = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Failed to fetch restaurants");
      }

      return result.data;
    } catch (error) {
      console.error("Error fetching restaurants:", error);
      throw error;
    }
  }

  // Obtener sucursales de un restaurante
  async getRestaurantBranches(restaurantId: number): Promise<Branch[]> {
    try {
      const response = await fetch(
        `${API_URL}/restaurants/${restaurantId}/branches`
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Restaurant not found");
        }
        throw new Error("Failed to fetch branches");
      }

      const result: ApiResponse<Branch[]> = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Failed to fetch branches");
      }

      return result.data;
    } catch (error) {
      console.error("Error fetching branches:", error);
      throw error;
    }
  }

  // Validar que un restaurante, sucursal y habitación existen
  async validateRestaurantBranchRoom(
    restaurantId: number,
    branchNumber: number,
    roomNumber: string,
    service?: string
  ): Promise<ValidationResult> {
    try {
      // Construir la URL con el parámetro service si se proporciona
      let url = `${API_URL}/restaurants/${restaurantId}/${branchNumber}/room/${roomNumber}/validate`;
      if (service) {
        url += `?service=${encodeURIComponent(service)}`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        return {
          valid: false,
          error: "VALIDATION_ERROR",
        };
      }

      const result: ApiResponse<ValidationResult> = await response.json();

      if (!result.success) {
        return {
          valid: false,
          error: "VALIDATION_ERROR",
        };
      }

      return result.data;
    } catch (error) {
      console.error("Error validating restaurant/branch/room:", error);
      return {
        valid: false,
        error: "VALIDATION_ERROR",
      };
    }
  }
}

export const restaurantService = new RestaurantService();
