"use client";

import { useAuth } from "@/app/context/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";

// Restaurant ID y Branch por defecto para testing
// Estos valores coinciden con la orden de prueba en tap_pay_orders
const DEFAULT_RESTAURANT_ID = 5; // Tacos Atarantados
const DEFAULT_BRANCH_NUMBER = 2;
const DEFAULT_TABLE = 1; // Mesa

export default function Home() {
  const t = useTranslations("HomePage");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    // Check if user just signed in/up and has context
    const storedTable = sessionStorage.getItem("pendingTableRedirect");
    const storedRestaurant = sessionStorage.getItem("pendingRestaurantId");
    const authFromMenu = sessionStorage.getItem("authFromMenu");
    const authFromPaymentFlow = sessionStorage.getItem("authFromPaymentFlow");

    // Determinar restaurantId
    const restaurantParam = searchParams.get("restaurant");
    const restaurantId =
      restaurantParam || storedRestaurant || DEFAULT_RESTAURANT_ID;

    if (isAuthenticated && storedTable && authFromPaymentFlow) {
      // User signed in/up from cart (CartView), redirect to payment=options
      sessionStorage.removeItem("authFromPaymentFlow");
      sessionStorage.removeItem("pendingTableRedirect");
      sessionStorage.removeItem("pendingRestaurantId");
      router.replace(
        `/${restaurantId}/${DEFAULT_BRANCH_NUMBER}/payment-options?table=${storedTable}`,
      );
      return;
    }

    if (isAuthenticated && storedTable && authFromMenu) {
      // User signed in from MenuView settings, redirect to dashboard with table
      sessionStorage.removeItem("authFromMenu");
      sessionStorage.removeItem("pendingTableRedirect");
      sessionStorage.removeItem("pendingRestaurantId");
      router.replace(
        `/${restaurantId}/${DEFAULT_BRANCH_NUMBER}/dashboard?table=${storedTable}`,
      );
      return;
    }

    // Check for table parameter in current URL
    const tableParam = searchParams.get("table");
    if (tableParam) {
      router.replace(
        `/${restaurantId}/${DEFAULT_BRANCH_NUMBER}/order?table=${tableParam}`,
      );
      return;
    }

    // Default redirect
    console.log(
      `✅ Default redirect to /${DEFAULT_RESTAURANT_ID}/${DEFAULT_BRANCH_NUMBER}/order?table=${DEFAULT_TABLE}`,
    );
    router.replace(
      `/${DEFAULT_RESTAURANT_ID}/${DEFAULT_BRANCH_NUMBER}/order?table=${DEFAULT_TABLE}`,
    );
  }, [router, searchParams, isAuthenticated, isLoading]);

  return (
    <div className="min-h-dvh bg-even-evergreen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-5 md:px-8 lg:px-10 pb-12 md:py-10 lg:py-12">
        <div className="w-full max-w-md">
          {/* Logo and QR Code side by side */}
          <div className="mb-6 md:mb-8 lg:mb-10 text-center">
            <div className="flex items-center justify-center gap-4 md:gap-6 lg:gap-8 mb-4 md:mb-5 lg:mb-6">
              <img
                src="/even/even-asterisk-grass.svg"
                alt="Even"
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
