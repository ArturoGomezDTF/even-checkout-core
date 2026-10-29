"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Flag from "react-world-flags";
import { setLocaleCookie } from "@/i18n/actions";
import type { Locale } from "@/i18n/locale";

export default function LanguageToggleButton() {
  const t = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale() as Locale;
  const otherLocale: Locale = locale === "es" ? "en" : "es";
  const [isLocalePending, startLocaleTransition] = useTransition();

  const handleToggleLocale = () => {
    startLocaleTransition(async () => {
      await setLocaleCookie(otherLocale);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={handleToggleLocale}
      disabled={isLocalePending}
      aria-label={t("switchLanguage")}
      className="relative flex items-center p-1 rounded-full bg-even-evergreen cursor-pointer disabled:opacity-50 transition-opacity"
    >
      <span
        className="absolute top-1 bottom-1 left-1 w-6 rounded-full bg-even-grass transition-transform duration-200 ease-out"
        style={{
          transform: locale === "es" ? "translateX(0%)" : "translateX(100%)",
        }}
      />
      <span className="relative z-10 flex items-center justify-center w-6 h-6">
        <Flag code="MX" style={{ width: 16, height: 12, borderRadius: 2 }} />
      </span>
      <span className="relative z-10 flex items-center justify-center w-6 h-6">
        <Flag code="US" style={{ width: 16, height: 12, borderRadius: 2 }} />
      </span>
    </button>
  );
}
