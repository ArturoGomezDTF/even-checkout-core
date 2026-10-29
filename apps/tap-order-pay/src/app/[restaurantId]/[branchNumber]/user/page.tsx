"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTable } from "@/context/TableContext";
import { useCart, CartItem } from "@/context/CartContext";
import { useGuest } from "@/context/GuestContext";
import { useTableNavigation } from "@/hooks/useTableNavigation";
import { useRestaurant } from "@/context/RestaurantContext";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import { Loader2 } from "lucide-react";

export default function UserPage() {
  const t = useTranslations("UserPage");
  const params = useParams();
  const { setRestaurantId, setBranchNumber } = useRestaurant();
  const restaurantId = params?.restaurantId as string;
  const branchNumber = params?.branchNumber as string;

  useEffect(() => {
    if (restaurantId && !isNaN(parseInt(restaurantId))) {
      setRestaurantId(parseInt(restaurantId));
    }
    if (branchNumber && !isNaN(parseInt(branchNumber))) {
      setBranchNumber(parseInt(branchNumber));
    }
  }, [restaurantId, branchNumber, setRestaurantId, setBranchNumber]);

  const [userName, setUserName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderedItems, setOrderedItems] = useState<CartItem[]>([]);
  const [orderUserName, setOrderUserName] = useState("");
  const { dispatch } = useTable();
  const { state: cartState, setUserName: setCartUserName } = useCart();
  const { setGuestName } = useGuest();
  const { tableNumber, navigateWithTable } = useTableNavigation();
  const router = useRouter();

  useEffect(() => {
    if (!tableNumber) {
      // Redirigir a home si no hay número de mesa
      router.push("/");
      return;
    }

    // Establecer el número de mesa en el contexto
    dispatch({ type: "SET_TABLE_NUMBER", payload: tableNumber });
  }, [tableNumber, dispatch, router]);

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
      handleProceedToOrder();
    }
  };

  const handleProceedToOrder = async () => {
    if (userName.trim()) {
      setIsSubmitting(true);
      try {
        // Guardar items antes de que se limpie el carrito
        setOrderedItems([...cartState.items]);
        setOrderUserName(userName.trim());
        // Guardar el nombre del usuario en el contexto del carrito y en localStorage (persiste recarga)
        setCartUserName(userName.trim());
        setGuestName(userName.trim());
        // Navegar a order-confirm
        navigateWithTable("/order-confirm");
      } catch (error) {
        console.error("Error submitting order:", error);
        // Si hay error, ocultar la animación
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
      <MenuHeaderBack />

      <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col">
        <div className="left-4 right-4 bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
          <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
            <h2 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight mt-2 md:mt-3 mb-6 md:mb-8">
              {t("title")}
            </h2>
          </div>
        </div>

        <div className="flex-1 h-full flex flex-col">
          <div className="bg-white rounded-t-4xl flex-1 z-5 flex flex-col px-6 md:px-8 lg:px-10 pb-32">
            <div className="flex flex-col items-center w-full pt-32 md:pt-36 lg:pt-40">
              <div className="mb-6 md:mb-8">
                <h2 className="text-lg md:text-xl lg:text-2xl font-medium text-black">
                  {t("nameLabel")}
                </h2>
              </div>

              <div className="w-full">
                <input
                  type="text"
                  placeholder={t("namePlaceholder")}
                  value={userName}
                  onKeyDown={handleKeyDown}
                  onChange={handleNameChange}
                  className="w-full px-6 md:px-8 lg:px-10 py-3 md:py-4 lg:py-5 bg-gray-100/90 backdrop-blur-xl rounded-[9999px]! text-black text-xl md:text-2xl lg:text-3xl text-center font-normal placeholder:text-gray-400 focus:outline-none border border-white/80 shadow-[0_2px_8px_rgba(0,0,0,0.06),inset_0_1px_6px_rgba(255,255,255,0.8)] focus:shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_0_0_1.2px_rgba(130,230,87,0.7)] transition-shadow"
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
            disabled={!userName.trim()}
            className={`w-full py-3 md:py-4 lg:py-5 rounded-full transition-all active:scale-90 text-even-evergreen cursor-pointer text-base md:text-lg lg:text-xl ${
              userName.trim() && !isSubmitting
                ? "bg-even-grass"
                : "bg-even-grass opacity-50 cursor-not-allowed"
            }`}
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center gap-2 md:gap-3">
                <svg
                  className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7 text-white"
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
    </div>
  );
}
