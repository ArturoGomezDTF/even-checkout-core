"use client";

import { useEffect, useState } from "react";
import { Eye, EyeClosed, Loader, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/app/context/AuthContext";
import { useGuest } from "@/app/context/GuestContext";
import { useTable } from "@/app/context/TableContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { useRestaurant } from "@/app/context/RestaurantContext";
import MenuHeader from "@/app/components/headers/MenuHeader";
import { useSearchParams, useParams } from "next/navigation";
import { orderService } from "@/app/services/order.service";
import ItemCustomizations from "@/app/components/ItemCustomizations";

// Perfil completo = tiene nombre Y fecha de nacimiento (igual que en
// pick-and-go/auth-selection). Si falta el nombre, addActiveUser terminaría
// registrando al usuario con el placeholder "Usuario" sin darle chance de
// completar su perfil real.
const isProfileComplete = (
  p?: {
    firstName?: string;
    birthDate?: string;
  } | null,
) => !!p?.firstName && !!p?.birthDate;

export default function OrderPage() {
  const t = useTranslations("OrderPage");
  const tc = useTranslations("Common");
  const searchParams = useSearchParams();
  const params = useParams();
  const { state, setTableNumber, loadTableData, loadActiveUsers } = useTable();
  const { navigateWithTable } = useTableNavigation();
  const { isAuthenticated, isLoading: authLoading, user, profile } = useAuth();
  const { guestId } = useGuest();
  const { restaurant, setParams } = useRestaurant();
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [hasLoadedInitialData, setHasLoadedInitialData] = useState(false);
  const [showPaidOrders, setShowPaidOrders] = useState(false);

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
  }, [searchParams, setTableNumber]);

  const handleRefresh = async () => {
    if (state.order?.order_id) {
      try {
        await orderService.syncOrderFromPOS(state.order.order_id);
      } catch {
        // Sync failed (e.g. no POS agent), still reload local data
      }
    }
    loadTableData();
  };

  const handleCheckOut = async () => {
    setIsProcessingPayment(true);
    try {
      if (!authLoading && isAuthenticated && user) {
        // Usuario autenticado: verificar si ya está en active_users
        if (state.order?.order_id) {
          const activeUsersResponse = await orderService.getActiveUsers(
            state.order.order_id,
          );

          if (activeUsersResponse.success && activeUsersResponse.data) {
            const existingUser = activeUsersResponse.data.find(
              (u: any) => u.user_id === user.id,
            );

            if (existingUser) {
              // Usuario ya está registrado - ir directo a payment-options

              navigateWithTable("/payment-options");
              return;
            }
          }

          // Usuario no está en active_users - agregarlo. Antes de hacerlo,
          // nos aseguramos de que el perfil esté completo: si no, registrarlo
          // ahora grabaría el placeholder "Usuario" sin darle chance de
          // poner su nombre real, así que lo mandamos a completar su perfil
          // primero (auth-selection ya maneja usuarios autenticados con
          // perfil incompleto).
          if (!isProfileComplete(profile)) {
            navigateWithTable("/auth-selection");
            return;
          }

          const userName =
            profile?.firstName && profile?.lastName
              ? `${profile.firstName} ${profile.lastName}`
              : profile?.firstName || "Usuario";

          await orderService.addActiveUser(
            state.order.order_id,
            user.id,
            null, // guestId es null para usuarios autenticados
            userName,
          );

          // Recargar solo activeUsers (más rápido que loadTableData completo)
          await loadActiveUsers();
        }
        navigateWithTable("/payment-options");
      } else {
        // Invitado: verificar si ya está en active_users
        // Obtener guest_id del contexto o de localStorage
        let currentGuestId = guestId;
        if (!currentGuestId) {
          currentGuestId = localStorage.getItem("even-guest-id");
        }

        if (state.order?.order_id && currentGuestId) {
          // Verificar si el guest_id ya está en active_users
          const activeUsersResponse = await orderService.getActiveUsers(
            state.order.order_id,
          );

          if (activeUsersResponse.success && activeUsersResponse.data) {
            const existingGuest = activeUsersResponse.data.find(
              (u: any) => u.guest_id === currentGuestId,
            );

            if (existingGuest) {
              // El invitado ya está registrado - ir directo a payment-options
              navigateWithTable("/payment-options");
              return;
            }
          }
        }

        // Invitado no registrado: redirigir a auth-selection (donde puede loggearse o poner su nombre)
        navigateWithTable("/auth-selection");
      }
    } catch (error) {
      console.error("Error adding active user:", error);
      // Continuar con la navegación aunque falle
      if (!authLoading && isAuthenticated) {
        navigateWithTable("/payment-options");
      } else {
        navigateWithTable("/auth-selection");
      }
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Filtrar platillos pagados y no pagados
  const unpaidDishes = Array.isArray(state.dishOrders)
    ? state.dishOrders.filter((dish) => dish.payment_status === "not_paid")
    : [];
  const paidDishes = Array.isArray(state.dishOrders)
    ? state.dishOrders.filter((dish) => dish.payment_status === "paid")
    : [];

  // Calcular totales usando la orden
  const totalAmount = state.order?.total_amount || 0;
  const paidAmount = state.order?.paid_amount || 0;
  const remainingAmount = state.order?.remaining_amount || 0;
  const totalItems = state.dishOrders?.length || 0;

  // Calcular totales de platillos pagados
  const paidTotalItems = paidDishes.length;
  const paidTotalPrice = paidDishes.reduce(
    (sum, dish) => sum + (dish.price + dish.extra_price) * dish.quantity,
    0,
  );

  // Cargar datos cuando se monta el componente
  useEffect(() => {
    if (state.tableNumber && !hasLoadedInitialData) {
      setHasLoadedInitialData(true);
      loadTableData();
    }
  }, [state.tableNumber]);

  return (
    <div className="min-h-dvh bg-even-evergreen flex flex-col">
      <MenuHeader
        restaurant={restaurant || undefined}
        tableNumber={state.tableNumber}
        showBackButton={false}
      />

      <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col">
        <div className="left-4 right-4 bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
          <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
            <h1 className="font-medium text-white/60 text-xl md:text-2xl lg:text-3xl">
              {tc("tableLabel", { table: state.tableNumber ?? "" })}
            </h1>
            <h2 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight mt-2 md:mt-3 mb-6 md:mb-8">
              {t("subtitle")}
            </h2>
          </div>
        </div>

        <div className="flex-1 h-full flex flex-col overflow-hidden relative">
          <div className="bg-white rounded-t-4xl flex-1 z-5 flex flex-col overflow-hidden">
            {/* Mesa pagada completamente */}
            {state.order?.payment_status === "paid" ? (
              <div className="flex-1 flex items-center justify-center py-8 md:py-12 text-center">
                <div>
                  <div className="mb-4 md:mb-6">
                    <div className="w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 mx-auto bg-even-grass/20 rounded-full flex items-center justify-center">
                      <svg
                        className="w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 text-even-evergreen"
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
                    </div>
                  </div>
                  <h2 className="text-2xl md:text-3xl lg:text-4xl font-medium text-even-evergreen mb-2 md:mb-3">
                    {t("tableClosedTitle")}
                  </h2>
                  <p className="text-gray-600 text-base md:text-lg lg:text-xl mb-4 md:mb-6">
                    {t("tableClosedMessage")}
                  </p>
                  <button
                    onClick={handleRefresh}
                    className="bg-even-grass hover:bg-even-grass/80 text-even-evergreen px-6 md:px-8 lg:px-10 py-2 md:py-3 lg:py-4 rounded-full transition-colors text-base md:text-lg lg:text-xl"
                  >
                    {t("refreshCta")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Contenido scrollable */}
                <div className="flex-1 overflow-y-auto px-6 md:px-8 lg:px-10 pb-45 md:pb-50 lg:pb-55">
                  {/* Items ordenados */}
                  <div className="w-full mx-auto pb-6 md:pb-8">
                    <div className="flex justify-center items-start relative mt-6 md:mt-8">
                      <h2 className="bg-surface border border-stroke rounded-full px-3 md:px-4 lg:px-5 py-1 md:py-1.5 text-base md:text-lg lg:text-xl font-medium text-black">
                        {t("tableBillTitle")}
                      </h2>
                      <div className="absolute right-0">
                        <button
                          onClick={handleRefresh}
                          disabled={state.isLoading}
                          className="flex items-center gap-2 text-even-evergreen hover:text-even-shamrock transition-colors disabled:text-gray-400 cursor-pointer"
                        >
                          <svg
                            className={`w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7 ${state.isLoading ? "animate-spin" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {state.isLoading ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader className="h-8 w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 animate-spin text-even-grass" />
                      </div>
                    ) : unpaidDishes.length === 0 ? (
                      <div className="flex-1 flex items-center justify-center py-8 md:py-12 text-center">
                        <div>
                          <p className="text-black text-2xl md:text-3xl lg:text-4xl">
                            {t("noOrdersYet")}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-black font-medium text-sm md:text-base lg:text-lg flex gap-10 md:gap-12 lg:gap-14 justify-end translate-y-4">
                          <span>{tc("qtyLabel")}</span>
                          <span>{tc("priceLabel")}</span>
                        </div>
                        <div className="divide-y divide-stroke/50">
                          {unpaidDishes.map((dish) => (
                            <div key={dish.id} className="py-3 md:py-4 lg:py-5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 md:gap-4 lg:gap-5">
                                  <div className="shrink-0 mt-1">
                                    <div className="size-16 md:size-20 lg:size-24 bg-gray-300 rounded-sm md:rounded-md flex items-center justify-center hover:scale-105 transition-transform duration-200">
                                      <img
                                        src={
                                          dish.images?.[0] ??
                                          "/logos/logo-short-green.webp"
                                        }
                                        alt={dish.item}
                                        className="w-full h-full object-cover rounded-sm md:rounded-md"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-base md:text-lg lg:text-xl text-black capitalize">
                                      {dish.item}
                                    </h4>
                                    <ItemCustomizations
                                      customFields={dish.custom_fields}
                                      onlyPaid={true}
                                    />
                                  </div>
                                </div>
                                <div className="text-right flex gap-10 md:gap-12 lg:gap-14">
                                  <p className="text-black text-base md:text-lg lg:text-xl">
                                    {dish.quantity}
                                  </p>
                                  <p className="text-black w-14 md:w-16 lg:w-20 text-base md:text-lg lg:text-xl">
                                    $
                                    {(dish.price + dish.extra_price).toFixed(2)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Sección de órdenes pagadas */}
                  {paidDishes.length > 0 && (
                    <div className="w-full mx-auto pb-6 md:pb-8">
                      <div className="flex justify-between items-center mb-4 md:mb-6">
                        <h2 className="bg-even-grass/10 border border-even-grass rounded-full px-3 md:px-4 lg:px-5 py-1 md:py-1.5 text-base md:text-lg lg:text-xl font-medium text-even-evergreen justify-self-center">
                          {t("paidItemsTitle")}
                        </h2>
                        <button
                          onClick={() => setShowPaidOrders(!showPaidOrders)}
                          className="text-even-grass hover:text-even-shamrock transition-colors cursor-pointer text-sm md:text-base lg:text-lg"
                        >
                          {showPaidOrders ? (
                            <div className="flex items-center gap-1 md:gap-1.5">
                              <EyeClosed className="size-4 md:size-5 lg:size-6" />
                              {t("hideCta")}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 md:gap-1.5">
                              <Eye className="size-4 md:size-5 lg:size-6" />
                              {t("showCta")}
                            </div>
                          )}
                        </button>
                      </div>

                      {showPaidOrders && (
                        <>
                          <div className="text-black font-medium text-sm md:text-base lg:text-lg flex gap-5 md:gap-6 lg:gap-7 justify-end translate-y-3">
                            <span>Cant.</span>
                            <span>Precio</span>
                          </div>

                          <div className="divide-y divide-stroke/50">
                            {paidDishes.map((dish) => (
                              <div
                                key={`paid-${dish.id}`}
                                className="py-3 md:py-4 lg:py-5"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3 md:gap-4 lg:gap-5">
                                    <div className="shrink-0 mt-1">
                                      <div className="size-16 md:size-20 lg:size-24 bg-gray-300 rounded-sm md:rounded-md flex items-center justify-center hover:scale-105 transition-transform duration-200">
                                        <img
                                          src={
                                            dish.images?.[0] ??
                                            "/logo-short-green.webp"
                                          }
                                          alt={dish.item}
                                          className="w-full h-full object-cover rounded-sm md:rounded-md"
                                        />
                                      </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h4 className="text-base md:text-lg lg:text-xl text-black">
                                        {dish.item}
                                      </h4>
                                      <ItemCustomizations
                                        customFields={dish.custom_fields}
                                        onlyPaid={true}
                                      />
                                      <div className="mt-1 flex items-center gap-2">
                                        <p className="text-xs md:text-sm lg:text-base text-even-grass">
                                          {t("paidBadge")}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right flex gap-10 md:gap-12 lg:gap-14">
                                    <p className="text-black text-base md:text-lg lg:text-xl">
                                      {dish.quantity}
                                    </p>
                                    <p className="text-black text-base md:text-lg lg:text-xl">
                                      $
                                      {(dish.price + dish.extra_price).toFixed(
                                        2,
                                      )}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}

                            {/* Total de órdenes pagadas */}
                            <div className="pt-4 md:pt-6">
                              <div className="flex justify-between items-center text-black">
                                <span className="text-lg md:text-xl lg:text-2xl font-medium">
                                  {t("totalPaid")}
                                </span>
                                <span className="font-medium text-base md:text-lg lg:text-xl">
                                  ${paidTotalPrice.toFixed(2)}
                                </span>
                              </div>
                              <p className="text-sm md:text-base lg:text-lg mt-1 text-black">
                                {t("paidDishesCount", { count: paidTotalItems })}
                              </p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Sección inferior fija */}
                {unpaidDishes.length > 0 && remainingAmount > 0 && (
                  <div
                    className="fixed bottom-0 left-0 right-0 bg-white mx-4 md:mx-6 lg:mx-8 px-6 md:px-8 lg:px-10 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]"
                    style={{
                      paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
                    }}
                  >
                    <div className="mb-4 md:mb-5 lg:mb-6"></div>
                    {/* Total de la Mesa */}
                    <div className="space-y-3 md:space-y-4">
                      {/* Subtotal */}
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-black text-base md:text-lg lg:text-xl">
                          {tc("subtotal")}
                        </span>
                        <span className="font-medium text-black text-base md:text-lg lg:text-xl">
                          ${totalAmount.toFixed(2)} MXN
                        </span>
                      </div>

                      {/* Pagado */}
                      {paidAmount > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-even-shamrock font-medium text-base md:text-lg lg:text-xl">
                            {t("paidLabel")}
                          </span>
                          <span className="text-even-shamrock font-medium text-base md:text-lg lg:text-xl">
                            ${paidAmount.toFixed(2)} MXN
                          </span>
                        </div>
                      )}

                      {/* Restante por pagar */}
                      <div className="flex justify-between items-center">
                        <span className="text-black font-bold text-base md:text-lg lg:text-xl">
                          {t("totalLabel")}
                        </span>
                        <span className="text-black font-bold text-base md:text-lg lg:text-xl">
                          ${remainingAmount.toFixed(2)} MXN
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={handleCheckOut}
                      disabled={isProcessingPayment || remainingAmount <= 0}
                      className={`mt-5 md:mt-6 lg:mt-7 w-full py-3 md:py-4 lg:py-5 rounded-full font-normal active:scale-95 transition-all text-even-evergreen text-base md:text-lg lg:text-xl ${
                        !isProcessingPayment && remainingAmount > 0
                          ? "bg-even-grass cursor-pointer animate-pulse-button"
                          : "bg-even-grass opacity-50 cursor-not-allowed"
                      }`}
                    >
                      {isProcessingPayment ? (
                        <div className="flex items-center justify-center gap-2 md:gap-3">
                          <Loader2 className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7 animate-spin" />
                          <span>{tc("loadingEllipsis")}</span>
                        </div>
                      ) : remainingAmount <= 0 ? (
                        t("tableFullyPaid")
                      ) : (
                        tc("continueCta")
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
