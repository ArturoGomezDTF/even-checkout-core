"use client";

import { useTranslations } from "next-intl";
import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useCart, CartItem } from "@/app/context/CartContext";
import { useTable } from "@/app/context/TableContext";
import { useGuest } from "@/app/context/GuestContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { getRestaurantData } from "@/app/utils/restaurantData";
import MenuHeaderBack from "@/app/components/headers/MenuHeaderBack";
import OrderAnimation from "@/app/components/UI/OrderAnimation";
import { useValidateAccess } from "@/app/hooks/useValidateAccess";
import ValidationError from "@/app/components/ValidationError";

export default function UserPage() {
  const t = useTranslations("UserPage");
  const searchParams = useSearchParams();
  // Modo "unirse sin ordenar": reutiliza esta misma pantalla de captura de
  // nombre para agregar a alguien a la cuenta sin pasar por el flujo de carrito.
  const joinOnly = searchParams?.get("joinOnly") === "true";

  const { guestName: existingGuestName, setGuestName } = useGuest();
  const [userName, setUserName] = useState(existingGuestName || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOrderAnimation, setShowOrderAnimation] = useState(false);
  const [orderedItems, setOrderedItems] = useState<CartItem[]>([]);
  const [orderUserName, setOrderUserName] = useState("");
  // Señal para OrderAnimation: true solo una vez que handleConfirmOrder
  // confirmó el pedido de verdad contra el backend (ver OrderAnimation.tsx).
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { state: cartState, clearCart } = useCart();
  const { state, dispatch, submitOrder, joinTableWithoutOrdering } = useTable();
  const { tableNumber, navigateWithTable } = useTableNavigation();
  const restaurantData = getRestaurantData();
  const { validationError, branchNumber } = useValidateAccess();

  // Prellenar con el nombre existente si el contexto de invitado lo resuelve
  // después del primer render (localStorage se lee async al montar).
  useEffect(() => {
    if (existingGuestName && !userName) {
      setUserName(existingGuestName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingGuestName]);

  // Mostrar error de validación si existe
  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  // Función para validar que solo se ingresen caracteres de texto válidos para nombres
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const textOnlyRegex = /^[a-zA-ZÀ-ÿ\u00f1\u00d1\s'-]*$/;

    if (textOnlyRegex.test(value)) {
      setUserName(value);
    }
  };

  // Manejar presión de Enter/Intro
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && userName.trim() && !isSubmitting) {
      e.preventDefault();
      // Cerrar el teclado
      if (inputRef.current) {
        inputRef.current.blur();
      }
      handleProceedToOrder();
    }
  };

  // Manejar foco del input para scroll al teclado
  const handleInputFocus = () => {
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, 300);
  };

  // Modo "unirse sin ordenar": solo registra a la persona en la mesa y continúa
  // directo a pagar, sin pasar por la animación de orden (no hay platillos).
  const handleJoinOnly = async () => {
    if (!userName.trim()) return;
    setIsSubmitting(true);
    try {
      setGuestName(userName.trim());
      await joinTableWithoutOrdering(userName.trim());
      navigateWithTable("/payment-options");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProceedToOrder = async () => {
    if (!userName.trim()) return;

    if (joinOnly) {
      await handleJoinOnly();
      return;
    }

    setIsSubmitting(true);
    setOrderConfirmed(false);
    // Guardar items antes de que se limpie el carrito
    const itemsToOrder = [...cartState.items];
    setOrderedItems(itemsToOrder);
    setOrderUserName(userName.trim());
    // Mostrar animación de orden INMEDIATAMENTE (sin enviar la orden aún)
    setShowOrderAnimation(true);
  };

  const handleContinueFromAnimation = () => {
    navigateWithTable("/order");
  };

  const handleCancelOrder = () => {
    setShowOrderAnimation(false);
    setOrderedItems([]);
    setOrderUserName("");
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
    if (orderUserName && orderedItems.length > 0) {
      try {
        // Enviar la orden a la API con branchNumber
        await submitOrder(
          orderUserName,
          orderedItems,
          branchNumber?.toString(),
        );
        // Limpiar el carrito de la base de datos después de la orden exitosa
        // (fire-and-forget: clearCart ya atrapa sus propios errores
        // internamente, esperarla solo agregaba latencia antes de confirmar)
        clearCart().catch((err) =>
          console.error("Error clearing cart after order:", err),
        );
        // El pedido ya se confirmó de verdad contra el backend — OrderAnimation
        // esperaba esta señal para avanzar a la pantalla de éxito.
        setOrderConfirmed(true);
      } catch (error) {
        console.error("Error submitting order:", error);
        // Si hay error, ocultar la animación
        setShowOrderAnimation(false);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (!tableNumber) {
    return (
      <div className="min-h-new bg-gray-50 flex items-center justify-center">
        <div className="text-center px-4 md:px-6 lg:px-8">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-meduim text-gray-800 mb-4 md:mb-6">
            {t("invalidTableTitle")}
          </h1>
          <p className="text-gray-600 text-base md:text-lg lg:text-xl">
            {t("invalidTableMessage")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-new brand-evergreen flex flex-col">
      <MenuHeaderBack
        restaurant={restaurantData}
        tableNumber={state.tableNumber}
      />

      <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col">
        <div className="left-4 right-4 bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
          <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
            <h2 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight mt-2 md:mt-3 mb-6 md:mb-8">
              {t("title")}
            </h2>
          </div>
        </div>

        <div className="flex-1 flex flex-col">
          <div className="bg-white rounded-t-4xl flex-1 z-5 flex flex-col px-6 md:px-8 lg:px-10 pb-32">
            <div className="flex flex-col items-center w-full pt-32 md:pt-36 lg:pt-40">
              <div className="mb-6 md:mb-8">
                <h2 className="text-lg md:text-xl lg:text-2xl font-medium text-black">
                  {t("nameLabel")}
                </h2>
              </div>

              <div className="w-full">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={t("namePlaceholder")}
                  value={userName}
                  onChange={handleNameChange}
                  onKeyDown={handleKeyDown}
                  onFocus={handleInputFocus}
                  className="w-full px-6 md:px-8 lg:px-10 py-3 md:py-4 lg:py-5 bg-surface rounded-full text-black text-xl md:text-2xl lg:text-3xl text-center font-normal placeholder:text-gray-400 focus:outline-none border border-stroke-soft focus:border-even-grass transition-colors"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed bottom button */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center py-4 md:py-5 lg:py-6">
        <div className="mx-4 md:mx-6 lg:mx-8 w-full max-w-full px-4 md:px-6 lg:px-8">
          <button
            onClick={handleProceedToOrder}
            disabled={!userName.trim() || isSubmitting}
            className={`w-full py-3 md:py-4 lg:py-5 rounded-full transition-colors text-even-evergreen font-medium cursor-pointer text-base md:text-lg lg:text-xl bg-even-grass ${
              userName.trim() && !isSubmitting
                ? ""
                : "opacity-50 cursor-not-allowed"
            }`}
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center gap-2 md:gap-3">
                <svg
                  className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7 text-even-evergreen"
                  style={{
                    animation: "spin 1s linear infinite",
                  }}
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <style jsx>{`
                  @keyframes spin {
                    from {
                      transform: rotate(0deg);
                    }
                    to {
                      transform: rotate(360deg);
                    }
                  }
                `}</style>
              </div>
            ) : (
              t("continueCta")
            )}
          </button>
        </div>
      </div>

      {/* OrderAnimation overlay - para usuarios invitados */}
      {showOrderAnimation && (
        <OrderAnimation
          userName={orderUserName}
          orderedItems={orderedItems}
          orderConfirmed={orderConfirmed}
          onTimeout={handleOrderTimeout}
          onContinue={handleContinueFromAnimation}
          onCancel={handleCancelOrder}
          onConfirm={handleConfirmOrder}
        />
      )}
    </div>
  );
}
