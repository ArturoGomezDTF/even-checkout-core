"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  BadgePercent,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useFlyToCart } from "@/hooks/useFlyToCart";
import { lockScroll, unlockScroll } from "@/utils/scrollLock";
import type { PromoActivation } from "@/services/promoActivations.service";

interface RowProps {
  activation: PromoActivation;
  isAuthenticated: boolean;
  onClaim: (claimId: string) => Promise<void>;
  onClaimed: (batchId: string) => void;
  onRequireLogin: () => void;
  onAuthComplete?: () => void;
  hasMultiplePromos: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
}

function PromoActivationCard({
  activation,
  isAuthenticated,
  onClaim,
  onClaimed,
  onRequireLogin,
  onAuthComplete,
  hasMultiplePromos,
  canGoPrev,
  canGoNext,
  onPrevPage,
  onNextPage,
}: RowProps) {
  const t = useTranslations("PromoClaimModal");
  const { flyToCart } = useFlyToCart();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const awaitingLoginRef = useRef(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El comensal elige un solo platillo del batch (el reclamo es "elige tu
  // premio", no "llévate todos") — default al primero, que es el único
  // cuando la activación tiene un solo producto.
  const [selectedItemId, setSelectedItemId] = useState(activation.items[0]?.id);

  // "% en la cuenta" — personal (user_discounts, pseudo-activación "ud-<id>")
  // o promo QR real (promo_activations.discount_type='order') — en ambos
  // casos sin platillos: se reclama y se aplica solo al pagar.
  const isOrderDiscount =
    (activation.personal && activation.personalType === "order") ||
    activation.items.length === 0;

  const selectedItem =
    activation.items.find((item) => item.id === selectedItemId) ||
    activation.items[0];
  const menuItem = selectedItem?.menu_items;
  const needsLogin =
    activation.user_type_filter === "authenticated" && !isAuthenticated;
  const hasChoice = activation.items.length > 1;
  const discountLabel =
    activation.discount_percentage >= 100
      ? t("freeLabel")
      : t("discountPercentOff", { percent: activation.discount_percentage });

  const doClaim = async () => {
    if (!buttonRef.current) return;
    setError(null);
    setIsClaiming(true);
    try {
      if (isOrderDiscount) {
        // Personal: el id va codificado en el batch_id ("ud-<id>"). Promo
        // QR real: el id de la única fila viene en activation_id (no hay
        // item del que sacarlo).
        const claimId = activation.personal
          ? activation.batch_id.replace(/^ud-/, "")
          : activation.activation_id!;
        await onClaim(claimId);
        // Sin carrito de por medio: no hay animación de vuelo, se marca y ya
        onClaimed(activation.batch_id);
        return;
      }
      if (!selectedItem) return;
      await onClaim(selectedItem.id);
      flyToCart(buttonRef.current, () => {
        onClaimed(activation.batch_id);
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("errorClaimFailed"),
      );
      setIsClaiming(false);
    }
  };

  const handleClaim = async () => {
    if (needsLogin) {
      awaitingLoginRef.current = true;
      onRequireLogin();
      return;
    }
    await doClaim();
  };

  // Si el clic en "Reclamar" mandó a loguearse (needsLogin), al volver ya
  // autenticado se completa el reclamo solo — el usuario no tiene que
  // volver a tocar el botón.
  useEffect(() => {
    if (awaitingLoginRef.current && isAuthenticated) {
      awaitingLoginRef.current = false;
      onAuthComplete?.();
      doClaim();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-white text-base font-medium truncate">
          {isOrderDiscount
            ? t("accountDiscountLabel")
            : menuItem?.name || t("productFallback")}
        </p>
        <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-white text-even-evergreen text-[10px] font-bold uppercase tracking-wide">
          {discountLabel}
        </span>
      </div>

      {isOrderDiscount ? (
        <div className="flex items-center gap-3 rounded-xl p-3 border-2 border-even-grass bg-white/10">
          <div className="size-14 shrink-0 rounded-lg overflow-hidden bg-white/5 flex items-center justify-center">
            <BadgePercent
              className="size-8 text-even-grass"
              strokeWidth={1.5}
            />
          </div>
          <p className="flex-1 min-w-0 text-white text-sm text-left">
            {t("claimAutoApplyMessage", {
              percent: activation.discount_percentage,
            })}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {activation.items.map((item) => {
            const isSelected = item.id === selectedItemId;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!hasChoice}
                onClick={() => setSelectedItemId(item.id)}
                className={`flex items-center gap-3 rounded-xl p-3 border-2 transition-colors ${
                  isSelected
                    ? "border-even-grass bg-white/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                } ${!hasChoice ? "cursor-default" : ""}`}
              >
                <div className="size-14 shrink-0 rounded-lg overflow-hidden bg-white/5 flex items-center justify-center">
                  {item.menu_items?.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.menu_items.image_url}
                      alt={item.menu_items.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src="/even/even-asterisk-grass.svg"
                      alt="Even"
                      className="size-7"
                    />
                  )}
                </div>
                <p className="flex-1 min-w-0 text-white text-sm font-medium text-left truncate">
                  {item.menu_items?.name || t("productFallback")}
                </p>
                {isSelected && (
                  <span className="shrink-0 bg-even-grass rounded-full p-1">
                    <Check
                      className="size-3 text-even-evergreen"
                      strokeWidth={3}
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="text-red-300 text-xs text-center">{error}</p>}

      <div className="flex items-center justify-center gap-3">
        {hasMultiplePromos && (
          <button
            type="button"
            onClick={onPrevPage}
            disabled={!canGoPrev}
            className="shrink-0 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronLeft className="size-5" />
          </button>
        )}

        <button
          ref={buttonRef}
          onClick={handleClaim}
          disabled={isClaiming}
          className="flex-1 bg-even-grass text-even-evergreen font-medium py-2.5 px-5 rounded-full text-sm shadow-lg transition-all hover:scale-105 active:scale-90 disabled:opacity-60 disabled:hover:scale-100"
        >
          {needsLogin
            ? t("loginCta")
            : isClaiming
              ? t("claimingCta")
              : t("claimCta")}
        </button>

        {hasMultiplePromos && (
          <button
            type="button"
            onClick={onNextPage}
            disabled={!canGoNext}
            className="shrink-0 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronRight className="size-5" />
          </button>
        )}
      </div>
    </div>
  );
}

interface Props {
  activations: PromoActivation[];
  isAuthenticated: boolean;
  onDismiss: () => void;
  onClaim: (claimId: string) => Promise<void>;
  onClaimed: (batchId: string) => void;
  onRequireLogin: () => void;
  onAuthComplete?: () => void;
}

export default function PromoClaimModal({
  activations,
  isAuthenticated,
  onDismiss,
  onClaim,
  onClaimed,
  onRequireLogin,
  onAuthComplete,
}: Props) {
  const t = useTranslations("PromoClaimModal");
  const [page, setPage] = useState(0);
  // Si el batch actual se reclama (o cambia el largo de la lista por
  // cualquier otra razón) el índice puede quedar fuera de rango — se
  // recorta al vuelo en vez de guardar un page inválido.
  const clampedPage = Math.min(page, Math.max(activations.length - 1, 0));

  useEffect(() => {
    if (page !== clampedPage) setPage(clampedPage);
  }, [page, clampedPage]);

  const isOpen = activations.length > 0;
  useEffect(() => {
    if (isOpen) {
      lockScroll();
      return unlockScroll;
    }
  }, [isOpen]);

  const activation = activations[clampedPage];

  // Cada promo puede tener distinto número de platillos (distinta altura
  // de contenido) — se mide la altura real del contenido nuevo y se anima
  // el contenedor exterior hasta ahí.
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number>();
  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [activation?.batch_id]);

  if (activations.length === 0) return null;

  const hasMultiplePromos = activations.length > 1;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/25 backdrop-blur-xs z-99999 flex items-center justify-center animate-fade-in"
      onClick={onDismiss}
    >
      <div
        className="relative bg-even-evergreen/80 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] w-full max-w-sm mx-4 rounded-4xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-lg transition-colors z-20"
        >
          <X className="w-5 h-5 text-white/70" />
        </button>

        <div className="flex flex-col px-6 pt-10 pb-6 gap-4">
          <div className="text-center px-2">
            <h2 className="text-white font-semibold text-xl">
              {hasMultiplePromos
                ? t("multiplePromosTitle")
                : t("singlePromoTitle")}
            </h2>
          </div>

          <div
            className="overflow-hidden transition-[height] duration-300 ease-in-out"
            style={{ height: contentHeight }}
          >
            <div ref={contentRef} className="max-h-[55vh] overflow-y-auto px-1">
              <PromoActivationCard
                key={activation.batch_id}
                activation={activation}
                isAuthenticated={isAuthenticated}
                onClaim={onClaim}
                onClaimed={onClaimed}
                onRequireLogin={onRequireLogin}
                onAuthComplete={onAuthComplete}
                hasMultiplePromos={hasMultiplePromos}
                canGoPrev={clampedPage > 0}
                canGoNext={clampedPage < activations.length - 1}
                onPrevPage={() => setPage((p) => Math.max(p - 1, 0))}
                onNextPage={() =>
                  setPage((p) => Math.min(p + 1, activations.length - 1))
                }
              />
            </div>
          </div>

          {hasMultiplePromos && (
            <div className="flex items-center justify-center gap-1.5">
              {activations.map((a, idx) => (
                <button
                  key={a.batch_id}
                  type="button"
                  onClick={() => setPage(idx)}
                  aria-label={t("promoPageAriaLabel", {
                    index: idx + 1,
                    count: activations.length,
                  })}
                  className={`rounded-full transition-all ${
                    idx === clampedPage
                      ? "w-4 h-1.5 bg-even-grass"
                      : "w-1.5 h-1.5 bg-white/30 hover:bg-white/50"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
