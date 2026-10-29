"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { usePayment } from "@/app/context/PaymentContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { useModalBackClose } from "@/app/hooks/useModalBackClose";
import {
  Plus,
  Trash2,
  Star,
  StarOff,
  CircleAlert,
  Loader2,
  X,
} from "lucide-react";
import { getCardTypeIcon } from "@/app/utils/cardIcons";

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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  useModalBackClose(!!confirmDeleteId, () => setConfirmDeleteId(null));
  useModalBackClose(!!errorMessage, () => setErrorMessage(null));

  const handleAddNewCard = () => {
    navigateWithTable("add-card?returnTo=cards");
  };

  const handleSetDefault = async (paymentMethodId: string) => {
    setSettingDefaultId(paymentMethodId);
    try {
      await setDefaultPaymentMethod(paymentMethodId);
    } catch {
      setErrorMessage(t("errorSetDefault"));
    } finally {
      setSettingDefaultId(null);
    }
  };

  const handleDeleteCard = async (paymentMethodId: string) => {
    setConfirmDeleteId(null);
    setDeletingCardId(paymentMethodId);
    try {
      await deletePaymentMethod(paymentMethodId);
    } catch {
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
                      {!method.isDefault &&
                        method.id !== "system-default-card" && (
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

                      {/* Delete Button - not shown for system card */}
                      {method.id !== "system-default-card" && (
                        <button
                          onClick={() => setConfirmDeleteId(method.id)}
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
                      )}
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

      {/* Confirm Delete Modal */}
      {confirmDeleteId &&
        createPortal(
          <div
            className="fixed inset-0 flex items-end justify-center"
            style={{ zIndex: 99999 }}
          >
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setConfirmDeleteId(null)}
            />
            <div className="relative bg-white rounded-t-4xl w-full p-6 md:p-7 lg:p-8">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="absolute top-4 md:top-5 lg:top-6 right-4 md:right-5 lg:right-6 text-gray-400 hover:text-gray-600"
              >
                <X className="size-5 md:size-6 lg:size-7" />
              </button>
              <h3 className="text-base md:text-xl lg:text-2xl font-semibold text-gray-800 mb-4 md:mb-5">
                {tc("deleteCardTitle")}
              </h3>
              <p className="text-sm md:text-base text-gray-600 mb-6 md:mb-8">
                {tc("confirmDeleteCard")}
              </p>
              <div className="flex gap-3 md:gap-4">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 md:py-3 text-base md:text-lg rounded-full cursor-pointer transition-colors"
                >
                  {tc("cancel")}
                </button>
                <button
                  onClick={() => handleDeleteCard(confirmDeleteId)}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 md:py-3 text-base md:text-lg rounded-full cursor-pointer transition-colors"
                >
                  {t("deleteCta")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Error Modal */}
      {errorMessage &&
        createPortal(
          <div
            className="fixed inset-0 flex items-end justify-center"
            style={{ zIndex: 99999 }}
          >
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setErrorMessage(null)}
            />
            <div className="relative bg-white rounded-t-4xl w-full p-6 md:p-7 lg:p-8">
              <button
                onClick={() => setErrorMessage(null)}
                className="absolute top-4 md:top-5 lg:top-6 right-4 md:right-5 lg:right-6 text-gray-400 hover:text-gray-600"
              >
                <X className="size-5 md:size-6 lg:size-7" />
              </button>
              <div className="flex items-center gap-3 mb-4 md:mb-5">
                <CircleAlert className="size-6 md:size-7 text-red-500 flex-shrink-0" />
                <h3 className="text-base md:text-xl lg:text-2xl font-semibold text-gray-800">
                  {tc("errorTitle")}
                </h3>
              </div>
              <p className="text-sm md:text-base text-gray-600 mb-6 md:mb-8">
                {errorMessage}
              </p>
              <button
                onClick={() => setErrorMessage(null)}
                className="w-full bg-even-grass text-even-evergreen py-2 md:py-3 text-base md:text-lg rounded-full cursor-pointer hover:opacity-90 transition-opacity"
              >
                {tc("understood")}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
