"use client";

// NOTE: This page is maintained for users who want to manage payment methods separately
// Main payment flows now use EcartPay SDK directly in payment/page.tsx and add-tip/page.tsx

import { useTranslations } from "next-intl";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTable } from "@/app/context/TableContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { useGuest, useIsGuest } from "@/app/context/GuestContext";
import { usePayment } from "@/app/context/PaymentContext";
import { getRestaurantData } from "@/app/utils/restaurantData";
import { apiService } from "@/app/utils/api";
import MenuHeaderBack from "@/app/components/headers/MenuHeaderBack";
import CardScanner from "@/app/components/CardScanner";
import Loader from "@/app/components/UI/Loader";
import { useAuth } from "@/app/context/AuthContext";

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

function AddCardContent() {
  const t = useTranslations("AddCardPage");
  const { state } = useTable();
  const { navigateWithTable } = useTableNavigation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const restaurantData = getRestaurantData();
  const isGuestUser = useIsGuest();
  const { guestId, tableNumber } = useGuest();
  const { addPaymentMethod, refreshPaymentMethods, paymentMethods } =
    usePayment();
  const { user } = useAuth();

  const [fullName, setFullName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expMonthIdx, setExpMonthIdx] = useState(0);
  const [expYearIdx, setExpYearIdx] = useState(0);
  const [cvv, setCvv] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [isLoadingParams, setIsLoadingParams] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{
    fullName?: string;
    cardNumber?: string;
    cvv?: string;
    general?: string;
  }>({});

  useEffect(() => {
    refreshPaymentMethods();
  }, []);

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
    setExpYearIdx(2); // 3rd year in range
    setCvv("123");
  };

  const handleSave = async () => {
    const newErrors: typeof errors = {};

    if (!fullName.trim()) newErrors.fullName = t("errorFullNameRequired");
    if (!cardNumber.trim())
      newErrors.cardNumber = t("errorCardNumberRequired");
    if (!cvv.trim()) newErrors.cvv = t("errorCvvRequired");

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

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
      } else if (isGuestUser && guestId && tableNumber) {
        apiService.setGuestInfo(guestId, tableNumber.toString());
      }

      const result = await apiService.addPaymentMethod({
        fullName,
        cardNumber,
        expDate,
        cvv,
      });

      if (result.success) {
        if (result.data?.paymentMethod) {
          addPaymentMethod(result.data.paymentMethod);
        } else {
          await refreshPaymentMethods();
        }

        await refreshPaymentMethods();

        const returnTo = searchParams.get("returnTo");
        const fromSavedCards = document.referrer.includes("/saved-cards");

        if (returnTo === "cards") {
          navigateWithTable("/menu?dashboard=cards");
        } else if (fromSavedCards) {
          navigateWithTable("/saved-cards");
        } else {
          router.back();
        }
      } else {
        const rawError =
          typeof result.error === "string"
            ? result.error
            : (result.error as unknown as { message?: string })?.message ||
              t("errorAddCardGeneric");
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
      const formatted = formatCardNumber(value);
      setCardNumber(formatted);
      if (errors.cardNumber)
        setErrors((prev) => ({ ...prev, cardNumber: undefined }));
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
    setIsLoadingParams(false);
  }, [searchParams]);

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

      <div className="min-h-new brand-evergreen flex flex-col">
        <MenuHeaderBack
          restaurant={restaurantData}
          tableNumber={state.tableNumber}
          onBack={handleBack}
        />

        <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col justify-end">
          <div className="left-4 right-4 bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
            <div className="pt-6 md:pt-7 lg:pt-8 pb-12 md:pb-14 lg:pb-16 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
              <h2 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 mt-2 md:mt-3 lg:mt-4 mb-2 md:mb-3 lg:mb-4">
                {t("title")}
              </h2>
              <p className="text-white/80 text-sm md:text-base lg:text-lg">
                {t("subtitle")}
              </p>
            </div>
          </div>

          <div className="flex-1 h-full flex flex-col">
            <div className="min-h-full bg-white rounded-t-4xl flex-1 z-5 flex flex-col px-6 md:px-8 lg:px-10 py-6 md:py-8 lg:py-10">
              {/* Test Card Helper */}
              {process.env.NODE_ENV === "development" && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-800 font-medium text-sm">
                        Development Mode
                      </p>
                      <p className="text-blue-600 text-xs">
                        Use eCartpay test card data
                      </p>
                    </div>
                    <button
                      onClick={fillTestCard}
                      className="px-3 py-2 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 transition-colors"
                    >
                      Fill Test Card
                    </button>
                  </div>
                </div>
              )}

              {/* Add Card Form */}
              <div className="space-y-4 md:space-x-5 text-sm md:text-base lg:text-lg">
                <div>
                  <label className="block text-gray-700 mb-2">
                    {t("fullNameLabel")}
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={handleFullNameChange}
                    onKeyDown={handleKeyDown}
                    autoComplete="cc-name"
                    placeholder="John Doe"
                    className={`w-full px-4 md:px-5 lg:px-6 py-3 md:py-4 lg:py-5 border text-black rounded-lg focus:outline-none focus:ring focus:ring-even-grass focus:border-transparent ${errors.fullName ? "border-red-500 bg-red-50" : "border-gray-300"}`}
                  />
                  {errors.fullName && (
                    <p className="text-red-500 text-xs mt-1">
                      {errors.fullName}
                    </p>
                  )}
                </div>

                <div className="text-sm md:text-base lg:text-lg">
                  <label className="block text-gray-700 mb-2">
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
                    className={`w-full px-4 md:px-5 lg:px-6 py-3 md:py-4 lg:py-5 text-black rounded-lg focus:outline-none focus:ring focus:ring-even-grass focus:border-transparent ${errors.cardNumber ? "border border-red-500 bg-red-50" : "bg-gray-100 border border-gray-200"}`}
                  />
                  {errors.cardNumber && (
                    <p className="text-red-500 text-xs mt-1">
                      {errors.cardNumber}
                    </p>
                  )}
                </div>

                {/* Expiration Date */}
                <div className="text-sm md:text-base lg:text-lg">
                  <label className="block text-gray-700 mb-2">
                    {t("expiryLabel")}
                  </label>
                  <div className="flex gap-3">
                    <select
                      value={MONTHS[expMonthIdx]}
                      onChange={(e) =>
                        setExpMonthIdx(MONTHS.indexOf(e.target.value))
                      }
                      autoComplete="cc-exp-month"
                      className="flex-1 px-4 md:px-5 lg:px-6 py-3 md:py-4 lg:py-5 rounded-lg text-black focus:outline-none focus:ring focus:ring-even-grass focus:border-transparent bg-gray-100 border border-gray-200"
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
                      className="flex-1 px-4 md:px-5 lg:px-6 py-3 md:py-4 lg:py-5 rounded-lg text-black focus:outline-none focus:ring focus:ring-even-grass focus:border-transparent bg-gray-100 border border-gray-200"
                    >
                      {YEARS.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* CVV Field */}
                <div className="text-sm md:text-base lg:text-lg">
                  <label className="block text-gray-700 mb-2">CVV</label>
                  <input
                    type="text"
                    value={cvv}
                    onChange={handleCvvChange}
                    onKeyDown={handleKeyDown}
                    autoComplete="cc-csc"
                    inputMode="numeric"
                    placeholder="123"
                    maxLength={4}
                    className={`w-full px-4 md:px-5 lg:px-6 py-3 md:py-4 lg:py-5 text-black rounded-lg focus:outline-none focus:ring focus:ring-even-grass focus:border-transparent ${errors.cvv ? "border border-red-500 bg-red-50" : "border border-gray-300"}`}
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
                className="bg-black hover:bg-stone-950 text-base md:text-lg lg:text-xl w-full text-white py-3 md:py-4 lg:py-5 rounded-full cursor-pointer transition-colors mt-8 disabled:bg-stone-600 disabled:cursor-not-allowed"
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
