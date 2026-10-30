"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, useEffect, useMemo } from "react";
import { Minus, Plus, ShoppingBag, ChevronDown } from "lucide-react";
import { useCart, CartItem } from "@/app/context/CartContext";
import { useTable } from "@/app/context/TableContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { getRestaurantData } from "@/app/utils/restaurantData";
import MenuHeaderBack from "@/app/components/headers/MenuHeaderBack";
import OrderAnimation from "@/app/components/UI/OrderAnimation";
import { useAuth } from "@/app/context/AuthContext";
import { useRestaurant } from "@/app/context/RestaurantContext";
import { useGuest } from "@/app/context/GuestContext";
import { useAgentStatus } from "@/app/hooks/useAgentStatus";
import POSBlockedModal from "@/app/components/POSBlockedModal";
import { authService } from "@/app/services/auth.service";
import { getItemDisplayPrice } from "@/app/utils/commissionCalculator";
import ItemCustomizations from "@/app/components/ItemCustomizations";
import { getBackendOrigin } from "@even/api-client";

// Perfil completo = tiene nombre Y fecha de nacimiento. Sin esto,
// handleConfirmOrder termina generando un nombre placeholder tipo
// "Usuario 1a2b3c4d" en vez de pedirle al usuario su nombre real.
const isProfileComplete = (
  profile?: { firstName?: string; birthDate?: string } | null,
) => !!profile?.firstName && !!profile?.birthDate;

export default function CartView() {
  const t = useTranslations("CartView");
  const tc = useTranslations("Common");
  const {
    state: cartState,
    updateQuantity,
    clearCart,
    orderNotes,
    setOrderNotes,
    updateOrderNotes,
  } = useCart();
  const { state: tableState, submitOrder } = useTable();
  const { navigateWithTable } = useTableNavigation();
  const restaurantData = getRestaurantData();
  const { user, isAuthenticated, isLoading, profile, refreshProfile } =
    useAuth();
  const { restaurantId, branchNumber, restaurant } = useRestaurant();
  const { guestName } = useGuest();
  const { agentStatus } = useAgentStatus(restaurantId, branchNumber);
  const hasActivePOS =
    agentStatus !== null && agentStatus.hasIntegration && agentStatus.isActive;
  const hasOnlyPromoItems =
    cartState.items.length > 0 &&
    cartState.items.every((item) => item.isPromoItem && !item.userDiscountId);
  const [showPOSModal, setShowPOSModal] = useState(false);
  const [posModalReason, setPosModalReason] = useState<
    "turno_closed" | "agent_disconnected" | "pos_open_untracked"
  >("turno_closed");

  // Si el usuario está autenticado pero el perfil no cargó (ej. error de red al
  // volver de fondo en móvil), intentar cargarlo para que el checkout funcione.
  useEffect(() => {
    if (!isLoading && user && !profile) {
      refreshProfile();
    }
  }, [isLoading, user, profile, refreshProfile]);

  const [notesOpen, setNotesOpen] = useState(false);
  const [showOrderAnimation, setShowOrderAnimation] = useState(false);
  const [orderedItems, setOrderedItems] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Señal para OrderAnimation: true solo una vez que handleConfirmOrder
  // confirmó el pedido de verdad contra el backend (ver OrderAnimation.tsx).
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Precio unitario ya con la comisión de Flex Bill incrustada (nunca se
  // persiste, solo se muestra) — la franja depende del precio del propio
  // ítem, así que es estable sin importar el resto del carrito.
  const displayUnitPrices = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cartState.items) {
      if (!item.cartItemId) continue;
      const unitPrice = item.price + (item.extraPrice || 0);
      map.set(item.cartItemId, getItemDisplayPrice(unitPrice));
    }
    return map;
  }, [cartState.items]);

  // Suma de (precio inflado × cantidad) por línea — es exactamente lo que
  // el cliente ve por línea, así que sumado a mano cierra contra este total.
  const cartDisplayTotal = useMemo(() => {
    let sum = 0;
    for (const item of cartState.items) {
      const unit =
        displayUnitPrices.get(item.cartItemId || "") ??
        item.price + (item.extraPrice || 0);
      sum += Math.round(unit * item.quantity * 100) / 100;
    }
    return Math.round(sum * 100) / 100;
  }, [cartState.items, displayUnitPrices]);

  const API_BASE_URL = getBackendOrigin(
    process.env.NEXT_PUBLIC_API_URL,
    "http://localhost:5000",
  );

  const handleOrder = async () => {
    if (hasOnlyPromoItems) return;

    if (hasActivePOS && restaurantId && branchNumber) {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/pos/restaurant/${restaurantId}/branch/${branchNumber}/attempt-order`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              identifier: `Mesa ${tableState.tableNumber}`,
              tableNumber: tableState.tableNumber,
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
        // network error — proceed
      }
    }

    // Si el usuario está loggeado Y su perfil está completo (nombre + fecha
    // de nacimiento), hacer la orden directamente con animación
    if (!isLoading && isAuthenticated && user && isProfileComplete(profile)) {
      setIsSubmitting(true);
      setOrderConfirmed(false);
      // Guardar items antes de que se limpie el carrito
      const itemsToOrder = [...cartState.items];
      setOrderedItems(itemsToOrder);
      // Mostrar animación de orden INMEDIATAMENTE (sin enviar la orden aún)
      setShowOrderAnimation(true);
    } else if (!isLoading && isAuthenticated && user) {
      // Autenticado pero con perfil incompleto — sin esto, la orden se
      // grababa igual pero con un nombre placeholder generado a partir del
      // id de usuario. Pedirle que complete su perfil antes de ordenar.
      console.log(
        "📱 User authenticated but profile incomplete, redirecting to /auth-selection",
      );
      navigateWithTable("/auth-selection");
    } else if (guestName) {
      // Si NO está loggeado pero ya tiene nombre de invitado, proceder con la orden
      console.log(
        "📱 User not authenticated but has guest name, proceeding with order",
      );
      setIsSubmitting(true);
      setOrderConfirmed(false);
      const itemsToOrder = [...cartState.items];
      setOrderedItems(itemsToOrder);
      setShowOrderAnimation(true);
    } else {
      // Si NO está loggeado y no tiene nombre, navegar a la vista de usuario para capturar su nombre
      console.log("📱 User not authenticated, redirecting to /user");
      navigateWithTable("/user");
    }
  };

  const handleContinueFromAnimation = () => {
    navigateWithTable("/order");
  };

  const handleCancelOrder = () => {
    console.log("❌ Order cancelled by user");
    setShowOrderAnimation(false);
    setOrderedItems([]);
    setIsSubmitting(false);
    setOrderConfirmed(false);
  };

  // Red de seguridad de OrderAnimation: la confirmación real nunca llegó
  // dentro del tiempo de espera — puede que sí se haya creado la orden, así
  // que no se afirma que falló, solo se saca al usuario de la pantalla
  // congelada y se le pide verificar antes de reintentar.
  const handleOrderTimeout = () => {
    setShowOrderAnimation(false);
    setIsSubmitting(false);
    alert(t("orderTimeoutAlert"));
  };

  const handleConfirmOrder = async () => {
    // Esta función se ejecuta después de que expira el período de cancelación
    if (orderedItems.length > 0) {
      // Determinar el nombre del usuario (autenticado o invitado)
      let userName: string;
      if (isAuthenticated && user) {
        // Defensiva: si el perfil en memoria todavía no trae nombre (puede
        // no haber propagado al AuthContext justo en este momento aunque ya
        // exista en el backend), reintentamos una vez antes de caer al
        // placeholder "Usuario <id>".
        let resolvedProfile = profile;
        if (!profile?.firstName) {
          try {
            const freshProfileResponse =
              (await authService.getMyProfile()) as any;
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
        userName = resolvedProfile?.firstName
          ? `${resolvedProfile.firstName}`.trim()
          : `${tc("defaultUserName")} ${user.id.substring(0, 8)}`;
      } else if (guestName) {
        userName = guestName;
      } else {
        console.error("No user name available for order");
        setShowOrderAnimation(false);
        setIsSubmitting(false);
        return;
      }

      try {
        // Enviar la orden a la API con branchNumber
        await submitOrder(
          userName,
          orderedItems,
          branchNumber?.toString(),
          orderNotes.trim() || null,
        );
        // Limpiar el carrito de la base de datos después de la orden exitosa
        // (fire-and-forget: clearCart ya atrapa sus propios errores
        // internamente y nunca los propaga, así que esperarla no aportaba
        // nada — solo agregaba latencia antes de confirmar el pedido)
        clearCart().catch((err) =>
          console.error("Error clearing cart after order:", err),
        );
        // El pedido ya se confirmó de verdad contra el backend — OrderAnimation
        // esperaba esta señal para avanzar a la pantalla de éxito.
        setOrderConfirmed(true);
      } catch (error) {
        console.error("Error submitting order:", error);
        // Si hay error, ocultar la animación y mostrar mensaje al usuario
        setShowOrderAnimation(false);
        const errorMessage =
          error instanceof Error ? error.message : t("errorUnknown");
        alert(t("orderSubmitError", { message: errorMessage }));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="min-h-screen brand-evergreen flex flex-col">
      <MenuHeaderBack
        restaurant={restaurantData}
        tableNumber={tableState.tableNumber}
      />

      <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col">
        <div className="left-4 right-4 bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
          {cartState.items.length === 0 ? (
            <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
              <h1 className="text-white/60 text-xl md:text-2xl lg:text-3xl font-medium">
                {tc("tableLabel", { table: tableState.tableNumber })}
              </h1>
              <h2 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight mt-2 md:mt-3 mb-6 md:mb-8">
                {t("emptyCartHero")}
              </h2>
            </div>
          ) : (
            <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
              <h1 className="text-white/60 text-xl md:text-2xl lg:text-3xl font-medium">
                {tc("tableLabel", { table: tableState.tableNumber })}
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
              className="flex-1 overflow-y-auto flex flex-col pb-[160px] md:pb-[180px] lg:pb-[200px]"
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
                      onClick={() => navigateWithTable("/menu")}
                      className="bg-even-grass text-even-evergreen font-medium text-base md:text-lg px-8 py-3 md:py-4 rounded-full transition-opacity hover:opacity-90 active:scale-95"
                    >
                      {t("viewMenuCta")}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-black font-medium text-sm md:text-base lg:text-lg flex gap-10 md:gap-12 lg:gap-[68px] justify-end translate-y-4">
                    <span>{t("qtyLabel")}</span>
                    <span>{t("priceLabel")}</span>
                  </div>
                  <div className="divide-y divide-stroke/50">
                    {cartState.items.map((item, index) => (
                      <div
                        key={`${item.id}-${index}`}
                        className="py-3 md:py-4 lg:py-5"
                      >
                        <div className="flex items-center justify-between">
                          <div
                            onClick={() =>
                              !(item.isPromoItem && !item.userDiscountId) &&
                              item.cartItemId &&
                              navigateWithTable(
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
                            <div className="flex-shrink-0">
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
                              <h3 className="text-base md:text-lg lg:text-xl text-black capitalize">
                                {item.name}
                              </h3>
                              {item.isPromoItem && (
                                <span className="inline-block mt-1 text-[10px] md:text-xs bg-even-grass/20 text-even-evergreen px-2 py-0.5 rounded-full uppercase tracking-wide">
                                  {t("promoBadge")}
                                </span>
                              )}
                              <ItemCustomizations
                                customFields={item.customFields}
                                note={item.specialInstructions}
                                formatPrice={(price) =>
                                  price *
                                  ((displayUnitPrices.get(
                                    item.cartItemId || "",
                                  ) ?? item.price + (item.extraPrice || 0)) /
                                    (item.price + (item.extraPrice || 0) || 1))
                                }
                              />
                            </div>
                          </div>
                          <div className="text-right flex items-center justify-center gap-4 md:gap-5 lg:gap-6">
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
                                    ? "opacity-30 cursor-not-allowed"
                                    : "cursor-pointer"
                                }`}
                              />
                            </div>
                            <div className="w-20 md:w-24 lg:w-28 text-right">
                              {item.isPromoItem &&
                                item.promoDiscountPercentage != null &&
                                item.promoDiscountPercentage < 100 && (
                                  <p className="text-xs md:text-sm text-gray-400 line-through">
                                    $
                                    {(
                                      item.price /
                                      (1 - item.promoDiscountPercentage / 100)
                                    ).toFixed(2)}
                                  </p>
                                )}
                              <p className="text-base md:text-lg lg:text-xl text-black">
                                $
                                {(
                                  displayUnitPrices.get(
                                    item.cartItemId || "",
                                  ) ?? item.price + (item.extraPrice || 0)
                                ).toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Comentarios Textarea - Dentro del scroll */}
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
                    <span className="text-gray-600 text-sm md:text-base lg:text-lg">
                      {t("itemsCount", { count: cartState.totalItems })}
                    </span>
                    <div className="flex items-center justify-center w-fit text-2xl md:text-3xl lg:text-4xl font-medium text-black text-center">
                      ${cartDisplayTotal.toFixed(2)}
                    </div>
                  </div>
                  <button
                    onClick={handleOrder}
                    disabled={
                      isSubmitting || cartState.isLoading || hasOnlyPromoItems
                    }
                    className={`py-3 md:py-4 lg:py-5 bg-even-grass text-even-evergreen rounded-full cursor-pointer font-normal h-fit shrink-0 flex items-center justify-center text-base md:text-lg lg:text-xl active:scale-95 transition-transform ${
                      isSubmitting || cartState.isLoading || hasOnlyPromoItems
                        ? "opacity-50 cursor-not-allowed px-8 md:px-10 lg:px-12"
                        : "px-8 md:px-10 lg:px-12 animate-pulse-button"
                    }`}
                  >
                    {isSubmitting || cartState.isLoading
                      ? t("loadingCta")
                      : tc("orderCta")}
                  </button>
                </div>
                {hasOnlyPromoItems && (
                  <p className="text-center text-sm text-red-600 pb-4">
                    {t("promoOnlyWarning")}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* OrderAnimation overlay - para usuarios loggeados o invitados con nombre */}
      {showOrderAnimation && (
        <OrderAnimation
          userName={profile?.firstName || guestName || tc("defaultUserName")}
          orderedItems={orderedItems}
          orderConfirmed={orderConfirmed}
          onTimeout={handleOrderTimeout}
          onContinue={handleContinueFromAnimation}
          onCancel={handleCancelOrder}
          onConfirm={handleConfirmOrder}
        />
      )}
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
