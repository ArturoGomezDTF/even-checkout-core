"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { useTable } from "@/app/context/TableContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { useRestaurant } from "@/app/context/RestaurantContext";
import MenuHeader from "@/app/components/headers/MenuHeader";
import { ChevronRight, DollarSign, ReceiptText } from "lucide-react";
import { useTranslations } from "next-intl";

export default function PaymentOptionsPage() {
  const t = useTranslations("PaymentOptionsPage");
  const tc = useTranslations("Common");
  const searchParams = useSearchParams();
  const params = useParams();
  const { state, setTableNumber, loadTableData, loadActiveUsers } = useTable();
  const { tableNumber, navigateWithTable } = useTableNavigation();
  const { setParams, params: restaurantParams } = useRestaurant();

  const [isLoading, setIsLoading] = useState(true);

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

  useEffect(() => {
    const loadPaymentData = async () => {
      // Verificar que tenemos tableNumber antes de intentar cargar
      if (!tableNumber) {
        return;
      }

      // Verificar que los params del restaurante estén listos
      if (!restaurantParams?.restaurantId || !restaurantParams?.branchNumber) {
        return;
      }

      // Si no hay orden, cargarla
      if (!state.order) {
        setIsLoading(true);
        await loadTableData();
        await loadActiveUsers();
        setIsLoading(false);
      } else if (state.order?.order_id) {
        // Si hay orden pero no tiene items, recargar
        if (!state.order.items || state.order.items.length === 0) {
          setIsLoading(true);
          await loadTableData();
          await loadActiveUsers();
          setIsLoading(false);
        } else {
          // Ya hay datos completos, solo recargar activeUsers
          await loadActiveUsers();
          setIsLoading(false);
        }
      }
    };

    loadPaymentData();
  }, [tableNumber, state.order, restaurantParams]);

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

  // Calcular totales usando los datos de la orden
  const dishes = state.order?.items || [];

  // Platillos no pagados y pagados
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

  const handlePayFullBill = () => {
    if (unpaidAmount <= 0) {
      alert(t("errorNoUnpaidBill"));
      return;
    }

    const queryParams = new URLSearchParams({
      amount: unpaidAmount.toString(),
      type: "full-bill",
    });

    navigateWithTable(`/tip-selection?${queryParams.toString()}`);
  };

  const handleSelectItems = () => {
    if (unpaidDishes.length === 0) {
      alert(t("errorNoUnpaidItems"));
      return;
    }

    const queryParams = new URLSearchParams({
      type: "select-items",
    });

    navigateWithTable(`/tip-selection?${queryParams.toString()}`);
  };

  const handleEqualShares = () => {
    if (unpaidAmount <= 0) {
      alert(t("errorNoUnpaidBill"));
      return;
    }

    // El monto real se calcula en vivo en tip-selection según la cantidad de
    // personas que se elija ahí (dividir cuenta ya no usa un monto fijo
    // precomputado aquí).
    const queryParams = new URLSearchParams({
      type: "equal-shares",
    });

    navigateWithTable(`/tip-selection?${queryParams.toString()}`);
  };

  const handleChooseAmount = () => {
    if (unpaidAmount <= 0) {
      alert(t("errorNoUnpaidBill"));
      return;
    }

    const queryParams = new URLSearchParams({
      type: "choose-amount",
      maxAmount: unpaidAmount.toString(),
    });

    navigateWithTable(`/tip-selection?${queryParams.toString()}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-even-evergreen flex flex-col">
        <MenuHeader />

        <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col">
          <div className="left-4 right-4 bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
            <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
              <h1 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight mt-2 md:mt-3 mb-6 md:mb-8">
                {t("subtitle")}
              </h1>
            </div>
          </div>

          <div className="flex-1 h-full flex flex-col overflow-hidden relative">
            <div className="bg-white rounded-t-4xl flex-1 z-5 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 md:px-8 lg:px-10 pb-35 md:pb-40 lg:pb-45">
                <div className="flex flex-col mt-4 md:mt-6 space-y-0">
                  {/* Skeleton para 4 opciones de pago */}
                  {[1, 2, 3, 4].map((item) => (
                    <div
                      key={item}
                      className="w-full bg-white border-b border-stroke animate-pulse"
                    >
                      <div className="flex items-center gap-3 md:gap-4 lg:gap-5 py-3 md:py-4 lg:py-5 px-4 md:px-5 lg:px-6">
                        <div className="size-16 md:size-20 lg:size-24 rounded-sm md:rounded-md bg-gray-200"></div>
                        <div className="flex-1">
                          <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                        </div>
                        <div className="size-5 md:size-6 lg:size-7 bg-gray-200 rounded"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Skeleton del total */}
              <div className="fixed bottom-0 left-0 right-0 bg-white mx-4 md:mx-6 lg:mx-8 px-6 md:px-8 lg:px-10 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <div className="py-4 md:py-8 lg:py-12 space-y-2 md:space-y-3 animate-pulse">
                  <div className="flex justify-between items-center">
                    <div className="h-6 bg-gray-200 rounded w-32"></div>
                    <div className="h-6 bg-gray-200 rounded w-24"></div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="h-5 bg-gray-200 rounded w-24"></div>
                    <div className="h-5 bg-gray-200 rounded w-20"></div>
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
    <div className="min-h-dvh bg-even-evergreen flex flex-col">
      <MenuHeader />

      <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col">
        <div className="left-4 right-4 bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
          <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
            <h1 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight mt-2 md:mt-3 mb-6 md:mb-8">
              {t("subtitle")}
            </h1>
          </div>
        </div>

        <div className="flex-1 h-full flex flex-col overflow-hidden relative">
          <div className="bg-white rounded-t-4xl flex-1 z-5 flex flex-col overflow-hidden">
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 md:px-8 lg:px-10 pb-35 md:pb-40 lg:pb-45">
              {/* 4 OPCIONES PRINCIPALES DE PAGO */}
              <div className="flex flex-col mt-4 md:mt-6">
                {/* Opción 1: Pagar cuenta restante */}
                {unpaidAmount > 0 && (
                  <button
                    onClick={handlePayFullBill}
                    className="w-full bg-white cursor-pointer border-b border-stroke active:bg-even-grass/10 transition-all duration-300"
                  >
                    <div className="flex items-center gap-3 md:gap-4 lg:gap-5 py-3 md:py-4 lg:py-5 px-4 md:px-5 lg:px-6">
                      <div className="size-16 md:size-20 lg:size-24 rounded-sm md:rounded-md border border-black flex items-center justify-center">
                        <ReceiptText
                          className="text-black size-9 md:size-11 lg:size-12"
                          strokeWidth={1}
                        />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-black text-base md:text-lg lg:text-xl">
                          {t("payFullBill")}
                        </h3>
                      </div>
                      <div className="text-black">
                        <ChevronRight className="size-5 md:size-6 lg:size-7" />
                      </div>
                    </div>
                  </button>
                )}

                {/* Opción 2: Seleccionar platillos específicos */}
                {unpaidDishes.length > 0 && (
                  <button
                    onClick={handleSelectItems}
                    className="w-full bg-white cursor-pointer border-b border-stroke active:bg-even-grass/10 transition-all duration-300"
                  >
                    <div className="flex items-center gap-3 md:gap-4 lg:gap-5 py-3 md:py-4 lg:py-5 px-4 md:px-5 lg:px-6">
                      <div className="size-16 md:size-20 lg:size-24 rounded-sm md:rounded-md border border-black flex items-center justify-center">
                        <img
                          src="/icons/select-items-logo.svg"
                          alt=""
                          className="rounded-sm md:rounded-md"
                        />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-black text-base md:text-lg lg:text-xl">
                          {t("selectItems")}
                        </h3>
                      </div>
                      <div className="text-black">
                        <ChevronRight className="size-5 md:size-6 lg:size-7" />
                      </div>
                    </div>
                  </button>
                )}

                {/* Opción 3: Dividir cuenta */}
                {unpaidAmount > 0 && (
                  <button
                    onClick={handleEqualShares}
                    className="w-full bg-white cursor-pointer border-b border-stroke active:bg-even-grass/10 transition-all duration-300"
                  >
                    <div className="flex items-center gap-3 md:gap-4 lg:gap-5 py-3 md:py-4 lg:py-5 px-4 md:px-5 lg:px-6">
                      <div className="size-16 md:size-20 lg:size-24 rounded-sm md:rounded-md border border-black flex items-center justify-center">
                        <img
                          src="/icons/split-bill-logo.png"
                          alt=""
                          className="size-9 md:size-11 lg:size-12"
                        />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-black text-base md:text-lg lg:text-xl">
                          {t("splitBill")}
                        </h3>
                      </div>
                      <div className="text-black">
                        <ChevronRight className="size-5 md:size-6 lg:size-7" />
                      </div>
                    </div>
                  </button>
                )}

                {/* Opción 4: Elegir monto personalizado */}
                {unpaidAmount > 0 && (
                  <button
                    onClick={handleChooseAmount}
                    className="w-full bg-white cursor-pointer active:bg-even-grass/10 transition-all duration-300"
                  >
                    <div className="flex items-center gap-3 md:gap-4 lg:gap-5 py-3 md:py-4 lg:py-5 px-4 md:px-5 lg:px-6">
                      <div className="size-16 md:size-20 lg:size-24 rounded-sm md:rounded-md border border-black flex items-center justify-center">
                        <DollarSign
                          className="text-black size-9 md:size-11 lg:size-12"
                          strokeWidth={1}
                        />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-black text-base md:text-lg lg:text-xl">
                          {t("chooseAmount")}
                        </h3>
                      </div>
                      <div className="text-black">
                        <ChevronRight className="size-5 md:size-6 lg:size-7" />
                      </div>
                    </div>
                  </button>
                )}
              </div>
            </div>

            {/* Total - Fixed to bottom */}
            {unpaidAmount > 0 && (
              <div className="fixed bottom-0 left-0 right-0 bg-white mx-4 md:mx-6 lg:mx-8 px-6 md:px-8 lg:px-10 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <div className="py-4 md:py-8 lg:py-12 space-y-2 md:space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-lg md:text-2xl lg:text-3xl font-medium text-black">
                      {t("totalTable", { table: tableNumber ?? "" })}
                    </span>
                    <span className="text-lg md:text-2xl lg:text-3xl font-medium text-black">
                      ${tableTotalPrice.toFixed(2)}
                    </span>
                  </div>
                  {paidAmount > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-even-shamrock font-medium text-base md:text-xl lg:text-2xl">
                        {tc("paidColon")}
                      </span>
                      <span className="text-even-shamrock font-medium text-base md:text-xl lg:text-2xl">
                        ${paidAmount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-evergreen font-medium text-base md:text-xl lg:text-2xl">
                      {t("remainingLabel")}
                    </span>
                    <span className="text-evergreen font-medium text-base md:text-xl lg:text-2xl">
                      ${unpaidAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
