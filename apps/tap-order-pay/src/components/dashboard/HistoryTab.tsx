"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useFormatter, useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import {
  Loader2,
  X,
  Calendar,
  FileText,
  Download,
  CircleAlert,
  User,
} from "lucide-react";
import { getCardTypeIcon } from "@/utils/cardIcons";
import { lockScroll, unlockScroll } from "@/utils/scrollLock";
import { useModalBackClose } from "@/hooks/useModalBackClose";
import InvoiceModal from "@/components/modals/InvoiceModal";
import { invoiceService } from "@/services/invoice.service";
import { ticketService } from "@/services/ticket.service";
import { requestWithAuth } from "@/services/request-helper";
import { getDisplayTip, getItemDisplayPrice } from "@/utils/commissionCalculator";
import ItemCustomizations from "@/components/ItemCustomizations";

interface OrderHistoryItem {
  orderType?:
    | "flex-bill"
    | "tap-order-and-pay"
    | "pick-and-go"
    | "tap-and-pay"
    | "room-service"; // Tipo de orden
  dishOrderId: number;
  item: string;
  quantity: number;
  price: number;
  totalPrice: number;
  status: string;
  paymentStatus: string;
  images: string[];
  customFields: any;
  extraPrice: number;
  createdAt: string;
  tableNumber?: number;
  roomNumber?: number;
  tableOrderId: number;
  tableOrderStatus: string;
  tableOrderDate: string;
  folio?: string | null;
  customerName?: string | null;
  restaurantId: number | null;
  restaurantName: string;
  restaurantLogo: string | null;
  // Payment method info
  paymentMethodId?: number | null;
  paymentCardLastFour?: string | null;
  paymentCardType?: string | null;
  paymentCardBrand?: string | null;
  paymentMethodLabel?: string | null;
  // Invoice / CFDI
  transactionId?: string | null;
  facturapiInvoiceId?: string | null;
  invoiceStatus?: string | null;
  invoicedViaConsolidation?: boolean;
  billingEnabled?: boolean;
  commissionAmount?: number;
}

function isCurrentMonth(dateValue: string) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

export default function HistoryTab() {
  const t = useTranslations("HistoryTab");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const { user, isAuthenticated } = useAuth();
  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<any>(null);
  const [displayCount, setDisplayCount] = useState(5);
  const [invoiceModalOrder, setInvoiceModalOrder] =
    useState<OrderHistoryItem | null>(null);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<
    string | null
  >(null);
  const [downloadingTicketId, setDownloadingTicketId] = useState<
    string | null
  >(null);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  // invoiceModalOrder no se cablea acá: InvoiceModal maneja su propio back
  // (steps internos + cierre final) para que el orden de la pila quede
  // bien anidado — ver useModalBackClose dentro de InvoiceModal.tsx.
  useModalBackClose(!!selectedOrderDetails, () =>
    setSelectedOrderDetails(null),
  );
  useModalBackClose(isBreakdownOpen, () => setIsBreakdownOpen(false));

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

  useEffect(() => {
    if (selectedOrderDetails) {
      lockScroll();
      return unlockScroll;
    }
  }, [selectedOrderDetails]);

  useEffect(() => {
    const fetchOrderHistory = async () => {
      if (!user) return;

      try {
        setIsLoading(true);
        // Con token: el backend exige `Authorization` y que el id del token
        // sea el de la ruta (even-backend#421). `requestWithAuth` lo manda y,
        // si vence, refresca y reintenta una sola vez.
        const response = await requestWithAuth<OrderHistoryItem[]>(
          `/users/${user.id}/order-history`,
        );

        if (!response.success) {
          throw new Error(t("errorLoadHistory"));
        }

        setOrders(response.data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrderHistory();
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 md:py-16 lg:py-20">
        <Loader2 className="size-8 md:size-10 lg:size-12 animate-spin text-even-shamrock" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-red-500 text-base md:text-lg lg:text-xl">{error}</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 text-6xl md:text-7xl lg:text-8xl mb-4 md:mb-5 lg:mb-6">
            📋
          </div>
          <p className="text-gray-500 text-base md:text-lg lg:text-xl">
            {t("noOrdersYet")}
          </p>
        </div>
      </div>
    );
  }

  // Las órdenes ya vienen agrupadas por transacción desde el backend
  // Cada orden tiene sus platillos en el array "dishes"
  const groupedOrders = orders.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Órdenes visibles según displayCount
  const visibleOrders = groupedOrders.slice(0, displayCount);
  const hasMore = displayCount < groupedOrders.length;

  const handleLoadMore = () => {
    setDisplayCount((prev) => prev + 5);
  };

  return (
    <>
      <h1 className="text-gray-700 text-xl md:text-2xl lg:text-3xl mb-3 md:mb-4 lg:mb-5">
        {t("previousOrders")}
      </h1>
      <div className="space-y-3 md:space-y-4 lg:space-y-5">
        {visibleOrders.map((order: any) => {
          return (
            <div
              key={order.transactionId}
              onClick={() => {
                setSelectedOrderDetails(order);
              }}
              className="border border-gray-200 rounded-lg md:rounded-xl p-4 md:p-5 lg:p-6 cursor-pointer"
            >
              <div className="flex items-center gap-3 md:gap-4 lg:gap-5">
                {/* Logo */}
                {order.restaurantLogo ? (
                  <img
                    src={order.restaurantLogo}
                    alt={order.restaurantName}
                    className="size-16 md:size-20 lg:size-24 object-cover rounded-lg md:rounded-xl shrink-0"
                  />
                ) : (
                  <div className="size-16 md:size-20 lg:size-24 bg-even-grass/20 rounded-lg md:rounded-xl flex items-center justify-center shrink-0">
                    <span className="text-2xl md:text-3xl lg:text-4xl">🍽️</span>
                  </div>
                )}

                {/* Order Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-black mb-1 text-base md:text-lg lg:text-xl truncate">
                    {order.restaurantName}
                  </h3>
                  <p className="text-sm md:text-base lg:text-lg text-gray-600 mb-1">
                    {t("itemsCount", { count: order.totalQuantity })} · $
                    {order.totalAmount.toFixed(2)}
                  </p>
                  <p className="text-xs md:text-sm lg:text-base text-gray-400">
                    {format.dateTime(new Date(order.tableOrderDate), {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Botón "Ver más" */}
      {hasMore && (
        <button
          onClick={handleLoadMore}
          className="mt-4 md:mt-5 lg:mt-6 border border-black/50 flex justify-center items-center gap-1 md:gap-1.5 lg:gap-2 w-full text-black text-base md:text-lg lg:text-xl py-3 md:py-4 lg:py-5 rounded-full cursor-pointer transition-colors bg-surface hover:bg-gray-100"
        >
          {t("loadMore")}
        </button>
      )}

      {/* Modal */}
      {selectedOrderDetails &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/25 z-999 flex items-center justify-center"
            onClick={() => {
              setSelectedOrderDetails(null);
              setIsBreakdownOpen(false);
            }}
          >
            <div
              className="bg-even-evergreen/80 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] w-full mx-4 md:mx-12 lg:mx-28 rounded-4xl z-999 max-h-[85vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header - Fixed */}
              <div className="shrink-0">
                <div className="w-full flex justify-end">
                  <button
                    onClick={() => {
                      setSelectedOrderDetails(null);
                      setIsBreakdownOpen(false);
                    }}
                    className="p-2 md:p-3 lg:p-4 hover:bg-white/10 rounded-lg md:rounded-xl transition-colors justify-end flex items-end mt-3 md:mt-4 lg:mt-5 mr-3 md:mr-4 lg:mr-5"
                  >
                    <X className="w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 text-white" />
                  </button>
                </div>
                <div className="px-6 md:px-8 lg:px-10 flex items-center justify-center mb-4 md:mb-5 lg:mb-6">
                  <div className="flex flex-col justify-center items-center gap-3 md:gap-4 lg:gap-5">
                    {selectedOrderDetails.restaurantLogo ? (
                      <img
                        src={selectedOrderDetails.restaurantLogo}
                        alt={selectedOrderDetails.restaurantName}
                        className="size-20 md:size-24 lg:size-28 object-cover rounded-lg md:rounded-xl"
                      />
                    ) : (
                      <div className="size-20 md:size-24 lg:size-28 bg-even-grass/20 rounded-lg md:rounded-xl flex items-center justify-center">
                        <span className="text-2xl md:text-3xl lg:text-4xl">
                          🍽️
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col items-center justify-center">
                      <h2 className="text-xl md:text-2xl lg:text-3xl text-white font-bold">
                        {selectedOrderDetails.restaurantName}
                      </h2>
                      {selectedOrderDetails.orderType === "room-service" ? (
                        <p className="text-sm md:text-base lg:text-lg text-white/80">
                          {t("roomNumber", {
                            number: selectedOrderDetails.roomNumber,
                          })}
                        </p>
                      ) : selectedOrderDetails.orderType !== "pick-and-go" ? (
                        <p className="text-sm md:text-base lg:text-lg text-white/80">
                          {t("tableNumber", {
                            number: selectedOrderDetails.tableNumber,
                          })}
                        </p>
                      ) : null}
                      {selectedOrderDetails.folio && (
                        <p className="text-sm md:text-base lg:text-lg text-white/80">
                          {t("folio", { folio: selectedOrderDetails.folio })}
                        </p>
                      )}
                      {/* Pick & Go: estatus a nivel de orden */}
                      {selectedOrderDetails.orderType === "pick-and-go" &&
                        selectedOrderDetails.tableOrderStatus && (
                          <span
                            className={`inline-block mt-2 px-3 py-1 rounded-full text-xs md:text-sm font-medium border ${getStatusColor(selectedOrderDetails.tableOrderStatus)}`}
                          >
                            {getStatusText(
                              selectedOrderDetails.tableOrderStatus,
                            )}
                          </span>
                        )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scrollable from "Tu orden" onwards */}
              <div className="flex-1 min-h-0 overflow-y-auto px-6 md:px-8 lg:px-10 border-t border-white/20">
                {/* Order Info */}
                <div className="pt-4 md:pt-5 lg:pt-6 pb-4 md:pb-5 lg:pb-6">
                  <h3 className="font-medium text-xl md:text-2xl lg:text-3xl text-white mb-3 md:mb-4 lg:mb-5">
                    {t("yourOrder")}
                  </h3>
                  <div className="space-y-2 md:space-y-3 lg:space-y-4">
                    <div className="flex items-center gap-2 md:gap-3 lg:gap-4 text-white/90">
                      <div className="bg-[#D6F6F5] p-2 md:p-2.5 lg:p-3 rounded-xl flex items-center justify-center">
                        <Calendar className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-even-evergreen" />
                      </div>
                      <span className="text-sm md:text-base lg:text-lg">
                        {format.dateTime(
                          new Date(selectedOrderDetails.tableOrderDate),
                          {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </span>
                    </div>
                    {selectedOrderDetails.customerName && (
                      <div className="flex items-center gap-2 md:gap-3 lg:gap-4 text-white/90">
                        <div className="bg-[#D2F0BE] p-2 md:p-2.5 lg:p-3 rounded-xl flex items-center justify-center">
                          <User className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-even-evergreen" />
                        </div>
                        <span className="text-sm md:text-base lg:text-lg">
                          {selectedOrderDetails.customerName}
                        </span>
                      </div>
                    )}
                    {selectedOrderDetails.paymentMethodLabel && (
                      <div className="flex items-center gap-2 md:gap-3 lg:gap-4 text-white/90">
                        <div className="bg-[#FBF6DC] px-1 py-1.5 md:py-2 md:px-1.5 lg:py-2.5 lg:px-2 rounded-xl flex items-center justify-center">
                          {getCardTypeIcon(
                            selectedOrderDetails.paymentCardBrand,
                            "small",
                            32,
                            20,
                          )}
                        </div>
                        <span className="text-sm md:text-base lg:text-lg">
                          {selectedOrderDetails.paymentMethodLabel}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Lista de platillos */}
                <div className="border-t border-white/20 pt-4 md:pt-5 lg:pt-6">
                  <h3 className="font-medium text-xl md:text-2xl lg:text-3xl text-white mb-3 md:mb-4 lg:mb-5">
                    {tc("orderItems")}
                  </h3>
                  {selectedOrderDetails.orderType === "flex-bill" ? (
                    <div className="flex items-center gap-3 pb-4 md:pb-5 lg:pb-6">
                      <div className="bg-white/10 rounded-xl p-2.5">
                        <svg
                          className="size-5 text-white/70"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
                          />
                        </svg>
                      </div>
                      <p className="text-white/70 text-sm md:text-base lg:text-lg">
                        {t("splitPaymentNotice")}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 md:space-y-4 lg:space-y-5 pb-4 md:pb-5 lg:pb-6">
                      {selectedOrderDetails.dishes?.map((dish: any) => (
                        <div
                          key={dish.dishOrderId}
                          className="flex justify-between items-center gap-3 md:gap-4 lg:gap-5"
                        >
                          <div className="size-14 md:size-16 lg:size-20 bg-gray-300 rounded-sm md:rounded-md flex items-center justify-center hover:scale-105 transition-transform duration-200">
                            {dish.images?.length > 0 && dish.images[0] ? (
                              <img
                                src={dish.images[0]}
                                alt="Dish preview"
                                className="w-full h-full object-cover rounded-sm md:rounded-md"
                              />
                            ) : (
                              <img
                                src="/even/even-asterisk-evergreen.svg"
                                alt="Logo Even"
                                className={`size-10 md:size-12 object-contain`}
                              />
                            )}
                          </div>
                          {/* Dish Info */}
                          <div className="flex-1">
                            <p className="text-white font-medium text-base md:text-lg lg:text-xl capitalize">
                              {dish.quantity}x {dish.item}
                            </p>
                            <ItemCustomizations
                              customFields={dish.customFields}
                              variant="dark"
                              formatPrice={(price) => {
                                const unitPrice = (dish.price || 0) + (dish.extraPrice || 0);
                                const inflates =
                                  (selectedOrderDetails.orderType === "tap-order-and-pay" ||
                                    selectedOrderDetails.orderType === "flex-bill") &&
                                  unitPrice > 0;
                                return inflates
                                  ? price * (getItemDisplayPrice(unitPrice) / unitPrice)
                                  : price;
                              }}
                              className="mt-0.5"
                            />
                            {(() => {
                              // Tap Order & Pay y Flex Bill inflan el precio
                              // mostrado (comisión por ítem) — los demás
                              // servicios (Pick & Go, Room Service, Tap & Pay)
                              // usan otro modelo de comisión y siguen
                              // mostrando el precio real. Se infla según el
                              // orderType de la orden, no según en qué app se
                              // esté viendo.
                              const inflatesPrice =
                                selectedOrderDetails.orderType ===
                                  "tap-order-and-pay" ||
                                selectedOrderDetails.orderType === "flex-bill";
                              const unitPrice =
                                (dish.price || 0) + (dish.extraPrice || 0);
                              const multiplier =
                                inflatesPrice && unitPrice > 0
                                  ? getItemDisplayPrice(unitPrice) / unitPrice
                                  : 1;
                              return (
                                <>
                                  <p className="text-xs md:text-sm lg:text-base text-white/60">
                                    $
                                    {((dish.price || 0) * multiplier).toFixed(
                                      2,
                                    )}{" "}
                                    MXN {t("perUnit")}
                                  </p>
                                  {dish.extraPrice > 0 && (
                                    <p className="text-xs md:text-sm lg:text-base text-white/60">
                                      {t("extrasPrefix")}: $
                                      {(dish.extraPrice * multiplier).toFixed(
                                        2,
                                      )}{" "}
                                      MXN
                                    </p>
                                  )}
                                </>
                              );
                            })()}
                            {/* Status Badge — Pick & Go maneja el estatus a nivel de orden, no por platillo */}
                            {selectedOrderDetails.orderType !== "pick-and-go" &&
                              dish.status && (
                                <span
                                  className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(dish.status)}`}
                                >
                                  {getStatusText(dish.status)}
                                </span>
                              )}
                          </div>

                          {/* Total Price */}
                          <div className="text-right">
                            <p className="text-white font-medium text-base md:text-lg lg:text-xl">
                              $
                              {((selectedOrderDetails.orderType ===
                                "tap-order-and-pay" ||
                                selectedOrderDetails.orderType ===
                                  "flex-bill") &&
                              (dish.price || 0) + (dish.extraPrice || 0) > 0
                                ? getItemDisplayPrice(
                                    (dish.price || 0) + (dish.extraPrice || 0),
                                  ) * dish.quantity
                                : dish.totalPrice
                              )?.toFixed(2)}{" "}
                              MXN
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Total Summary - Fixed */}
              <div className="shrink-0 px-6 md:px-8 lg:px-10 border-t border-white/20 pt-4 md:pt-5 lg:pt-6 pb-6 md:pb-8 lg:pb-10 space-y-3 md:space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-lg md:text-xl lg:text-2xl font-medium text-white">
                      {t("total")}
                    </span>
                    {selectedOrderDetails.baseAmount > 0 && (
                      <button
                        onClick={() => setIsBreakdownOpen(true)}
                        className="p-1 hover:bg-white/10 rounded-full transition-colors"
                        aria-label={t("viewBreakdownAlt")}
                      >
                        <CircleAlert
                          className="size-4 md:size-5 lg:size-6 text-white/70"
                          strokeWidth={2.3}
                        />
                      </button>
                    )}
                  </div>
                  <span className="text-lg md:text-xl lg:text-2xl font-medium text-white">
                    ${selectedOrderDetails.totalAmount?.toFixed(2)} MXN
                  </span>
                </div>

                {/* Descargar ticket — disponible siempre, a diferencia de la factura */}
                <button
                  onClick={async () => {
                    if (downloadingTicketId) return;
                    setDownloadingTicketId(selectedOrderDetails.transactionId);
                    try {
                      const blob = await ticketService.downloadTicketPdf(
                        selectedOrderDetails.transactionId,
                      );
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `ticket-${selectedOrderDetails.transactionId}.pdf`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch {
                      // silently ignore
                    } finally {
                      setDownloadingTicketId(null);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 border border-white/30 text-white rounded-2xl py-3 md:py-4 text-sm md:text-base hover:bg-white/10 transition-colors"
                >
                  {downloadingTicketId === selectedOrderDetails.transactionId ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {t("downloadTicket")}
                </button>

                {/* Download — only for individually-issued invoices, never the consolidated PUBLICO EN GENERAL one */}
                {!selectedOrderDetails.invoicedViaConsolidation &&
                  selectedOrderDetails.facturapiInvoiceId && (
                    <button
                      onClick={async () => {
                        if (downloadingInvoiceId) return;
                        setDownloadingInvoiceId(
                          selectedOrderDetails.facturapiInvoiceId,
                        );
                        try {
                          const blob = await invoiceService.downloadInvoicePdf(
                            selectedOrderDetails.facturapiInvoiceId,
                            selectedOrderDetails.restaurantId,
                          );
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `factura-${selectedOrderDetails.facturapiInvoiceId}.pdf`;
                          a.click();
                          URL.revokeObjectURL(url);
                        } catch {
                          // silently ignore
                        } finally {
                          setDownloadingInvoiceId(null);
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-even-grass text-even-evergreen rounded-2xl py-3 md:py-4 text-sm md:text-base font-medium"
                    >
                      {downloadingInvoiceId ===
                      selectedOrderDetails.facturapiInvoiceId ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      {t("downloadInvoice")}
                    </button>
                  )}

                {/* Facturar — only when billing active, no existing invoice, current month */}
                {selectedOrderDetails.billingEnabled !== false &&
                  !selectedOrderDetails.invoicedViaConsolidation &&
                  !selectedOrderDetails.facturapiInvoiceId &&
                  isCurrentMonth(selectedOrderDetails.tableOrderDate) && (
                    <button
                      onClick={() => {
                        setInvoiceModalOrder(selectedOrderDetails);
                        setSelectedOrderDetails(null);
                      }}
                      className="w-full flex items-center justify-center gap-2 border border-white/30 text-white rounded-2xl py-3 md:py-4 text-sm md:text-base hover:bg-white/10 transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                      {tc("invoiceCta")}
                    </button>
                  )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Breakdown Modal */}
      {isBreakdownOpen &&
        selectedOrderDetails &&
        createPortal(
          <div
            className="fixed inset-0 flex items-end justify-center"
            style={{ zIndex: 999999 }}
          >
            <div
              className="absolute inset-0 bg-black/25"
              onClick={() => setIsBreakdownOpen(false)}
            />
            <div className="relative bg-white rounded-t-4xl w-full">
              <div className="px-6 md:px-8 lg:px-10 pt-4 md:pt-6 lg:pt-8">
                <div className="flex items-center justify-between pb-4 md:pb-5 lg:pb-6 border-b border-gray-100">
                  <h3 className="text-lg md:text-xl lg:text-2xl font-semibold text-black">
                    {t("breakdownTitle")}
                  </h3>
                  <button
                    onClick={() => setIsBreakdownOpen(false)}
                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X className="size-5 md:size-6 lg:size-7 text-gray-500" />
                  </button>
                </div>
              </div>
              <div className="px-6 md:px-8 lg:px-10 py-4 md:py-6 lg:py-8 space-y-3 md:space-y-4 lg:space-y-5">
                {(() => {
                  // Tap Order & Pay y Flex Bill esconden la comisión adentro
                  // del precio por ítem — para esas órdenes el desglose usa
                  // Subtotal (ya inflado) + Propina, nunca una línea de
                  // comisión aparte. Los demás servicios sí cobran de forma
                  // transparente, así que ahí se mantiene Consumo + Propina +
                  // Comisión tal cual viene del backend.
                  const inflatesPrice =
                    selectedOrderDetails.orderType === "tap-order-and-pay" ||
                    selectedOrderDetails.orderType === "flex-bill";

                  if (!inflatesPrice) {
                    return (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                            {t("consumptionLabel")}
                          </span>
                          <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                            ${selectedOrderDetails.baseAmount?.toFixed(2)} MXN
                          </span>
                        </div>
                        {selectedOrderDetails.tipAmount > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                              {t("tipLabelPrefix")}
                            </span>
                            <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                              ${selectedOrderDetails.tipAmount?.toFixed(2)} MXN
                            </span>
                          </div>
                        )}
                        {(selectedOrderDetails.commissionAmount || 0) > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                              {t("serviceCommissionLabel")}
                            </span>
                            <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                              $
                              {selectedOrderDetails.commissionAmount?.toFixed(
                                2,
                              )}{" "}
                              MXN
                            </span>
                          </div>
                        )}
                      </>
                    );
                  }

                  const displaySubtotal = (
                    selectedOrderDetails.dishes || []
                  ).reduce((sum: number, dish: any) => {
                    const unitPrice =
                      (dish.price || 0) + (dish.extraPrice || 0);
                    if (unitPrice <= 0) return sum;
                    return (
                      sum +
                      Math.round(
                        getItemDisplayPrice(unitPrice) * dish.quantity * 100,
                      ) /
                        100
                    );
                  }, 0);
                  // Propina con su comisión incrustada (ver
                  // commissionCalculator.ts)
                  const displayPropina = getDisplayTip(
                    selectedOrderDetails.totalAmount || 0,
                    displaySubtotal,
                  );

                  return (
                    <>
                      {displaySubtotal > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                            {t("subtotalLabel")}
                          </span>
                          <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                            ${displaySubtotal.toFixed(2)} MXN
                          </span>
                        </div>
                      )}
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
                    </>
                  );
                })()}
                <div className="flex justify-between items-center border-t border-gray-100 pt-3 md:pt-4">
                  <span className="text-black font-semibold text-base md:text-lg lg:text-xl">
                    {t("total")}
                  </span>
                  <span className="text-black font-semibold text-base md:text-lg lg:text-xl">
                    ${selectedOrderDetails.totalAmount?.toFixed(2)} MXN
                  </span>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Invoice Modal */}
      {invoiceModalOrder &&
        createPortal(
          <InvoiceModal
            isOpen={true}
            onClose={() => setInvoiceModalOrder(null)}
            transactionId={invoiceModalOrder.transactionId || ""}
            restaurantId={invoiceModalOrder.restaurantId || 0}
            isAuthenticated={isAuthenticated}
            onInvoiceCreated={(invoiceId) => {
              setOrders((prev) =>
                prev.map((o) =>
                  o.transactionId === invoiceModalOrder.transactionId
                    ? {
                        ...o,
                        facturapiInvoiceId: invoiceId,
                        invoiceStatus: "valid",
                      }
                    : o,
                ),
              );
            }}
          />,
          document.body,
        )}
    </>
  );
}
