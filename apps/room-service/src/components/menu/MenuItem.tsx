"use client";

import {
  MenuItem as MenuItemDB,
  MenuItemData,
  CustomField,
} from "../../interfaces/menuItemData";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCart } from "../../context/CartContext";
import { useRoomNavigation } from "../../hooks/useRoomNavigation";
import { useFlyToCart } from "../../hooks/useFlyToCart";
import { useRestaurant } from "../../context/RestaurantContext";
import { Plus, Minus } from "lucide-react";
import { useRef, useState, useEffect, useMemo, memo } from "react";
import OutOfStockModal from "../OutOfStockModal";
import { rememberMenuPosition } from "../../utils/menuScrollMemory";
import { usePersonalItemDiscounts } from "../../hooks/usePersonalItemDiscounts";

interface MenuItemProps {
  item: MenuItemDB | MenuItemData;
  onRestaurantClosed?: () => void;
}

function MenuItem({ item, onRestaurantClosed }: MenuItemProps) {
  const tc = useTranslations("Common");
  // Adaptar el item de BD al formato legacy
  const adaptedItem: MenuItemData = useMemo(() => {
    // Si ya tiene el formato legacy, devolverlo tal cual
    if ("images" in item && "features" in item) {
      return item as MenuItemData;
    }

    // Convertir de formato BD a formato legacy
    const dbItem = item as MenuItemDB;
    return {
      id: dbItem.id,
      name: dbItem.name,
      description: dbItem.description || "",
      price: Number(dbItem.price),
      images: dbItem.image_url ? [dbItem.image_url] : [],
      discount: dbItem.discount,
      features: [], // Los custom_fields podrían mapearse aquí si es necesario
    };
  }, [item]);
  const { state: cartState, addItem, removeItem } = useCart();
  const { navigateWithRoom, getUrlWithRoom } = useRoomNavigation();
  const router = useRouter();
  const { flyToCart } = useFlyToCart();
  const { isOpen, restaurant, restaurantId } = useRestaurant();
  const showImages = !!restaurant && restaurant.menu_show_images !== false;
  const personalDiscounts = usePersonalItemDiscounts(restaurantId);
  const personalDiscount = personalDiscounts.get(adaptedItem.id);
  // Si el producto también tiene descuento de admin-portal, gana
  // el % mayor entre los dos — nunca se suman.
  const effectiveDiscount = Math.max(
    adaptedItem.discount || 0,
    personalDiscount?.percentage || 0,
  );
  const plusButtonRef = useRef<HTMLDivElement>(null);
  const isAddingRef = useRef(false);
  const isRemovingRef = useRef(false);
  const [localQuantity, setLocalQuantity] = useState(0);
  const [isPulsing, setIsPulsing] = useState(false);
  const [showOutOfStockModal, setShowOutOfStockModal] = useState(false);

  const isOutOfStock = useMemo(() => {
    if ("images" in item) return false;
    return (item as MenuItemDB).is_available === false;
  }, [item]);

  // Verificar si el item tiene custom fields obligatorios
  const hasRequiredCustomFields = useMemo(() => {
    const dbItem = item as MenuItemDB;
    if (dbItem.custom_fields) {
      let fields: CustomField[] = [];
      if (typeof dbItem.custom_fields === "string") {
        try {
          fields = JSON.parse(dbItem.custom_fields);
        } catch {
          return false;
        }
      } else if (Array.isArray(dbItem.custom_fields)) {
        fields = dbItem.custom_fields;
      }
      // Solo retorna true si hay al menos un campo obligatorio
      return fields.some((field: CustomField) => field.required === true);
    }
    return false;
  }, [item]);

  // Prefetch al entrar en pantalla (como <Link>) para que /dish abra con su loading al instante
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      router.prefetch(getUrlWithRoom(`/dish/${adaptedItem.id}`));
      observer.disconnect();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [adaptedItem.id, router, getUrlWithRoom, showImages]);

  const openDish = () => {
    if (cardRef.current) {
      rememberMenuPosition(String(restaurantId), String(adaptedItem.id), cardRef.current);
    }
    navigateWithRoom(`/dish/${adaptedItem.id}`);
  };

  const handleImageClick = openDish;

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Evitar clicks múltiples mientras se está agregando (usando ref para check síncrono)
    if (isAddingRef.current) {
      return;
    }

    // Verificar si el restaurante está abierto
    if (!isOpen) {
      onRestaurantClosed?.();
      return;
    }

    // Si tiene custom fields obligatorios, verificar si hay un último item guardado
    if (hasRequiredCustomFields) {
      const lastItemKey = `lastItem_${adaptedItem.id}`;
      const lastItemData = sessionStorage.getItem(lastItemKey);

      if (lastItemData) {
        // Si hay un último item guardado, agregarlo al carrito
        try {
          const lastItem = JSON.parse(lastItemData);

          isAddingRef.current = true;
          setLocalQuantity((prev) => prev + 1);
          setIsPulsing(true);

          try {
            if (plusButtonRef.current) {
              flyToCart(plusButtonRef.current, async () => {
                await addItem(lastItem);
              });
            } else {
              await addItem(lastItem);
            }
          } finally {
            isAddingRef.current = false;
          }
        } catch (error) {
          console.error("Error parsing last item:", error);
          openDish();
        }
      } else {
        // Si no hay último item, navegar a la página de detalle
        setIsPulsing(true);
        openDish();
      }
      return;
    }

    // Calcular precio con descuento aplicado (admin-portal y/o personal,
    // el que sea mayor — effectiveDiscount ya resuelve eso)
    const finalPrice =
      effectiveDiscount > 0
        ? adaptedItem.price * (1 - effectiveDiscount / 100)
        : adaptedItem.price;

    // Crear item con precio con descuento
    const itemWithDiscount = {
      ...adaptedItem,
      price: finalPrice,
      userDiscountId: personalDiscount?.id ?? null,
    };

    // Si no tiene custom fields, agregar directamente al carrito
    // Bloquear SÍNCRONAMENTE con ref antes de cualquier async
    isAddingRef.current = true;
    setLocalQuantity((prev) => prev + 1);
    setIsPulsing(true);

    try {
      if (plusButtonRef.current) {
        flyToCart(plusButtonRef.current, async () => {
          await addItem(itemWithDiscount);
        });
      } else {
        await addItem(itemWithDiscount);
      }
    } finally {
      isAddingRef.current = false;
    }
  };

  // Reset pulse animation
  useEffect(() => {
    if (isPulsing) {
      const timer = setTimeout(() => setIsPulsing(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isPulsing]);

  const handleRemoveFromCart = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Evitar clicks múltiples mientras se está removiendo (usando ref para check síncrono)
    if (isRemovingRef.current) {
      return;
    }

    // Si hay múltiples variaciones, navegar al carrito
    const itemsWithSameId = cartState.items.filter(
      (cartItem) => cartItem.id === adaptedItem.id,
    );
    if (itemsWithSameId.length > 1) {
      navigateWithRoom("/cart");
      return;
    }

    // Bloquear SÍNCRONAMENTE con ref antes de cualquier async
    isRemovingRef.current = true;

    // Update local quantity
    setLocalQuantity((prev) => Math.max(0, prev - 1));
    setIsPulsing(true);

    try {
      const cartItem = cartState.items.find(
        (cartItem) => cartItem.id === adaptedItem.id,
      );
      if (cartItem) {
        await removeItem(adaptedItem.id);
      }
    } finally {
      isRemovingRef.current = false;
    }
  };

  // Sumar todas las cantidades de items con el mismo id (considerando diferentes custom fields)
  const currentQuantity = cartState.items
    .filter((cartItem) => cartItem.id === adaptedItem.id)
    .reduce((sum, item) => sum + item.quantity, 0);

  // Sync local quantity with state
  const displayQuantity = Math.max(localQuantity, currentQuantity);

  if (!showImages) {
    const finalPrice = adaptedItem.price * (1 - effectiveDiscount / 100);
    return (
      <>
        <OutOfStockModal
          isOpen={showOutOfStockModal}
          onClose={() => setShowOutOfStockModal(false)}
          itemName={adaptedItem.name}
        />
        <div
          ref={cardRef}
          data-menu-item-id={adaptedItem.id}
          className="border-b border-gray-300 py-3 md:py-4 cursor-pointer"
          onClick={handleImageClick}
        >
          <div className="flex items-center gap-3 md:gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-base md:text-lg lg:text-xl font-medium text-black leading-tight capitalize line-clamp-1 wrap-break-word">
                  {adaptedItem.name}
                </h3>
                <div className="shrink-0 whitespace-nowrap">
                  {effectiveDiscount > 0 && (
                    <span className="text-xs md:text-sm text-black/40 line-through mr-1.5">
                      ${adaptedItem.price.toFixed(2)}
                    </span>
                  )}
                  <span className="text-base md:text-lg lg:text-xl font-medium text-black">
                    ${finalPrice.toFixed(2)}
                  </span>
                </div>
              </div>
              {(adaptedItem.description ||
                effectiveDiscount > 0 ||
                isOutOfStock) && (
                <div className="flex items-center gap-2 mt-0.5 md:mt-1">
                  <p className="flex-1 min-w-0 text-sm md:text-base text-black/50 line-clamp-1">
                    {adaptedItem.description}
                  </p>
                  {effectiveDiscount > 0 && (
                    <span className="shrink-0 bg-red-600 text-white text-[11px] md:text-xs font-bold px-2 py-0.5 tracking-wide">
                      {effectiveDiscount}% OFF
                    </span>
                  )}
                  {isOutOfStock && (
                    <span className="shrink-0 bg-red-600 text-white text-[11px] md:text-xs font-bold px-2 py-0.5 tracking-wide">
                      {tc("outOfStockBadge")}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div
              className={`flex shrink-0 items-center h-8 md:h-9 rounded-full border border-stroke/50 text-black transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${displayQuantity > 0 ? "px-3 md:px-4" : "px-2"} ${isPulsing ? "bg-even-grass/50 scale-110" : "bg-surface scale-100"}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={`flex items-center overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${displayQuantity > 0 ? "max-w-20 opacity-100 mr-1.5 md:mr-2" : "max-w-0 opacity-0 mr-0"}`}
              >
                <Minus
                  className={`size-4 md:size-5 shrink-0 transition-transform duration-300 ${displayQuantity > 0 ? "cursor-pointer rotate-0" : "-rotate-90"}`}
                  onClick={displayQuantity > 0 ? handleRemoveFromCart : undefined}
                />
                <p
                  key={displayQuantity}
                  className="ml-1.5 md:ml-2 font-normal text-base md:text-lg min-w-[1ch] text-center animate-qty-pop"
                >
                  {displayQuantity || 1}
                </p>
              </div>
              <div ref={plusButtonRef}>
                <Plus
                  className={`size-4 md:size-5 transition-transform duration-300 ${displayQuantity > 0 ? "rotate-0" : "rotate-90"} ${isOutOfStock ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
                  onClick={isOutOfStock ? () => setShowOutOfStockModal(true) : handleAddToCart}
                />
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <OutOfStockModal
        isOpen={showOutOfStockModal}
        onClose={() => setShowOutOfStockModal(false)}
        itemName={adaptedItem.name}
      />
      <div
        ref={cardRef}
        data-menu-item-id={adaptedItem.id}
        className="border-b border-gray-300 py-4 md:py-6 lg:py-7 relative"
        onClick={handleImageClick}
      >
        <div className="flex items-center gap-4 md:gap-5 lg:gap-6">
          {/* Image */}
          <div className="shrink-0 cursor-pointer">
            <div className="relative size-36 md:size-40 lg:size-44 bg-gray-300 rounded-xl md:rounded-2xl flex items-center justify-center hover:scale-105 transition-transform duration-200">
              {adaptedItem.images[0] ? (
                <img
                  src={adaptedItem.images[0]}
                  alt="Dish preview"
                  loading="lazy"
                  className="w-full h-full object-cover rounded-xl md:rounded-2xl"
                />
              ) : (
                <img
                  src={"/even/even-asterisk-evergreen.svg"}
                  alt="Logo Even"
                  loading="lazy"
                  className="size-18 md:size-20 lg:size-22 object-contain"
                />
              )}
              {effectiveDiscount > 0 && (
                <div className="absolute top-0 left-0 rounded-tl-xl md:rounded-tl-2xl overflow-hidden">
                  <span className="block bg-red-600 text-white text-[11px] md:text-xs font-bold px-2 pt-1 pb-0.5 tracking-wide">
                    {effectiveDiscount}% OFF
                  </span>
                </div>
              )}
              {isOutOfStock && (
                <div className="absolute bottom-0 right-0 rounded-br-xl md:rounded-br-2xl overflow-hidden">
                  <span className="block bg-red-600 text-white text-[12px] md:text-xs font-bold px-2 py-0.5 tracking-wide">
                    {tc("outOfStockBadge")}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between">
              <h3 className="text-lg md:text-xl lg:text-2xl font-medium text-black leading-tight capitalize line-clamp-2 warp-break-words">
                {adaptedItem.name}
              </h3>
              <div
                className={`flex gap-1.5 md:gap-2 px-3 md:px-4 lg:px-5 py-0.5 md:py-1 h-fit rounded-full border items-center justify-center border-stroke/50 text-black transition-all ${isPulsing ? "bg-even-grass/50" : "bg-surface"}`}
                onClick={(e) => e.stopPropagation()}
              >
                <Minus
                  className={`size-4 md:size-5 lg:size-6 ${displayQuantity > 0 ? "cursor-pointer" : "cursor-no-drop"}`}
                  onClick={
                    displayQuantity > 0 ? handleRemoveFromCart : undefined
                  }
                />
                <p className="font-normal text-base md:text-lg lg:text-xl">
                  {displayQuantity}
                </p>
                <div ref={plusButtonRef}>
                  <Plus
                    className={`size-4 md:size-5 lg:size-6 ${isOutOfStock ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
                    onClick={
                      isOutOfStock
                        ? () => setShowOutOfStockModal(true)
                        : handleAddToCart
                    }
                  />
                </div>
              </div>
            </div>
            {adaptedItem.features.length > 0 && (
              <div className="flex gap-1 md:gap-1.5 mt-1 md:mt-2 mb-3 md:mb-4">
                {adaptedItem.features.map((feature, index) => (
                  <div
                    key={index}
                    className="text-sm md:text-base lg:text-lg text-black font-medium border border-stroke-soft/50 rounded-3xl px-3 md:px-4 py-1 md:py-1.5 shadow-sm"
                  >
                    {feature}
                  </div>
                ))}
              </div>
            )}
            <p className="text-base md:text-lg lg:text-xl line-clamp-3 leading-4 md:leading-5 lg:leading-6 text-black/70">
              {adaptedItem.description}
            </p>
            <div className="flex items-center justify-between mt-2 md:mt-3">
              {effectiveDiscount > 0 ? (
                <div className="text-base md:text-lg lg:text-xl text-black flex flex-col">
                  <div>
                    <span className="text-black line-through text-xs md:text-sm lg:text-base">
                      ${adaptedItem.price} MXN
                    </span>
                  </div>
                  <div className="-translate-y-1">
                    $
                    {(
                      adaptedItem.price *
                      (1 - effectiveDiscount / 100)
                    ).toFixed(2)}{" "}
                    MXN
                  </div>
                </div>
              ) : (
                <span className="text-base md:text-lg lg:text-xl text-black">
                  ${adaptedItem.price.toFixed(2)} MXN
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default memo(MenuItem);
