"use client";

import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useNavigation } from "../../../hooks/useNavigation";
import { usePrepCountdown } from "../../../hooks/usePrepCountdown";
import { useGuest, useIsGuest } from "../../../context/GuestContext";
import { useRestaurant } from "../../../context/RestaurantContext";
import { useBranch } from "../../../context/BranchContext";
import { authService } from "../../../services/auth.service";
import {
  Receipt,
  X,
  Calendar,
  Utensils,
  CircleAlert,
  RefreshCw,
  Loader2,
  Clock,
  ChevronLeft,
  ChevronRight,
  FileText,
  Download,
} from "lucide-react";
import { getCardTypeIcon } from "../../../utils/cardIcons";
import { useAuth } from "../../../context/AuthContext";
import {
  pickAndGoService,
  type ActiveOrderResponse,
  type PickAndGoItem,
  type PickAndGoOrder,
} from "../../../services/pickandgo.service";
import InvoiceModal from "../../../components/modals/InvoiceModal";
import OrderNotificationModal from "@/components/modals/OrderNotificationModal";
import { invoiceService } from "../../../services/invoice.service";
import { ticketService } from "../../../services/ticket.service";
import { lockScroll, unlockScroll } from "../../../utils/scrollLock";
import { useModalBackClose } from "@/hooks/useModalBackClose";
import ItemCustomizations from "@/components/ItemCustomizations";

const ReorderModal = lazy(
  () => import("../../../components/modals/ReorderModal"),
);

export default function PaymentSuccessPage() {
  const t = useTranslations("PaymentSuccessPage");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const params = useParams();
  const { setRestaurantId } = useRestaurant();
  const restaurantId = params?.restaurantId as string;

  // Estado modal notificacion pedido
  const [showOrderNotificationModal, setShowOrderNotificationModal] =
    useState(false);

  useEffect(() => {
    if (restaurantId && !isNaN(parseInt(restaurantId))) {
      setRestaurantId(parseInt(restaurantId));
    }
  }, [restaurantId, setRestaurantId]);

  const { navigateWithRestaurantId, branchNumber } = useNavigation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isGuest = useIsGuest();
  const { guestId } = useGuest();
  const { fetchBranches } = useBranch();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  // Get payment details from URL or localStorage
  const paymentId =
    searchParams.get("paymentId") || searchParams.get("orderId");
  const urlAmount = parseFloat(searchParams.get("amount") || "0");

  // Try to get stored payment details
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [ordersMarkedAsPaid, setOrdersMarkedAsPaid] = useState(false);
  const [rating, setRating] = useState(0); // Rating de 1 a 5 (solo enteros)
  const [hoveredRating, setHoveredRating] = useState(0);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [hasRated, setHasRated] = useState(false); // Track if user has already rated
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [reorderItems, setReorderItems] = useState<PickAndGoItem[]>([]);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(
    null,
  );
  const [isDownloadingTicket, setIsDownloadingTicket] = useState(false);

  const handleDownloadTicket = async () => {
    const transactionId =
      paymentDetails?.transactionId || paymentDetails?.paymentId || paymentId;
    if (!transactionId || isDownloadingTicket) return;
    setIsDownloadingTicket(true);
    try {
      const blob = await ticketService.downloadTicketPdf(transactionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ticket-${transactionId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore
    } finally {
      setIsDownloadingTicket(false);
    }
  };

  // No abrir el modal si el usuario viene de auth redirect
  const cameFromAuth =
    typeof window !== "undefined" &&
    sessionStorage.getItem("even-post-auth-redirect");
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  // Abrir el modal de registro solo cuando la auth terminó de cargar
  // y confirmamos que NO hay sesión (evita el flash al recargar)
  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated && !cameFromAuth) {
      setIsRegisterModalOpen(true);
    }
  }, [isAuthLoading, isAuthenticated, cameFromAuth]);

  const { restaurant } = useRestaurant();

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

  // Limpiar el flag de redirect después de cargar
  useEffect(() => {
    if (cameFromAuth) {
      sessionStorage.removeItem("even-post-auth-redirect");
    }
  }, [cameFromAuth]);

  // El pago ya se realizó: no debe ser posible regresar con el back
  // button/gesto nativo a card-selection, order-confirm o auth-selection.
  // Cualquier intento de ir atrás desde acá redirige al menú.
  const navigateWithRestaurantIdRef = useRef(navigateWithRestaurantId);
  navigateWithRestaurantIdRef.current = navigateWithRestaurantId;

  // Capa base del stack de useModalBackClose: así cerrar un modal (X/backdrop)
  // no dispara esta redirección, y el back con un modal abierto solo lo cierra.
  useModalBackClose(true, () =>
    navigateWithRestaurantIdRef.current("/menu", { replace: true }),
  );

  // Handler for sign up navigation
  const handleSignUp = () => {
    // Save the current URL to redirect back after registration
    const currentUrl = window.location.pathname + window.location.search;
    sessionStorage.setItem("even-post-auth-redirect", currentUrl);

    // Navigate to auth page
    navigateWithRestaurantId("/auth");
  };

  useEffect(() => {
    if (isTicketModalOpen) {
      lockScroll();
      return unlockScroll;
    }
  }, [isTicketModalOpen]);

  useEffect(() => {
    if (isBreakdownModalOpen) {
      lockScroll();
      return unlockScroll;
    }
  }, [isBreakdownModalOpen]);

  useEffect(() => {
    if (isStatusModalOpen) {
      lockScroll();
      return unlockScroll;
    }
  }, [isStatusModalOpen]);

  useEffect(() => {
    if (isRegisterModalOpen) {
      lockScroll();
      return unlockScroll;
    }
  }, [isRegisterModalOpen]);

  useEffect(() => {
    if (showOrderNotificationModal) {
      lockScroll();
      return unlockScroll;
    }
  }, [showOrderNotificationModal]);

  // Cargar branches cuando el restaurante esté disponible
  useEffect(() => {
    if (restaurantId) {
      fetchBranches(parseInt(restaurantId));
    }
  }, [restaurantId, fetchBranches]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Get payment ID from URL to identify this specific payment
      const urlPaymentId = paymentId || searchParams.get("transactionId");

      // First check sessionStorage with payment ID (persistent on reload)
      const sessionKey = urlPaymentId
        ? `even-payment-success-${urlPaymentId}`
        : "even-payment-success";

      let storedPayment = sessionStorage.getItem(sessionKey);
      let storageKey = sessionKey;
      let fromSession = true;

      // If not in sessionStorage, check localStorage (first time)
      if (!storedPayment) {
        fromSession = false;

        // Check for completed payment first (most recent flow)
        storedPayment = localStorage.getItem("even-completed-payment");
        storageKey = "even-completed-payment";

        // Check for pending payment (EcartPay redirect flow)
        if (!storedPayment) {
          storedPayment = localStorage.getItem("even-pending-payment");
          storageKey = "even-pending-payment";
        }

        // Check for payment intent (SDK flow)
        if (!storedPayment) {
          storedPayment = localStorage.getItem("even-payment-intent");
          storageKey = "even-payment-intent";
        }
      }

      if (storedPayment) {
        try {
          const parsed = JSON.parse(storedPayment);
          setPaymentDetails(parsed);

          // If from localStorage (first time), save to sessionStorage for persistence
          if (!fromSession) {
            // Save with unique key based on payment/transaction ID
            const paymentIdentifier =
              parsed.paymentId ||
              parsed.transactionId ||
              urlPaymentId ||
              Date.now().toString();
            const uniqueKey = `even-payment-success-${paymentIdentifier}`;

            sessionStorage.setItem(uniqueKey, storedPayment);

            // Also save the current payment key reference
            sessionStorage.setItem("even-current-payment-key", uniqueKey);

            // Clean up localStorage
            localStorage.removeItem("even-pending-payment");
            localStorage.removeItem("even-payment-intent");
            localStorage.removeItem("even-completed-payment");

            // Clear all session data after successful payment
            clearGuestSession();
          }
        } catch (e) {
          console.error("Failed to parse stored payment details:", e);
        }
      } else {
      }
    }
  }, [paymentId, searchParams]);

  useEffect(() => {
    if (!paymentDetails) return;

    setShowOrderNotificationModal(true);
  }, [paymentDetails]);

  const clearGuestSession = async () => {
    if (typeof window !== "undefined") {
      // Use authService to clear all session data (auth + guest)
      authService.clearAllSessionData();

      // Also clear any additional payment-related data
      localStorage.removeItem("even-pending-payment");

      // For guest users, also cleanup eCartPay data
      if (isGuest && guestId) {
        try {
          await fetch("/api/payments/cleanup-guest", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              guestId: guestId,
            }),
          });
        } catch (error) {
          console.error("Failed to cleanup guest eCartPay data:", error);
        }
      }
    }
  };

  // Calculate total amount charged to client
  const amount =
    paymentDetails?.totalAmountCharged || paymentDetails?.amount || urlAmount;

  // Estado para dish orders (obtenidos del backend) — usado por el ticket modal
  const [dishOrders, setDishOrders] = useState<any[]>([]);
  // Estado para la fecha de creación del pedido
  const [orderCreatedAt, setOrderCreatedAt] = useState<Date | null>(null);
  // Estado para el folio del pedido
  const [orderFolio, setOrderFolio] = useState<string | null>(null);

  // Estado para todas las órdenes activas — usado por el status modal
  const [activeOrders, setActiveOrders] = useState<
    NonNullable<ActiveOrderResponse["data"]>[]
  >([]);
  const [activeOrderIndex, setActiveOrderIndex] = useState(0);
  const activeOrder = activeOrders[activeOrderIndex] ?? null;

  const { secondsLeft, extraMinutesAdded } = usePrepCountdown(
    activeOrder?.pick_and_go_order?.created_at ?? "",
    activeOrder?.pick_and_go_order?.prep_time_minutes ?? 15,
    activeOrder?.pick_and_go_order?.cooking_status ?? "idle",
  );

  // Función para obtener dish orders desde el backend
  const fetchDishOrders = async () => {
    let orderId = paymentId || paymentDetails?.orderId;

    if (!orderId) {
      const clientId = user?.id || guestId;
      if (clientId && restaurantId) {
        try {
          const lastOrders = await pickAndGoService.getUserOrders(clientId, {
            limit: 1,
            restaurant_id: parseInt(restaurantId),
          });
          if (lastOrders.success && lastOrders.data?.length) {
            orderId = lastOrders.data[0].id;
          }
        } catch {
          // si falla, caemos al storage
        }
      }
    }

    if (!orderId) {
      setDishOrders(paymentDetails?.dishOrders || []);
      if (paymentDetails?.createdAt) {
        setOrderCreatedAt(new Date(paymentDetails.createdAt));
      }
      return;
    }

    try {
      const response = await pickAndGoService.getOrder(orderId);

      if (response.success && response.data) {
        if (response.data.created_at) {
          setOrderCreatedAt(new Date(response.data.created_at));
        }

        if (response.data.folio) {
          setOrderFolio(response.data.folio);
        }

        if (response.data.items) {
          setReorderItems(
            response.data.items.filter((d: any) => d.menu_item_id),
          );
          const transformedItems = response.data.items.map((item: any) => ({
            dish_order_id: item.id,
            item: item.item,
            quantity: item.quantity,
            price: item.price,
            extra_price: item.extra_price || 0,
            total_price: item.price * item.quantity + (item.extra_price || 0),
            guest_name: item.guest_name,
            custom_fields: item.custom_fields,
            image_url: item.images?.[0] || null,
            status: item.status || "preparing",
          }));
          setDishOrders(transformedItems);
        }
      } else {
        setDishOrders(paymentDetails?.dishOrders || []);
        if (paymentDetails?.createdAt) {
          setOrderCreatedAt(new Date(paymentDetails.createdAt));
        }
      }
    } catch (error) {
      console.error("❌ Error fetching order details:", error);
      setDishOrders(paymentDetails?.dishOrders || []);
      if (paymentDetails?.createdAt) {
        setOrderCreatedAt(new Date(paymentDetails.createdAt));
      }
    }
  };

  // Cargar dish orders al inicio
  useEffect(() => {
    fetchDishOrders();
  }, [paymentId, paymentDetails]);

  // Función para refrescar los dish orders
  const handleRefreshOrders = async () => {
    setIsRefreshing(true);
    await fetchDishOrders();
    setIsRefreshing(false);
  };

  // Convierte la respuesta de getOrder() al shape que espera el Status Modal
  const mapOrderToActiveOrderData = (
    order: PickAndGoOrder,
  ): NonNullable<ActiveOrderResponse["data"]> => ({
    pick_and_go_order: {
      id: order.id,
      folio: order.folio ?? null,
      clerk_user_id: order.clerk_user_id ?? null,
      customer_name: order.customer_name,
      total_amount: order.total_amount,
      payment_status: order.payment_status,
      order_status: order.order_status,
      cooking_status: order.cooking_status,
      restaurant_id: order.restaurant_id,
      branch_number: order.branch_number,
      created_at: order.created_at,
      prep_time_minutes: order.prep_metadata?.prep_time_minutes ?? 15,
    },
    dishes: (order.items || []).map((item) => ({
      id: item.id,
      item: item.item,
      quantity: item.quantity,
      price: item.price,
      status: item.status,
      payment_status: item.payment_status,
      images: item.images,
    })),
    pending_dishes_count: (order.items || []).filter(
      (item) => item.status !== "delivered",
    ).length,
  });

  // Cargar órdenes activas para el status modal
  const fetchActiveOrders = async () => {
    const clientId = user?.id || guestId;
    try {
      if (clientId && restaurantId) {
        const response: any = await pickAndGoService.getActiveOrderByUser(
          clientId,
          parseInt(restaurantId),
        );
        if (response.hasActiveOrder && response.orders?.length > 0) {
          setActiveOrders(response.orders);
          setActiveOrderIndex((prev) =>
            prev < response.orders.length ? prev : 0,
          );
          return;
        }
      }

      // Fallback: "active orders by user" puede no encontrar la orden
      // (sesión de guest limpiada tras el pago, o la orden ya no está
      // "activa"), aunque sabemos exactamente cuál orden es por el URL.
      const orderId = paymentId || paymentDetails?.orderId;
      if (orderId) {
        const orderResponse = await pickAndGoService.getOrder(orderId);
        if (orderResponse.success && orderResponse.data) {
          setActiveOrders([mapOrderToActiveOrderData(orderResponse.data)]);
          setActiveOrderIndex(0);
          return;
        }
      }

      setActiveOrders([]);
    } catch (error) {
      console.error("Error fetching active orders:", error);
    }
  };

  useEffect(() => {
    fetchActiveOrders();
  }, [user?.id, guestId, restaurantId]);

  // Check if a factura already exists for this transaction
  useEffect(() => {
    const transactionId =
      paymentDetails?.transactionId || paymentDetails?.paymentId || paymentId;
    if (!transactionId) return;
    invoiceService
      .getTransactionInvoice(transactionId)
      .then((info) => {
        if (info?.invoiceId) setExistingInvoiceId(info.invoiceId);
      })
      .catch(() => {});
  }, [paymentDetails, paymentId]);

  // Auto-poll while the active order is still being prepared
  useEffect(() => {
    const hasPreparing = activeOrders.some(
      (o) => o.pick_and_go_order?.cooking_status === "preparing",
    );
    if (!hasPreparing) return;
    const id = setInterval(fetchActiveOrders, 10_000);
    return () => clearInterval(id);
  }, [activeOrders]);

  const handleRefreshStatus = async () => {
    setIsRefreshing(true);
    await fetchActiveOrders();
    setIsRefreshing(false);
  };

  const handleBackToMenu = () => {
    // Clear payment success data from sessionStorage
    const currentKey = sessionStorage.getItem("even-current-payment-key");
    if (currentKey) {
      sessionStorage.removeItem(currentKey);
      sessionStorage.removeItem("even-current-payment-key");
    }
    // Fallback: also remove generic key
    sessionStorage.removeItem("even-payment-success");

    // Since session is cleared, redirect to home page to select table again
    router.push("/");
  };

  const handleGoHome = () => {
    // Clear payment success data from sessionStorage
    const currentKey = sessionStorage.getItem("even-current-payment-key");
    if (currentKey) {
      sessionStorage.removeItem(currentKey);
      sessionStorage.removeItem("even-current-payment-key");
    }
    // Fallback: also remove generic key
    sessionStorage.removeItem("even-payment-success");

    // Complete exit - go to menu for Pick & Go
    navigateWithRestaurantId("/menu");
  };

  const handleReorder = () => {
    if (!reorderItems.length) return;
    setShowReorderModal(true);
  };

  return (
    <div className="min-h-dvh overflow-hidden brand-evergreen flex flex-col">
      <div>
        {/* Modal notificacion pedido */}
        {showOrderNotificationModal && (
          <OrderNotificationModal
            onDismiss={() => setShowOrderNotificationModal(false)}
          />
        )}
      </div>

      {/* Success Icon */}
      <div className="flex-1 flex justify-center items-center">
        <img
          src="/even/even-asterisk-grass.svg"
          alt="Even"
          className="size-20 md:size-28 lg:size-32 animate-logo-fade-in"
        />
      </div>

      <div className="px-4 md:px-6 lg:px-8 w-full animate-slide-up">
        <div className="flex-1 flex flex-col">
          <div className="left-4 right-4 bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
            <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center items-center mb-6 md:mb-8 lg:mb-10 mt-2 md:mt-4 lg:mt-6 gap-2 md:gap-3 lg:gap-4">
              <h1 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight">
                {t("heroTitle")}
              </h1>
              <p className="text-white text-base md:text-lg lg:text-xl">
                {t("heroSubtitle")}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-t-4xl relative z-10 flex flex-col min-h-80 justify-center px-6 md:px-8 lg:px-10 flex-1">
            {/* Action Buttons */}
            <div
              className="space-y-3 md:space-y-4 lg:space-y-5"
              style={{
                paddingBottom: "max(0rem, env(safe-area-inset-bottom))",
              }}
            >
              {/* Reordenar btn */}
              <button
                onClick={handleReorder}
                disabled={!reorderItems.length}
                className="w-full flex items-center justify-center gap-2 md:gap-3 lg:gap-4 text-even-evergreen py-3 md:py-4 lg:py-5 rounded-full cursor-pointer transition-all active:scale-90 bg-even-grass text-base md:text-lg lg:text-xl disabled:opacity-70 animate-pulse-button font-medium"
              >
                <RefreshCw
                  className="size-5 md:size-6 lg:size-7"
                  strokeWidth={2.5}
                />
                {tc("reorderCta")}
              </button>

              <button
                onClick={handleGoHome}
                className="w-full text-even-evergreen py-3 md:py-4 lg:py-5 rounded-full cursor-pointer transition-all active:scale-90 bg-even-grass text-base md:text-lg lg:text-xl"
              >
                {t("goToMenuCta")}
              </button>

              {/* Facturar btn */}
              {restaurant?.billing_enabled !== false && (
                <button
                  onClick={() => setIsInvoiceModalOpen(true)}
                  className="text-base md:text-lg lg:text-xl w-full flex items-center justify-center gap-2 md:gap-3 lg:gap-4 text-black border border-black py-3 md:py-4 lg:py-5 rounded-full cursor-pointer transition-all active:scale-90 bg-white hover:bg-stone-100"
                >
                  <FileText
                    className="size-5 md:size-6 lg:size-7"
                    strokeWidth={1.5}
                  />
                  {existingInvoiceId ? t("viewInvoiceCta") : tc("invoiceCta")}
                </button>
              )}

              {/* Ticket btn */}
              <button
                onClick={() => setIsTicketModalOpen(true)}
                className="text-base md:text-lg lg:text-xl w-full flex items-center justify-center gap-2 md:gap-3 lg:gap-4 text-black border border-black py-3 md:py-4 lg:py-5 rounded-full cursor-pointer transition-all active:scale-90 bg-white hover:bg-stone-100"
              >
                <Receipt
                  className="size-5 md:size-6 lg:size-7"
                  strokeWidth={1.5}
                />
                {t("viewReceiptCta")}
              </button>

              {/* Status btn */}
              <button
                onClick={() => setIsStatusModalOpen(true)}
                className="text-base md:text-lg lg:text-xl w-full flex items-center justify-center gap-2 md:gap-3 lg:gap-4 text-black border border-black py-3 md:py-4 lg:py-5 rounded-full cursor-pointer transition-all active:scale-90 bg-white hover:bg-stone-100"
              >
                <Calendar
                  className="size-5 md:size-6 lg:size-7"
                  strokeWidth={1.5}
                />
                {t("viewStatusCta")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        transactionId={
          paymentDetails?.transactionId ||
          paymentDetails?.paymentId ||
          paymentId ||
          ""
        }
        restaurantId={restaurant?.id ?? 0}
        isAuthenticated={isAuthenticated}
        existingInvoiceId={existingInvoiceId}
        onInvoiceCreated={(id) => setExistingInvoiceId(id)}
      />

      {/* Ticket Modal */}
      {isTicketModalOpen && (
        <div
          className="fixed inset-0 bg-black/25 backdrop-blur-xs z-999 flex items-center justify-center"
          onClick={() => setIsTicketModalOpen(false)}
        >
          <div
            className="bg-even-evergreen/80 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] w-full mx-4 md:mx-12 lg:mx-28 rounded-4xl z-999 max-h-[77vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex justify-end flex-shrink-0">
              <button
                onClick={() => setIsTicketModalOpen(false)}
                className="p-2 md:p-3 lg:p-4 hover:bg-white/10 rounded-lg md:rounded-xl transition-colors justify-end flex items-end mt-3 md:mt-4 lg:mt-5 mr-3 md:mr-4 lg:mr-5"
              >
                <X className="w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 text-white" />
              </button>
            </div>

            {/* Header */}
            <div className="px-6 md:px-8 lg:px-10 flex items-center justify-center mb-4 md:mb-5 lg:mb-6 flex-shrink-0">
              <div className="flex flex-col justify-center items-center gap-3 md:gap-4 lg:gap-5">
                {restaurant?.logo_url ? (
                  <img
                    src={restaurant.logo_url}
                    alt={restaurant.name}
                    className="size-20 md:size-24 lg:size-28 object-cover rounded-lg md:rounded-xl"
                  />
                ) : (
                  <Receipt className="size-20 md:size-24 lg:size-28 text-white" />
                )}
                <div className="flex flex-col items-center justify-center">
                  <h2 className="text-xl md:text-2xl lg:text-3xl text-white font-bold">
                    {restaurant?.name}
                  </h2>
                  <p className="text-sm md:text-base lg:text-lg text-white/80">
                    Pick & Go
                  </p>
                  <p className="text-xs md:text-sm text-white/70 mt-1">
                    {format.dateTime(orderCreatedAt || new Date(), {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="px-6 md:px-8 lg:px-10 space-y-4 md:space-y-5 lg:space-y-6 overflow-y-auto flex-1 min-h-0">
              {/* Order Info */}
              <div className="border-t border-white/20 pt-4 md:pt-5 lg:pt-6">
                <h3 className="font-medium text-xl md:text-2xl lg:text-3xl text-white mb-3 md:mb-4 lg:mb-5">
                  {t("paymentDetailsTitle")}
                </h3>
                <div className="space-y-2 md:space-y-3 lg:space-y-4">
                  {paymentDetails?.userName && (
                    <div className="flex items-center gap-2 md:gap-3 lg:gap-4 text-white/90">
                      <div className="bg-orange-100 p-2 md:p-2.5 lg:p-3 rounded-xl flex items-center justify-center">
                        <Utensils className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-orange-600" />
                      </div>
                      <span className="text-sm md:text-base lg:text-lg">
                        {paymentDetails.userName}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 md:gap-3 lg:gap-4 text-white/90">
                    <div className="bg-blue-100 p-2 md:p-2.5 lg:p-3 rounded-xl flex items-center justify-center">
                      <Calendar className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-blue-600" />
                    </div>
                    <span className="text-sm md:text-base lg:text-lg">
                      {format.dateTime(orderCreatedAt || new Date(), {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                      })}
                    </span>
                  </div>
                  {paymentDetails?.cardLast4 && (
                    <div className="flex items-center gap-2 md:gap-3 lg:gap-4 text-white/90">
                      <div className="bg-green-100 p-2 md:p-2.5 lg:p-3 rounded-xl flex items-center justify-center">
                        <div className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 flex items-center justify-center scale-150">
                          {getCardTypeIcon(
                            paymentDetails.cardBrand || "unknown",
                            "medium",
                          )}
                        </div>
                      </div>
                      <span className="text-sm md:text-base lg:text-lg">
                        {paymentDetails.cardBrand === "apple"
                          ? "Apple Pay"
                          : paymentDetails.cardBrand === "google"
                            ? "Google Pay"
                            : `**** ${paymentDetails.cardLast4.slice(-4)}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Order Items */}
              {dishOrders.length > 0 && (
                <div className="border-t border-white/20 py-4 md:py-5 lg:py-6">
                  <h3 className="font-medium text-xl md:text-2xl lg:text-3xl text-white mb-3 md:mb-4 lg:mb-5">
                    {tc("orderItems")}
                  </h3>
                  <div className="space-y-3 md:space-y-4 lg:space-y-5">
                    {dishOrders.map((dish: any, index: number) => (
                      <div
                        key={dish.dish_order_id || index}
                        className="flex items-center gap-3 md:gap-4 lg:gap-5"
                      >
                        {dish.image_url && (
                          <img
                            src={dish.image_url}
                            alt={dish.item}
                            className="w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-lg object-cover"
                          />
                        )}
                        <div className="flex-1">
                          <p className="text-white font-medium text-base md:text-lg lg:text-xl">
                            {dish.quantity}x {dish.item}
                          </p>
                          <ItemCustomizations
                            customFields={dish.custom_fields}
                            variant="dark"
                            className="mt-0.5"
                          />
                          {dish.guest_name && (
                            <p className="text-xs md:text-sm lg:text-base font-semibold text-white/80 uppercase">
                              {dish.guest_name}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-white font-medium text-base md:text-lg lg:text-xl">
                            ${dish.total_price?.toFixed(2) || "0.00"} MXN
                          </p>
                        </div>
                      </div>
                    ))}

                    {/* Propina como item */}
                    {paymentDetails?.tipAmount > 0 && (
                      <div className="flex justify-between items-start gap-3 md:gap-4 lg:gap-5 pt-3 md:pt-4 lg:pt-5">
                        <div className="flex-1">
                          <p className="text-white font-medium text-base md:text-lg lg:text-xl">
                            {tc("tip")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-white font-medium text-base md:text-lg lg:text-xl">
                            ${paymentDetails.tipAmount.toFixed(2)} MXN
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Total Summary with Info Button */}
            <div className="px-6 md:px-8 lg:px-10 flex-shrink-0">
              <div className="flex justify-between items-center border-t border-white/20 pt-4 md:pt-5 lg:pt-6 mb-2">
                <div className="flex items-center gap-2 md:gap-3 lg:gap-4">
                  <span className="text-lg md:text-xl lg:text-2xl font-medium text-white">
                    {t("totalLabel")}
                  </span>
                  <button
                    onClick={() => setIsBreakdownModalOpen(true)}
                    className="p-1 hover:bg-white/10 rounded-full transition-colors"
                    aria-label={t("viewBreakdownAlt")}
                  >
                    <CircleAlert
                      className="size-4 md:size-5 lg:size-6 cursor-pointer text-white/70"
                      strokeWidth={2.3}
                    />
                  </button>
                </div>
                {paymentDetails?.installments ? (
                  <span className="text-lg md:text-xl lg:text-2xl font-medium text-white">
                    {paymentDetails.installments}x $
                    {(amount / paymentDetails.installments).toFixed(2)} MXN
                  </span>
                ) : (
                  <span className="text-lg md:text-xl lg:text-2xl font-medium text-white">
                    ${amount.toFixed(2)} MXN
                  </span>
                )}
              </div>
              <button
                onClick={handleDownloadTicket}
                className="w-full flex items-center justify-center gap-2 border border-white/30 text-white rounded-2xl py-3 md:py-4 text-sm md:text-base hover:bg-white/10 transition-colors mb-6 md:mb-8 lg:mb-10"
              >
                {isDownloadingTicket ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {t("downloadTicketCta")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Breakdown Modal */}
      {isBreakdownModalOpen && (
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{ zIndex: 99999 }}
        >
          {/* Fondo */}
          <div
            className="absolute inset-0 bg-black/25"
            onClick={() => setIsBreakdownModalOpen(false)}
          ></div>

          {/* Modal */}
          <div className="relative bg-white rounded-t-4xl w-full mx-4 md:mx-6 lg:mx-8">
            {/* Titulo */}
            <div className="px-6 md:px-8 lg:px-10 pt-4 md:pt-6 lg:pt-8">
              <div className="flex items-center justify-between pb-4 md:pb-5 lg:pb-6 border-b border-stroke">
                <h3 className="text-lg md:text-xl lg:text-2xl font-semibold text-black">
                  {t("breakdownTitle")}
                </h3>
                <button
                  onClick={() => setIsBreakdownModalOpen(false)}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
                >
                  <X className="size-5 md:size-6 lg:size-7 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Contenido */}
            <div className="px-6 md:px-8 lg:px-10 py-4 md:py-6 lg:py-8">
              <p className="text-black text-base md:text-lg lg:text-xl mb-4 md:mb-5 lg:mb-6">
                {t("breakdownIntro")}
              </p>
              <div className="space-y-3 md:space-y-4 lg:space-y-5">
                {paymentDetails?.baseAmount && (
                  <div className="flex justify-between items-center">
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      {t("consumptionLabel")}
                    </span>
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      ${paymentDetails.baseAmount.toFixed(2)} MXN
                    </span>
                  </div>
                )}

                {paymentDetails?.tipAmount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      {t("tipLabelPrefix")}
                    </span>
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      ${paymentDetails.tipAmount.toFixed(2)} MXN
                    </span>
                  </div>
                )}

                {(paymentDetails?.evenCommissionClient || 0) +
                  (paymentDetails?.ivaEvenClient || 0) >
                  0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      {t("serviceCommissionLabel")}
                    </span>
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      $
                      {(
                        (paymentDetails?.evenCommissionClient || 0) +
                        (paymentDetails?.ivaEvenClient || 0)
                      ).toFixed(2)}{" "}
                      MXN
                    </span>
                  </div>
                )}

                {paymentDetails?.installments && (
                  <div className="flex justify-between items-center">
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      {t("installmentsLabel", {
                        months: paymentDetails.installments,
                      })}
                    </span>
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      $
                      {(
                        (paymentDetails.totalAmountCharged || 0) -
                        (paymentDetails.installmentBaseAmount || 0)
                      ).toFixed(2)}{" "}
                      MXN
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Modal */}
      {isStatusModalOpen && (
        <div
          className="fixed inset-0 bg-black/25 backdrop-blur-xs z-[999] flex items-center justify-center"
          onClick={() => setIsStatusModalOpen(false)}
        >
          <div
            className="relative bg-even-evergreen/80 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] w-full mx-4 md:mx-12 lg:mx-28 rounded-4xl z-[999] max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Flechas de navegación entre órdenes */}
            {activeOrders.length > 1 && (
              <>
                <button
                  onClick={() => setActiveOrderIndex((i) => i - 1)}
                  disabled={activeOrderIndex === 0}
                  className="absolute left-3 md:left-4 top-[30%] z-10 rounded-full size-9 md:size-10 flex items-center justify-center bg-white/10 border border-white/25 hover:bg-white/20 transition-colors active:scale-90 disabled:opacity-25 disabled:pointer-events-none"
                >
                  <ChevronLeft className="size-6 md:size-7 text-white" />
                </button>
                <button
                  onClick={() => setActiveOrderIndex((i) => i + 1)}
                  disabled={activeOrderIndex === activeOrders.length - 1}
                  className="absolute right-3 md:right-4 top-[30%] z-10 rounded-full size-9 md:size-10 flex items-center justify-center bg-white/10 border border-white/25 hover:bg-white/20 transition-colors active:scale-90 disabled:opacity-25 disabled:pointer-events-none"
                >
                  <ChevronRight className="size-6 md:size-7 text-white" />
                </button>
              </>
            )}

            {/* Header */}
            <div className="flex-shrink-0">
              <div className="w-full flex justify-end">
                <button
                  onClick={() => setIsStatusModalOpen(false)}
                  className="p-2 md:p-3 lg:p-4 hover:bg-white/10 rounded-lg md:rounded-xl transition-colors justify-end flex items-end mt-3 md:mt-4 lg:mt-5 mr-3 md:mr-4 lg:mr-5"
                >
                  <X className="w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 text-white" />
                </button>
              </div>
              <div className="px-6 md:px-8 lg:px-10 flex items-center justify-center mb-4 md:mb-5 lg:mb-6">
                <div className="flex flex-col justify-center items-center gap-3 md:gap-4 lg:gap-5">
                  {restaurant?.logo_url ? (
                    <img
                      src={restaurant.logo_url}
                      alt={restaurant?.name}
                      className="size-20 md:size-24 lg:size-28 object-cover rounded-lg md:rounded-xl"
                    />
                  ) : (
                    <Utensils className="size-20 md:size-24 lg:size-28 text-white" />
                  )}
                  <div className="flex flex-col items-center justify-center">
                    <h2 className="text-2xl md:text-3xl lg:text-4xl text-white font-semibold">
                      {tc("orderNumber", {
                        folio: activeOrder?.pick_and_go_order?.folio || "---",
                      })}
                    </h2>
                    <p className="text-base md:text-md lg:text-lg text-white/80 font-medium">
                      {activeOrders.length > 1
                        ? tc("orderIndexOf", {
                            index: activeOrderIndex + 1,
                            count: activeOrders.length,
                          })
                        : activeOrder?.pick_and_go_order?.customer_name ||
                          "Pick & Go"}
                    </p>
                    {activeOrder?.pick_and_go_order?.cooking_status ===
                      "preparing" &&
                      (() => {
                        const prepMins =
                          activeOrder?.pick_and_go_order?.prep_time_minutes ??
                          15;
                        const rangeStart = new Date(
                          new Date(
                            activeOrder?.pick_and_go_order?.created_at ?? "",
                          ).getTime() +
                            prepMins * 60_000,
                        );
                        const rangeEnd = new Date(
                          rangeStart.getTime() + 5 * 60_000,
                        );
                        const fmt = (d: Date) =>
                          `${String(d.getHours()).padStart(2, "0")}:${String(
                            d.getMinutes(),
                          ).padStart(2, "0")}`;
                        return (
                          <div className="flex flex-col items-center gap-1 mt-2">
                            <div className="flex gap-2 items-center px-3 py-1 rounded-full bg-white/10 border border-white/10">
                              <span className="flex gap-1 text-sm text-white/70">
                                {tc("estimatedTime")}
                                <p>
                                  {fmt(rangeStart)} - {fmt(rangeEnd)}
                                </p>
                              </span>
                            </div>
                            {extraMinutesAdded > 0 && (
                              <span className="text-xs font-medium text-green-300 bg-green-500/20 border border-green-400/30 px-2 py-0.5 rounded-full">
                                {tc("extraMinutes", {
                                  minutes: extraMinutesAdded,
                                })}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                  </div>
                </div>
              </div>

              {/* Estatus General - 3 pasos */}
              <div className="px-6 md:px-8 lg:px-10 mb-4 md:mb-5 lg:mb-6">
                <div className="flex items-center justify-center gap-4 md:gap-6 lg:gap-8">
                  <div className="flex flex-col items-center gap-1.5 md:gap-2">
                    <div className="w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-full flex items-center justify-center shadow-xs transition-all duration-300 bg-white border border-green-200">
                      <Clock className="w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 text-green-600" />
                    </div>
                    <span className="text-xs md:text-sm font-medium text-green-100">
                      {tc("statusPreparing")}
                    </span>
                  </div>

                  <div className="flex-1 max-w-12 md:max-w-16 lg:max-w-20 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-white to-green-200"
                      style={{
                        width: (() => {
                          if (
                            activeOrder?.pick_and_go_order?.cooking_status !==
                            "preparing"
                          )
                            return "100%";
                          const prepMins =
                            activeOrder?.pick_and_go_order?.prep_time_minutes ??
                            15;
                          const totalSecs = (prepMins + extraMinutesAdded) * 60;
                          const elapsed = totalSecs - secondsLeft;
                          return `${Math.min(100, Math.max(0, (elapsed / totalSecs) * 100))}%`;
                        })(),
                        transition: "width 1s linear",
                      }}
                    />
                  </div>

                  {/* Listo */}
                  <div className="flex flex-col items-center gap-1.5 md:gap-2">
                    <div
                      className={`w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-full flex items-center justify-center shadow-xs transition-all duration-300 ${
                        (activeOrder?.pick_and_go_order?.cooking_status ??
                          "preparing") === "ready" ||
                        (activeOrder?.pick_and_go_order?.cooking_status ??
                          "preparing") === "delivered"
                          ? "bg-green-100 border border-green-100"
                          : "bg-white/10"
                      }`}
                    >
                      <Utensils
                        className={`w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 ${
                          (activeOrder?.pick_and_go_order?.cooking_status ??
                            "preparing") === "ready" ||
                          (activeOrder?.pick_and_go_order?.cooking_status ??
                            "preparing") === "delivered"
                            ? "text-green-600"
                            : "text-white"
                        }`}
                      />
                    </div>
                    <span
                      className={`text-xs md:text-sm font-medium ${
                        (activeOrder?.pick_and_go_order?.cooking_status ??
                          "preparing") === "ready" ||
                        (activeOrder?.pick_and_go_order?.cooking_status ??
                          "preparing") === "delivered"
                          ? "text-green-100"
                          : "text-white/60"
                      }`}
                    >
                      {tc("statusReady")}
                    </span>
                  </div>

                  <div className="flex-1 max-w-12 md:max-w-16 lg:max-w-20 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        (activeOrder?.pick_and_go_order?.cooking_status ??
                          "preparing") === "delivered"
                          ? "w-full bg-gradient-to-r from-green-200 to-green-300"
                          : "w-0"
                      }`}
                    ></div>
                  </div>

                  {/* Entregado */}
                  <div className="flex flex-col items-center gap-1.5 md:gap-2">
                    <div
                      className={`w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-full flex items-center justify-center shadow-xs transition-all duration-300 ${
                        (activeOrder?.pick_and_go_order?.cooking_status ??
                          "preparing") === "delivered"
                          ? "bg-green-200 border border-green-300"
                          : "bg-white/10"
                      }`}
                    >
                      <svg
                        className={`w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 ${
                          (activeOrder?.pick_and_go_order?.cooking_status ??
                            "preparing") === "delivered"
                            ? "text-green-800"
                            : "text-white"
                        }`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <span
                      className={`text-xs md:text-sm font-medium ${
                        (activeOrder?.pick_and_go_order?.cooking_status ??
                          "preparing") === "delivered"
                          ? "text-green-100"
                          : "text-white/60"
                      }`}
                    >
                      {tc("statusDelivered")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Título con botón de refresh */}
              <div className="px-6 md:px-8 lg:px-10 border-t border-white/20 pt-4 md:pt-5 lg:pt-6">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium text-xl md:text-2xl lg:text-3xl text-white">
                    {tc("orderedItems")}
                  </h3>
                  <button
                    onClick={handleRefreshStatus}
                    disabled={isRefreshing}
                    className="rounded-full hover:bg-white/10 p-1 md:p-1.5 lg:p-2 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`size-5 md:size-6 lg:size-7 text-white ${isRefreshing ? "animate-spin" : ""}`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Order Items - Scrollable */}
            <div className="flex-1 overflow-y-auto px-6 md:px-8 lg:px-10 pt-4 md:pt-5 lg:pt-6 pb-6 md:pb-8 lg:pb-10">
              {isRefreshing ? (
                <div className="flex justify-center items-center py-12 md:py-16 lg:py-20">
                  <Loader2 className="size-8 md:size-10 lg:size-12 animate-spin text-white" />
                </div>
              ) : activeOrder?.dishes && activeOrder.dishes.length > 0 ? (
                <div className="space-y-3 md:space-y-4 lg:space-y-5">
                  {activeOrder.dishes.map((dish: any, index: number) => (
                    <div
                      key={dish.id || index}
                      className="flex items-center gap-3 md:gap-4 lg:gap-5 bg-white/5 rounded-xl md:rounded-2xl p-3 md:p-4 lg:p-5 border border-white/10"
                    >
                      <div className="flex-shrink-0">
                        <div className="size-16 md:size-20 lg:size-24 bg-gray-300 rounded-sm flex items-center justify-center overflow-hidden">
                          {dish.images?.[0] ? (
                            <img
                              src={dish.images[0]}
                              alt={dish.item}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <img
                              src="/even/even-asterisk-evergreen.svg"
                              alt="Logo Even"
                              className="size-12 md:size-14 lg:size-16 object-contain"
                            />
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base md:text-lg lg:text-xl text-white font-medium capitalize">
                          {dish.item}
                        </h3>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <p className="text-xs md:text-sm lg:text-base text-white/60">
                          {tc("quantityLabel", { quantity: dish.quantity })}
                        </p>
                        <p className="text-base md:text-lg lg:text-xl text-white font-medium">
                          ${(Number(dish.price) * dish.quantity).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 md:py-10 lg:py-12">
                  <p className="text-white/70 text-base md:text-lg lg:text-xl">
                    {tc("noOrderInfo")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reorder Modal */}
      <Suspense fallback={null}>
        <ReorderModal
          isOpen={showReorderModal}
          onClose={() => setShowReorderModal(false)}
          items={reorderItems}
        />
      </Suspense>
    </div>
  );
}
