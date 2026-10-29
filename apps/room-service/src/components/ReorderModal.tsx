"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { X, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCart, CartItem } from "../context/CartContext";
import type { MenuItemData, MenuItem } from "../interfaces/menuItemData";
import { useRoomNavigation } from "../hooks/useRoomNavigation";
import { useRestaurant } from "../context/RestaurantContext";
import RestaurantClosedModal from "./RestaurantClosedModal";
import OutOfStockModal from "./OutOfStockModal";
import ItemCustomizations from "@/components/ItemCustomizations";

export interface ReorderItem {
  item: string;
  price: number;
  extra_price: number;
  images: string[];
  custom_fields: any;
  special_instructions?: string | null;
}

interface ReorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ReorderItem[];
}

function ReorderModal({ isOpen, onClose, items }: ReorderModalProps) {
  const t = useTranslations("ReorderModal");
  const tc = useTranslations("Common");
  const { state: cartState, addItem, removeItem, updateQuantity } = useCart();
  const { navigateWithRoom } = useRoomNavigation();
  const { isOpen: restaurantIsOpen, restaurant, menu } = useRestaurant();
  const [showClosedModal, setShowClosedModal] = useState(false);
  const [showOutOfStockModal, setShowOutOfStockModal] = useState(false);
  const [outOfStockItemName, setOutOfStockItemName] = useState<
    string | undefined
  >(undefined);

  const preModalItemIds = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (isOpen) {
      preModalItemIds.current = new Set(cartState.items.map((i) => i.id));
    }
  }, [isOpen]);

  // Busca el item del menú actual por nombre (case-insensitive)
  const getMenuItemByName = (name: string): MenuItem | undefined => {
    if (!name) return undefined;
    const nameLower = name.toLowerCase();
    for (const section of menu ?? []) {
      const found = section.items?.find(
        (i) => i.name?.toLowerCase() === nameLower,
      );
      if (found) return found;
    }
    return undefined;
  };

  // Items únicos por nombre + enriquecidos con datos del menú actual
  const uniqueItems = useMemo(() => {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (!item?.item) return false;
      const key = item.item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [items]);

  const getCartItem = (menuItemId: number): CartItem | undefined =>
    cartState.items.find((i) => i.id === menuItemId);

  const handleClose = () => {
    const idsToRemove = cartState.items
      .filter((item) => !preModalItemIds.current.has(item.id))
      .map((item) => item.id);
    onClose();
    void Promise.all(idsToRemove.map((id) => removeItem(id)));
  };

  const handleCardTap = async (item: ReorderItem) => {
    if (!restaurantIsOpen) {
      setShowClosedModal(true);
      return;
    }
    const menuItem = getMenuItemByName(item.item);
    if (!menuItem) return;
    if (!menuItem.is_available) {
      setOutOfStockItemName(item.item);
      setShowOutOfStockModal(true);
      return;
    }

    const cartItem = getCartItem(menuItem.id);
    if (!cartItem || cartItem.quantity === 0) {
      const menuItemData: MenuItemData = {
        id: menuItem.id,
        name: menuItem.name,
        description: menuItem.description || "",
        price: menuItem.price,
        images: menuItem.image_url ? [menuItem.image_url] : item.images || [],
        features: [],
        discount: menuItem.discount,
        customFields:
          (item.custom_fields as MenuItemData["customFields"]) ?? [],
        extraPrice: item.extra_price,
      };
      await addItem(menuItemData, 1, item.special_instructions ?? null);
    }
  };

  const handleDecrement = async (e: React.MouseEvent, item: ReorderItem) => {
    e.stopPropagation();
    const menuItem = getMenuItemByName(item.item);
    if (!menuItem) return;
    const cartItem = getCartItem(menuItem.id);
    if (!cartItem) return;
    if (cartItem.quantity <= 1) {
      await removeItem(cartItem.id);
    } else {
      await updateQuantity(cartItem.cartItemId!, cartItem.quantity - 1);
    }
  };

  const handleIncrement = async (e: React.MouseEvent, item: ReorderItem) => {
    e.stopPropagation();
    if (!restaurantIsOpen) {
      setShowClosedModal(true);
      return;
    }
    const menuItem = getMenuItemByName(item.item);
    if (!menuItem) return;
    if (!menuItem.is_available) {
      setOutOfStockItemName(item.item);
      setShowOutOfStockModal(true);
      return;
    }
    const cartItem = getCartItem(menuItem.id);
    if (!cartItem) {
      await handleCardTap(item);
    } else {
      await updateQuantity(cartItem.cartItemId!, cartItem.quantity + 1);
    }
  };

  const handleToggle = async (e: React.MouseEvent, item: ReorderItem) => {
    e.stopPropagation();
    const menuItem = getMenuItemByName(item.item);
    if (!menuItem) return;
    const cartItem = getCartItem(menuItem.id);
    if (cartItem && cartItem.quantity > 0) {
      await removeItem(cartItem.id);
    } else {
      await handleCardTap(item);
    }
  };

  const hasSelection = uniqueItems.some((item) => {
    const menuItem = getMenuItemByName(item.item);
    return menuItem ? (getCartItem(menuItem.id)?.quantity ?? 0) > 0 : false;
  });

  const subtotal = useMemo(
    () =>
      uniqueItems.reduce((sum, item) => {
        const menuItem = getMenuItemByName(item.item);
        if (!menuItem) return sum;
        const qty = getCartItem(menuItem.id)?.quantity ?? 0;
        return sum + qty * (menuItem.price + (item.extra_price || 0));
      }, 0),
    [uniqueItems, cartState.items, menu],
  );

  const [isNavigating, setIsNavigating] = useState(false);

  const handleConfirm = () => {
    setIsNavigating(true);
    navigateWithRoom("/order-confirm");
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
        className="fixed inset-0 bg-black/25 backdrop-blur-xs z-999 flex items-center justify-center"
        onClick={handleClose}
      >
        <div
          className="relative bg-even-evergreen/80 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] w-full mx-4 md:mx-12 lg:mx-28 rounded-4xl max-h-[65vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="shrink-0">
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
              <p className="text-sm text-white mt-0.5">{t("subtitle")}</p>
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
                {uniqueItems.map((item, index) => {
                  const menuItem = getMenuItemByName(item.item);
                  const isUnavailable = !menuItem || !menuItem.is_available;
                  const qty = menuItem
                    ? (getCartItem(menuItem.id)?.quantity ?? 0)
                    : 0;
                  const isSelected = qty > 0;

                  const customFields = item.custom_fields as
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
                      key={`${item.item}-${index}`}
                      onClick={() => !isUnavailable && handleCardTap(item)}
                      className={`flex items-center gap-3 md:gap-4 rounded-xl md:rounded-2xl p-3 md:p-4 border transition-all duration-200 ${
                        isUnavailable
                          ? "opacity-50 cursor-not-allowed bg-white/5 border-white/10"
                          : isSelected
                            ? "cursor-pointer bg-white/10 border-even-grass/70"
                            : "cursor-pointer bg-white/5 border-white/10"
                      }`}
                    >
                      {/* Checkbox */}
                      <div
                        className="shrink-0 self-center"
                        onClick={(e) => !isUnavailable && handleToggle(e, item)}
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
                      <div className="shrink-0 relative">
                        <div className="size-16 md:size-20 rounded-sm overflow-hidden bg-gray-300">
                          {menuItem?.image_url ||
                          (item.images?.length > 0 && item.images[0]) ? (
                            <img
                              src={menuItem?.image_url || item.images[0]}
                              alt={item.item}
                              className={`w-full h-full object-cover ${isUnavailable ? "blur-sm" : ""}`}
                            />
                          ) : (
                            <img
                              src="/even/even-asterisk-evergreen.svg"
                              alt="Logo Even"
                              className={`w-full h-full object-contain p-2 ${isUnavailable ? "blur-sm" : ""}`}
                            />
                          )}
                        </div>
                        {isUnavailable && (
                          <div className="absolute bottom-0.5 left-0.5">
                            <span className="bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full tracking-wide">
                              {t("unavailableBadge")}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base md:text-lg text-white font-medium capitalize">
                          {item.item}
                        </h3>
                        <ItemCustomizations
                          customFields={customFields}
                          variant="dark"
                          className="mt-0.5"
                        />
                        <p className="text-xs md:text-sm text-white/60 mt-1">
                          $
                          {(
                            (menuItem?.price ?? item.price) +
                            (item.extra_price || 0)
                          ).toFixed(2)}
                        </p>
                      </div>

                      {/* Quantity controls */}
                      {isSelected && (
                        <div
                          className="flex items-center shrink-0 self-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={(e) => handleDecrement(e, item)}
                            disabled={cartState.isLoading}
                            className="flex items-center justify-center size-7 md:size-8 rounded-full hover:bg-white/10 transition-colors disabled:opacity-30"
                          >
                            <Minus className="size-4 md:size-5 text-white" />
                          </button>
                          <span className="text-base md:text-lg text-white w-6 text-center">
                            {qty}
                          </span>
                          <button
                            onClick={(e) => handleIncrement(e, item)}
                            disabled={cartState.isLoading}
                            className="flex items-center justify-center size-7 md:size-8 rounded-full hover:bg-white/10 transition-colors disabled:opacity-30"
                          >
                            <Plus className="size-4 md:size-5 text-white" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 px-6 md:px-8 lg:px-10 py-4 md:py-5 border-t border-white/20">
            {hasSelection && (
              <p className="text-white/70 text-sm md:text-base text-right mb-3">
                {t("subtotalLabel")}{" "}
                <span className="text-white font-semibold">
                  ${subtotal.toFixed(2)}
                </span>
              </p>
            )}
            <button
              onClick={handleConfirm}
              disabled={!hasSelection || cartState.isLoading || isNavigating}
              className="w-full bg-even-grass text-even-evergreen rounded-full py-3 md:py-4 text-base md:text-lg font-medium transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
            >
              {(cartState.isLoading || isNavigating) && (
                <span className="size-4 md:size-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {tc("orderCta")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default ReorderModal;
