"use client";

import { Loader2, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

const TIP_OPTIONS = [0, 10, 15, 20];
const MIN_PEOPLE = 2;
const MAX_PEOPLE = 50;
// Con más personas los segmentos del anillo ya no se distinguen.
const MAX_RING_SEGMENTS = 10;

const RADIUS = 86;
const STROKE = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = STROKE + 12;
const MIN_SLICE = GAP + 20;
const TWEEN_MS = 320;

// Interpola el número de personas para que el anillo se reparta de forma
// continua (el segmento nuevo crece desde 0) en vez de empalmar arcos.
function useTweened(target: number) {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min((now - start) / TWEEN_MS, 1);
      const eased = 1 - Math.pow(1 - k, 3);
      current.current = from + (target - from) * eased;
      setValue(current.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

type Props = {
  tableNumber: string | null | undefined;
  remaining: number;
  share: number;
  people: number;
  onPeopleChange: (people: number) => void;
  tipPercentage: number;
  showCustomTip: boolean;
  customTip: string;
  onTipPercentage: (percentage: number) => void;
  onCustomTipOpen: () => void;
  onCustomTipChange: (value: string) => void;
  tipAmount: number;
  total: number;
  isUnderMinimum: boolean;
  disabled: boolean;
  loading?: boolean;
  onContinue: () => void;
};

type Segment = { start: number; length: number };

function ringSegments(p: number): { yours: Segment; rest: Segment[] } {
  if (p > MAX_RING_SEGMENTS) {
    const slice = Math.max(CIRCUMFERENCE / p, MIN_SLICE);
    return {
      yours: { start: 0, length: slice },
      rest: [{ start: slice, length: CIRCUMFERENCE - slice }],
    };
  }
  const slice = CIRCUMFERENCE / p;
  const full = Math.floor(p);
  const rest: Segment[] = [];
  for (let i = 1; i < full; i++) rest.push({ start: i * slice, length: slice });
  const partial = CIRCUMFERENCE - full * slice;
  if (partial > 0.01) rest.push({ start: full * slice, length: partial });
  return { yours: { start: 0, length: slice }, rest };
}

function SplitRing({ people }: { people: number }) {
  const { yours, rest } = ringSegments(useTweened(people));

  // Un segmento más chico que MIN_SLICE (el que entra o sale) se dibuja más
  // delgado en proporción, así crece desde un punto sin encimarse.
  const arc = (seg: Segment, color: string, key: string) => {
    const k = Math.min(1, seg.length / MIN_SLICE);
    if (k <= 0.01) return null;
    const gap = GAP * k;
    const visible = Math.max(seg.length - gap, 0.001);
    return (
      <circle
        key={key}
        cx="100"
        cy="100"
        r={RADIUS}
        fill="none"
        stroke={color}
        strokeWidth={STROKE * k}
        strokeLinecap="round"
        strokeDasharray={`${visible} ${CIRCUMFERENCE - visible}`}
        strokeDashoffset={-(seg.start + gap / 2)}
      />
    );
  };

  return (
    <svg viewBox="0 0 200 200" className="size-full -rotate-90" aria-hidden>
      {rest.map((s, i) => arc(s, "rgba(255,255,255,0.12)", `rest-${i}`))}
      {arc(yours, "var(--color-even-grass)", "yours")}
    </svg>
  );
}

export default function EqualSplitView({
  tableNumber,
  remaining,
  share,
  people,
  onPeopleChange,
  tipPercentage,
  showCustomTip,
  customTip,
  onTipPercentage,
  onCustomTipOpen,
  onCustomTipChange,
  tipAmount,
  total,
  isUnderMinimum,
  disabled,
  loading = false,
  onContinue,
}: Props) {
  const t = useTranslations("TipSelectionPage");
  const tc = useTranslations("Common");
  const display = { fontFamily: "var(--font-jakarta), system-ui, sans-serif" };

  const chipClass = (active: boolean) =>
    `py-1 md:py-1.5 lg:py-2 rounded-full border border-stroke/40 text-black transition-colors cursor-pointer ${
      active
        ? "bg-even-grass text-even-evergreen"
        : "bg-surface hover:border-gray-400"
    }`;

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-6 md:px-10 pt-2">
        <p className="text-even-grass/80 text-base">
          {tc("tableLabel", { table: tableNumber ?? "" })}
        </p>
        <h1
          className="text-white text-3xl md:text-4xl font-bold mt-1"
          style={display}
        >
          {t("splitTitle")}
        </h1>
      </div>

      <div className="flex-1 flex items-center justify-center py-6">
        <div className="relative size-64 md:size-72">
          <SplitRing people={people} />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-white/80 text-sm md:text-base">
              {t("yourShareTitle")}
            </span>
            <span
              className="text-white text-5xl md:text-6xl font-bold leading-tight"
              style={display}
            >
              ${share.toFixed(2)}
            </span>
            <span className="text-white/80 text-sm md:text-base">
              {t("ofAmount", { amount: remaining.toFixed(2) })}
            </span>
          </div>
        </div>
      </div>

      <div
        className="bg-white rounded-t-4xl mx-4 md:mx-6 lg:mx-8 px-8 md:px-10 lg:px-12 pt-6"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onPeopleChange(Math.max(MIN_PEOPLE, people - 1))}
            disabled={people <= MIN_PEOPLE}
            aria-label={t("fewerPeople")}
            className="size-14 rounded-full bg-even-offwhite text-even-evergreen flex items-center justify-center transition-transform active:scale-90 disabled:text-stroke-soft disabled:active:scale-100 cursor-pointer disabled:cursor-not-allowed"
          >
            <Minus className="size-6" />
          </button>
          <div className="flex items-baseline gap-2">
            <span
              className="text-even-evergreen text-4xl font-bold"
              style={display}
            >
              {people}
            </span>
            <span className="text-even-evergreen text-lg">
              {t("peopleUnit")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onPeopleChange(Math.min(MAX_PEOPLE, people + 1))}
            disabled={people >= MAX_PEOPLE}
            aria-label={t("morePeople")}
            className="size-14 rounded-full bg-even-grass text-even-evergreen flex items-center justify-center transition-transform active:scale-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="size-6" />
          </button>
        </div>

        <div className="flex items-center gap-4 mt-5">
          <span className="text-black font-medium text-base md:text-lg lg:text-xl whitespace-nowrap">
            {t("tipLabel")}
          </span>
          <div className="grid grid-cols-5 gap-2 flex-1">
            {TIP_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onTipPercentage(p)}
                className={chipClass(tipPercentage === p && !showCustomTip)}
              >
                {p === 0 ? "0%" : `${p}%`}
              </button>
            ))}
            <button
              type="button"
              onClick={onCustomTipOpen}
              className={chipClass(showCustomTip)}
            >
              $
            </button>
          </div>
        </div>

        {showCustomTip && (
          <div className="relative w-full mt-3">
            <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-black text-base">
              $
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={customTip}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^\d*\.?\d*$/.test(v)) onCustomTipChange(v);
              }}
              placeholder="0.00"
              autoFocus
              className="w-full pl-8 pr-4 py-1 md:py-1.5 lg:py-2 border border-stroke/40 rounded-full focus:outline-none focus:ring focus:ring-gray-400 focus:border-transparent text-black text-center text-base bg-surface"
            />
          </div>
        )}

        {isUnderMinimum && share > 0 && (
          <p className="text-red-600 text-sm mt-3">
            {t("underMinimumWarning")}
          </p>
        )}

        <div className="border-t border-gray-200 mt-5 pt-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="text-even-evergreen text-3xl font-bold"
                style={display}
              >
                ${total.toFixed(2)}
              </span>
            </div>
            {tipAmount > 0 && (
              <p className="text-stroke text-sm">
                {t("includesTip", { amount: tipAmount.toFixed(2) })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onContinue}
            disabled={disabled || loading}
            className={`h-14 flex-1 max-w-48 rounded-full bg-even-grass text-even-evergreen text-lg flex items-center justify-center transition-all ${
              disabled
                ? "opacity-50 cursor-not-allowed"
                : "active:scale-95 cursor-pointer shadow-[0_0_0_4px_rgba(130,230,87,0.25)]"
            }`}
          >
            {loading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              t("continueCta")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
