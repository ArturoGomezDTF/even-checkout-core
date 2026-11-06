"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

export const TERMS_URL = "https://www.letseven.io/terminos";
export const PRIVACY_URL = "https://www.letseven.io/privacidad";

export function termsLinks(linkClassName: string) {
  return {
    terms: (chunks: ReactNode) => (
      <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        {chunks}
      </a>
    ),
    privacy: (chunks: ReactNode) => (
      <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        {chunks}
      </a>
    ),
  };
}

interface TermsCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  variant?: "dark" | "light";
}

export default function TermsCheckbox({
  checked,
  onChange,
  disabled,
  variant = "dark",
}: TermsCheckboxProps) {
  const t = useTranslations("Terms");
  const dark = variant === "dark";
  const textClass = dark ? "text-white" : "text-black/70";
  const linkClass = dark
    ? "text-even-grass underline"
    : "text-even-evergreen underline font-medium";
  // Caja dibujada a mano: los globals.css ponen `appearance: none` a todo input.
  const boxClass = checked
    ? "bg-even-grass border-even-grass"
    : dark
      ? "bg-white border-white"
      : "bg-white border-gray-400";

  return (
    <label
      className={`flex items-start gap-3 text-sm ${textClass} ${
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-even-grass ${boxClass}`}
      >
        {checked && <Check className="size-3.5 text-even-evergreen" strokeWidth={3} />}
      </span>
      <span>{t.rich("checkbox", termsLinks(linkClass))}</span>
    </label>
  );
}
