"use client";

import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { lockScroll, unlockScroll } from "@/utils/scrollLock";
import { useParams, useRouter, useSearchParams } from "next/navigation";

const ReorderModal = lazy(() => import("@/components/modals/ReorderModal"));
import InvoiceModal from "@/components/modals/InvoiceModal";
import { invoiceService } from "@/services/invoice.service";
import { ticketService } from "@/services/ticket.service";
import { useTableNavigation } from "@/hooks/useTableNavigation";
import { useRestaurant } from "@/context/RestaurantContext";
import { useTable } from "@/context/TableContext";
import { useAuth } from "@/context/AuthContext";
import {
  Receipt,
  X,
  Calendar,
  Utensils,
  CircleAlert,
  RefreshCw,
  Loader2,
  LogIn,
  UserCircle2,
  FileText,
  Download,
} from "lucide-react";
import { getCardTypeIcon } from "@/utils/cardIcons";
import { tapOrderService } from "@/services/taporders.service";
import type { TapOrder, LastOrderDish } from "@/services/taporders.service";
import { getDisplayTip, getItemDisplayPrice } from "@/utils/commissionCalculator";
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
  const { state } = useTable();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  useEffect(() => {
    if (restaurantId && !isNaN(parseInt(restaurantId))) {
      setRestaurantId(parseInt(restaurantId));
    }
    if (branchNumber && !isNaN(parseInt(branchNumber))) {
      setBranchNumber(parseInt(branchNumber));
    }
  }, [restaurantId, branchNumber, setRestaurantId, setBranchNumber]);

  const { navigateWithTable } = useTableNavigation();
  const router = useRouter();
  const searchParams = useSearchParams();

  // El pago ya se realizó: no debe ser posible regresar con el back
  // button/gesto nativo a card-selection, order-confirm o auth. Cualquier
  // intento de ir atrás desde acá redirige al menú.
  const navigateWithTableRef = useRef(navigateWithTable);
  navigateWithTableRef.current = navigateWithTable;

  // Capa base del stack de useModalBackClose: así cerrar un modal (X/backdrop)
  // no dispara esta redirección, y el back con un modal abierto solo lo cierra.
  useModalBackClose(true, () => navigateWithTableRef.current("/menu", true));

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
    navigateWithTable("/auth");
  };

  // Try to get stored payment details
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [order, setOrder] = useState<TapOrder | null>(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [reorderItems, setReorderItems] = useState<LastOrderDish[]>([]);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(
    null,
  );
  const [isDownloadingTicket, setIsDownloadingTicket] = useState(false);

  // Abrir el modal de registro solo cuando la auth terminó de cargar
  // y confirmamos que NO hay sesión (evita el flash al recargar)
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
    if (showReorderModal) {
      lockScroll();
      return unlockScroll;
    }
  }, [showReorderModal]);

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
      } else {
      }
    }
  }, [paymentId, searchParams]);

  // Calculate total amount charged to client
  const amount =
    paymentDetails?.totalAmountCharged || paymentDetails?.amount || urlAmount;

  // dishOrders: se carga del backend o del storage como fallback
  const [dishOrders, setDishOrders] = useState<any[]>([]);

  // Subtotal mostrado en el "Desglose del pago": suma de los precios por
  // ítem ya con su comisión escondida adentro (mismo cálculo que la lista de
  // "Items de la orden" abajo) — nunca se desglosa la comisión como línea
  // aparte, va incrustada acá y en la Propina.
  const displaySubtotal = useMemo(
    () =>
      dishOrders.reduce((sum, dish: any) => {
        const unitPrice = (dish.price || 0) + (dish.extra_price || 0);
        const quantity = dish.quantity || 1;
        if (unitPrice <= 0) return sum;
        return (
          sum +
          Math.round(getItemDisplayPrice(unitPrice) * quantity * 100) / 100
        );
      }, 0),
    [dishOrders],
  );
  const [orderCreatedAt, setOrderCreatedAt] = useState<Date | null>(null);

  const fetchDishOrders = async () => {
    // Obtener los detalles de la orden a partir del ID que viene en la URL.
    // De ahí salen tanto el ticket (dishOrders) como los items para reordenar,
    // sin depender de que la sesión del usuario ya haya cargado.
    const orderId = paymentId || paymentDetails?.orderId;
    if (!orderId) {
      setDishOrders(paymentDetails?.dishOrders || []);
      return;
    }
    try {
      const result = await tapOrderService.getOrderById(orderId);
      if (result.success && result.data) {
        const orderData = (result.data as any)?.data || result.data;
        if (orderData?.tap_order?.created_at) {
          setOrderCreatedAt(new Date(orderData.tap_order.created_at));
        }
        if (orderData?.dishes?.length) {
          // Items para reordenar (solo los que tienen menu_item_id válido)
          const reorder: LastOrderDish[] = orderData.dishes
            .filter((d: any) => d.menu_item_id != null)
            .map((d: any) => ({
              id: d.id,
              menu_item_id: Number(d.menu_item_id),
              item: d.item,
              quantity: d.quantity,
              price: d.price,
              extra_price: d.extra_price || 0,
              images: d.images || [],
              custom_fields: d.custom_fields || null,
              special_instructions: d.special_instructions || null,
            }));
          if (reorder.length) setReorderItems(reorder);

          // Items para el ticket
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
            images: d.images || [],
          }));
          setDishOrders(transformed);
          return;
        }
      }
    } catch {
      // silently fall through to storage
    }
    setDishOrders(paymentDetails?.dishOrders || []);
  };

  useEffect(() => {
    fetchDishOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    navigateWithTable("/menu");
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
    setIsStatusModalOpen(true);
    fetchOrder();
  };

  const handleReorder = () => {
    if (!reorderItems.length) return;
    setShowReorderModal(true);
  };

  const handleDownloadTicket = async () => {
    const transactionId =
      paymentDetails?.transactionId || paymentDetails?.paymentId;
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
      const result = await tapOrderService.getOrderById(paymentId);

      if (result.success && result.data) {
        const orderData = result.data?.data || result.data;
        setOrder(orderData);
      } else {
        setOrderError(
          (typeof result.error === "string"
            ? result.error
            : result.error?.message) || t("errorLoadOrder"),
        );
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
        return "Preparando";
      case "ready":
        return "Listo";
      case "delivered":
        return "Entregado";
      default:
        return status;
    }
  };

  return (
    <div className="min-h-dvh brand-evergreen flex flex-col">
      {/* Success Icon */}
      <div className="flex-1 flex justify-center items-center">
        <img
          src="/even/even-asterisk-grass.svg"
          alt="Even"
          className="size-16 md:size-20 lg:size-24 animate-logo-fade-in"
        />
      </div>

      <div className="px-4 md:px-6 lg:px-8 w-full animate-slide-up flex-1 flex flex-col">
        <div className="flex-1 flex flex-col">
          <div className="left-4 right-4 bg-even-evergreen rounded-t-4xl z-0">
            <div className="pb-6 md:pb-8 lg:pb-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center items-center mb-6 md:mb-8 lg:mb-10 gap-2 md:gap-3 lg:gap-4">
              <h1 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight">
                ¡Gracias por tu pedido!
              </h1>
              <p className="text-white text-base md:text-lg lg:text-xl">
                Hemos recibido tu pago y tu orden está en proceso.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-t-4xl relative z-10 flex flex-col min-h-60 justify-center px-6 md:px-8 lg:px-10 flex-1 -mt-7">
            {/* Action Buttons */}
            <div className="space-y-3 md:space-y-4 lg:space-y-5">
              {/* Reordenar btn */}
              <button
                onClick={handleReorder}
                disabled={!reorderItems.length}
                className="w-full flex items-center justify-center gap-2 md:gap-3 lg:gap-4 text-even-evergreen py-3 md:py-4 lg:py-5 rounded-full cursor-pointer transition-all active:scale-90 bg-even-grass text-base md:text-lg lg:text-xl disabled:opacity-70 animate-pulse-button"
              >
                <RefreshCw
                  className="size-5 md:size-6 lg:size-7"
                  strokeWidth={2.5}
                />
                Reordenar
              </button>

              <button
                onClick={handleBackToMenu}
                className="w-full text-even-evergreen py-3 md:py-4 lg:py-5 rounded-full cursor-pointer transition-all active:scale-90 bg-even-grass text-base md:text-lg lg:text-xl"
              >
                Ir al menú
              </button>

              {/* Ticket btn */}
              <button
                onClick={() => setIsTicketModalOpen(true)}
                className="text-base md:text-lg lg:text-xl w-full flex items-center justify-center gap-2 md:gap-3 lg:gap-4 text-black border border-black py-3 md:py-4 lg:py-5 rounded-full cursor-pointer transition-all active:scale-90 bg-white hover:bg-stone-100"
              >
                <Receipt
                  className="size-5 md:size-6 lg:size-7"
                  strokeWidth={1.5}
                />
                Ver ticket de compra
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
                Ver Estatus
              </button>

              {/* Facturar btn */}
              {restaurant?.billing_enabled !== false && (
                <button
                  onClick={() => setIsInvoiceModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 md:gap-3 lg:gap-4 text-black bg-white hover:bg-stone-100 border border-black py-3 md:py-4 lg:py-5 rounded-full cursor-pointer transition-all active:scale-90 text-base md:text-lg lg:text-xl"
                >
                  <FileText
                    className="size-5 md:size-6 lg:size-7"
                    strokeWidth={1.5}
                  />
                  {existingInvoiceId ? "Ver factura" : "Facturar"}
                </button>
              )}
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
            className="bg-even-evergreen/80 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] w-full mx-4 md:mx-12 lg:mx-28 rounded-4xl z-999 max-h-[77vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - Fixed */}
            <div className="shrink-0">
              <div className="w-full flex justify-end">
                <button
                  onClick={() => setIsTicketModalOpen(false)}
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
                    <Receipt className="size-20 md:size-24 lg:size-28 text-white" />
                  )}
                  <div className="flex flex-col items-center justify-center">
                    <h2 className="text-xl md:text-2xl lg:text-3xl text-white font-bold">
                      {restaurant?.name || t("defaultRestaurantName")}
                    </h2>
                    <p className="text-sm md:text-base lg:text-lg text-white/80">
                      {tc("tableLabel", {
                        table: paymentDetails?.tableNumber || state.tableNumber,
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
            </div>

            {/* Scrollable Content - Detalles del pago + Items de la orden */}
            <div className="flex-1 overflow-y-auto px-6 md:px-8 lg:px-10">
              {/* Order Info */}
              <div className="border-t border-white/20 py-4 md:py-5 lg:py-6">
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
                    <div className="bg-even-aqua p-2 md:p-2.5 lg:p-3 rounded-xl flex items-center justify-center">
                      <Calendar className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-even-evergreen" />
                    </div>
                    <span className="text-sm md:text-base lg:text-lg">
                      {format
                        .dateTime(orderCreatedAt || new Date(), {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                        })
                        .replace(/\//g, "/")}
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
                <div className="border-t border-white/20 py-4 md:py-5 lg:py-6 mt-4 md:mt-5 lg:mt-6">
                  <h3 className="font-medium text-xl md:text-2xl lg:text-3xl text-white mb-3 md:mb-4 lg:mb-5">
                    Items de la orden
                  </h3>
                  <div className="space-y-3 md:space-y-4 lg:space-y-5">
                    {dishOrders.map((dish: any, index: number) => {
                      // Precio mostrado: (precio base + extras) con la comisión
                      // por ítem incrustada, × cantidad — mismo mecanismo que
                      // HistoryTab/OrderAnimation para Tap Order & Pay.
                      const itemPrice = dish.price || 0;
                      const extraPrice = dish.extra_price || 0;
                      const quantity = dish.quantity || 1;
                      const unitPrice = itemPrice + extraPrice;
                      const calculatedTotal =
                        unitPrice > 0
                          ? Math.round(
                              getItemDisplayPrice(unitPrice) * quantity * 100,
                            ) / 100
                          : 0;

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
                      <div className="flex justify-between items-start gap-3 md:gap-4 lg:gap-5">
                        <div className="flex-1">
                          <p className="text-white font-medium text-base md:text-lg lg:text-xl">
                            Propina
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

            {/* Total Summary + Facturar - Fixed */}
            <div className="shrink-0 px-6 md:px-8 lg:px-10 border-t border-white/20 pt-4 md:pt-5 lg:pt-6 pb-6 md:pb-8 lg:pb-10 flex flex-col gap-4 md:gap-5 lg:gap-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 md:gap-3 lg:gap-4">
                  <span className="text-lg md:text-xl lg:text-2xl font-medium text-white">
                    Total
                  </span>
                  {(paymentDetails?.baseAmount ||
                    paymentDetails?.tipAmount ||
                    paymentDetails?.evenCommissionClient) && (
                    <button
                      onClick={() => setIsBreakdownModalOpen(true)}
                      className="p-1 hover:bg-white/10 rounded-full transition-colors"
                      aria-label="Ver desglose"
                    >
                      <CircleAlert
                        className="size-4 md:size-5 lg:size-6 cursor-pointer text-white/70"
                        strokeWidth={2.3}
                      />
                    </button>
                  )}
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

              {/* Descargar ticket */}
              <button
                onClick={handleDownloadTicket}
                className="w-full flex items-center justify-center gap-2 border border-white/30 text-white rounded-2xl py-3 md:py-4 text-sm md:text-base hover:bg-white/10 transition-colors"
              >
                {isDownloadingTicket ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Descargar ticket
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
                      Estatus de la orden
                    </h2>
                    <p className="text-sm md:text-base lg:text-lg text-white/80">
                      Mesa {paymentDetails?.tableNumber || state.tableNumber}
                    </p>
                  </div>
                </div>
              </div>

              {/* Título con botón de refresh */}
              <div className="px-6 md:px-8 lg:px-10 border-t border-white/20 pt-4 md:pt-5 lg:pt-6">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium text-xl md:text-2xl lg:text-3xl text-white">
                    Items ordenados
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
                          formatPrice={getItemDisplayPrice}
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
                          Cant: {dish.quantity}
                        </p>
                        <p className="text-base md:text-lg lg:text-xl text-white font-medium">
                          $
                          {(
                            getItemDisplayPrice(
                              dish.quantity > 0
                                ? dish.total_price / dish.quantity
                                : dish.total_price,
                            ) * dish.quantity
                          ).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 md:py-10 lg:py-12">
                  <p className="text-white/70 text-base md:text-lg lg:text-xl">
                    No se encontró información de la orden
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
                  Desglose del pago
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
                El total se obtiene de la suma de:
              </p>
              <div className="space-y-3 md:space-y-4 lg:space-y-5">
                {displaySubtotal > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      + Subtotal
                    </span>
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      ${displaySubtotal.toFixed(2)} MXN
                    </span>
                  </div>
                )}

                {(() => {
                  // Propina con su comisión incrustada (no hay línea de
                  // comisión; ver commissionCalculator.ts)
                  const displayPropina = getDisplayTip(amount, displaySubtotal);
                  return (
                    displayPropina > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                          + Propina
                        </span>
                        <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                          ${displayPropina.toFixed(2)} MXN
                        </span>
                      </div>
                    )
                  );
                })()}

                {paymentDetails?.installments && (
                  <div className="flex justify-between items-center">
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      + Financiamiento ({paymentDetails.installments} meses)
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
                src="/even/even-asterisk-white.svg"
                alt="Even Logo"
                className="size-16 md:size-18 lg:size-20"
              />
            </div>

            {/* Title */}
            <div className="px-6 md:px-8 lg:px-10 text-center mb-6 md:mb-8 lg:mb-10">
              <h1 className="text-white text-xl md:text-2xl lg:text-3xl font-medium mb-2 md:mb-3 lg:mb-4">
                ¡Tu pedido fue creado con éxito!
              </h1>
              <p className="text-white/80 text-sm md:text-base lg:text-lg">
                Crea una cuenta para hacer pedidos más rápido la próxima vez
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
                    Crear cuenta
                  </h2>
                  <p className="text-xs md:text-sm lg:text-base text-gray-600">
                    Regístrate y ahorra tiempo en futuros pedidos
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
                    Continuar sin registrarme
                  </h2>
                  <p className="text-xs md:text-sm lg:text-base text-white/80">
                    Ver el estado de mi pedido
                  </p>
                </div>
              </button>
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

      {/* Invoice Modal */}
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
    </div>
  );
}
