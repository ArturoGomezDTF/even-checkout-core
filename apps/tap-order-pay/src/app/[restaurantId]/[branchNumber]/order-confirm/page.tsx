"use client";

import { useTranslations } from "next-intl";
import { useCart } from "@/context/CartContext";
import { useTableNavigation } from "@/hooks/useTableNavigation";
import { useValidateAccess } from "@/hooks/useValidateAccess";
import { useEffect, useMemo, useState } from "react";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import { X } from "lucide-react";
import ValidationError from "@/components/ValidationError";
import {
  calculateCommissions,
  getDisplaySubtotal,
  getDisplayTip,
  resolveTipAmountForTargetDisplay,
} from "@/utils/commissionCalculator";

export default function OrderConfirmPage() {
  const t = useTranslations("OrderConfirmPage");
  const tc = useTranslations("Common");
  const { validationError } = useValidateAccess();
  const { state: cartState } = useCart();
  const { navigateWithTable } = useTableNavigation();

  const baseAmount = cartState.totalPrice;
  const MINIMUM_AMOUNT = 20;

  const [tipPercentage, setTipPercentage] = useState(10);
  const [customTip, setCustomTip] = useState("");
  const [showCustomTipInput, setShowCustomTipInput] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);

  // Subtotal fijo — consumo + su propia comisión, redondeado por ítem (ver
  // getDisplaySubtotal). No se mueve cuando el cliente cambia cuánto quiere
  // dar de propina; la propina absorbe la comisión adicional que genera.
  const displaySubtotal = useMemo(
    () => getDisplaySubtotal(cartState.items),
    [cartState.items],
  );

  // Lo que el comensal quiere ver como "Propina": el % elegido sobre el
  // subtotal fijo y, en "Otro", literal lo que tecleó. Ya incluye la comisión
  // de la propina (sin línea aparte; ver convención en commissionCalculator.ts).
  const targetDisplayPropina = useMemo(() => {
    if (customTip && parseFloat(customTip) > 0) return parseFloat(customTip);
    return Math.round(((displaySubtotal * tipPercentage) / 100) * 100) / 100;
  }, [customTip, displaySubtotal, tipPercentage]);

  // Propina real que se cobra y viaja al backend/POS: la mostrada menos la
  // comisión que genera. Con "Otro" $50 llegan ~$48.86 al POS, no $50 (decisión
  // de #56, documentada en commissionCalculator.ts).
  const tipAmount = useMemo(
    () =>
      resolveTipAmountForTargetDisplay(
        (tip) => calculateCommissions(baseAmount, tip),
        displaySubtotal,
        targetDisplayPropina,
      ),
    [baseAmount, displaySubtotal, targetDisplayPropina],
  );

  const rawCommissions = useMemo(
    () => calculateCommissions(baseAmount, tipAmount),
    [baseAmount, tipAmount],
  );

  // Sin propina, Total debe ser exactamente el Subtotal fijo — pero
  // calculateCommissions usa una tasa sobre el crudo sin redondear y
  // redondea una sola vez al final, mientras displaySubtotal redondea por
  // ítem (ver comentario en getDisplaySubtotal). Sin esto, "0%" mostraba una
  // "propina fantasma" de $0.01. Mismo fix que tip-selection en even-flexbill.
  const commissions = useMemo(() => {
    if (
      tipAmount === 0 &&
      rawCommissions.totalAmountCharged !== displaySubtotal
    ) {
      return {
        ...rawCommissions,
        evenClientCharge:
          Math.round(
            (rawCommissions.evenClientCharge -
              (rawCommissions.totalAmountCharged - displaySubtotal)) *
              100,
          ) / 100,
        totalAmountCharged: displaySubtotal,
      };
    }
    return rawCommissions;
  }, [rawCommissions, tipAmount, displaySubtotal]);

  const { totalAmountCharged: totalAmount } = commissions;

  // Propina mostrada = Total - Subtotal (cuadra con targetDisplayPropina).
  const displayTip = getDisplayTip(totalAmount, displaySubtotal);

  const isUnderMinimum = totalAmount < MINIMUM_AMOUNT;

  useEffect(() => {
    if (!cartState.isLoading) {
      setIsLoadingInitial(false);
    }
  }, [cartState.isLoading]);

  // Red de seguridad: si se llega acá con el carrito vacío (link viejo,
  // navegación stale, etc.) no hay nada que confirmar, así que se manda
  // al usuario de vuelta al menú. hasLoaded evita rebotar por un carrito que
  // todavía no se ha resuelto contra el backend: al montar esta página el
  // estado arranca vacío y este efecto corre ANTES que el del CartProvider.
  useEffect(() => {
    if (
      cartState.hasLoaded &&
      !cartState.isLoading &&
      cartState.items.length === 0
    ) {
      navigateWithTable("/menu", true);
    }
  }, [
    cartState.hasLoaded,
    cartState.isLoading,
    cartState.items.length,
    navigateWithTable,
  ]);

  const handleTipPercentage = (percentage: number) => {
    setTipPercentage(percentage);
    setCustomTip("");
  };

  const handleCustomTipChange = (value: string) => {
    setCustomTip(value);
    setTipPercentage(0);
  };

  const handleContinue = () => {
    navigateWithTable(`/card-selection?tipAmount=${tipAmount.toFixed(2)}`);
  };

  if (isLoadingInitial) {
    return (
      <div className="min-h-dvh brand-evergreen flex flex-col">
        <div className="fixed top-0 left-0 right-0 z-50">
          <MenuHeaderBack />
        </div>
        <div className="h-20" />

        <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center">
          <div className="flex flex-col relative px-4 md:px-6 lg:px-8 w-full">
            <div className="bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
              <div className="py-6 px-8 flex flex-col justify-center">
                <div className="h-8 w-2/3 bg-white/20 rounded-full mt-2 mb-6 animate-pulse" />
              </div>
            </div>

            <div className="bg-white rounded-t-4xl relative z-10 flex flex-col px-8 py-8 gap-4">
              <div className="flex justify-between items-center">
                <div className="h-4 w-16 bg-gray-200 rounded-full animate-pulse" />
                <div className="h-4 w-24 bg-gray-200 rounded-full animate-pulse" />
              </div>

              <div className="flex items-center gap-4">
                <div className="h-4 w-16 bg-gray-200 rounded-full animate-pulse shrink-0" />
                <div className="grid grid-cols-5 gap-2 flex-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-8 bg-gray-100 rounded-full animate-pulse"
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center border-t pt-4">
                <div className="h-5 w-28 bg-gray-200 rounded-full animate-pulse" />
                <div className="h-5 w-28 bg-gray-200 rounded-full animate-pulse" />
              </div>

              <div className="h-12 w-full bg-gray-200 rounded-full animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  return (
    <div className="min-h-dvh brand-evergreen flex flex-col">
      {/* Header fijo */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <MenuHeaderBack />
      </div>
      <div className="h-20" />

      {/* Tarjeta anclada al fondo */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center">
        <div className="flex flex-col relative px-4 md:px-6 lg:px-8 w-full">
          <div className="bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
            <div className="py-6 px-8 flex flex-col justify-center">
              <h1 className="font-medium text-white text-3xl leading-7 mt-2 mb-6">
                {t("title")}
              </h1>
            </div>
          </div>

          <div className="bg-white rounded-t-4xl relative z-10 flex flex-col px-8 py-8 overflow-y-auto max-h-[calc(100dvh-8rem)]">
            {/* Subtotal */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                  {tc("subtotal")}
                </span>
                <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                  ${displaySubtotal.toFixed(2)} MXN
                </span>
              </div>
            </div>

            {/* Propina */}
            <div className="mb-4">
              <div className="flex items-center gap-4 mb-3">
                <span className="text-black font-medium text-base md:text-lg lg:text-xl whitespace-nowrap">
                  {tc("tip")}
                </span>
                <div className="grid grid-cols-5 gap-2 flex-1">
                  {[0, 10, 15, 20].map((percentage) => (
                    <button
                      key={percentage}
                      onClick={() => {
                        handleTipPercentage(percentage);
                        setShowCustomTipInput(false);
                      }}
                      className={`py-1 md:py-1.5 rounded-full border border-stroke/40 text-black transition-colors cursor-pointer ${
                        tipPercentage === percentage && !showCustomTipInput
                          ? "bg-even-grass text-even-evergreen"
                          : "bg-surface hover:border-gray-400"
                      }`}
                    >
                      {percentage === 0 ? "0%" : `${percentage}%`}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setShowCustomTipInput(true);
                      setTipPercentage(0);
                    }}
                    className={`py-1 md:py-1.5 rounded-full border border-stroke/40 text-black transition-colors cursor-pointer ${
                      showCustomTipInput
                        ? "bg-even-grass text-even-evergreen"
                        : "bg-surface hover:border-gray-400"
                    }`}
                  >
                    $
                  </button>
                </div>
              </div>

              {showCustomTipInput && (
                <div className="flex flex-col gap-2 mb-3">
                  <div className="relative w-full">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-black text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      value={customTip}
                      onChange={(e) => handleCustomTipChange(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      autoFocus
                      className="w-full pl-8 pr-4 py-1 md:py-1.5 border border-stroke/40 rounded-full focus:outline-none focus:ring focus:ring-gray-400 text-black text-center bg-surface [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                    />
                  </div>
                </div>
              )}

              {displayTip > 0 && (
                <div className="flex justify-end items-center mt-2 text-sm">
                  <span className="text-even-grass font-medium">
                    +${displayTip.toFixed(2)} MXN
                  </span>
                </div>
              )}
            </div>

            {/* Alerta mínimo */}
            {isUnderMinimum && totalAmount > 0 && (
              <div className="bg-red-50 px-6 py-3 -mx-8 rounded-lg mb-4">
                <div className="flex justify-center items-center gap-3">
                  <X className="size-6 text-red-500 shrink-0" />
                  <p className="text-red-700 font-medium text-base md:text-lg">
                    {t("minimumAmountWarning", {
                      amount: MINIMUM_AMOUNT.toFixed(2),
                    })}
                  </p>
                </div>
              </div>
            )}

            {/* Total */}
            <div className="flex justify-between items-center border-t pt-4 mb-6">
              <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                {tc("totalToPay")}
              </span>
              <span className="font-medium text-black text-base md:text-lg lg:text-xl">
                ${totalAmount.toFixed(2)} MXN
              </span>
            </div>

            {/* Botón continuar */}
            <button
              onClick={handleContinue}
              disabled={isUnderMinimum}
              className={`w-full text-even-evergreen py-3 rounded-full cursor-pointer transition-all active:scale-90 ${
                isUnderMinimum
                  ? "bg-even-grass opacity-50 cursor-not-allowed"
                  : "bg-even-grass animate-pulse-button"
              }`}
            >
              {t("continueCta")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
