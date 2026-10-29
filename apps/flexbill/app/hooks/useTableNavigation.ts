'use client';

import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { useCallback } from 'react';
import { useRestaurant } from '../context/RestaurantContext';

export function useTableNavigation() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const { restaurantId, branchNumber: contextBranchNumber } = useRestaurant();

  const tableNumber = searchParams?.get('table');

  // Obtener restaurantId y branchNumber de params o del contexto
  const currentRestaurantId = params?.restaurantId || restaurantId;
  const currentBranchNumber = params?.branchNumber || contextBranchNumber;

  // Función para navegar manteniendo el parámetro table, restaurantId y branchNumber
  const navigateWithTable = useCallback((path: string, replace: boolean = false) => {
    if (!tableNumber) {
      console.warn('No table number found in URL, navigating without table context');
      if (replace) {
        router.replace(path);
      } else {
        router.push(path);
      }
      return;
    }

    if (!currentRestaurantId) {
      console.warn('No restaurant ID found, navigating without restaurant context');
      const separator = path.includes('?') ? '&' : '?';
      const newUrl = `${path}${separator}table=${tableNumber}`;

      if (replace) {
        router.replace(newUrl);
      } else {
        router.push(newUrl);
      }
      return;
    }

    if (!currentBranchNumber) {
      console.warn('No branch number found, navigating without branch context');
      const separator = path.includes('?') ? '&' : '?';
      const newUrl = `${path}${separator}table=${tableNumber}`;

      if (replace) {
        router.replace(newUrl);
      } else {
        router.push(newUrl);
      }
      return;
    }

    // Construir la URL con restaurantId, branchNumber y table
    // Si el path ya incluye el restaurantId y branchNumber (empieza con /), no agregarlo
    let fullPath = path;
    if (!path.startsWith(`/${currentRestaurantId}/`)) {
      // Remover el primer slash si existe
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      fullPath = `/${currentRestaurantId}/${currentBranchNumber}/${cleanPath}`;
    }

    // Verificar si ya existe un query string en el path
    const separator = fullPath.includes('?') ? '&' : '?';
    const newUrl = `${fullPath}${separator}table=${tableNumber}`;

    if (replace) {
      router.replace(newUrl);
    } else {
      router.push(newUrl);
    }
  }, [router, tableNumber, currentRestaurantId, currentBranchNumber]);

  // Función para ir hacia atrás manteniendo el contexto de mesa
  const goBack = useCallback(() => {
    if (!tableNumber || !currentRestaurantId || !currentBranchNumber) {
      router.back();
      return;
    }

    // En lugar de router.back(), navegar a la página principal del menú
    navigateWithTable('/menu');
  }, [router, tableNumber, currentRestaurantId, currentBranchNumber, navigateWithTable]);

  // Función para obtener URL completa con restaurantId, branchNumber y table parameter
  const getUrlWithTable = useCallback((path: string) => {
    if (!tableNumber || !currentRestaurantId || !currentBranchNumber) {
      return path;
    }

    // Construir la URL con restaurantId y branchNumber
    let fullPath = path;
    if (!path.startsWith(`/${currentRestaurantId}/`)) {
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      fullPath = `/${currentRestaurantId}/${currentBranchNumber}/${cleanPath}`;
    }

    return `${fullPath}?table=${tableNumber}`;
  }, [tableNumber, currentRestaurantId, currentBranchNumber]);

  return {
    tableNumber,
    restaurantId: currentRestaurantId,
    branchNumber: currentBranchNumber,
    navigateWithTable,
    goBack,
    getUrlWithTable,
    hasTable: !!tableNumber,
    hasRestaurant: !!currentRestaurantId,
    hasBranch: !!currentBranchNumber
  };
}