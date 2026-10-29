"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { ActiveUser } from "@/app/services/table.service";

interface EqualSplitSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeUsers: ActiveUser[];
  onConfirm: (includedActiveUserIds: string[]) => Promise<void>;
}

export default function EqualSplitSelectionModal({
  isOpen,
  onClose,
  activeUsers,
  onConfirm,
}: EqualSplitSelectionModalProps) {
  const t = useTranslations("EqualSplitSelectionModal");
  // Todos marcados por defecto — el usuario desmarca a quien quiere excluir.
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const toggleUser = (id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedCount = activeUsers.length - excludedIds.size;

  const handleConfirm = async () => {
    const includedActiveUserIds = activeUsers
      .filter((u) => !excludedIds.has(u.id))
      .map((u) => u.id);
    if (includedActiveUserIds.length === 0) return;

    setIsSubmitting(true);
    try {
      await onConfirm(includedActiveUserIds);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-end justify-center backdrop-blur-sm"
      style={{ zIndex: 99999 }}
    >
      {/* Fondo */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose}></div>

      {/* Modal */}
      <div className="relative bg-white rounded-t-4xl w-full mx-4 md:mx-6 lg:mx-8 max-h-[80vh] flex flex-col">
        {/* Titulo */}
        <div className="px-6 pt-4 md:px-8 lg:px-10 md:pt-6 lg:pt-8 flex-shrink-0">
          <div className="flex items-center justify-between pb-4 border-b border-stroke">
            <div>
              <h3 className="text-lg md:text-xl lg:text-2xl font-semibold text-black">
                {t("title")}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {t("subtitle")}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors cursor-pointer flex-shrink-0"
            >
              <X className="size-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Lista de personas */}
        <div className="px-6 py-4 md:px-8 lg:px-10 md:py-6 overflow-y-auto flex-1">
          <div className="space-y-3">
            {activeUsers.map((user) => {
              const isSelected = !excludedIds.has(user.id);
              return (
                <div
                  key={user.id}
                  onClick={() => toggleUser(user.id)}
                  className={`py-3 px-4 rounded-xl border cursor-pointer transition-colors flex items-center gap-3 ${
                    isSelected
                      ? "border-even-grass bg-even-grass/10"
                      : "border-stroke bg-surface"
                  }`}
                >
                  <div
                    className={`w-5 h-5 md:w-6 md:h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      isSelected
                        ? "border-even-grass bg-even-grass"
                        : "border-gray-300"
                    }`}
                  >
                    {isSelected && (
                      <svg
                        className="w-3 h-3 md:w-4 md:h-4 text-even-evergreen"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  <span className="text-black text-base md:text-lg capitalize">
                    {user.guest_name || t("defaultGuestName")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 md:px-8 lg:px-10 border-t border-stroke flex-shrink-0">
          <button
            onClick={handleConfirm}
            disabled={selectedCount === 0 || isSubmitting}
            className="w-full bg-even-grass text-even-evergreen rounded-full py-3 md:py-4 text-base md:text-lg font-medium transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
          >
            {isSubmitting
              ? t("confirmingCta")
              : t("splitBetweenCta", { count: selectedCount })}
          </button>
        </div>
      </div>
    </div>
  );
}
