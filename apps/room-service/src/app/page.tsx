"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";

// Restaurant ID y Branch por defecto para testing
const DEFAULT_RESTAURANT_ID = 4;
const DEFAULT_BRANCH_NUMBER = 1;
const DEFAULT_ROOM = 40;

export default function Home() {
  const t = useTranslations("HomePage");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    // Check if user just signed in/up and has context
    const storedRoom = sessionStorage.getItem("pendingRoomRedirect");
    const storedRestaurant = sessionStorage.getItem("pendingRestaurantId");
    const authFromPaymentFlow = sessionStorage.getItem("authFromPaymentFlow");
    const authFromMenu = sessionStorage.getItem("authFromMenu");

    console.log("🔍 Root page debugging:", {
      isLoading,
      isAuthenticated,
      storedRoom,
      storedRestaurant,
      authFromPaymentFlow,
      authFromMenu,
      currentPath: window.location.pathname,
    });

    // Determinar restaurantId
    const restaurantParam = searchParams.get("restaurant");
    const restaurantId =
      restaurantParam || storedRestaurant || DEFAULT_RESTAURANT_ID;

    if (isAuthenticated && storedRoom && authFromPaymentFlow) {
      // User signed in/up from cart (CartView), redirect to order-confirm
      sessionStorage.removeItem("authFromPaymentFlow");
      sessionStorage.removeItem("pendingRoomRedirect");
      sessionStorage.removeItem("pendingRestaurantId");
      router.replace(
        `/${restaurantId}/${DEFAULT_BRANCH_NUMBER}/order-confirm?room=${storedRoom}`,
      );
      return;
    }

    if (isAuthenticated && storedRoom && authFromMenu) {
      // User signed in from MenuView settings, redirect to dashboard with room
      sessionStorage.removeItem("authFromMenu");
      sessionStorage.removeItem("pendingRoomRedirect");
      sessionStorage.removeItem("pendingRestaurantId");
      router.replace(
        `/${restaurantId}/${DEFAULT_BRANCH_NUMBER}/dashboard?room=${storedRoom}`,
      );
      return;
    }

    // Check for room parameter in current URL
    const roomParam = searchParams.get("room");
    if (roomParam) {
      router.replace(
        `/${restaurantId}/${DEFAULT_BRANCH_NUMBER}/menu?room=${roomParam}`,
      );
      return;
    }

    // Default redirect
    console.log(
      `✅ Default redirect to /${DEFAULT_RESTAURANT_ID}/${DEFAULT_BRANCH_NUMBER}/menu?room=${DEFAULT_ROOM}`,
    );
    router.replace(
      `/${DEFAULT_RESTAURANT_ID}/${DEFAULT_BRANCH_NUMBER}/menu?room=${DEFAULT_ROOM}`,
    );
  }, [router, searchParams, isAuthenticated, isLoading]);

  return (
    <div className="min-h-dvh brand-evergreen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-5 md:px-8 lg:px-10 pb-12 md:py-10 lg:py-12">
        <div className="w-full max-w-md">
          {/* Logo and QR Code side by side */}
          <div className="mb-6 md:mb-8 lg:mb-10 text-center">
            <div className="flex items-center justify-center gap-4 md:gap-6 lg:gap-8 mb-4 md:mb-5 lg:mb-6">
              <img
                src="/even/even-asterisk-grass.svg"
                alt="Even Logo"
                className="size-16 md:size-20 lg:size-24"
              />
            </div>
            <h1 className="text-white text-xl md:text-2xl lg:text-3xl font-medium mb-2 md:mb-3 lg:mb-4">
              {t("heroTitle")}
            </h1>
            <p className="text-white/80 text-sm md:text-base lg:text-lg">
              {t("heroSubtitle")}
            </p>
          </div>

          {/* Additional Info */}
          <div className="mt-6 md:mt-7 lg:mt-8 text-center">
            <p className="text-white/70 text-xs md:text-sm lg:text-base">
              {t("heroFootnote")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
