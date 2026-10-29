"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

const MAX_VISIBLE_LINES = 2;

interface SelectedOption {
  optionName: string;
  price: number;
  quantity?: number;
}

interface CustomField {
  selectedOptions?: SelectedOption[];
}

interface ItemCustomizationsProps {
  customFields?: CustomField[] | null;
  note?: string | null;
  variant?: "light" | "dark";
  className?: string;
  // Hide free options (some screens only list paid extras)
  onlyPaid?: boolean;
  formatPrice?: (price: number) => number;
}

const VARIANT_STYLES = {
  light: {
    option: "text-gray-400",
    note: "text-gray-500",
    toggle: "text-even-evergreen",
  },
  dark: {
    option: "text-white/60",
    note: "text-white/70",
    toggle: "text-even-grass",
  },
};

export default function ItemCustomizations({
  customFields,
  note,
  variant = "light",
  className = "",
  onlyPaid = false,
  formatPrice = (price) => price,
}: ItemCustomizationsProps) {
  const tc = useTranslations("Common");
  const [isExpanded, setIsExpanded] = useState(false);
  const styles = VARIANT_STYLES[variant];

  const selectedOptions = (Array.isArray(customFields) ? customFields : [])
    .flatMap((field) => field.selectedOptions ?? [])
    .filter((opt) => !onlyPaid || opt.price > 0);

  const lines = [
    ...selectedOptions.map((opt, idx) => (
      <p
        key={`opt-${idx}`}
        className={`text-xs md:text-sm lg:text-base ${styles.option}`}
      >
        {(opt.quantity ?? 0) > 1 && (
          <span className="mr-1">x{opt.quantity}</span>
        )}
        {opt.optionName}
        {opt.price > 0 && ` $${formatPrice(opt.price).toFixed(2)}`}
      </p>
    )),
    ...(note
      ? [
          <p
            key="note"
            className={`text-xs md:text-sm italic mt-0.5 ${styles.note}`}
          >
            &ldquo;{note}&rdquo;
          </p>,
        ]
      : []),
  ];

  if (lines.length === 0) return null;

  // "+1 more" would take the same space as the line it hides
  const isCollapsible = lines.length > MAX_VISIBLE_LINES + 1;
  const showAll = !isCollapsible || isExpanded;
  const hiddenCount = lines.length - MAX_VISIBLE_LINES;

  return (
    <div className={className}>
      <div className="space-y-0.5">
        {lines.slice(0, MAX_VISIBLE_LINES)}
        {showAll && (
          <div
            className={`space-y-0.5 ${isCollapsible ? "animate-in slide-in-from-top-2 duration-200" : ""}`}
          >
            {lines.slice(MAX_VISIBLE_LINES)}
          </div>
        )}
      </div>
      {isCollapsible && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded((prev) => !prev);
          }}
          aria-expanded={isExpanded}
          className={`flex items-center gap-1 mt-0.5 text-xs md:text-sm lg:text-base font-medium cursor-pointer ${styles.toggle}`}
        >
          {isExpanded
            ? tc("showLessOptions")
            : tc("showMoreOptions", { count: hiddenCount })}
          <ChevronDown
            className={`size-4 md:size-5 shrink-0 transition-transform duration-250 ${isExpanded ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </div>
  );
}
