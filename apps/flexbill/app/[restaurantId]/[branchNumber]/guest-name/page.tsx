"use client";

import { useTranslations } from "next-intl";
import { useState, useRef } from "react";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { useGuest } from "@/app/context/GuestContext";
import { useTable } from "@/app/context/TableContext";
import { getRestaurantData } from "@/app/utils/restaurantData";
import MenuHeaderBack from "@/app/components/headers/MenuHeaderBack";
import { useValidateAccess } from "@/app/hooks/useValidateAccess";
import ValidationError from "@/app/components/ValidationError";

export default function GuestNamePage() {
  const t = useTranslations("GuestNamePage");
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { navigateWithTable } = useTableNavigation();
  const { setGuestName } = useGuest();
  const { state } = useTable();
  const restaurantData = getRestaurantData();
  const { validationError } = useValidateAccess();

  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const textOnlyRegex = /^[a-zA-ZÀ-ÿ\u00f1\u00d1\s'-]*$/;
    if (textOnlyRegex.test(value)) {
      setName(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && name.trim()) {
      e.preventDefault();
      inputRef.current?.blur();
      handleContinue();
    }
  };

  const handleInputFocus = () => {
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  };

  const handleContinue = () => {
    const trimmed = name.trim();
    if (trimmed) {
      setGuestName(trimmed);
    }
    navigateWithTable("/payment-options");
  };

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
                  value={name}
                  onChange={handleNameChange}
                  onKeyDown={handleKeyDown}
                  onFocus={handleInputFocus}
                  autoFocus
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
            onClick={handleContinue}
            disabled={!name.trim()}
            className={`w-full py-3 md:py-4 lg:py-5 rounded-full transition-colors text-even-evergreen font-medium text-base md:text-lg lg:text-xl ${
              name.trim()
                ? "bg-even-grass cursor-pointer"
                : "bg-even-grass opacity-50 cursor-not-allowed"
            }`}
          >
            {t("continueCta")}
          </button>
        </div>
      </div>
    </div>
  );
}
