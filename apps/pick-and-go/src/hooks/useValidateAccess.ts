import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useRestaurant } from "../context/RestaurantContext";
import { restaurantService } from "../services/restaurant.service";
import {
  getValidationFromCache,
  setValidationCache,
} from "../utils/validationCache";
import { storePromoCode } from "../utils/promoCode";

/**
 * Hook para validar acceso a restaurante y sucursal en Pick & Go
 * Valida que el restaurante exista y tenga sucursales activas
 * La sucursal se maneja como query param (?branch=X)
 */
export function useValidateAccess() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { setRestaurantId } = useRestaurant();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(true);

  const restaurantId = params?.restaurantId as string;
  const branchNumber = searchParams?.get("branch");
  const promoCode = searchParams?.get("promo");

  useEffect(() => {
    const validateAndSetup = async () => {
      try {
        // Validar restaurantId
        if (!restaurantId || isNaN(parseInt(restaurantId))) {
          console.error("❌ Invalid restaurant ID");
          setValidationError("RESTAURANT_NOT_FOUND");
          setIsValidating(false);
          return;
        }

        // Establecer restaurantId en el contexto
        setRestaurantId(parseInt(restaurantId));

        const restId = parseInt(restaurantId);
        const branchNum = branchNumber ? parseInt(branchNumber) : 0;
        const service = "pick-n-go";

        // QR de promo exclusiva: se cachea una sola vez, sobrevive aunque
        // el query param no vaya en cada navegación posterior.
        if (promoCode && branchNum) {
          storePromoCode(restId, branchNum, promoCode);
        }

        const cachedResult = getValidationFromCache(restId, branchNum, service);
        if (cachedResult !== null) {
          if (!cachedResult.valid) {
            setValidationError(cachedResult.error || "VALIDATION_ERROR");
          } else {
            setValidationError(null);
          }
          setIsValidating(false);
          return;
        }

        const validation = await restaurantService.validateRestaurantAndBranch(
          restId,
          branchNumber ? branchNum : null,
          service,
        );

        if (validation.valid) {
          setValidationCache(restId, branchNum, { valid: true }, service);
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
  }, [restaurantId, branchNumber, promoCode, setRestaurantId]);

  return {
    validationError,
    isValidating,
    restaurantId: parseInt(restaurantId || "0"),
    branchNumber: branchNumber ? parseInt(branchNumber) : null,
  };
}
