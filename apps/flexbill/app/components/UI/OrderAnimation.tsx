"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { CartItem } from "../../context/CartContext";
import { useTable } from "../../context/TableContext";
import { useRestaurant } from "../../context/RestaurantContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import Loader from "@/app/components/UI/Loader";
import { useAuth } from "@/app/context/AuthContext";
import { getItemDisplayPrice } from "@/app/utils/commissionCalculator";

interface OrderAnimationProps {
  userName?: string;
  orderedItems?: CartItem[];
  // True solo una vez que handleConfirmOrder (en CartView) confirmó el
  // pedido de verdad contra el backend — la pantalla de éxito y la
  // navegación esperan a esto en vez de un tiempo fijo, para no
  // desincronizarse de un submitOrder lento.
  orderConfirmed?: boolean;
  onContinue?: () => void;
  onCancel?: () => void;
  onConfirm?: () => void;
  // Se dispara si la confirmación real nunca llega dentro de un tiempo
  // razonable (red de seguridad) — así la pantalla nunca se queda
  // congelada esperando para siempre.
  onTimeout?: () => void;
}

const OrderAnimation = ({
  userName,
  orderedItems,
  orderConfirmed,
  onContinue,
  onCancel,
  onConfirm,
  onTimeout,
}: OrderAnimationProps) => {
  const t = useTranslations("OrderAnimation");
  const tc = useTranslations("Common");
  const { navigateWithTable } = useTableNavigation();
  const { state: tableState } = useTable();
  const { restaurant, loading } = useRestaurant();
  const { profile, user, isLoading: authLoading } = useAuth();
  const [animationState, setAnimationState] = useState<
    "circle" | "content" | "greenCircle" | "success"
  >("circle");
  const [logoColorful, setLogoColorful] = useState(false);
  const [showCancelButton, setShowCancelButton] = useState(true);

  // Siempre apuntan a la versión más reciente de los callbacks para evitar
  // closures obsoletos dentro de los timers de abajo.
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

  // Si está autenticado, SIEMPRE usar el nombre del perfil (nunca el nombre de invitado anterior)
  const isAuthenticated = !authLoading && !!user;
  const isProfileLoading = isAuthenticated && !profile?.firstName;
  const displayName = isAuthenticated
    ? profile?.firstName && profile?.lastName
      ? `${profile.firstName} ${profile.lastName}`
      : profile?.firstName || t("loadingName")
    : userName || tableState.currentUserName || tc("defaultUserName");
  const displayItems = orderedItems || [];
  const displayRestaurant = restaurant?.name || t("restaurantLabel");

  const userImage = profile?.photoUrl;
  const hasUserImage = !!userImage && !isProfileLoading;

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
  // controla ritmo visual y dispara la creación real de la orden vía
  // onConfirm — no depende de si esa creación ya terminó, así que es seguro
  // que corra en tiempos fijos.
  useEffect(() => {
    const contentTimer = setTimeout(() => {
      setAnimationState("content");
    }, 1500);

    const cancelButtonTimer = setTimeout(() => {
      setShowCancelButton(false);
      // Confirmar la orden después de que expire el tiempo de cancelación.
      // Usamos el ref para siempre llamar la versión más reciente.
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

  // A partir de "greenCircle" SÍ importa si la orden ya se confirmó de
  // verdad: antes se navegaba con un timer fijo (9s) sin importar si
  // handleConfirmOrder ya había terminado — si esa llamada tardaba más que
  // eso, el usuario era navegado a /order antes de que el pedido existiera
  // de verdad (o aunque hubiera fallado en silencio). Ahora se espera a que
  // "orderConfirmed" llegue antes de mostrar el check y navegar.
  useEffect(() => {
    if (animationState !== "greenCircle" || !orderConfirmed) return;

    // Dejar que la animación del círculo verde (1.5s) termine de expandirse
    // antes de mostrar el check, para que no se sienta un salto brusco.
    const successTimer = setTimeout(() => {
      setAnimationState("success");
    }, 1500);

    return () => clearTimeout(successTimer);
  }, [animationState, orderConfirmed]);

  useEffect(() => {
    if (animationState !== "success") return;

    // Mantener el check visible un momento antes de navegar.
    const continueTimer = setTimeout(() => {
      handleContinue();
    }, 1800);

    return () => clearTimeout(continueTimer);
  }, [animationState]);

  // Red de seguridad: si la orden nunca se confirma (ni éxito ni error)
  // dentro de un tiempo razonable, no dejar al usuario congelado esperando
  // — se avisa y se sale de la animación.
  useEffect(() => {
    if (animationState !== "greenCircle" || orderConfirmed) return;

    const timeoutTimer = setTimeout(() => {
      if (onTimeoutRef.current) {
        onTimeoutRef.current();
      } else {
        handleContinue();
      }
    }, 20000);

    return () => clearTimeout(timeoutTimer);
  }, [animationState, orderConfirmed]);

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

  // Mostrar loader mientras carga
  if (loading) {
    return <Loader />;
  }

  return (
    <>
      {/* White circle */}
      {animationState === "circle" && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none overflow-hidden">
          <div className="circle-animation"></div>
        </div>
      )}

      {/* Contenido */}
      {(animationState === "content" || animationState === "greenCircle") && (
        <div className="fixed inset-0 z-[9999] bg-white overflow-hidden">
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
                    src="/even/even-asterisk-grass.svg"
                    alt="Even Logo"
                    className="size-14 md:size-16 lg:size-20 grayscale opacity-50"
                  />
                </div>
              </div>

              {/* Título */}
              <div className="text-black text-3xl md:text-5xl lg:text-6xl font-medium mb-8 md:mb-12 lg:mb-14 mr-12 md:mr-20 lg:mr-24">
                {t("creatingOrder")}
              </div>

              {/* Información del pedido */}
              <div className="flex flex-col w-full divide-y divide-stroke/50">
                {/* Restaurante */}
                <div className="pb-4 md:pb-6 lg:pb-7">
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="size-10 md:size-12 lg:size-14 rounded-full border border-gray-400 bg-gray-100 overflow-hidden flex-shrink-0">
                      <img
                        src={restaurant?.logo_url || "/even/even-asterisk-grass.svg"}
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
                    {isProfileLoading ? (
                      /* Avatar con animación de carga mientras carga el perfil */
                      <div className="size-10 md:size-12 lg:size-14 rounded-full border border-gray-300 bg-gray-200 animate-pulse flex-shrink-0" />
                    ) : hasUserImage ? (
                      <img
                        src={userImage}
                        alt={displayName}
                        className="size-10 md:size-12 lg:size-14 rounded-full object-cover border border-gray-400 flex-shrink-0"
                      />
                    ) : (
                      <div className="size-10 md:size-12 lg:size-14 rounded-full border border-gray-400 bg-even-evergreen flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-base md:text-lg lg:text-xl font-bold">
                          {displayName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      {isProfileLoading ? (
                        /* Nombre con animación de carga */
                        <div className="h-5 md:h-6 w-32 bg-gray-200 rounded animate-pulse mb-1" />
                      ) : (
                        <span className="text-black text-base md:text-lg lg:text-xl font-medium">
                          {displayName}
                        </span>
                      )}
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
                      {t("orderedDishesLabel")}
                    </p>
                    <div className="space-y-2 md:space-y-3 lg:space-y-4">
                      {displayItems.map((item, index) => (
                        <div
                          key={`${item.id}-${index}`}
                          className="flex items-center gap-3 md:gap-4"
                        >
                          <div className="size-10 md:size-12 lg:size-14 bg-gray-300 rounded-sm md:rounded-md flex items-center justify-center overflow-hidden flex-shrink-0">
                            {item.images && item.images[0] ? (
                              <img
                                src={item.images[0]}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <img
                                src="/even/even-asterisk-evergreen.svg"
                                alt="Logo Even"
                                className="size-6 md:size-8 lg:size-10 object-contain"
                              />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-black text-sm md:text-base lg:text-lg capitalize">
                              {item.name}
                            </p>
                            <p className="text-xs md:text-sm lg:text-base text-gray-500">
                              {t("quantityLabel", { quantity: item.quantity })}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-black text-sm md:text-base lg:text-lg font-medium">
                              $
                              {(
                                getItemDisplayPrice(
                                  item.price + (item.extraPrice || 0),
                                ) * item.quantity
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
                    {t("undoOrderCta")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Animacion circulo verde */}
      {animationState === "greenCircle" && (
        <div className="fixed inset-0 z-[10000] overflow-hidden pointer-events-none">
          <div className="p-6 md:p-8 lg:p-10">
            <div className="mb-6 md:mb-8 lg:mb-10 mt-8 md:mt-12 lg:mt-14 relative">
              <div className="green-circle-from-logo"></div>
            </div>
          </div>
        </div>
      )}

      {/* Success screen */}
      {animationState === "success" && (
        <div className="fixed inset-0 z-[9999] bg-green-500 overflow-hidden">
          <div className="h-[100dvh] p-8 flex flex-col">
            <div className="flex flex-col flex-1">
              {/* Checkmark */}
              <div className="mb-6 md:mb-8 lg:mb-10 mt-8 md:mt-12 lg:mt-14 animate-simple-fade-in">
                <div className="size-20 md:size-24 lg:size-28 rounded-full bg-white flex items-center justify-center">
                  <svg
                    className="size-14 md:size-16 lg:size-20 text-green-500"
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
              <div className="text-white text-3xl md:text-5xl lg:text-6xl font-medium mb-8 md:mb-12 lg:mb-14 mr-16 md:mr-28 lg:mr-32 animate-simple-fade-in">
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
