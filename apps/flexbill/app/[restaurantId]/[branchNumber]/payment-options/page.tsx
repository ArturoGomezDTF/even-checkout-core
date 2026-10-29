"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTable } from "@/app/context/TableContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { getRestaurantData } from "@/app/utils/restaurantData";
import { getSavedUrlParams, clearSavedUrlParams } from "@/app/utils/urlParams";
import MenuHeaderBack from "@/app/components/headers/MenuHeaderBack";
import { ChevronRight, DollarSign, ReceiptText } from "lucide-react";
import { useValidateAccess } from "@/app/hooks/useValidateAccess";
import ValidationError from "@/app/components/ValidationError";
import { useAgentStatus } from "@/app/hooks/useAgentStatus";
import { useRestaurant } from "@/app/context/RestaurantContext";
import POSBlockedModal from "@/app/components/POSBlockedModal";
import EqualSplitSelectionModal from "@/app/components/EqualSplitSelectionModal";
import { tableService } from "@/app/services/table.service";
import { useAuth } from "@/app/context/AuthContext";
import { useGuest } from "@/app/context/GuestContext";
import { apiService } from "@/app/utils/api";

export default function PaymentOptionsPage() {
  const t = useTranslations("PaymentOptionsPage");
  const { validationError, restaurantId, branchNumber } = useValidateAccess();
  const { restaurant } = useRestaurant();
  const { isAgentDisconnected, isTurnoClosed } = useAgentStatus(
    restaurantId,
    branchNumber ? parseInt(branchNumber) : null,
  );
  const isPOSBlocked = isAgentDisconnected || isTurnoClosed;
  const [showPOSModal, setShowPOSModal] = useState(false);
  const [posModalReason, setPosModalReason] = useState<
    "turno_closed" | "agent_disconnected"
  >("turno_closed");
  const [showEqualSplitModal, setShowEqualSplitModal] = useState(false);
  const [isCheckingSplitSelection, setIsCheckingSplitSelection] =
    useState(false);

  const checkPOSBlock = () => {
    if (isPOSBlocked) {
      setPosModalReason(isTurnoClosed ? "turno_closed" : "agent_disconnected");
      setShowPOSModal(true);
      return true;
    }
    return false;
  };
  const searchParams = useSearchParams();

  const {
    state,
    dispatch,
    loadTableData,
    loadActiveUsers,
    loadEqualSplitSelection,
  } = useTable();
  const { navigateWithTable } = useTableNavigation();
  const { user: authUser, profile } = useAuth();
  const { guestId } = useGuest();

  // Nombres reales de otros usuarios logueados en la mesa (no el actual) —
  // active_table_users.guest_name viene null para quien se unió sin ordenar,
  // así que sin esto caen al fallback "Comensal" en el modal de dividir
  // cuenta. Mismo patrón que ParticipantsHeader.tsx.
  const [usersInfo, setUsersInfo] = useState<
    Record<
      string,
      {
        imageUrl: string | null;
        firstName: string | null;
        lastName: string | null;
        fullName: string | null;
      }
    >
  >({});

  useEffect(() => {
    const userIds = Array.from(
      new Set(
        (state.activeUsers ?? [])
          .map((u) => u.user_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (userIds.length === 0) return;
    apiService
      .getUsersInfo(userIds)
      .then((response) => {
        if (response.success && response.data) {
          const usersData = (response.data as any).data || response.data;
          setUsersInfo(usersData);
        }
      })
      .catch((error) => {
        console.error("Error loading users info:", error);
      });
  }, [state.activeUsers]);

  // Establecer tableNumber desde URL si no está en el estado
  useEffect(() => {
    const tableFromUrl = searchParams?.get("table");
    if (tableFromUrl && !state.tableNumber) {
      dispatch({ type: "SET_TABLE_NUMBER", payload: tableFromUrl });
    }
  }, [searchParams, state.tableNumber, dispatch]);
  const router = useRouter();
  const restaurantData = getRestaurantData();
  const [isLoading, setIsLoading] = useState(true);
  // Si el usuario ya había cargado esta mesa antes (p. ej. viene de vuelta
  // de pagar un monto parcial), el Context conserva dishOrders/tableSummary
  // desactualizados — hay que refrescarlos una vez por cada vez que se monta
  // esta pantalla, no solo cuando están vacíos.
  const hasRefreshedOnMountRef = useRef(false);

  useEffect(() => {
    const savedParams = getSavedUrlParams();
    if (savedParams) {
      router.replace(`/payment-options${savedParams}`);
      clearSavedUrlParams();
    }
  }, [router]);

  useEffect(() => {
    const loadPaymentData = async () => {
      if (state.tableNumber) {
        // Primer paso de este montaje: refrescar siempre, aunque el Context
        // ya traiga datos — pueden ser de antes de un pago (p. ej. volviste
        // aquí después de pagar un monto parcial y el saldo cambió).
        if (
          !hasRefreshedOnMountRef.current ||
          !state.dishOrders ||
          state.dishOrders.length === 0 ||
          !state.tableSummary
        ) {
          hasRefreshedOnMountRef.current = true;
          setIsLoading(true);
          await loadTableData();
          await loadActiveUsers();
          setIsLoading(false);
        } else {
          // Ya se refrescó en este montaje, solo recargar activeUsers (pueden haber cambiado por pagos)
          await loadActiveUsers();
          setIsLoading(false);
        }
      } else if (!state.tableNumber && !isLoading) {
        // Si no hay número de mesa, mantenerse en loading
      }
    };

    loadPaymentData();
  }, [state.tableNumber, state.dishOrders, state.tableSummary]);

  // Si esta pantalla se restaura desde el bfcache del navegador (p. ej. el
  // usuario le da "atrás" después de pagar), el evento anterior nunca corre
  // de nuevo: React ni siquiera vuelve a montar el componente, solo se
  // repinta el snapshot congelado de antes del pago — de ahí que
  // hasRefreshedOnMountRef nunca ayude en ese caso. pageshow con
  // event.persisted=true es la señal estándar de esa restauración.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted && state.tableNumber) {
        setIsLoading(true);
        loadTableData()
          .then(() => loadActiveUsers())
          .finally(() => setIsLoading(false));
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [state.tableNumber, loadTableData, loadActiveUsers]);

  // Calcular totales usando tableSummary si está disponible
  const dishOrders = Array.isArray(state.dishOrders) ? state.dishOrders : [];

  // Platillos no pagados y pagados
  const unpaidDishes = dishOrders.filter(
    (dish) => dish.payment_status === "not_paid" || !dish.payment_status,
  );
  const paidDishes = dishOrders.filter(
    (dish) => dish.payment_status === "paid",
  );

  // Usar tableSummary.data.data si está disponible, sino calcular desde dishOrders
  const tableTotalPrice =
    state.tableSummary?.data?.data?.total_amount ||
    dishOrders.reduce((sum, dish) => sum + (dish.total_price || 0), 0);

  const paidAmount =
    state.tableSummary?.data?.data?.paid_amount ||
    paidDishes.reduce((sum, dish) => sum + (dish.total_price || 0), 0);

  const unpaidAmount =
    state.tableSummary?.data?.data?.remaining_amount ||
    unpaidDishes.reduce((sum, dish) => sum + (dish.total_price || 0), 0);

  // Versiones para mostrar en pantalla (comisión ya incrustada) — nunca se
  // usan para armar los montos que se mandan a tip-selection, solo para que
  // el resumen de esta pantalla cuadre con lo que se ve después.
  const displayTableTotalPrice = dishOrders.reduce(
    (sum, dish) => sum + (dish.total_display_price ?? dish.total_price ?? 0),
    0,
  );
  // paidDishes solo cubre pagos atados a platillos específicos
  // (select-items/user-items) — un pago genérico (full-bill/choose-amount/
  // "Dividir cuenta") no marca ningún dish_order como paid, así que sumar
  // solo paidDishes deja "Pagado" en $0 aunque tableSummary.paid_amount ya
  // refleje el pago real. Se prorratea el paidAmount real (de tableSummary,
  // que sí ve pagos genéricos) sobre el total ya inflado, en vez de sumar
  // por platillo.
  const displayPaidAmount =
    tableTotalPrice > 0
      ? Math.min(
          displayTableTotalPrice * (paidAmount / tableTotalPrice),
          displayTableTotalPrice,
        )
      : 0;
  const displayUnpaidAmount = Math.max(
    displayTableTotalPrice - displayPaidAmount,
    0,
  );

  const tableTotalItems =
    state.tableSummary?.data?.data?.no_items || dishOrders.length;

  // Red de seguridad: si ya no queda nada pendiente por pagar en la mesa
  // (link viejo, ya se pagó todo por fuera, etc.) no hay opciones de pago
  // que mostrar — se manda al usuario de vuelta al menú (mismo criterio
  // "cuenta pagada completamente" que ya usa el mensaje de abajo).
  useEffect(() => {
    if (!isLoading && unpaidAmount <= 0) {
      navigateWithTable("/menu", true);
    }
  }, [isLoading, unpaidAmount, navigateWithTable]);

  // Mostrar error de validación si existe
  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  // Obtener usuarios únicos considerando active_users que NO hayan pagado nada
  // (solo un estimado para el preview del botón "Dividir cuenta" — la selección
  // real de personas/platillos se hace en tip-selection)
  const uniqueUsers = (() => {
    // Si tenemos activeUsers, usar esa información
    if (state.activeUsers && state.activeUsers.length > 0) {
      const usersWithNoPaid = state.activeUsers
        .filter((user) => {
          const totalPaid =
            (user.total_paid_individual || 0) + (user.total_paid_amount || 0);
          return totalPaid === 0;
        })
        .map((user) => user.guest_name)
        .filter(Boolean);

      return [...new Set(usersWithNoPaid)]; // Asegurar unicidad
    }

    // Fallback: usar usuarios con platillos no pagados
    const usersFromDishes = Array.from(
      new Set(unpaidDishes.map((dish) => dish.guest_name).filter(Boolean)),
    );

    return usersFromDishes;
  })();

  // Personas activas sin pagar aún — son las candidatas por defecto para
  // "Dividir cuenta" (a diferencia de uniqueUsers, acá necesitamos el
  // ActiveUser completo con su id, no solo el nombre, para el modal de
  // selección).
  const unpaidActiveUsers = state.activeUsers
    .filter((user) => {
      const totalPaid =
        (user.total_paid_individual || 0) + (user.total_paid_amount || 0);
      return totalPaid === 0;
    })
    .map((activeUser) => {
      // active_table_users.guest_name puede venir vacío para el usuario
      // logueado actual (el nombre real vive en profile, no en la fila de
      // la mesa) — sin esto, el modal de "Dividir cuenta" cae al fallback
      // "Comensal" en vez de mostrar su nombre.
      if (activeUser.guest_name) return activeUser;
      const isCurrentAuthUser = authUser && activeUser.user_id === authUser.id;
      const isCurrentGuest = guestId && activeUser.guest_id === guestId;
      if (isCurrentAuthUser && profile) {
        const resolvedName =
          profile.firstName && profile.lastName
            ? `${profile.firstName} ${profile.lastName}`
            : profile.firstName || state.currentUserName;
        return resolvedName
          ? { ...activeUser, guest_name: resolvedName }
          : activeUser;
      }
      if (isCurrentGuest && state.currentUserName) {
        return { ...activeUser, guest_name: state.currentUserName };
      }
      // Otro usuario logueado (no el actual) con guest_name vacío — resolver
      // vía getUsersInfo, igual que ParticipantsHeader.tsx.
      if (activeUser.user_id && usersInfo[activeUser.user_id]) {
        const userData = usersInfo[activeUser.user_id];
        const resolvedName = userData.fullName || userData.firstName;
        if (resolvedName) return { ...activeUser, guest_name: resolvedName };
      }
      return activeUser;
    });

  // Platillos del usuario actual
  const currentUserDishes = dishOrders.filter(
    (dish) => dish.guest_name === state.currentUserName,
  );

  const currentUserUnpaidDishes = currentUserDishes.filter(
    (dish) => dish.payment_status === "not_paid" || !dish.payment_status,
  );

  const currentUserUnpaidAmount = currentUserUnpaidDishes.reduce(
    (sum, dish) => {
      return sum + (dish.total_price || 0);
    },
    0,
  );

  const handlePayFullBill = () => {
    if (checkPOSBlock()) return;
    if (unpaidAmount <= 0) {
      alert(t("noPendingBill"));
      return;
    }

    const queryParams = new URLSearchParams({
      amount: unpaidAmount.toString(),
      type: "full-bill",
    });

    navigateWithTable(`/tip-selection?${queryParams.toString()}`);
  };

  const handleSelectItems = () => {
    if (checkPOSBlock()) return;
    if (unpaidDishes.length === 0) {
      alert(t("noPendingDishes"));
      return;
    }

    const queryParams = new URLSearchParams({
      type: "select-items",
      userName: state.currentUserName || "",
    });

    navigateWithTable(`/tip-selection?${queryParams.toString()}`);
  };

  const goToEqualSharesTipSelection = () => {
    // El monto real se calcula en vivo en tip-selection según la selección
    // de personas ya fijada (o los active_users sin pagar, como red de
    // seguridad si por algo no hay selección todavía).
    const queryParams = new URLSearchParams({
      type: "equal-shares",
      userName: state.currentUserName || "",
    });

    navigateWithTable(`/tip-selection?${queryParams.toString()}`);
  };

  const handleEqualShares = async () => {
    if (checkPOSBlock()) return;
    if (unpaidAmount <= 0) {
      alert(t("noPendingBill"));
      return;
    }

    setIsCheckingSplitSelection(true);
    try {
      const existingSelection = await loadEqualSplitSelection();
      if (existingSelection) {
        // Ya alguien fijó la división para esta mesa — usarla directo.
        goToEqualSharesTipSelection();
        return;
      }

      if (unpaidActiveUsers.length === 0) {
        // No hay a quién mostrar en el modal (mesa recién abierta, nadie
        // registrado como activo todavía) — seguir con el flujo normal.
        goToEqualSharesTipSelection();
        return;
      }

      setShowEqualSplitModal(true);
    } finally {
      setIsCheckingSplitSelection(false);
    }
  };

  const handleConfirmEqualSplitSelection = async (
    includedActiveUserIds: string[],
  ) => {
    if (!restaurantId || !branchNumber || !state.tableNumber) return;

    await tableService.setEqualSplitSelection(
      restaurantId,
      branchNumber,
      state.tableNumber,
      includedActiveUserIds,
    );

    setShowEqualSplitModal(false);
    goToEqualSharesTipSelection();
  };

  const handleChooseAmount = () => {
    if (checkPOSBlock()) return;
    if (unpaidAmount <= 0) {
      alert(t("noPendingBill"));
      return;
    }

    const queryParams = new URLSearchParams({
      type: "choose-amount",
      userName: state.currentUserName || "",
    });

    navigateWithTable(`/tip-selection?${queryParams.toString()}`);
  };

  const handlePayCurrentUser = () => {
    if (checkPOSBlock()) return;
    if (currentUserUnpaidAmount <= 0) {
      alert(t("noPendingUserDishes"));
      return;
    }

    const queryParams = new URLSearchParams({
      amount: currentUserUnpaidAmount.toString(),
      type: "user-items",
      userName: state.currentUserName || "",
    });

    navigateWithTable(`/tip-selection?${queryParams.toString()}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-dvh brand-evergreen flex flex-col">
        <MenuHeaderBack
          restaurant={restaurantData}
          tableNumber={state.tableNumber}
        />

        <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col">
          <div className="left-4 right-4 bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
            <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
              <h1 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight mt-2 md:mt-3 mb-6 md:mb-8">
                {t("title")}
              </h1>
            </div>
          </div>

          <div className="flex-1 h-full flex flex-col overflow-hidden">
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
    <div className="min-h-dvh brand-evergreen flex flex-col">
      <MenuHeaderBack
        restaurant={restaurantData}
        tableNumber={state.tableNumber}
      />

      <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col">
        <div className="left-4 right-4 bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
          <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
            <h1 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight mt-2 md:mt-3 mb-6 md:mb-8">
              {t("title")}
            </h1>
          </div>
        </div>

        <div className="flex-1 h-full flex flex-col overflow-hidden">
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
                          {t("payFullBillTitle")}
                        </h3>
                      </div>
                      <div className="text-black">
                        <ChevronRight className="size-5 md:size-6 lg:size-7" />
                      </div>
                    </div>
                  </button>
                )}

                {/* Opción 2: Seleccionar platillos específicos (TODOS los items disponibles) */}
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
                          {t("selectItemsTitle")}
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
                    disabled={isCheckingSplitSelection}
                    className="w-full bg-white cursor-pointer border-b border-stroke active:bg-even-grass/10 transition-all duration-300 disabled:opacity-60 disabled:pointer-events-none"
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
                          {t("splitBillTitle")}
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
                          {t("chooseAmountTitle")}
                        </h3>
                      </div>
                      <div className="text-black">
                        <ChevronRight className="size-5 md:size-6 lg:size-7" />
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {/* Mensaje si no hay platillos pendientes */}
              {unpaidAmount <= 0 && (
                <div className="my-8 md:my-10 lg:my-12 text-center px-6 md:px-8 lg:px-10">
                  <div className="p-6 md:p-8 lg:p-10 bg-even-grass/10 rounded-lg md:rounded-xl">
                    <h3 className="text-lg md:text-xl lg:text-2xl font-medium text-even-evergreen mb-2 md:mb-3">
                      {t("billFullyPaid")}
                    </h3>
                    <p className="text-even-shamrock text-base md:text-lg lg:text-xl">
                      {t("allDishesPaidMessage")}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Total - Fixed to bottom */}
            {unpaidAmount > 0 && (
              <div className="fixed bottom-0 left-0 right-0 bg-white mx-4 md:mx-6 lg:mx-8 px-6 md:px-8 lg:px-10 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <div className="py-4 md:py-8 lg:py-12 space-y-2 md:space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-lg md:text-2xl lg:text-3xl font-medium text-black">
                      {t("totalTableLabel", { table: state.tableNumber })}
                    </span>
                    <span className="text-lg md:text-2xl lg:text-3xl font-medium text-black">
                      ${displayTableTotalPrice.toFixed(2)}
                    </span>
                  </div>
                  {paidAmount > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-even-shamrock font-medium text-base md:text-xl lg:text-2xl">
                        {t("paidLabel")}
                      </span>
                      <span className="text-even-shamrock font-medium text-base md:text-xl lg:text-2xl">
                        ${displayPaidAmount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-evergreen font-medium text-base md:text-xl lg:text-2xl">
                      {t("remainingLabel")}
                    </span>
                    <span className="text-evergreen font-medium text-base md:text-xl lg:text-2xl">
                      ${displayUnpaidAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <POSBlockedModal
        isOpen={showPOSModal}
        onClose={() => setShowPOSModal(false)}
        reason={posModalReason}
        restaurantName={restaurant?.name}
        restaurantLogo={restaurant?.logo_url}
      />
      <EqualSplitSelectionModal
        isOpen={showEqualSplitModal}
        onClose={() => setShowEqualSplitModal(false)}
        activeUsers={unpaidActiveUsers}
        onConfirm={handleConfirmEqualSplitSelection}
      />
    </div>
  );
}
