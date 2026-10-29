"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useMemo, useRef } from "react";
import { useTable } from "@/app/context/TableContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { getRestaurantData } from "@/app/utils/restaurantData";
import MenuHeaderBack from "@/app/components/headers/MenuHeaderBack";
import { CircleAlert, Loader2, X } from "lucide-react";
import {
  calculateFlexBillItemCommission,
  calculateFlexBillProportionalCommission,
  resolveTipAmountForTargetDisplay,
  getDisplaySubtotal,
  getDisplaySubtotalForFraction,
  type FlexBillCommissionLineItem,
  type CommissionBreakdown,
} from "@/app/utils/commissionCalculator";
import { useValidateAccess } from "@/app/hooks/useValidateAccess";
import ValidationError from "@/app/components/ValidationError";
import { useAuth } from "@/app/context/AuthContext";
import { useGuest } from "@/app/context/GuestContext";
import { apiService } from "@/app/utils/api";

export default function TipSelectionPage() {
  const t = useTranslations("TipSelectionPage");
  const tc = useTranslations("Common");
  const { validationError, restaurantId, branchNumber } = useValidateAccess();

  const { state, dispatch, loadTableData, loadEqualSplitSelection } =
    useTable();
  const { navigateWithTable } = useTableNavigation();
  const searchParams = useSearchParams();
  const { user: authUser, profile } = useAuth();
  const { guestId } = useGuest();

  // Nombres reales de otros usuarios logueados en la mesa (no el actual) —
  // active_table_users.guest_name viene null para quien se unió sin ordenar.
  // Mismo patrón que ParticipantsHeader.tsx/payment-options.
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
  const restaurantData = getRestaurantData();

  const paymentType = searchParams.get("type") || "full-bill";
  const amount = searchParams.get("amount");
  const userName = searchParams.get("userName");

  const [tipPercentage, setTipPercentage] = useState(10);
  const [customTip, setCustomTip] = useState("");
  const [customPaymentAmount, setCustomPaymentAmount] = useState("");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showTotalModal, setShowTotalModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);
  const [showCustomTipInput, setShowCustomTipInput] = useState(false);
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>("all");
  const [showUserSelector, setShowUserSelector] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Calcular posición del dropdown cuando se abre
  useEffect(() => {
    if (showUserSelector && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8, // 8px debajo del botón
        right: window.innerWidth - rect.right,
      });
    } else {
      setDropdownPosition(null);
    }
  }, [showUserSelector]);

  // Recargar datos de la mesa para asegurar montos actualizados
  useEffect(() => {
    const loadData = async () => {
      if (state.tableNumber) {
        // Si no hay datos cargados o están desactualizados, cargar
        if (
          !state.dishOrders ||
          state.dishOrders.length === 0 ||
          !state.tableSummary
        ) {
          setIsLoading(true);
          await loadTableData();
          setIsLoading(false);
        } else {
          setIsLoading(false);
        }
      } else if (!state.tableNumber && !isLoading) {
        // Si no hay número de mesa, mantenerse en loading
      }
    };
    loadData();
  }, [state.tableNumber, state.dishOrders, state.tableSummary]);

  // Inicializar customPaymentAmount para choose-amount
  useEffect(() => {
    if (paymentType === "choose-amount" && amount) {
      setCustomPaymentAmount(amount);
    }
  }, [paymentType, amount]);

  // Red de seguridad: payment-options ya deja equalSplitSelection cargada
  // en el contexto antes de navegar acá, pero si se entra directo por URL
  // (o después de un refresh) puede que todavía no esté — se pide una vez.
  const hasFetchedSplitSelectionRef = useRef(false);
  useEffect(() => {
    if (
      paymentType === "equal-shares" &&
      state.tableNumber &&
      !state.equalSplitSelection &&
      !hasFetchedSplitSelectionRef.current
    ) {
      hasFetchedSplitSelectionRef.current = true;
      loadEqualSplitSelection();
    }
  }, [
    paymentType,
    state.tableNumber,
    state.equalSplitSelection,
    loadEqualSplitSelection,
  ]);

  // Calcular totales usando tableSummary si está disponible
  const dishOrders = Array.isArray(state.dishOrders) ? state.dishOrders : [];

  // Platillos no pagados y pagados
  const unpaidDishes = dishOrders.filter(
    (dish) => dish.payment_status === "not_paid" || !dish.payment_status,
  );
  const paidDishes = dishOrders.filter(
    (dish) => dish.payment_status === "paid",
  );

  // Obtener usuarios únicos de platillos no pagados
  const unpaidUsersSet = new Set(
    unpaidDishes.map((dish) => dish.guest_name).filter(Boolean),
  );
  const unpaidUsers = Array.from(unpaidUsersSet);

  // "Dividir cuenta": de las personas activas en la mesa, cuáles entran en
  // el divisor. Si ya hay una selección fijada (payment-options), se acota
  // a esas — si no, cae al comportamiento anterior (todos los active_users).
  // En ambos casos, solo cuentan los que todavía no pagaron nada — a medida
  // que la gente paga, el número baja solo y el restante se sigue
  // dividiendo entre los que faltan dentro del grupo elegido.
  const includedActiveUserIds =
    state.equalSplitSelection?.included_active_user_ids;
  const unpaidActiveUsers = state.activeUsers
    .filter((u) => {
      if (includedActiveUserIds && !includedActiveUserIds.includes(u.id)) {
        return false;
      }
      const totalPaid =
        (u.total_paid_individual || 0) + (u.total_paid_amount || 0);
      return totalPaid === 0;
    })
    .map((u) => {
      // active_table_users.guest_name puede venir vacío para el usuario
      // logueado actual (el nombre real vive en profile, no en la fila de
      // la mesa) — sin esto, esa persona desaparece de "Dividido entre..."
      // en vez de mostrar su nombre (filter(Boolean) la descarta).
      if (u.guest_name) return u;
      const isCurrentAuthUser = authUser && u.user_id === authUser.id;
      const isCurrentGuest = guestId && u.guest_id === guestId;
      if (isCurrentAuthUser && profile) {
        const resolvedName =
          profile.firstName && profile.lastName
            ? `${profile.firstName} ${profile.lastName}`
            : profile.firstName || state.currentUserName || "";
        return resolvedName ? { ...u, guest_name: resolvedName } : u;
      }
      if (isCurrentGuest && state.currentUserName) {
        return { ...u, guest_name: state.currentUserName };
      }
      // Otro usuario logueado (no el actual) con guest_name vacío —
      // resolver vía getUsersInfo, igual que ParticipantsHeader.tsx.
      if (u.user_id && usersInfo[u.user_id]) {
        const userData = usersInfo[u.user_id];
        const resolvedName = userData.fullName || userData.firstName;
        if (resolvedName) return { ...u, guest_name: resolvedName };
      }
      return u;
    });
  const unpaidActiveUsersCount = Math.max(1, unpaidActiveUsers.length);
  const unpaidActiveUserNames = unpaidActiveUsers
    .map((u) => u.guest_name)
    .filter(Boolean);
  const formattedUnpaidActiveUserNames =
    unpaidActiveUserNames.length <= 1
      ? unpaidActiveUserNames.join("")
      : `${unpaidActiveUserNames.slice(0, -1).join(", ")}${t("namesJoiner")}${unpaidActiveUserNames[unpaidActiveUserNames.length - 1]}`;

  // Filtrar platillos según el usuario seleccionado
  const filteredUnpaidDishes =
    selectedUserFilter === "all"
      ? unpaidDishes
      : unpaidDishes.filter((dish) => dish.guest_name === selectedUserFilter);

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
  // usan para calcular baseAmount/getPaymentAmount, solo para que estas
  // líneas informativas cuadren contra "Tu parte"/"Total" de abajo.
  const displayTableTotalPrice = dishOrders.reduce(
    (sum, dish) => sum + (dish.total_display_price ?? dish.total_price ?? 0),
    0,
  );
  // paidDishes solo cubre pagos atados a platillos específicos — un pago
  // genérico (full-bill/choose-amount/"Dividir cuenta") no marca ningún
  // dish_order como paid, así que sumar solo paidDishes deja esto en $0
  // aunque tableSummary.paid_amount ya refleje el pago real. Se prorratea
  // el paidAmount real sobre el total ya inflado, igual que en
  // payment-options/page.tsx.
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
  // Mismo criterio que getPaymentAmount() para "select-items", pero con el
  // precio inflado — para que el aviso de "excede lo que falta" muestre el
  // mismo espacio de números que "Restante por pagar".
  const displaySelectedItemsAmount = selectedItems.reduce((sum, itemId) => {
    const dish = unpaidDishes.find((d) => d.dish_order_id === itemId);
    return sum + (dish?.total_display_price ?? dish?.total_price ?? 0);
  }, 0);

  // Red de seguridad: si ya no queda nada pendiente por pagar en la mesa
  // (link viejo, ya se pagó todo por fuera mientras se elegía la propina,
  // etc.) no hay nada que confirmar acá — se manda al usuario de vuelta
  // al menú.
  useEffect(() => {
    if (!isLoading && unpaidAmount <= 0) {
      navigateWithTable("/menu", true);
    }
  }, [isLoading, unpaidAmount, navigateWithTable]);

  // Platillos del usuario actual no pagados
  const currentUserUnpaidDishes = dishOrders.filter(
    (dish) =>
      dish.guest_name === userName &&
      (dish.payment_status === "not_paid" || !dish.payment_status),
  );

  const currentUserUnpaidAmount = currentUserUnpaidDishes.reduce(
    (sum, dish) => {
      return sum + (dish.total_price || 0);
    },
    0,
  );

  const getPaymentAmount = () => {
    switch (paymentType) {
      case "full-bill":
        // Usar el monto restante actual de tableSummary, no el unpaidAmount calculado al cargar
        return state.tableSummary?.data?.data?.remaining_amount || unpaidAmount;
      case "user-items":
        return currentUserUnpaidAmount;
      case "equal-shares": {
        // "Tu parte" = lo que falta por pagar / personas activas que
        // todavía no pagaron nada. Se recalcula solo a medida que la gente
        // va pagando su parte.
        const remaining = state.tableSummary?.data?.data?.remaining_amount ?? 0;
        return parseFloat((remaining / unpaidActiveUsersCount).toFixed(2));
      }
      case "choose-amount": {
        // El cliente escribe un monto en "espacio inflado" (lo que ve como
        // "Restante por pagar"/"Máximo" en pantalla) — se convierte a la
        // porción real equivalente, que es lo que getPaymentAmount debe
        // devolver para que el resto del cálculo de comisión funcione.
        if (!customPaymentAmount) return 0;
        const typed = parseFloat(customPaymentAmount);
        if (!typed || displayUnpaidAmount <= 0) return 0;
        return (typed / displayUnpaidAmount) * unpaidAmount;
      }
      case "select-items":
        return selectedItems.reduce((sum, itemId) => {
          const dish = unpaidDishes.find((d) => d.dish_order_id === itemId);
          return sum + (dish?.total_price || 0);
        }, 0);
      default:
        return amount ? parseFloat(amount) : 0;
    }
  };

  const baseAmount = getPaymentAmount();
  const currentRemainingAmount =
    state.tableSummary?.data?.data?.remaining_amount || unpaidAmount;
  const maxAllowedAmount = currentRemainingAmount;

  // Ítems reales que cubre este pago — la franja de comisión se calcula por
  // ítem, no por el total. Esto es solo un preview: el backend recalcula
  // desde dish_order al crear la transacción, así que una pequeña
  // diferencia de redondeo aquí no afecta lo que realmente se cobra.
  const commissionItems: FlexBillCommissionLineItem[] = useMemo(() => {
    const toLineItem = (d: (typeof unpaidDishes)[number]) => ({
      price: d.price || 0,
      extraPrice: d.extra_price || 0,
      quantity: d.quantity || 1,
    });
    if (paymentType === "select-items") {
      return unpaidDishes
        .filter((d) => selectedItems.includes(d.dish_order_id))
        .map(toLineItem);
    }
    if (paymentType === "user-items") {
      return currentUserUnpaidDishes.map(toLineItem);
    }
    // full-bill, equal-shares, choose-amount: base sobre todos los pendientes
    return unpaidDishes.map(toLineItem);
  }, [paymentType, unpaidDishes, selectedItems, currentUserUnpaidDishes]);

  // Fracción de la mesa que representa este pago — 1 para select-items/
  // user-items (se conocen los ítems exactos). full-bill NO siempre es 1:
  // si ya hubo un pago genérico previo (choose-amount/"Dividir cuenta"),
  // ningún dish_order quedó marcado como paid, así que "unpaidDishes" sigue
  // trayendo TODOS los platillos — hay que prorratear contra baseAmount
  // (que para full-bill ya es el remaining_amount real de tableSummary, ver
  // getPaymentAmount) para no volver a cobrar lo ya pagado. Mismo criterio
  // que equal-shares/choose-amount, mismo que ahora usa el backend en
  // computeFlexBillAmountDue.
  const paymentFraction = useMemo(() => {
    if (paymentType === "select-items" || paymentType === "user-items") {
      return 1;
    }
    const { baseAmount: realBase } = calculateFlexBillItemCommission(
      commissionItems,
      0,
    );
    return realBase > 0 ? Math.min(Math.max(baseAmount / realBase, 0), 1) : 0;
  }, [paymentType, commissionItems, baseAmount]);

  // Arma el breakdown real de comisión para una propina dada, según el tipo
  // de pago — se reutiliza tal cual para resolver la propina real y para
  // el breakdown final.
  const computeCommissionsForTip = (tip: number): CommissionBreakdown => {
    if (paymentType === "select-items" || paymentType === "user-items") {
      return calculateFlexBillItemCommission(commissionItems, tip);
    }
    return calculateFlexBillProportionalCommission(
      commissionItems,
      paymentFraction,
      tip,
    );
  };

  // Subtotal fijo — consumo + su propia comisión, redondeado por ítem (ver
  // getDisplaySubtotal). No se mueve cuando el cliente cambia cuánto
  // quiere dar de propina; la propina absorbe la comisión adicional que
  // genera (ver resolveTipAmountForTargetDisplay).
  const displaySubtotal = useMemo(() => {
    if (paymentType === "select-items" || paymentType === "user-items") {
      return getDisplaySubtotal(commissionItems);
    }
    return getDisplaySubtotalForFraction(commissionItems, paymentFraction);
  }, [paymentType, commissionItems, paymentFraction]);

  // Cuánto quiere ver el cliente como "Propina" — el % elegido se calcula
  // sobre el subtotal fijo (no sobre el consumo real oculto), y "Otro" es
  // literal lo que tecleó.
  const targetDisplayPropina = useMemo(() => {
    if (customTip && parseFloat(customTip) > 0) {
      return parseFloat(customTip);
    }
    return Math.round(((displaySubtotal * tipPercentage) / 100) * 100) / 100;
  }, [customTip, displaySubtotal, tipPercentage]);

  // Propina real que hay que mandar al cálculo para que el residuo
  // (Total - Subtotal fijo) cierre exacto contra lo que el cliente eligió
  // ver.
  const tipAmount = useMemo(
    () =>
      resolveTipAmountForTargetDisplay(
        computeCommissionsForTip,
        displaySubtotal,
        targetDisplayPropina,
      ),
    [
      targetDisplayPropina,
      displaySubtotal,
      paymentType,
      commissionItems,
      baseAmount,
    ],
  );

  const rawCommissions = useMemo(
    () => computeCommissionsForTip(tipAmount),
    [paymentType, commissionItems, tipAmount, baseAmount],
  );

  // Sin propina, Total debe ser exactamente el Subtotal fijo — pero
  // computeCommissionsForTip(0) puede diferir de displaySubtotal por un
  // centavo: usa una tasa combinada sobre el crudo sin redondear y redondea
  // una sola vez al final, mientras displaySubtotal redondea por ítem (ver
  // comentario en getDisplaySubtotal). Sin esto, "0%" mostraba una
  // "propina fantasma" de $0.01. Mismo fix que CashPaymentModal.tsx en
  // even-crew.
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

  // Extraer valores calculados
  const {
    baseAmount: realBaseAmount, // consumo real sin comisión — para base_amount del backend
    ivaTip,
    evenCommissionTotal,
    evenCommissionClient,
    evenCommissionRestaurant,
    ivaEvenClient,
    evenClientCharge,
    evenRestaurantCharge,
    totalAmountCharged: paymentAmount,
  } = commissions;

  // Lo que se muestra como "+ Propina" — el residuo real (Total - Subtotal
  // fijo), que por construcción coincide con lo que el cliente eligió ver.
  const displayPropina =
    Math.round((paymentAmount - displaySubtotal) * 100) / 100;

  // Validación de compra mínima - usar el total con propina, comisiones, etc.
  const MINIMUM_AMOUNT = 20; // Mínimo de compra requerido
  const isUnderMinimum = paymentAmount < MINIMUM_AMOUNT;

  // "Seleccionar artículos" sumaba el precio nominal de los platillos elegidos
  // sin límite — si algo ya pagó parte de la mesa por fuera (cash/terminal de
  // even-crew, "Elegir monto"), esa suma podía superar lo que en verdad falta.
  // Tolerancia de 1 centavo: baseAmount (suma de dish.total_price) y
  // maxAllowedAmount (remaining_amount del RPC de la mesa) se calculan por
  // caminos distintos y pueden diferir por redondeo aunque en pantalla se
  // vean iguales — sin esto, seleccionar TODOS los platillos pendientes
  // podía disparar el aviso de "excede lo que falta" sin razón real.
  const selectItemsExceedsRemaining =
    paymentType === "select-items" && baseAmount > maxAllowedAmount + 0.01;

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
    setIsNavigating(true);
    const queryParams = new URLSearchParams({
      type: paymentType,
      amount: paymentAmount.toString(), // Total cobrado al cliente
      baseAmount: realBaseAmount.toString(), // Consumo real, sin comisión — para base_amount del backend
      tipAmount: tipAmount.toString(), // Propina real (resuelta) — para tip_amount del backend
      // Lo que se muestra en pantalla: Subtotal fijo (no se mueve con la
      // propina) y Propina como residuo — ver commissionCalculator.ts
      // resolveTipAmountForTargetDisplay. card-selection/payment-success
      // los usan tal cual, sin recalcular.
      displaySubtotal: displaySubtotal.toString(),
      displayPropina: displayPropina.toString(),
      ivaTip: ivaTip.toString(), // IVA de propina (no pagado por cliente)
      evenCommissionClient: evenCommissionClient.toString(), // Comisión Even parte cliente
      ivaEvenClient: ivaEvenClient.toString(), // IVA sobre comisión Even cliente
      evenCommissionRestaurant: evenCommissionRestaurant.toString(), // Comisión Even parte restaurante
      evenRestaurantCharge: evenRestaurantCharge.toString(), // Comisión restaurante + IVA
      evenCommissionTotal: evenCommissionTotal.toString(), // Comisión Even total
      ...(userName && { userName }),
      ...(paymentType === "select-items" && {
        selectedItems: selectedItems.join(","),
      }),
    });

    navigateWithTable(`/card-selection?${queryParams.toString()}`);
  };

  const getPaymentDetails = () => {
    switch (paymentType) {
      case "full-bill":
        return {
          description: "Cuenta completa de la mesa",
          items: `${unpaidDishes.length} platillos pendientes`,
        };
      case "user-items":
        return {
          description: `Platillos de ${userName}`,
          items: `${currentUserUnpaidDishes.length} platillo${currentUserUnpaidDishes.length !== 1 ? "s" : ""}`,
        };
      case "equal-shares":
        return {
          description: "Tu parte de la división",
          items: `Entre ${unpaidActiveUsersCount} persona${unpaidActiveUsersCount !== 1 ? "s" : ""}`,
        };
      case "choose-amount":
        return {
          description: "Monto personalizado",
          items: "Cantidad específica",
        };
      case "select-items":
        return {
          description: "Artículos seleccionados",
          items: `${selectedItems.length} de ${filteredUnpaidDishes.length} ${selectedUserFilter !== "all" ? `de ${selectedUserFilter}` : "disponibles"}`,
        };
      default:
        return {
          description: "Pago",
          items: "",
        };
    }
  };

  const paymentDetails = getPaymentDetails();

  // Mostrar error de validación si existe
  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-dvh brand-evergreen flex flex-col">
        <div
          className="fixed top-0 left-0 right-0 z-50"
          style={{ zIndex: 999 }}
        >
          <MenuHeaderBack
            restaurant={restaurantData}
            tableNumber={state.tableNumber}
          />
        </div>
        <div className="h-20"></div>

        <div className="w-full flex-1 flex flex-col justify-end">
          <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center">
            <div className="flex flex-col relative px-4 md:px-6 lg:px-8 w-full">
              <div className="left-4 right-4 bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
                <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
                  <h1 className="text-white/60 text-xl md:text-2xl lg:text-3xl font-medium">
                    {tc("tableLabel", { table: state.tableNumber })}
                  </h1>
                  <h1 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight mt-2 md:mt-3 mb-6 md:mb-8">
                    {t("title")}
                  </h1>
                </div>
              </div>

              <div className="bg-white rounded-t-4xl relative z-10 flex flex-col pt-5 md:pt-6 lg:pt-8 pb-4 md:pb-5">
                <div className="space-y-3 md:space-y-4 lg:space-y-5 px-8 md:px-10 lg:px-12 animate-pulse">
                  {/* Skeleton del resumen */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="h-4 bg-gray-200 rounded w-28"></div>
                      <div className="h-4 bg-gray-200 rounded w-20"></div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="h-4 bg-gray-200 rounded w-36"></div>
                      <div className="h-4 bg-gray-200 rounded w-20"></div>
                    </div>
                  </div>

                  {/* Skeleton de propina */}
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

                  {/* Skeleton del total */}
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
      className={`min-h-dvh brand-evergreen flex flex-col ${
        paymentType === "select-items"
          ? " overflow-y-auto overflow-x-hidden"
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
            <MenuHeaderBack
              restaurant={restaurantData}
              tableNumber={state.tableNumber}
            />
          </div>
          {/* Spacer for fixed header */}
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
          <div className="relative z-50 flex-shrink-0">
            <MenuHeaderBack
              restaurant={restaurantData}
              tableNumber={state.tableNumber}
            />
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
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h1 className="text-white/60 text-xl md:text-2xl lg:text-3xl font-medium">
                      {tc("tableLabel", { table: state.tableNumber })}
                    </h1>
                    <h1 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight mt-2 md:mt-3 mb-6 md:mb-8">
                      {t("title")}
                    </h1>
                  </div>

                  {/* Filtro de usuarios - solo para select-items */}
                  {paymentType === "select-items" && unpaidUsers.length > 1 && (
                    <button
                      ref={buttonRef}
                      onClick={() => setShowUserSelector(!showUserSelector)}
                      className="bg-white/20 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-white/30 transition-colors flex items-center gap-2"
                    >
                      <span>
                        {selectedUserFilter === "all"
                          ? t("allUsersFilter")
                          : selectedUserFilter}
                      </span>
                      <svg
                        className={`w-4 h-4 transition-transform ${showUserSelector ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div
              className={`bg-white rounded-t-4xl relative z-10 flex flex-col pt-8 md:pt-10 lg:pt-12 pb-4 md:pb-6 ${
                paymentType === "select-items"
                  ? `${isUnderMinimum ? "pb-[300px]" : "pb-[240px]"}`
                  : ""
              }`}
            >
              {/* Seleccionar monto a pagar para choose-amount */}
              {paymentType === "choose-amount" && (
                <div className="px-8 md:px-10 lg:px-12">
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
                            parseFloat(customPaymentAmount) >
                              displayUnpaidAmount
                              ? "border-red-500 bg-red-50"
                              : "border-gray-300 focus:border-even-grass"
                          }`}
                        />
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-3">
                      {t("maximumLabel", {
                        amount: displayUnpaidAmount.toFixed(2),
                      })}
                    </p>
                    {customPaymentAmount &&
                      parseFloat(customPaymentAmount) > displayUnpaidAmount && (
                        <p className="text-sm text-red-600 mt-1">
                          {t("minimumPurchaseWarning", {
                            amount: displayUnpaidAmount.toFixed(2),
                          })}
                        </p>
                      )}
                  </div>
                </div>
              )}

              {/* Seleccionar artículos específicos */}
              {paymentType === "select-items" && (
                <div className="mb-6 px-8 md:px-10 lg:px-12">
                  {filteredUnpaidDishes.length > 0 && (
                    <div className="text-black font-medium text-sm md:text-base lg:text-lg flex gap-10 md:gap-12 lg:gap-14 justify-end translate-y-4">
                      <span>{t("qtyLabel")}</span>
                      <span>{t("priceLabel")}</span>
                    </div>
                  )}
                  <div className="space-y-3">
                    {filteredUnpaidDishes.map((dish) => {
                      const isSelected = selectedItems.includes(
                        dish.dish_order_id,
                      );
                      return (
                        <div
                          key={dish.dish_order_id}
                          onClick={() =>
                            toggleItemSelection(dish.dish_order_id)
                          }
                          className={`py-3 md:py-4 lg:py-5 cursor-pointer transition-colors ${
                            isSelected ? "bg-even-grass/10" : "hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex items-center gap-3 justify-between">
                            <div className="flex items-center gap-3">
                              <div className="flex-shrink-0">
                                <div
                                  className={`w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7 rounded-full border-2 flex items-center justify-center ${
                                    isSelected
                                      ? "border-even-grass bg-even-grass"
                                      : "border-gray-300"
                                  }`}
                                >
                                  {isSelected && (
                                    <svg
                                      className="w-3 h-3 md:w-4 md:h-4 lg:w-5 lg:h-5 text-even-evergreen"
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
                              <div className="size-12 md:size-14 lg:size-16 bg-gray-300 rounded-sm flex items-center justify-center hover:scale-105 transition-transform duration-200">
                                {dish.images[0] ? (
                                  <img
                                    src={dish.images[0]}
                                    alt="Logo Even"
                                    className="w-full h-full object-cover rounded-sm md:rounded-md lg:rounded-lg"
                                  />
                                ) : (
                                  <img
                                    src="/even/even-asterisk-evergreen.svg"
                                    alt="Logo Even"
                                    className="size-7 md:size-8 lg:size-10 object-contain"
                                  />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm md:text-base lg:text-lg text-stroke">
                                  {dish.guest_name.toUpperCase()}
                                </h3>
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
                                $
                                {(
                                  dish.total_display_price ?? dish.total_price
                                ).toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {filteredUnpaidDishes.length === 0 && (
                    <p className="text-sm md:text-base lg:text-lg text-gray-500 mt-2 text-center">
                      {t("noItemsForUser")}
                    </p>
                  )}
                  {filteredUnpaidDishes.length > 0 &&
                    selectedItems.length === 0 && (
                      <p className="text-sm md:text-base lg:text-lg text-gray-500 mt-2 text-center">
                        {t("selectItemToContinue")}
                      </p>
                    )}
                </div>
              )}

              {/* Tip Selection Section - Incluido en contenedor blanco cuando NO es select-items */}
              {paymentType !== "select-items" && (
                <div className="space-y-4 md:space-y-5 lg:space-y-6 px-8 md:px-10 lg:px-12">
                  {/* Resumen del pago */}
                  <div className="space-y-2 md:space-y-3 lg:space-y-4">
                    {/* Restante de la Mesa - solo mostrar si NO es full-bill ni choose-amount ni select-items.
                        Usa displayUnpaidAmount (lo que de verdad falta, ya
                        descontando pagos genéricos previos), no el total
                        original de la mesa — de ahí el label "Restante". */}
                    {paymentType !== "full-bill" &&
                      paymentType !== "choose-amount" &&
                      paymentType !== "select-items" && (
                        <div className="flex justify-between items-center">
                          <span className="text-base md:text-lg lg:text-xl font-medium text-black">
                            {t("remainingTableLabel")}
                          </span>
                          <span className="font-medium text-black text-base md:text-lg lg:text-xl">
                            ${displayUnpaidAmount.toFixed(2)} MXN
                          </span>
                        </div>
                      )}

                    {/* Pagado */}
                    {paidAmount > 0 && paymentType !== "equal-shares" && (
                      <div className="flex justify-between items-center">
                        <span className="text-even-shamrock font-medium text-base md:text-lg lg:text-xl">
                          {t("paidLabel")}
                        </span>
                        <span className="text-even-shamrock font-medium text-base md:text-lg lg:text-xl">
                          ${displayPaidAmount.toFixed(2)} MXN
                        </span>
                      </div>
                    )}

                    {/* Restante por pagar - solo mostrar si NO es full-bill ni equal-shares */}
                    {paymentType !== "full-bill" &&
                      paymentType !== "equal-shares" && (
                        <div className="flex justify-between items-center">
                          <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                            {t("remainingToPayLabel")}
                          </span>
                          <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                            ${displayUnpaidAmount.toFixed(2)} MXN
                          </span>
                        </div>
                      )}

                    {/* Tu parte - NO mostrar si es select-items */}
                    {paymentType !== "select-items" && (
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
                          ${displaySubtotal.toFixed(2)} MXN
                        </span>
                      </div>
                    )}

                    {/* Entre quiénes se divide - solo equal-shares */}
                    {paymentType === "equal-shares" &&
                      unpaidActiveUserNames.length > 0 && (
                        <p className="text-black font-medium text-base md:text-lg lg:text-xl capitalize">
                          {t("splitBetweenLabel", {
                            count: unpaidActiveUsersCount,
                            names: formattedUnpaidActiveUserNames,
                          })}
                        </p>
                      )}
                  </div>

                  {/* Selección de propina */}
                  <div className="md:mb-4 lg:mb-5">
                    {/* Propina label y botones de porcentaje */}
                    <div className="flex items-center gap-4 mb-3">
                      <span className="text-black font-medium text-base md:text-lg lg:text-xl whitespace-nowrap">
                        {t("tipLabel")}
                      </span>
                      {/* Tip Percentage Buttons */}
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
                        {/* Custom Tip Button */}
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

                    {/* Custom Tip Input - Solo se muestra cuando showCustomTipInput es true */}
                    {showCustomTipInput && (
                      <div className="flex flex-col gap-2 mb-3">
                        <div className="relative w-full">
                          <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-black text-base">
                            $
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            pattern="[0-9]*\.?[0-9]*"
                            value={customTip}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === "" || /^\d*\.?\d*$/.test(value)) {
                                handleCustomTipChange(value);
                              }
                            }}
                            placeholder="0.00"
                            autoFocus
                            className="w-full pl-8 pr-4 py-1 md:py-1.5 lg:py-2 border border-stroke/40 rounded-full focus:outline-none focus:ring focus:ring-even-grass focus:border-transparent text-black text-center text-base bg-surface"
                          />
                        </div>
                      </div>
                    )}

                    {displayPropina > 0 && (
                      <div className="flex justify-end items-center mt-2 text-sm">
                        <span className="text-even-evergreen font-medium">
                          +${displayPropina.toFixed(2)} MXN
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
                  <div className="bg-gradient-to-br from-red-50 to-red-100 px-4 py-2">
                    <div className="flex items-center gap-3 px-8 md:px-10 lg:px-12">
                      <X className="size-6 text-red-500 flex-shrink-0" />
                      <p className="text-red-700 font-medium text-base md:text-lg">
                        {t("underMinimumWarning")}
                      </p>
                    </div>
                  </div>
                )}

              {/* Tip Selection Section - Incluido en contenedor blanco cuando NO es select-items */}
              {paymentType !== "select-items" && (
                <div className="px-8 md:px-10 lg:px-12">
                  {/* Total final */}
                  <div
                    className={`border-t border-gray-200 ${isUnderMinimum && baseAmount > 0 ? "pt-4 -mt-0" : "pt-6"}`}
                  >
                    <div className="w-full flex gap-3 justify-between">
                      <div className="flex flex-col justify-center -translate-y-2">
                        <span className="text-gray-600 text-sm md:text-base lg:text-lg">
                          {t("totalToPay")}
                        </span>
                        <div
                          className="flex items-center justify-center w-fit text-2xl md:text-3xl lg:text-4xl font-medium text-black text-center gap-2"
                          style={{
                            WebkitFontSmoothing: "antialiased",
                            MozOsxFontSmoothing: "grayscale",
                            transform: "translateZ(0)",
                            backfaceVisibility: "hidden" as const,
                          }}
                          key={paymentAmount}
                        >
                          ${paymentAmount.toFixed(2)}
                          <CircleAlert
                            className="size-4 cursor-pointer text-gray-500"
                            strokeWidth={2.3}
                            onClick={() => setShowTotalModal(true)}
                          />
                        </div>
                      </div>

                      {/* Pagar Button */}
                      {(() => {
                        const isChooseAmountInvalid =
                          paymentType === "choose-amount" &&
                          (!customPaymentAmount ||
                            parseFloat(customPaymentAmount) <= 0 ||
                            parseFloat(customPaymentAmount) >
                              displayUnpaidAmount);

                        const isSelectItemsInvalid =
                          paymentType === "select-items" &&
                          selectedItems.length === 0;

                        const isDisabled =
                          baseAmount <= 0 ||
                          isChooseAmountInvalid ||
                          isSelectItemsInvalid ||
                          isUnderMinimum;

                        return (
                          <button
                            onClick={handleContinueToCardSelection}
                            disabled={isDisabled}
                            className={`rounded-full transition-all px-15 h-10 md:h-12 lg:h-12 flex items-center justify-center text-base md:text-lg lg:text-xl bg-even-grass text-even-evergreen ${
                              isDisabled
                                ? "opacity-50 cursor-not-allowed"
                                : "animate-pulse-button active:scale-90 cursor-pointer"
                            }`}
                          >
                            {t("payCta")}
                          </button>
                        );
                      })()}
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
                {/* Pagado */}
                {paidAmount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-even-shamrock font-medium text-base md:text-lg lg:text-xl">
                      {t("paidLabel")}
                    </span>
                    <span className="text-even-shamrock font-medium text-base md:text-lg lg:text-xl">
                      ${displayPaidAmount.toFixed(2)} MXN
                    </span>
                  </div>
                )}

                {/* Restante por pagar */}
                <div className="flex justify-between items-center">
                  <span className="text-even-evergreen font-medium text-base md:text-lg lg:text-xl">
                    {t("remainingToPayLabel")}
                  </span>
                  <span className="text-even-evergreen font-medium text-base md:text-lg lg:text-xl">
                    ${displayUnpaidAmount.toFixed(2)} MXN
                  </span>
                </div>
                {selectItemsExceedsRemaining && (
                  <p className="text-sm text-red-600 mt-1">
                    {t("selectedItemsExceedMessage", {
                      selected: displaySelectedItemsAmount.toFixed(2),
                      remaining: displayUnpaidAmount.toFixed(2),
                    })}
                  </p>
                )}
              </div>

              {/* Selección de propina */}
              <div>
                {/* Propina label y botones de porcentaje */}
                <div className="flex items-center gap-4 mb-3">
                  <span className="text-black font-medium text-base md:text-lg lg:text-xl whitespace-nowrap">
                    {t("tipLabel")}
                  </span>
                  {/* Tip Percentage Buttons */}
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
                    {/* Custom Tip Button */}
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

                {/* Custom Tip Input - Solo se muestra cuando showCustomTipInput es true */}
                {showCustomTipInput && (
                  <div className="flex flex-col gap-2 mb-3">
                    <div className="relative w-full">
                      <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-black text-base">
                        $
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*\.?[0-9]*"
                        value={customTip}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === "" || /^\d*\.?\d*$/.test(value)) {
                            handleCustomTipChange(value);
                          }
                        }}
                        placeholder="0.00"
                        autoFocus
                        className="w-full pl-8 pr-4 py-1 md:py-1.5 lg:py-2 border border-stroke/40 rounded-full focus:outline-none focus:ring focus:ring-even-grass focus:border-transparent text-black text-center text-base bg-surface"
                      />
                    </div>
                  </div>
                )}

                {displayPropina > 0 && (
                  <div className="flex justify-end items-center mt-2 text-sm">
                    <span className="text-even-grass font-medium text-base md:text-lg lg:text-xl">
                      +${displayPropina.toFixed(2)} MXN
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Alerta de mínimo de compra - select-items */}
            {isUnderMinimum && baseAmount > 0 && (
              <div className="bg-gradient-to-br from-red-50 to-red-100 px-4 py-2">
                <div className="flex items-center gap-3 px-8 md:px-10 lg:px-12">
                  <X className="size-6 text-red-500 flex-shrink-0" />
                  <p className="text-red-700 font-medium text-base md:text-lg">
                    {t("underMinimumWarning")}
                  </p>
                </div>
              </div>
            )}

            <div className="px-8 md:px-10 lg:px-12">
              {/* Total final */}
              <div
                className={`border-t border-gray-200 ${isUnderMinimum && baseAmount > 0 ? "pt-4 -mt-0" : "pt-6"}`}
              >
                <div className="w-full flex gap-3 justify-between">
                  <div className="flex flex-col justify-center -translate-y-2">
                    <span className="text-gray-600 text-sm md:text-base lg:text-lg">
                      {t("totalToPay")}
                    </span>
                    <div
                      className="flex items-center justify-center w-fit text-2xl font-medium text-black text-center gap-2"
                      style={{
                        WebkitFontSmoothing: "antialiased",
                        MozOsxFontSmoothing: "grayscale",
                        transform: "translateZ(0)",
                        backfaceVisibility: "hidden" as const,
                      }}
                      key={paymentAmount}
                    >
                      ${paymentAmount.toFixed(2)}
                      <CircleAlert
                        className="size-4 cursor-pointer text-gray-500"
                        strokeWidth={2.3}
                        onClick={() => setShowTotalModal(true)}
                      />
                    </div>
                  </div>

                  {/* Pagar Button */}
                  {(() => {
                    const isSelectItemsInvalid = selectedItems.length === 0;
                    const isDisabled =
                      baseAmount <= 0 ||
                      isSelectItemsInvalid ||
                      selectItemsExceedsRemaining ||
                      isUnderMinimum;

                    return (
                      <button
                        onClick={handleContinueToCardSelection}
                        disabled={isDisabled}
                        className={`rounded-full h-10 md:h-12 lg:h-12 flex items-center justify-center px-15 text-base md:text-lg lg:text-xl transition-all bg-even-grass text-even-evergreen ${
                          isDisabled
                            ? "opacity-50 cursor-not-allowed"
                            : "animate-pulse-button active:scale-90 cursor-pointer"
                        }`}
                      >
                        {t("payCta")}
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dropdown de selección de usuario */}
      {showUserSelector &&
        paymentType === "select-items" &&
        dropdownPosition && (
          <>
            {/* Fondo para cerrar */}
            <div
              className="fixed inset-0"
              style={{ zIndex: 99998 }}
              onClick={() => setShowUserSelector(false)}
            />

            {/* Dropdown menu */}
            <div
              className="fixed bg-white rounded-lg shadow-xl w-48 overflow-hidden"
              style={{
                zIndex: 99999,
                top: `${dropdownPosition.top}px`,
                right: `${dropdownPosition.right}px`,
              }}
            >
              <button
                onClick={() => {
                  setSelectedUserFilter("all");
                  setShowUserSelector(false);
                }}
                className={`w-full text-left px-4 py-2.5 transition-colors ${
                  selectedUserFilter === "all"
                    ? "bg-even-grass text-even-evergreen"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="text-sm font-medium">{t("allUsersFilter")}</span>
              </button>
              {unpaidUsers.map((user) => (
                <button
                  key={user}
                  onClick={() => {
                    setSelectedUserFilter(user);
                    setShowUserSelector(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 transition-colors ${
                    selectedUserFilter === user
                      ? "bg-even-grass text-even-evergreen"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-sm font-medium capitalize">{user}</span>
                </button>
              ))}
            </div>
          </>
        )}

      {/* Modal de resumen del total */}
      {showTotalModal && (
        <div
          className="fixed inset-0 flex items-end justify-center backdrop-blur-sm"
          style={{ zIndex: 99999 }}
        >
          {/* Fondo */}
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setShowTotalModal(false)}
          ></div>

          {/* Modal */}
          <div className="relative bg-white rounded-t-4xl w-full mx-4 md:mx-6 lg:mx-8">
            {/* Titulo */}
            <div className="px-6 pt-4 md:px-8 lg:px-10 md:pt-6 lg:pt-8">
              <div className="flex items-center justify-between pb-4 border-b border-stroke">
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

            {/* Contenido */}
            <div className="px-6 py-4 md:px-8 lg:px-10 md:py-6 lg:py-8">
              <p className="text-black mb-4 text-base md:text-lg lg:text-xl">
                {t("breakdownIntro")}
              </p>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                    +{" "}
                    {paymentType === "full-bill"
                      ? t("consumptionLabel")
                      : paymentType === "select-items"
                        ? t("itemsLabel")
                        : paymentType === "equal-shares"
                          ? t("yourShareLabel").replace(":", "")
                          : paymentType === "choose-amount"
                            ? t("yourAmountLabel").replace(":", "")
                            : t("yourShareLabel").replace(":", "")}
                  </span>
                  <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                    ${displaySubtotal.toFixed(2)} MXN
                  </span>
                </div>
                {displayPropina > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      {t("tipLabelPrefix")}
                    </span>
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      ${displayPropina.toFixed(2)} MXN
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
