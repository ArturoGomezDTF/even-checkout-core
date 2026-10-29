"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";

interface OutOfStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemName?: string;
}

export default function OutOfStockModal({
  isOpen,
  onClose,
  itemName,
}: OutOfStockModalProps) {
  const t = useTranslations("OutOfStockModal");
  const tc = useTranslations("Common");
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-end justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-4xl w-full mx-4 md:mx-6 lg:mx-8 shadow-xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 md:p-8 lg:p-10 max-w-2xl mx-auto">
          <div className="flex justify-center mb-4 md:mb-5 lg:mb-6">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-black text-center">
              {tc("productOutOfStock")}
            </h2>
          </div>

          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <p className="text-gray-600 text-base md:text-lg lg:text-xl text-center">
              {itemName ? (
                <>
                  <span className="font-medium text-black capitalize">
                    {itemName}
                  </span>{" "}
                  {t("itemUnavailableSuffix")}
                </>
              ) : (
                t("genericUnavailable")
              )}
            </p>
            <div className="bg-surface border border-stroke-soft/50 rounded-lg md:rounded-xl p-2 md:p-3 lg:p-4">
              <p className="text-black font-medium text-center text-base md:text-lg lg:text-xl">
                {t("chooseAnother")}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full mt-6 md:mt-8 lg:mt-10 bg-black hover:bg-stone-950 text-white text-base md:text-lg lg:text-xl py-3 md:py-4 lg:py-5 rounded-full transition-colors"
          >
            {tc("understood")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
