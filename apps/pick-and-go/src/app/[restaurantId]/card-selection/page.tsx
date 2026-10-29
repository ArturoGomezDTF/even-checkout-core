"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { useNavigation } from "@/hooks/useNavigation";
import { usePayment } from "@/context/PaymentContext";
import { useRestaurant } from "@/context/RestaurantContext";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { authService } from "@/services/auth.service";
import { useGuest, useIsGuest } from "@/context/GuestContext";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import HighDemandBanner from "@/components/modals/HighDemandBanner";
import { Plus, Trash2, Loader2, CircleAlert, X } from "lucide-react";
import { getCardTypeIcon } from "@/utils/cardIcons";
import { useBranch } from "@/context/BranchContext";
import OrderAnimation from "@/components/UI/OrderAnimation";
import { pickAndGoService } from "@/services/pickandgo.service";
import {
  isDefinitiveWalletRejection,
  paymentService,
} from "@/services/payment.service";
import { calculateCommissions } from "@/utils/commissionCalculator";
import { useAccountDiscount } from "@/hooks/useAccountDiscount";
import { USER_DISCOUNT_SERVICE } from "@/services/userDiscounts.service";
import { usePaymentProvider } from "@/hooks/usePaymentProvider";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { useMsiConfig } from "@/hooks/useMsiConfig";
import POSBlockedModal from "@/components/POSBlockedModal";
import {
  ensurePaymentIntent,
  clearStoredPaymentIntent,
  updateStoredPaymentIntent,
} from "@/utils/paymentIdempotency";

// Google Pay deshabilitado temporalmente — cambiar a false para reactivarlo.
const GOOGLE_PAY_DISABLED = false;
// Apple Pay deshabilitado temporalmente — cambiar a false para reactivarlo.
const APPLE_PAY_DISABLED = false;
// Mismos estados que el backend acepta como pagado en confirmOrder.
const PAID_ECART_STATUSES = ["paid", "completed", "succeeded", "approved"];

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 60000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function CardSelectionPage() {
  const t = useTranslations("CardSelectionPage");
  const tc = useTranslations("Common");
  const params = useParams();
  const searchParams = useSearchParams();
  const { setRestaurantId, restaurant } = useRestaurant();
  const restaurantId = params?.restaurantId as string;
  const { provider, isLoadingProvider } = usePaymentProvider(restaurantId);
  const { selectedBranchNumber } = useBranch();
  const { isAgentDisconnected, isTurnoClosed, isLoadingAgentStatus } =
    useAgentStatus(restaurantId, selectedBranchNumber ?? 1);
  const isPOSBlocked = isAgentDisconnected || isTurnoClosed;
  const { msiConfig } = useMsiConfig();
  const isGuest = useIsGuest();
  const { guestName } = useGuest();

  useEffect(() => {
    if (restaurantId && !isNaN(parseInt(restaurantId))) {
      setRestaurantId(parseInt(restaurantId));
    }
  }, [restaurantId, setRestaurantId]);

  // Tip y pickup time vienen de la página anterior vía URL params
  const tipAmountFromParam = parseFloat(searchParams.get("tipAmount") || "0");
  const scheduledPickupTime = searchParams.get("scheduledPickupTime") || null;

  const {
    state: cartState,
    clearCart,
    orderNotes,
    updateOrderNotes,
  } = useCart();
  const { navigateWithRestaurantId, branchNumber } = useNavigation();
  const { paymentMethods, deletePaymentMethod } = usePayment();
  const { user, profile } = useAuth();
  const { guestId } = useGuest();

  // "% en la cuenta" ya reclamado — personal (TK-0078) o promo QR — se
  // descuenta ANTES de calcular comisiones/total para que TODO lo derivado
  // (cobro, orden, registros) salga del monto ya descontado. El backend
  // valida y consume el único uso al cobrar (en /payments o en confirmOrder).
  const { accountDiscount, loading: accountDiscountLoading } =
    useAccountDiscount(
      Number(restaurantId) || null,
      selectedBranchNumber || branchNumber || null,
    );
  const cartBaseAmount = cartState.totalPrice;
  const orderDiscountAmount = accountDiscount
    ? Math.round(cartBaseAmount * accountDiscount.discountPercentage) / 100
    : 0;
  const baseAmount =
    Math.round((cartBaseAmount - orderDiscountAmount) * 100) / 100;

  // Validación de compra mínima
  const MINIMUM_AMOUNT = 20;

  const [showPOSModal, setShowPOSModal] = useState(false);
  const [posModalReason, setPosModalReason] = useState<
    "turno_closed" | "agent_disconnected"
  >("turno_closed");
  const [showTotalModal, setShowTotalModal] = useState(false);
  const [showPaymentOptionsModal, setShowPaymentOptionsModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState<string>(() =>
    t("processingError"),
  );
  const [canRetryCharge, setCanRetryCharge] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [selectedMSI, setSelectedMSI] = useState<number | null>(null);
  const [applePayReady, setApplePayReady] = useState(false);
  const [applePayUnavailable, setApplePayUnavailable] = useState(false);
  // La orden de wallet fue rechazada de forma definitiva: se ocultan Apple y
  // Google Pay y se pide pagar con tarjeta guardada.
  const [walletOrderRejected, setWalletOrderRejected] = useState(false);
  const [isApplePayProcessing, setIsApplePayProcessing] = useState(false);
  const [applePayPaymentId, setApplePayPaymentId] = useState<string | null>(
    null,
  );
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

  // Estados para tarjetas
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<
    string | null
  >(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);

  const [googlePayToken, setGooglePayToken] = useState<string | null>(null);
  const applePayListenersRef = useRef(false);
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

  // Refs para valores frescos en los success handlers sin ser dependencias del useCallback
  const cartItemsRef = useRef(cartState.items);
  const cartUserNameRef = useRef(cartState.userName);
  const profileRef = useRef(profile);
  useEffect(() => {
    cartItemsRef.current = cartState.items;
  }, [cartState.items]);
  useEffect(() => {
    cartUserNameRef.current = cartState.userName;
  }, [cartState.userName]);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // Estado banner de alta demanda
  const [showHighDemandBanner, setShowHighDemandBanner] = useState(false);

  useEffect(() => {
    if (!restaurantId || !selectedBranchNumber) return;
    const API_BASE =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
    fetch(
      `${API_BASE}/restaurants/${restaurantId}/${selectedBranchNumber}/order-flow-status`,
    )
      .then((r) => r.json())
      .then(({ data }) => {
        if (data?.is_high_demand) setShowHighDemandBanner(true);
      })
      .catch(() => {});
  }, [restaurantId, selectedBranchNumber]);

  // Estado para mostrar animación y guardar orderId e items
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
      navigateWithRestaurantId("/menu", { replace: true });
    }
  }, [
    cartState.hasLoaded,
    cartState.isLoading,
    cartState.items.length,
    showAnimation,
    verifying,
    completedOrderId,
    navigateWithRestaurantId,
  ]);

  const tipAmount = tipAmountFromParam;

  // Usar el calculador de comisiones centralizado
  const commissions = calculateCommissions(baseAmount, tipAmount);
  const {
    ivaTip,
    subtotalForCommission,
    evenCommissionTotal,
    evenCommissionClient,
    evenCommissionRestaurant,
    ivaEvenClient,
    ivaEvenRestaurant,
    evenClientCharge,
    evenRestaurantCharge,
    totalAmountCharged: totalAmount,
    rates,
  } = commissions;

  // Set default payment method when payment methods are loaded
  useEffect(() => {
    const visibleMethods = paymentMethods;
    if (!selectedPaymentMethodId && visibleMethods.length > 0) {
      const defaultMethod =
        visibleMethods.find((pm) => pm.isDefault) || visibleMethods[0];
      setSelectedPaymentMethodId(defaultMethod.id);
    }
    if (!cartState.isLoading) {
      setIsLoadingInitial(false);
    }
  }, [paymentMethods.length, selectedPaymentMethodId, cartState.isLoading]);

  // Cargar el SDK de Ecart Pay para Apple Pay
  useEffect(() => {
    if (!isLoadingProvider) {
      /*console.log(
        `[PaymentProvider] Proveedor activo: ${provider ?? "null"} (restaurantId: ${restaurantId})`,
      );
      if (provider === "clip") {
        console.warn(
          "[PaymentProvider] Clip seleccionado — flujo no implementado aún, usando eCartPay como fallback",
        );
      }*/
    }
  }, [provider, isLoadingProvider, restaurantId]);

  // Verificar soporte de Apple Pay y cargar el SDK solo si aplica.
  // En navegadores in-app (Instagram, Facebook, TikTok) el puente nativo
  // que inyecta `ApplePaySession` en `window` puede tardar unos momentos
  // en estar listo — un chequeo único al montar a veces corre antes de que
  // eso pase. Por eso reintentamos por un rato en vez de rendirnos de una.
  useEffect(() => {
    if (APPLE_PAY_DISABLED) {
      setApplePayUnavailable(true);
      return;
    }
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

  const handleInitiatePayment = (): void => {
    if (isPOSBlocked) {
      setPosModalReason(isTurnoClosed ? "turno_closed" : "agent_disconnected");
      setShowPOSModal(true);
      return;
    }
    if (!selectedPaymentMethodId) {
      setErrorMessage(t("errorSelectCard"));
      return;
    }

    // Guardar datos antes de mostrar animación
    setCompletedOrderItems([...cartState.items]);
    const userName = profile
      ? [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
        tc("defaultUserName")
      : guestName || cartState.userName || tc("defaultUserName");
    setCompletedUserName(userName);

    // Mostrar animación inmediatamente (sin procesar pago aún)
    setShowAnimation(true);
  };

  const handleCancelPayment = () => {
    //console.log("❌ Payment cancelled by user");
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
    navigateWithRestaurantId(
      `/payment-success?orderId=${completedOrderId}&success=true`,
      { replace: true },
    );
  }, [verifying, completedOrderId, navigateWithRestaurantId]);

  useEffect(() => {
    if (errorMessage) setVerifying(false);
  }, [errorMessage]);

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

  useEffect(() => {
    if (APPLE_PAY_DISABLED) return;
    if (
      isLoadingInitial ||
      accountDiscountLoading ||
      baseAmount <= 0 ||
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
          restaurantId: restaurantId,
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
          // Sin esto, eCartPay cobraba el platillo a precio
          // completo aunque hubiera descuento — el backend solo LEE el %
          // aquí, nunca lo consume.
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
          console.warn(
            "⚠️ [AP-ORDER] No se pudo crear la orden:",
            orderResult.error ?? orderResult,
          );
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
          console.warn("⚠️ [AP-SDK] SDK no disponible en window.Pay.ApplePay");
          setApplePayUnavailable(true);
          applePayListenersRef.current = false;
          return;
        }

        applePaySDK.on("ready", () => {
          console.log("✅ [AP-READY] SDK listo. orderId:", appleOrderId);
          setTimeout(() => {
            applePayReadyRef.current = true;
            setApplePayReady(true);
          }, 2800);
        });
        applePaySDK.on("unavailable", () => setApplePayUnavailable(true));
        applePaySDK.on("cancel", () => {
          console.log("🚫 Apple Pay cancelado");
          setIsApplePayProcessing(false);
        });
        applePaySDK.on("error", (event: any) => {
          // Este evento también dispara en la inicialización del SDK (no
          // solo en un intento real de pago), así que no siempre implica que
          // Apple Pay dejó de estar disponible. Si el botón ya se había
          // mostrado (init exitoso), esto es un error de un intento de pago
          // real —p.ej. tarjeta rechazada por fondos insuficientes— y el
          // usuario debe poder reintentar, así que no lo ocultamos. Solo lo
          // ocultamos si el error ocurre antes de que el botón llegara a
          // estar listo.
          console.error("❌ Apple Pay error:", event);
          setIsApplePayProcessing(false);
          if (!applePayReadyRef.current) {
            setApplePayUnavailable(true);
          }
        });
        applePaySDK.on("success", (event: any) => {
          console.log("✅ Apple Pay autorizado", event?.detail);
          sessionStorage.removeItem("even-current-order-id");
          sessionStorage.removeItem("even-current-payment-key");
          setApplePayPaymentId(event?.detail?.id || appleOrderId);
          setIsApplePayProcessing(true);
          setCompletedOrderItems([...cartItemsRef.current]);
          setCompletedUserName(
            profileRef.current
              ? [profileRef.current.firstName, profileRef.current.lastName]
                  .filter(Boolean)
                  .join(" ") || tc("defaultUserName")
              : cartUserNameRef.current || tc("defaultUserName"),
          );
          setShowAnimation(true);
        });

        applePaySDK.render({
          container: "#apple-pay-container",
          orderId: appleOrderId,
          amount: totalAmount,
          currency: "MXN",
          countryCode: "MX",
          label: restaurant?.name || "Even",
          buttonStyle: "black",
          buttonType: "pay",
          borderRadius: "8px",
          supportedNetworks: ["visa", "masterCard"],
        });

        // Si el SDK ya estaba cargado (segunda+ navegación), "ready" no se re-emite
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
  }, [isLoadingInitial, accountDiscountLoading, baseAmount, totalAmount]);

  useEffect(() => {
    if (GOOGLE_PAY_DISABLED) return;
    if (
      isLoadingInitial ||
      accountDiscountLoading ||
      baseAmount <= 0 ||
      totalAmount <= 0 ||
      typeof window === "undefined"
    )
      return;
    if (googlePayListenersRef.current) return;
    googlePayListenersRef.current = true;

    (async () => {
      try {
        const orderResult = await paymentService.createGooglePayOrder({
          amount: totalAmount,
          currency: "MXN",
          restaurantId: restaurantId,
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
          console.warn(
            "⚠️ [GP-ORDER] No se pudo crear la orden:",
            orderResult.error ?? orderResult,
          );
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

        const googleSdkAlreadyLoaded = !!(window as any).Pay?.GooglePay;
        const googlePaySDK = await getGooglePaySDK();
        if (!googlePaySDK) {
          console.warn("⚠️ [GP-SDK] SDK no disponible en window.Pay.GooglePay");
          setGooglePayUnavailable(true);
          googlePayListenersRef.current = false;
          return;
        }

        googlePaySDK.on("ready", () => {
          console.log("✅ [GP-READY] SDK listo. orderId:", googleOrderId);
          setTimeout(() => {
            googlePayReadyRef.current = true;
            setGooglePayReady(true);
          }, 2800);
        });
        googlePaySDK.on("unavailable", () => {
          console.log(
            "ℹ️ Google Pay no disponible en este dispositivo/navegador",
          );
          setGooglePayUnavailable(true);
        });
        googlePaySDK.on("cancel", () => {
          console.log("🚫 Google Pay cancelado");
          setIsGooglePayProcessing(false);
        });
        googlePaySDK.on("error", (err: any) => {
          // Este evento también dispara en la inicialización del SDK (no
          // solo en un intento real de pago), así que no siempre implica que
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
        const handleGooglePaySuccess = (token: string | null) => {
          if (googlePaySucceededRef.current) return;
          googlePaySucceededRef.current = true;
          stopGooglePay3dsWatch();
          sessionStorage.removeItem("even-current-order-id");
          sessionStorage.removeItem("even-current-payment-key");
          setGooglePayToken(token);
          setGooglePayPaymentId(googleOrderId);
          setIsGooglePayProcessing(true);
          setCompletedOrderItems([...cartItemsRef.current]);
          setCompletedUserName(
            profileRef.current
              ? [profileRef.current.firstName, profileRef.current.lastName]
                  .filter(Boolean)
                  .join(" ") || tc("defaultUserName")
              : cartUserNameRef.current || tc("defaultUserName"),
          );
          setShowAnimation(true);
        };

        googlePaySDK.on("success", (event: any) => {
          console.log("✅ Google Pay autorizado", event?.detail);
          handleGooglePaySuccess(event?.detail?.token || null);
        });

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
          handleGooglePaySuccess(null);
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

        // Si el SDK ya estaba cargado (segunda+ navegación), "ready" no se re-emite
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
  }, [
    isLoadingInitial,
    accountDiscountLoading,
    baseAmount,
    totalAmount,
    restaurantId,
  ]);

  const handleConfirmPayment = async (): Promise<void> => {
    const items =
      completedOrderItems.length > 0 ? completedOrderItems : cartState.items;

    if (!items || items.length === 0) {
      setErrorMessage(t("errorEmptyCart"));
      setShowAnimation(false);
      return;
    }

    // Si hay usuario autenticado pero el perfil en memoria no trae nombre
    // (contexto desactualizado / condición de carrera con auth-selection),
    // refrescamos desde el backend antes de armar el pedido para no grabar
    // "Invitado" cuando el nombre real ya existe en profiles.
    let resolvedProfile = profile;
    if (!isGuest && user && !profile?.firstName) {
      try {
        const freshProfileResponse = (await authService.getMyProfile()) as any;
        const freshProfile =
          freshProfileResponse?.data?.data?.profile ||
          freshProfileResponse?.data?.profile;
        if (freshProfile?.firstName) {
          resolvedProfile = freshProfile;
        }
      } catch {
        // Si falla el refetch, seguimos con lo que ya había en memoria
      }
    }

    const customerName = resolvedProfile
      ? [resolvedProfile.firstName, resolvedProfile.lastName]
          .filter(Boolean)
          .join(" ") || tc("defaultGuestName")
      : guestName || cartState.userName || tc("defaultGuestName");
    const customerEmail = user?.email || null;
    const customerPhone = user?.id && user?.phone ? user.phone : null;
    const userId = user?.id || guestId || null;
    const transactionBy =
      (isGuest
        ? guestName || tc("defaultGuestName")
        : [resolvedProfile?.firstName, resolvedProfile?.lastName]
            .filter(Boolean)
            .join(" ")) || customerName;
    const evenRateApplied =
      subtotalForCommission > 0
        ? (evenCommissionTotal / subtotalForCommission) * 100
        : 0;

    const mappedItems = items.map((item) => ({
      item: item.name,
      price: item.price,
      quantity: item.quantity || 1,
      images:
        item.images && Array.isArray(item.images) && item.images.length > 0
          ? item.images.filter((img) => typeof img === "string")
          : [],
      customFields:
        item.customFields &&
        Array.isArray(item.customFields) &&
        item.customFields.length > 0
          ? item.customFields
          : null,
      extraPrice: item.extraPrice || 0,
      menuItemId: item.id?.toString() ?? null,
      specialInstructions: item.specialInstructions || null,
      is_promo_item: item.isPromoItem || false,
      user_discount_id: item.userDiscountId || null,
      cart_item_id: item.cartItemId || null,
    }));

    const commonBody = {
      clerk_user_id: userId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      restaurant_id: parseInt(restaurantId),
      branch_number: selectedBranchNumber || branchNumber || 1,
      total_amount: totalAmount,
      prep_metadata: {
        scheduled_pickup_time: scheduledPickupTime,
      },
      order_notes: orderNotes.trim() || null,
      items: mappedItems,
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
      total_amount_charged: totalAmount,
      transaction_by: transactionBy,
      is_guest: isGuest,
      user_id: userId,
      // Descuento de cuenta aplicado (si hay): el backend lo consume al
      // confirmar si el cobro no pasó por /payments (wallets). Solo una de
      // las dos fuentes puede venir a la vez (ver useAccountDiscount).
      user_discount_id:
        accountDiscount?.source === "personal" ? accountDiscount.id : null,
      promo_redemption_id:
        accountDiscount?.source === "promo" ? accountDiscount.id : null,
    };

    const saveAndFinalize = (
      pickAndGoOrderId: string,
      paymentId: string,
      transactionId: string,
      cardLast4: string,
      cardBrand: string,
      paymentMethodId: string | null,
    ) => {
      const userName = resolvedProfile
        ? [resolvedProfile.firstName, resolvedProfile.lastName]
            .filter(Boolean)
            .join(" ") || tc("defaultUserName")
        : guestName || cartState.userName || tc("defaultUserName");
      const chargedAmount = selectedMSI ? displayTotal : totalAmount;
      const paymentDetailsForSuccess = {
        orderId: pickAndGoOrderId,
        paymentId,
        transactionId,
        totalAmountCharged: chargedAmount,
        amount: chargedAmount,
        baseAmount,
        tipAmount,
        installments: selectedMSI || null,
        installmentBaseAmount: selectedMSI ? totalAmount : null,
        evenCommissionClient: evenCommissionClient || 0,
        ivaEvenClient: ivaEvenClient || 0,
        evenCommissionTotal: evenCommissionTotal || 0,
        userName,
        customerName,
        customerEmail,
        customerPhone,
        cardLast4,
        cardBrand,
        orderStatus: "confirmed",
        paymentStatus: "paid",
        createdAt: new Date().toISOString(),
        dishOrders: items.map((item) => ({
          dish_order_id: `item-${item.id}-${Date.now()}`,
          item: item.name,
          quantity: item.quantity || 1,
          price: item.price,
          extra_price: item.extraPrice || 0,
          total_price:
            item.price * (item.quantity || 1) + (item.extraPrice || 0),
          guest_name: userName,
          custom_fields: item.customFields || null,
          image_url: item.images?.[0] || null,
        })),
        restaurantId: parseInt(restaurantId),
        paymentMethodId,
        scheduledPickupTime,
        timestamp: Date.now(),
      };

      localStorage.setItem(
        "even-completed-payment",
        JSON.stringify(paymentDetailsForSuccess),
      );
      const uniqueKey = `even-payment-success-${pickAndGoOrderId}`;
      sessionStorage.setItem(
        uniqueKey,
        JSON.stringify(paymentDetailsForSuccess),
      );
      sessionStorage.setItem("even-current-payment-key", uniqueKey);
      sessionStorage.setItem("even-current-order-id", pickAndGoOrderId);
    };

    // La orden quedó confirmada — se limpia la clave de
    // idempotencia (solo se limpia AQUÍ, nunca antes) y se navega igual que
    // el flujo de siempre.
    const finalizeConfirmedOrder = (
      order: any,
      paymentId: string,
      transactionId: string,
      cardLast4: string,
      cardBrand: string,
      paymentMethodId: string | null,
    ) => {
      updateOrderNotes("");
      saveAndFinalize(
        order.id,
        paymentId,
        transactionId,
        cardLast4,
        cardBrand,
        paymentMethodId,
      );
      clearStoredPaymentIntent();
      void clearCart();
      setCanRetryCharge(true);
      // NO apagar `verifying` aquí. Cuando esto se llama
      // desde la vía lenta (después de handleConfirmTimeout), `verifying`
      // sigue en true y es la señal que el useEffect de arriba necesita
      // para navegar — si se apaga aquí, ese effect ve `verifying=false`
      // y nunca navega (se queda pantalla en blanco sin ir a
      // payment-success). El propio effect lo apaga justo antes de navegar.
      setCompletedOrderId(order.id);
    };

    const showTerminalConfirmError = () => {
      setShowAnimation(false);
      setVerifying(false);
      setCanRetryCharge(false);
      setErrorTitle("No pudimos confirmar tu pago");
      setErrorMessage(
        "No pudimos confirmar tu pedido. Revisa tu correo o contacta al restaurante antes de intentar de nuevo.",
      );
    };

    // Reintenta /confirm hasta que resuelva o se agote el tiempo — cubre
    // tanto el 409 confirm_in_progress inmediato como el caso en que
    // OrderAnimation ya se cerró por su propio timeout visual mientras esto
    // seguía esperando (la promesa sigue viva, solo cambió la pantalla).
    const pollConfirm = async (
      buildBody: () => any,
    ): Promise<{ success: true; order: any } | { success: false }> => {
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      let firstAttempt = true;

      while (firstAttempt || Date.now() < deadline) {
        firstAttempt = false;
        const confirmResult = await pickAndGoService.confirmOrder(
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

    setIsProcessing(true);
    // Una vez que la orden se confirma, el botón de pagar
    // NUNCA debe volver a habilitarse, así la navegación a payment-success
    // tarde lo que tarde (es una petición de red aparte — con la red lenta,
    // hay una ventana real entre "ya se confirmó" y "el navegador ya
    // cambió de pantalla" en la que, sin esta bandera, el finally de abajo
    // reactivaba el botón y dejaba iniciar un segundo cobro real).
    let orderCompletedSuccessfully = false;

    try {
      // ── Apple Pay ────────────────────────────────────────────────────
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
          session_data: {
            source: "card-selection",
            payment_method_id: null,
            total_amount: totalAmount,
            base_amount: baseAmount,
            tip_amount: tipAmount,
          },
        }));

        if (!result.success) {
          showTerminalConfirmError();
          return;
        }

        orderCompletedSuccessfully = true;
        finalizeConfirmedOrder(
          result.order,
          applePayPaymentId || `apple-pay-${result.order.id}`,
          result.order.id,
          "AP",
          "apple",
          null,
        );
        return;
      }

      // ── Google Pay ───────────────────────────────────────────────────
      if (isGooglePayProcessing) {
        if (!googlePayPaymentId) {
          throw new Error(t("errorConfirmOrder"));
        }
        const result = await pollConfirm(() => ({
          ...commonBody,
          payment_method_id: null,
          payment_source: "google_pay",
          ecartpay_order_id: googlePayPaymentId,
          google_pay_token: googlePayToken,
          session_data: {
            source: "card-selection",
            payment_method_id: null,
            total_amount: totalAmount,
            base_amount: baseAmount,
            tip_amount: tipAmount,
          },
        }));

        if (!result.success) {
          showTerminalConfirmError();
          return;
        }

        orderCompletedSuccessfully = true;
        finalizeConfirmedOrder(
          result.order,
          googlePayPaymentId || `google-pay-${result.order.id}`,
          result.order.id,
          "GP",
          "google",
          null,
        );
        return;
      }

      if (!selectedPaymentMethodId) {
        setShowAnimation(false);
        return;
      }

      // ── Tarjeta guardada ─────────────────────────────────────────────
      // Después de un 2xx de /payments, esta app NUNCA
      // vuelve a llamar /payments con otra clave para el mismo carrito. La
      // clave y el fingerprint solo se regeneran si el carrito cambió.
      const intent = await ensurePaymentIntent({
        items: items.map((i) => ({
          menuItemId: i.id,
          quantity: i.quantity || 1,
          extraPrice: i.extraPrice || 0,
          customFields: i.customFields || null,
        })),
        tipAmount,
        discountId: accountDiscount?.id ?? null,
        total: selectedMSI ? displayTotal : totalAmount,
      });

      let ecartpayOrderId = intent.ecartpayOrderId;

      if (!ecartpayOrderId) {
        const paymentResult = await paymentService.processPayment({
          paymentMethodId: selectedPaymentMethodId,
          // Para diferido, se manda el monto original — EcartPay aplica el
          // financiamiento internamente y devuelve el total inflado en la orden.
          amount: totalAmount,
          currency: "MXN",
          description: `Pick & Go Order - ${customerName}`,
          orderId: `order-${Date.now()}`,
          tableNumber: "PICKUP",
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
            : items.map((i) => ({
                name: i.name,
                price: i.price,
                quantity: i.quantity || 1,
                extraPrice: (i.extraPrice || 0) * (i.quantity || 1),
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
            setErrorTitle("Tu pedido cambió");
            setErrorMessage(
              "Tu carrito cambió antes de completar el pago. Revisa tu total e intenta de nuevo.",
            );
            return;
          }

          if (code === "idempotency_unavailable") {
            // 503 — no hubo cobro, sí es seguro reintentar en unos segundos.
            setShowAnimation(false);
            setCanRetryCharge(true);
            setErrorTitle("Intenta de nuevo");
            setErrorMessage(
              "No pudimos verificar tu pago. Intenta de nuevo en unos segundos.",
            );
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
              (typeof paymentResult.error === "object"
                ? paymentResult.error?.message
                : undefined) || t("paymentRejectedMessage"),
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
              (typeof paymentResult.error === "object"
                ? paymentResult.error?.message
                : undefined) || t("processingError"),
            );
          }
        } else {
          // Éxito directo o replay de un intento anterior — misma forma de
          // respuesta en ambos casos, no hace falta distinguirlos aquí.
          ecartpayOrderId = (paymentResult as any).payment?.id ?? null;
          if (ecartpayOrderId) {
            updateStoredPaymentIntent({ ecartpayOrderId });
          }
        }
      }

      if (!ecartpayOrderId) {
        throw new Error(t("errorConfirmOrder"));
      }

      const selectedPM = paymentMethods.find(
        (pm) => pm.id === selectedPaymentMethodId,
      );

      const confirmOutcome = await pollConfirm(() => ({
        ...commonBody,
        total_amount_charged: selectedMSI ? displayTotal : totalAmount,
        payment_method_id: selectedPaymentMethodId,
        payment_source: "saved_card",
        ecartpay_order_id: ecartpayOrderId,
        session_data: {
          source: "card-selection",
          payment_method_id: selectedPaymentMethodId,
          total_amount: totalAmount,
          base_amount: baseAmount,
          tip_amount: tipAmount,
        },
      }));

      if (!confirmOutcome.success) {
        showTerminalConfirmError();
        return;
      }

      orderCompletedSuccessfully = true;
      finalizeConfirmedOrder(
        confirmOutcome.order,
        `pick-go-${confirmOutcome.order.id}`,
        confirmOutcome.order.id,
        selectedPM?.lastFourDigits || "****",
        selectedPM?.cardBrand || "unknown",
        selectedPaymentMethodId,
      );
    } catch (error) {
      console.error("Payment/Order error:", error);
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
    navigateWithRestaurantId(
      `/add-card?amount=${totalAmount}&baseAmount=${baseAmount}&scan=false`,
    );
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
      return totalAmount;
    }

    // Obtener el tipo de tarjeta seleccionada
    const selectedMethod = paymentMethods.find(
      (pm) => pm.id === selectedPaymentMethodId,
    );
    const cardBrand = selectedMethod?.cardBrand;

    const msiOptions = cardBrand === "amex" ? msiConfig.amex : msiConfig.visaMc;

    // Encontrar la opción seleccionada
    const selectedOption = msiOptions.find((opt) => opt.months === selectedMSI);
    if (!selectedOption) return totalAmount;

    // Calcular total con financiamiento e IVA (fórmula EcartPay: markup sobre monto final)
    return totalAmount / (1 - (selectedOption.rate / 100) * 1.16);
  };

  const displayTotal = getDisplayTotal();

  // Calcular si está bajo el mínimo usando el total con propina, comisiones, etc.
  const isUnderMinimum = totalAmount < MINIMUM_AMOUNT;

  if (isLoadingInitial || isLoadingProvider) {
    return (
      <div className="min-h-dvh brand-evergreen flex flex-col">
        <div className="fixed top-0 left-0 right-0 z-50">
          <MenuHeaderBack />
        </div>
        <div className="h-20" />

        <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col">
          {/* Título skeleton */}
          <div className="bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
            <div className="py-6 px-8 flex flex-col justify-center">
              <div className="h-8 w-3/4 bg-white/20 rounded-full mt-2 mb-6 animate-pulse" />
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="bg-white rounded-t-4xl flex-1 flex flex-col px-8 overflow-hidden z-10">
              <div
                className={`flex-1 overflow-y-auto py-8 pb-[120px] flex flex-col gap-4`}
              >
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

  return (
    <>
      {/* Banner de alta demanda */}
      {showHighDemandBanner && (
        <HighDemandBanner onDismiss={() => setShowHighDemandBanner(false)} />
      )}

      {/* Animación de orden completada - fuera del contenedor principal para Safari */}
      {showAnimation && (
        <OrderAnimation
          userName={completedUserName}
          orderedItems={completedOrderItems}
          orderId={completedOrderId}
          onTimeout={handleConfirmTimeout}
          onContinue={() => {
            //console.log("🔍 DEBUG - completedOrderId state:", completedOrderId);

            // PRIORIDAD 1: Intentar obtener desde sessionStorage directamente
            let orderId = sessionStorage.getItem("even-current-order-id");

            if (orderId) {
            } else {
              // PRIORIDAD 2: Usar el estado si está disponible
              orderId = completedOrderId;

              if (orderId) {
                //console.log("✅ Using completedOrderId from state:", orderId);
              } else {
                // PRIORIDAD 3: Buscar en sessionStorage por payment-success keys
                /*console.log(
                  "⚠️ completedOrderId is null, searching in sessionStorage...",
                );*/
                for (let i = 0; i < sessionStorage.length; i++) {
                  const key = sessionStorage.key(i);
                  if (key && key.startsWith("even-payment-success-")) {
                    try {
                      const data = sessionStorage.getItem(key);
                      if (data) {
                        const parsed = JSON.parse(data);
                        orderId = parsed.orderId;
                        /*console.log(
                          "📦 Found orderId from sessionStorage key:",
                          key,
                          "orderId:",
                          orderId,
                        );*/
                        break;
                      }
                    } catch (e) {
                      console.error("Error parsing sessionStorage data:", e);
                    }
                  }
                }

                // PRIORIDAD 4: Último intento en localStorage
                if (!orderId) {
                  //console.log("⚠️ Still no orderId, trying localStorage...");
                  const paymentData = localStorage.getItem(
                    "even-completed-payment",
                  );
                  if (paymentData) {
                    try {
                      const parsed = JSON.parse(paymentData);
                      orderId = parsed.orderId;
                      /*console.log(
                        "📦 Found orderId from localStorage:",
                        orderId,
                      );*/
                    } catch (e) {
                      console.error("Error parsing payment data:", e);
                    }
                  }
                }
              }
            }

            //console.log("🔍 Final orderId for navigation:", orderId);

            // Si no hay orderId válido, no navegar (hubo un error en el proceso)
            if (!orderId || orderId === "unknown") {
              /*console.log(
                "❌ No valid orderId found, not navigating to payment-success",
              );*/
              return;
            }

            navigateWithRestaurantId(
              `/payment-success?orderId=${orderId}&success=true`,
              { replace: true },
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
              Verificando tu pago…
            </h2>
            <p className="text-sm text-gray-500 max-w-xs">
              Esto puede tardar unos segundos. No cierres ni recargues esta
              pantalla.
            </p>
          </div>
        </div>
      )}

      <div className="min-h-dvh brand-evergreen flex flex-col">
        {/* Header fijo */}
        <MenuHeaderBack />

        {/* Contenido de página (flujo normal, scrolleable) */}
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
              <div className={`flex-1 overflow-y-auto py-8 pb-[120px]`}>
                {/* Resumen compacto del pedido */}
                <div className="mb-3 space-y-2">
                  <div className="flex justify-between items-center text-base font-medium text-black">
                    <span>{tc("subtotal")}</span>
                    <span>${cartBaseAmount.toFixed(2)} MXN</span>
                  </div>
                  {accountDiscount && orderDiscountAmount > 0 && (
                    <div className="flex justify-between items-center text-base font-medium text-even-evergreen">
                      <span>
                        {tc("discount")} ({accountDiscount.discountPercentage}%)
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

                {/* Comisión e IVA */}
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
                    const selectedMethod = paymentMethods.find(
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

                {/* Métodos de pago guardados */}
                <div className="mb-2.5">
                  <h3 className="text-black font-medium mb-3">
                    {t("paymentMethodsLabel")}
                  </h3>
                  <div className="space-y-2.5">
                    {paymentMethods.map((method) => (
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
                              •••• {method.lastFourDigits}
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

                        {/* Delete Button */}
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
                      </div>
                    ))}

                    {walletOrderRejected && (
                      <p className="text-sm text-gray-600 text-center">
                        {t("walletUnavailableMessage")}
                      </p>
                    )}

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
                                {""}
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
                              {/* Google "G" logo */}
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

        {/* Barra inferior fija — total + botón pagar */}
        <div className="fixed bottom-0 left-0 right-0 bg-white mx-4 px-8 z-90 py-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <button
            onClick={handleInitiatePayment}
            disabled={isProcessing || !selectedPaymentMethodId}
            className={`py-3 text-even-evergreen rounded-full cursor-pointer font-normal h-fit w-full flex items-center justify-center text-base active:scale-95 transition-transform ${
              isProcessing || !selectedPaymentMethodId
                ? "bg-even-grass opacity-50 cursor-not-allowed px-10"
                : "bg-even-grass px-10 animate-pulse-button"
            }`}
          >
            {isProcessing ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>{t("processingCta")}</span>
              </div>
            ) : !selectedPaymentMethodId ? (
              t("selectCardCta")
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
                  const selectedMethod = paymentMethods.find(
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
                          (option) => totalAmount >= option.minAmount,
                        );
                        const hasUnavailableOptions =
                          availableOptions.length < msiOptions.length;
                        const minAmountNeeded = msiOptions[0]?.minAmount || 0;

                        return (
                          <>
                            {availableOptions.map((option) => {
                              // Calcular total con financiamiento e IVA (fórmula EcartPay: markup sobre monto final)
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

              {/* Footer con botón de confirmar */}
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
                <p className="text-black mb-4">{t("totalBreakdownIntro")}</p>
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
          className="fixed inset-0 z-[99999] flex items-end justify-center bg-black/50"
          onClick={() => {
            // Cerrar el modal no cambia si es seguro
            // recobrar — eso ya lo decidió el código que lo abrió
            // (showTerminalConfirmError u otro punto de salida).
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
                  // recobrar — eso ya lo decidió el código que lo abrió
                  // (showTerminalConfirmError u otro punto de salida).
                  setErrorMessage(null);
                  setErrorTitle(t("processingError"));
                }}
                className="w-full bg-even-grass text-even-evergreen py-3 rounded-full text-base"
              >
                {canRetryCharge ? t("tryAgainCta") : "Entendido"}
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
