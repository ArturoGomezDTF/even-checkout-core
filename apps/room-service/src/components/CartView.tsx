"use client";

import { useRef, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Minus, Plus, ChevronDown, ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRoom } from "../context/RoomContext";
import { useCart } from "../context/CartContext";
import { useRoomNavigation } from "../hooks/useRoomNavigation";
import MenuHeaderBack from "./headers/MenuHeaderBack";
import { useAuth } from "../context/AuthContext";
import { useRestaurant } from "../context/RestaurantContext";
import { useAgentStatus } from "../hooks/useAgentStatus";
import POSBlockedModal from "./POSBlockedModal";
import ItemCustomizations from "@/components/ItemCustomizations";
import { getBackendOrigin } from "@even/api-client";

const API_BASE_URL = getBackendOrigin(
  process.env.NEXT_PUBLIC_API_URL,
  "http://localhost:5000",
);

// Perfil completo = tiene nombre Y fecha de nacimiento (apellido es opcional).
const isProfileComplete = (
  p?: { firstName?: string; birthDate?: string } | null,
) => !!p?.firstName && !!p?.birthDate;

export default function CartView() {
  const t = useTranslations("CartView");
  const tc = useTranslations("Common");
  const params = useParams();
  const restaurantId = params?.restaurantId
    ? Number(params.restaurantId)
    : null;
  const branchNumber = params?.branchNumber
    ? Number(params.branchNumber)
    : null;
  const { agentStatus } = useAgentStatus(restaurantId, branchNumber);
  const hasActivePOS =
    agentStatus !== null && agentStatus.hasIntegration && agentStatus.isActive;
  const { restaurant } = useRestaurant();

  const { state: roomState } = useRoom();
  const {
    state: cartState,
    updateQuantity,
    orderNotes,
    setOrderNotes,
    updateOrderNotes,
  } = useCart();
  const { navigateWithRoom } = useRoomNavigation();
  const { isAuthenticated, isLoading, user, profile, refreshProfile } =
    useAuth();
  const [showPOSModal, setShowPOSModal] = useState(false);
  const [posModalReason, setPosModalReason] = useState<
    "turno_closed" | "agent_disconnected"
  >("turno_closed");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Regla de negocio: no se puede ordenar un carrito que solo tenga items de
  // promo (gratis) — mismo check que el backend hace en confirmOrder
  // (cartService.assertHasNonPromoItem), pero aquí bloqueamos antes de
  // navegar para no dejar avanzar al customer hasta el pago.
  const hasNonPromoItem = cartState.items.some(
    (item) => !(item.isPromoItem && !item.userDiscountId),
  );
  const isPromoOnlyCart = cartState.items.length > 0 && !hasNonPromoItem;

  // Si el usuario está autenticado pero el perfil no cargó (ej. error de red al
  // volver de fondo en móvil), intentar cargarlo para que el checkout funcione.
  useEffect(() => {
    if (!isLoading && user && !profile) {
      refreshProfile();
    }
  }, [isLoading, user, profile, refreshProfile]);

  const handleOrder = async () => {
    if (isPromoOnlyCart) return;
    if (hasActivePOS && restaurantId && branchNumber) {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/pos/restaurant/${restaurantId}/branch/${branchNumber}/attempt-order`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              identifier: `Habitación ${roomState.roomNumber}`,
            }),
          },
        );
        const data = await res.json();
        if (data.blocked) {
          setPosModalReason(data.reason);
          setShowPOSModal(true);
          return;
        }
      } catch {
        // network error — proceed with order
      }
    }

    if (!isLoading && isAuthenticated && isProfileComplete(profile)) {
      setIsSubmitting(true);
      try {
        navigateWithRoom("/order-confirm");
      } catch (error) {
        console.error("Error submitting order:", error);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Sin sesión, o con sesión pero perfil incompleto (falta nombre o
      // fecha de nacimiento): /auth ahora también sabe saltar directo al
      // step de perfil cuando ya hay sesión activa, precargando lo que ya
      // exista (ver mount effect en auth/page.tsx).
      sessionStorage.setItem("authFromPaymentFlow", "true");
      navigateWithRoom("/auth");
    }
  };

  return (
    <div className="min-h-screen brand-evergreen flex flex-col">
      <MenuHeaderBack />

      <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col">
        <div className="left-4 right-4 bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
          {cartState.items.length === 0 ? (
            <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
              <h1 className="text-[#e0e0e0] text-xl md:text-2xl lg:text-3xl font-medium">
                {tc("roomLabel", { room: roomState.roomNumber ?? "" })}
              </h1>
              <h2 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight mt-2 md:mt-3 mb-6 md:mb-8">
                {t("emptyCartHero")}
              </h2>
            </div>
          ) : (
            <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
              <h1 className="text-[#e0e0e0] text-xl md:text-2xl lg:text-3xl font-medium">
                {tc("roomLabel", { room: roomState.roomNumber ?? "" })}
              </h1>
              <h2 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight mt-2 md:mt-3 mb-6 md:mb-8">
                {t("confirmYourOrder")}
              </h2>
            </div>
          )}
        </div>

        <div className="flex-1 h-full flex flex-col overflow-hidden">
          {/* Cart Items */}
          <div className="bg-white rounded-t-4xl flex-1 z-5 flex flex-col px-6 md:px-8 lg:px-10 overflow-hidden">
            {/* Scrollable content */}
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto flex flex-col pb-30 md:pb-35 lg:pb-40"
            >
              <div className="pt-6 md:pt-8">
                <h2 className="bg-surface border border-stroke rounded-full px-3 md:px-4 lg:px-5 py-1 md:py-1.5 text-base md:text-lg lg:text-xl font-medium text-black w-fit mx-auto">
                  {t("myCart")}
                </h2>
              </div>

              {cartState.items.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-12 md:py-16 text-center">
                  <div className="flex flex-col items-center max-w-xs">
                    <div className="size-20 md:size-24 rounded-full bg-even-evergreen/5 flex items-center justify-center mb-5 md:mb-6">
                      <ShoppingBag
                        className="size-9 md:size-10 text-even-evergreen/70"
                        strokeWidth={1.5}
                      />
                    </div>
                    <p className="text-black text-2xl md:text-3xl font-medium mb-2">
                      {t("cartEmptyTitle")}
                    </p>
                    <p className="text-gray-500 text-base md:text-lg mb-6 md:mb-8">
                      {t("cartEmptySubtitle")}
                    </p>
                    <button
                      onClick={() => navigateWithRoom("/menu")}
                      className="bg-even-grass text-even-evergreen font-medium text-base md:text-lg px-8 py-3 md:py-4 rounded-full transition-opacity hover:opacity-90 active:scale-95"
                    >
                      {t("viewMenuCta")}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-black font-medium text-sm md:text-base lg:text-lg flex gap-10 md:gap-12 lg:gap-17 justify-end translate-y-4">
                    <span>{t("qtyLabel")}</span>
                    <span>{t("priceLabel")}</span>
                  </div>
                  <div className="divide-y divide-stroke/50">
                    {cartState.items.map((item, index) => (
                      <div
                        key={`${item.id}-${item.cartItemId}-${index}`}
                        className="py-3 md:py-4 lg:py-5"
                      >
                        <div className="flex items-center justify-between">
                          <div
                            onClick={() =>
                              !(item.isPromoItem && !item.userDiscountId) &&
                              item.cartItemId &&
                              navigateWithRoom(
                                `/dish/${item.id}?cartItemId=${item.cartItemId}`,
                              )
                            }
                            className={`flex items-center gap-3 md:gap-4 lg:gap-5 flex-1 min-w-0 ${
                              !(item.isPromoItem && !item.userDiscountId) &&
                              item.cartItemId
                                ? "cursor-pointer active:scale-95 transition-transform duration-150"
                                : ""
                            }`}
                          >
                            <div className="shrink-0">
                              <div className="size-16 md:size-20 lg:size-24 bg-gray-300 rounded-sm md:rounded-md flex items-center justify-center hover:scale-105 transition-transform duration-200">
                                {item.images &&
                                item.images.length > 0 &&
                                item.images[0] ? (
                                  <img
                                    src={item.images[0]}
                                    alt="Dish preview"
                                    className="w-full h-full object-cover rounded-sm md:rounded-md"
                                  />
                                ) : (
                                  <img
                                    src="/even/even-asterisk-evergreen.svg"
                                    alt="Logo Even"
                                    className="size-10 md:size-12 lg:size-14 object-contain"
                                  />
                                )}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-base md:text-lg lg:text-xl text-black capitalize">
                                  {item.name}
                                </h3>
                                {item.isPromoItem && (
                                  <span className="shrink-0 bg-even-grass/20 text-even-evergreen text-[10px] md:text-xs uppercase tracking-widest px-2 py-0.5 rounded-full">
                                    {t("promoBadge")}
                                  </span>
                                )}
                              </div>
                              <ItemCustomizations
                                customFields={item.customFields}
                                note={item.specialInstructions}
                              />
                            </div>
                          </div>
                          <div className="shrink-0 text-right flex items-center justify-center gap-4 md:gap-5 lg:gap-6">
                            <div className="flex items-center gap-2 md:gap-3">
                              <Minus
                                onClick={() =>
                                  item.cartItemId &&
                                  updateQuantity(
                                    item.cartItemId,
                                    item.quantity - 1,
                                  )
                                }
                                className="size-4 md:size-5 lg:size-6 flex items-center justify-center text-black cursor-pointer"
                              />
                              <p className="text-base md:text-lg lg:text-xl text-black text-center">
                                {item.quantity}
                              </p>
                              <Plus
                                onClick={() =>
                                  !(item.isPromoItem && !item.userDiscountId) &&
                                  item.cartItemId &&
                                  updateQuantity(
                                    item.cartItemId,
                                    item.quantity + 1,
                                  )
                                }
                                className={`size-4 md:size-5 lg:size-6 flex items-center justify-center text-black ${
                                  item.isPromoItem && !item.userDiscountId
                                    ? "opacity-20 cursor-not-allowed"
                                    : "cursor-pointer"
                                }`}
                              />
                            </div>
                            <div className="w-20 md:w-24 lg:w-28 text-right">
                              <p className="text-base md:text-lg lg:text-xl text-black whitespace-nowrap">
                                {item.isPromoItem &&
                                item.price + (item.extraPrice || 0) === 0
                                  ? t("freePrice")
                                  : `$${(
                                      item.price + (item.extraPrice || 0)
                                    ).toFixed(2)}`}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Comentarios — collapsible */}
                  <div className="text-black mt-6 md:mt-8">
                    <div
                      className="flex justify-between items-center gap-3 cursor-pointer"
                      onClick={() => setNotesOpen((prev) => !prev)}
                    >
                      <h3 className="font-medium text-black text-xl md:text-2xl lg:text-3xl">
                        {tc("anythingToKnow")}
                      </h3>
                      <div className="size-7 md:size-8 lg:size-9 shrink-0 bg-surface rounded-full flex items-center justify-center border border-stroke/50">
                        <ChevronDown
                          className={`size-5 md:size-6 lg:size-7 text-black transition-transform duration-250 ${notesOpen ? "rotate-180" : ""}`}
                        />
                      </div>
                    </div>

                    {notesOpen && (
                      <div className="mt-3 md:mt-4 animate-in slide-in-from-top-2 duration-200">
                        <textarea
                          className="h-24 md:h-28 lg:h-32 text-base md:text-lg lg:text-xl w-full bg-surface border border-stroke-soft px-3 md:px-4 py-2 md:py-3 rounded-lg resize-none focus:outline-none"
                          placeholder={t("generalCommentsPlaceholder")}
                          value={orderNotes}
                          onChange={(e) => setOrderNotes(e.target.value)}
                          onBlur={(e) => {
                            updateOrderNotes(e.target.value);
                            setTimeout(() => {
                              window.scrollTo({ top: 0, behavior: "smooth" });
                              if (scrollContainerRef.current) {
                                scrollContainerRef.current.scrollTop = 0;
                              }
                            }, 300);
                          }}
                          maxLength={80}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                          }}
                          onFocus={(e) => {
                            setTimeout(() => {
                              e.target.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                            }, 200);
                          }}
                        />
                        <p className="text-right text-sm text-gray-400 mt-1">
                          {orderNotes.length}/80
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Fixed bottom section */}
            {cartState.items.length > 0 && (
              <div
                className="fixed bottom-0 left-0 bg-white right-0 mx-4 md:mx-6 lg:mx-8 px-6 md:px-8 lg:px-10 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]"
                style={{
                  paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
                }}
              >
                <div className="w-full flex gap-3 md:gap-4 lg:gap-5 mt-6 md:mt-7 lg:mt-8 justify-between">
                  <div className="flex flex-col justify-center min-w-0">
                    <span className="text-gray-600 text-sm md:text-base lg:text-lg whitespace-nowrap">
                      {t("itemsCount", { count: cartState.totalItems })}
                    </span>
                    <div className="flex items-center justify-center w-fit text-2xl md:text-3xl lg:text-4xl font-medium text-black text-center">
                      ${cartState.totalPrice.toFixed(2)}
                    </div>
                  </div>
                  <button
                    onClick={handleOrder}
                    disabled={
                      isSubmitting || cartState.isLoading || isPromoOnlyCart
                    }
                    className={`py-3 md:py-4 lg:py-5 text-even-evergreen rounded-full cursor-pointer font-normal h-fit shrink-0 flex items-center justify-center text-base md:text-lg lg:text-xl active:scale-95 transition-transform ${
                      isSubmitting || cartState.isLoading || isPromoOnlyCart
                        ? "bg-even-grass opacity-50 cursor-not-allowed px-8 md:px-10 lg:px-12"
                        : "bg-even-grass px-8 md:px-10 lg:px-12 animate-pulse-button"
                    }`}
                  >
                    {isSubmitting || cartState.isLoading
                      ? t("loadingCta")
                      : tc("orderCta")}
                  </button>
                </div>
                {isPromoOnlyCart && (
                  <p className="text-right text-xs md:text-sm text-red-600 mt-2">
                    {t("promoOnlyWarning")}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <POSBlockedModal
        isOpen={showPOSModal}
        onClose={() => setShowPOSModal(false)}
        reason={posModalReason}
        restaurantName={restaurant?.name}
        restaurantLogo={restaurant?.logo_url}
      />
    </div>
  );
}
