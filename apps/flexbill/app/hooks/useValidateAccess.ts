import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useRestaurant } from "../context/RestaurantContext";
import { useTable } from "../context/TableContext";
import { restaurantService } from "../services/restaurant.service";
import {
  getValidationFromCache,
  setValidationCache,
} from "../utils/validationCache";

interface UseValidateAccessOptions {
  // Para pantallas post-pago (ej. payment-success): pagar revoca la sesión
  // de mesa de inmediato, y esas pantallas no necesitan poder ordenar — solo
  // afecta este gate de UX, el gate real de creación de orden no cambia.
  skipSessionCheck?: boolean;
}

export function useValidateAccess(options?: UseValidateAccessOptions) {
  const skipSessionCheck = options?.skipSessionCheck ?? false;
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { setRestaurantId, setBranchNumber } = useRestaurant();
  const { dispatch } = useTable();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(true);

  const restaurantId = params?.restaurantId as string;
  const branchNumber = params?.branchNumber as string;
  const tableNumber = searchParams?.get("table");
  const sessionToken =
    searchParams?.get("session") ??
    (typeof window !== "undefined"
      ? localStorage.getItem("even-table-session")
      : null);

  useEffect(() => {
    const validateAndSetup = async () => {
      // Validar restaurantId
      if (!restaurantId || isNaN(parseInt(restaurantId))) {
        console.error("❌ Error en restaurant ID");
        router.push("/");
        return;
      }

      // Validar branchNumber
      if (!branchNumber || isNaN(parseInt(branchNumber))) {
        console.error("❌ Error en número de sucursal");
        router.push("/");
        return;
      }

      // Validar tableNumber
      if (!tableNumber) {
        console.error("❌ Error en número de mesa");
        router.push("/");
        return;
      }

      // Establecer contextos
      setRestaurantId(parseInt(restaurantId));
      setBranchNumber(parseInt(branchNumber));
      dispatch({ type: "SET_TABLE_NUMBER", payload: tableNumber });

      // Validar que el restaurante, sucursal y mesa existen y que el servicio "flex-bill" esté disponible
      const restId = parseInt(restaurantId);
      const branchNum = parseInt(branchNumber);
      const tableNum = tableNumber;
      const service = "flex-bill";

      try {
        // Primero verificar si hay un resultado en caché (no aplica cuando
        // se salta el chequeo de sesión — esas pantallas no dependen de él)
        const cachedResult = skipSessionCheck
          ? null
          : getValidationFromCache(
              restId,
              branchNum,
              tableNum,
              service,
              sessionToken ?? undefined,
            );

        if (cachedResult != null) {
          // Usar resultado del caché
          if (!cachedResult.valid) {
            console.error("❌ Validation failed (cached):", cachedResult.error);
            setValidationError(cachedResult.error || "VALIDATION_ERROR");
          } else {
            setValidationError(null);
          }
          setIsValidating(false);
          return;
        }

        // Si no hay caché, hacer la llamada al API
        const validation =
          await restaurantService.validateRestaurantBranchTable(
            restId,
            branchNum,
            tableNum,
            service,
            sessionToken,
            skipSessionCheck,
          );

        // Solo cachear validaciones exitosas, no los errores (y no cuando se
        // saltó el chequeo de sesión, para no contaminar el cache normal)
        if (validation.valid && !skipSessionCheck) {
          setValidationCache(
            restId,
            branchNum,
            tableNum,
            { valid: true },
            service,
            sessionToken ?? undefined,
          );
        }

        if (!validation.valid) {
          console.error("❌ Validation failed:", validation.error);
          setValidationError(validation.error || "VALIDATION_ERROR");
        } else {
          setValidationError(null);
        }
      } catch (err) {
        console.error("❌ Validation error:", err);
        setValidationError("VALIDATION_ERROR");
      } finally {
        setIsValidating(false);
      }
    };

    validateAndSetup();
  }, [
    restaurantId,
    branchNumber,
    tableNumber,
    sessionToken,
    skipSessionCheck,
    dispatch,
    setRestaurantId,
    setBranchNumber,
    router,
  ]);

  return {
    validationError,
    isValidating,
    restaurantId,
    branchNumber,
    tableNumber,
  };
}
