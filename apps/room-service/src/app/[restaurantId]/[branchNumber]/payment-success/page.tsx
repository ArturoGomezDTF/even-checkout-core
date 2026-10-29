"use client";

import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useRoomNavigation } from "@/hooks/useRoomNavigation";
import { useRestaurant } from "@/context/RestaurantContext";
const ReorderModal = lazy(() => import("@/components/ReorderModal"));
import InvoiceModal from "@/components/modals/InvoiceModal";
import { invoiceService } from "@/services/invoice.service";
import { ticketService } from "@/services/ticket.service";
import { lockScroll, unlockScroll } from "@/utils/scrollLock";
import { useRoom } from "@/context/RoomContext";
import {
  Receipt,
  X,
  Calendar,
  Utensils,
  CircleAlert,
  RefreshCw,
  Loader2,
  UserCircle2,
  LogIn,
  FileText,
  Download,
} from "lucide-react";
import { getCardTypeIcon } from "@/utils/cardIcons";
import { roomOrderService } from "@/services/roomorders.service";
import type { RoomOrder } from "@/services/roomorders.service";
import { useAuth } from "@/context/AuthContext";
import { useGuest } from "@/context/GuestContext";
import { useModalBackClose } from "@/hooks/useModalBackClose";
import ItemCustomizations from "@/components/ItemCustomizations";

export default function PaymentSuccessPage() {
  const t = useTranslations("PaymentSuccessPage");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const params = useParams();
  const { setRestaurantId, setBranchNumber, restaurant } = useRestaurant();
  const restaurantId = params?.restaurantId as string;
  const branchNumber = params?.branchNumber as string;
  const { state } = useRoom();
  const { isAuthenticated, user, isLoading: isAuthLoading } = useAuth();
  const { guestId } = useGuest();

  useEffect(() => {
    if (restaurantId && !isNaN(parseInt(restaurantId))) {
      setRestaurantId(parseInt(restaurantId));
    }
    if (branchNumber && !isNaN(parseInt(branchNumber))) {
      setBranchNumber(parseInt(branchNumber));
    }
  }, [restaurantId, branchNumber, setRestaurantId, setBranchNumber]);

  const { navigateWithRoom } = useRoomNavigation();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get payment details from URL or localStorage
  const paymentId =
    searchParams.get("paymentId") || searchParams.get("orderId");
  const urlAmount = parseFloat(searchParams.get("amount") || "0");

  // No abrir el modal de registro si el usuario viene de un redirect de auth
  const cameFromAuth =
    typeof window !== "undefined" &&
    sessionStorage.getItem("even-post-auth-redirect");

  // Handler for sign up navigation
  const handleSignUp = () => {
    const currentUrl = window.location.pathname + window.location.search;
    sessionStorage.setItem("even-post-auth-redirect", currentUrl);
    navigateWithRoom("/auth");
  };

  // Try to get stored payment details
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [hasRated, setHasRated] = useState(false);
  const [order, setOrder] = useState<RoomOrder | null>(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [dishOrders, setDishOrders] = useState<any[]>([]);
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [orderCreatedAt, setOrderCreatedAt] = useState<Date | null>(null);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
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

  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated && !cameFromAuth) {
      setIsRegisterModalOpen(true);
    }
  }, [isAuthLoading, isAuthenticated, cameFromAuth]);

  // Limpiar el flag de redirect después de cargar
  useEffect(() => {
    if (cameFromAuth) {
      sessionStorage.removeItem("even-post-auth-redirect");
    }
  }, [cameFromAuth]);

  // El pago ya se realizó: no debe ser posible regresar con el back
  // button/gesto nativo a card-selection, order-confirm o auth. Cualquier
  // intento de ir atrás desde acá redirige al menú.
  const navigateWithRoomRef = useRef(navigateWithRoom);
  navigateWithRoomRef.current = navigateWithRoom;

  // Capa base del stack de useModalBackClose: así cerrar un modal (X/backdrop)
  // no dispara esta redirección, y el back con un modal abierto solo lo cierra.
  useModalBackClose(true, () => navigateWithRoomRef.current("/menu", true));

  useEffect(() => {
    lockScroll();
    return unlockScroll;
  }, []);
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
    if (isInvoiceModalOpen) {
      lockScroll();
      return unlockScroll;
    }
  }, [isInvoiceModalOpen]);

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
          }
        } catch (e) {
          console.error("Failed to parse stored payment details:", e);
        }
      }
    }
  }, [paymentId, searchParams]);

  // Calculate total amount charged to client
  const amount =
    paymentDetails?.totalAmountCharged || paymentDetails?.amount || urlAmount;

  const fetchDishOrders = async () => {
    const orderId = paymentId || paymentDetails?.orderId;
    if (!orderId) {
      setDishOrders(paymentDetails?.dishOrders || []);
      return;
    }
    try {
      const result = await roomOrderService.getOrderById(orderId);
      if (result.success && result.data) {
        const orderData = (result.data as any)?.data || result.data;
        if (orderData?.room_order?.created_at) {
          setOrderCreatedAt(new Date(orderData.room_order.created_at));
        }
        if (orderData?.dishes?.length) {
          const transformed = orderData.dishes.map((d: any) => ({
            dish_order_id: d.menu_item_id || d.id,
            item: d.item,
            quantity: d.quantity,
            price: d.price,
            extra_price: d.extra_price || 0,
            total_price:
              d.total_price ?? (d.price + (d.extra_price || 0)) * d.quantity,
            guest_name: d.guest_name || null,
            custom_fields: d.custom_fields || null,
            images: d.images || (d.image_url ? [d.image_url] : []),
          }));
          setDishOrders(transformed);
          if (restaurantId) {
            try {
              localStorage.setItem(
                `even-last-order-${restaurantId}`,
                JSON.stringify(
                  transformed.map((d: any) => ({
                    item: d.item,
                    price: d.price,
                    extra_price: d.extra_price,
                    images: d.images,
                    custom_fields: d.custom_fields,
                  })),
                ),
              );
            } catch {}
          }
          return;
        }
      }
    } catch {
      // silently fall through
    }
    setDishOrders(paymentDetails?.dishOrders || []);
  };

  useEffect(() => {
    fetchDishOrders();
  }, [paymentId, paymentDetails]);

  useEffect(() => {
    const txId = paymentDetails?.transactionId || paymentDetails?.paymentId;
    if (!txId) return;
    invoiceService
      .getTransactionInvoice(txId)
      .then((info) => {
        if (info?.invoiceId && info.status !== "cancelled") {
          setExistingInvoiceId(info.invoiceId);
        }
      })
      .catch(() => {});
  }, [paymentDetails]);

  const handleBackToMenu = () => {
    // Clear payment success data from sessionStorage
    const currentKey = sessionStorage.getItem("even-current-payment-key");
    if (currentKey) {
      sessionStorage.removeItem(currentKey);
      sessionStorage.removeItem("even-current-payment-key");
    }
    // Fallback: also remove generic key
    sessionStorage.removeItem("even-payment-success");

    navigateWithRoom("/menu");
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

    // Complete exit - go to home
    router.push("/");
  };

  const handleViewStatus = () => {
    // Abrir modal de estatus
    setIsStatusModalOpen(true);
    // Cargar la orden
    fetchOrder();
  };

  // Función para cargar la orden
  const fetchOrder = async (isRefresh = false) => {
    if (!paymentId) return;

    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoadingOrder(true);
    }
    setOrderError(null);

    try {
      const result = await roomOrderService.getOrderById(paymentId);

      if (result.success && result.data) {
        const orderData = result.data?.data || result.data;
        setOrder(orderData);
      } else {
        setOrderError(result.error?.message || t("errorLoadOrder"));
      }
    } catch (err) {
      setOrderError(t("errorNetworkLoadOrder"));
      console.error("Error fetching order:", err);
    } finally {
      if (isRefresh) {
        setIsRefreshing(false);
      } else {
        setIsLoadingOrder(false);
      }
    }
  };

  const handleRefresh = () => {
    fetchOrder(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "preparing":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "ready":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "delivered":
        return "bg-green-100 text-green-800 border-green-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "preparing":
        return tc("statusPreparing");
      case "ready":
        return tc("statusReady");
      case "delivered":
        return tc("statusDelivered");
      default:
        return status;
    }
  };

  // Handle rating selection
  const handleRatingClick = (starRating: number) => {
    if (hasRated) return;
    setRating(starRating);
  };

  // Handle rating submission
  const handleSubmitRating = async () => {
    if (hasRated || rating === 0) return;

    if (!restaurantId) return;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/restaurant-reviews`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            restaurant_id: parseInt(restaurantId),
            rating: rating,
          }),
        },
      );

      const data = await response.json();

      if (data.success) {
        setHasRated(true);
      }
    } catch (error) {
      console.error("❌ Error submitting restaurant review:", error);
    }
  };

  return (
    <div className="min-h-dvh overflow-hidden brand-evergreen flex flex-col">
      {/* Success Icon */}
      <div className="flex-1 flex justify-center items-center">
        <img
          src="/even/even-asterisk-grass.svg"
          alt="Even Logo"
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
              {/* Reorder btn */}
              <button
                onClick={() => setShowReorderModal(true)}
                disabled={dishOrders.length === 0}
                className="w-full flex items-center justify-center gap-2 md:gap-3 lg:gap-4 text-even-evergreen py-3 md:py-4 lg:py-5 rounded-full cursor-pointer transition-all active:scale-90 bg-even-grass text-base md:text-lg lg:text-xl disabled:opacity-70 animate-pulse-button font-medium"
              >
                <RefreshCw
                  className="size-5 md:size-6 lg:size-7"
                  strokeWidth={2.5}
                />
                {tc("reorderCta")}
              </button>

              <button
                onClick={handleBackToMenu}
                className="w-full py-3 md:py-4 lg:py-5 rounded-full cursor-pointer transition-all active:scale-90 bg-even-grass text-even-evergreen text-base md:text-lg lg:text-xl"
              >
                {t("goToMenuCta")}
              </button>

              {restaurant?.billing_enabled !== false && (
                <button
                  onClick={() => setIsInvoiceModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 md:gap-3 lg:gap-4 text-even-evergreen bg-even-grass py-3 md:py-4 lg:py-5 rounded-full cursor-pointer transition-all active:scale-90 text-base md:text-lg lg:text-xl"
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

              {/* Status btn - Regresa a order-view */}
              <button
                onClick={handleViewStatus}
                className="text-base md:text-lg lg:text-xl w-full flex items-center justify-center gap-2 md:gap-3 lg:gap-4 text-black border border-black py-3 md:py-4 lg:py-5 rounded-full cursor-pointer transition-all active:scale-90 bg-white hover:bg-stone-100"
              >
                <Utensils
                  className="size-5 md:size-6 lg:size-7"
                  strokeWidth={1.5}
                />
                {t("viewStatusCta")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Ticket Modal */}
      {isTicketModalOpen && (
        <div
          className="fixed inset-0 bg-black/25 backdrop-blur-xs z-999 flex items-center justify-center"
          onClick={() => setIsTicketModalOpen(false)}
        >
          <div
            className="bg-even-evergreen/80 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] w-full mx-4 md:mx-12 lg:mx-28 rounded-4xl z-999  max-h-[77vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex justify-end shrink-0">
              <button
                onClick={() => setIsTicketModalOpen(false)}
                className="p-2 md:p-3 lg:p-4 hover:bg-white/10 rounded-lg md:rounded-xl transition-colors justify-end flex items-end mt-3 md:mt-4 lg:mt-5 mr-3 md:mr-4 lg:mr-5"
              >
                <X className="w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 text-white" />
              </button>
            </div>
            <div className="px-6 md:px-8 lg:px-10 flex items-center justify-center mb-4 md:mb-5 lg:mb-6 shrink-0">
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
                    {restaurant?.name || t("defaultRestaurantName")}
                  </h2>
                  <p className="text-sm md:text-base lg:text-lg text-white/80">
                    {tc("roomLabel", {
                      room: paymentDetails?.roomNumber || state.roomNumber,
                    })}
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

            {/* Scrollable Content - Detalles del pago + Items de la orden */}
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
                  <div className="space-y-3 md:space-y-4 lg:space-y-5 pb-4 md:pb-5 lg:pb-6">
                    {dishOrders.map((dish: any, index: number) => {
                      // Calcular el precio total correcto: (precio base + extras) * cantidad
                      const itemPrice = dish.price || 0;
                      const extraPrice = dish.extra_price || 0;
                      const quantity = dish.quantity || 1;
                      const calculatedTotal =
                        (itemPrice + extraPrice) * quantity;

                      return (
                        <div
                          key={`${dish.dish_order_id || "dish"}-${index}-${dish.item}`}
                          className="flex justify-between items-center gap-3 md:gap-4 lg:gap-5"
                        >
                          {dish.images &&
                            dish.images.length > 0 &&
                            dish.images[0] && (
                              <img
                                src={dish.images[0]}
                                alt={dish.item}
                                className="w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-lg object-cover"
                              />
                            )}
                          <div className="flex-1">
                            <p className="text-white font-medium text-base md:text-lg lg:text-xl">
                              {quantity}x {dish.item}
                            </p>
                            {dish.guest_name && (
                              <p className="text-xs md:text-sm lg:text-base text-white/60 uppercase">
                                {dish.guest_name}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-white font-medium text-base md:text-lg lg:text-xl">
                              ${calculatedTotal.toFixed(2)} MXN
                            </p>
                          </div>
                        </div>
                      );
                    })}

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

            {/* Total Summary - Fixed */}
            <div className="px-6 md:px-8 lg:px-10 shrink-0">
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

      {/* Status Modal */}
      {isStatusModalOpen && (
        <div
          className="fixed inset-0 bg-black/25 backdrop-blur-xs z-999 flex items-center justify-center"
          onClick={() => setIsStatusModalOpen(false)}
        >
          <div
            className="bg-even-evergreen/80 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] w-full mx-4 md:mx-12 lg:mx-28 rounded-4xl z-999 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - Fixed */}
            <div className="shrink-0">
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
                      alt={restaurant.name}
                      className="size-20 md:size-24 lg:size-28 object-cover rounded-lg md:rounded-xl"
                    />
                  ) : (
                    <Utensils className="size-20 md:size-24 lg:size-28 text-white" />
                  )}
                  <div className="flex flex-col items-center justify-center">
                    <h2 className="text-xl md:text-2xl lg:text-3xl text-white font-bold">
                      {tc("orderStatusModalTitle")}
                    </h2>
                    <p className="text-sm md:text-base lg:text-lg text-white/80">
                      {tc("roomLabel", {
                        room: paymentDetails?.roomNumber || state.roomNumber,
                      })}
                    </p>
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
                    onClick={handleRefresh}
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
              {isLoadingOrder ? (
                <div className="flex justify-center items-center py-12 md:py-16 lg:py-20">
                  <Loader2 className="size-8 md:size-10 lg:size-12 animate-spin text-white" />
                </div>
              ) : orderError ? (
                <div className="text-center py-8 md:py-10 lg:py-12">
                  <p className="text-red-300 text-base md:text-lg lg:text-xl">
                    {orderError}
                  </p>
                </div>
              ) : order && order.dishes && order.dishes.length > 0 ? (
                <div className="space-y-3 md:space-y-4 lg:space-y-5">
                  {order.dishes.map((dish, index) => (
                    <div
                      key={dish.id || index}
                      className="flex items-start gap-3 md:gap-4 lg:gap-5 bg-white/5 rounded-xl md:rounded-2xl p-3 md:p-4 lg:p-5 border border-white/10"
                    >
                      <div className="shrink-0">
                        <div className="size-16 md:size-20 lg:size-24 bg-gray-300 rounded-sm flex items-center justify-center overflow-hidden">
                          {dish.images &&
                          dish.images.length > 0 &&
                          dish.images[0] ? (
                            <img
                              src={dish.images[0]}
                              alt={dish.item}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <img
                              src={"/even/even-asterisk-evergreen.svg"}
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

                        <ItemCustomizations
                          customFields={dish.custom_fields}
                          variant="dark"
                          onlyPaid={true}
                          className="mt-1 md:mt-1.5 lg:mt-2"
                        />

                        {/* Badge de estado */}
                        <div className="mt-1 md:mt-1.5 lg:mt-2">
                          <span
                            className={`inline-block px-2 md:px-3 lg:px-4 py-0.5 md:py-1 lg:py-1.5 text-xs md:text-sm lg:text-base font-medium rounded-full border ${getStatusColor(dish.status)}`}
                          >
                            {getStatusText(dish.status)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <p className="text-xs md:text-sm lg:text-base text-white/60">
                          {tc("quantityLabel", { quantity: dish.quantity })}
                        </p>
                        <p className="text-base md:text-lg lg:text-xl text-white font-medium">
                          $
                          {(
                            (dish.price + (dish.extra_price || 0)) *
                            dish.quantity
                          ).toFixed(2)}
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

      {/* Register Modal */}
      {isRegisterModalOpen && (
        <div
          className="fixed inset-0 bg-black/25 backdrop-blur-xs z-999 flex items-center justify-center animate-fade-in"
          onClick={() => setIsRegisterModalOpen(false)}
        >
          <div
            className="bg-even-evergreen/80 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] w-full mx-4 md:mx-12 lg:mx-28 rounded-4xl z-999 flex flex-col justify-center py-12 md:py-16 lg:py-20 min-h-[70vh] animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <div className="absolute top-3 md:top-4 lg:top-5 right-3 md:right-4 lg:right-5">
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                className="p-2 md:p-3 lg:p-4 hover:bg-white/10 rounded-lg md:rounded-xl transition-colors"
              >
                <X className="w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 text-white" />
              </button>
            </div>

            {/* Logo */}
            <div className="px-6 md:px-8 lg:px-10 flex items-center justify-center mb-6 md:mb-8 lg:mb-10">
              <img
                src="/even/even-asterisk-grass.svg"
                alt="Even Logo"
                className="size-20 md:size-24 lg:size-28"
              />
            </div>

            {/* Title */}
            <div className="px-6 md:px-8 lg:px-10 text-center mb-6 md:mb-8 lg:mb-10">
              <h1 className="text-white text-xl md:text-2xl lg:text-3xl font-medium mb-2 md:mb-3 lg:mb-4">
                {t("registerModalTitle")}
              </h1>
              <p className="text-white/80 text-sm md:text-base lg:text-lg">
                {t("registerModalSubtitle")}
              </p>
            </div>

            {/* Options */}
            <div className="px-6 md:px-8 lg:px-10 space-y-3 md:space-y-4 lg:space-y-5">
              {/* Sign Up Option */}
              <button
                onClick={handleSignUp}
                className="w-full bg-white hover:bg-gray-50 text-black py-4 md:py-5 lg:py-6 px-4 md:px-5 lg:px-6 rounded-xl md:rounded-2xl transition-all duration-200 flex items-center gap-3 md:gap-4 lg:gap-5 active:scale-95"
              >
                <div className="bg-even-grass p-2 md:p-2.5 lg:p-3 rounded-full group-hover:scale-110 transition-transform">
                  <LogIn className="size-5 md:size-6 lg:size-7 text-even-evergreen" />
                </div>
                <div className="flex-1 text-left">
                  <h2 className="text-base md:text-lg lg:text-xl font-medium mb-0.5 md:mb-1">
                    {t("createAccountCta")}
                  </h2>
                  <p className="text-xs md:text-sm lg:text-base text-gray-600">
                    {t("createAccountSubtitle")}
                  </p>
                </div>
              </button>

              {/* Continue as Guest Option */}
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                className="w-full bg-white/10 hover:bg-white/20 border-2 border-white text-white py-4 md:py-5 lg:py-6 px-4 md:px-5 lg:px-6 rounded-xl md:rounded-2xl transition-all duration-200 flex items-center gap-3 md:gap-4 lg:gap-5 group active:scale-95"
              >
                <div className="bg-white/20 p-2 md:p-2.5 lg:p-3 rounded-full group-hover:scale-110 transition-transform">
                  <UserCircle2 className="size-5 md:size-6 lg:size-7 text-white" />
                </div>
                <div className="flex-1 text-left">
                  <h2 className="text-base md:text-lg lg:text-xl font-medium mb-0.5 md:mb-1">
                    {t("continueAsGuestCta")}
                  </h2>
                  <p className="text-xs md:text-sm lg:text-base text-white/80">
                    {t("continueAsGuestSubtitle")}
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        transactionId={
          paymentDetails?.transactionId || paymentDetails?.paymentId || ""
        }
        restaurantId={parseInt(restaurantId as string, 10)}
        isAuthenticated={isAuthenticated}
        onInvoiceCreated={(id) => setExistingInvoiceId(id)}
        existingInvoiceId={existingInvoiceId}
      />

      {/* Reorder Modal */}
      <Suspense fallback={null}>
        <ReorderModal
          isOpen={showReorderModal}
          onClose={() => setShowReorderModal(false)}
          items={dishOrders.map((d) => ({
            item: d.item,
            price: d.price,
            extra_price: d.extra_price,
            images: d.images,
            custom_fields: d.custom_fields,
          }))}
        />
      </Suspense>
    </div>
  );
}
