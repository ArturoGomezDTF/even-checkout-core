"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

interface Props {
  onDismiss: () => void;
}

export default function OrderNotificationModal({ onDismiss }: Props) {
  const t = useTranslations("OrderNotificationModal");
  const tc = useTranslations("Common");
  return createPortal(
    <div
      className="fixed inset-0 bg-black/25 backdrop-blur-xs z-[9999] flex items-center justify-center animate-fade-in"
      onClick={onDismiss}
    >
      <div
        className="relative bg-even-evergreen/80 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] w-full mx-4 rounded-4xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-white/70" />
        </button>

        <div className="flex flex-col items-center px-8 pt-18 pb-14 gap-7">
          {/* Logo */}
          <img src="/logos/whatsapp.svg" alt="Even" className="size-16" />

          {/* Text */}
          <div className="text-center space-y-2">
            <h2 className="text-white font-semibold text-3xl pb-4">
              {t("title")}
            </h2>
            <p className="text-white/70 text-lg leading-relaxed">
              {t("message")}
            </p>
          </div>

          {/* Button */}
          <button
            onClick={onDismiss}
            className="mt-2 w-full bg-white text-gray-900 font-semibold py-3.5 rounded-full text-md hover:bg-white/90 transition-colors active:scale-95"
          >
            {tc("understood")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
