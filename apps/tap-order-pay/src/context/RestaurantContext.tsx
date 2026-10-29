"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useMemo,
} from "react";
import { Restaurant } from "../interfaces/restaurant";
import { MenuSection } from "../interfaces/category";
import { restaurantService } from "../services/restaurant.service";
import { authService } from "../services/auth.service";
import { isRestaurantOpen } from "../utils/restaurantHours";

interface RestaurantContextValue {
  restaurantId: number | null;
  branchNumber: number | null;
  restaurant: Restaurant | null;
  menu: MenuSection[];
  loading: boolean;
  error: string | null;
  isOpen: boolean;
  setRestaurantId: (id: number) => void;
  setBranchNumber: (num: number) => void;
  refetchMenu: () => Promise<void>;
}

const RestaurantContext = createContext<RestaurantContextValue | undefined>(
  undefined,
);

interface RestaurantProviderProps {
  children: ReactNode;
}

export function RestaurantProvider({ children }: RestaurantProviderProps) {
  const [restaurantId, setRestaurantIdState] = useState<number | null>(null);
  const [branchNumber, setBranchNumberState] = useState<number | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menu, setMenu] = useState<MenuSection[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Función para establecer el restaurantId y cargar los datos
  const setRestaurantId = (id: number) => {
    setRestaurantIdState(id);
  };

  // Función para establecer el branchNumber
  const setBranchNumber = (num: number) => {
    setBranchNumberState(num);
  };

  // Función para recargar el menú
  const refetchMenu = async () => {
    if (!restaurantId) return;

    await fetchRestaurantData(restaurantId, branchNumber || undefined);
  };

  // Función para cargar datos del restaurante y menú
  const fetchRestaurantData = async (id: number, branch?: number) => {
    try {
      setLoading(true);
      setError(null);

      if (branch) {
        // Obtener restaurante y menú filtrado por sucursal
        const data = await restaurantService.getRestaurantWithMenuByBranch(
          id,
          branch,
        );

        setRestaurant(data.restaurant);
        setMenu(data.menu);
      } else {
        // Obtener restaurante y menú completo (sin filtrar por sucursal)
        const data = await restaurantService.getRestaurantWithMenu(id);

        setRestaurant(data.restaurant);
        setMenu(data.menu);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load restaurant data";
      console.error("❌ Error loading restaurant data:", errorMessage);
      setError(errorMessage);
      setRestaurant(null);
      setMenu([]);
    } finally {
      setLoading(false);
    }
  };

  // Effect para cargar datos cuando cambia el restaurantId
  useEffect(() => {
    if (restaurantId) {
      fetchRestaurantData(restaurantId, branchNumber || undefined);
    } else {
      // Reset state cuando no hay restaurantId
      setRestaurant(null);
      setMenu([]);
      setError(null);
    }
  }, [restaurantId]);

  // El service no puede leer este contexto, así que se le inyecta (mismo
  // patrón que cart.service.ts) para que `sendPhoneOTP` lo mande.
  useEffect(() => {
    authService.setRestaurantId(restaurantId);
  }, [restaurantId]);

  useEffect(() => {
    authService.setBranchNumber(branchNumber);
  }, [branchNumber]);

  // Check if restaurant is currently open (re-check every minute)
  const isOpen = useMemo(() => {
    return isRestaurantOpen(restaurant?.opening_hours);
  }, [restaurant?.opening_hours]);

  // Re-check restaurant hours every minute
  useEffect(() => {
    const interval = setInterval(() => {
      // Force re-render by updating a dummy state
      setRestaurant((prev) => (prev ? { ...prev } : null));
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  const value: RestaurantContextValue = {
    restaurantId,
    branchNumber,
    restaurant,
    menu,
    loading,
    error,
    isOpen,
    setRestaurantId,
    setBranchNumber,
    refetchMenu,
  };

  return (
    <RestaurantContext.Provider value={value}>
      {children}
    </RestaurantContext.Provider>
  );
}

// Hook personalizado para usar el contexto
export function useRestaurant() {
  const context = useContext(RestaurantContext);

  if (context === undefined) {
    throw new Error("useRestaurant must be used within a RestaurantProvider");
  }

  return context;
}
