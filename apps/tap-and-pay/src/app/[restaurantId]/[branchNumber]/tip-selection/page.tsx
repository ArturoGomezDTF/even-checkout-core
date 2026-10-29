"use client";

import { useSearchParams, useParams } from "next/navigation";
import { useEffect, useState, useMemo, useRef } from "react";
import { useTable } from "@/app/context/TableContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { useRestaurant } from "@/app/context/RestaurantContext";
import MenuHeader from "@/app/components/headers/MenuHeader";
import { CircleAlert, X } from "lucide-react";
import { orderService } from "@/app/services/order.service";
import { calculateCommissions } from "@/app/utils/commissionCalculator";
import { useModalBackClose } from "@/app/hooks/useModalBackClose";
import { useTranslations } from "next-intl";

export default function TipSelectionPage() {
  const t = useTranslations("TipSelectionPage");
  const tc = useTranslations("Common");
  const searchParams = useSearchParams();
  const params = useParams();
  const { state, setTableNumber, loadTableData } = useTable();
  const { tableNumber, navigateWithTable } = useTableNavigation();
  const { setParams, params: restaurantParams } = useRestaurant();

  const paymentType = searchParams.get("type") || "full-bill";
  const amount = searchParams.get("amount");

  const [tipPercentage, setTipPercentage] = useState(10);
  const [customTip, setCustomTip] = useState("");
  const [customPaymentAmount, setCustomPaymentAmount] = useState("");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  // "Dividir cuenta": input local de cantidad de personas, editable — "Tu
  // parte" = total_amount / N, topado a lo que en verdad falta si N ya no
  // corresponde a la realidad (alguien más pagó mientras tanto).
  const [equalPeople, setEqualPeople] = useState("2");
  const [splitStatus, setSplitStatus] = useState<any>(null);
  const [showTotalModal, setShowTotalModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showCustomTipInput, setShowCustomTipInput] = useState(false);

  const loadSplitStatus = async () => {
    if (!state.order?.order_id) return;

    try {
      const response = await orderService.getSplitPaymentStatus(
        state.order.order_id,
      );
      if (response.success && response.data) {
        setSplitStatus(response.data);
      } else {
        setSplitStatus(null);
      }
    } catch (error) {
      console.error("Error loading split status:", error);
      setSplitStatus(null);
    }
  };

  // Establecer restaurantId y branchNumber desde los path params
  useEffect(() => {
    const restaurantId = params?.restaurantId as string;
    const branchNumber = params?.branchNumber as string;

    if (restaurantId && branchNumber) {
      setParams({
        restaurantId,
        branchNumber,
      });
    }
  }, [params, setParams]);

  // Establecer el número de mesa desde los query params
  useEffect(() => {
    const tableParam = searchParams.get("table");
    if (tableParam && tableParam !== state.tableNumber) {
      setTableNumber(tableParam);
    }
  }, [searchParams, setTableNumber, state.tableNumber]);

  // Recargar datos de la mesa
  useEffect(() => {
    const loadData = async () => {
      if (!tableNumber) {
        return;
      }

      if (!restaurantParams?.restaurantId || !restaurantParams?.branchNumber) {
        return;
      }

      if (!state.order) {
        setIsLoading(true);
        await loadTableData();
        await loadSplitStatus();
        setIsLoading(false);
      } else if (state.order?.order_id) {
        if (!state.order.items || state.order.items.length === 0) {
          setIsLoading(true);
          await loadTableData();
          await loadSplitStatus();
          setIsLoading(false);
        } else {
          await loadSplitStatus();
          setIsLoading(false);
        }
      }
    };
    loadData();
  }, [tableNumber, state.order, restaurantParams]);

  // Inicializar customPaymentAmount para choose-amount
  useEffect(() => {
    if (paymentType === "choose-amount" && amount) {
      setCustomPaymentAmount(amount);
    }
  }, [paymentType, amount]);

  // Default de "Dividir cuenta": cantidad de personas activas en la mesa
  // (mínimo 2). Solo se aplica una vez, para no pisar si el usuario ya lo editó.
  const hasSetDefaultPeopleRef = useRef(false);
  useEffect(() => {
    if (
      paymentType === "equal-shares" &&
      !hasSetDefaultPeopleRef.current &&
      state.activeUsers.length > 0
    ) {
      setEqualPeople(String(Math.max(2, state.activeUsers.length)));
      hasSetDefaultPeopleRef.current = true;
    }
  }, [paymentType, state.activeUsers.length]);

  // Red de seguridad: si al terminar de cargar no queda nada pendiente por
  // pagar (cuenta ya saldada / sin orden activa — link viejo, navegación
  // stale, etc.), no hay nada que hacer en esta pantalla, así que se manda
  // de vuelta a la cuenta de la mesa.
  useEffect(() => {
    if (isLoading) return;
    if (!state.order || (state.order.remaining_amount ?? 0) <= 0) {
      navigateWithTable("/order", true);
    }
  }, [isLoading, state.order, navigateWithTable]);

  // El back gesto/botón del dispositivo cierra este modal en vez de salir
  // de la página.
  useModalBackClose(showTotalModal, () => setShowTotalModal(false));

  const dishes = state.order?.items || [];

  const unpaidDishes = dishes.filter(
    (dish) => dish.payment_status === "not_paid" || !dish.payment_status,
  );
  const paidDishes = dishes.filter((dish) => dish.payment_status === "paid");

  // Usar los totales de la orden directamente (incluye todos los métodos de pago)
  const tableTotalPrice =
    state.order?.total_amount ||
    dishes.reduce(
      (sum, dish) => sum + (dish.price + dish.extra_price) * dish.quantity,
      0,
    );

  // paid_amount de la orden incluye pagos por todos los métodos
  const paidAmount = state.order?.paid_amount || 0;

  // remaining_amount de la orden es lo que falta por pagar
  const unpaidAmount =
    state.order?.remaining_amount || tableTotalPrice - paidAmount;

  const getPaymentAmount = () => {
    switch (paymentType) {
      case "full-bill":
        return unpaidAmount;
      case "equal-shares": {
        // "Tu parte" es siempre total_amount / N (estable, no cambia porque
        // otros ya hayan pagado — solo si cambia el total de la mesa). Si ese
        // nominal ya no cabe en lo que en verdad falta (alguien bajó mucho el
        // número de personas), se topa a lo que resta por pagar.
        const n = parseInt(equalPeople) || 2;
        const nominal = tableTotalPrice / n;
        return parseFloat(Math.min(nominal, unpaidAmount).toFixed(2));
      }
      case "choose-amount":
        return customPaymentAmount ? parseFloat(customPaymentAmount) : 0;
      case "select-items":
        return selectedItems.reduce((sum, itemId) => {
          const dish = unpaidDishes.find((d) => d.id === itemId);
          return (
            sum +
            ((dish?.price || 0) + (dish?.extra_price || 0)) *
              (dish?.quantity || 0)
          );
        }, 0);
      default:
        return amount ? parseFloat(amount) : 0;
    }
  };

  const baseAmount = getPaymentAmount();
  const maxAllowedAmount = unpaidAmount;

  // Si "Tu parte" (total/N) tuvo que topar al restante real, avisarlo.
  const equalSharesWasCapped =
    paymentType === "equal-shares" &&
    tableTotalPrice / (parseInt(equalPeople) || 2) > baseAmount + 0.01;

  const tipAmount = useMemo(() => {
    if (customTip && parseFloat(customTip) > 0) {
      return parseFloat(customTip);
    }
    return (baseAmount * tipPercentage) / 100;
  }, [customTip, baseAmount, tipPercentage]);

  const commissions = useMemo(() => {
    return calculateCommissions(baseAmount, tipAmount);
  }, [baseAmount, tipAmount]);

  const {
    ivaTip,
    evenCommissionTotal,
    evenCommissionClient,
    evenCommissionRestaurant,
    ivaEvenClient,
    evenClientCharge,
    evenRestaurantCharge,
    totalAmountCharged: paymentAmount,
  } = commissions;

  const MINIMUM_AMOUNT = 20;
  const isUnderMinimum = paymentAmount < MINIMUM_AMOUNT;

  const handleTipPercentage = (percentage: number) => {
    setTipPercentage(percentage);
    setCustomTip("");
  };

  const handleCustomTipChange = (value: string) => {
    setCustomTip(value);
    setTipPercentage(0);
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId],
    );
  };

  const handleContinueToCardSelection = () => {
    const queryParams = new URLSearchParams({
      type: paymentType,
      amount: paymentAmount.toString(),
      baseAmount: baseAmount.toString(),
      tipAmount: tipAmount.toString(),
      ivaTip: ivaTip.toString(),
      evenCommissionClient: evenCommissionClient.toString(),
      ivaEvenClient: ivaEvenClient.toString(),
      evenCommissionRestaurant: evenCommissionRestaurant.toString(),
      evenRestaurantCharge: evenRestaurantCharge.toString(),
      evenCommissionTotal: evenCommissionTotal.toString(),
      ...(paymentType === "select-items" && {
        selectedItems: selectedItems.join(","),
      }),
    });

    navigateWithTable(`/card-selection?${queryParams.toString()}`);
  };

  if (!tableNumber) {
    return (
      <div className="min-h-dvh bg-gray-50 flex items-center justify-center">
        <div className="text-center px-4 md:px-6 lg:px-8">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-medium text-gray-800 mb-4 md:mb-6">
            {tc("invalidTableTitle")}
          </h1>
          <p className="text-gray-600 text-base md:text-lg lg:text-xl">
            {tc("invalidTableMessage")}
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-even-evergreen flex flex-col">
        <div
          className="fixed top-0 left-0 right-0 z-50"
          style={{ zIndex: 999 }}
        >
          <MenuHeader />
        </div>
        <div className="h-20"></div>

        <div className="w-full flex-1 flex flex-col justify-end">
          <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center">
            <div className="flex flex-col relative px-4 md:px-6 lg:px-8 w-full">
              <div className="left-4 right-4 bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
                <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
                  <h1 className="text-[#e0e0e0] text-xl md:text-2xl lg:text-3xl font-medium">
                    {tc("tableLabel", { table: tableNumber ?? "" })}
                  </h1>
                  <h1 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight mt-2 md:mt-3 mb-6 md:mb-8">
                    {t("subtitle")}
                  </h1>
                </div>
              </div>

              <div className="bg-white rounded-t-4xl relative z-10 flex flex-col pt-5 md:pt-6 lg:pt-8 pb-4 md:pb-5">
                <div className="space-y-3 md:space-y-4 lg:space-y-5 px-8 md:px-10 lg:px-12 animate-pulse">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="h-4 bg-gray-200 rounded w-28"></div>
                      <div className="h-4 bg-gray-200 rounded w-20"></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-4 bg-gray-200 rounded w-16"></div>
                      <div className="grid grid-cols-5 gap-2 flex-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div
                            key={i}
                            className="h-7 bg-gray-200 rounded-full"
                          ></div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-gray-200 pt-4">
                    <div className="w-full flex gap-3 justify-between">
                      <div className="flex flex-col justify-center">
                        <div className="h-3 bg-gray-200 rounded w-20 mb-1"></div>
                        <div className="h-8 bg-gray-200 rounded w-28"></div>
                      </div>
                      <div className="h-9 md:h-10 lg:h-11 bg-gray-300 rounded-full w-28"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-dvh bg-even-evergreen flex flex-col ${
        paymentType === "select-items"
          ? "overflow-y-auto overflow-x-hidden"
          : ""
      }`}
    >
      {/* Fixed Header - solo cuando NO es select-items */}
      {paymentType !== "select-items" && (
        <>
          <div
            className="fixed top-0 left-0 right-0 z-50"
            style={{ zIndex: 999 }}
          >
            <MenuHeader />
          </div>
          <div className="h-20"></div>
        </>
      )}

      <div
        className={`w-full flex-1 flex flex-col ${
          paymentType === "select-items" ? "justify-between" : "justify-end"
        }`}
      >
        {/* Header que hace scroll - solo cuando es select-items */}
        {paymentType === "select-items" && (
          <div className="relative z-50 shrink-0">
            <MenuHeader />
          </div>
        )}

        <div
          className={`${
            paymentType === "select-items"
              ? "flex flex-col relative px-4 md:px-6 lg:px-8"
              : "fixed bottom-0 left-0 right-0 z-50 flex justify-center"
          }`}
        >
          <div
            className={`flex flex-col relative ${paymentType !== "select-items" ? "px-4 md:px-6 lg:px-8 w-full" : ""}`}
          >
            <div
              className="left-4 right-4 bg-even-evergreen rounded-t-4xl translate-y-7"
              style={{ zIndex: 0 }}
            >
              <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
                <h1 className="text-[#e0e0e0] text-xl md:text-2xl lg:text-3xl font-medium">
                  {tc("tableLabel", { table: tableNumber ?? "" })}
                </h1>
                <h1 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight mt-2 md:mt-3 mb-6 md:mb-8">
                  {t("subtitle")}
                </h1>
              </div>
            </div>

            <div
              className={`bg-white rounded-t-4xl relative z-10 flex flex-col pt-8 md:pt-10 lg:pt-12 pb-4 md:pb-6 ${
                paymentType === "select-items"
                  ? `${isUnderMinimum ? "pb-75" : "pb-60"}`
                  : ""
              }`}
            >
              {/* Seleccionar monto a pagar para choose-amount */}
              {paymentType === "choose-amount" && (
                <div className="px-8 md:px-10 lg:px-12 mb-6">
                  <div className="flex flex-col w-full items-center">
                    <label className="block text-xl md:text-2xl lg:text-3xl font-medium text-black mb-4 md:mb-5 lg:mb-6">
                      {t("amountToPayLabel")}
                    </label>
                    <div className="w-full max-w-xs">
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 text-2xl">
                          $
                        </span>
                        <input
                          type="number"
                          value={customPaymentAmount}
                          onChange={(e) =>
                            setCustomPaymentAmount(e.target.value)
                          }
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          className={`w-full pl-8 pr-4 py-3 text-center text-black border-2 rounded-lg focus:outline-none text-2xl font-semibold ${
                            customPaymentAmount &&
                            parseFloat(customPaymentAmount) > maxAllowedAmount
                              ? "border-red-500 bg-red-50"
                              : "border-gray-300 focus:border-even-grass"
                          }`}
                        />
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-3">
                      {t("maxAmount", { amount: maxAllowedAmount.toFixed(2) })}
                    </p>
                    {customPaymentAmount &&
                      parseFloat(customPaymentAmount) > maxAllowedAmount && (
                        <p className="text-sm text-red-600 mt-1">
                          {t("errorAmountExceedsMax")}
                        </p>
                      )}
                  </div>
                </div>
              )}

              {/* Dividir cuenta: cantidad de personas */}
              {paymentType === "equal-shares" && (
                <div className="px-8 md:px-10 lg:px-12 mb-6">
                  <div className="flex flex-col w-full items-center">
                    <label className="block text-xl md:text-2xl lg:text-3xl font-medium text-black mb-4 md:mb-5 lg:mb-6">
                      {t("howManyPeopleLabel")}
                    </label>
                    <div className="w-full max-w-xs">
                      <input
                        type="number"
                        min="2"
                        value={equalPeople}
                        onChange={(e) => setEqualPeople(e.target.value)}
                        className="w-full px-4 py-3 text-center text-black border-2 border-gray-300 focus:border-even-grass rounded-lg focus:outline-none text-2xl font-semibold"
                      />
                    </div>
                    {parseInt(equalPeople) > 1 && (
                      <p className="text-sm text-gray-500 my-3">
                        {t("perPersonAmount", { amount: baseAmount.toFixed(2) })}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Seleccionar artículos específicos */}
              {paymentType === "select-items" && (
                <div className="mb-6 px-8 md:px-10 lg:px-12">
                  {unpaidDishes.length > 0 && (
                    <div className="text-black font-medium text-sm md:text-base lg:text-lg flex gap-10 md:gap-12 lg:gap-14 justify-end translate-y-4">
                      <span>{tc("qtyLabel")}</span>
                      <span>{tc("priceLabel")}</span>
                    </div>
                  )}
                  <div className="space-y-3">
                    {unpaidDishes.map((dish) => {
                      const isSelected = selectedItems.includes(dish.id);
                      const dishTotal =
                        (dish.price + dish.extra_price) * dish.quantity;
                      return (
                        <div
                          key={dish.id}
                          onClick={() => toggleItemSelection(dish.id)}
                          className={`py-3 md:py-4 lg:py-5 cursor-pointer transition-colors ${
                            isSelected ? "bg-even-grass/10" : "hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex items-center gap-3 justify-between">
                            <div className="flex items-center gap-3">
                              <div className="shrink-0">
                                <div
                                  className={`w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7 rounded-full border-2 flex items-center justify-center ${
                                    isSelected
                                      ? "border-teal-500 bg-even-grass"
                                      : "border-gray-300"
                                  }`}
                                >
                                  {isSelected && (
                                    <svg
                                      className="w-3 h-3 md:w-4 md:h-4 lg:w-5 lg:h-5 text-white"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                  )}
                                </div>
                              </div>
                              <div className="size-12 md:size-14 lg:size-16 bg-gray-300 rounded-sm flex items-center justify-center">
                                <img
                                  src={
                                    dish.images[0] ||
                                    "/even/even-asterisk-evergreen.svg"
                                  }
                                  alt="Logo Even"
                                  className="w-full h-full object-cover rounded-sm"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-base md:text-lg lg:text-xl text-black capitalize">
                                  {dish.item}
                                </h4>
                              </div>
                            </div>
                            <div className="text-right flex gap-10 md:gap-12 lg:gap-14">
                              <p className="text-black text-base md:text-lg lg:text-xl">
                                {dish.quantity}
                              </p>
                              <p className="text-black w-14 md:w-16 lg:w-20 text-base md:text-lg lg:text-xl">
                                ${dishTotal.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {unpaidDishes.length === 0 && (
                    <p className="text-sm md:text-base lg:text-lg text-gray-500 mt-2 text-center">
                      {t("noPendingItems")}
                    </p>
                  )}
                  {unpaidDishes.length > 0 && selectedItems.length === 0 && (
                    <p className="text-sm md:text-base lg:text-lg text-gray-500 mt-2 text-center">
                      {t("selectItemToContinue")}
                    </p>
                  )}
                </div>
              )}

              {/* Tip Selection Section - cuando NO es select-items */}
              {paymentType !== "select-items" && (
                <div className="space-y-4 md:space-y-5 lg:space-y-6 px-8 md:px-10 lg:px-12">
                  {/* Resumen del pago */}
                  <div className="space-y-2 md:space-y-3 lg:space-y-4">
                    {/* Total de la Mesa - solo para equal-shares, ya que "Tu parte" se basa en el total */}
                    {paymentType === "equal-shares" && (
                      <div className="flex justify-between items-center">
                        <span className="text-base md:text-lg lg:text-xl font-medium text-black">
                          {t("tableTotalLabel")}
                        </span>
                        <span className="font-medium text-black text-base md:text-lg lg:text-xl">
                          ${tableTotalPrice.toFixed(2)} MXN
                        </span>
                      </div>
                    )}

                    {/* Pagado */}
                    {paidAmount > 0 && paymentType !== "equal-shares" && (
                      <div className="flex justify-between items-center">
                        <span className="text-even-shamrock font-medium text-base md:text-lg lg:text-xl">
                          {tc("paidColon")}
                        </span>
                        <span className="text-even-shamrock font-medium text-base md:text-lg lg:text-xl">
                          ${paidAmount.toFixed(2)} MXN
                        </span>
                      </div>
                    )}

                    {/* Restante por pagar - solo mostrar si NO es full-bill ni equal-shares */}
                    {paymentType !== "full-bill" &&
                      paymentType !== "equal-shares" && (
                        <div className="flex justify-between items-center">
                          <span className="text-even-grass font-medium text-base md:text-lg lg:text-xl">
                            {t("remainingToPayLabel")}
                          </span>
                          <span className="text-even-grass font-medium text-base md:text-lg lg:text-xl">
                            ${unpaidAmount.toFixed(2)} MXN
                          </span>
                        </div>
                      )}

                    {/* Tu parte */}
                    <div className="flex justify-between items-center">
                      <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                        {paymentType === "full-bill"
                          ? t("totalLabel")
                          : paymentType === "equal-shares"
                            ? t("yourShareLabel")
                            : paymentType === "choose-amount"
                              ? t("yourAmountLabel")
                              : t("yourShareLabel")}
                      </span>
                      <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                        ${baseAmount.toFixed(2)} MXN
                      </span>
                    </div>
                    {equalSharesWasCapped && (
                      <p className="text-sm text-gray-500 text-right">
                        {t("onlyRemainingToPay", { amount: baseAmount.toFixed(2) })}
                      </p>
                    )}
                  </div>

                  {/* Selección de propina */}
                  <div className="md:mb-4 lg:mb-5">
                    <div className="flex items-center gap-4 mb-3">
                      <span className="text-black font-medium text-base md:text-lg lg:text-xl whitespace-nowrap">
                        {t("tipLabel")}
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
                              tipPercentage === percentage &&
                              !showCustomTipInput
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
                            onChange={(e) =>
                              handleCustomTipChange(e.target.value)
                            }
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            autoFocus
                            className="w-full pl-8 pr-4 py-1 md:py-1.5 lg:py-2 border rounded-full focus:outline-none focus:ring focus:ring-gray-400 focus:border-transparent text-black text-center bg-surface"
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
                </div>
              )}

              {/* Alerta de mínimo de compra */}
              {isUnderMinimum &&
                baseAmount > 0 &&
                paymentType !== "select-items" && (
                  <div className="bg-linear-to-br from-red-50 to-red-100 px-4 py-2">
                    <div className="flex items-center gap-3 px-8 md:px-10 lg:px-12">
                      <X className="size-6 text-red-500 shrink-0" />
                      <p className="text-red-700 font-medium text-base md:text-lg">
                        {t("underMinimumWarning")}
                      </p>
                    </div>
                  </div>
                )}

              {/* Total final - cuando NO es select-items */}
              {paymentType !== "select-items" && (
                <div className="px-8 md:px-10 lg:px-12">
                  <div
                    className={`border-t border-gray-200 ${isUnderMinimum && baseAmount > 0 ? "pt-4 mt-0" : "pt-6"}`}
                  >
                    <div className="w-full flex gap-3 justify-between">
                      <div className="flex flex-col justify-center -translate-y-2">
                        <span className="text-gray-600 text-sm md:text-base lg:text-lg">
                          {tc("totalToPay")}
                        </span>
                        <div
                          className="flex items-center justify-center w-fit text-2xl md:text-3xl lg:text-4xl font-medium text-black text-center gap-2"
                          key={paymentAmount}
                        >
                          ${(tipAmount + baseAmount).toFixed(2)}
                          <CircleAlert
                            className="size-4 cursor-pointer text-gray-500"
                            strokeWidth={2.3}
                            onClick={() => setShowTotalModal(true)}
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleContinueToCardSelection}
                        disabled={
                          baseAmount <= 0 ||
                          (paymentType === "choose-amount" &&
                            (!customPaymentAmount ||
                              parseFloat(customPaymentAmount) <= 0 ||
                              parseFloat(customPaymentAmount) >
                                maxAllowedAmount)) ||
                          isUnderMinimum
                        }
                        className={`rounded-full transition-all px-20 h-10 md:h-12 lg:h-12 flex items-center justify-center text-base md:text-lg lg:text-xl bg-even-grass text-even-evergreen ${
                          baseAmount <= 0 ||
                          (paymentType === "choose-amount" &&
                            (!customPaymentAmount ||
                              parseFloat(customPaymentAmount) <= 0 ||
                              parseFloat(customPaymentAmount) >
                                maxAllowedAmount)) ||
                          isUnderMinimum
                            ? "opacity-50 cursor-not-allowed"
                            : "animate-pulse-button active:scale-90 cursor-pointer"
                        }`}
                      >
                        {tc("payCta")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tip Selection Section - Fijo cuando es select-items */}
        {paymentType === "select-items" && (
          <div
            className="fixed bottom-0 left-0 right-0 bg-white pt-8 md:pt-10 lg:pt-12 mx-4 md:mx-6 lg:mx-8"
            style={{
              paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
              zIndex: 40,
            }}
          >
            <div className="px-8 md:px-10 lg:px-12 space-y-4">
              {/* Resumen del pago */}
              <div className="space-y-2 md:space-y-3 lg:space-y-4">
                {paidAmount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-even-shamrock font-medium text-base md:text-lg lg:text-xl">
                      {tc("paidColon")}
                    </span>
                    <span className="text-even-shamrock font-medium text-base md:text-lg lg:text-xl">
                      ${paidAmount.toFixed(2)} MXN
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-even-grass font-medium text-base md:text-lg lg:text-xl">
                    {t("remainingToPayLabel")}
                  </span>
                  <span className="text-even-grass font-medium text-base md:text-lg lg:text-xl">
                    ${unpaidAmount.toFixed(2)} MXN
                  </span>
                </div>
              </div>

              {/* Selección de propina */}
              <div>
                <div className="flex items-center gap-4 mb-3">
                  <span className="text-black font-medium text-base md:text-lg lg:text-xl whitespace-nowrap">
                    {t("tipLabel")}
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
                        className="w-full pl-8 pr-4 py-1 md:py-1.5 lg:py-2 border  rounded-full focus:outline-none focus:ring focus:ring-gray-400 focus:border-transparent text-black text-center bg-surface"
                      />
                    </div>
                  </div>
                )}

                {tipAmount > 0 && (
                  <div className="flex justify-end items-center mt-2 text-sm">
                    <span className="text-even-grass font-medium text-base md:text-lg lg:text-xl">
                      +${tipAmount.toFixed(2)} MXN
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Alerta de mínimo de compra - select-items */}
            {isUnderMinimum && baseAmount > 0 && (
              <div className="bg-linear-to-br from-red-50 to-red-100 px-4 py-2">
                <div className="flex items-center gap-3 px-8 md:px-10 lg:px-12">
                  <X className="size-6 text-red-500 shrink-0" />
                  <p className="text-red-700 font-medium text-base md:text-lg">
                    {t("underMinimumWarning")}
                  </p>
                </div>
              </div>
            )}

            <div className="px-8 md:px-10 lg:px-12">
              <div
                className={`border-t border-gray-200 ${isUnderMinimum && baseAmount > 0 ? "pt-4 mt-0" : "pt-6"}`}
              >
                <div className="w-full flex gap-3 justify-between">
                  <div className="flex flex-col justify-center -translate-y-2">
                    <span className="text-gray-600 text-sm md:text-base lg:text-lg">
                      {tc("totalToPay")}
                    </span>
                    <div
                      className="flex items-center justify-center w-fit text-2xl font-medium text-black text-center gap-2"
                      key={paymentAmount}
                    >
                      ${(tipAmount + baseAmount).toFixed(2)}
                      <CircleAlert
                        className="size-4 cursor-pointer text-gray-500"
                        strokeWidth={2.3}
                        onClick={() => setShowTotalModal(true)}
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleContinueToCardSelection}
                    disabled={
                      baseAmount <= 0 ||
                      selectedItems.length === 0 ||
                      isUnderMinimum
                    }
                    className={`rounded-full h-10 md:h-12 lg:h-12 flex items-center justify-center px-20 text-base md:text-lg lg:text-xl transition-all bg-even-grass text-even-evergreen ${
                      baseAmount <= 0 ||
                      selectedItems.length === 0 ||
                      isUnderMinimum
                        ? "opacity-50 cursor-not-allowed"
                        : "animate-pulse-button active:scale-90 cursor-pointer"
                    }`}
                  >
                    {tc("payCta")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal de resumen del total */}
      {showTotalModal && (
        <div
          className="fixed inset-0 flex items-end justify-center backdrop-blur-sm"
          style={{ zIndex: 99999 }}
        >
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setShowTotalModal(false)}
          ></div>

          <div className="relative bg-white rounded-t-4xl w-full mx-4 md:mx-6 lg:mx-8">
            <div className="px-6 pt-4 md:px-8 lg:px-10 md:pt-6 lg:pt-8">
              <div className="flex items-center justify-between pb-4 border-b bg-surfaceborder-stroke">
                <h3 className="text-lg md:text-xl lg:text-2xl font-semibold text-black">
                  {t("totalSummaryTitle")}
                </h3>
                <button
                  onClick={() => setShowTotalModal(false)}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
                >
                  <X className="size-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="px-6 py-4 md:px-8 lg:px-10 md:py-6 lg:py-8">
              <p className="text-black mb-4 text-base md:text-lg lg:text-xl">
                {t("totalBreakdownIntro")}
              </p>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                    +{" "}
                    {paymentType === "full-bill"
                      ? t("consumptionLabel")
                      : paymentType === "select-items"
                        ? t("yourItemsLabel")
                        : paymentType === "equal-shares"
                          ? t("yourShareBreakdown")
                          : paymentType === "choose-amount"
                            ? t("yourAmountBreakdown")
                            : t("yourShareBreakdown")}
                  </span>
                  <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                    ${baseAmount.toFixed(2)} MXN
                  </span>
                </div>
                {tipAmount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      {t("tipBreakdown")}
                    </span>
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      ${tipAmount.toFixed(2)} MXN
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                    {t("serviceCommissionBreakdown")}
                  </span>
                  <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                    ${evenClientCharge.toFixed(2)} MXN
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
