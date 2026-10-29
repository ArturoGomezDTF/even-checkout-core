"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTable } from "@/app/context/TableContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { useGuest, useIsGuest } from "@/app/context/GuestContext";
import { useRestaurant } from "@/app/context/RestaurantContext";
import { getRestaurantData } from "@/app/utils/restaurantData";
import { apiService } from "@/app/utils/api";
import {
  Receipt,
  X,
  Calendar,
  Utensils,
  CircleAlert,
  LogIn,
  UserCircle2,
  FileText,
  Download,
  Loader2,
} from "lucide-react";
import { getCardTypeIcon } from "@/app/utils/cardIcons";
import { useAuth } from "@/app/context/AuthContext";
import InvoiceModal from "@/app/components/modals/InvoiceModal";
import { invoiceService } from "@/app/services/invoice.service";
import { ticketService } from "@/app/services/ticket.service";
import { lockScroll, unlockScroll } from "@/app/utils/scrollLock";
import { useValidateAccess } from "@/app/hooks/useValidateAccess";
import ValidationError from "@/app/components/ValidationError";
import { useModalBackClose } from "@/app/hooks/useModalBackClose";
import ItemCustomizations from "@/app/components/ItemCustomizations";

export default function PaymentSuccessPage() {
  const t = useTranslations("PaymentSuccessPage");
  const tc = useTranslations("Common");
  const format = useFormatter();
  // skipSessionCheck: al pagar se revoca la sesión de mesa de inmediato (por
  // diseño), y esta pantalla solo muestra el ticket ya pagado — no necesita
  // poder ordenar. Ver even-backend/src/controllers/shared/restaurantController.js.
  const { validationError, restaurantId } = useValidateAccess({
    skipSessionCheck: true,
  });
  const { restaurant } = useRestaurant();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const { state, loadTableData } = useTable();
  const { navigateWithTable } = useTableNavigation();
  const router = useRouter();
  const searchParams = useSearchParams();

  // La cuenta puede haber quedado cerrada por este mismo pago (remaining <=
  // 0 en close_table_order_if_paid). En ese caso ya no tiene sentido mandar
  // al guest de vuelta al menú de esta mesa. Recargamos acá en vez de
  // confiar en que card-selection ya haya terminado su refresh en background
  // para cuando se monta esta pantalla.
  const hasLoadedTableDataRef = useRef(false);
  useEffect(() => {
    if (state.tableNumber && !hasLoadedTableDataRef.current) {
      hasLoadedTableDataRef.current = true;
      loadTableData();
    }
  }, [state.tableNumber, loadTableData]);
  const isTableClosed = state.tableSummary?.data?.data?.status === "paid";
  const restaurantData = getRestaurantData();
  const isGuest = useIsGuest();
  const { guestId, tableNumber } = useGuest();

  // Get payment details from URL or localStorage
  const paymentId =
    searchParams.get("paymentId") || searchParams.get("orderId");
  const urlAmount = parseFloat(searchParams.get("amount") || "0");

  // Try to get stored payment details
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [rating, setRating] = useState(0); // Rating de 1 a 5 (solo enteros)
  const [hoveredRating, setHoveredRating] = useState(0);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false);
  const [hasRated, setHasRated] = useState(false); // Track if user has already rated
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(
    null,
  );
  const cameFromAuth =
    typeof window !== "undefined" &&
    sessionStorage.getItem("even-post-auth-redirect");
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
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

  // Limpiar el flag de redirect después de cargar
  useEffect(() => {
    if (cameFromAuth) {
      sessionStorage.removeItem("even-post-auth-redirect");
    }
  }, [cameFromAuth]);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated && !cameFromAuth) {
      setIsRegisterModalOpen(true);
    }
  }, [isAuthLoading, isAuthenticated, cameFromAuth]);

  // Handler for sign up navigation
  const handleSignUp = () => {
    // Save the current URL to redirect back after registration
    const currentUrl = window.location.pathname + window.location.search;
    sessionStorage.setItem("even-post-auth-redirect", currentUrl);

    // Navigate to auth page
    navigateWithTable("/auth");
  };

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

  // El pago ya se realizó: no debe ser posible regresar con el back
  // button/gesto nativo a card-selection, tip-selection u otra pantalla
  // previa del flujo de pago. Cualquier intento de ir atrás desde acá
  // redirige al menú.
  const navigateWithTableRef = useRef(navigateWithTable);
  navigateWithTableRef.current = navigateWithTable;

  // Capa base del stack de useModalBackClose: así cerrar un modal (X/backdrop)
  // no dispara esta redirección, y el back con un modal abierto solo lo cierra.
  useModalBackClose(true, () => navigateWithTableRef.current("/menu", true));

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
    if (isRegisterModalOpen) {
      lockScroll();
      return unlockScroll;
    }
  }, [isRegisterModalOpen]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Get payment ID from URL to identify this specific payment
      const urlPaymentId = paymentId || searchParams.get("transactionId");

      let storedPayment = null;
      let storageKey = "";
      let fromSession = true;

      // First, try to find the current payment key reference
      const currentKeyRef = sessionStorage.getItem("even-current-payment-key");
      if (currentKeyRef) {
        storedPayment = sessionStorage.getItem(currentKeyRef);
        storageKey = currentKeyRef;
      }

      // If not found, search all sessionStorage keys for payment success data
      if (!storedPayment) {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith("even-payment-success-")) {
            storedPayment = sessionStorage.getItem(key);
            storageKey = key;
            break;
          }
        }
      }

      // If still not found, check localStorage (first time)
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

            // Clear session data after successful payment — pero NO para
            // "Dividir cuenta": pagar tu parte no significa que terminaste de
            // interactuar con la mesa (otros pueden faltar por pagar, o puedes
            // volver a la pantalla). Limpiar el guest-id aquí lo regeneraba en
            // la siguiente visita, creando un participante duplicado.
            if (parsed.paymentType !== "equal-shares") {
              clearGuestSession();
            }
          }
        } catch (e) {
          console.error("Failed to parse stored payment details:", e);
        }
      } else {
      }
    }
  }, [paymentId, searchParams]);

  const clearGuestSession = async () => {
    if (typeof window !== "undefined") {
      // Use apiService method for consistent cleanup
      apiService.clearGuestSession();

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

  const amount =
    paymentDetails?.totalAmountCharged || paymentDetails?.amount || urlAmount;

  // Get payment type from paymentDetails
  const paymentType = paymentDetails?.paymentType || "";

  // Get dish orders from paymentDetails based on payment type
  const getDisplayedDishOrders = () => {
    const allDishOrders = paymentDetails?.dishOrders || [];

    if (paymentType === "select-items") {
      // For select-items, filter only the selected items
      const selectedItemIds = paymentDetails?.selectedItems || [];
      return allDishOrders.filter((dish: any) =>
        selectedItemIds.includes(dish.dish_order_id?.toString()),
      );
    } else if (paymentType === "full-bill") {
      // For full-bill, show all orders
      return allDishOrders;
    } else {
      // For equal-shares and choose-amount, don't show individual items
      return [];
    }
  };

  const dishOrders = getDisplayedDishOrders();

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

    // Complete exit - go to menu with table parameters
    navigateWithTable("/menu");
  };

  // Handle rating selection
  const handleRatingClick = (starRating: number) => {
    if (hasRated) {
      return;
    }
    setRating(starRating);
  };

  // Handle rating submission
  const handleSubmitRating = async () => {
    if (hasRated || rating === 0) {
      return;
    }

    if (!restaurantId) {
      console.error("❌ No restaurant ID available");
      return;
    }

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
      } else {
        console.error("❌ Failed to submit restaurant review:", data.message);
      }
    } catch (error) {
      console.error("❌ Error submitting restaurant review:", error);
    }
  };

  // Mostrar error de validación si existe
  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

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

          <div className="bg-white rounded-t-4xl relative z-10 flex flex-col min-h-96 justify-center px-6 md:px-8 lg:px-10 flex-1 py-8 md:py-10 lg:py-12">
            {/* Rating Prompt */}
            <div className="text-center mb-8 md:mb-10 lg:mb-12">
              <p className="text-xl md:text-2xl lg:text-3xl font-medium text-black mb-2 md:mb-3 lg:mb-4">
                {hasRated ? t("thankedForRating") : t("rateExperiencePrompt")}
              </p>
              <div className="flex flex-col items-center gap-3 md:gap-3.5 lg:gap-4">
                {/* Stars container */}
                <div className="flex gap-1 md:gap-1.5 lg:gap-2">
                  {[1, 2, 3, 4, 5].map((starIndex) => {
                    const currentRating = hoveredRating || rating;
                    const isFilled = currentRating >= starIndex;

                    return (
                      <div
                        key={starIndex}
                        className={`relative ${
                          hasRated ? "cursor-default" : "cursor-pointer"
                        }`}
                        onMouseEnter={() =>
                          !hasRated && setHoveredRating(starIndex)
                        }
                        onMouseLeave={() => !hasRated && setHoveredRating(0)}
                        onClick={() =>
                          !hasRated && handleRatingClick(starIndex)
                        }
                      >
                        {/* Estrella */}
                        <svg
                          className={`size-8 md:size-10 lg:size-12 transition-all ${
                            isFilled ? "text-yellow-400" : "text-white"
                          }`}
                          fill="currentColor"
                          stroke={isFilled ? "#facc15" : "black"}
                          strokeWidth="1"
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </div>
                    );
                  })}
                </div>

                {/* Submit button - appears when a rating is selected */}
                {rating > 0 && !hasRated && (
                  <button
                    onClick={handleSubmitRating}
                    className="px-5 md:px-6 py-1.5 md:py-2 bg-even-grass text-even-evergreen text-sm md:text-base font-medium rounded-full transition-all duration-300 hover:scale-105 hover:shadow-lg animate-fade-in"
                    aria-label={t("submitRatingAria")}
                  >
                    {t("submitRatingCta")}
                  </button>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div
              className="space-y-3 md:space-y-4 lg:space-y-5"
              style={{
                paddingBottom: "max(0rem, env(safe-area-inset-bottom))",
              }}
            >
              <button
                onClick={handleGoHome}
                disabled={isTableClosed}
                className="w-full py-3 md:py-4 lg:py-5 rounded-full transition-all bg-even-grass text-even-evergreen font-medium text-base md:text-lg lg:text-xl disabled:opacity-50 disabled:cursor-not-allowed enabled:cursor-pointer enabled:active:scale-90"
              >
                {t("goToMenuCta")}
              </button>

              {/* Facturar btn */}
              {restaurant?.billing_enabled !== false && (
                <button
                  onClick={() => setIsInvoiceModalOpen(true)}
                  className="text-base md:text-lg lg:text-xl w-full flex items-center justify-center gap-2 md:gap-3 lg:gap-4 text-black border border-black py-3 md:py-4 lg:py-5 rounded-full cursor-pointer transition-colors bg-white hover:bg-stone-100"
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
                className="text-base md:text-lg lg:text-xl w-full flex items-center justify-center gap-2 md:gap-3 lg:gap-4 text-black border border-black py-3 md:py-4 lg:py-5 rounded-full cursor-pointer transition-colors bg-white hover:bg-stone-100"
              >
                <Receipt
                  className="size-5 md:size-6 lg:size-7"
                  strokeWidth={1.5}
                />
                {t("viewReceiptCta")}
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
                      {restaurant?.name || restaurantData.name}
                    </h2>
                    <p className="text-sm md:text-base lg:text-lg text-white/80">
                      {tc("tableLabel", {
                        table: state.tableNumber || tableNumber || "N/A",
                      })}
                    </p>
                    <p className="text-xs md:text-sm text-white/70 mt-1">
                      {format.dateTime(
                        new Date(
                          paymentDetails?.tableSummary?.data?.data
                            ?.created_at || Date.now(),
                        ),
                        { hour: "2-digit", minute: "2-digit" },
                      )}
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
                    <div className="bg-blue-100 p-2 md:p-2.5 lg:p-3 rounded-xl flex items-center justify-center">
                      <Calendar className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-blue-600" />
                    </div>
                    <span className="text-sm md:text-base lg:text-lg">
                      {format.dateTime(
                        new Date(
                          paymentDetails?.tableSummary?.data?.data
                            ?.created_at || Date.now(),
                        ),
                        { day: "2-digit", month: "2-digit", year: "2-digit" },
                      )}
                    </span>
                  </div>

                  {(paymentDetails?.cardLast4 ||
                    paymentDetails?.cardBrand === "apple" ||
                    paymentDetails?.cardBrand === "google") && (
                    <div className="flex items-center gap-2 md:gap-3 lg:gap-4 text-white/90">
                      <div className="bg-green-100 p-2 md:p-2.5 lg:p-3 rounded-xl flex items-center justify-center">
                        <div className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 flex items-center justify-center">
                          {getCardTypeIcon(
                            paymentDetails.cardBrand || "unknown",
                            "small",
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
              {(dishOrders.length > 0 ||
                paymentType === "choose-amount" ||
                paymentType === "equal-shares") && (
                <div className="border-t border-white/20 py-4 md:py-5 lg:py-6">
                  <h3 className="font-medium text-xl md:text-2xl lg:text-3xl text-white mb-3 md:mb-4 lg:mb-5">
                    {tc("orderItems")}
                  </h3>
                  <div className="space-y-3 md:space-y-4 lg:space-y-5">
                    {/* Show individual items for full-bill and select-items */}
                    {dishOrders.length > 0 &&
                      dishOrders.map((dish: any, index: number) => (
                        <div
                          key={dish.dish_order_id || index}
                          className="flex justify-between items-center gap-3 md:gap-4 lg:gap-5"
                        >
                          {/* Image */}
                          <div className="size-14 md:size-16 lg:size-20 bg-gray-300 rounded-lg md:rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden">
                            {dish.images?.[0] ? (
                              <img
                                src={dish.images[0]}
                                alt={dish.item}
                                className="w-full h-full object-cover rounded-lg md:rounded-xl"
                              />
                            ) : (
                              <img
                                src="/even/even-asterisk-evergreen.svg"
                                alt="Logo Even"
                                className="size-7 md:size-9 lg:size-11 object-contain"
                              />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-white font-medium text-base md:text-lg lg:text-xl">
                              {dish.quantity}x {dish.item}
                            </p>
                            <ItemCustomizations
                              customFields={dish.custom_fields}
                              variant="dark"
                              formatPrice={(price) =>
                                price *
                                ((dish.total_display_price ?? dish.total_price) /
                                  (dish.total_price || 1))
                              }
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
                              $
                              {(
                                dish.total_display_price ??
                                dish.total_price ??
                                0
                              ).toFixed(2)}{" "}
                              MXN
                            </p>
                          </div>
                        </div>
                      ))}

                    {/* Show consumo for choose-amount and equal-shares */}
                    {(paymentType === "choose-amount" ||
                      paymentType === "equal-shares") &&
                      paymentDetails?.baseAmount > 0 && (
                        <div className="flex justify-between items-start gap-3 md:gap-4 lg:gap-5">
                          <div className="flex-1">
                            <p className="text-white font-medium text-base md:text-lg lg:text-xl">
                              {t("consumptionLabel").replace("+ ", "")}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-white font-medium text-base md:text-lg lg:text-xl">
                              $
                              {(
                                paymentDetails.displaySubtotal ??
                                paymentDetails.baseAmount +
                                  (paymentDetails?.evenCommissionClient || 0) +
                                  (paymentDetails?.ivaEvenClient || 0)
                              ).toFixed(2)}{" "}
                              MXN
                            </p>
                          </div>
                        </div>
                      )}

                    {/* Propina como item */}
                    {paymentDetails?.tipAmount > 0 && (
                      <div className="flex justify-between items-start gap-3 md:gap-4 lg:gap-5 pt-3 md:pt-4 lg:pt-5">
                        <div className="flex-1">
                          <p className="text-white font-medium text-base md:text-lg lg:text-xl">
                            {t("tipLabelPrefix").replace("+ ", "")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-white font-medium text-base md:text-lg lg:text-xl">
                            $
                            {(
                              paymentDetails.displayPropina ??
                              paymentDetails.tipAmount
                            ).toFixed(2)}{" "}
                            MXN
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Total Summary - Fixed at bottom */}
            <div className="shrink-0 px-6 md:px-8 lg:px-10">
              <div className="flex justify-between items-center border-t border-white/20 pt-4 md:pt-5 lg:pt-6 pb-6 md:pb-8 lg:pb-10">
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

              {/* Descargar ticket */}
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
                      $
                      {(
                        paymentDetails.displaySubtotal ??
                        paymentDetails.baseAmount +
                          (paymentDetails?.evenCommissionClient || 0) +
                          (paymentDetails?.ivaEvenClient || 0)
                      ).toFixed(2)}{" "}
                      MXN
                    </span>
                  </div>
                )}

                {paymentDetails?.tipAmount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      {t("tipLabelPrefix")}
                    </span>
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      $
                      {(
                        paymentDetails.displayPropina ??
                        paymentDetails.tipAmount
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
    </div>
  );
}
