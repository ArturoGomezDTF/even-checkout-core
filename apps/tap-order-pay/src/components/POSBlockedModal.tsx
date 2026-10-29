"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { lockScroll, unlockScroll } from "@/utils/scrollLock";

interface POSBlockedModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: "agent_disconnected" | "turno_closed";
  restaurantName?: string;
  restaurantLogo?: string | null;
}

export default function POSBlockedModal({
  isOpen,
  onClose,
  reason,
  restaurantName,
  restaurantLogo,
}: POSBlockedModalProps) {
  const t = useTranslations("POSBlockedModal");
  const tc = useTranslations("Common");
  useEffect(() => {
    if (isOpen) {
      lockScroll();
      return unlockScroll;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isTurnoClosed = reason === "turno_closed";

  return createPortal(
    <div
      className="fixed inset-0 z-99999 flex items-end justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-4xl w-full mx-4 md:mx-6 lg:mx-8 shadow-xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 md:p-8 lg:p-10 max-w-2xl mx-auto">
          <div className="flex justify-center items-start mb-4 md:mb-5 lg:mb-6">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-black text-center">
              {isTurnoClosed
                ? t("restaurantClosedTitle")
                : t("serviceUnavailableTitle")}
            </h2>
          </div>

          {(restaurantName || restaurantLogo) && (
            <div className="flex flex-col items-center mb-6 md:mb-8 lg:mb-10">
              {restaurantLogo ? (
                <img
                  src={restaurantLogo}
                  alt={restaurantName || tc("restaurantLogoAlt")}
                  className="w-20 h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 object-contain rounded-lg md:rounded-xl mb-3 md:mb-4 lg:mb-5"
                />
              ) : (
                <div className="w-20 h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 bg-gray-200 rounded-lg md:rounded-xl flex items-center justify-center mb-3 md:mb-4 lg:mb-5">
                  <img
                    src="/even/even-asterisk-evergreen.svg"
                    alt="Logo Even"
                    className="w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 object-contain"
                  />
                </div>
              )}
              {restaurantName && (
                <h3 className="text-lg md:text-xl lg:text-2xl font-medium text-black text-center">
                  {restaurantName}
                </h3>
              )}
            </div>
          )}

          <p className="text-gray-600 text-base md:text-lg lg:text-xl text-center mb-6 md:mb-8">
            {isTurnoClosed
              ? t("turnoClosedMessage")
              : t("agentDisconnectedMessage")}
          </p>

          <button
            onClick={onClose}
            className="w-full bg-even-grass text-even-evergreen text-base md:text-lg lg:text-xl py-3 md:py-4 lg:py-5 rounded-full transition-opacity hover:opacity-90 active:scale-95"
          >
            {tc("understood")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
