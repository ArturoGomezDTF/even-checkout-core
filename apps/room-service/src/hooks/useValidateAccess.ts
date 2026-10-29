import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useRestaurant } from "../context/RestaurantContext";
import { useRoom } from "../context/RoomContext";
import { restaurantService } from "../services/restaurant.service";
import {
  getValidationFromCache,
  setValidationCache,
} from "../utils/validationCache";
import { storePromoCode } from "../utils/promoCode";

export function useValidateAccess() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { setRestaurantId, setBranchNumber } = useRestaurant();
  const { dispatch } = useRoom();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(true);

  const restaurantId = params?.restaurantId as string;
  const branchNumber = params?.branchNumber as string;
  const roomNumber = searchParams?.get("room");
  const promoCode = searchParams?.get("promo");

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

      // Validar roomNumber
      if (!roomNumber) {
        console.error("❌ Error en número de mesa");
        router.push("/");
        return;
      }

      // Establecer contextos
      setRestaurantId(parseInt(restaurantId));
      setBranchNumber(parseInt(branchNumber));
      dispatch({ type: "SET_ROOM_NUMBER", payload: roomNumber });

      // QR de promo exclusiva: se cachea una sola vez, sobrevive aunque el
      // query param no vaya en cada navegación posterior.
      if (promoCode) {
        storePromoCode(parseInt(restaurantId), parseInt(branchNumber), promoCode);
      }

      try {
        const restId = parseInt(restaurantId);
        const branchNum = parseInt(branchNumber);
        const roomNum = roomNumber;
        const service = "room-service";

        const cachedResult = getValidationFromCache(
          restId,
          branchNum,
          roomNum,
          service,
        );
        if (cachedResult !== null) {
          if (!cachedResult.valid) {
            setValidationError(cachedResult.error || "VALIDATION_ERROR");
          } else {
            setValidationError(null);
          }
          setIsValidating(false);
          return;
        }

        const validation = await restaurantService.validateRestaurantBranchRoom(
          restId,
          branchNum,
          roomNum,
          service,
        );

        if (validation.valid) {
          setValidationCache(
            restId,
            branchNum,
            roomNum,
            { valid: true },
            service,
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
    roomNumber,
    promoCode,
    dispatch,
    setRestaurantId,
    setBranchNumber,
    router,
  ]);

  return {
    validationError,
    isValidating,
    restaurantId: parseInt(restaurantId || "0"),
    branchNumber: parseInt(branchNumber || "0"),
    roomNumber,
  };
}
