"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import Loader from "./components/UI/Loader";

// Restaurant ID y Branch por defecto para testing
const DEFAULT_RESTAURANT_ID = 15;
const DEFAULT_BRANCH_NUMBER = 1;
const DEFAULT_TABLE = 1;

function HomeContent() {
  const t = useTranslations("HomePage");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check for parameters in URL
    const tableParam = searchParams.get("table");
    const restaurantParam = searchParams.get("restaurant");
    const branchParam = searchParams.get("branch");

    const restaurantId = restaurantParam || DEFAULT_RESTAURANT_ID;
    const branchNumber = branchParam || DEFAULT_BRANCH_NUMBER;

    if (tableParam) {
      // Redirect to menu with table parameter
      const redirectUrl = `/${restaurantId}/${branchNumber}/menu?table=${tableParam}`;
      router.replace(redirectUrl);
    } else {
      // Default redirect to restaurant menu with default table
      const redirectUrl = `/${DEFAULT_RESTAURANT_ID}/${DEFAULT_BRANCH_NUMBER}/menu?table=${DEFAULT_TABLE}`;
      router.replace(redirectUrl);
    }
  }, [router, searchParams]);

  return (
    <div className="min-h-new brand-evergreen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12 md:py-10 lg:py-12">
        <div className="w-full max-w-md flex flex-col items-center text-center">
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

export default function Home() {
  return (
    <Suspense fallback={<Loader />}>
      <HomeContent />
    </Suspense>
  );
}
