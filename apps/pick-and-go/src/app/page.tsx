"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";

// Restaurant ID por defecto para testing
const DEFAULT_RESTAURANT_ID = 5;

export default function Home() {
  const t = useTranslations("HomePage");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    // Check if user just signed in/up and has context
    const storedRestaurant = sessionStorage.getItem("pendingRestaurantId");
    const authFromPaymentFlow = sessionStorage.getItem("authFromPaymentFlow");
    const authFromMenu = sessionStorage.getItem("authFromMenu");

    // Determinar restaurantId
    const restaurantParam = searchParams.get("restaurant");
    const restaurantId =
      restaurantParam || storedRestaurant || DEFAULT_RESTAURANT_ID;

    if (user && authFromMenu) {
      // User signed in from MenuView settings, redirect to dashboard (Pick & Go - no table)
      sessionStorage.removeItem("authFromMenu");
      sessionStorage.removeItem("pendingTableRedirect");
      sessionStorage.removeItem("pendingRestaurantId");
      router.replace(`/${restaurantId}/dashboard`);
      return;
    }

    if (user && authFromPaymentFlow) {
      // User signed up during payment flow, redirect to payment-options with table
      sessionStorage.removeItem("pendingTableRedirect");
      sessionStorage.removeItem("authFromPaymentFlow");
      sessionStorage.removeItem("pendingRestaurantId");
      router.replace(`/${restaurantId}/payment-options`);
      return;
    }
  }, [router, searchParams, user, isLoading]);

  return (
    <div className="min-h-new brand-evergreen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12 md:py-10 lg:py-12">
        <div className="w-full max-w-md flex flex-col items-center text-center">
          {/* Wordmark — identificador primario de marca */}
          <img
            src="/brand/even-wordmark-grass.svg"
            alt="even"
            className="w-44 md:w-52 lg:w-60 h-auto mb-10 md:mb-12 lg:mb-14"
          />

          <h1 className="text-even-offwhite text-3xl md:text-4xl lg:text-5xl font-semibold leading-tight mb-4 md:mb-5">
            {t("heroTitle")}
          </h1>

          <p className="text-even-offwhite/85 text-sm md:text-base lg:text-lg leading-relaxed max-w-sm">
            {t.rich("heroSubtitle", {
              highlight: (chunks) => (
                <span className="even-highlight">{chunks}</span>
              ),
            })}
          </p>

          <p className="mt-8 md:mt-10 text-even-offwhite/55 text-xs md:text-sm lg:text-base leading-relaxed max-w-xs">
            {t("heroFootnote")}
          </p>
        </div>
      </div>
    </div>
  );
}
