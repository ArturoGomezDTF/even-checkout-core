"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTable } from "../../context/TableContext";
import { useRestaurant } from "../../context/RestaurantContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { useAuth } from "@/app/context/AuthContext";
import { DishOrder } from "@/app/types/order";
import { useTranslations } from "next-intl";

interface OrderAnimationProps {
  userName?: string;
  orderedItems?: DishOrder[];
  // Null/undefined mientras el pago todavía no se confirma de verdad contra
  // el backend — la pantalla de éxito y la navegación esperan a esto en vez
  // de un tiempo fijo, para no desincronizarse de un pago lento.
  orderId?: string | null;
  onContinue?: () => void;
  onCancel?: () => void;
  onConfirm?: () => void;
  // Se dispara si la confirmación real nunca llega dentro de un tiempo
  // razonable (red de seguridad) — así la pantalla nunca se queda congelada
  // esperando para siempre.
  onTimeout?: () => void;
}

const OrderAnimation = ({
  userName,
  orderedItems,
  orderId,
  onContinue,
  onCancel,
  onConfirm,
  onTimeout,
}: OrderAnimationProps) => {
  const t = useTranslations("OrderAnimation");
  const tc = useTranslations("Common");
  const { navigateWithTable } = useTableNavigation();
  const { state } = useTable();
  const { restaurant } = useRestaurant();
  const { profile } = useAuth();

  const onConfirmRef = useRef(onConfirm);
  useEffect(() => {
    onConfirmRef.current = onConfirm;
  }, [onConfirm]);

  const onContinueRef = useRef(onContinue);
  useEffect(() => {
    onContinueRef.current = onContinue;
  }, [onContinue]);

  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const [animationState, setAnimationState] = useState<
    "circle" | "content" | "greenCircle" | "success"
  >("circle");
  const [logoColorful, setLogoColorful] = useState(false);
  const [showCancelButton, setShowCancelButton] = useState(true);

  const displayName = userName || profile?.firstName || tc("defaultUserName");
  const displayItems = orderedItems || [];
  const displayRestaurant = restaurant?.name || t("restaurantLabel");

  const userImage = profile?.photoUrl;
  const hasUserImage = !!userImage;

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

  // Prevenir recarga de página durante la animación
  useEffect(() => {
    // Bloquear atajos de teclado (F5, Ctrl+R, Cmd+R)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "F5" ||
        (e.ctrlKey && e.key === "r") ||
        (e.metaKey && e.key === "r")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Mostrar diálogo de confirmación al intentar recargar/cerrar
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };

    // Prevenir pull-to-refresh en Safari/iOS
    const handleTouchMove = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        e.preventDefault();
      }
    };

    // Aplicar estilos al body para prevenir overscroll
    const originalOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overscrollBehavior = "none";

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("touchmove", handleTouchMove);
      document.body.style.overscrollBehavior = originalOverscrollBehavior;
    };
  }, []);

  // Coreografía cosmética (circle -> content -> greenCircle): esto solo
  // controla ritmo visual y dispara el cobro real vía onConfirm — no depende
  // de si el pago ya terminó, así que es seguro que corra en tiempos fijos.
  useEffect(() => {
    const contentTimer = setTimeout(() => {
      setAnimationState("content");
    }, 1500);

    const cancelButtonTimer = setTimeout(() => {
      setShowCancelButton(false);
      // Confirmar el pago después de que expire el tiempo de cancelación.
      // Usamos el ref para siempre llamar la versión más reciente (evita
      // closures obsoletos con profile=null).
      if (onConfirmRef.current) {
        onConfirmRef.current();
      }
    }, 4000);

    const logoTimer = setTimeout(() => {
      setLogoColorful(true);
    }, 3500);

    const greenCircleTimer = setTimeout(() => {
      setAnimationState("greenCircle");
    }, 5500);

    return () => {
      clearTimeout(contentTimer);
      clearTimeout(cancelButtonTimer);
      clearTimeout(logoTimer);
      clearTimeout(greenCircleTimer);
    };
  }, []);

  // A partir de "greenCircle" SÍ importa el pago real: antes navegábamos con
  // un timer fijo (9s) sin importar si el pago ya se había confirmado — si
  // esa llamada tardaba más que eso, la pantalla de éxito se quedaba
  // congelada para siempre porque nunca aparecía un orderId. Ahora se espera
  // a que "orderId" llegue de verdad antes de mostrar el check y navegar.
  useEffect(() => {
    if (animationState !== "greenCircle" || !orderId) return;

    // Dejar que la animación del círculo verde (1.5s) termine de expandirse
    // antes de mostrar el check, para que no se sienta un salto brusco.
    const successTimer = setTimeout(() => {
      setAnimationState("success");
    }, 1500);

    return () => clearTimeout(successTimer);
  }, [animationState, orderId]);

  useEffect(() => {
    if (animationState !== "success") return;

    // Mantener el check visible un momento antes de navegar.
    const continueTimer = setTimeout(() => {
      handleContinue();
    }, 1800);

    return () => clearTimeout(continueTimer);
  }, [animationState]);

  // Red de seguridad: si el pago nunca se confirma (ni éxito ni error)
  // dentro de un tiempo razonable, no dejar al usuario congelado esperando
  // — se avisa y se sale de la animación.
  useEffect(() => {
    if (animationState !== "greenCircle" || orderId) return;

    const timeoutTimer = setTimeout(() => {
      if (onTimeoutRef.current) {
        onTimeoutRef.current();
      } else {
        handleContinue();
      }
    }, 20000);

    return () => clearTimeout(timeoutTimer);
  }, [animationState, orderId]);

  const handleContinue = () => {
    if (onContinueRef.current) {
      onContinueRef.current();
    } else {
      navigateWithTable("/order");
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <>
      {/* White circle */}
      {animationState === "circle" && (
        <div className="fixed inset-0 z-9999 flex items-center justify-center pointer-events-none overflow-hidden">
          <div className="circle-animation"></div>
        </div>
      )}

      {/* Contenido */}
      {(animationState === "content" || animationState === "greenCircle") && (
        <div className="fixed inset-0 z-9999 bg-white overflow-hidden">
          <div className="min-h-dvh bg-white p-8 animate-fade-in flex flex-col overflow-y-auto">
            <div className="flex flex-col flex-1">
              {/* Logo animado */}
              <div className="mb-6 md:mb-8 lg:mb-10 mt-8 md:mt-12 lg:mt-14 w-fit relative">
                {/* Pulsing rings */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="pulse-ring"></div>
                  <div className="pulse-ring pulse-ring-delay-1"></div>
                  <div className="pulse-ring pulse-ring-delay-2"></div>
                </div>
                {/* Logo container */}
                <div className="size-20 md:size-24 lg:size-28 flex items-center justify-center rounded-full relative z-10">
                  <img
                    src="/even/even-asterisk-evergreen.svg"
                    alt="Even"
                    className="size-14 md:size-16 lg:size-20 grayscale opacity-50"
                  />
                </div>
              </div>

              {/* Título */}
              <div className="text-black text-3xl md:text-5xl lg:text-6xl font-medium mb-8 md:mb-12 lg:mb-14 mr-12 md:mr-20 lg:mr-24">
                {t("processingPaymentMessage")}
              </div>

              {/* Información del pedido */}
              <div className="flex flex-col w-full divide-y divide-stroke/50">
                {/* Restaurante */}
                <div className="pb-4 md:pb-6 lg:pb-7">
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="size-10 md:size-12 lg:size-14 rounded-full border border-gray-400 bg-gray-100 overflow-hidden shrink-0">
                      <img
                        src={
                          restaurant?.logo_url ||
                          "/even/even-asterisk-evergreen.svg"
                        }
                        alt={displayRestaurant}
                        className="object-cover w-full h-full"
                      />
                    </div>
                    <div>
                      <span className="text-black text-base md:text-lg lg:text-xl font-medium">
                        {displayRestaurant}
                      </span>
                      <p className="text-xs md:text-sm lg:text-base text-gray-500">
                        {t("restaurantLabel")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Usuario */}
                <div className="py-4 md:py-6 lg:py-7">
                  <div className="flex items-center gap-3 md:gap-4">
                    {hasUserImage ? (
                      <img
                        src={userImage}
                        alt={displayName}
                        className="size-10 md:size-12 lg:size-14 rounded-full object-cover border border-gray-400 shrink-0"
                      />
                    ) : (
                      <div className="size-10 md:size-12 lg:size-14 rounded-full border border-gray-400 bg-even-evergreen flex items-center justify-center shrink-0">
                        <span className="text-white text-base md:text-lg lg:text-xl font-bold">
                          {displayName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-black text-base md:text-lg lg:text-xl font-medium">
                        {displayName}
                      </span>
                      <p className="text-xs md:text-sm lg:text-base text-gray-500">
                        {t("nameFieldLabel")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Platillos ordenados */}
                {displayItems.length > 0 && (
                  <div className="pt-4 md:pt-6 lg:pt-7">
                    <p className="text-xs md:text-sm lg:text-base text-gray-500 mb-3 md:mb-4">
                      {t("paidDishesLabel")}
                    </p>
                    <div className="space-y-2 md:space-y-3 lg:space-y-4">
                      {displayItems.map((item, index) => (
                        <div
                          key={`${item.id}-${index}`}
                          className="flex items-center gap-3 md:gap-4"
                        >
                          <div className="size-10 md:size-12 lg:size-14 bg-gray-300 rounded-sm md:rounded-md flex items-center justify-center overflow-hidden shrink-0">
                            {item.images[0] ? (
                              <img
                                src={item.images[0]}
                                alt={item.item}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <img
                                src="/even/even-asterisk-evergreen.svg"
                                alt="Even"
                                className="size-6 md:size-8 lg:size-10 object-contain"
                              />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-black text-sm md:text-base lg:text-lg capitalize">
                              {item.item}
                            </p>
                            <p className="text-xs md:text-sm lg:text-base text-gray-500">
                              {t("quantityLabel", { quantity: item.quantity })}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-black text-sm md:text-base lg:text-lg font-medium">
                              $
                              {(
                                (item.price + (item.extra_price || 0)) *
                                item.quantity
                              ).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Botón de cancelar */}
              {onCancel && (
                <div
                  className={`mt-auto pt-6 md:pt-8 pb-4 md:pb-6 transition-opacity duration-500 ${
                    showCancelButton
                      ? "opacity-100"
                      : "opacity-0 pointer-events-none"
                  }`}
                >
                  <button
                    onClick={handleCancel}
                    className="py-1 md:py-1.5 px-6 md:px-8 text-black rounded-full active:scale-95 transition-all font-medium text-sm md:text-base bg-surface lg:py-2 border border-stroke/40 cursor-pointer"
                  >
                    {t("cancelPaymentCta")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Animacion circulo verde */}
      {animationState === "greenCircle" && (
        <div className="fixed inset-0 z-10000 overflow-hidden pointer-events-none">
          <div className="p-6 md:p-8 lg:p-10">
            <div className="mb-6 md:mb-8 lg:mb-10 mt-8 md:mt-12 lg:mt-14 relative">
              <div className="green-circle-from-logo"></div>
            </div>
          </div>
        </div>
      )}

      {/* Success screen */}
      {animationState === "success" && (
        <div className="fixed inset-0 z-9999 bg-even-grass overflow-hidden">
          <div className="h-dvh p-8 flex flex-col">
            <div className="flex flex-col flex-1">
              {/* Checkmark */}
              <div className="mb-6 md:mb-8 lg:mb-10 mt-8 md:mt-12 lg:mt-14 animate-simple-fade-in">
                <div className="size-20 md:size-24 lg:size-28 rounded-full bg-white flex items-center justify-center">
                  <svg
                    className="size-14 md:size-16 lg:size-20 text-even-evergreen"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
              </div>

              {/* Success message */}
              <div className="text-even-evergreen text-3xl md:text-5xl lg:text-6xl font-medium mb-8 md:mb-12 lg:mb-14 mr-16 md:mr-28 lg:mr-32 animate-simple-fade-in">
                {t("successMessage")}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OrderAnimation;
