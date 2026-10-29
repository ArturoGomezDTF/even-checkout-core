"use client";

import { useParams } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { useNavigation } from "@/hooks/useNavigation";
import { useRestaurant } from "@/context/RestaurantContext";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import { X, ChevronRight, Loader2, CircleAlert } from "lucide-react";
import { createPortal } from "react-dom";
import { useBranch } from "@/context/BranchContext";
import BranchSelectionModal from "@/components/modals/BranchSelectionModal";
import { calculateCommissions } from "@/utils/commissionCalculator";
import { restaurantService } from "@/services/restaurant.service";
import { cartService } from "@/services/cart.service";

export default function OrderConfirmPage() {
  const t = useTranslations("OrderConfirmPage");
  const tc = useTranslations("Common");
  const params = useParams();
  const { setRestaurantId } = useRestaurant();
  const restaurantId = params?.restaurantId as string;

  useEffect(() => {
    if (restaurantId && !isNaN(parseInt(restaurantId))) {
      setRestaurantId(parseInt(restaurantId));
    }
  }, [restaurantId, setRestaurantId]);

  const { state: cartState, refreshCart } = useCart();
  const { navigateWithRestaurantId, changeBranch } = useNavigation();
  const { branches, selectedBranchNumber, fetchBranches } = useBranch();

  const baseAmount = cartState.totalPrice;
  const MINIMUM_AMOUNT = 20;

  const [tipPercentage, setTipPercentage] = useState(10);
  const [customTip, setCustomTip] = useState("");
  const [showCustomTipInput, setShowCustomTipInput] = useState(false);
  const [scheduledPickupTime, setScheduledPickupTime] = useState<string | null>(
    null,
  );
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showBranchChangeConfirmModal, setShowBranchChangeConfirmModal] =
    useState(false);
  const [pendingBranchChange, setPendingBranchChange] = useState<number | null>(
    null,
  );
  const [itemsToRemove, setItemsToRemove] = useState<typeof cartState.items>(
    [],
  );
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const calculateTipAmount = () => {
    if (customTip && parseFloat(customTip) > 0) {
      return parseFloat(customTip);
    }
    return (baseAmount * tipPercentage) / 100;
  };

  const tipAmount = calculateTipAmount();
  const commissions = calculateCommissions(baseAmount, tipAmount);
  const { totalAmountCharged: totalAmount } = commissions;

  const isUnderMinimum = totalAmount < MINIMUM_AMOUNT;

  useEffect(() => {
    const prev = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      width: document.body.style.width,
      height: document.body.style.height,
    };
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.height = "100%";
    return () => {
      document.body.style.overflow = prev.overflow;
      document.body.style.position = prev.position;
      document.body.style.width = prev.width;
      document.body.style.height = prev.height;
    };
  }, []);

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
      navigateWithRestaurantId("/menu", { replace: true });
    }
  }, [
    cartState.hasLoaded,
    cartState.isLoading,
    cartState.items.length,
    navigateWithRestaurantId,
  ]);

  useEffect(() => {
    if (restaurantId) {
      fetchBranches(parseInt(restaurantId));
    }
  }, [restaurantId, fetchBranches]);

  const handleTipPercentage = (percentage: number) => {
    setTipPercentage(percentage);
    setCustomTip("");
  };

  const handleCustomTipChange = (value: string) => {
    setCustomTip(value);
    setTipPercentage(0);
  };

  const checkItemsAvailability = async (newBranchNumber: number) => {
    setIsCheckingAvailability(true);
    try {
      const menuData = await restaurantService.getRestaurantWithMenuByBranch(
        parseInt(restaurantId),
        newBranchNumber,
      );
      const availableMenuItemIds = new Set<number>();
      menuData.menu.forEach((section) => {
        section.items.forEach((item) => {
          availableMenuItemIds.add(item.id);
        });
      });
      const unavailableItems = cartState.items.filter(
        (cartItem) => !availableMenuItemIds.has(cartItem.id),
      );
      setItemsToRemove(unavailableItems);
      return unavailableItems;
    } catch (error) {
      console.error("Error checking items availability:", error);
      setItemsToRemove([]);
      return [];
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  const handleContinue = () => {
    if (branches.length > 1 && !selectedBranchNumber) {
      setShowBranchModal(true);
      return;
    }
    const qs = new URLSearchParams();
    qs.set("tipAmount", tipAmount.toFixed(2));
    if (scheduledPickupTime) {
      qs.set("scheduledPickupTime", scheduledPickupTime);
    }
    navigateWithRestaurantId(`/card-selection?${qs.toString()}`);
  };

  if (isLoadingInitial) {
    return (
      <div className="h-screen overflow-hidden brand-evergreen flex flex-col">
        <div className="fixed top-0 left-0 right-0 z-50">
          <MenuHeaderBack />
        </div>
        <div className="h-20" />

        <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center">
          <div className="flex flex-col relative px-4 md:px-6 lg:px-8 w-full">
            {/* Título skeleton */}
            <div className="bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
              <div className="py-6 px-8 flex flex-col justify-center">
                <div className="h-8 w-2/3 bg-white/20 rounded-full mt-2 mb-6 animate-pulse" />
              </div>
            </div>

            {/* Cuerpo skeleton */}
            <div className="bg-white rounded-t-4xl relative z-10 flex flex-col px-8 py-8 gap-4">
              {/* Subtotal row */}
              <div className="flex justify-between items-center">
                <div className="h-4 w-16 bg-gray-200 rounded-full animate-pulse" />
                <div className="h-4 w-24 bg-gray-200 rounded-full animate-pulse" />
              </div>

              {/* Propina label + botones */}
              <div className="flex items-center gap-4">
                <div className="h-4 w-16 bg-gray-200 rounded-full animate-pulse flex-shrink-0" />
                <div className="grid grid-cols-5 gap-2 flex-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-8 bg-gray-100 rounded-full animate-pulse"
                    />
                  ))}
                </div>
              </div>

              {/* Total row */}
              <div className="flex justify-between items-center border-t pt-4">
                <div className="h-5 w-28 bg-gray-200 rounded-full animate-pulse" />
                <div className="h-5 w-28 bg-gray-200 rounded-full animate-pulse" />
              </div>

              {/* Botón continuar */}
              <div className="h-12 w-full bg-gray-200 rounded-full animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden brand-evergreen flex flex-col">
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
            {/* Sucursal */}
            {branches.length > 0 && (
              <div
                className={`mb-4 flex items-center justify-between w-full ${branches.length > 1 ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
                onClick={() => branches.length > 1 && setShowBranchModal(true)}
              >
                {selectedBranchNumber ? (
                  <p className="text-gray-600 text-base">
                    {tc("branchLabel")}{" "}
                    <span className="font-medium text-black">
                      {branches.find(
                        (b) => b.branch_number === selectedBranchNumber,
                      )?.name || tc("defaultBranchName")}
                    </span>
                  </p>
                ) : (
                  <p className="text-gray-600 text-sm md:text-base font-medium">
                    {tc("selectBranch")}
                  </p>
                )}
                {branches.length > 1 && (
                  <ChevronRight className="size-4 md:size-5 text-gray-600 flex-shrink-0" />
                )}
              </div>
            )}

            {/* Hora de recolección */}
            {/*<PickupTimeSelector
              selectedTime={scheduledPickupTime}
              onTimeChange={setScheduledPickupTime}
              estimatedMinutes={25}
            />*/}

            {/* Subtotal */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-black font-medium">{tc("subtotal")}</span>
                <span className="text-black font-medium">
                  ${baseAmount.toFixed(2)} MXN
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
                      className={`py-1 md:py-1.5 lg:py-2 rounded-full border border-stroke/40 text-black transition-colors cursor-pointer ${
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
                    className={`py-1 md:py-1.5 lg:py-2 rounded-full border border-stroke/40 text-black transition-colors cursor-pointer ${
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
                    <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-black text-sm">
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
                      className="w-full pl-8 pr-4 py-1 md:py-1.5 lg:py-2 border border-stroke/40 rounded-full focus:outline-none focus:ring focus:ring-gray-400 focus:border-transparent text-black text-center bg-surface [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                    />
                  </div>
                </div>
              )}

              {tipAmount > 0 && (
                <div className="flex justify-end items-center mt-2 text-sm">
                  <span className="text-even-grass font-medium">
                    +${tipAmount.toFixed(2)} MXN
                  </span>
                </div>
              )}
            </div>

            {/* Alerta mínimo */}
            {isUnderMinimum && totalAmount > 0 && (
              <div className="bg-red-50 px-6 py-3 -mx-8 rounded-lg">
                <div className="flex justify-center items-center gap-3">
                  <X className="size-6 text-red-500 flex-shrink-0" />
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
              disabled={
                isUnderMinimum || (branches.length > 1 && !selectedBranchNumber)
              }
              className={`w-full text-even-evergreen py-3 rounded-full cursor-pointer transition-all active:scale-90 ${
                isUnderMinimum || (branches.length > 1 && !selectedBranchNumber)
                  ? "bg-even-grass opacity-50 cursor-not-allowed"
                  : "bg-even-grass animate-pulse-button"
              }`}
            >
              {branches.length > 1 && !selectedBranchNumber
                ? tc("selectBranch")
                : t("continueCta")}
            </button>
          </div>
        </div>
      </div>

      {/* Modal de confirmación de cambio de sucursal */}
      {showBranchChangeConfirmModal && (
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{ zIndex: 99999 }}
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (!isCheckingAvailability) {
                setShowBranchChangeConfirmModal(false);
                setPendingBranchChange(null);
                setItemsToRemove([]);
              }
            }}
          />
          <div className="relative bg-white rounded-t-4xl w-full mx-4">
            {isCheckingAvailability ? (
              <div className="px-6 py-8 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-even-evergreen" />
                <p className="text-gray-600 text-base">
                  {t("verifyingAvailability")}
                </p>
              </div>
            ) : (
              <>
                <div className="px-6 py-4">
                  {itemsToRemove.length > 0 ? (
                    <>
                      <p className="text-gray-600 text-base mb-4">
                        {tc("itemsUnavailableIntro")}
                      </p>
                      <div className="bg-red-50 rounded-lg p-4 mb-4 max-h-48 overflow-y-auto">
                        <ul className="space-y-2 text-left">
                          {itemsToRemove.map((item) => (
                            <li
                              key={item.cartItemId || item.id}
                              className="flex items-start gap-2 text-sm"
                            >
                              <X className="size-4 text-red-500 flex-shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">
                                  {item.name}
                                </p>
                                <p className="text-gray-600 text-xs">
                                  {tc("itemQuantityLabel", {
                                    quantity: item.quantity,
                                  })}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <p className="text-gray-600 text-sm mb-4">
                        {tc("otherItemsKept")}
                      </p>
                    </>
                  ) : (
                    <p className="text-gray-600 text-base mb-4">
                      {t("allItemsAvailable")}
                    </p>
                  )}
                </div>
                <div className="px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white">
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowBranchChangeConfirmModal(false);
                        setPendingBranchChange(null);
                        setItemsToRemove([]);
                      }}
                      className="flex-1 py-3 px-4 border border-gray-300 rounded-full text-black font-medium hover:bg-gray-50 transition-colors"
                    >
                      {tc("cancel")}
                    </button>
                    <button
                      onClick={async () => {
                        if (pendingBranchChange !== null) {
                          try {
                            setIsCheckingAvailability(true);
                            for (const item of itemsToRemove) {
                              if (item.cartItemId) {
                                try {
                                  await cartService.removeFromCart(
                                    item.cartItemId,
                                  );
                                } catch (error) {
                                  console.error(
                                    "Error removing unavailable item:",
                                    error,
                                  );
                                }
                              }
                            }
                            changeBranch(pendingBranchChange);
                            await refreshCart();
                            setIsCheckingAvailability(false);
                            setShowBranchChangeConfirmModal(false);
                            setShowBranchModal(false);
                            setPendingBranchChange(null);
                            setItemsToRemove([]);
                          } catch (error) {
                            console.error("Error during branch change:", error);
                            setIsCheckingAvailability(false);
                            setErrorMessage(t("errorChangeBranch"));
                          }
                        }
                      }}
                      className="flex-1 py-3 px-4 bg-even-grass rounded-full text-even-evergreen font-medium hover:opacity-90 transition-opacity"
                    >
                      {t("continueCta")}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorMessage &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-end justify-center bg-black/50"
            onClick={() => setErrorMessage(null)}
          >
            <div
              className="bg-white rounded-t-4xl w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 max-w-2xl mx-auto">
                <div className="flex flex-col items-center mb-4">
                  <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
                    <CircleAlert
                      className="size-7 text-red-500"
                      strokeWidth={2}
                    />
                  </div>
                  <h2 className="text-xl font-semibold text-black text-center">
                    {tc("errorTitle")}
                  </h2>
                </div>
                <div className="bg-surface border border-stroke-soft/50 rounded-xl p-4 mb-6">
                  <p className="text-gray-700 text-sm text-center">
                    {errorMessage}
                  </p>
                </div>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="w-full bg-even-grass text-even-evergreen py-3 rounded-full text-base"
                >
                  {tc("understood")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Modal selección de sucursal */}
      <BranchSelectionModal
        isOpen={showBranchModal}
        onClose={() => setShowBranchModal(false)}
        onBranchChangeRequested={async (newBranchNumber) => {
          setPendingBranchChange(newBranchNumber);
          setShowBranchModal(false);
          setShowBranchChangeConfirmModal(true);
          setIsCheckingAvailability(true);
          await checkItemsAvailability(newBranchNumber);
        }}
      />
    </div>
  );
}
