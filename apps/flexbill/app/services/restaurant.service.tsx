import { Restaurant } from "../interfaces/restaurante";
import { MenuSection } from "../interfaces/category";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

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
  tables: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Servicio para interactuar con la API de restaurantes
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
        `${API_URL}/restaurants/${restaurantId}/menu`,
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
    restaurantId: number,
  ): Promise<RestaurantWithMenu> {
    try {
      const response = await fetch(
        `${API_URL}/restaurants/${restaurantId}/complete`,
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
    branchNumber: number,
  ): Promise<RestaurantWithMenu> {
    try {
      const response = await fetch(
        `${API_URL}/restaurants/${restaurantId}/${branchNumber}/complete`,
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
        `${API_URL}/restaurants/${restaurantId}/branches`,
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

  // Validar que un restaurante, sucursal y mesa existen
  async validateRestaurantBranchTable(
    restaurantId: number,
    branchNumber: number,
    tableNumber: string,
    service?: string,
    sessionToken?: string | null,
    skipSessionCheck?: boolean,
  ): Promise<ValidationResult> {
    try {
      // Construir la URL con los parámetros service/session si se proporcionan
      let url = `${API_URL}/restaurants/${restaurantId}/${branchNumber}/${tableNumber}/validate`;
      const qs: string[] = [];
      if (service) qs.push(`service=${encodeURIComponent(service)}`);
      if (sessionToken) qs.push(`session=${encodeURIComponent(sessionToken)}`);
      if (skipSessionCheck) qs.push("skipSessionCheck=true");
      if (qs.length) url += `?${qs.join("&")}`;

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
      console.error("Error validating restaurant/branch/table:", error);
      return {
        valid: false,
        error: "VALIDATION_ERROR",
      };
    }
  }
}

// Exportar instancia única del servicio
export const restaurantService = new RestaurantService();
