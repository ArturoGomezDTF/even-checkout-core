"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Check, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const SETTLE_MS = 600;

// true cuando la página terminó de cargar y no hay un Loader de pantalla
// completa (`data-even-loader`) desde hace SETTLE_MS.
function usePageSettled() {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let isSettled = false;

    const check = () => {
      const busy =
        document.readyState !== "complete" ||
        !!document.querySelector("[data-even-loader]");
      if (busy) {
        clearTimeout(timer);
        timer = undefined;
        if (isSettled) {
          isSettled = false;
          setSettled(false);
        }
      } else if (!isSettled && !timer) {
        timer = setTimeout(() => {
          timer = undefined;
          isSettled = true;
          setSettled(true);
        }, SETTLE_MS);
      }
    };

    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("load", check);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      window.removeEventListener("load", check);
    };
  }, []);

  return settled;
}

// Aviso de cambio de Términos / Aviso de Privacidad para registrados. Se
// queda arriba hasta que le pican al check, que registra que lo vio.
export default function TermsUpdateToast() {
  const t = useTranslations("Terms");
  const { isAuthenticated, profile, acknowledgeTermsUpdate } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [entered, setEntered] = useState(false);
  const pageSettled = usePageSettled();

  const show =
    pageSettled &&
    isAuthenticated &&
    !!profile?.firstName &&
    profile?.termsStatus === "needs_update_ack";

  useEffect(() => {
    if (!show) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [show]);

  if (!show || typeof document === "undefined") return null;

  const handleCheck = async () => {
    setSaving(true);
    setError(false);
    const response = await acknowledgeTermsUpdate();
    if (!response.success) setError(true);
    setSaving(false);
  };

  return createPortal(
    <div className="fixed top-0 inset-x-0 z-[999999] flex justify-center px-4 pt-4 pointer-events-none">
      <div
        role="status"
        className={`pointer-events-auto w-full max-w-md flex items-center gap-4 bg-even-evergreen text-white rounded-2xl shadow-xl px-5 py-4 transition-[transform,opacity] duration-500 ease-out ${
          entered ? "translate-y-0 opacity-100" : "-translate-y-[150%] opacity-0"
        }`}
      >
        <div className="flex-1 min-w-0">
          <p className="font-semibold">{t("updateTitle")}</p>
          <p className="text-sm text-white/80">
            {error ? t("errorSave") : t("updateBody")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCheck}
          disabled={saving}
          aria-label={t("updateCta")}
          className="shrink-0 flex size-11 items-center justify-center rounded-full bg-even-grass text-even-evergreen transition-transform active:scale-90 disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Check className="size-6" strokeWidth={3} />
          )}
        </button>
      </div>
    </div>,
    document.body,
  );
}
