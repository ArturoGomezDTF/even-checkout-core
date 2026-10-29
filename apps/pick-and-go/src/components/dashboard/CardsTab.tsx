"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { usePayment } from "@/context/PaymentContext";
import { useTableNavigation } from "@/hooks/useTableNavigation";
import { useModalBackClose } from "@/hooks/useModalBackClose";
import {
  Plus,
  Trash2,
  Star,
  StarOff,
  Loader2,
  CircleAlert,
} from "lucide-react";
import { getCardTypeIcon } from "@/utils/cardIcons";

export default function CardsTab() {
  const t = useTranslations("CardsTab");
  const tc = useTranslations("Common");
  const { navigateWithTable } = useTableNavigation();
  const {
    paymentMethods,
    isLoading,
    setDefaultPaymentMethod,
    deletePaymentMethod,
  } = usePayment();

  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  useModalBackClose(!!errorMessage, () => setErrorMessage(null));

  const handleAddNewCard = () => {
    navigateWithTable("add-card?returnTo=cards");
  };

  const handleSetDefault = async (paymentMethodId: string) => {
    setSettingDefaultId(paymentMethodId);
    try {
      await setDefaultPaymentMethod(paymentMethodId);
    } catch (error) {
      setErrorMessage(t("errorSetDefault"));
    } finally {
      setSettingDefaultId(null);
    }
  };

  const handleDeleteCard = async (paymentMethodId: string) => {
    if (!confirm(tc("confirmDeleteCard"))) {
      return;
    }

    setDeletingCardId(paymentMethodId);
    try {
      await deletePaymentMethod(paymentMethodId);
    } catch (error) {
      setErrorMessage(t("errorDeleteCard"));
    } finally {
      setDeletingCardId(null);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex-1"></div>
      <div className="flex-shrink-0 pb-6 md:pb-8 lg:pb-10">
        {/* Loading State */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12 md:py-16 lg:py-20">
            <Loader2 className="size-8 md:size-10 lg:size-12 animate-spin text-even-shamrock" />
          </div>
        ) : (
          <>
            {/* Payment Methods List */}
            <div className="space-y-2 md:space-y-3 lg:space-y-4">
              {paymentMethods.map((method) => (
                <div
                  key={method.id}
                  className={`relative border rounded-full py-1.5 md:py-2 lg:py-2.5 px-5 md:px-6 lg:px-8 ${
                    method.isDefault
                      ? "border-even-grass bg-even-grass/10"
                      : "border-black/50 bg-surface"
                  }`}
                >
                  {/* Default Badge */}
                  {method.isDefault && (
                    <div className="absolute -top-2 md:-top-2.5 lg:-top-3 left-4 md:left-5 lg:left-6 bg-even-grass text-even-evergreen text-xs md:text-sm lg:text-base px-2 md:px-3 lg:px-4 py-1 md:py-1.5 lg:py-2 rounded-full">
                      {t("defaultBadge")}
                    </div>
                  )}

                  <div className="flex items-center">
                    <div className="flex items-center gap-2 md:gap-3 lg:gap-4 mx-auto">
                      <div>
                        <span className="text-2xl md:text-3xl lg:text-4xl">
                          {getCardTypeIcon(method.cardBrand, "medium")}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 md:gap-3 lg:gap-4">
                          <span className="text-black text-base md:text-lg lg:text-xl">
                            **** {method.lastFourDigits}
                          </span>
                          {method.expiryMonth && method.expiryYear && (
                            <p className="text-xs md:text-sm lg:text-base text-gray-500">
                              {method.expiryMonth?.toString().padStart(2, "0")}/
                              {method.expiryYear?.toString().slice(-2)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center">
                      {/* Set Default Button */}
                      {!method.isDefault && (
                        <button
                          onClick={() => handleSetDefault(method.id)}
                          disabled={settingDefaultId === method.id}
                          className="text-gray-400 hover:text-even-shamrock transition-colors disabled:opacity-50 cursor-pointer"
                          title={t("setDefaultTitle")}
                        >
                          {settingDefaultId === method.id ? (
                            <Loader2 className="size-5 md:size-6 lg:size-7 animate-spin" />
                          ) : (
                            <StarOff className="size-5 md:size-6 lg:size-7" />
                          )}
                        </button>
                      )}

                      {method.isDefault && (
                        <div
                          className="text-even-shamrock"
                          title={t("defaultCardTitle")}
                        >
                          <Star className="size-5 md:size-6 lg:size-7 fill-current" />
                        </div>
                      )}

                      <button
                        onClick={() => handleDeleteCard(method.id)}
                        disabled={deletingCardId === method.id}
                        className="p-2 md:p-2.5 lg:p-3 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 cursor-pointer"
                        title={tc("deleteCardTitle")}
                      >
                        {deletingCardId === method.id ? (
                          <Loader2 className="size-5 md:size-6 lg:size-7 animate-spin" />
                        ) : (
                          <Trash2 className="size-5 md:size-6 lg:size-7" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Add New Card Button */}
        <button
          onClick={handleAddNewCard}
          className="mt-2 md:mt-3 lg:mt-4 border border-black/50 flex justify-center items-center gap-1 md:gap-1.5 lg:gap-2 w-full text-black text-base md:text-lg lg:text-xl py-3 md:py-4 lg:py-5 rounded-full cursor-pointer transition-colors bg-surface hover:bg-gray-100"
        >
          <Plus className="size-5 md:size-6 lg:size-7" />
          {t("addNewCard")}
        </button>
      </div>

      {/* Error Modal */}
      {errorMessage &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-end justify-center bg-black/50"
            onClick={() => setErrorMessage(null)}
          >
            <div
              className="bg-white rounded-t-4xl w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 max-w-2xl mx-auto">
                <div className="flex flex-col items-center mb-4">
                  <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
                    <CircleAlert
                      className="size-7 text-red-500"
                      strokeWidth={2}
                    />
                  </div>
                  <h2 className="text-xl font-semibold text-black text-center">
                    {tc("errorTitle")}
                  </h2>
                </div>
                <div className="bg-surface border border-stroke-soft/50 rounded-xl p-4 mb-6">
                  <p className="text-gray-700 text-sm text-center">
                    {errorMessage}
                  </p>
                </div>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="w-full bg-even-grass text-even-evergreen py-3 rounded-full text-base"
                >
                  {tc("understood")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
