"use client";

import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { useRestaurant } from "../context/RestaurantContext";

/**
 * Hook de navegación para Pick & Go
 * Maneja navegación con restaurantId y branchNumber (query param)
 */
export function useNavigation() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { restaurantId } = useRestaurant();

  // Obtener restaurantId de params o del contexto
  const currentRestaurantId = params?.restaurantId || restaurantId;

  // Obtener branchNumber actual de los query params
  const currentBranchNumber = searchParams.get("branch");

  /**
   * Navegar manteniendo el contexto del restaurante y branch
   * @param path - Ruta a navegar (ej: "/menu", "/cart", "/dish/123")
   * @param options - Opciones de navegación
   */
  const navigateWithRestaurantId = useCallback(
    (
      path: string,
      options?: {
        replace?: boolean;
        branchNumber?: number | string | null;
        preserveBranch?: boolean;
      }
    ) => {
      const { replace = false, branchNumber, preserveBranch = true } = options || {};

      if (!currentRestaurantId) {
        console.warn(
          "No restaurant ID found, navigating without restaurant context"
        );
        if (replace) {
          router.replace(path);
        } else {
          router.push(path);
        }
        return;
      }

      // Construir la URL completa con restaurantId
      let fullPath = path;
      if (!path.startsWith(`/${currentRestaurantId}/`)) {
        // Remover el primer slash si existe para evitar dobles slashes
        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        fullPath = `/${currentRestaurantId}/${cleanPath}`;
      }

      // Agregar branchNumber como query param si está disponible
      const finalBranchNumber = branchNumber !== undefined ? branchNumber : (preserveBranch ? currentBranchNumber : null);

      if (finalBranchNumber) {
        const separator = fullPath.includes("?") ? "&" : "?";
        fullPath = `${fullPath}${separator}branch=${finalBranchNumber}`;
      }

      if (replace) {
        router.replace(fullPath);
      } else {
        router.push(fullPath);
      }
    },
    [router, currentRestaurantId, currentBranchNumber]
  );

  /**
   * Navegar a la página de detalle de un producto
   * @param dishId - ID del producto
   * @param replace - Si usar replace en lugar de push (default: false)
   */
  const navigateToDish = useCallback(
    (dishId: string | number, replace: boolean = false) => {
      navigateWithRestaurantId(`/dish/${dishId}`, { replace });
    },
    [navigateWithRestaurantId]
  );

  /**
   * Navegar hacia atrás con contexto
   * Si no hay restaurantId, usa router.back()
   * Si hay restaurantId, navega al menú principal
   */
  const goBack = useCallback(() => {
    if (!currentRestaurantId) {
      router.back();
      return;
    }

    // Navegar al menú principal del restaurante
    navigateWithRestaurantId("/menu");
  }, [router, currentRestaurantId, navigateWithRestaurantId]);

  /**
   * Construir URL completa con restaurantId sin navegar
   * @param path - Ruta relativa
   * @returns URL completa con restaurantId
   */
  const getUrlWithRestaurantId = useCallback(
    (path: string) => {
      if (!currentRestaurantId) {
        return path;
      }

      // Construir la URL con restaurantId
      let fullPath = path;
      if (!path.startsWith(`/${currentRestaurantId}/`)) {
        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        fullPath = `/${currentRestaurantId}/${cleanPath}`;
      }

      return fullPath;
    },
    [currentRestaurantId]
  );

  /**
   * Navegar al carrito del restaurante
   */
  const navigateToCart = useCallback(() => {
    navigateWithRestaurantId("/cart");
  }, [navigateWithRestaurantId]);

  /**
   * Navegar al menú del restaurante
   */
  const navigateToMenu = useCallback(() => {
    navigateWithRestaurantId("/menu");
  }, [navigateWithRestaurantId]);

  /**
   * Navegar a la página de confirmación de pedido
   */
  const navigateToOrderConfirmation = useCallback(() => {
    navigateWithRestaurantId("/order-confirmation");
  }, [navigateWithRestaurantId]);

  /**
   * Cambiar de sucursal (actualiza el query param en la URL actual)
   */
  const changeBranch = useCallback(
    (branchNumber: number | null) => {
      if (typeof window === "undefined") return;

      const currentPath = window.location.pathname;
      const currentSearch = window.location.search;
      const searchParams = new URLSearchParams(currentSearch);

      if (branchNumber) {
        searchParams.set("branch", branchNumber.toString());
      } else {
        searchParams.delete("branch");
      }

      const newSearch = searchParams.toString();
      const newUrl = newSearch ? `${currentPath}?${newSearch}` : currentPath;

      router.push(newUrl);
    },
    [router]
  );

  return {
    // Estado
    restaurantId: currentRestaurantId,
    hasRestaurant: !!currentRestaurantId,
    branchNumber: currentBranchNumber ? parseInt(currentBranchNumber) : null,

    // Navegación general
    navigateWithRestaurantId,
    goBack,
    getUrlWithRestaurantId,
    changeBranch,

    // Navegación específica para Pick & Go
    navigateToDish,
    navigateToCart,
    navigateToMenu,
    navigateToOrderConfirmation,
  };
}

// Re-export para compatibilidad (opcional, si queremos mantener el nombre)
export { useNavigation as usePickAndGoNavigation };