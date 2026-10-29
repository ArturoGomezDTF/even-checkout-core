"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useBranch } from "@/context/BranchContext";
import { useNavigation } from "@/hooks/useNavigation";

interface BranchSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBranchChangeRequested?: (newBranchNumber: number) => Promise<void>;
  isProcessing?: boolean;
  itemsToRemove?: Array<{
    id: number;
    name: string;
    quantity: number;
    cartItemId?: string;
  }>;
}

const ANIMATION_DURATION = 380;

export default function BranchSelectionModal({
  isOpen,
  onClose,
  onBranchChangeRequested,
  isProcessing = false,
  itemsToRemove = [],
}: BranchSelectionModalProps) {
  const t = useTranslations("BranchSelectionModal");
  const tc = useTranslations("Common");
  const { branches, selectedBranchNumber } = useBranch();
  const { changeBranch } = useNavigation();
  const [isClosing, setIsClosing] = useState(false);

  const [tempSelectedBranch, setTempSelectedBranch] = useState<number | null>(
    selectedBranchNumber,
  );

  const wasOpen = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setIsClosing(false);
      setTempSelectedBranch(selectedBranchNumber);
    }
    wasOpen.current = isOpen;
  }, [isOpen, selectedBranchNumber]);

  // Animación de cierre antes de notificar al padre
  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, ANIMATION_DURATION);
  };

  if (!isOpen && !isClosing) return null;

  const handleSelectBranch = (branchNumber: number) => {
    setTempSelectedBranch(branchNumber);
  };

  const handleConfirm = async () => {
    if (
      tempSelectedBranch !== null &&
      tempSelectedBranch !== selectedBranchNumber
    ) {
      if (onBranchChangeRequested) {
        await onBranchChangeRequested(tempSelectedBranch);
      } else {
        setIsClosing(true);
        setTimeout(() => {
          setIsClosing(false);
          onClose();
          changeBranch(tempSelectedBranch);
        }, ANIMATION_DURATION);
      }
    } else {
      handleClose();
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 99999 }}
    >
      {/* Fondo */}
      <div
        className="absolute inset-0 bg-black/40"
        style={{
          animation: isClosing
            ? `fadeOut ${ANIMATION_DURATION}ms cubic-bezier(0.32, 0.72, 0, 1) forwards`
            : `fadeIn ${ANIMATION_DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        }}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className="relative bg-white rounded-t-4xl w-full"
        style={{
          animation: isClosing
            ? `slideDown ${ANIMATION_DURATION}ms cubic-bezier(0.32, 0.72, 0, 1) forwards`
            : `slideUp ${ANIMATION_DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="px-6 pt-2">
          <div className="flex items-center justify-between pb-4 border-b border-[#8e8e8e]">
            <h3 className="text-lg font-semibold text-black">
              {tc("selectBranch")}
            </h3>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="size-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {isProcessing ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-even-shamrock" />
              <p className="text-gray-600 text-base mb-4">
                {t("verifyingAvailability")}
              </p>
            </div>
          ) : itemsToRemove.length > 0 ? (
            <div className="mb-4">
              <p className="text-gray-600 text-base mb-4">
                {tc("itemsUnavailableIntro")}
              </p>
              <div className="bg-red-50 rounded-lg p-4 mb-4 max-h-48 overflow-y-auto">
                <ul className="space-y-2 text-left">
                  {itemsToRemove.map((item) => (
                    <li
                      key={item.cartItemId || item.id}
                      className="flex items-start gap-2 text-sm"
                    >
                      <X className="size-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{item.name}</p>
                        <p className="text-gray-600 text-xs">
                          {tc("itemQuantityLabel", { quantity: item.quantity })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-gray-600 text-sm mb-4">
                {tc("otherItemsKept")}
              </p>
            </div>
          ) : branches.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-base">
                {t("noBranchesAvailable")}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {branches.map((branch) => {
                const isSelected = branch.branch_number === tempSelectedBranch;
                return (
                  <button
                    key={branch.id}
                    onClick={() => handleSelectBranch(branch.branch_number)}
                    className={`w-full py-2 px-5 border rounded-full transition-colors text-left ${
                      isSelected
                        ? "border-even-grass bg-even-grass/10"
                        : "border-black/50 bg-surface hover:border-gray-400"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-black text-base md:text-lg">
                          {branch.name}
                        </p>
                        <p className="text-xs md:text-sm text-gray-600">
                          {branch.address}
                        </p>
                      </div>

                      {/* Radio button */}
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          isSelected
                            ? "border-even-grass bg-even-grass"
                            : "border-gray-300"
                        }`}
                      >
                        {isSelected && (
                          <div className="w-full h-full rounded-full bg-white scale-50" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white">
          <button
            onClick={handleConfirm}
            className="w-full bg-even-grass text-even-evergreen py-3 rounded-full transition-opacity hover:opacity-90 text-base"
          >
            {tc("confirmCta")}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0.6; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes slideDown {
          from { transform: translateY(0);    opacity: 1; }
          to   { transform: translateY(100%); opacity: 0.6; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
