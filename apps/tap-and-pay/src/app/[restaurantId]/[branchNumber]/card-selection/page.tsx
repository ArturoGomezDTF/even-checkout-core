"use client";

import { useSearchParams, useParams } from "next/navigation";
import { useTable } from "@/app/context/TableContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { useRestaurant } from "@/app/context/RestaurantContext";
import { usePayment } from "@/app/context/PaymentContext";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { useGuest } from "@/app/context/GuestContext";
import MenuHeader from "@/app/components/headers/MenuHeader";
import OrderAnimation from "@/app/components/UI/OrderAnimation";
import {
  isDefinitiveWalletRejection,
  paymentService,
} from "@/app/services/payment.service";
import { Plus, Trash2, Loader2, CircleAlert, X } from "lucide-react";
import { getCardTypeIcon } from "@/app/utils/cardIcons";
import { useMsiConfig } from "@/app/hooks/useMsiConfig";
import { useModalBackClose } from "@/app/hooks/useModalBackClose";
import {
  ensurePaymentIntent,
  clearStoredPaymentIntent,
  updateStoredPaymentIntent,
} from "@/app/utils/paymentIdempotency";
import { useTranslations } from "next-intl";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 60000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Mismos estados que el backend acepta como pagado en confirmOrder.
const PAID_ECART_STATUSES = ["paid", "completed", "succeeded", "approved"];

export default function CardSelectionPage() {
  const t = useTranslations("CardSelectionPage");
  const tc = useTranslations("Common");
  const { state, setTableNumber, loadTableData } = useTable();
  const { navigateWithTable, tableNumber } = useTableNavigation();
  const searchParams = useSearchParams();
  const params = useParams();
  const { setParams, params: restaurantParams } = useRestaurant();
  const { hasPaymentMethods, paymentMethods, deletePaymentMethod } =
    usePayment();
  const { user, profile, isLoading: authLoading } = useAuth();
  const { guestId, guestName: contextGuestName } = useGuest();
  const { msiConfig } = useMsiConfig();

  // Tarjeta por defecto del sistema — SOLO para pruebas/QA. Si se muestra sin
  // gate, cualquier usuario real puede "pagar" con ella sin que se cobre de
  // verdad. Debe permanecer detrás de NEXT_PUBLIC_SHOW_TEST_CARD, apagado por
  // default en producción.
  const defaultSystemCard = {
    id: "system-default-card",
    lastFourDigits: "1234",
    cardBrand: "amex",
    cardType: "credit",
    isDefault: true,
    isSystemCard: true,
  };

  const showTestCard = process.env.NEXT_PUBLIC_SHOW_TEST_CARD === "true";

  const allPaymentMethods = showTestCard
    ? [defaultSystemCard, ...paymentMethods]
    : paymentMethods;

  const paymentType = searchParams.get("type") || "full-bill";
  const totalAmountCharged = parseFloat(searchParams.get("amount") || "0");
  const baseAmount = parseFloat(searchParams.get("baseAmount") || "0");
  const tipAmount = parseFloat(searchParams.get("tipAmount") || "0");
  const ivaTip = parseFloat(searchParams.get("ivaTip") || "0");
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
  const selectedItemsParam = searchParams.get("selectedItems");

  const evenClientCharge = evenCommissionClient + ivaEvenClient;
  const ivaEvenRestaurant = evenCommissionRestaurant * 0.16;
  const evenRestaurantCharge = evenCommissionRestaurant + ivaEvenRestaurant;
  const subtotalForCommission = baseAmount + tipAmount;
  const evenRateApplied =
    subtotalForCommission > 0
      ? (evenCommissionTotal / subtotalForCommission) * 100
      : 0;

  // Get name from profile or localStorage for guests
  const effectiveName =
    (profile?.firstName && profile?.lastName
      ? `${profile.firstName} ${profile.lastName}`
      : profile?.firstName || "") ||
    (typeof window !== "undefined"
      ? localStorage.getItem("even-guest-name") || ""
      : "");

  const [name, setName] = useState(effectiveName);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<
    string | null
  >(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [showPaymentAnimation, setShowPaymentAnimation] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [showTotalModal, setShowTotalModal] = useState(false);
  const [showPaymentOptionsModal, setShowPaymentOptionsModal] = useState(false);
  const [selectedMSI, setSelectedMSI] = useState<number | null>(null);
  const [pendingPaymentData, setPendingPaymentData] = useState<{
    paymentId: string;
    amount: number;
    paymentType: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState<string>(
    t("processingErrorTitle"),
  );
  // false cuando ya hay certeza de que se cobró (o no hay
  // certeza de lo contrario) — el modal de error no debe ofrecer un botón
  // que dispare un segundo cobro.
  const [canRetryCharge, setCanRetryCharge] = useState(true);
  // Pantalla "Verificando tu pago…" — sustituye al mensaje de timeout de
  // OrderAnimation. La confirmación real sigue corriendo en segundo plano
  // (la misma llamada a handleConfirmPayment, que no se cancela); esta
  // pantalla solo refleja que seguimos esperando su resultado.
  const [verifying, setVerifying] = useState(false);
  const [hasCheckedOrder, setHasCheckedOrder] = useState(false);
  // Señal de confirmación real para OrderAnimation: null mientras el cargo
  // todavía no se confirma de verdad contra el backend en
  // handleConfirmPayment. A diferencia de pendingPaymentData (que se llena
  // ANTES de que se dispare el cobro real, al mostrar la animación), este
  // estado solo se llena DESPUÉS de que el pago quedó confirmado — así la
  // pantalla de éxito espera a la confirmación real en vez de un timer fijo.
  const [confirmedPaymentId, setConfirmedPaymentId] = useState<string | null>(
    null,
  );

  // Apple Pay
  const [applePayReady, setApplePayReady] = useState(false);
  const [applePayUnavailable, setApplePayUnavailable] = useState(false);
  // La orden de wallet fue rechazada de forma definitiva: se ocultan Apple y
  // Google Pay y se pide pagar con tarjeta guardada.
  const [walletOrderRejected, setWalletOrderRejected] = useState(false);
  const [isApplePayProcessing, setIsApplePayProcessing] = useState(false);
  const [applePayPaymentId, setApplePayPaymentId] = useState<string | null>(
    null,
  );
  const applePayListenersRef = useRef(false);
  // Refleja applePayReady sin closures obsoletos dentro de los listeners del
  // SDK (se registran una sola vez con `.on(...)`).
  const applePayReadyRef = useRef(false);

  // Google Pay
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
  const googlePayListenersRef = useRef(false);
  // Refleja googlePayReady sin closures obsoletos dentro de los listeners
  // del SDK (se registran una sola vez con `.on(...)`).
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
    const newName =
      (profile?.firstName && profile?.lastName
        ? `${profile.firstName} ${profile.lastName}`
        : profile?.firstName || "") || "";
    if (newName && newName !== name) {
      setName(newName);
    }

    if (paymentType === "select-items" && selectedItemsParam) {
      setSelectedItems(
        selectedItemsParam.split(",").filter((item) => item.trim() !== ""),
      );
    }
  }, [profile, paymentType, selectedItemsParam]);

  // Cargar datos de la mesa
  useEffect(() => {
    const loadData = async () => {
      if (!tableNumber) {
        return;
      }

      if (!restaurantParams?.restaurantId || !restaurantParams?.branchNumber) {
        return;
      }

      if (!state.order) {
        await loadTableData();
      } else if (state.order?.order_id) {
        if (!state.order.items || state.order.items.length === 0) {
          await loadTableData();
        }
      }
      setHasCheckedOrder(true);
    };
    loadData();
  }, [tableNumber, state.order, restaurantParams]);

  const dishes = state.order?.items || [];
  const unpaidDishes = dishes.filter(
    (dish) => dish.payment_status === "not_paid" || !dish.payment_status,
  );

  // Red de seguridad: si al terminar de revisar la orden no queda nada
  // pendiente por pagar, o el monto a cobrar es inválido (link viejo /
  // navegación stale con amount=0), no hay nada que hacer en esta
  // pantalla. No aplica mientras se muestra la animación de pago, ya que
  // ahí la orden se refresca a propósito justo antes de navegar a
  // payment-success (los platillos recién pagados harían este chequeo
  // "vacío" en pleno vuelo hacia esa pantalla).
  useEffect(() => {
    if (!hasCheckedOrder || showPaymentAnimation) return;
    if (unpaidDishes.length === 0 || totalAmountCharged <= 0) {
      navigateWithTable("/order", true);
    }
  }, [
    hasCheckedOrder,
    showPaymentAnimation,
    unpaidDishes.length,
    totalAmountCharged,
    navigateWithTable,
  ]);

  useEffect(() => {
    if (!selectedPaymentMethodId && allPaymentMethods.length > 0) {
      const defaultMethod =
        allPaymentMethods.find((pm) => pm.isDefault) || allPaymentMethods[0];
      setSelectedPaymentMethodId(defaultMethod.id);
    }
    setIsLoadingInitial(false);
  }, [allPaymentMethods.length]);

  // Cargar SDK de Apple Pay
  useEffect(() => {
    const ApplePaySession = (window as any).ApplePaySession;
    if (!ApplePaySession || !ApplePaySession.canMakePayments?.()) {
      setApplePayUnavailable(true);
      return;
    }
    const src = "https://pay.ecart.com/sdk/pay.js";
    if (!document.querySelector(`script[src="${src}"]`)) {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  // Cargar SDK de Google Pay
  useEffect(() => {
    if (googlePayUnavailable) return;
    const src = "https://pay.ecart.com/sdk/pay.js";
    if (!document.querySelector(`script[src="${src}"]`)) {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    }
  }, [googlePayUnavailable]);

  const getApplePaySDK = () =>
    new Promise<any>((resolve) => {
      if ((window as any).Pay?.ApplePay)
        return resolve((window as any).Pay.ApplePay);
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
      if ((window as any).Pay?.GooglePay)
        return resolve((window as any).Pay.GooglePay);
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

  // Inicializar Apple Pay SDK
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
        const orderResult = await paymentService.createApplePayOrder({
          amount: totalAmountCharged,
          currency: "MXN",
          restaurantId: restaurantParams?.restaurantId as string,
          baseAmount,
          tipAmount,
          // even-backend #333: identificadores para que el servidor recalcule
          // el monto contra tap_pay_orders en vez de cobrar el que mandamos.
          // Son opcionales en el backend: si no los mandamos, cobra igual que
          // antes. Ver docs/03-mapa-montos-server-side.md en even-backend.
          id_tap_pay_order: state.order?.order_id,
          payment_type: paymentType,
          selected_item_ids: paymentType === "select-items" ? selectedItems : undefined,
        });

        const appleOrderId =
          (orderResult as any).orderId ?? orderResult.data?.orderId;
        if (!orderResult.success || !appleOrderId) {
          // Un 4xx con código semántico es un rechazo definitivo (400
          // baseAmount <= 0, 422 payment_rejected, ...): reintentar con los
          // mismos datos fallaría igual, así que se cae a tarjeta guardada. Un
          // 5xx pasajero no oculta la wallet.
          if (isDefinitiveWalletRejection(orderResult)) {
            setApplePayUnavailable(true);
            setWalletOrderRejected(true);
          }
          applePayListenersRef.current = false;
          return;
        }

        const sdkAlreadyLoaded = !!(window as any).Pay?.ApplePay;
        const applePaySDK = await getApplePaySDK();
        if (!applePaySDK) {
          setApplePayUnavailable(true);
          applePayListenersRef.current = false;
          return;
        }

        applePaySDK.on("ready", () =>
          setTimeout(() => {
            applePayReadyRef.current = true;
            setApplePayReady(true);
          }, 2800),
        );
        applePaySDK.on("unavailable", () => setApplePayUnavailable(true));
        applePaySDK.on("cancel", () => setIsApplePayProcessing(false));
        applePaySDK.on("error", () => {
          // Este evento también dispara en la inicialización del SDK (no
          // solo en un intento real de pago), así que no siempre implica que
          // Apple Pay dejó de estar disponible. Si el botón ya se había
          // mostrado (init exitoso), esto es un error de un intento de pago
          // real —p.ej. tarjeta rechazada por fondos insuficientes— y el
          // usuario debe poder reintentar, así que no lo ocultamos. Solo lo
          // ocultamos si el error ocurre antes de que el botón llegara a
          // estar listo.
          setIsApplePayProcessing(false);
          if (!applePayReadyRef.current) {
            setApplePayUnavailable(true);
          }
        });
        applePaySDK.on("success", (event: any) => {
          const walletPaymentId = event?.detail?.id || appleOrderId;
          setApplePayPaymentId(walletPaymentId);
          setIsApplePayProcessing(true);
          setConfirmedPaymentId(null);
          setPendingPaymentData({
            paymentId: walletPaymentId,
            amount: totalAmountCharged,
            paymentType,
          });
          setShowPaymentAnimation(true);
        });

        applePaySDK.render({
          container: "#apple-pay-container",
          orderId: appleOrderId,
          amount: totalAmountCharged,
          currency: "MXN",
          countryCode: "MX",
          label: "Even",
          buttonStyle: "black",
          buttonType: "pay",
          borderRadius: "8px",
          supportedNetworks: ["visa", "masterCard", "amex"],
        });

        if (sdkAlreadyLoaded)
          setTimeout(() => {
            applePayReadyRef.current = true;
            setApplePayReady(true);
          }, 2800);
      } catch {
        applePayListenersRef.current = false;
      }
    })();
  }, [isLoadingInitial, totalAmountCharged]);

  // Inicializar Google Pay SDK
  useEffect(() => {
    if (
      isLoadingInitial ||
      totalAmountCharged <= 0 ||
      typeof window === "undefined"
    )
      return;
    if (googlePayUnavailable) return;
    if (googlePayListenersRef.current) return;
    googlePayListenersRef.current = true;

    (async () => {
      try {
        const orderResult = await paymentService.createGooglePayOrder({
          amount: totalAmountCharged,
          currency: "MXN",
          restaurantId: restaurantParams?.restaurantId as string,
          baseAmount,
          tipAmount,
          // even-backend #333: identificadores para que el servidor recalcule
          // el monto contra tap_pay_orders en vez de cobrar el que mandamos.
          // Son opcionales en el backend: si no los mandamos, cobra igual que
          // antes. Ver docs/03-mapa-montos-server-side.md en even-backend.
          id_tap_pay_order: state.order?.order_id,
          payment_type: paymentType,
          selected_item_ids: paymentType === "select-items" ? selectedItems : undefined,
        });

        const googleOrderId =
          (orderResult as any).orderId ?? orderResult.data?.orderId;
        if (!orderResult.success || !googleOrderId) {
          // Un 4xx con código semántico es un rechazo definitivo (400
          // baseAmount <= 0, 422 payment_rejected, ...): reintentar con los
          // mismos datos fallaría igual, así que se cae a tarjeta guardada. Un
          // 5xx pasajero no oculta la wallet.
          if (isDefinitiveWalletRejection(orderResult)) {
            setGooglePayUnavailable(true);
            setWalletOrderRejected(true);
          }
          googlePayListenersRef.current = false;
          return;
        }

        const sdkAlreadyLoaded = !!(window as any).Pay?.GooglePay;
        const googlePaySDK = await getGooglePaySDK();
        if (!googlePaySDK) {
          setGooglePayUnavailable(true);
          googlePayListenersRef.current = false;
          return;
        }

        googlePaySDK.on("ready", () =>
          setTimeout(() => {
            googlePayReadyRef.current = true;
            setGooglePayReady(true);
          }, 2800),
        );
        googlePaySDK.on("unavailable", () => setGooglePayUnavailable(true));
        googlePaySDK.on("cancel", () => setIsGooglePayProcessing(false));
        googlePaySDK.on("error", () => {
          // Este evento también dispara en la inicialización del SDK (no
          // solo en un intento real de pago), así que no siempre implica que
          // Google Pay dejó de estar disponible. Si el botón ya se había
          // mostrado (init exitoso), esto es un error de un intento de pago
          // real —p.ej. tarjeta rechazada por fondos insuficientes— y el
          // usuario debe poder reintentar, así que no lo ocultamos. Solo lo
          // ocultamos si el error ocurre antes de que el botón llegara a
          // estar listo.
          setIsGooglePayProcessing(false);
          if (!googlePayReadyRef.current) {
            setGooglePayUnavailable(true);
          }
        });
        const handleGooglePaySuccess = (walletPaymentId: string) => {
          if (googlePaySucceededRef.current) return;
          googlePaySucceededRef.current = true;
          stopGooglePay3dsWatch();
          setGooglePayPaymentId(walletPaymentId);
          setIsGooglePayProcessing(true);
          setConfirmedPaymentId(null);
          setPendingPaymentData({
            paymentId: walletPaymentId,
            amount: totalAmountCharged,
            paymentType,
          });
          setShowPaymentAnimation(true);
        };

        googlePaySDK.on("success", (event: any) =>
          handleGooglePaySuccess(event?.detail?.activity_id || googleOrderId),
        );

        // El SDK abre cualquier redirect_url de process-payment en un overlay
        // y solo emite "success" si el iframe manda postMessage; la página de
        // recibo de EcartPay no lo manda, así que confirmamos por polling.
        const isOrderPaid = async () => {
          const status = await paymentService.getEcartOrderStatus(
            googleOrderId,
          );
          return !!status && PAID_ECART_STATUSES.includes(status);
        };
        const finishFromOverlay = () => {
          document.getElementById("ecartpay-3ds-overlay")?.remove();
          handleGooglePaySuccess(googleOrderId);
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

        if (sdkAlreadyLoaded)
          setTimeout(() => {
            googlePayReadyRef.current = true;
            setGooglePayReady(true);
          }, 2800);
      } catch {
        googlePayListenersRef.current = false;
      }
    })();
  }, [isLoadingInitial, totalAmountCharged, googlePayUnavailable]);

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

    // Encontrar la opción seleccionada
    const selectedOption = msiOptions.find((opt) => opt.months === selectedMSI);
    if (!selectedOption) return totalAmountCharged;

    return totalAmountCharged / (1 - (selectedOption.rate / 100) * 1.16);
  };

  const displayTotal = getDisplayTotal();

  // Esta función se ejecuta DESPUÉS de que expira el período de cancelación (4 segundos)
  // Es cuando realmente se procesa el pago en el servidor
  const handleConfirmPayment = async () => {
    if (!pendingPaymentData) {
      return;
    }

    const { paymentId, amount, paymentType } = pendingPaymentData;

    // Declarado ANTES del try para que el catch siempre
    // pueda leerlo sin riesgo de "temporal dead zone" si algo revienta
    // antes de que la variable de más abajo se inicialice.
    let chargeSucceeded = false;

    try {
      const realPaymentMethodId =
        isApplePayProcessing || isGooglePayProcessing
          ? null
          : selectedPaymentMethodId === "system-default-card"
            ? null
            : selectedPaymentMethodId;

      // Obtener guest_id del contexto o de localStorage
      let currentGuestId = guestId;
      if (!currentGuestId && !user?.id) {
        currentGuestId = localStorage.getItem("even-guest-id");
      }

      // guest_name debe contener el nombre visible, sea invitado o usuario registrado
      const displayName = user?.id
        ? `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim() ||
          "Usuario"
        : (contextGuestName || name).trim() || "Invitado";

      // Cobrar la tarjeta real en EcartPay antes de marcar platillos/orden como
      // pagados — antes esto nunca se hacía y el pago solo se registraba en BD
      // sin mover dinero de verdad.
      const isRealCardPayment =
        !isApplePayProcessing &&
        !isGooglePayProcessing &&
        selectedPaymentMethodId !== "system-default-card";

      let chargeEcartpayOrderId: string | null = null;
      // Una vez que esta llamada confirma que sí se cobró,
      // ningún error posterior (registrar el pago del platillo/split/mesa)
      // puede tratarse como "reintentable" — la tarjeta ya se cargó, así
      // que el catch de abajo no debe ofrecer recobrar.
      chargeSucceeded = !isRealCardPayment;

      if (isRealCardPayment) {
        const selectedMethod = allPaymentMethods.find(
          (pm) => pm.id === selectedPaymentMethodId,
        );
        if (!selectedMethod) {
          throw new Error(t("errorCardNotFound"));
        }

        // Después de un 2xx de /payments, esta app
        // NUNCA vuelve a llamar /payments con otra clave para el mismo
        // carrito. La clave y el fingerprint solo se regeneran si el
        // carrito (monto/propina) cambió.
        const intent = await ensurePaymentIntent({
          items: [],
          tipAmount,
          discountId: null,
          total: totalAmountCharged,
        });

        chargeEcartpayOrderId = intent.ecartpayOrderId;

        if (!chargeEcartpayOrderId) {
          const chargeResult = await paymentService.processPayment({
            paymentMethodId: selectedMethod.id,
            amount: totalAmountCharged,
            currency: "MXN",
            description: `Even Tap & Pay - Mesa ${tableNumber || "N/A"}`,
            orderId: state.order?.order_id || `order-${Date.now()}`,
            tableNumber: tableNumber || undefined,
            restaurantId: restaurantParams?.restaurantId as string,
            installments: selectedMSI || undefined,
            baseAmount,
            tipAmount,
            // even-backend #333: identificadores para que el servidor
            // recalcule el monto contra tap_pay_orders en vez de cobrar el
            // que mandamos. Son opcionales en el backend: si no los
            // mandamos, cobra igual que antes.
            id_tap_pay_order: state.order?.order_id,
            payment_type: paymentType,
            selected_item_ids:
              paymentType === "select-items" ? selectedItems : undefined,
            intentKey: intent.intentKey,
            fingerprint: intent.fingerprint,
          });

          if (!chargeResult.success) {
            const code =
              chargeResult.code ??
              (typeof chargeResult.error === "object"
                ? chargeResult.error?.code
                : undefined);

            if (code === "intent_mismatch") {
              clearStoredPaymentIntent();
              setShowPaymentAnimation(false);
              setCanRetryCharge(true);
              setErrorTitle(t("orderChangedTitle"));
              setErrorMessage(t("orderChangedMessage"));
              return;
            }

            if (code === "idempotency_unavailable") {
              setShowPaymentAnimation(false);
              setCanRetryCharge(true);
              setErrorTitle(t("retryTitle"));
              setErrorMessage(t("retryShortMessage"));
              return;
            }

            if (code === "payment_in_progress") {
              setShowPaymentAnimation(false);
              setVerifying(true);
              const deadline = Date.now() + POLL_TIMEOUT_MS;
              let resolvedId: string | null = null;
              while (Date.now() < deadline && !resolvedId) {
                const statusRes =
                  await paymentService.getPaymentIntentStatus(
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
                setVerifying(false);
                setCanRetryCharge(false);
                setErrorTitle(t("confirmFailedTitle"));
                setErrorMessage(t("confirmFailedMessageAfterTimeout"));
                return;
              }
              updateStoredPaymentIntent({ ecartpayOrderId: resolvedId });
              chargeEcartpayOrderId = resolvedId;
            } else if (code === "payment_rejected") {
              // Rechazo definitivo (422): no se cobró y repetir con la misma
              // tarjeta fallaría igual. Se descarta el intento guardado para
              // que otra tarjeta no reciba el replay del rechazo.
              clearStoredPaymentIntent();
              setShowPaymentAnimation(false);
              // Sin esto el botón se queda en "Procesando..." y no se puede
              // reintentar con otra tarjeta.
              setIsProcessing(false);
              setPendingPaymentData(null);
              setConfirmedPaymentId(null);
              setCanRetryCharge(true);
              setErrorTitle(t("paymentRejectedTitle"));
              setErrorMessage(
                chargeResult.error?.message || t("paymentRejectedMessage"),
              );
              return;
            } else if (
              code === "payment_unknown" ||
              code === "charge_unconfirmed"
            ) {
              setShowPaymentAnimation(false);
              setVerifying(false);
              setCanRetryCharge(false);
              setErrorTitle(t("confirmFailedTitle"));
              setErrorMessage(t("confirmFailedMessageUnknown"));
              return;
            } else {
              throw new Error(
                chargeResult.error?.message ||
                  t("errorCardChargeFailed"),
              );
            }
          } else {
            const chargedPayment = (chargeResult as any).payment;
            const chargedOrder = (chargeResult as any).order;
            chargeEcartpayOrderId =
              chargedPayment?.id || chargedOrder?.id || null;
          }
        }

        if (!chargeEcartpayOrderId) {
          throw new Error(t("errorProviderNotConfirmed"));
        }
        updateStoredPaymentIntent({ ecartpayOrderId: chargeEcartpayOrderId });
        chargeSucceeded = true;
      }

      // Ejecutar el pago según el tipo (incluyendo tarjeta del sistema). A
      // partir de acá el cargo ya se concretó (chargeSucceeded=true) — un
      // error de aquí en adelante no puede tratarse como "no se cobró".
      if (paymentType === "select-items") {
        await paymentService.paySelectedDishes({
          dishIds: selectedItems,
          paymentMethodId: realPaymentMethodId,
          userId: user?.id,
          guestId: !user?.id ? currentGuestId : null,
          guestName: displayName,
        });
      } else if (paymentType === "equal-shares") {
        await paymentService.paySplitAmount({
          orderId: state.order?.order_id!,
          amount: baseAmount,
          tipAmount: tipAmount,
          userId: user?.id,
          guestId: !user?.id ? currentGuestId : null,
          guestName: displayName,
          paymentMethodId: realPaymentMethodId,
          paymentSource: isApplePayProcessing
            ? "apple_pay"
            : isGooglePayProcessing
              ? "google_pay"
              : null,
        });
      } else if (
        paymentType === "full-bill" ||
        paymentType === "choose-amount"
      ) {
        // Asegurarse de que tenemos todos los parámetros requeridos
        if (!baseAmount || baseAmount <= 0) {
          console.error("❌ baseAmount inválido:", baseAmount);
          throw new Error(t("errorInvalidPaymentAmount"));
        }

        await paymentService.payOrderAmount({
          orderId: state.order?.order_id!,
          amount: baseAmount,
          tipAmount: tipAmount,
          userId: user?.id,
          guestId: !user?.id ? currentGuestId : null,
          guestName: displayName,
          paymentMethodId: realPaymentMethodId,
          paymentSource: isApplePayProcessing
            ? "apple_pay"
            : isGooglePayProcessing
              ? "google_pay"
              : null,
        });
      }

      // El pago quedó aplicado de verdad — recién aquí se limpia la clave de
      // idempotencia (solo se limpia cuando todo terminó, nunca antes).
      clearStoredPaymentIntent();

      // Guardar datos del pago para payment-success
      const selectedMethod = allPaymentMethods.find(
        (pm) => pm.id === selectedPaymentMethodId,
      );

      const paymentData = {
        paymentId: paymentId,
        transactionId: paymentId,
        amount: amount,
        totalAmountCharged: selectedMSI ? displayTotal : totalAmountCharged,
        installments: selectedMSI || null,
        installmentBaseAmount: selectedMSI ? totalAmountCharged : null,
        baseAmount: baseAmount,
        tipAmount: tipAmount,
        ivaTip: ivaTip,
        evenCommissionClient: evenCommissionClient,
        evenCommissionRestaurant: evenCommissionRestaurant,
        ivaEvenClient: ivaEvenClient,
        ivaEvenRestaurant: ivaEvenRestaurant,
        paymentType: paymentType,
        userName: profile?.firstName || name,
        cardLast4: isApplePayProcessing
          ? "AP"
          : isGooglePayProcessing
            ? "GP"
            : selectedMethod?.lastFourDigits,
        cardBrand: isApplePayProcessing
          ? "apple"
          : isGooglePayProcessing
            ? "google"
            : selectedMethod?.cardBrand,
        items:
          paymentType === "select-items"
            ? unpaidDishes.filter((d) => selectedItems.includes(d.id))
            : unpaidDishes,
        selectedItems:
          paymentType === "select-items" ? selectedItems : undefined,
      };

      // Guardar en localStorage
      localStorage.setItem(
        "even-completed-payment",
        JSON.stringify(paymentData),
      );

      // El cargo real (o el registro del pago con la tarjeta del sistema) ya
      // se confirmó contra el backend en este punto — recién ahora es seguro
      // dejar que OrderAnimation avance a la pantalla de éxito.
      setConfirmedPaymentId(paymentId);

      // Operaciones en segundo plano
      const backgroundOperations = async () => {
        try {
          await loadTableData();

          const transactionPaymentMethodId =
            selectedPaymentMethodId === "system-default-card"
              ? null
              : selectedPaymentMethodId;

          await paymentService.recordPaymentTransaction({
            payment_method_id: transactionPaymentMethodId,
            restaurant_id: parseInt(restaurantParams?.restaurantId!),
            id_tap_pay_order: state.order?.order_id || null,
            ecartpay_order_id: isApplePayProcessing
              ? applePayPaymentId
              : isGooglePayProcessing
                ? googlePayPaymentId
                : chargeEcartpayOrderId,
            base_amount: baseAmount,
            tip_amount: tipAmount,
            iva_tip: ivaTip,
            even_commission_total: evenCommissionTotal,
            even_commission_client: evenCommissionClient,
            even_commission_restaurant: evenCommissionRestaurant,
            iva_even_client: ivaEvenClient,
            iva_even_restaurant: ivaEvenRestaurant,
            even_client_charge: evenClientCharge,
            even_restaurant_charge: evenRestaurantCharge,
            even_rate_applied: evenRateApplied,
            total_amount_charged: selectedMSI
              ? displayTotal
              : totalAmountCharged,
            subtotal_for_commission: subtotalForCommission,
            currency: "MXN",
            transaction_by: displayName,
            payment_source: isApplePayProcessing
              ? "apple_pay"
              : isGooglePayProcessing
                ? "google_pay"
                : isRealCardPayment
                  ? "saved_card"
                  : null,
          });
        } catch (transactionError) {
          console.error("❌ Error in background operations:", transactionError);
        }
      };

      backgroundOperations();
    } catch (error) {
      const rawMessage =
        error instanceof Error ? error.message : t("errorUnknown");
      const errorTranslations: Record<string, string> = {
        "Transaction rejected by your bank, please try another card.":
          t("errors.bankRejected"),
        "Insufficient funds": t("errors.insufficientFunds"),
        "Card expired": t("errors.cardExpired"),
        "Invalid card number": t("errors.invalidCardNumber"),
        "An unknown error occurred": t("errors.unknownPaymentError"),
      };
      setShowPaymentAnimation(false);
      setVerifying(false);
      setIsProcessing(false);
      setIsAnimatingOut(false);
      setPendingPaymentData(null);
      setConfirmedPaymentId(null);
      setIsApplePayProcessing(false);
      setIsGooglePayProcessing(false);
      // Si el cargo ya se había concretado (chargeSucceeded,
      // definido más arriba) y lo que falló fue el registro del pago del
      // platillo/split/mesa, no hay certeza de que un reintento no vuelva a
      // cobrar la tarjeta — no se ofrece recobrar.
      if (chargeSucceeded) {
        setCanRetryCharge(false);
        setErrorTitle(t("confirmFailedTitle"));
        setErrorMessage(t("confirmFailedMessageChargedNotRecorded"));
      } else {
        setCanRetryCharge(true);
        setErrorMessage(errorTranslations[rawMessage] ?? rawMessage);
      }
    }
  };

  const handlePayment = async () => {
    if (isProcessing) return;

    if (!selectedPaymentMethodId) {
      setErrorMessage(t("errorSelectPaymentMethod"));
      return;
    }

    setIsProcessing(true);
    // Nuevo intento de pago: limpiar cualquier señal de confirmación de un
    // intento anterior para que OrderAnimation vuelva a esperar la
    // confirmación real de este pago.
    setConfirmedPaymentId(null);

    try {
      // Se usa el order_id real como paymentId: es lo que recordPaymentTransaction
      // guarda en id_tap_pay_order, y es lo que payment-success usa para
      // buscar la factura (invoiceController hace fallback por esa columna).
      // Un id inventado no matchea nada en payment_transactions.
      const realPaymentId =
        state.order?.order_id || `system-payment-${Date.now()}`;

      // Si se seleccionó la tarjeta del sistema, procesar pago directamente
      // (solo alcanzable si NEXT_PUBLIC_SHOW_TEST_CARD está activo; con el
      // flag apagado, "system-default-card" nunca aparece en
      // allPaymentMethods así que selectedPaymentMethodId no puede tomar
      // ese valor, pero se agrega el chequeo explícito como defensa extra).
      if (showTestCard && selectedPaymentMethodId === "system-default-card") {
        setPendingPaymentData({
          paymentId: realPaymentId,
          amount: totalAmountCharged,
          paymentType,
        });

        setShowPaymentAnimation(true);
        return;
      }

      // Para tarjetas reales de usuario
      setPendingPaymentData({
        paymentId: realPaymentId,
        amount: totalAmountCharged,
        paymentType,
      });

      setShowPaymentAnimation(true);
    } catch (error) {
      setIsProcessing(false);
      setErrorMessage(t("errorGenericProcessing"));
    }
  };

  // Red de seguridad de OrderAnimation: el pago nunca llegó a confirmarse
  // dentro del tiempo de espera VISUAL. La llamada real a
  // handleConfirmPayment sigue corriendo en segundo plano (no se cancela) —
  // por eso NO se resetean pendingPaymentData/confirmedPaymentId/los flags
  // de Apple-Google Pay acá: esa llamada todavía los necesita y va a
  // terminar de resolver el pago (éxito → navega; error → modal). Esta
  // pantalla solo refleja que seguimos esperando, nunca ofrece recobrar.
  const handleConfirmTimeout = () => {
    setShowPaymentAnimation(false);
    setVerifying(true);
  };

  // Una vez que el pago queda confirmado, `confirmedPaymentId` se entera sin
  // importar si la pantalla activa era OrderAnimation o "Verificando tu
  // pago…" — si es esta última, navega directo (OrderAnimation ya no está
  // montado para hacerlo por su cuenta).
  useEffect(() => {
    if (!verifying || !confirmedPaymentId) return;
    setVerifying(false);
    navigateWithTable(
      `/payment-success?paymentId=${pendingPaymentData?.paymentId || confirmedPaymentId}&amount=${totalAmountCharged}`,
      true,
    );
  }, [verifying, confirmedPaymentId, pendingPaymentData, totalAmountCharged, navigateWithTable]);

  useEffect(() => {
    if (errorMessage) setVerifying(false);
  }, [errorMessage]);

  const handleAddCard = (): void => {
    const queryParams = new URLSearchParams({
      amount: totalAmountCharged.toString(),
      baseAmount: baseAmount.toString(),
      tipAmount: tipAmount.toString(),
      ivaTip: ivaTip.toString(),
      evenCommissionClient: evenCommissionClient.toString(),
      ivaEvenClient: ivaEvenClient.toString(),
      evenCommissionRestaurant: evenCommissionRestaurant.toString(),
      evenCommissionTotal: evenCommissionTotal.toString(),
      type: paymentType,
    });

    navigateWithTable(`/add-card?${queryParams.toString()}`);
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!confirm(t("confirmDeleteCardMessage"))) {
      return;
    }

    setDeletingCardId(cardId);
    try {
      await deletePaymentMethod(cardId);
      if (selectedPaymentMethodId === cardId) {
        setSelectedPaymentMethodId(null);
      }
    } catch (error) {
      setErrorTitle(t("deleteCardErrorTitle"));
      setErrorMessage(t("deleteCardErrorMessage"));
    } finally {
      setDeletingCardId(null);
    }
  };

  // El back gesto/botón del dispositivo cierra estos modales en vez de
  // salir de la página.
  useModalBackClose(showTotalModal, () => setShowTotalModal(false));
  useModalBackClose(showPaymentOptionsModal, () =>
    setShowPaymentOptionsModal(false),
  );
  useModalBackClose(!!errorMessage, () => {
    setErrorMessage(null);
    setErrorTitle(t("processingErrorTitle"));
  });

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

  if (isLoadingInitial || authLoading) {
    return (
      <div className="min-h-dvh bg-even-evergreen flex flex-col">
        <div
          className="fixed top-0 left-0 right-0 z-50"
          style={{ zIndex: 999 }}
        >
          <MenuHeader />
        </div>
        <div className="h-20"></div>
        <div className="w-full flex-1 flex items-center justify-center">
          <Loader2 className="size-10 text-white animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* OrderAnimation se renderiza encima del contenido */}
      {showPaymentAnimation && (
        <OrderAnimation
          userName={profile?.firstName || name}
          orderedItems={
            paymentType === "select-items"
              ? unpaidDishes.filter((d) => selectedItems.includes(d.id))
              : unpaidDishes
          }
          orderId={confirmedPaymentId}
          onContinue={() => {
            navigateWithTable(
              `/payment-success?paymentId=${pendingPaymentData?.paymentId || Date.now()}&amount=${totalAmountCharged}`,
              true,
            );
          }}
          onCancel={() => {
            setShowPaymentAnimation(false);
            setIsProcessing(false);
            setIsAnimatingOut(false);
            setPendingPaymentData(null);
            setConfirmedPaymentId(null);
          }}
          onConfirm={handleConfirmPayment}
          onTimeout={handleConfirmTimeout}
        />
      )}

      {/* Sustituye al timeout muerto de OrderAnimation — la
          confirmación real sigue corriendo en segundo plano (la promesa de
          handleConfirmPayment no se cancela), esta pantalla solo comunica
          que seguimos esperando. Sin botón de cancelar ni de reintentar: un
          cobro ya pudo haberse concretado. */}
      {verifying && (
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center px-8 text-center gap-6">
          <Loader2 className="size-12 text-even-evergreen animate-spin" />
          <div>
            <h2 className="text-xl font-medium text-black mb-2">
              {t("verifyingPaymentTitle")}
            </h2>
            <p className="text-sm text-gray-500 max-w-xs">
              {t("verifyingPaymentMessage")}
            </p>
          </div>
        </div>
      )}

      <div className="min-h-dvh bg-even-evergreen flex flex-col">
        {/* Header */}
        <div className={isAnimatingOut ? "animate-fade-out" : ""}>
          <MenuHeader />
        </div>

        {/* Contenido scrolleable */}
        <div
          className={`px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col ${isAnimatingOut ? "animate-slide-down" : ""}`}
        >
          <div className="bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
            <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
              <h1 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight mt-2 md:mt-3 mb-6 md:mb-8">
                {t("selectPaymentMethodTitle")}
              </h1>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="bg-white rounded-t-4xl flex-1 flex flex-col px-6 md:px-8 lg:px-10 overflow-hidden z-10">
              <div className="flex-1 overflow-y-auto py-8 pb-30">
                {/* Payment Summary */}
                <div className="mb-3 space-y-2">
                  <div className="flex justify-between items-center text-base font-medium text-black">
                    <span>{tc("subtotal")}</span>
                    <span>${baseAmount.toFixed(2)} MXN</span>
                  </div>
                  {tipAmount > 0 && (
                    <div className="flex justify-between items-center text-base font-medium text-black">
                      <span>{tc("tipLabel")}</span>
                      <span>${tipAmount.toFixed(2)} MXN</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2 mb-6">
                  <div className="flex justify-between items-center border-t pt-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-black text-base md:text-lg lg:text-xl">
                        {tc("totalToPay")}
                      </span>
                      <CircleAlert
                        className="size-4 cursor-pointer text-gray-500"
                        strokeWidth={2.3}
                        onClick={() => setShowTotalModal(true)}
                      />
                    </div>
                    <div className="text-right">
                      {selectedMSI !== null ? (
                        <span className="font-medium text-black text-base md:text-lg lg:text-xl">
                          ${(displayTotal / selectedMSI).toFixed(2)} MXN{" "}
                          {t("monthsSuffix", { months: selectedMSI })}
                        </span>
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

                {/* Saved Cards List */}
                <div className="mb-2.5">
                  <h3 className="text-black font-medium mb-3">
                    {t("paymentMethodsLabel")}
                  </h3>
                  <div className="space-y-2.5">
                    {allPaymentMethods.map((method) => (
                      <div
                        key={method.id}
                        className={`flex items-center py-1.5 px-5 pl-10 border rounded-full transition-colors ${
                          selectedPaymentMethodId === method.id
                            ? "border-even-grass bg-even-grass/10"
                            : "border-black/50 bg-surface"
                        }`}
                      >
                        <div
                          onClick={() => setSelectedPaymentMethodId(method.id)}
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
                          onClick={() => setSelectedPaymentMethodId(method.id)}
                          className={`w-4 h-4 rounded-full border-2 cursor-pointer ${
                            selectedPaymentMethodId === method.id
                              ? "border-even-grass bg-even-grass"
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
                            title={t("deleteCardButtonTitle")}
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

                    {walletOrderRejected && (
                      <p className="text-sm text-gray-600 text-center">
                        {t("walletUnavailableMessage")}
                      </p>
                    )}

                    {/* Apple Pay */}
                    {!applePayUnavailable && (
                      <div className="relative w-full h-12">
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

                    {/* Google Pay */}
                    {!googlePayUnavailable && (
                      <div className="relative w-full h-12">
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

                {/* Agregar tarjeta */}
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
          className="fixed bottom-0 left-0 right-0 bg-white mx-4 px-8 z-90 py-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={handlePayment}
            disabled={
              isProcessing ||
              !selectedPaymentMethodId ||
              totalAmountCharged <= 0
            }
            className={`w-full py-3 text-even-evergreen rounded-full cursor-pointer transition-colors text-base md:text-lg lg:text-xl active:scale-90 ${
              isProcessing ||
              !selectedPaymentMethodId ||
              totalAmountCharged <= 0
                ? "bg-even-grass opacity-50 cursor-not-allowed"
                : "bg-even-grass animate-pulse-button"
            }`}
          >
            {isProcessing ? (
              <div className="flex items-center justify-center gap-2 md:gap-3">
                <Loader2 className="size-5 animate-spin" />
                <span>{t("processingCta")}</span>
              </div>
            ) : !selectedPaymentMethodId ? (
              t("selectCardCta")
            ) : totalAmountCharged <= 0 ? (
              t("invalidAmount")
            ) : (
              tc("payCta")
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
                    <span className="text-black font-medium">{t("consumptionBreakdown")}</span>
                    <span className="text-black font-medium">
                      ${baseAmount.toFixed(2)} MXN
                    </span>
                  </div>
                  {tipAmount > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-black font-medium">{t("tipBreakdown")}</span>
                      <span className="text-black font-medium">
                        ${tipAmount.toFixed(2)} MXN
                      </span>
                    </div>
                  )}
                  {evenCommissionClient + ivaEvenClient > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-black font-medium">
                        {t("serviceCommissionBreakdown")}
                      </span>
                      <span className="text-black font-medium">
                        ${(evenCommissionClient + ivaEvenClient).toFixed(2)} MXN
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
            <div className="relative bg-white rounded-t-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
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
                                ? "border-even-grass bg-even-grass"
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
                                        {t("monthsOptionLabel", { months: option.months })}
                                      </p>
                                      <p className="text-xs md:text-sm text-gray-600">
                                        {t("monthlyInstallmentDetail", {
                                          monthly: monthlyPayment.toFixed(2),
                                          total: totalWithCommission.toFixed(2),
                                        })}
                                      </p>
                                    </div>
                                    <div
                                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                        selectedMSI === option.months
                                          ? "border-even-grass bg-even-grass"
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
          className="fixed inset-0 z-99999 flex items-end justify-center bg-black/50"
          onClick={() => {
            // Cerrar el modal no cambia si es seguro
            // recobrar — eso ya lo decidió el código que lo abrió.
            setErrorMessage(null);
            setErrorTitle(t("processingErrorTitle"));
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

              {/* Sin certeza de que no se cobró, este botón
                  no debe existir — dispararía un segundo cargo. Solo se
                  ofrece "Intentar de nuevo" cuando hay certeza de que el
                  cobro anterior no se concretó. */}
              <button
                onClick={() => {
                  // Cerrar el modal no cambia si es seguro
                  // recobrar — eso ya lo decidió el código que lo abrió.
                  setErrorMessage(null);
                  setErrorTitle(t("processingErrorTitle"));
                }}
                className="w-full bg-even-grass text-even-evergreen py-3 rounded-full text-base"
              >
                {canRetryCharge ? t("tryAgainCta") : tc("understood")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
