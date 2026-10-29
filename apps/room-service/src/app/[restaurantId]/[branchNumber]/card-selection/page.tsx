"use client";

import { useTranslations } from "next-intl";
import { useCart } from "@/context/CartContext";
import { useRoomNavigation } from "@/hooks/useRoomNavigation";
import { usePayment } from "@/context/PaymentContext";
import { useValidateAccess } from "@/hooks/useValidateAccess";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSearchParams } from "next/navigation";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import HighDemandBanner from "@/components/HighDemandBanner";
import { Plus, Trash2, Loader2, CircleAlert, X } from "lucide-react";
import { getCardTypeIcon } from "@/utils/cardIcons";
import OrderAnimation from "@/components/UI/OrderAnimation";
import ValidationError from "@/components/ValidationError";
import { roomOrderService } from "@/services/roomorders.service";
import {
  isDefinitiveWalletRejection,
  paymentService,
} from "@/services/payment.service";
import { useMsiConfig } from "@/hooks/useMsiConfig";
import { calculateCommissions } from "@/utils/commissionCalculator";
import { useAccountDiscount } from "@/hooks/useAccountDiscount";
import { USER_DISCOUNT_SERVICE } from "@/services/userDiscounts.service";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { useRestaurant } from "@/context/RestaurantContext";
import POSBlockedModal from "@/components/POSBlockedModal";
import {
  ensurePaymentIntent,
  clearStoredPaymentIntent,
  updateStoredPaymentIntent,
} from "@/utils/paymentIdempotency";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 60000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Mismos estados que el backend acepta como pagado en confirmOrder.
const PAID_ECART_STATUSES = ["paid", "completed", "succeeded", "approved"];

export default function CardSelectionPage() {
  const t = useTranslations("CardSelectionPage");
  const tc = useTranslations("Common");
  const {
    validationError,
    restaurantId: restaurantIdNum,
    branchNumber,
  } = useValidateAccess();
  const restaurantId = restaurantIdNum.toString();

  const { state: cartState, clearCart } = useCart();
  const { navigateWithRoom, roomNumber } = useRoomNavigation();
  const { paymentMethods, deletePaymentMethod } = usePayment();
  const { user, profile } = useAuth();
  const searchParams = useSearchParams();
  const { msiConfig } = useMsiConfig();
  const { restaurant } = useRestaurant();
  const { isAgentDisconnected, isTurnoClosed, isLoadingAgentStatus } =
    useAgentStatus(restaurantId, branchNumber);
  const isPOSBlocked = isAgentDisconnected || isTurnoClosed;

  // Tarjeta de prueba del sistema — SOLO para dev/QA.
  const showTestCard = process.env.NEXT_PUBLIC_SHOW_TEST_CARD === "true";

  const defaultSystemCard = {
    id: "system-default-card",
    lastFourDigits: "1234",
    cardBrand: "amex",
    cardType: "credit",
    isDefault: true,
    isSystemCard: true,
  };

  const allPaymentMethods = showTestCard
    ? [defaultSystemCard, ...paymentMethods]
    : paymentMethods;

  // "% en la cuenta" ya reclamado — personal (TK-0078) o promo QR — se
  // descuenta ANTES de calcular comisiones/total para que TODO lo derivado
  // (cobro, orden, registros) salga del monto ya descontado. El backend
  // valida y consume el único uso al cobrar (en /payments o en confirmOrder).
  const { accountDiscount, loading: accountDiscountLoading } =
    useAccountDiscount(restaurantIdNum, branchNumber);
  const cartBaseAmount = cartState.totalPrice;
  const orderDiscountAmount = accountDiscount
    ? Math.round(cartBaseAmount * accountDiscount.discountPercentage) / 100
    : 0;
  const baseAmount =
    Math.round((cartBaseAmount - orderDiscountAmount) * 100) / 100;
  const MINIMUM_AMOUNT = 20;
  const tipAmountFromParam = parseFloat(searchParams.get("tipAmount") || "0");

  const [showTotalModal, setShowTotalModal] = useState(false);
  const [showPaymentOptionsModal, setShowPaymentOptionsModal] = useState(false);
  const [selectedMSI, setSelectedMSI] = useState<number | null>(null);

  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<
    string | null
  >(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [showPOSModal, setShowPOSModal] = useState(false);
  const [posModalReason, setPosModalReason] = useState<
    "turno_closed" | "agent_disconnected"
  >("turno_closed");
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState<string>(t("processingError"));
  // false cuando ya hay certeza de que se cobró (o no hay
  // certeza de lo contrario) — el modal de error no debe ofrecer un botón
  // que dispare un segundo cobro.
  const [canRetryCharge, setCanRetryCharge] = useState(true);
  // Pantalla "Verificando tu pago…" — sustituye al mensaje de timeout de
  // OrderAnimation. La confirmación real sigue corriendo en segundo plano
  // (la misma llamada a handleConfirmPayment, que no se cancela); esta
  // pantalla solo refleja que seguimos esperando su resultado.
  const [verifying, setVerifying] = useState(false);

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

  const [showHighDemandBanner, setShowHighDemandBanner] = useState(false);

  useEffect(() => {
    if (!restaurantId || !branchNumber) return;
    const API_BASE =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
    fetch(
      `${API_BASE}/restaurants/${restaurantId}/${branchNumber}/order-flow-status`,
    )
      .then((r) => r.json())
      .then(({ data }) => {
        if (data?.is_high_demand) setShowHighDemandBanner(true);
      })
      .catch(() => {});
  }, [restaurantId, branchNumber]);

  const [showAnimation, setShowAnimation] = useState(false);
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null);
  const [completedOrderItems, setCompletedOrderItems] = useState<
    typeof cartState.items
  >([]);
  const [completedUserName, setCompletedUserName] = useState<string>("");

  // Red de seguridad: si se llega acá con el carrito vacío (link viejo,
  // navegación stale, etc.) no hay nada que pagar. No aplica mientras se
  // muestra la animación de éxito, ni mientras se verifica/ya se resolvió un
  // pago confirmado por la vía lenta: ahí también se limpia
  // el carrito a propósito, antes de navegar a payment-success. El
  // `!completedOrderId` es necesario además de `!verifying` porque el efecto
  // que navega a payment-success apaga `verifying` en el mismo tick en que
  // navega — sin este guard, ese cambio de `verifying` a false re-disparaba
  // este efecto y mandaba a /menu justo después (o en carrera) con la
  // navegación a payment-success, ganándole.
  useEffect(() => {
    if (
      cartState.hasLoaded &&
      !cartState.isLoading &&
      cartState.items.length === 0 &&
      !showAnimation &&
      !verifying &&
      !completedOrderId
    ) {
      navigateWithRoom("/menu", true);
    }
  }, [
    cartState.hasLoaded,
    cartState.isLoading,
    cartState.items.length,
    verifying,
    completedOrderId,
    showAnimation,
    navigateWithRoom,
  ]);

  const tipAmount = tipAmountFromParam;

  const commissions = calculateCommissions(baseAmount, tipAmount);
  const {
    evenCommissionTotal,
    evenCommissionClient,
    ivaEvenClient,
    evenClientCharge,
    totalAmountCharged: totalAmount,
  } = commissions;

  useEffect(() => {
    if (!selectedPaymentMethodId && allPaymentMethods.length > 0) {
      const defaultMethod =
        allPaymentMethods.find((pm) => pm.isDefault) || allPaymentMethods[0];
      setSelectedPaymentMethodId(defaultMethod.id);
    }
    if (!cartState.isLoading) {
      setIsLoadingInitial(false);
    }
  }, [allPaymentMethods.length, selectedPaymentMethodId, cartState.isLoading]);

  // Verificar soporte de Apple Pay y cargar el SDK solo si aplica.
  // En navegadores in-app (Instagram, Facebook, TikTok) el puente nativo
  // que inyecta `ApplePaySession` en `window` puede tardar unos momentos
  // en estar listo — un chequeo único al montar a veces corre antes de que
  // eso pase. Por eso reintentamos por un rato en vez de rendirnos de una.
  useEffect(() => {
    const loadSDK = () => {
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
  }, []);

  useEffect(() => {
    if (googlePayUnavailable) return;
    const src = "https://pay.ecart.com/sdk/pay.js";
    if (!document.querySelector(`script[src="${src}"]`)) {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onerror = () => setGooglePayUnavailable(true);
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

  useEffect(() => {
    if (
      isLoadingInitial ||
      accountDiscountLoading ||
      totalAmount <= 0 ||
      typeof window === "undefined"
    )
      return;
    if (applePayListenersRef.current) return;
    applePayListenersRef.current = true;

    (async () => {
      try {
        const orderResult = await paymentService.createApplePayOrder({
          amount: totalAmount,
          currency: "MXN",
          restaurantId,
          baseAmount,
          tipAmount,
          items: cartState.items.map((i) => ({
            name: i.name,
            price: i.price,
            quantity: i.quantity || 1,
            extraPrice: (i.extraPrice || 0) * (i.quantity || 1),
            // even-backend #333: el id del carrito permite al servidor
            // recalcular el consumo contra cart_items en vez de cobrar el
            // total que mandamos. Es opcional en el backend: sin él, cobra
            // igual que antes.
            cartItemId: i.cartItemId,
          })),
          userDiscountId:
            accountDiscount?.source === "personal"
              ? accountDiscount.id
              : undefined,
          promoRedemptionId:
            accountDiscount?.source === "promo"
              ? accountDiscount.id
              : undefined,
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
          setCompletedOrderItems([...cartState.items]);
          setCompletedUserName(
            profile
              ? [profile.firstName, profile.lastName]
                  .filter(Boolean)
                  .join(" ") || "Usuario"
              : cartState.userName || "Usuario",
          );
          setShowAnimation(true);
        });

        applePaySDK.render({
          container: "#apple-pay-container",
          orderId: appleOrderId,
          amount: totalAmount,
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
  }, [isLoadingInitial, accountDiscountLoading, totalAmount]);

  useEffect(() => {
    if (
      isLoadingInitial ||
      accountDiscountLoading ||
      totalAmount <= 0 ||
      typeof window === "undefined"
    )
      return;
    if (googlePayUnavailable) return;
    if (googlePayListenersRef.current) return;
    googlePayListenersRef.current = true;

    (async () => {
      try {
        const orderResult = await paymentService.createGooglePayOrder({
          amount: totalAmount,
          currency: "MXN",
          restaurantId,
          baseAmount,
          tipAmount,
          items: cartState.items.map((i) => ({
            name: i.name,
            price: i.price,
            quantity: i.quantity || 1,
            extraPrice: (i.extraPrice || 0) * (i.quantity || 1),
            // even-backend #333: el id del carrito permite al servidor
            // recalcular el consumo contra cart_items en vez de cobrar el
            // total que mandamos. Es opcional en el backend: sin él, cobra
            // igual que antes.
            cartItemId: i.cartItemId,
          })),
          userDiscountId:
            accountDiscount?.source === "personal"
              ? accountDiscount.id
              : undefined,
          promoRedemptionId:
            accountDiscount?.source === "promo"
              ? accountDiscount.id
              : undefined,
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
          setCompletedOrderItems([...cartState.items]);
          setCompletedUserName(
            profile
              ? [profile.firstName, profile.lastName]
                  .filter(Boolean)
                  .join(" ") || "Usuario"
              : cartState.userName || "Usuario",
          );
          setShowAnimation(true);
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
          amount: totalAmount,
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
  }, [
    isLoadingInitial,
    accountDiscountLoading,
    totalAmount,
    googlePayUnavailable,
  ]);

  const handleInitiatePayment = (): void => {
    if (isPOSBlocked) {
      setPosModalReason(isTurnoClosed ? "turno_closed" : "agent_disconnected");
      setShowPOSModal(true);
      return;
    }
    if (!roomNumber) {
      setErrorMessage(t("roomNotFoundError"));
      return;
    }
    if (!selectedPaymentMethodId) {
      setErrorMessage(t("errorSelectCard"));
      return;
    }

    setCompletedOrderItems([...cartState.items]);
    const userName = profile
      ? [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
        "Usuario"
      : cartState.userName || "Usuario";
    setCompletedUserName(userName);
    setShowAnimation(true);
  };

  const handleCancelPayment = () => {
    setShowAnimation(false);
    setCompletedOrderItems([]);
    setCompletedUserName("");
  };

  // Red de seguridad de OrderAnimation: el pago/orden nunca llegó a
  // confirmarse dentro del tiempo de espera VISUAL. La llamada real a
  // handleConfirmPayment sigue corriendo en segundo plano (no se cancela) y
  // puede seguir reintentando /confirm internamente — esta pantalla solo
  // refleja que seguimos esperando su resultado, nunca ofrece recobrar.
  const handleConfirmTimeout = () => {
    setShowAnimation(false);
    setVerifying(true);
  };

  // Una vez que la orden queda confirmada, `completedOrderId` se entera sin
  // importar si la pantalla activa era OrderAnimation o "Verificando tu
  // pago…" — si es esta última, navega directo (OrderAnimation ya no está
  // montado para hacerlo por su cuenta).
  useEffect(() => {
    if (!verifying || !completedOrderId) return;
    setVerifying(false);
    navigateWithRoom(
      `/payment-success?orderId=${completedOrderId}&success=true`,
      true,
    );
  }, [verifying, completedOrderId, navigateWithRoom]);

  useEffect(() => {
    if (errorMessage) setVerifying(false);
  }, [errorMessage]);

  const handleConfirmPayment = async (): Promise<void> => {
    if (!roomNumber || !selectedPaymentMethodId) {
      setShowAnimation(false);
      return;
    }

    setIsProcessing(true);
    // Una vez que la orden se confirma, el botón de pagar
    // NUNCA debe volver a habilitarse, así la navegación a payment-success
    // tarde lo que tarde (es una petición de red aparte — con la red lenta,
    // hay una ventana real entre "ya se confirmó" y "el navegador ya
    // cambió de pantalla" en la que, sin esta bandera, el finally de abajo
    // reactivaba el botón y dejaba iniciar un segundo cobro real).
    let orderCompletedSuccessfully = false;

    try {
      const clerkUserId = user?.id
        ? user.id
        : typeof window !== "undefined"
          ? localStorage.getItem("even-guest-id")
          : null;
      const isGuest = !user?.id;

      const customerName = profile
        ? [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
          "Invitado"
        : cartState.userName || "Invitado";
      const customerEmail =
        profile?.email || user?.email || `${user?.id}@letseven.io`;

      if (!cartState.items || cartState.items.length === 0) {
        throw new Error(t("errorEmptyCart"));
      }

      const chargedAmount = selectedMSI ? displayTotal : totalAmount;

      let customerPhone: string | null = null;
      if (user?.id) {
        try {
          const token = localStorage.getItem("even_access_token");
          const userResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/auth/me`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );
          if (userResponse.ok) {
            const userResult = await userResponse.json();
            if (userResult.success && userResult.data?.profile) {
              customerPhone = userResult.data.profile.phone || null;
            }
          }
        } catch (error) {
          // Could not fetch user phone — proceed without it
        }
      }

      const mappedItems = cartState.items.map((item) => ({
        item: item.name,
        price: item.price,
        quantity: item.quantity || 1,
        images:
          item.images && Array.isArray(item.images) && item.images.length > 0
            ? item.images.filter((img) => typeof img === "string")
            : [],
        custom_fields:
          item.customFields &&
          Array.isArray(item.customFields) &&
          item.customFields.length > 0
            ? item.customFields
            : null,
        extra_price: item.extraPrice || 0,
        menu_item_id: item.id ? item.id.toString() : null,
        user_discount_id: item.userDiscountId || null,
        is_promo_item: item.isPromoItem || false,
        cart_item_id: item.cartItemId || null,
      }));

      const commonBody = {
        clerk_user_id: clerkUserId,
        guest_id: isGuest ? clerkUserId : null,
        user_id: user?.id || null,
        is_guest: isGuest,
        customer_name: customerName,
        customer_phone: customerPhone,
        restaurant_id: parseInt(restaurantId),
        branch_number: parseInt(branchNumber.toString()),
        room_number: roomNumber,
        items: mappedItems,
        base_amount: baseAmount,
        tip_amount: tipAmount,
        total_amount_charged: chargedAmount,
        currency: "MXN",
        transaction_by: customerName,
        // Descuento de cuenta aplicado (si hay): el backend lo consume al
        // confirmar si el cobro no pasó por /payments (wallets). Solo una
        // de las dos fuentes puede venir a la vez (ver useAccountDiscount).
        user_discount_id:
          accountDiscount?.source === "personal" ? accountDiscount.id : null,
        promo_redemption_id:
          accountDiscount?.source === "promo" ? accountDiscount.id : null,
      };

      const saveAndFinalize = (
        orderId: string,
        cardLast4: string,
        cardBrand: string,
        paymentMethodId: string | null,
      ) => {
        const userName = profile
          ? [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
            "Usuario"
          : cartState.userName || "Usuario";
        const paymentDetailsForSuccess = {
          orderId,
          paymentId: orderId,
          transactionId: orderId,
          totalAmountCharged: chargedAmount,
          installments: selectedMSI || null,
          installmentBaseAmount: selectedMSI ? totalAmount : null,
          amount: totalAmount,
          baseAmount: baseAmount,
          tipAmount: tipAmount,
          evenCommissionClient: evenCommissionClient,
          ivaEvenClient: ivaEvenClient,
          evenCommissionTotal: evenCommissionTotal,
          userName: userName,
          customerName: customerName,
          customerEmail: customerEmail,
          customerPhone: customerPhone,
          cardLast4: cardLast4,
          cardBrand: cardBrand,
          orderStatus: "confirmed",
          paymentStatus: "paid",
          createdAt: new Date().toISOString(),
          dishOrders: cartState.items.map((item) => ({
            dish_order_id: item.id || Date.now(),
            item: item.name,
            quantity: item.quantity || 1,
            price: item.price,
            extra_price: item.extraPrice || 0,
            total_price: item.price * (item.quantity || 1),
            guest_name: customerName,
            custom_fields: item.customFields || null,
            image_url: item.images?.[0] || null,
          })),
          restaurantId: parseInt(restaurantId),
          paymentMethodId: paymentMethodId,
          timestamp: Date.now(),
          tableNumber: roomNumber,
        };

        localStorage.setItem(
          "even-completed-payment",
          JSON.stringify(paymentDetailsForSuccess),
        );
        const uniqueKey = `even-payment-success-${orderId}`;
        sessionStorage.setItem(
          uniqueKey,
          JSON.stringify(paymentDetailsForSuccess),
        );
        sessionStorage.setItem("even-current-payment-key", uniqueKey);
        sessionStorage.setItem("even-current-order-id", orderId);
        setCompletedOrderId(orderId);
      };

      // La orden quedó confirmada — se limpia la clave de
      // idempotencia (solo se limpia AQUÍ, nunca antes). `saveAndFinalize`
      // ya pone `completedOrderId`.
      const finalizeConfirmedOrder = (
        order: any,
        cardLast4: string,
        cardBrand: string,
        paymentMethodId: string | null,
      ) => {
        saveAndFinalize(order.id, cardLast4, cardBrand, paymentMethodId);
        clearStoredPaymentIntent();
        setCanRetryCharge(true);
        // NO apagar `verifying` aquí. Cuando esto se llama
        // desde la vía lenta (después de handleConfirmTimeout), `verifying`
        // sigue en true y es la señal que el useEffect de arriba necesita
        // para navegar — si se apaga aquí, ese effect ve `verifying=false`
        // y nunca navega (se queda pantalla en blanco sin ir a
        // payment-success). El propio effect lo apaga justo antes de navegar.
      };

      const showTerminalConfirmError = () => {
        setShowAnimation(false);
        setVerifying(false);
        setCanRetryCharge(false);
        setErrorTitle(t("confirmFailedTitle"));
        setErrorMessage(t("confirmFailedMessage"));
      };

      // Reintenta /confirm hasta que resuelva o se agote el tiempo — cubre
      // tanto el 409 confirm_in_progress inmediato como el caso en que
      // OrderAnimation ya se cerró por su propio timeout visual mientras
      // esto seguía esperando (la promesa sigue viva, solo cambió la
      // pantalla).
      const pollConfirm = async (
        buildBody: () => any,
      ): Promise<{ success: true; order: any } | { success: false }> => {
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        let firstAttempt = true;

        while (firstAttempt || Date.now() < deadline) {
          firstAttempt = false;
          const confirmResult = await roomOrderService.confirmOrder(
            buildBody(),
          );

          if (confirmResult.success && confirmResult.data?.order) {
            return { success: true, order: confirmResult.data.order };
          }
          if (confirmResult.code !== "confirm_in_progress") {
            return { success: false };
          }
          await sleep(POLL_INTERVAL_MS);
        }

        return { success: false };
      };

      // Consulta GET /payments/intents/:key hasta que el cobro quede
      // 'charged'/'confirmed' (devuelve su ecartpay_order_id), 'unknown'
      // (null — terminal), o se agote el tiempo (null).
      const waitForChargedIntent = async (
        intentKey: string,
      ): Promise<string | null> => {
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        while (Date.now() < deadline) {
          const statusRes =
            await paymentService.getPaymentIntentStatus(intentKey);
          if (statusRes.success) {
            if (statusRes.status === "unknown") return null;
            if (
              (statusRes.status === "charged" ||
                statusRes.status === "confirmed") &&
              statusRes.ecartpay_order_id
            ) {
              return statusRes.ecartpay_order_id;
            }
          }
          await sleep(POLL_INTERVAL_MS);
        }
        return null;
      };

      // ── Apple Pay ──────────────────────────────────────────────────────
      // El cargo ya ocurrió vía el SDK — reintentar acá NUNCA reabre el
      // sheet: solo reintenta /confirm con el mismo
      // ecartpay_order_id, que vive en el estado de React y sobrevive a que
      // OrderAnimation se cierre por su timeout.
      if (isApplePayProcessing) {
        if (!applePayPaymentId) {
          throw new Error(t("errorConfirmOrder"));
        }
        const result = await pollConfirm(() => ({
          ...commonBody,
          payment_method_id: null,
          payment_source: "apple_pay",
          ecartpay_order_id: applePayPaymentId,
        }));

        if (!result.success) {
          showTerminalConfirmError();
          return;
        }

        orderCompletedSuccessfully = true;
        finalizeConfirmedOrder(result.order, "AP", "apple", null);
        setIsApplePayProcessing(false);
        await clearCart();
        return;
      }

      // ── Google Pay ─────────────────────────────────────────────────────
      if (isGooglePayProcessing) {
        if (!googlePayPaymentId) {
          throw new Error(t("errorConfirmOrder"));
        }
        const result = await pollConfirm(() => ({
          ...commonBody,
          payment_method_id: null,
          payment_source: "google_pay",
          ecartpay_order_id: googlePayPaymentId,
        }));

        if (!result.success) {
          showTerminalConfirmError();
          return;
        }

        orderCompletedSuccessfully = true;
        finalizeConfirmedOrder(result.order, "GP", "google", null);
        setIsGooglePayProcessing(false);
        await clearCart();
        return;
      }

      // ── Cargo a la habitación (sin eCartPay) ────────────────────────────
      // No hay cobro real de por medio — nada que proteger con idempotencia.
      if (selectedPaymentMethodId === "system-default-card") {
        const result = await roomOrderService.confirmOrder({
          ...commonBody,
          payment_method_id: null,
          payment_source: "dev",
        });
        if (!result.success || !result.data?.order) {
          throw new Error(result.error?.message || t("errorConfirmOrder"));
        }
        saveAndFinalize(result.data.order.id, "1234", "amex", null);
        await clearCart();
        return;
      }

      // ── Tarjeta guardada ─────────────────────────────────────────────
      // Después de un 2xx de /payments, esta app NUNCA
      // vuelve a llamar /payments con otra clave para el mismo carrito. La
      // clave y el fingerprint solo se regeneran si el carrito cambió.
      const intent = await ensurePaymentIntent({
        items: cartState.items.map((i) => ({
          menuItemId: i.id,
          quantity: i.quantity || 1,
          extraPrice: i.extraPrice || 0,
          customFields: i.customFields || null,
        })),
        tipAmount,
        discountId: accountDiscount?.id ?? null,
        total: chargedAmount,
      });

      let ecartpayOrderId = intent.ecartpayOrderId;

      if (!ecartpayOrderId) {
        const paymentResult = await paymentService.processPayment({
          paymentMethodId: selectedPaymentMethodId!,
          amount: totalAmount,
          currency: "MXN",
          description: `Pago Mesa ${roomNumber} - ${customerName}`,
          orderId: `order-${Date.now()}`,
          roomNumber: roomNumber,
          restaurantId,
          installments: selectedMSI || undefined,
          baseAmount,
          tipAmount,
          userDiscountId:
            accountDiscount?.source === "personal"
              ? accountDiscount.id
              : undefined,
          promoRedemptionId:
            accountDiscount?.source === "promo"
              ? accountDiscount.id
              : undefined,
          service: USER_DISCOUNT_SERVICE,
          items: selectedMSI
            ? undefined
            : cartState.items.map((i) => ({
                name: i.name,
                price: i.price,
                quantity: i.quantity || 1,
                extraPrice: i.extraPrice || 0,
                cartItemId: i.cartItemId,
              })),
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
            // cobró con estos datos. Se regenera la clave (es, para
            // efectos de idempotencia, un pedido distinto) y se deja
            // reintentar con el total actualizado.
            clearStoredPaymentIntent();
            setShowAnimation(false);
            setCanRetryCharge(true);
            setErrorTitle(t("orderChangedTitle"));
            setErrorMessage(t("orderChangedMessage"));
            return;
          }

          if (code === "idempotency_unavailable") {
            // 503 — no hubo cobro, sí es seguro reintentar en unos segundos.
            setShowAnimation(false);
            setCanRetryCharge(true);
            setErrorTitle(t("retryTitle"));
            setErrorMessage(t("retryShortMessage"));
            return;
          }

          if (code === "payment_in_progress") {
            // Ya hay un cobro con esta clave en curso ahora mismo (mismo
            // intentKey, reintento cruzado) — nunca se vuelve a llamar
            // /payments. Se espera a que resuelva.
            setShowAnimation(false);
            setVerifying(true);
            const resolvedId = await waitForChargedIntent(intent.intentKey);
            if (!resolvedId) {
              showTerminalConfirmError();
              return;
            }
            updateStoredPaymentIntent({ ecartpayOrderId: resolvedId });
            ecartpayOrderId = resolvedId;
          } else if (code === "payment_rejected") {
            // Rechazo definitivo (422): no se cobró y repetir con la misma
            // tarjeta fallaría igual. Se descarta el intento guardado para
            // que otra tarjeta no reciba el replay del rechazo.
            clearStoredPaymentIntent();
            setShowAnimation(false);
            setCanRetryCharge(true);
            setErrorTitle(t("paymentRejectedTitle"));
            setErrorMessage(
              paymentResult.error?.message || t("paymentRejectedMessage"),
            );
            return;
          } else if (
            code === "payment_unknown" ||
            code === "charge_unconfirmed"
          ) {
            // Sin certeza de que no se cobró — nunca se ofrece recobrar.
            showTerminalConfirmError();
            return;
          } else {
            // card_declined / validation_error / etc. — certeza de que NO
            // se cobró, se puede reintentar con otra tarjeta tal cual.
            throw new Error(
              paymentResult.error?.message || t("processingError"),
            );
          }
        } else {
          // Éxito directo o replay de un intento anterior — misma forma de
          // respuesta en ambos casos, no hace falta distinguirlos aquí.
          ecartpayOrderId =
            (paymentResult as any).payment?.id ??
            (paymentResult as any).data?.orderId ??
            null;
          if (ecartpayOrderId) {
            updateStoredPaymentIntent({ ecartpayOrderId });
          }
        }
      }

      if (!ecartpayOrderId) {
        throw new Error("No se pudo confirmar el pago");
      }

      const selectedMethod = allPaymentMethods.find(
        (pm) => pm.id === selectedPaymentMethodId,
      );

      const confirmOutcome = await pollConfirm(() => ({
        ...commonBody,
        payment_method_id: selectedPaymentMethodId,
        payment_source: "saved_card",
        ecartpay_order_id: ecartpayOrderId,
      }));

      if (!confirmOutcome.success) {
        showTerminalConfirmError();
        return;
      }

      orderCompletedSuccessfully = true;
      finalizeConfirmedOrder(
        confirmOutcome.order,
        selectedMethod?.lastFourDigits || "1234",
        selectedMethod?.cardBrand || "visa",
        selectedPaymentMethodId,
      );
      await clearCart();
    } catch (error) {
      sessionStorage.removeItem("even-current-order-id");
      sessionStorage.removeItem("even-current-payment-key");
      setCompletedOrderId(null);
      setVerifying(false);
      setCanRetryCharge(true);
      const rawMessage =
        error instanceof Error ? error.message : t("errorUnknown");
      const errorCodeMap: Record<string, string> = {
        "Transaction rejected by your bank, please try another card.":
          "bankRejected",
        "Insufficient funds": "insufficientFunds",
        "Card expired": "cardExpired",
        "Invalid card number": "invalidCardNumber",
        "An unknown error occurred": "unknownPaymentError",
      };
      const errorCode = errorCodeMap[rawMessage];
      setErrorTitle(t("processingError"));
      setErrorMessage(errorCode ? t(`errors.${errorCode}`) : rawMessage);
      setShowAnimation(false);
    } finally {
      if (!orderCompletedSuccessfully) {
        setIsProcessing(false);
      }
    }
  };

  const handleAddCard = (): void => {
    navigateWithRoom(
      `/add-card?amount=${totalAmount}&baseAmount=${baseAmount}&scan=false`,
    );
  };

  const handleDeleteCard = async (paymentMethodId: string) => {
    if (!confirm(tc("confirmDeleteCard"))) return;
    setDeletingCardId(paymentMethodId);
    try {
      await deletePaymentMethod(paymentMethodId);
    } catch {
      setErrorTitle(t("deleteCardErrorTitle"));
      setErrorMessage(t("deleteCardErrorMessage"));
    } finally {
      setDeletingCardId(null);
    }
  };

  const getDisplayTotal = () => {
    if (selectedMSI === null) return totalAmount;
    const selectedMethod = allPaymentMethods.find(
      (pm) => pm.id === selectedPaymentMethodId,
    );
    const cardBrand = selectedMethod?.cardBrand;
    const msiOptions = cardBrand === "amex" ? msiConfig.amex : msiConfig.visaMc;
    const selectedOption = msiOptions.find((opt) => opt.months === selectedMSI);
    if (!selectedOption) return totalAmount;
    return totalAmount / (1 - (selectedOption.rate / 100) * 1.16);
  };

  const displayTotal = getDisplayTotal();
  const isUnderMinimum = totalAmount < MINIMUM_AMOUNT;

  if (isLoadingInitial) {
    return (
      <div className="min-h-dvh brand-evergreen flex flex-col">
        <div className="fixed top-0 left-0 right-0 z-50">
          <MenuHeaderBack />
        </div>
        <div className="h-20" />

        <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col">
          <div className="bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
            <div className="py-6 px-8 flex flex-col justify-center">
              <div className="h-8 w-3/4 bg-white/20 rounded-full mt-2 mb-6 animate-pulse" />
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="bg-white rounded-t-4xl flex-1 flex flex-col px-8 overflow-hidden z-10">
              <div className="flex-1 overflow-y-auto py-8 pb-30 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <div className="h-4 w-20 bg-gray-200 rounded-full animate-pulse" />
                  <div className="h-4 w-24 bg-gray-200 rounded-full animate-pulse" />
                </div>
                <div className="flex justify-between items-center border-t pt-3">
                  <div className="h-5 w-28 bg-gray-200 rounded-full animate-pulse" />
                  <div className="h-5 w-28 bg-gray-200 rounded-full animate-pulse" />
                </div>
                <div className="h-4 w-36 bg-gray-200 rounded-full animate-pulse mt-1" />
                <div className="h-12 w-full bg-gray-100 rounded-full animate-pulse" />
                <div className="h-12 w-full bg-gray-100 rounded-full animate-pulse" />
                <div className="h-12 w-full bg-gray-100 rounded-full animate-pulse" />
              </div>
            </div>
          </div>
        </div>

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

  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  return (
    <>
      {showHighDemandBanner && (
        <HighDemandBanner onDismiss={() => setShowHighDemandBanner(false)} />
      )}

      {showAnimation && (
        <OrderAnimation
          userName={completedUserName}
          orderedItems={completedOrderItems}
          orderId={completedOrderId}
          onTimeout={handleConfirmTimeout}
          onContinue={() => {
            let orderId = sessionStorage.getItem("even-current-order-id");
            if (!orderId) orderId = completedOrderId;
            if (!orderId) {
              const paymentData = localStorage.getItem(
                "even-completed-payment",
              );
              if (paymentData) {
                try {
                  orderId = JSON.parse(paymentData).orderId;
                } catch (e) {}
              }
            }
            if (!orderId || orderId === "unknown") return;
            // replace: true — el pago ya se realizó, no debe quedar una
            // entrada de historial hacia card-selection (ver el guard de
            // back en payment-success/page.tsx).
            navigateWithRoom(
              `/payment-success?orderId=${orderId}&success=true`,
              true,
            );
          }}
          onCancel={
            isApplePayProcessing || isGooglePayProcessing
              ? undefined
              : handleCancelPayment
          }
          onConfirm={handleConfirmPayment}
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

      <div className="min-h-dvh brand-evergreen flex flex-col">
        <MenuHeaderBack />

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
              <div className="flex-1 overflow-y-auto py-8 pb-30">
                {/* Resumen del pedido */}
                <div className="mb-3 space-y-2">
                  <div className="flex justify-between items-center text-base font-medium text-black">
                    <span>{tc("subtotal")}</span>
                    <span>${cartBaseAmount.toFixed(2)} MXN</span>
                  </div>
                  {accountDiscount && orderDiscountAmount > 0 && (
                    <div className="flex justify-between items-center text-base font-medium text-even-evergreen">
                      <span>
                        {tc("discount")} ({accountDiscount.discountPercentage}
                        %)
                      </span>
                      <span>-${orderDiscountAmount.toFixed(2)} MXN</span>
                    </div>
                  )}
                  {tipAmount > 0 && (
                    <div className="flex justify-between items-center text-base font-medium text-black">
                      <span>{tc("tip")}</span>
                      <span>${tipAmount.toFixed(2)} MXN</span>
                    </div>
                  )}
                </div>

                {/* Alerta de mínimo de compra */}
                {isUnderMinimum && totalAmount > 0 && (
                  <div className="bg-linear-to-br from-red-50 to-red-100 px-6 py-3 -mx-8 rounded-lg mb-4">
                    <div className="flex justify-center items-center gap-3">
                      <X className="size-6 text-red-500 shrink-0" />
                      <p className="text-red-700 font-medium text-base md:text-lg">
                        {t("minimumPurchaseWarning", {
                          amount: MINIMUM_AMOUNT.toFixed(2),
                        })}
                      </p>
                    </div>
                  </div>
                )}

                {/* Total a pagar */}
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between items-center border-t pt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-black font-medium text-base md:text-lg lg:text-xl">
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

                  {/* Pago a meses */}
                  {(() => {
                    const selectedMethod = allPaymentMethods.find(
                      (pm) => pm.id === selectedPaymentMethodId,
                    );
                    return selectedMethod?.cardType === "credit" &&
                      msiConfig.isActive &&
                      totalAmount >= 300 ? (
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

                {/* Métodos de pago */}
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
                          onClick={() => {
                            setSelectedPaymentMethodId(method.id);
                            setSelectedMSI(null);
                          }}
                          className="flex items-center justify-center gap-3 mx-auto cursor-pointer"
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
                              ? "border-even-grass bg-even-grass"
                              : "border-gray-300"
                          }`}
                        >
                          {selectedPaymentMethodId === method.id && (
                            <div className="w-full h-full rounded-full bg-white scale-50"></div>
                          )}
                        </div>

                        {method.id !== "system-default-card" && (
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

                    {walletOrderRejected && (
                      <p className="text-sm text-gray-600 text-center">
                        {t("walletUnavailableMessage")}
                      </p>
                    )}

                    {/* Apple Pay */}
                    {!applePayUnavailable &&
                      !isLoadingAgentStatus &&
                      !isPOSBlocked && (
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
                    {!googlePayUnavailable &&
                      !isLoadingAgentStatus &&
                      !isPOSBlocked && (
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

                {/* Agregar método de pago */}
                <div className="mb-2.5">
                  <button
                    onClick={handleAddCard}
                    className="border border-black/50 flex justify-center items-center gap-1 w-full text-black py-3 rounded-full cursor-pointer transition-colors bg-surface hover:bg-gray-100"
                  >
                    <Plus className="size-5" />
                    {t("addPaymentMethodCta")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Barra inferior fija */}
        <div className="fixed bottom-0 left-0 right-0 bg-white mx-4 px-8 z-90 py-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <button
            onClick={handleInitiatePayment}
            disabled={
              isProcessing || !selectedPaymentMethodId || isUnderMinimum
            }
            className={`py-3 text-even-evergreen rounded-full cursor-pointer font-normal h-fit w-full flex items-center justify-center text-base active:scale-95 transition-transform ${
              isProcessing || !selectedPaymentMethodId || isUnderMinimum
                ? "bg-even-grass opacity-50 cursor-not-allowed px-10"
                : "bg-even-grass px-10 animate-pulse-button"
            }`}
          >
            {isProcessing ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>{t("processingPaymentCta")}</span>
              </div>
            ) : !selectedPaymentMethodId ? (
              t("selectCardCta")
            ) : isUnderMinimum ? (
              t("minimumNotReachedCta")
            ) : (
              t("payAndOrderCta")
            )}
          </button>
        </div>

        {/* Modal de opciones de pago */}
        {showPaymentOptionsModal && (
          <div
            className="fixed inset-0 flex items-end justify-center backdrop-blur-sm"
            style={{ zIndex: 99999 }}
          >
            <div
              className="absolute inset-0 bg-black/20"
              onClick={() => setShowPaymentOptionsModal(false)}
            ></div>

            <div className="relative bg-white rounded-t-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
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
                              ${totalAmount.toFixed(2)} MXN
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

                      {(() => {
                        const availableOptions = msiOptions.filter(
                          (option) => totalAmount >= option.minAmount,
                        );
                        const hasUnavailableOptions =
                          availableOptions.length < msiOptions.length;
                        const minAmountNeeded = msiOptions[0]?.minAmount || 0;

                        return (
                          <>
                            {availableOptions.map((option) => {
                              const totalWithCommission =
                                totalAmount / (1 - (option.rate / 100) * 1.16);
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
                                        {t("totalLabel")} $
                                        {totalWithCommission.toFixed(2)} MXN
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
                              totalAmount < minAmountNeeded && (
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

              <div className="px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white">
                <button
                  onClick={() => setShowPaymentOptionsModal(false)}
                  className="w-full bg-even-grass text-even-evergreen py-3 rounded-full cursor-pointer transition-opacity hover:opacity-90 text-base"
                >
                  {tc("confirmCta")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de resumen del total */}
        {showTotalModal && (
          <div
            className="fixed inset-0 flex items-end justify-center"
            style={{ zIndex: 99999 }}
          >
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setShowTotalModal(false)}
            ></div>
            <div className="relative bg-white rounded-t-4xl w-full mx-4">
              <div className="px-6 pt-4">
                <div className="flex items-center justify-between pb-4 border-b border-stroke">
                  <h3 className="text-lg font-semibold text-black">
                    {t("totalSummaryTitle")}
                  </h3>
                  <button
                    onClick={() => setShowTotalModal(false)}
                    className="p-1 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="px-6 py-4">
                <p className="text-black mb-4">
                  {t("totalBreakdownIntro")}
                </p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-black font-medium">
                      {t("consumptionLabel")}
                    </span>
                    <span className="text-black font-medium">
                      ${baseAmount.toFixed(2)} MXN
                    </span>
                  </div>
                  {tipAmount > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-black font-medium">
                        {t("tipLabelPrefix")}
                      </span>
                      <span className="text-black font-medium">
                        ${tipAmount.toFixed(2)} MXN
                      </span>
                    </div>
                  )}
                  {evenClientCharge > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-black font-medium">
                        {t("serviceCommissionLabel")}
                      </span>
                      <span className="text-black font-medium">
                        ${evenClientCharge.toFixed(2)} MXN
                      </span>
                    </div>
                  )}
                </div>
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

              {/* Sin certeza de que no se cobró, este botón
                  no debe existir — dispararía un segundo cargo. Solo se
                  ofrece "Intentar de nuevo" cuando hay certeza de que el
                  cobro anterior no se concretó. */}
              <button
                onClick={() => {
                  // Cerrar el modal no cambia si es seguro
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
