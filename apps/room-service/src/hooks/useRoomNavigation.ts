"use client";

import { useRouter, useSearchParams, useParams } from "next/navigation";
import { useCallback } from "react";
import { useRestaurant } from "../context/RestaurantContext";

export function useRoomNavigation() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const { restaurantId, branchNumber } = useRestaurant();

  const roomNumber = searchParams?.get("room");

  // Obtener restaurantId y branchNumber de params o del contexto
  const currentRestaurantId = params?.restaurantId || restaurantId;
  const currentBranchNumber = params?.branchNumber || branchNumber;

  // Función para navegar manteniendo el parámetro room, restaurantId y branchNumber
  const navigateWithRoom = useCallback(
    (path: string, replace: boolean = false) => {
      if (!roomNumber) {
        console.warn(
          "No room number found in URL, navigating without room context"
        );
        if (replace) {
          router.replace(path);
        } else {
          router.push(path);
        }
        return;
      }

      if (!currentRestaurantId || !currentBranchNumber) {
        console.warn(
          "No restaurant ID or branch number found, navigating without full context"
        );
        const separator = path.includes("?") ? "&" : "?";
        const newUrl = `${path}${separator}room=${roomNumber}`;

        if (replace) {
          router.replace(newUrl);
        } else {
          router.push(newUrl);
        }
        return;
      }

      // Construir la URL con restaurantId, branchNumber y room
      // Si el path ya incluye la estructura completa, no agregarlo
      let fullPath = path;
      if (!path.startsWith(`/${currentRestaurantId}/${currentBranchNumber}/`)) {
        // Remover el primer slash si existe
        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        fullPath = `/${currentRestaurantId}/${currentBranchNumber}/${cleanPath}`;
      }

      // Verificar si ya existe un query string en el path
      const separator = fullPath.includes("?") ? "&" : "?";
      const newUrl = `${fullPath}${separator}room=${roomNumber}`;

      if (replace) {
        router.replace(newUrl);
      } else {
        router.push(newUrl);
      }
    },
    [router, roomNumber, currentRestaurantId, currentBranchNumber]
  );

  // Función para ir hacia atrás manteniendo el contexto de mesa
  const goBack = useCallback(() => {
    if (!roomNumber || !currentRestaurantId || !currentBranchNumber) {
      router.back();
      return;
    }

    // En lugar de router.back(), navegar a la página principal del menú
    navigateWithRoom("/menu");
  }, [
    router,
    roomNumber,
    currentRestaurantId,
    currentBranchNumber,
    navigateWithRoom,
  ]);

  // Función para obtener URL completa con restaurantId, branchNumber y room parameter
  const getUrlWithRoom = useCallback(
    (path: string) => {
      if (!roomNumber || !currentRestaurantId || !currentBranchNumber) {
        return path;
      }

      // Construir la URL con restaurantId y branchNumber
      let fullPath = path;
      if (!path.startsWith(`/${currentRestaurantId}/${currentBranchNumber}/`)) {
        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        fullPath = `/${currentRestaurantId}/${currentBranchNumber}/${cleanPath}`;
      }

      return `${fullPath}?room=${roomNumber}`;
    },
    [roomNumber, currentRestaurantId, currentBranchNumber]
  );

  return {
    roomNumber,
    restaurantId: currentRestaurantId,
    branchNumber: currentBranchNumber,
    navigateWithRoom,
    goBack,
    getUrlWithRoom,
    hasRoom: !!roomNumber,
    hasRestaurant: !!currentRestaurantId,
    hasBranch: !!currentBranchNumber,
  };
}
