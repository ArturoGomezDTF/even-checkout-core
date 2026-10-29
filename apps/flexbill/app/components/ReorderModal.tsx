"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { X, Minus, Plus } from "lucide-react";
import type { DishOrder } from "@/app/services/table.service";
import { useCart, CartItem } from "@/app/context/CartContext";
import { useTable } from "@/app/context/TableContext";
import { useAuth } from "@/app/context/AuthContext";
import { useRestaurant } from "@/app/context/RestaurantContext";
import { useGuest } from "@/app/context/GuestContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import OrderAnimation from "@/app/components/UI/OrderAnimation";
import RestaurantClosedModal from "@/app/components/RestaurantClosedModal";
import OutOfStockModal from "@/app/components/OutOfStockModal";
import { getItemDisplayPrice } from "@/app/utils/commissionCalculator";
import ItemCustomizations from "@/app/components/ItemCustomizations";

interface ReorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  dishOrders: DishOrder[];
  tableNumber?: string;
}

// Normaliza customFields para el dedup de abajo — ignora diferencias que no
// cambian el producto real (p.ej. `null` vs `[]` según de qué user_order vino
// el dish_order) ordenando fieldId/optionIds en vez de comparar JSON crudo.
// Así, dos platillos idénticos pedidos por comensales distintos de la misma
// mesa colapsan en UNA sola tarjeta en vez de aparecer duplicados.
function getCustomFieldsKey(customFields: any): string {
  const fields = ((customFields || []) as any[])
    .map((f: any) => ({
      fieldId: f.fieldId,
      options: ((f.selectedOptions || []) as any[])
        .map((o: any) => o.optionId)
        .sort(),
    }))
    .sort((a, b) => String(a.fieldId).localeCompare(String(b.fieldId)));
  return JSON.stringify(fields);
}

function ReorderModal({
  isOpen,
  onClose,
  dishOrders,
  tableNumber,
}: ReorderModalProps) {
  const t = useTranslations("ReorderModal");
  const tc = useTranslations("Common");
  const { state: cartState, addItem, removeItem, updateQuantity } = useCart();
  const { submitOrder } = useTable();
  const { user, isAuthenticated, isLoading: authLoading, profile } = useAuth();
  const {
    branchNumber,
    isOpen: restaurantIsOpen,
    restaurant,
    menu,
  } = useRestaurant();
  const { guestName } = useGuest();
  const { navigateWithTable } = useTableNavigation();

  const [showOrderAnimation, setShowOrderAnimation] = useState(false);
  const [orderedItems, setOrderedItems] = useState<CartItem[]>([]);
  // Señal para OrderAnimation: true solo una vez que handleConfirmOrder
  // confirmó el pedido de verdad contra el backend (ver OrderAnimation.tsx).
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showClosedModal, setShowClosedModal] = useState(false);
  const [showOutOfStockModal, setShowOutOfStockModal] = useState(false);
  const [outOfStockItemName, setOutOfStockItemName] = useState<
    string | undefined
  >(undefined);

  // Snapshot of cart item IDs that existed before the modal opened
  const preModalCartIds = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (isOpen) {
      preModalCartIds.current = new Set(cartState.items.map((i) => i.id));
    }
  }, [isOpen]);

  const handleClose = async () => {
    const modalItemIds = new Set(
      uniqueItems.map(({ order }) => order.menu_item_id),
    );
    const itemsToRemove = cartState.items.filter(
      (item) =>
        modalItemIds.has(item.id) && !preModalCartIds.current.has(item.id),
    );
    for (const item of itemsToRemove) {
      await removeItem(item.id);
    }
    onClose();
  };

  const uniqueItems = useMemo(() => {
    const seen = new Set<string>();
    const result: { key: string; order: DishOrder }[] = [];
    for (const order of dishOrders) {
      if (!order.menu_item_id) continue;
      // Un platillo de promo se reclamó a precio $0/descontado por una
      // activación puntual — no tiene sentido "reordenarlo" (no hay
      // activación vigente que reaplique ese precio).
      if (order.is_promo_item) continue;
      const key = `${order.menu_item_id}_${getCustomFieldsKey(order.custom_fields)}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ key, order });
      }
    }
    return result;
  }, [dishOrders]);

  const outOfStockIds = useMemo(() => {
    const ids = new Set<number>();
    for (const section of menu ?? []) {
      for (const item of section.items ?? []) {
        if (item.is_out_of_stock) ids.add(item.id);
      }
    }
    return ids;
  }, [menu]);

  const getCartItem = (menuItemId: number) =>
    cartState.items.find((i) => i.id === menuItemId);

  // Un mismo producto puede tener 2 líneas en el carrito: una de promo
  // (cantidad fija en 1) y otra a precio normal. Sumamos ambas para mostrar
  // la cantidad real seleccionada en este modal.
  const getCartItemsForId = (menuItemId: number) =>
    cartState.items.filter((i) => i.id === menuItemId);

  const getSelectedQuantity = (menuItemId: number) =>
    getCartItemsForId(menuItemId).reduce((sum, i) => sum + i.quantity, 0);

  const handleCardTap = async (order: DishOrder) => {
    if (!restaurantIsOpen) {
      setShowClosedModal(true);
      return;
    }
    if (outOfStockIds.has(order.menu_item_id!)) {
      setOutOfStockItemName(order.item);
      setShowOutOfStockModal(true);
      return;
    }
    const cartItem = getCartItem(order.menu_item_id!);
    if (!cartItem || cartItem.quantity === 0) {
      await addItem({
        id: order.menu_item_id!,
        name: order.item,
        description: "",
        price: order.price,
        images: order.images,
        features: [],
        discount: 0,
        customFields: order.custom_fields || [],
        extraPrice: order.extra_price || 0,
      });
    }
  };

  const handleDecrement = async (order: DishOrder) => {
    const matches = getCartItemsForId(order.menu_item_id!);
    if (matches.length === 0) return;
    if (matches.length > 1) {
      // Hay más de una línea para este producto (p.ej. una de promo + una a
      // precio normal) — para no arriesgar tocar la línea equivocada, se
      // resuelve desde el carrito completo.
      onClose();
      navigateWithTable("/cart");
      return;
    }
    const cartItem = matches[0];
    if (cartItem.quantity <= 1) {
      await removeItem(cartItem.id);
    } else {
      await updateQuantity(cartItem.cartItemId!, cartItem.quantity - 1);
    }
  };

  const handleIncrement = async (order: DishOrder) => {
    if (!restaurantIsOpen) {
      setShowClosedModal(true);
      return;
    }
    if (outOfStockIds.has(order.menu_item_id!)) {
      setOutOfStockItemName(order.item);
      setShowOutOfStockModal(true);
      return;
    }
    const normalLine = getCartItemsForId(order.menu_item_id!).find(
      (i) => !i.isPromoItem,
    );
    if (normalLine) {
      await updateQuantity(normalLine.cartItemId!, normalLine.quantity + 1);
      return;
    }
    // No hay línea a precio normal todavía (puede que ya exista una de
    // promo) — se agrega como línea nueva; la firma que distingue
    // isPromoItem evita que se mezcle con la de promo.
    await addItem({
      id: order.menu_item_id!,
      name: order.item,
      description: "",
      price: order.price,
      images: order.images,
      features: [],
      discount: 0,
      customFields: order.custom_fields || [],
      extraPrice: order.extra_price || 0,
    });
  };

  const hasSelection = uniqueItems.some(
    ({ order }) => getSelectedQuantity(order.menu_item_id!) > 0,
  );

  const subtotal = useMemo(
    () =>
      uniqueItems.reduce((sum, { order }) => {
        const qty = getSelectedQuantity(order.menu_item_id!);
        return (
          sum +
          qty * getItemDisplayPrice(order.price + (order.extra_price || 0))
        );
      }, 0),
    [uniqueItems, cartState.items],
  );

  const handleReorder = () => {
    const modalItemIds = new Set(
      uniqueItems.map(({ order }) => order.menu_item_id),
    );
    const itemsToOrder = cartState.items.filter(
      (item) => modalItemIds.has(item.id) && item.quantity > 0,
    );
    if (itemsToOrder.length === 0) return;

    if (!authLoading && isAuthenticated && user) {
      setIsSubmitting(true);
      setOrderConfirmed(false);
      setOrderedItems(itemsToOrder);
      setShowOrderAnimation(true);
    } else if (guestName) {
      setIsSubmitting(true);
      setOrderConfirmed(false);
      setOrderedItems(itemsToOrder);
      setShowOrderAnimation(true);
    } else {
      navigateWithTable("/user");
    }
  };

  const handleConfirmOrder = async () => {
    if (orderedItems.length === 0) return;

    let userName: string;
    if (isAuthenticated && user) {
      userName = profile?.firstName
        ? `${profile.firstName}`.trim()
        : `${tc("defaultUserName")} ${user.id.substring(0, 8)}`;
    } else if (guestName) {
      userName = guestName;
    } else {
      setShowOrderAnimation(false);
      setIsSubmitting(false);
      return;
    }

    try {
      await submitOrder(userName, orderedItems, branchNumber?.toString(), null);
      // Fire-and-forget: quitar los items del carrito es housekeeping, no
      // debe bloquear la confirmación si el pedido ya se creó con éxito.
      Promise.all(orderedItems.map((item) => removeItem(item.id))).catch(
        (err) => console.error("Error removing reordered items from cart:", err),
      );
      // El pedido ya se confirmó de verdad contra el backend — OrderAnimation
      // esperaba esta señal para avanzar a la pantalla de éxito.
      setOrderConfirmed(true);
    } catch (error) {
      console.error("Error submitting order:", error);
      setShowOrderAnimation(false);
      const errorMessage =
        error instanceof Error ? error.message : t("errorUnknown");
      alert(t("orderSubmitError", { message: errorMessage }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinueFromAnimation = () => {
    navigateWithTable("/order");
  };

  const handleCancelOrder = () => {
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

  if (!isOpen) return null;

  return (
    <>
      <RestaurantClosedModal
        isOpen={showClosedModal}
        onClose={() => setShowClosedModal(false)}
        openingHours={restaurant?.opening_hours}
        restaurantName={restaurant?.name}
        restaurantLogo={restaurant?.logo_url}
      />
      <OutOfStockModal
        isOpen={showOutOfStockModal}
        onClose={() => setShowOutOfStockModal(false)}
        itemName={outOfStockItemName}
      />
      <div
        className="fixed inset-0 bg-black/25 backdrop-blur-xs z-[999] flex items-center justify-center"
        onClick={handleClose}
      >
        <div
          className="relative bg-even-evergreen/80 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] w-full mx-4 md:mx-12 lg:mx-28 rounded-4xl max-h-[65vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-shrink-0">
            <div className="w-full flex justify-end">
              <button
                onClick={handleClose}
                className="p-2 md:p-3 lg:p-4 hover:bg-white/10 rounded-lg md:rounded-xl transition-colors mt-3 md:mt-4 lg:mt-5 mr-3 md:mr-4 lg:mr-5"
              >
                <X className="w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 text-white" />
              </button>
            </div>
            <div className="px-6 md:px-8 lg:px-10 pb-4 md:pb-5 flex flex-col">
              <h2 className="text-lg md:text-xl lg:text-2xl text-white font-semibold leading-snug">
                {tc("reorderCta")}
              </h2>
              {tableNumber && (
                <p className="text-sm md:text-base text-white/60 mt-0.5">
                  {tc("tableLabel", { table: tableNumber })}
                </p>
              )}
              <p className="text-sm text-white mt-0.5">
                {t("subtitle")}
              </p>
            </div>
            <div className="border-t border-white/20" />
          </div>

          {/* Items list */}
          <div className="flex-1 overflow-y-auto px-6 md:px-8 lg:px-10 py-4 md:py-5">
            {uniqueItems.length === 0 ? (
              <p className="text-white/70 text-base md:text-lg text-center py-8">
                {t("noItemsAvailable")}
              </p>
            ) : (
              <div className="space-y-3 md:space-y-4">
                {uniqueItems.map(({ key, order }) => {
                  const qty = getSelectedQuantity(order.menu_item_id!);
                  const isSelected = qty > 0;
                  const itemIsOutOfStock = outOfStockIds.has(
                    order.menu_item_id!,
                  );

                  const customFields = order.custom_fields as
                    | Array<{
                        fieldId: string;
                        fieldName: string;
                        selectedOptions: Array<{
                          optionId: string;
                          optionName: string;
                          price: number;
                          quantity?: number;
                        }>;
                      }>
                    | null
                    | undefined;

                  return (
                    <div
                      key={key}
                      onClick={() => handleCardTap(order)}
                      className={`flex items-center gap-3 md:gap-4 rounded-xl md:rounded-2xl p-3 md:p-4 border transition-all duration-200 ${
                        itemIsOutOfStock
                          ? "opacity-50 cursor-not-allowed bg-white/5 border-white/10"
                          : isSelected
                            ? "cursor-pointer bg-white/10 border-even-grass/70"
                            : "cursor-pointer bg-white/5 border-white/10"
                      }`}
                    >
                      {/* Checkbox */}
                      <div
                        className="flex-shrink-0 self-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSelected) {
                            const matches = getCartItemsForId(
                              order.menu_item_id!,
                            );
                            if (matches.length > 1) {
                              onClose();
                              navigateWithTable("/cart");
                              return;
                            }
                            if (matches[0]) removeItem(matches[0].id);
                          } else {
                            handleCardTap(order);
                          }
                        }}
                      >
                        <div
                          className={`size-4 md:size-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                            isSelected
                              ? "bg-even-grass border-even-grass"
                              : "bg-transparent border-white/40"
                          }`}
                        >
                          {isSelected && (
                            <div className="size-1.5 md:size-2 rounded-full bg-white" />
                          )}
                        </div>
                      </div>

                      {/* Image */}
                      <div className="flex-shrink-0 relative">
                        <div className="size-16 md:size-20 rounded-sm overflow-hidden bg-gray-300">
                          {order.images &&
                          order.images.length > 0 &&
                          order.images[0] ? (
                            <img
                              src={order.images[0]}
                              alt={order.item}
                              className={`w-full h-full object-cover ${itemIsOutOfStock ? "blur-sm" : ""}`}
                            />
                          ) : (
                            <img
                              src="/even/even-asterisk-evergreen.svg"
                              alt="Logo Even"
                              className={`w-full h-full object-contain p-2 ${itemIsOutOfStock ? "blur-sm" : ""}`}
                            />
                          )}
                        </div>
                        {itemIsOutOfStock && (
                          <div className="absolute bottom-0.5 left-0.5">
                            <span className="bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full tracking-wide">
                              {tc("outOfStockBadge")}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base md:text-lg text-white font-medium capitalize">
                          {order.item}
                        </h3>
                        <ItemCustomizations
                          customFields={customFields}
                          variant="dark"
                          formatPrice={(price) =>
                            price *
                            (getItemDisplayPrice(order.price + (order.extra_price || 0)) /
                              (order.price + (order.extra_price || 0) || 1))
                          }
                          className="mt-0.5"
                        />
                        <p className="text-xs md:text-sm text-white/60 mt-1">
                          $
                          {getItemDisplayPrice(
                            order.price + (order.extra_price || 0),
                          ).toFixed(2)}
                        </p>
                      </div>

                      {/* Quantity controls — visible cuando qty > 0 */}
                      {isSelected ? (
                        <div
                          className="flex items-center flex-shrink-0 self-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleDecrement(order)}
                            disabled={cartState.isLoading}
                            className="flex items-center justify-center size-7 md:size-8 rounded-full hover:bg-white/10 transition-colors disabled:opacity-30"
                          >
                            <Minus className="size-4 md:size-5 text-white" />
                          </button>
                          <span className="text-base md:text-lg text-white w-6 text-center">
                            {qty}
                          </span>
                          <button
                            onClick={() => handleIncrement(order)}
                            disabled={cartState.isLoading}
                            className="flex items-center justify-center size-7 md:size-8 rounded-full hover:bg-white/10 transition-colors disabled:opacity-30"
                          >
                            <Plus className="size-4 md:size-5 text-white" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-6 md:px-8 lg:px-10 py-4 md:py-5 border-t border-white/20">
            {hasSelection && (
              <p className="text-white/70 text-sm md:text-base text-right mb-3">
                {t("subtotalLabel")}{" "}
                <span className="text-white font-semibold">
                  ${subtotal.toFixed(2)}
                </span>
              </p>
            )}
            <button
              onClick={handleReorder}
              disabled={!hasSelection || isSubmitting || cartState.isLoading}
              className="w-full bg-even-grass text-even-evergreen rounded-full py-3 md:py-4 text-base md:text-lg font-medium transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
            >
              {(isSubmitting || cartState.isLoading) && (
                <span className="size-4 md:size-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {isSubmitting ? t("sendingCta") : tc("reorderCta")}
            </button>
          </div>
        </div>
      </div>

      {showOrderAnimation && (
        <OrderAnimation
          userName={profile?.firstName || guestName || tc("defaultUserName")}
          orderedItems={orderedItems}
          orderConfirmed={orderConfirmed}
          onTimeout={handleOrderTimeout}
          onConfirm={handleConfirmOrder}
          onContinue={handleContinueFromAnimation}
          onCancel={handleCancelOrder}
        />
      )}
    </>
  );
}

export default ReorderModal;
