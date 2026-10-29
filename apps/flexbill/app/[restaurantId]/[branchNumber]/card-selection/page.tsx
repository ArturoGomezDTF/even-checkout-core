"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useTable } from "@/app/context/TableContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { useGuest, useIsGuest } from "@/app/context/GuestContext";
import { usePayment } from "@/app/context/PaymentContext";
import { getRestaurantData } from "@/app/utils/restaurantData";
import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { useEcartPay } from "@/app/hooks/useEcartPay";
import MenuHeaderBack from "@/app/components/headers/MenuHeaderBack";
import { apiService } from "@/app/utils/api";
import PaymentStatusVideo, {
  type PaymentStatus,
} from "@/app/components/UI/PaymentStatusVideo";
import { useValidateAccess } from "@/app/hooks/useValidateAccess";
import ValidationError from "@/app/components/ValidationError";
import {
  paymentService,
  type FlexBillBreakdown,
} from "@/app/services/payment.service";
import { useAgentStatus } from "@/app/hooks/useAgentStatus";
import { useRestaurant } from "@/app/context/RestaurantContext";
import POSBlockedModal from "@/app/components/POSBlockedModal";
import {
  ensurePaymentIntent,
  clearStoredPaymentIntent,
  updateStoredPaymentIntent,
} from "@/app/utils/paymentIdempotency";

import { Plus, Trash2, Loader2, CircleAlert, X } from "lucide-react";
import { getCardTypeIcon } from "@/app/utils/cardIcons";
import { usePaymentProvider } from "@/app/hooks/usePaymentProvider";
import { useMsiConfig } from "@/app/hooks/useMsiConfig";

// Google Pay deshabilitado temporalmente — cambiar a false para reactivarlo.
const GOOGLE_PAY_DISABLED = true;

// Cadencia del polling de "¿ya se cobró?" en payment_in_progress.
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 60000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Apple/Google Pay abren una hoja de pago nativa fuera de la página — en
// mobile el navegador puede suspender la pestaña mientras está abierta, y
// perder el callback "success" del SDK aunque el cobro sí se haya
// completado. Este marcador persiste el intento para poder reconciliarlo
// contra EcartPay cuando la página vuelve a estar visible.
const INFLIGHT_WALLET_PAYMENT_KEY = "even-inflight-wallet-payment";
const WALLET_PAYMENT_PAID_STATUSES = [
  "paid",
  "completed",
  "succeeded",
  "approved",
];

function savePendingWalletPayment(
  ecartpayOrderId: string,
  paymentSource: "apple_pay" | "google_pay",
  baseAmount: number,
  paymentType: string,
) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    INFLIGHT_WALLET_PAYMENT_KEY,
    JSON.stringify({
      ecartpayOrderId,
      paymentSource,
      baseAmount,
      paymentType,
      createdAt: Date.now(),
    }),
  );
}

function clearPendingWalletPayment() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(INFLIGHT_WALLET_PAYMENT_KEY);
}

export default function CardSelectionPage() {
  const t = useTranslations("CardSelectionPage");
  const tc = useTranslations("Common");
  const { validationError, restaurantId, branchNumber } = useValidateAccess();
  const { restaurant } = useRestaurant();
  const { provider, isLoadingProvider } = usePaymentProvider(restaurantId);
  const {
    isAgentRequired,
    isAgentDisconnected,
    isTurnoClosed,
    isLoadingAgentStatus,
  } = useAgentStatus(
    restaurantId,
    branchNumber ? parseInt(branchNumber) : null,
  );
  const isPOSBlocked = isAgentDisconnected || isTurnoClosed;
  const { msiConfig } = useMsiConfig();
  const { state, dispatch, loadTableData } = useTable();
  const { navigateWithTable } = useTableNavigation();
  const searchParams = useSearchParams();
  const restaurantData = getRestaurantData();
  const isGuest = useIsGuest();
  const { guestId, tableNumber, guestName, setAsAuthenticated } = useGuest();
  const { hasPaymentMethods, paymentMethods, deletePaymentMethod } =
    usePayment();
  const { user, profile, isLoading } = useAuth();

  const profileRef = useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // Establecer tableNumber desde URL si no está en el estado
  useEffect(() => {
    const tableFromUrl = searchParams?.get("table");
    if (tableFromUrl && !state.tableNumber) {
      dispatch({ type: "SET_TABLE_NUMBER", payload: tableFromUrl });
    }
  }, [searchParams, state.tableNumber, dispatch]);

  // Tarjeta de prueba del sistema — SOLO para dev/QA. Gateada detrás de
  // NEXT_PUBLIC_SHOW_TEST_CARD porque, sin el gate, esto le mostraba a
  // cualquier usuario real en producción una tarjeta que "paga" sin cobrar
  // de verdad (ver rama payment_source: "dev" en handlePayment).
  const showTestCard = process.env.NEXT_PUBLIC_SHOW_TEST_CARD === "true";

  const defaultSystemCard = {
    id: "system-default-card",
    lastFourDigits: "1234",
    cardBrand: "amex",
    cardType: "credit",
    isDefault: true,
    isSystemCard: true,
  };

  // Combinar tarjetas del sistema con las del usuario — la tarjeta de
  // prueba solo se agrega (y por lo tanto solo puede seleccionarse) cuando
  // el flag está activo.
  const allPaymentMethods = showTestCard
    ? [defaultSystemCard, ...paymentMethods]
    : paymentMethods;

  const paymentType = searchParams.get("type") || "full-bill";
  const totalAmountCharged = parseFloat(searchParams.get("amount") || "0"); // Total cobrado al cliente
  const baseAmount = parseFloat(searchParams.get("baseAmount") || "0"); // Monto base (consumo)
  const tipAmount = parseFloat(searchParams.get("tipAmount") || "0"); // Propina
  const ivaTip = parseFloat(searchParams.get("ivaTip") || "0"); // IVA propina (no pagado por cliente)
  const evenCommissionClient = parseFloat(
    searchParams.get("evenCommissionClient") || "0",
  );
  const ivaEvenClient = parseFloat(searchParams.get("ivaEvenClient") || "0");
  const evenCommissionRestaurant = parseFloat(
    searchParams.get("evenCommissionRestaurant") || "0",
  );
  const evenCommissionTotal = parseFloat(
    searchParams.get("evenCommissionTotal") || "0",
  );
  const ecartCommissionTotal = parseFloat(
    searchParams.get("ecartCommissionTotal") || "0",
  );
  const userName = searchParams.get("userName");
  const selectedItemsParam = searchParams.get("selectedItems");

  // Calcular valores faltantes
  const evenClientCharge = evenCommissionClient + ivaEvenClient;

  // Lo que se muestra en pantalla: Subtotal fijo (no se mueve con la
  // propina) y Propina como residuo — ya calculados en tip-selection (ver
  // commissionCalculator.ts resolveTipAmountForTargetDisplay). Fallback al
  // cálculo viejo por si el link no trae estos params (caso raro).
  const displaySubtotal = searchParams.get("displaySubtotal")
    ? parseFloat(searchParams.get("displaySubtotal") || "0")
    : baseAmount + evenClientCharge;
  const displayPropina = searchParams.get("displayPropina")
    ? parseFloat(searchParams.get("displayPropina") || "0")
    : tipAmount;

  // IVA sobre la comisión del restaurante (16% de evenCommissionRestaurant)
  const ivaEvenRestaurant = evenCommissionRestaurant * 0.16;

  // Cargo total al restaurante (comisión + IVA)
  const evenRestaurantCharge = evenCommissionRestaurant + ivaEvenRestaurant;

  // Subtotal para comisión es el consumo base + propina
  const subtotalForCommission = baseAmount + tipAmount;

  // Tasa aplicada (% total de comisión Even sobre el subtotal)
  const evenRateApplied =
    subtotalForCommission > 0
      ? (evenCommissionTotal / subtotalForCommission) * 100
      : 0;

  useEcartPay();

  //const isDev = process.env.NODE_ENV === "development";

  // Determinar el nombre a usar: prioridad a userName de URL, luego state.currentUserName, luego nombre de usuario autenticado
  const effectiveName =
    userName ||
    state.currentUserName ||
    (profile?.firstName && profile?.lastName
      ? `${profile.firstName} ${profile.lastName}`
      : profile?.firstName || "") ||
    guestName ||
    "";

  const [name, setName] = useState(effectiveName);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<
    string | null
  >(null);
  const [paymentAttempts, setPaymentAttempts] = useState(0);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(
    null,
  );
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isTableDataReady, setIsTableDataReady] = useState(false);
  const [showPOSModal, setShowPOSModal] = useState(false);
  const [posModalReason, setPosModalReason] = useState<
    "turno_closed" | "agent_disconnected"
  >("turno_closed");
  const [showTotalModal, setShowTotalModal] = useState(false);
  const [showPaymentOptionsModal, setShowPaymentOptionsModal] = useState(false);
  const [selectedMSI, setSelectedMSI] = useState<number | null>(null);
  const applePayListenersRef = useRef(false);
  const walletPaymentRecoveryAttemptedRef = useRef(false);
  const googlePayListenersRef = useRef(false);
  // Reflejan applePayReady/googlePayReady sin closures obsoletos dentro de
  // los listeners del SDK (se registran una sola vez con `.on(...)`).
  const applePayReadyRef = useRef(false);
  const googlePayReadyRef = useRef(false);
  const googlePaySucceededRef = useRef(false);
  const googlePay3dsObserverRef = useRef<MutationObserver | null>(null);
  const googlePay3dsPollRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const stopGooglePay3dsWatch = () => {
    googlePay3dsObserverRef.current?.disconnect();
    googlePay3dsObserverRef.current = null;
    if (googlePay3dsPollRef.current) clearInterval(googlePay3dsPollRef.current);
    googlePay3dsPollRef.current = null;
  };
  useEffect(() => stopGooglePay3dsWatch, []);
  const [applePayReady, setApplePayReady] = useState(false);
  const [applePayUnavailable, setApplePayUnavailable] = useState(false);
  const [isApplePayProcessing, setIsApplePayProcessing] = useState(false);
  const [googlePayReady, setGooglePayReady] = useState(false);
  const [googlePayUnavailable, setGooglePayUnavailable] = useState<boolean>(
    () => {
      if (typeof window === "undefined") return false;
      const ua = navigator.userAgent;
      return (
        /iPhone|iPad|iPod/.test(ua) ||
        (ua.includes("Macintosh") &&
          navigator.vendor === "Apple Computer, Inc.")
      );
    },
  );
  const [isGooglePayProcessing, setIsGooglePayProcessing] = useState(false);
  const [googlePayPaymentId, setGooglePayPaymentId] = useState<string | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState<string>(t("processingError"));
  // false cuando ya hay certeza de que se cobró (o no hay
  // certeza de lo contrario) — el modal de error no debe ofrecer un botón
  // que dispare un segundo cobro.
  const [canRetryCharge, setCanRetryCharge] = useState(true);

  useEffect(() => {
    if (!isLoading && user) {
      setAsAuthenticated(user.id);
    }
  }, [isLoading, user, setAsAuthenticated]);

  useEffect(() => {
    // Actualizar nombre cuando cambie effectiveName
    const newName =
      userName ||
      state.currentUserName ||
      (profile?.firstName && profile?.lastName
        ? `${profile.firstName} ${profile.lastName}`
        : profile?.firstName || "") ||
      "";
    if (newName && newName !== name) {
      setName(newName);
    }

    // Configurar usuarios seleccionados según el tipo de pago
    if (userName) {
      setSelectedUsers([userName]);
    }

    // Configurar items seleccionados para select-items
    if (paymentType === "select-items" && selectedItemsParam) {
      setSelectedItems(
        selectedItemsParam.split(",").filter((item) => item.trim() !== ""),
      );
    }
  }, [userName, state.currentUserName, user, paymentType, selectedItemsParam]);

  // Cargar datos de la mesa si no existen en el contexto
  useEffect(() => {
    const loadData = async () => {
      if (state.tableNumber) {
        // Si no hay datos cargados o están desactualizados, cargar
        await loadTableData();
        setIsTableDataReady(true);
      } else if (!state.tableNumber) {
        setIsTableDataReady(true);
      }
    };
    loadData();
  }, [state.tableNumber]);

  // Calcular totales basados en el nuevo sistema de platillos
  const dishOrders = Array.isArray(state.dishOrders) ? state.dishOrders : [];

  // Total de la mesa basado en platillos
  const tableTotalPrice = dishOrders.reduce((sum, dish) => {
    return sum + (dish.total_price || 0);
  }, 0);

  // Platillos no pagados
  const unpaidDishes = dishOrders.filter(
    (dish) => dish.payment_status === "not_paid" || !dish.payment_status,
  );

  // Items para enviar a EcartPay según el tipo de pago
  const getEcartPayItems = () => {
    if (paymentType === "user-items" && userName) {
      return dishOrders
        .filter(
          (d) =>
            (d.payment_status === "not_paid" || !d.payment_status) &&
            d.guest_name === userName,
        )
        .map((d) => ({
          name: d.item,
          price: d.price,
          quantity: d.quantity,
          extraPrice: d.extra_price || 0,
        }));
    }
    if (paymentType === "select-items") {
      return dishOrders
        .filter((d) => selectedItems.includes(d.dish_order_id?.toString()))
        .map((d) => ({
          name: d.item,
          price: d.price,
          quantity: d.quantity,
          extraPrice: d.extra_price || 0,
        }));
    }
    // full-bill, choose-amount, equal-shares: items simplificados que suman el monto exacto
    const items: {
      name: string;
      price: number;
      quantity: number;
      extraPrice: number;
    }[] = [];
    if (baseAmount > 0)
      items.push({
        name: t("itemNameConsumption"),
        price: baseAmount,
        quantity: 1,
        extraPrice: 0,
      });
    if (tipAmount > 0)
      items.push({
        name: t("itemNameTip"),
        price: tipAmount,
        quantity: 1,
        extraPrice: 0,
      });
    const commission =
      Math.round(((evenCommissionClient || 0) + (ivaEvenClient || 0)) * 100) /
      100;
    if (commission > 0)
      items.push({
        name: t("itemNameServiceFee"),
        price: commission,
        quantity: 1,
        extraPrice: 0,
      });
    return items;
  };

  const unpaidAmount = unpaidDishes.reduce((sum, dish) => {
    return sum + (dish.total_price || 0);
  }, 0);

  // Red de seguridad: si la mesa ya no tiene nada pendiente por pagar (link
  // viejo, alguien más ya saldó el resto mientras se elegía el método de
  // pago, etc.) no hay nada que cobrar acá. Se exige `dishOrders.length > 0`
  // para no disparar en el primer render, antes de que los platillos reales
  // de la mesa hayan terminado de cargar (dishOrders arranca vacío). No
  // aplica mientras se está procesando el pago o mostrando el video de
  // éxito, ya que justo ahí los platillos pasan a estar pagados.
  useEffect(() => {
    if (
      isTableDataReady &&
      dishOrders.length > 0 &&
      unpaidDishes.length === 0 &&
      !isProcessing &&
      paymentStatus !== "processing" &&
      paymentStatus !== "success"
    ) {
      navigateWithTable("/menu", true);
    }
  }, [
    isTableDataReady,
    dishOrders.length,
    unpaidDishes.length,
    isProcessing,
    paymentStatus,
    navigateWithTable,
  ]);

  // Set default payment method when payment methods are loaded (only once)
  useEffect(() => {
    const visibleMethods = allPaymentMethods;
    /*.filter(
      (pm) => isDev || pm.id !== "system-default-card",
    );*/
    if (!selectedPaymentMethodId && visibleMethods.length > 0) {
      const defaultMethod = visibleMethods.find((pm) => pm.isDefault);
      if (defaultMethod) {
        setSelectedPaymentMethodId(defaultMethod.id);
      }
    }
    // Set loading to false once we have payment methods data
    setIsLoadingInitial(false);
  }, [allPaymentMethods.length]);

  // Log del proveedor de pago activo
  useEffect(() => {
    if (!isLoadingProvider) {
      if (provider === "clip") {
        console.warn(
          "[PaymentProvider] Clip seleccionado — flujo no implementado aún, usando eCartPay como fallback",
        );
      }
    }
  }, [provider, isLoadingProvider, restaurantId]);

  // Verificar soporte de Apple Pay y cargar el SDK solo si aplica.
  // En navegadores in-app (Instagram, Facebook, TikTok) el puente nativo que
  // inyecta `ApplePaySession` en `window` puede tardar unos momentos en
  // estar listo — un chequeo único al montar a veces corre antes de que eso
  // pase. Por eso reintentamos por un rato en vez de rendirnos de una.
  useEffect(() => {
    if (isLoadingProvider) return; // esperar a que se resuelva el proveedor

    // Apple Pay solo aplica cuando el proveedor es eCartPay (o null como fallback)
    if (provider !== null && provider !== "ecartpay") return;

    const loadSDK = () => {
      setApplePayUnavailable(false);
      const src = "https://pay.ecart.com/sdk/pay.js";
      if (!document.querySelector(`script[src="${src}"]`)) {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onerror = () => setApplePayUnavailable(true);
        document.head.appendChild(script);
      }
    };

    const checkSupport = () => {
      const ApplePaySession = (window as any).ApplePaySession;
      if (ApplePaySession && ApplePaySession.canMakePayments?.()) {
        loadSDK();
        return true;
      }
      return false;
    };

    if (checkSupport()) return;

    let attempts = 0;
    const maxAttempts = 10; // ~3s de margen para que se inyecte ApplePaySession
    const interval = setInterval(() => {
      attempts += 1;
      const found = checkSupport();
      if (found || attempts >= maxAttempts) {
        clearInterval(interval);
        if (!found) {
          // Nunca apareció ApplePaySession — el navegador realmente no lo soporta
          setApplePayUnavailable(true);
        }
      }
    }, 300);

    return () => clearInterval(interval);
  }, [provider, isLoadingProvider]);

  // Verificar soporte de Google Pay y cargar el SDK solo si aplica
  useEffect(() => {
    if (GOOGLE_PAY_DISABLED) {
      setGooglePayUnavailable(true);
      return;
    }
    if (isLoadingProvider) return;

    // Google Pay solo aplica cuando el proveedor es eCartPay (o null como fallback)
    if (provider !== null && provider !== "ecartpay") return;

    // Google Pay no está disponible en iOS — usar Apple Pay
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      setGooglePayUnavailable(true);
      return;
    }

    const src = "https://pay.ecart.com/sdk/pay.js";
    if (!document.querySelector(`script[src="${src}"]`)) {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onerror = () => setGooglePayUnavailable(true);
      document.head.appendChild(script);
    }
  }, [provider, isLoadingProvider]);

  const handlePaymentSuccess = async (
    paymentId: string,
    amount: number,
    paymentType: string,
    ecartpayOrderId: string | null = null,
    paymentSource: string | null = null,
    flexBillBreakdown: FlexBillBreakdown | null = null,
  ): Promise<void> => {
    // A partir de acá el pago pasa a manejarse por esta ejecución — limpiar
    // el marcador de recuperación para no reintentarlo de nuevo.
    clearPendingWalletPayment();
    try {
      setIsProcessing(true);

      // Determinar el payment_method_id real (null para tarjeta del sistema)
      const realPaymentMethodId =
        selectedPaymentMethodId === "system-default-card"
          ? null
          : selectedPaymentMethodId;

      // Get table_order_id from any dish order
      const tableOrderId =
        dishOrders.length > 0 && dishOrders[0].table_order_id
          ? dishOrders[0].table_order_id
          : null;

      // Usar null para tarjeta del sistema, sino usar el selectedPaymentMethodId
      const transactionPaymentMethodId =
        selectedPaymentMethodId === "system-default-card"
          ? null
          : selectedPaymentMethodId;

      // Determinar nombre del pagador
      const transactionBy = isGuest
        ? guestName || "Invitado"
        : [profile?.firstName, profile?.lastName].filter(Boolean).join(" ");

      // IDs de dish_order que cubre este pago — el backend los usa para
      // recalcular la comisión desde los precios reales cuando el pago
      // es de ítems específicos (select-items/user-items). Para
      // full-bill/equal-shares/choose-amount no aplica: el backend
      // calcula sobre todos los pendientes de la mesa o una fracción.
      const selectedItemIds =
        paymentType === "select-items"
          ? selectedItems
          : paymentType === "user-items" && userName
            ? dishOrders
                .filter(
                  (d) =>
                    (d.payment_status === "not_paid" ||
                      !d.payment_status) &&
                    d.guest_name === userName,
                )
                .map((d) => d.dish_order_id?.toString())
            : undefined;

      // registrarTransaccion va ANTES de marcar platillos/mesa como pagados a
      // propósito: para select-items/user-items, el backend recalcula la
      // comisión comparando contra lo que sigue "sin pagar" en ese momento
      // (recomputeFlexBillCommission → computeFlexBillAmountDue). Si el pago
      // ya se hubiera aplicado (dish_order.payment_status='paid'), esa
      // comparación da 0 y el registro contable truena con "base_amount debe
      // ser mayor a 0" — el pago quedaría aplicado pero sin fila en
      // payment_transactions ni sincronización con POS (que se dispara desde
      // el mismo endpoint). A diferencia del pago en efectivo
      // (CashPaymentModal en even-crew), acá el dinero real ya se cobró vía
      // el proveedor de pago (eCartPay/Apple Pay/Google Pay) antes de llegar
      // a esta función — si el registro de la transacción falla igual hay
      // que marcar el pago como aplicado, no dejar al cliente cobrado con la
      // cuenta mostrando que todavía debe. Por eso, a diferencia del flujo de
      // efectivo, un error acá no aborta el pago — solo se loguea para
      // reconciliación manual.
      const registrarTransaccion = async () => {
        await paymentService.recordPaymentTransaction({
          payment_method_id: transactionPaymentMethodId,
          restaurant_id: parseInt(restaurantId),
          id_table_order: tableOrderId,
          id_tap_orders_and_pay: null,
          ecartpay_order_id: ecartpayOrderId,
          payment_source: paymentSource,
          payment_type: paymentType,
          selected_item_ids: selectedItemIds,
          base_amount: flexBillBreakdown?.base_amount ?? baseAmount,
          tip_amount: flexBillBreakdown?.tip_amount ?? tipAmount,
          iva_tip: flexBillBreakdown?.iva_tip ?? ivaTip,
          even_commission_total:
            flexBillBreakdown?.even_commission_total ?? evenCommissionTotal,
          even_commission_client:
            flexBillBreakdown?.even_commission_client ?? evenCommissionClient,
          even_commission_restaurant:
            flexBillBreakdown?.even_commission_restaurant ??
            evenCommissionRestaurant,
          iva_even_client:
            flexBillBreakdown?.iva_even_client ?? ivaEvenClient,
          iva_even_restaurant:
            flexBillBreakdown?.iva_even_restaurant ?? ivaEvenRestaurant,
          even_client_charge:
            flexBillBreakdown?.even_client_charge ??
            evenCommissionClient + ivaEvenClient,
          even_restaurant_charge:
            flexBillBreakdown?.even_restaurant_charge ?? evenRestaurantCharge,
          even_rate_applied:
            flexBillBreakdown?.even_rate_applied ?? evenRateApplied,
          total_amount_charged:
            flexBillBreakdown?.total_amount_charged ??
            (selectedMSI ? displayTotal : totalAmountCharged),
          subtotal_for_commission:
            flexBillBreakdown?.subtotal_for_commission ??
            subtotalForCommission,
          currency: "MXN",
          transaction_by: transactionBy,
        });
      };

      try {
        await registrarTransaccion();
      } catch (transactionError) {
        console.error(
          "❌ Error registrando la transacción de pago (se continúa aplicando el pago; requiere reconciliación manual):",
          transactionError,
        );
      }

      // OPERACIONES CRÍTICAS: marcar platillos/mesa como pagados. El dinero
      // ya se cobró vía el proveedor de pago — esto solo refleja ese cobro
      // en nuestra base, y debe completarse antes de mostrar la animación.
      if (paymentType === "user-items" && userName) {
        // Pagar solo los platillos del usuario específico
        await paymentService.payUserDishes(
          dishOrders,
          userName,
          realPaymentMethodId,
        );
      } else if (paymentType === "select-items") {
        // Pagar solo los platillos seleccionados específicamente
        await paymentService.paySelectedDishes(
          selectedItems,
          realPaymentMethodId,
        );
      } else if (
        paymentType === "full-bill" ||
        paymentType === "choose-amount" ||
        paymentType === "equal-shares"
      ) {
        // Para cuenta completa o monto personalizado, usar el monto exacto
        await paymentService.payTableAmount({
          restaurantId,
          branchNumber,
          tableNumber: state.tableNumber,
          amount: baseAmount,
          userId: user?.id,
          guestId: !user?.id ? guestId : null,
          guestName: !user?.id ? name.trim() : null,
          paymentMethodId: realPaymentMethodId,
        });
      }

      // Recargar datos de la mesa en segundo plano — solo refresca la UI, no
      // bloquea la animación de éxito.
      loadTableData().catch((err) =>
        console.error("Error refrescando la mesa después del pago:", err),
      );

      // Store payment success data for payment-success page (rápido, solo localStorage)
      if (typeof window !== "undefined") {
        // Limpiar datos de pago anteriores para que payment-success lea datos frescos
        sessionStorage.removeItem("even-current-payment-key");
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const key = sessionStorage.key(i);
          if (key?.startsWith("even-payment-success-"))
            sessionStorage.removeItem(key);
        }

        // Get payment method details
        const selectedMethod = allPaymentMethods.find(
          (pm) => pm.id === selectedPaymentMethodId,
        );

        // table_order_id real — es lo que payment-success usa con prioridad
        // para buscar la factura, así que debe ganarle al paymentId mock que
        // se usa en Apple Pay / Google Pay / tarjeta del sistema.
        const tableOrderIdForInvoice =
          dishOrders.length > 0 && dishOrders[0].table_order_id
            ? dishOrders[0].table_order_id
            : null;

        const successData = {
          paymentId,
          transactionId: tableOrderIdForInvoice,
          amount,
          paymentType,
          userName: userName || name,
          tableNumber: state.tableNumber,
          dishOrders: dishOrders, // Todos los dish orders de la mesa
          tableSummary: state.tableSummary, // Resumen completo de la mesa
          baseAmount,
          tipAmount,
          displaySubtotal,
          displayPropina,
          ivaTip,
          evenCommissionClient,
          ivaEvenClient,
          evenCommissionRestaurant,
          evenRestaurantCharge,
          evenCommissionTotal,
          totalAmountCharged: selectedMSI ? displayTotal : totalAmountCharged,
          installments: selectedMSI || null,
          installmentBaseAmount: selectedMSI ? totalAmountCharged : null,
          dishCount:
            paymentType === "user-items"
              ? dishOrders.filter((d) => d.guest_name === userName).length
              : paymentType === "select-items"
                ? selectedItems.length
                : unpaidDishes.length,
          selectedItems: paymentType === "select-items" ? selectedItems : [], // Store selected items for filtering
          alreadyProcessed: true,
          // Payment method details
          cardLast4: selectedMethod?.lastFourDigits,
          cardBrand: selectedMethod?.cardType,
        };

        localStorage.setItem(
          "even-completed-payment",
          JSON.stringify(successData),
        );
      }
    } catch (error) {
      console.error("❌ Error processing payment success:", error);
      setIsProcessing(false);
    }
  };

  const handleSuccessVideoComplete = useCallback(() => {
    // Navigate after the success video finishes playing
    // Usar el table_order_id real cuando esté disponible para que la
    // búsqueda de factura en payment-success pueda encontrar la transacción
    const tableOrderId =
      dishOrders.length > 0 && dishOrders[0].table_order_id
        ? dishOrders[0].table_order_id
        : null;
    const paymentId = tableOrderId || "completed";
    navigateWithTable(
      `/payment-success?paymentId=${paymentId}&amount=${baseAmount}&type=${paymentType}&processed=true`,
      true,
    );
  }, [navigateWithTable, baseAmount, paymentType, dishOrders]);

  const handleFailedVideoComplete = useCallback(() => {
    // Se queda en card-selection — solo se cierra el video de fallo
    setPaymentStatus(null);
  }, []);

  const getApplePaySDK = () =>
    new Promise<any>((resolve) => {
      if ((window as any).Pay?.ApplePay) {
        return resolve((window as any).Pay.ApplePay);
      }

      // Timeout de seguridad: si el SDK no carga (p.ej. el script da 404),
      // resolvemos null en vez de esperar para siempre — así el botón cae a
      // "no disponible" en lugar de quedarse cargando eternamente.
      const start = Date.now();
      const interval = setInterval(() => {
        if ((window as any).Pay?.ApplePay) {
          clearInterval(interval);
          resolve((window as any).Pay.ApplePay);
        } else if (Date.now() - start > 8000) {
          clearInterval(interval);
          resolve(null);
        }
      }, 100);
    });

  const getGooglePaySDK = () =>
    new Promise<any>((resolve) => {
      if ((window as any).Pay?.GooglePay) {
        return resolve((window as any).Pay.GooglePay);
      }
      // Timeout de seguridad: ver getApplePaySDK.
      const start = Date.now();
      const interval = setInterval(() => {
        if ((window as any).Pay?.GooglePay) {
          clearInterval(interval);
          resolve((window as any).Pay.GooglePay);
        } else if (Date.now() - start > 8000) {
          clearInterval(interval);
          resolve(null);
        }
      }, 100);
    });

  // Inicializar Apple Pay SDK con ref guard para evitar doble registro de listeners
  useEffect(() => {
    if (
      isLoadingInitial ||
      totalAmountCharged <= 0 ||
      typeof window === "undefined"
    )
      return;
    if (applePayListenersRef.current) return;
    applePayListenersRef.current = true;

    (async () => {
      try {
        const applePayItems =
          paymentType === "user-items" || paymentType === "select-items"
            ? getEcartPayItems()
            : [
                {
                  name: t("itemNameConsumption"),
                  price: baseAmount,
                  quantity: 1,
                  extraPrice: 0,
                },
              ];
        const orderResult = await paymentService.createApplePayOrder({
          amount: totalAmountCharged,
          currency: "MXN",
          tableNumber: undefined,
          restaurantId: restaurantId?.toString(),
          baseAmount,
          tipAmount,
          items: applePayItems,
          // Flex Bill: recalcula server-side con el modelo de comisión
          // por-ítem correcto, en vez de calculateCommissions.
          id_table_order:
            dishOrders.length > 0 ? dishOrders[0].table_order_id : null,
          payment_type: paymentType,
          selected_item_ids:
            paymentType === "select-items"
              ? selectedItems
              : paymentType === "user-items" && userName
                ? dishOrders
                    .filter(
                      (d) =>
                        (d.payment_status === "not_paid" ||
                          !d.payment_status) &&
                        d.guest_name === userName,
                    )
                    .map((d) => d.dish_order_id?.toString())
                : undefined,
        });

        const appleOrderId =
          (orderResult as any).orderId ?? orderResult.data?.orderId;
        if (!orderResult.success || !appleOrderId) {
          console.warn("⚠️ Apple Pay: no se pudo crear la orden", orderResult);
          applePayListenersRef.current = false;
          return;
        }

        savePendingWalletPayment(
          appleOrderId,
          "apple_pay",
          baseAmount,
          paymentType,
        );

        const sdkAlreadyLoaded = !!(window as any).Pay?.ApplePay;
        const applePaySDK = await getApplePaySDK();
        if (!applePaySDK) {
          console.warn("⚠️ Apple Pay SDK no disponible en window.Pay.ApplePay");
          setApplePayUnavailable(true);
          applePayListenersRef.current = false;
          return;
        }

        applePaySDK.on("ready", () => {
          setTimeout(() => {
            applePayReadyRef.current = true;
            setApplePayReady(true);
          }, 2800);
        });
        applePaySDK.on("unavailable", () => {
          setApplePayUnavailable(true);
        });
        applePaySDK.on("cancel", () => setIsApplePayProcessing(false));
        applePaySDK.on("error", (err: any) => {
          // Este evento también dispara en la inicialización del SDK (no solo
          // en un intento real de pago), así que no siempre implica que Apple
          // Pay dejó de estar disponible. Si el botón ya se había mostrado
          // (init exitoso), esto es un error de un intento de pago real —p.ej.
          // tarjeta rechazada por fondos insuficientes— y el usuario debe
          // poder reintentar, así que no lo ocultamos. Solo lo ocultamos si
          // el error ocurre antes de que el botón llegara a estar listo.
          console.error("❌ Apple Pay error:", err);
          setIsApplePayProcessing(false);
          if (!applePayReadyRef.current) {
            setApplePayUnavailable(true);
          }
        });
        applePaySDK.on("success", async () => {
          const mockPaymentId = `apple-pay-${Date.now()}`;
          setIsApplePayProcessing(true);
          setPaymentStatus("processing");
          await handlePaymentSuccess(
            mockPaymentId,
            baseAmount,
            paymentType,
            appleOrderId,
            "apple_pay",
          );
          setPaymentStatus("success");
        });

        applePaySDK.render({
          container: "#apple-pay-container",
          orderId: appleOrderId,
          amount: totalAmountCharged,
          currency: "MXN",
          countryCode: "MX",
          supportedNetworks: ["visa", "masterCard"],
          buttonStyle: "black",
          buttonType: "pay",
          borderRadius: "8px",
        });

        if (sdkAlreadyLoaded) {
          setTimeout(() => {
            applePayReadyRef.current = true;
            setApplePayReady(true);
          }, 2800);
        }
      } catch (err) {
        applePayListenersRef.current = false;
        console.error("❌ Error inicializando Apple Pay:", err);
      }
    })();
  }, [isLoadingInitial, totalAmountCharged]);

  // Inicializar Google Pay SDK con ref guard para evitar doble registro de listeners
  useEffect(() => {
    if (GOOGLE_PAY_DISABLED) return;
    if (
      isLoadingInitial ||
      totalAmountCharged <= 0 ||
      typeof window === "undefined"
    )
      return;
    if (googlePayListenersRef.current) return;
    googlePayListenersRef.current = true;

    (async () => {
      try {
        const googlePayItems =
          paymentType === "user-items" || paymentType === "select-items"
            ? getEcartPayItems()
            : [
                {
                  name: t("itemNameConsumption"),
                  price: baseAmount,
                  quantity: 1,
                  extraPrice: 0,
                },
              ];
        const orderResult = await paymentService.createGooglePayOrder({
          amount: totalAmountCharged,
          currency: "MXN",
          tableNumber: undefined,
          restaurantId: restaurantId?.toString(),
          baseAmount,
          tipAmount,
          items: googlePayItems,
          // Flex Bill: recalcula server-side con el modelo de comisión
          // por-ítem correcto, en vez de calculateCommissions.
          id_table_order:
            dishOrders.length > 0 ? dishOrders[0].table_order_id : null,
          payment_type: paymentType,
          selected_item_ids:
            paymentType === "select-items"
              ? selectedItems
              : paymentType === "user-items" && userName
                ? dishOrders
                    .filter(
                      (d) =>
                        (d.payment_status === "not_paid" ||
                          !d.payment_status) &&
                        d.guest_name === userName,
                    )
                    .map((d) => d.dish_order_id?.toString())
                : undefined,
        });

        const googleOrderId =
          (orderResult as any).orderId ?? orderResult.data?.orderId;
        if (!orderResult.success || !googleOrderId) {
          console.warn("⚠️ Google Pay: no se pudo crear la orden", orderResult);
          googlePayListenersRef.current = false;
          return;
        }

        savePendingWalletPayment(
          googleOrderId,
          "google_pay",
          baseAmount,
          paymentType,
        );

        const googleSdkAlreadyLoaded = !!(window as any).Pay?.GooglePay;
        const googlePaySDK = await getGooglePaySDK();
        if (!googlePaySDK) {
          console.warn(
            "⚠️ Google Pay SDK no disponible en window.Pay.GooglePay",
          );
          setGooglePayUnavailable(true);
          googlePayListenersRef.current = false;
          return;
        }

        googlePaySDK.on("ready", () => {
          setTimeout(() => {
            googlePayReadyRef.current = true;
            setGooglePayReady(true);
          }, 2800);
        });
        googlePaySDK.on("unavailable", () => setGooglePayUnavailable(true));
        googlePaySDK.on("cancel", () => setIsGooglePayProcessing(false));
        googlePaySDK.on("error", (err: any) => {
          // Este evento también dispara en la inicialización del SDK (no solo
          // en un intento real de pago), así que no siempre implica que
          // Google Pay dejó de estar disponible. Si el botón ya se había
          // mostrado (init exitoso), esto es un error de un intento de pago
          // real —p.ej. tarjeta rechazada por fondos insuficientes— y el
          // usuario debe poder reintentar, así que no lo ocultamos. Solo lo
          // ocultamos si el error ocurre antes de que el botón llegara a
          // estar listo.
          console.error("❌ Google Pay error:", err);
          setIsGooglePayProcessing(false);
          if (!googlePayReadyRef.current) {
            setGooglePayUnavailable(true);
          }
        });
        const handleGooglePaySuccess = async (paymentId: string) => {
          if (googlePaySucceededRef.current) return;
          googlePaySucceededRef.current = true;
          stopGooglePay3dsWatch();
          setGooglePayPaymentId(paymentId);
          setIsGooglePayProcessing(true);
          setPaymentStatus("processing");
          await handlePaymentSuccess(
            paymentId,
            baseAmount,
            paymentType,
            googleOrderId,
            "google_pay",
          );
          setPaymentStatus("success");
        };

        googlePaySDK.on("success", (event: any) =>
          handleGooglePaySuccess(
            event?.detail?.id || `google-pay-${Date.now()}`,
          ),
        );

        // El SDK abre cualquier redirect_url de process-payment en un overlay
        // y solo emite "success" si el iframe manda postMessage; la página de
        // recibo de EcartPay no lo manda, así que confirmamos por polling.
        const isOrderPaid = async () => {
          const result = await paymentService.getOrderStatus(googleOrderId);
          const status = result.success ? result.data?.status : null;
          return !!status && WALLET_PAYMENT_PAID_STATUSES.includes(status);
        };
        const finishFromOverlay = () => {
          document.getElementById("ecartpay-3ds-overlay")?.remove();
          handleGooglePaySuccess(`google-pay-${Date.now()}`);
        };
        const startPolling = async (overlay: HTMLElement) => {
          if (googlePay3dsPollRef.current) return;
          const startedAt = Date.now();
          googlePay3dsPollRef.current = setInterval(async () => {
            if (Date.now() - startedAt > 5 * 60 * 1000) {
              stopGooglePay3dsWatch();
              return;
            }
            if (await isOrderPaid()) finishFromOverlay();
          }, 3000);
          // Oculto mientras se revisa: si ya está pagada es el recibo y no se
          // muestra; si no, es un reto 3DS real y se deja visible.
          overlay.style.visibility = "hidden";
          if (await isOrderPaid()) finishFromOverlay();
          else overlay.style.visibility = "";
        };
        googlePay3dsObserverRef.current?.disconnect();
        googlePay3dsObserverRef.current = new MutationObserver(() => {
          const overlay = document.getElementById("ecartpay-3ds-overlay");
          if (overlay) startPolling(overlay);
        });
        googlePay3dsObserverRef.current.observe(document.body, {
          childList: true,
        });

        googlePaySDK.render({
          container: "#google-pay-container",
          orderId: googleOrderId,
          amount: totalAmountCharged,
          currency: "MXN",
          countryCode: "MX",
          allowedCardNetworks: ["VISA", "MASTERCARD", "AMEX"],
          allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
          buttonColor: "black",
          buttonType: "pay",
        });

        if (googleSdkAlreadyLoaded) {
          setTimeout(() => {
            googlePayReadyRef.current = true;
            setGooglePayReady(true);
          }, 2800);
        }
      } catch (err) {
        googlePayListenersRef.current = false;
        console.error("❌ Error inicializando Google Pay:", err);
      }
    })();
  }, [isLoadingInitial, totalAmountCharged]);

  // Reconciliar un pago de Apple/Google Pay cuyo callback "success" del SDK
  // se haya perdido (p. ej. la pestaña se suspendió mientras estaba abierta
  // la hoja nativa de pago). Se corre una sola vez, apenas la data de mesa
  // esté lista, consultando directamente el estado real en EcartPay.
  useEffect(() => {
    if (walletPaymentRecoveryAttemptedRef.current) return;
    if (isLoadingInitial || !isTableDataReady) return;
    if (typeof window === "undefined") return;

    const raw = localStorage.getItem(INFLIGHT_WALLET_PAYMENT_KEY);
    if (!raw) return;

    // Esperar a que los platillos de la mesa hayan cargado — si no,
    // handlePaymentSuccess no puede resolver el id_table_order y el registro
    // de la transacción se rechaza en el backend por falta de ese campo.
    if (state.tableNumber && dishOrders.length === 0) return;

    walletPaymentRecoveryAttemptedRef.current = true;

    (async () => {
      let pending: {
        ecartpayOrderId?: string;
        paymentSource?: "apple_pay" | "google_pay";
        baseAmount?: number;
        paymentType?: string;
        createdAt?: number;
      };
      try {
        pending = JSON.parse(raw);
      } catch {
        clearPendingWalletPayment();
        return;
      }

      const THIRTY_MINUTES = 30 * 60 * 1000;
      if (
        !pending.ecartpayOrderId ||
        !pending.createdAt ||
        Date.now() - pending.createdAt > THIRTY_MINUTES
      ) {
        clearPendingWalletPayment();
        return;
      }

      try {
        const statusResult = await paymentService.getOrderStatus(
          pending.ecartpayOrderId,
        );
        const status = statusResult.success ? statusResult.data?.status : null;

        if (status && WALLET_PAYMENT_PAID_STATUSES.includes(status)) {
          console.warn(
            "⚠️ Recuperando pago de wallet interrumpido:",
            pending.ecartpayOrderId,
          );
          setPaymentStatus("processing");
          await handlePaymentSuccess(
            `recovered-${pending.ecartpayOrderId}`,
            pending.baseAmount ?? baseAmount,
            pending.paymentType ?? paymentType,
            pending.ecartpayOrderId,
            pending.paymentSource ?? null,
          );
          setPaymentStatus("success");
        } else {
          clearPendingWalletPayment();
        }
      } catch (err) {
        console.error("❌ Error verificando pago pendiente:", err);
      }
    })();
  }, [
    isLoadingInitial,
    isTableDataReady,
    dishOrders.length,
    state.tableNumber,
  ]);

  const handlePayment = async (): Promise<void> => {
    if (isPOSBlocked) {
      setPosModalReason(isTurnoClosed ? "turno_closed" : "agent_disconnected");
      setShowPOSModal(true);
      return;
    }
    // Validar selección de tarjeta si hay métodos de pago disponibles
    if (!selectedPaymentMethodId) {
      setErrorMessage(t("errorSelectCard"));
      return;
    }

    setIsProcessing(true);
    setPaymentStatus("processing");

    try {
      // Set guest and table info for API service
      if (isGuest && guestId) {
        apiService.setGuestInfo(
          guestId,
          state.tableNumber || tableNumber || undefined,
        );
      }

      // Si se seleccionó la tarjeta del sistema, procesar pago directamente sin EcartPay
      if (selectedPaymentMethodId === "system-default-card") {
        // Simular un pago exitoso y procesar directamente
        const mockPaymentId = `system-payment-${Date.now()}`;

        await handlePaymentSuccess(
          mockPaymentId,
          baseAmount,
          paymentType,
          null,
          "dev",
        );

        // Mostrar video de pago exitoso
        setPaymentStatus("success");
        return;
      }

      // Para tarjetas reales, continuar con el flujo normal de EcartPay
      // Check if user has payment methods
      const paymentMethodsResult = await paymentService.getPaymentMethods();

      if (!paymentMethodsResult.success) {
        throw new Error(
          paymentMethodsResult.error?.message ||
            "Failed to fetch payment methods",
        );
      }

      if (
        !paymentMethodsResult.data?.paymentMethods ||
        paymentMethodsResult.data.paymentMethods.length === 0
      ) {
        // No payment methods, redirect to add card page
        setIsProcessing(false);
        setPaymentStatus(null);

        const queryParams = new URLSearchParams({
          amount: totalAmountCharged.toString(), // Total cobrado al cliente
          baseAmount: baseAmount.toString(), // Monto base (consumo)
          tipAmount: tipAmount.toString(),
          displaySubtotal: displaySubtotal.toString(),
          displayPropina: displayPropina.toString(),
          ivaTip: ivaTip.toString(),
          evenCommissionClient: evenCommissionClient.toString(),
          ivaEvenClient: ivaEvenClient.toString(),
          evenCommissionRestaurant: evenCommissionRestaurant.toString(),
          evenRestaurantCharge: evenRestaurantCharge.toString(),
          evenCommissionTotal: evenCommissionTotal.toString(),
          type: paymentType,
          ...(userName && { userName }),
        });

        navigateWithTable(`/add-card?${queryParams.toString()}`);
        return;
      }

      // Determinar qué método de pago usar
      const paymentMethods = paymentMethodsResult.data.paymentMethods;
      let paymentMethodToUse;

      if (!isGuest && selectedPaymentMethodId) {
        // Usuario registrado: usar tarjeta seleccionada
        paymentMethodToUse = paymentMethods.find(
          (pm) => pm.id === selectedPaymentMethodId,
        );
        if (!paymentMethodToUse) {
          throw new Error("Tarjeta seleccionada no encontrada");
        }
      } else {
        // Usuario invitado o fallback: usar tarjeta predeterminada/primera
        paymentMethodToUse =
          paymentMethods.find((pm) => pm.isDefault) || paymentMethods[0];
      }

      // IDs de dish_order que cubre este pago, para que el backend recalcule
      // la comisión sobre los ítems exactos en select-items/user-items — ver
      // el mismo cálculo reusado en recordPaymentTransaction más abajo.
      const selectedItemIdsForPayment =
        paymentType === "select-items"
          ? selectedItems
          : paymentType === "user-items" && userName
            ? dishOrders
                .filter(
                  (d) =>
                    (d.payment_status === "not_paid" || !d.payment_status) &&
                    d.guest_name === userName,
                )
                .map((d) => d.dish_order_id?.toString())
            : undefined;

      // Process payment directly with selected/default payment method
      const ecartPayItems =
        selectedMSI ||
        (paymentType !== "user-items" && paymentType !== "select-items")
          ? undefined
          : getEcartPayItems();

      const paymentData = {
        paymentMethodId: paymentMethodToUse.id,
        amount: totalAmountCharged,
        currency: "MXN",
        description: `Even Restaurant Payment - Table ${tableNumber || state.tableNumber || "N/A"}${userName ? ` - ${userName}` : ""} - Tip: $${tipAmount.toFixed(2)} - Commission: $${(evenCommissionClient + ivaEvenClient).toFixed(2)}`,
        orderId: `order-${Date.now()}-attempt-${paymentAttempts + 1}`,
        tableNumber: tableNumber || state.tableNumber,
        restaurantId: restaurantId,
        installments: selectedMSI || undefined,
        baseAmount,
        tipAmount,
        items: ecartPayItems,
        // Flex Bill: le permite al backend recalcular el monto real a cobrar
        // desde los dish_order de la mesa en vez de confiar en baseAmount —
        // ver processPayment/computeFlexBillAmountDue.
        id_table_order:
          dishOrders.length > 0 ? dishOrders[0].table_order_id : null,
        payment_type: paymentType,
        selected_item_ids: selectedItemIdsForPayment,
      };

      // Después de un 2xx de /payments, esta
      // app NUNCA vuelve a llamar /payments con otra clave para el mismo
      // carrito. La clave y el fingerprint solo se regeneran si el carrito
      // (o la propina/monto) cambió.
      const intent = await ensurePaymentIntent({
        items: (ecartPayItems || []).map((i) => ({
          menuItemId: i.name,
          quantity: i.quantity,
          extraPrice: i.extraPrice || 0,
          customFields: null,
        })),
        tipAmount,
        discountId: null,
        total: totalAmountCharged,
      });

      let ecartpayOrderId = intent.ecartpayOrderId;
      let flexBillBreakdownFromPayment: FlexBillBreakdown | null = null;

      if (!ecartpayOrderId) {
        const paymentResult = await paymentService.processPayment({
          ...paymentData,
          intentKey: intent.intentKey,
          fingerprint: intent.fingerprint,
        });

        if (!paymentResult.success) {
          const code =
            paymentResult.code ??
            (typeof paymentResult.error === "object"
              ? paymentResult.error?.code
              : undefined);

          if (code === "intent_mismatch") {
            // El carrito cambió respecto al intento guardado — nunca se
            // cobró con estos datos. Se regenera la clave y se deja
            // reintentar con el total actualizado.
            clearStoredPaymentIntent();
            setErrorTitle(t("orderChangedTitle"));
            setErrorMessage(t("orderChangedMessage"));
            setCanRetryCharge(true);
            setPaymentStatus(null);
            return;
          }

          if (code === "idempotency_unavailable") {
            // 503 — no hubo cobro, sí es seguro reintentar en unos segundos.
            setErrorTitle(t("retryTitle"));
            setErrorMessage(t("retryShortMessage"));
            setCanRetryCharge(true);
            setPaymentStatus(null);
            return;
          }

          if (code === "payment_in_progress") {
            // Ya hay un cobro con esta clave en curso ahora mismo (mismo
            // intentKey, reintento cruzado) — nunca se vuelve a llamar
            // /payments. Se espera a que resuelva (el video de
            // "processing" no tiene timeout propio, es seguro dejarlo).
            const deadline = Date.now() + POLL_TIMEOUT_MS;
            let resolvedId: string | null = null;
            while (Date.now() < deadline && !resolvedId) {
              const statusRes = await paymentService.getPaymentIntentStatus(
                intent.intentKey,
              );
              if (statusRes.success) {
                if (statusRes.status === "unknown") break;
                if (
                  (statusRes.status === "charged" ||
                    statusRes.status === "confirmed") &&
                  statusRes.ecartpay_order_id
                ) {
                  resolvedId = statusRes.ecartpay_order_id;
                  break;
                }
              }
              await sleep(POLL_INTERVAL_MS);
            }

            if (!resolvedId) {
              setErrorTitle(t("confirmFailedTitle"));
              setErrorMessage(t("confirmFailedMessage"));
              setCanRetryCharge(false);
              setPaymentStatus(null);
              return;
            }
            updateStoredPaymentIntent({ ecartpayOrderId: resolvedId });
            ecartpayOrderId = resolvedId;
          } else if (
            code === "payment_unknown" ||
            code === "charge_unconfirmed"
          ) {
            // Sin certeza de que no se cobró — nunca se ofrece recobrar.
            setErrorTitle(t("confirmFailedTitle"));
            setErrorMessage(t("paymentUnknownMessage"));
            setCanRetryCharge(false);
            setPaymentStatus(null);
            return;
          } else {
            // card_declined / validation_error / etc. — certeza de que NO
            // se cobró, comportamiento existente (video de fallo,
            // reintentable con otra tarjeta).
            console.error("❌ Payment failed:", paymentResult.error);
            throw new Error(
              paymentResult.error?.message || "Payment processing failed",
            );
          }
        } else {
          // Éxito directo o replay de un intento anterior — misma forma de
          // respuesta en ambos casos, no hace falta distinguirlos aquí.
          const payment = paymentResult.data?.payment;
          const order = paymentResult.data?.order;

          // Check if we have a payLink (fallback a verificación de EcartPay)
          // — flujo async/redirect, no pasa por la protección de intentKey
          // (el usuario completa el pago en la página de eCartPay).
          const payLink = order?.payLink || payment?.payLink;
          if (!payLink) {
            ecartpayOrderId = payment?.id ?? order?.id ?? null;
            flexBillBreakdownFromPayment = payment?.flexBillBreakdown ?? null;
            if (ecartpayOrderId) {
              updateStoredPaymentIntent({ ecartpayOrderId });
            }
          } else {
            // payLink: se mantiene el comportamiento anterior tal cual, sin
            // pasar por la lógica de abajo.
            const selectedMethod = paymentMethods.find(
              (pm) => pm.id === selectedPaymentMethodId,
            );

            const pendingPaymentData = {
              orderId: order?.id || payment?.id,
              amount: baseAmount,
              paymentType,
              userName: userName || name,
              tableNumber: state.tableNumber,
              dishOrders: dishOrders,
              tableSummary: state.tableSummary,
              baseAmount,
              tipAmount,
              ivaTip,
              evenCommissionClient,
              ivaEvenClient,
              evenCommissionRestaurant,
              evenRestaurantCharge,
              evenCommissionTotal,
              totalAmountCharged,
              selectedItems:
                paymentType === "select-items" ? selectedItems : [],
              cardLast4: selectedMethod?.lastFourDigits,
              cardBrand: selectedMethod?.cardType,
            };

            if (typeof window !== "undefined") {
              localStorage.setItem(
                "even-pending-payment",
                JSON.stringify(pendingPaymentData),
              );
            }

            setPaymentAttempts((prev) => prev + 1);
            window.location.href = payLink;
            return;
          }
        }
      }

      if (ecartpayOrderId) {
        await handlePaymentSuccess(
          ecartpayOrderId,
          baseAmount,
          paymentType,
          ecartpayOrderId,
          "saved_card",
          flexBillBreakdownFromPayment,
        ); // Usar baseAmount, no totalAmountWithTip

        clearStoredPaymentIntent();
        // Mostrar video de pago exitoso
        setPaymentStatus("success");
        return;
      }

      throw new Error("Formato de respuesta de pago inesperado");
    } catch (error) {
      const rawMessage =
        error instanceof Error ? error.message : "Error desconocido";
      const errorTranslations: Record<string, string> = {
        "Transaction rejected by your bank, please try another card.":
          "Tu banco rechazó la transacción. Por favor intenta con otra tarjeta.",
        "Insufficient funds":
          "Fondos insuficientes. Por favor intenta con otra tarjeta.",
        "Card expired":
          "Tu tarjeta está vencida. Por favor agrega una tarjeta vigente.",
        "Invalid card number": "Número de tarjeta inválido.",
        "An unknown error occurred":
          "Ocurrió un error al procesar el pago. Por favor intenta de nuevo.",
      };
      console.error(
        "❌ Payment error:",
        errorTranslations[rawMessage] ?? rawMessage,
      );
      setPaymentStatus("failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddCard = (): void => {
    const queryParams = new URLSearchParams({
      amount: totalAmountCharged.toString(), // Total cobrado al cliente
      baseAmount: baseAmount.toString(), // Monto base (consumo)
      tipAmount: tipAmount.toString(),
      displaySubtotal: displaySubtotal.toString(),
      displayPropina: displayPropina.toString(),
      ivaTip: ivaTip.toString(),
      evenCommissionClient: evenCommissionClient.toString(),
      ivaEvenClient: ivaEvenClient.toString(),
      evenCommissionRestaurant: evenCommissionRestaurant.toString(),
      evenRestaurantCharge: evenRestaurantCharge.toString(),
      evenCommissionTotal: evenCommissionTotal.toString(),
      type: paymentType,
      scan: "false", // Auto-abrir scanner
      ...(userName && { userName }),
    });

    navigateWithTable(`/add-card?${queryParams.toString()}`);
  };

  const handleDeleteCard = async (paymentMethodId: string) => {
    if (!confirm(tc("confirmDeleteCard"))) {
      return;
    }

    setDeletingCardId(paymentMethodId);
    try {
      await deletePaymentMethod(paymentMethodId);
    } catch (error) {
      setErrorTitle(t("deleteCardErrorTitle"));
      setErrorMessage(t("deleteCardErrorMessage"));
    } finally {
      setDeletingCardId(null);
    }
  };

  // Calcular el total a mostrar según la opción MSI seleccionada
  const getDisplayTotal = () => {
    if (selectedMSI === null) {
      return totalAmountCharged;
    }

    // Obtener el tipo de tarjeta seleccionada
    const selectedMethod = allPaymentMethods.find(
      (pm) => pm.id === selectedPaymentMethodId,
    );
    const cardBrand = selectedMethod?.cardBrand;

    const msiOptions = cardBrand === "amex" ? msiConfig.amex : msiConfig.visaMc;

    const selectedOption = msiOptions.find((opt) => opt.months === selectedMSI);
    if (!selectedOption) return totalAmountCharged;

    // Cálculo EcartPay: markup sobre monto final
    return totalAmountCharged / (1 - (selectedOption.rate / 100) * 1.16);
  };

  const displayTotal = getDisplayTotal();

  const MINIMUM_AMOUNT = 20;
  const isUnderMinimum = totalAmountCharged < MINIMUM_AMOUNT;

  if (isLoadingInitial || isLoadingProvider) {
    return (
      <div className="min-h-dvh brand-evergreen flex flex-col">
        <MenuHeaderBack
          restaurant={restaurantData}
          tableNumber={state.tableNumber}
        />

        <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col">
          {/* Título skeleton */}
          <div className="bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
            <div className="py-6 px-8 flex flex-col justify-center">
              <div className="h-8 w-3/4 bg-white/20 rounded-full mt-2 mb-6 animate-pulse" />
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="bg-white rounded-t-4xl flex-1 flex flex-col px-8 overflow-hidden z-10">
              <div className="flex-1 overflow-y-auto py-8 pb-[120px] flex flex-col gap-4">
                {/* Subtotal row */}
                <div className="flex justify-between items-center">
                  <div className="h-4 w-20 bg-gray-200 rounded-full animate-pulse" />
                  <div className="h-4 w-24 bg-gray-200 rounded-full animate-pulse" />
                </div>
                {/* Total row */}
                <div className="flex justify-between items-center border-t pt-3">
                  <div className="h-5 w-28 bg-gray-200 rounded-full animate-pulse" />
                  <div className="h-5 w-28 bg-gray-200 rounded-full animate-pulse" />
                </div>

                {/* Label métodos de pago */}
                <div className="h-4 w-36 bg-gray-200 rounded-full animate-pulse mt-1" />

                {/* Card skeleton 1 */}
                <div className="h-12 w-full bg-gray-100 rounded-full animate-pulse" />
                {/* Card skeleton 2 */}
                <div className="h-12 w-full bg-gray-100 rounded-full animate-pulse" />

                {/* Botón agregar tarjeta */}
                <div className="h-12 w-full bg-gray-100 rounded-full animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        {/* Barra inferior fija — skeleton */}
        <div
          className="fixed bottom-0 left-0 right-0 bg-white mx-4 px-8 z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex gap-3 mt-6 mb-2 justify-between items-center">
            <div className="flex flex-col gap-1.5">
              <div className="h-3 w-16 bg-gray-200 rounded-full animate-pulse" />
              <div className="h-6 w-28 bg-gray-200 rounded-full animate-pulse" />
            </div>
            <div className="h-12 w-36 bg-gray-200 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // Mostrar error de validación si existe
  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  return (
    <>
      <PaymentStatusVideo
        status={paymentStatus}
        onSuccessComplete={handleSuccessVideoComplete}
        onFailedComplete={handleFailedVideoComplete}
      />

      <div
        className={`min-h-dvh brand-evergreen flex flex-col ${paymentStatus ? "animate-fade-out" : ""}`}
      >
        {/* Header */}
        <MenuHeaderBack
          restaurant={restaurantData}
          tableNumber={state.tableNumber}
        />

        {/* Contenido scrolleable */}
        <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col">
          <div className="bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
            <div className="py-6 px-8 flex flex-col justify-center">
              <h1 className="font-medium text-white text-3xl leading-7 mt-2 mb-6">
                {t("selectPaymentMethodTitle")}
              </h1>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="bg-white rounded-t-4xl flex-1 flex flex-col px-8 overflow-hidden z-50">
              <div className="flex-1 overflow-y-auto py-8 pb-[120px]">
                {/* Payment Summary */}
                <div className="space-y-2 mb-6">
                  {/* Resumen compacto del pedido */}
                  <div className="mb-3 space-y-2">
                    <div className="flex justify-between items-center text-base font-medium text-black">
                      <span>{t("subtotalLabel")}</span>
                      <span>${displaySubtotal.toFixed(2)} MXN</span>
                    </div>
                    {displayPropina > 0 && (
                      <div className="flex justify-between items-center text-base font-medium text-black">
                        <span>{t("tipLabel")}</span>
                        <span>${displayPropina.toFixed(2)} MXN</span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between items-center border-t pt-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-black text-base md:text-lg lg:text-xl">
                        {t("totalToPay")}
                      </span>
                      <CircleAlert
                        className="size-4 cursor-pointer text-gray-500"
                        strokeWidth={2.3}
                        onClick={() => setShowTotalModal(true)}
                      />
                    </div>
                    <div className="text-right">
                      {selectedMSI !== null ? (
                        <>
                          <span className="font-medium text-black text-base md:text-lg lg:text-xl">
                            ${(displayTotal / selectedMSI).toFixed(2)} MXN{" "}
                            {t("monthsSuffix", { months: selectedMSI })}
                          </span>
                        </>
                      ) : (
                        <span className="font-medium text-black text-base md:text-lg lg:text-xl">
                          ${displayTotal.toFixed(2)} MXN
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Payment Options - Solo mostrar si es tarjeta de crédito */}
                  {(() => {
                    const selectedMethod = allPaymentMethods.find(
                      (pm) => pm.id === selectedPaymentMethodId,
                    );
                    return selectedMethod?.cardType === "credit" &&
                      msiConfig.isActive &&
                      totalAmountCharged >= 300 ? (
                      <div
                        className="py-2 cursor-pointer"
                        onClick={() => setShowPaymentOptionsModal(true)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-black text-base md:text-lg lg:text-xl">
                            {t("payInMonths")}
                          </span>
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                              selectedMSI !== null
                                ? "border-even-grass bg-even-grass"
                                : "border-gray-300"
                            }`}
                          >
                            {selectedMSI !== null && (
                              <div className="w-full h-full rounded-full bg-white scale-50"></div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>

                {/* Payment Method Selection - Siempre mostrar (incluye tarjeta del sistema) */}
                <div>
                  {/*
                <h3 className="text-sm font-medium text-black mb-4">
                  Selecciona tu método de pago
                </h3>*/}

                  {/* Payment Method Type Toggle */}
                  {/*
                <div className="flex bg-gray-100 rounded-lg p-1 mb-4">
                  <button
                    onClick={() => setPaymentMethodType("saved")}
                    className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                      paymentMethodType === "saved"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Tarjetas guardadas
                  </button>
                   <button
                    onClick={() => setPaymentMethodType("new")}
                    className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                      paymentMethodType === "new"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Nueva tarjeta
                  </button>
                </div>
                */}

                  {/* Saved Cards List */}
                  <div className="space-y-2.5 mb-2.5">
                    <h3 className="text-black font-medium mb-3">
                      {t("paymentMethodsLabel")}
                    </h3>
                    {allPaymentMethods
                      //.filter((pm) => isDev || pm.id !== "system-default-card")
                      .map((method) => (
                        <div
                          key={method.id}
                          className={`flex items-center py-1.5 px-5 pl-10 border rounded-full transition-colors ${
                            selectedPaymentMethodId === method.id
                              ? "border-even-grass bg-even-grass/10"
                              : "border-black/50  bg-surface"
                          }`}
                        >
                          <div
                            onClick={() => {
                              setSelectedPaymentMethodId(method.id);
                              setSelectedMSI(null);
                            }}
                            className="flex items-center justify-center gap-3 mx-auto cursor-pointer text-base md:text-lg lg:text-xl"
                          >
                            <div>{getCardTypeIcon(method.cardBrand)}</div>
                            <div>
                              <p className="text-black">
                                **** {method.lastFourDigits}
                              </p>
                            </div>
                          </div>

                          <div
                            onClick={() => {
                              setSelectedPaymentMethodId(method.id);
                              setSelectedMSI(null);
                            }}
                            className={`w-4 h-4 rounded-full border-2 cursor-pointer ${
                              selectedPaymentMethodId === method.id
                                ? "border-even-grass bg-even-grass/100"
                                : "border-gray-300"
                            }`}
                          >
                            {selectedPaymentMethodId === method.id && (
                              <div className="w-full h-full rounded-full bg-white scale-50"></div>
                            )}
                          </div>

                          {/* Delete Button - No mostrar para tarjeta del sistema */}
                          {!method.isSystemCard && (
                            <button
                              onClick={() => handleDeleteCard(method.id)}
                              disabled={deletingCardId === method.id}
                              className="pl-2 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 cursor-pointer"
                              title={tc("deleteCardTitle")}
                            >
                              {deletingCardId === method.id ? (
                                <Loader2 className="size-5 animate-spin" />
                              ) : (
                                <Trash2 className="size-5" />
                              )}
                            </button>
                          )}
                        </div>
                      ))}

                    {/* Apple Pay Button */}
                    {!applePayUnavailable &&
                      !isLoadingAgentStatus &&
                      !isPOSBlocked && (
                        <div className="relative w-full h-[48px]">
                          <div id="apple-pay-container" className="w-full" />
                          {!applePayReady && (
                            <div className="absolute inset-0 rounded-full bg-black flex items-center justify-center gap-2">
                              <span
                                className="text-white text-xl leading-none"
                                style={{
                                  fontFamily:
                                    "-apple-system, BlinkMacSystemFont, sans-serif",
                                }}
                                aria-hidden="true"
                              >
                                {""}
                              </span>
                              <span className="text-white font-medium text-base tracking-wide">
                                Pay
                              </span>
                              <Loader2 className="size-4 animate-spin text-white" />
                            </div>
                          )}
                        </div>
                      )}

                    {/* Google Pay Button */}
                    {!googlePayUnavailable &&
                      !isLoadingAgentStatus &&
                      !isPOSBlocked && (
                        <div className="relative w-full h-[48px]">
                          <div id="google-pay-container" className="w-full" />
                          {!googlePayReady && (
                            <div className="absolute inset-0 rounded-full bg-black flex items-center justify-center gap-2">
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 18 18"
                                fill="none"
                                aria-hidden="true"
                              >
                                <path
                                  d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                                  fill="#4285F4"
                                />
                                <path
                                  d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
                                  fill="#34A853"
                                />
                                <path
                                  d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                                  fill="#FBBC05"
                                />
                                <path
                                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                                  fill="#EA4335"
                                />
                              </svg>
                              <span className="text-white font-medium text-base tracking-wide">
                                Pay
                              </span>
                              <Loader2 className="size-4 animate-spin text-white" />
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                </div>

                {/* Botón agregar tarjeta */}
                <div className="mb-2.5">
                  <button
                    onClick={handleAddCard}
                    className="border border-black/50 flex justify-center items-center gap-1 w-full text-black py-3 rounded-full cursor-pointer transition-colors bg-surface hover:bg-gray-100 text-base md:text-lg lg:text-xl"
                  >
                    <Plus className="size-5" />
                    {t("addPaymentMethodCta")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Barra inferior fija — botón pagar */}
        <div
          className={`fixed bottom-0 left-0 right-0 bg-white mx-4 px-8 z-90 py-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] transition-opacity duration-200 ${paymentStatus ? "opacity-0 pointer-events-none" : ""}`}
        >
          <button
            onClick={handlePayment}
            disabled={
              isProcessing || isUnderMinimum || !selectedPaymentMethodId
            }
            className={`py-3 text-white rounded-full cursor-pointer font-normal h-fit w-full flex items-center justify-center text-base active:scale-95 transition-transform ${
              isProcessing || isUnderMinimum || !selectedPaymentMethodId
                ? "bg-even-grass text-even-evergreen opacity-50 cursor-not-allowed px-10"
                : "bg-even-grass text-even-evergreen px-10 animate-pulse-button"
            }`}
          >
            {isProcessing ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>{t("processingPaymentCta")}</span>
              </div>
            ) : isUnderMinimum ? (
              t("minimumAmountCta", { amount: MINIMUM_AMOUNT })
            ) : !selectedPaymentMethodId ? (
              t("selectCardCta")
            ) : (
              t("payCta")
            )}
          </button>
        </div>

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
            <div className="relative bg-white rounded-t-4xl w-full mx-4">
              {/* Titulo */}
              <div className="px-6 pt-4">
                <div className="flex items-center justify-between pb-4 border-b border-stroke">
                  <h3 className="text-lg font-semibold text-black">
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
              <div className="px-6 py-4">
                <p className="text-black mb-4">
                  {t("totalBreakdownIntro")}
                </p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-black font-medium">{t("consumptionLabel")}</span>
                    <span className="text-black font-medium">
                      ${displaySubtotal.toFixed(2)} MXN
                    </span>
                  </div>
                  {displayPropina > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-black font-medium">{t("tipLabelPrefix")}</span>
                      <span className="text-black font-medium">
                        ${displayPropina.toFixed(2)} MXN
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de opciones de pago */}
        {showPaymentOptionsModal && (
          <div
            className="fixed inset-0 flex items-end justify-center backdrop-blur-sm"
            style={{ zIndex: 99999 }}
          >
            {/* Fondo */}
            <div
              className="absolute inset-0 bg-black/20"
              onClick={() => setShowPaymentOptionsModal(false)}
            ></div>

            {/* Modal */}
            <div className="relative bg-white rounded-t-4xl w-full mx-4 max-h-[70vh] overflow-y-auto">
              {/* Titulo */}
              <div className="px-6 pt-4 sticky top-0 bg-white z-10">
                <div className="flex items-center justify-between pb-4 border-b border-stroke">
                  <h3 className="text-lg font-semibold text-black">
                    {t("paymentOptionsTitle")}
                  </h3>
                  <button
                    onClick={() => setShowPaymentOptionsModal(false)}
                    className="p-1 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
                  >
                    <X className="size-5 text-gray-500" />
                  </button>
                </div>
              </div>

              {/* Contenido */}
              <div className="px-6 py-4">
                {(() => {
                  const selectedMethod = allPaymentMethods.find(
                    (pm) => pm.id === selectedPaymentMethodId,
                  );
                  const cardBrand = selectedMethod?.cardBrand;

                  const msiOptions =
                    cardBrand === "amex" ? msiConfig.amex : msiConfig.visaMc;

                  return (
                    <div className="space-y-2.5">
                      {/* Opción: Pago completo */}
                      <div
                        onClick={() => setSelectedMSI(null)}
                        className={`py-2 px-5 border rounded-full cursor-pointer transition-colors ${
                          selectedMSI === null
                            ? "border-even-grass bg-even-grass/10"
                            : "border-black/50 bg-surface hover:border-gray-400"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-black text-base md:text-lg">
                              {t("fullPaymentOption")}
                            </p>
                            <p className="text-xs md:text-sm text-gray-600">
                              ${totalAmountCharged.toFixed(2)} MXN
                            </p>
                          </div>
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                              selectedMSI === null
                                ? "border-even-grass bg-even-grass/100"
                                : "border-gray-300"
                            }`}
                          >
                            {selectedMSI === null && (
                              <div className="w-full h-full rounded-full bg-white scale-50"></div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Separador */}
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-gray-300"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                          <span className="px-2 bg-white text-gray-500">
                            {t("payInMonths")}
                          </span>
                        </div>
                      </div>

                      {/* Opciones MSI */}
                      {(() => {
                        const availableOptions = msiOptions.filter(
                          (option) => totalAmountCharged >= option.minAmount,
                        );
                        const hasUnavailableOptions =
                          availableOptions.length < msiOptions.length;
                        const minAmountNeeded = msiOptions[0]?.minAmount || 0;

                        return (
                          <>
                            {availableOptions.map((option) => {
                              // Cálculo EcartPay: markup sobre monto final
                              const totalWithCommission =
                                totalAmountCharged /
                                (1 - (option.rate / 100) * 1.16);
                              const monthlyPayment =
                                totalWithCommission / option.months;

                              return (
                                <div
                                  key={option.months}
                                  onClick={() => setSelectedMSI(option.months)}
                                  className={`py-2 px-5 border rounded-full cursor-pointer transition-colors ${
                                    selectedMSI === option.months
                                      ? "border-even-grass bg-even-grass/10"
                                      : "border-black/50 bg-surface hover:border-gray-400"
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <p className="font-medium text-black text-base md:text-lg">
                                        ${monthlyPayment.toFixed(2)} MXN{" "}
                                        {t("monthsSuffix", {
                                          months: option.months,
                                        })}
                                      </p>
                                      <p className="text-xs md:text-sm text-gray-600">
                                        {t("msiTotalLabel", {
                                          amount: totalWithCommission.toFixed(2),
                                        })}
                                      </p>
                                    </div>
                                    <div
                                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                        selectedMSI === option.months
                                          ? "border-even-grass bg-even-grass/100"
                                          : "border-gray-300"
                                      }`}
                                    >
                                      {selectedMSI === option.months && (
                                        <div className="w-full h-full rounded-full bg-white scale-50"></div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {hasUnavailableOptions &&
                              totalAmountCharged < minAmountNeeded && (
                                <p className="text-xs md:text-sm text-gray-500 text-center mt-2">
                                  {t("minAmountForInstallments", {
                                    amount: minAmountNeeded.toFixed(2),
                                  })}
                                </p>
                              )}
                          </>
                        );
                      })()}
                    </div>
                  );
                })()}
              </div>

              {/* Footer con botón de confirmar */}
              <div className="px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white">
                <button
                  onClick={() => setShowPaymentOptionsModal(false)}
                  className="w-full bg-even-grass text-even-evergreen py-3 rounded-full cursor-pointer transition-colors text-base"
                >
                  {tc("confirmCta")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal de error de pago */}
      {errorMessage && (
        <div
          className="fixed inset-0 z-[99999] flex items-end justify-center bg-black/50"
          onClick={() => {
            // false cuando ya hay certeza de que se cobró (o no hay
            // certeza de que no se cobró), este botón
            // no debe existir — dispararía un segundo cargo. Solo se
            // ofrece "Intentar de nuevo" cuando hay certeza de que el
            // cobro anterior no se concretó.
            setErrorMessage(null);
            setErrorTitle(t("processingError"));
          }}
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
                  {errorTitle}
                </h2>
              </div>

              <div className="bg-surface border border-stroke-soft/50 rounded-xl p-4 mb-6">
                <p className="text-gray-700 text-sm text-center">
                  {errorMessage}
                </p>
              </div>

              {/* false cuando ya hay certeza de que se cobró (o no hay
                  certeza de que no se cobró), este botón
                  no debe existir — dispararía un segundo cargo. Solo se
                  ofrece "Intentar de nuevo" cuando hay certeza de que el
                  cobro anterior no se concretó. */}
              <button
                onClick={() => {
                  // cerrar el modal no cambia si es seguro
                  // recobrar — eso ya lo decidió el código que lo abrió.
                  setErrorMessage(null);
                  setErrorTitle(t("processingError"));
                }}
                className="w-full bg-even-grass text-even-evergreen py-3 rounded-full text-base"
              >
                {canRetryCharge ? t("tryAgainCta") : tc("understood")}
              </button>
            </div>
          </div>
        </div>
      )}
      <POSBlockedModal
        isOpen={showPOSModal}
        onClose={() => setShowPOSModal(false)}
        reason={posModalReason}
        restaurantName={restaurant?.name}
        restaurantLogo={restaurant?.logo_url}
      />
    </>
  );
}
