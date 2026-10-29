"use client";

// NOTE: This page is maintained for users who want to manage payment methods separately
// Main payment flows now use EcartPay SDK directly in payment/page.tsx and add-tip/page.tsx

import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTable } from "@/context/TableContext";
import { useTableNavigation } from "@/hooks/useTableNavigation";
import { useGuest, useIsGuest } from "@/context/GuestContext";
import { usePayment } from "@/context/PaymentContext";
import { useRestaurant } from "@/context/RestaurantContext";
import { useEffect, useState } from "react";
import { paymentService } from "@/services/payment.service";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import CardScanner from "@/components/CardScanner";
import Loader from "@/components/UI/Loader";
import { useAuth } from "@/context/AuthContext";

const MONTHS = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
];
const START_YEAR = new Date().getFullYear();
const YEARS = Array.from(
  { length: process.env.NODE_ENV === "development" ? 40 : 10 },
  (_, i) => String(START_YEAR + i).slice(-2),
);

// Extracts a readable string from any error shape the API may return
// (plain string, { message }, nested { message: {...} }, { details }, etc.)
// so we never render "[object Object]".
const extractErrorMessage = (error: unknown, fallback: string): string => {
  if (!error) return fallback;
  if (typeof error === "string") return error.trim() || fallback;
  if (typeof error === "object") {
    const e = error as {
      message?: unknown;
      details?: unknown;
      error?: unknown;
    };
    if (typeof e.message === "string" && e.message.trim()) return e.message;
    if (e.message && typeof e.message === "object")
      return extractErrorMessage(e.message, fallback);
    if (e.details) return extractErrorMessage(e.details, fallback);
    if (e.error) return extractErrorMessage(e.error, fallback);
  }
  return fallback;
};

function AddCardContent() {
  const t = useTranslations("AddCardPage");
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

  const { state } = useTable();
  const { navigateWithTable } = useTableNavigation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isGuest = useIsGuest();
  const { guestId, tableNumber } = useGuest();
  const { addPaymentMethod, refreshPaymentMethods, paymentMethods } =
    usePayment();
  const { user, isAuthenticated } = useAuth();

  // Refresh payment methods on mount to ensure we have the latest data
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    refreshPaymentMethods();
  }, []);

  const [fullName, setFullName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expMonthIdx, setExpMonthIdx] = useState(0);
  const [expYearIdx, setExpYearIdx] = useState(0);
  const [cvv, setCvv] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [isLoadingParams, setIsLoadingParams] = useState(true);
  const [errors, setErrors] = useState<{
    fullName?: string;
    cardNumber?: string;
    expDate?: string;
    cvv?: string;
    general?: string;
  }>({});

  const handleBack = () => {
    if (searchParams.get("returnTo") === "cards") {
      navigateWithTable("/menu?dashboard=cards");
    } else {
      router.back();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleFullNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const textOnlyRegex = /^[a-zA-ZÀ-ÿñÑ\s'-]*$/;

    if (textOnlyRegex.test(value)) {
      setFullName(value);
      if (errors.fullName)
        setErrors((prev) => ({ ...prev, fullName: undefined }));
    }
  };

  const fillTestCard = () => {
    setFullName("Test User");
    setCardNumber("4242 4242 4242 4242");
    setExpMonthIdx(11); // December
    setExpYearIdx(2); // 3rd year in range (e.g. 2028)
    setCvv("123");
  };

  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    const newErrors: typeof errors = {};

    if (!fullName.trim())
      newErrors.fullName = t("errorFullNameRequired");
    if (!cardNumber.trim())
      newErrors.cardNumber = t("errorCardNumberRequired");
    if (!cvv.trim()) newErrors.cvv = t("errorCvvRequired");

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Validar tarjeta repetida
    const lastFourDigits = cardNumber.replace(/\s+/g, "").slice(-4);
    const isDuplicate = paymentMethods.some(
      (method) => method.lastFourDigits === lastFourDigits,
    );

    if (isDuplicate) {
      setErrors({
        cardNumber: t("duplicateCard", { digits: lastFourDigits }),
      });
      return;
    }

    setErrors({});
    setIsLoading(true);

    const expDate = `${MONTHS[expMonthIdx]}/${YEARS[expYearIdx]}`;

    try {
      if (user) {
        console.log("💳 Adding card for registered user:", user.id);
      } else if (isGuest && guestId && tableNumber) {
        console.log("💳 Adding card for guest:", guestId);
      }

      const result = await paymentService.addPaymentMethod({
        fullName,
        cardNumber,
        expDate,
        cvv,
      });

      if (result.success) {
        console.log("💳 AddCard response:", result);

        const paymentMethod = result.data?.paymentMethod;

        if (paymentMethod) {
          console.log("✅ Adding payment method to context:", paymentMethod);
          addPaymentMethod(paymentMethod);
        } else {
          console.log("⚠️ No paymentMethod in response, refreshing from API");
          await refreshPaymentMethods();
        }

        console.log("🔄 Force refreshing payment methods after add...");
        await refreshPaymentMethods();

        const fromSavedCards = document.referrer.includes("/saved-cards");
        const returnTo = searchParams.get("returnTo");

        if (returnTo === "cards") {
          navigateWithTable("/menu?dashboard=cards");
        } else if (fromSavedCards) {
          navigateWithTable("/saved-cards");
        } else {
          router.back();
        }
      } else {
        const rawError = extractErrorMessage(
          result.error,
          t("errorAddCardGeneric"),
        );
        const ERROR_TRANSLATIONS: Record<string, string> = {
          "Invalid expiry date": t("errorInvalidExpiry"),
        };
        const errorMsg = ERROR_TRANSLATIONS[rawError] ?? rawError;
        setErrors({ general: errorMsg });
      }
    } catch (error) {
      console.error("Error saving card:", error);
      setErrors({
        general: t("errorAddCardNetwork"),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || "";
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length) {
      return parts.join(" ");
    } else {
      return v;
    }
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numbersOnlyRegex = /^[0-9\s]*$/;

    if (numbersOnlyRegex.test(value)) {
      const prevDigits = cardNumber.replace(/\s+/g, "").length;
      const nextDigits = value.replace(/\s+/g, "").length;
      const formatted = formatCardNumber(value);
      setCardNumber(formatted);
      if (errors.cardNumber)
        setErrors((prev) => ({ ...prev, cardNumber: undefined }));

      if (nextDigits - prevDigits > 1) {
        e.currentTarget.blur();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numbersOnlyRegex = /^[0-9]*$/;

    if (numbersOnlyRegex.test(value)) {
      setCvv(value.substring(0, 4));
      if (errors.cvv) setErrors((prev) => ({ ...prev, cvv: undefined }));
    }
  };

  const handleScanSuccess = (result: {
    cardNumber: string;
    expiryDate: string;
    cardholderName: string;
  }) => {
    setCardNumber(formatCardNumber(result.cardNumber));
    setFullName(result.cardholderName);
    setShowScanner(false);

    // Parse expiryDate (MM/YY or MM/YYYY)
    const parts = result.expiryDate.split("/");
    if (parts.length === 2) {
      const mm = parts[0].padStart(2, "0");
      const yy = parts[1].slice(-2);
      const mIdx = MONTHS.indexOf(mm);
      const yIdx = YEARS.indexOf(yy);
      if (mIdx >= 0) setExpMonthIdx(mIdx);
      if (yIdx >= 0) setExpYearIdx(yIdx);
    }
  };

  // Auto-abrir scanner si viene el parámetro scan=true
  useEffect(() => {
    const shouldAutoScan = searchParams.get("scan") === "true";
    if (shouldAutoScan) {
      setShowScanner(true);
    }
    // Marcar que ya terminó de leer los parámetros
    setIsLoadingParams(false);
  }, [searchParams]);

  // Mostrar loader mientras lee los parámetros
  if (isLoadingParams) {
    return <Loader />;
  }

  return (
    <>
      {showScanner && (
        <CardScanner
          onScanSuccess={handleScanSuccess}
          onClose={() => setShowScanner(false)}
        />
      )}

      <div className="min-h-dvh brand-evergreen flex flex-col">
        <MenuHeaderBack onBack={handleBack} />

        <div className="px-4 w-full flex-1 flex flex-col justify-end">
          <div className="left-4 right-4 bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
            <div className="pt-6 pb-12 px-8 flex flex-col justify-center">
              <h2 className="font-medium text-white text-3xl leading-7 mt-2 mb-2">
                {t("title")}
              </h2>
              <p className="text-white/80 text-sm">
                {t("subtitle")}
              </p>
            </div>
          </div>

          <div className="flex-1 h-full flex flex-col">
            <div className="min-h-full bg-white rounded-t-4xl flex-1 z-5 flex flex-col px-6 py-6">
              {/* Test Card Helper */}
              {process.env.NODE_ENV === "development" && (
                <div className="bg-even-grass/10 border border-even-grass/40 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-even-evergreen font-medium text-sm">
                        Development Mode
                      </p>
                      <p className="text-even-evergreen/70 text-xs">
                        Use eCartpay test card data
                      </p>
                    </div>
                    <button
                      onClick={fillTestCard}
                      className="px-3 py-2 bg-even-evergreen text-white text-xs rounded-md hover:opacity-90 transition-opacity"
                    >
                      Fill Test Card
                    </button>
                  </div>
                </div>
              )}

              {/* Add Card Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    {t("fullNameLabel")}
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={handleFullNameChange}
                    onKeyDown={handleKeyDown}
                    autoComplete="cc-name"
                    placeholder="John Doe"
                    className={`w-full px-3 py-3 border text-black rounded-lg focus:outline-none focus:ring focus:ring-even-evergreen focus:border-transparent ${errors.fullName ? "border-red-500 bg-red-50" : "border-gray-300"}`}
                  />
                  {errors.fullName && (
                    <p className="text-red-500 text-xs mt-1">
                      {errors.fullName}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    {t("cardNumberLabel")}
                  </label>
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={handleCardNumberChange}
                    onKeyDown={handleKeyDown}
                    autoComplete="cc-number"
                    inputMode="numeric"
                    placeholder="**** 2098"
                    maxLength={19}
                    className={`w-full px-3 py-3 text-black rounded-lg focus:outline-none focus:ring focus:ring-even-evergreen focus:border-transparent ${errors.cardNumber ? "border border-red-500 bg-red-50" : "bg-gray-100 border border-gray-200"}`}
                  />
                  {errors.cardNumber && (
                    <p className="text-red-500 text-xs mt-1">
                      {errors.cardNumber}
                    </p>
                  )}
                </div>

                {/* Expiration Date */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    {t("expiryLabel")}
                  </label>
                  <div className="flex gap-3">
                    <select
                      value={MONTHS[expMonthIdx]}
                      onChange={(e) =>
                        setExpMonthIdx(MONTHS.indexOf(e.target.value))
                      }
                      autoComplete="cc-exp-month"
                      className={`flex-1 px-3 py-3 rounded-lg text-black focus:outline-none focus:ring focus:ring-even-evergreen focus:border-transparent ${errors.expDate ? "border border-red-500 bg-red-50" : "bg-gray-100 border border-gray-200"}`}
                    >
                      {MONTHS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={YEARS[expYearIdx]}
                      onChange={(e) =>
                        setExpYearIdx(YEARS.indexOf(e.target.value))
                      }
                      autoComplete="cc-exp-year"
                      className={`flex-1 px-3 py-3 rounded-lg text-black focus:outline-none focus:ring focus:ring-even-evergreen focus:border-transparent ${errors.expDate ? "border border-red-500 bg-red-50" : "bg-gray-100 border border-gray-200"}`}
                    >
                      {YEARS.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  {errors.expDate && (
                    <p className="text-red-500 text-xs mt-1">
                      {errors.expDate}
                    </p>
                  )}
                </div>

                {/* CVV Field */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    CVV
                  </label>
                  <input
                    type="text"
                    value={cvv}
                    onChange={handleCvvChange}
                    onKeyDown={handleKeyDown}
                    autoComplete="cc-csc"
                    inputMode="numeric"
                    placeholder="123"
                    maxLength={4}
                    className={`w-full px-3 py-3 text-black rounded-lg focus:outline-none focus:ring focus:ring-even-evergreen focus:border-transparent ${errors.cvv ? "border border-red-500 bg-red-50" : "border border-gray-300"}`}
                  />
                  {errors.cvv && (
                    <p className="text-red-500 text-xs mt-1">{errors.cvv}</p>
                  )}
                </div>
              </div>

              {/* Save Button */}
              <button
                onClick={handleSave}
                disabled={isLoading}
                className="bg-even-grass text-even-evergreen hover:opacity-90 w-full py-3 rounded-full cursor-pointer transition-opacity mt-8 font-medium disabled:bg-even-grass/30 disabled:text-even-evergreen/40 disabled:cursor-not-allowed"
              >
                {isLoading ? t("savingCta") : t("saveCta")}
              </button>
              {errors.general && (
                <p className="text-red-500 text-sm text-center mt-3">
                  {errors.general}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function AddCardPage() {
  return (
    <Suspense fallback={<Loader />}>
      <AddCardContent />
    </Suspense>
  );
}
