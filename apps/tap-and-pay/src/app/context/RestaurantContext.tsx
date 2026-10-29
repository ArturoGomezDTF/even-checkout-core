"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useParams } from "next/navigation";
import { Restaurant, Branch, RestaurantParams } from "../types/restaurant";
import { restaurantService } from "../services/restaurant.service";
import { authService } from "../services/auth.service";

interface RestaurantContextType {
  restaurant: Restaurant | null;
  branch: Branch | null;
  params: RestaurantParams | null;
  loading: boolean;
  error: string | null;
  setRestaurant: (restaurant: Restaurant) => void;
  setBranch: (branch: Branch) => void;
  setParams: (params: RestaurantParams) => void;
  clearRestaurant: () => void;
}

const RestaurantContext = createContext<RestaurantContextType | undefined>(
  undefined,
);

export const RestaurantProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [params, setParamsState] = useState<RestaurantParams | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const clearRestaurant = useCallback(() => {
    setRestaurant(null);
    setBranch(null);
    setParamsState(null);
    setError(null);
  }, []);

  // Función para establecer params y disparar la carga del restaurante
  const setParams = useCallback((newParams: RestaurantParams) => {
    setParamsState(newParams);
  }, []);

  // Cargar datos del restaurante cuando cambian los params
  useEffect(() => {
    const fetchRestaurant = async () => {
      if (!params?.restaurantId || !params?.branchNumber) {
        return;
      }

      // Si ya tenemos el restaurante cargado para estos params, no recargar
      if (restaurant && restaurant.id === parseInt(params.restaurantId)) {
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const restaurantData = await restaurantService.getRestaurantByBranch(
          parseInt(params.restaurantId),
          parseInt(params.branchNumber),
        );

        setRestaurant(restaurantData as Restaurant);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to load restaurant";
        console.error("❌ Error loading restaurant:", errorMessage);
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchRestaurant();
  }, [params?.restaurantId, params?.branchNumber]);

  // El service no puede leer este contexto, así que se le inyecta. Sale de la
  // ruta y no del `params` de arriba, que sólo lo pueblan las pantallas del
  // flujo de pago: el alta puede ocurrir entrando directo a /auth.
  const routeParams = useParams();
  useEffect(() => {
    const restaurantId = parseInt(String(routeParams?.restaurantId), 10);
    const branchNumber = parseInt(String(routeParams?.branchNumber), 10);
    authService.setRestaurantId(
      Number.isNaN(restaurantId) ? null : restaurantId,
    );
    authService.setBranchNumber(
      Number.isNaN(branchNumber) ? null : branchNumber,
    );
  }, [routeParams?.restaurantId, routeParams?.branchNumber]);

  return (
    <RestaurantContext.Provider
      value={{
        restaurant,
        branch,
        params,
        loading,
        error,
        setRestaurant,
        setBranch,
        setParams,
        clearRestaurant,
      }}
    >
      {children}
    </RestaurantContext.Provider>
  );
};

export const useRestaurant = (): RestaurantContextType => {
  const context = useContext(RestaurantContext);
  if (context === undefined) {
    throw new Error("useRestaurant must be used within a RestaurantProvider");
  }
  return context;
};
