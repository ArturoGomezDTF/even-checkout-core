"use client";

import { useTranslations } from "next-intl";

// Estados de ánimo de Pepper mostrados en la última burbuja del chat
export type ChatStatus = "idle" | "thinking" | "working" | "approved";

const ASTERISK_PATH =
  "M610.44,536.97c-1.4-7.24-5.3-13.15-10.96-16.63l-37.12-22.84,36.18-22.33c12.65-7.8,16.9-23.78,9.88-37.18-3.43-6.54-9.52-11.56-16.71-13.76-6.74-2.06-13.8-1.39-19.9,1.88l-38.51,20.69-1.52-41.21c-.53-14.61-12.04-26.08-26.42-26.6-.39-.01-.79-.02-1.19-.02-12.94.08-27.43,9.92-28.28,25.69l-2.27,42.32-43.56-21.96c-14.51-7.32-30.77.28-37.52,11.51-3.81,6.35-4.96,15-3,22.58,1.73,6.7,5.76,12.17,11.35,15.41l38.91,22.51c.8.47,1.56.99,2.34,1.64l-39.6,25c-13.77,8.69-18.37,26.43-10.49,40.39,3.7,6.56,10.1,11.5,17.55,13.54,7.76,2.13,15.93,1.07,23.01-3l40.11-23.03c.02.17.03.32.03.46l1.69,40.61c.5,12.07,8.69,23.37,19.48,26.84,2.83.92,5.68,1.41,8.46,1.51,9.2.33,17.73-3.65,23.06-11.18,6.82-9.63,7.54-21.2,7.48-29.07l-.21-32.71,33.27,17.86c15.56,8.36,30.84,5.97,39.87-6.24,4.39-5.94,6.15-14.63,4.59-22.68Z";

// Pepper en reposo, esperando el siguiente mensaje
export const TwinPebbleIdle = ({
  className = "",
}: {
  className?: string;
}) => {
  const t = useTranslations("PepperMascots");
  return (
  <svg
    className={`mascot ${className}`.trim()}
    viewBox="0 0 300 220"
    width={76}
    height={56}
    role="img"
    aria-label={t("idleAriaLabel")}
  >
    <defs>
      <linearGradient
        id="idle-g"
        gradientUnits="userSpaceOnUse"
        x1="62"
        y1="76"
        x2="238"
        y2="186"
      >
        <stop offset="0" stopColor="#D9F24C" />
        <stop offset="0.4" stopColor="#8DE854" />
        <stop offset="0.75" stopColor="#45B25E" />
        <stop offset="1" stopColor="#2A9A64" />
      </linearGradient>
      <filter id="idle-goo" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b" />
        <feColorMatrix
          in="b"
          mode="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"
          result="g"
        />
        <feComposite in="SourceGraphic" in2="g" operator="atop" />
      </filter>
    </defs>
    <g className="body">
      <g filter="url(#idle-goo)" fill="url(#idle-g)">
        <circle cx="95" cy="131" r="52" />
        <circle cx="188" cy="126" r="58" />
      </g>
      <g className="eyes" fill="#023828">
        <rect x="128" y="106" width="9" height="30" rx="4.5" />
        <rect x="150" y="106" width="9" height="30" rx="4.5" />
      </g>
    </g>
    <svg
      className="ast"
      x="236"
      y="34"
      width="46"
      height="46"
      viewBox="0 0 1000 1000"
    >
      <path fill="#82e657" d={ASTERISK_PATH} />
    </svg>
    <style jsx>{`
      .body,
      .eyes,
      .ast {
        transform-box: fill-box;
        transform-origin: center;
      }
      .body {
        animation: idleBreathe 3.8s cubic-bezier(0.4, 0, 0.4, 1) infinite;
      }
      .eyes {
        animation: idleBlink 3.8s ease-in-out infinite;
      }
      .ast {
        animation: idleTwinkle 4.4s ease-in-out infinite;
      }
      @keyframes idleBreathe {
        0% {
          transform: translateY(0) scale(1, 1) rotate(0deg);
        }
        45% {
          transform: translateY(-5px) scale(1.03, 1.05) rotate(-1.4deg);
        }
        70% {
          transform: translateY(2px) scale(1.02, 0.97) rotate(1deg);
        }
        100% {
          transform: translateY(0) scale(1, 1) rotate(0deg);
        }
      }
      @keyframes idleBlink {
        0%,
        79% {
          transform: scaleY(1);
        }
        83% {
          transform: scaleY(0.08);
        }
        87% {
          transform: scaleY(1);
        }
        100% {
          transform: scaleY(1);
        }
      }
      @keyframes idleTwinkle {
        0% {
          transform: rotate(0deg) scale(1);
        }
        50% {
          transform: rotate(180deg) scale(1.22);
        }
        100% {
          transform: rotate(360deg) scale(1);
        }
      }
    `}</style>
  </svg>
  );
};

// Pepper pensando (antes de llamar herramientas o mientras razona)
export const TwinPebbleThinking = ({
  className = "",
}: {
  className?: string;
}) => {
  const t = useTranslations("PepperMascots");
  return (
  <svg
    className={`mascot ${className}`.trim()}
    viewBox="0 0 300 220"
    width={76}
    height={56}
    role="img"
    aria-label={t("thinkingAriaLabel")}
  >
    <defs>
      <linearGradient
        id="think-g"
        gradientUnits="userSpaceOnUse"
        x1="62"
        y1="76"
        x2="238"
        y2="186"
      >
        <stop offset="0" stopColor="#D9F24C" />
        <stop offset="0.4" stopColor="#8DE854" />
        <stop offset="0.75" stopColor="#45B25E" />
        <stop offset="1" stopColor="#2A9A64" />
      </linearGradient>
      <filter id="think-goo" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b" />
        <feColorMatrix
          in="b"
          mode="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"
          result="g"
        />
        <feComposite in="SourceGraphic" in2="g" operator="atop" />
      </filter>
    </defs>
    <g className="body">
      <g filter="url(#think-goo)" fill="url(#think-g)">
        <circle cx="95" cy="131" r="52" />
        <circle cx="188" cy="126" r="58" />
      </g>
      <g className="look">
        <g className="blink" fill="#023828">
          <rect x="127" y="104" width="9" height="16" rx="4.5" />
          <rect x="151" y="104" width="9" height="16" rx="4.5" />
        </g>
      </g>
    </g>
    <g fill="#82e657">
      <circle className="dot d1" cx="206" cy="80" r="5" />
      <circle className="dot d2" cx="206" cy="80" r="6.5" />
      <circle className="dot d3" cx="206" cy="80" r="8" />
    </g>
    <style jsx>{`
      .body,
      .look,
      .blink,
      .dot {
        transform-box: fill-box;
        transform-origin: center;
      }
      .dot {
        opacity: 0;
      }
      .body {
        animation: thinkPonder 3.2s ease-in-out infinite;
      }
      .look {
        animation: thinkLook 3.2s ease-in-out infinite;
      }
      .blink {
        animation: thinkBlink 3.2s ease-in-out infinite;
      }
      .d1 {
        animation: thinkRise 2.1s ease-out infinite;
      }
      .d2 {
        animation: thinkRise 2.1s ease-out infinite;
        animation-delay: 0.7s;
      }
      .d3 {
        animation: thinkRise 2.1s ease-out infinite;
        animation-delay: 1.4s;
      }
      @keyframes thinkPonder {
        0% {
          transform: rotate(-2.2deg) translateY(0);
        }
        50% {
          transform: rotate(2.2deg) translateY(-3px);
        }
        100% {
          transform: rotate(-2.2deg) translateY(0);
        }
      }
      @keyframes thinkLook {
        0% {
          transform: translate(-4px, -2px);
        }
        30% {
          transform: translate(5px, -7px);
        }
        62% {
          transform: translate(5px, -7px);
        }
        100% {
          transform: translate(-4px, -2px);
        }
      }
      @keyframes thinkBlink {
        0%,
        86% {
          transform: scaleY(1);
        }
        90% {
          transform: scaleY(0.1);
        }
        94% {
          transform: scaleY(1);
        }
        100% {
          transform: scaleY(1);
        }
      }
      @keyframes thinkRise {
        0% {
          transform: translate(0, 0) scale(0.2);
          opacity: 0;
        }
        14% {
          opacity: 1;
        }
        60% {
          transform: translate(16px, -30px) scale(1);
          opacity: 1;
        }
        100% {
          transform: translate(28px, -54px) scale(1.15);
          opacity: 0;
        }
      }
    `}</style>
  </svg>
  );
};

// Pepper trabajando (ejecutando una herramienta)
export const TwinPebbleWorking = ({
  className = "",
}: {
  className?: string;
}) => {
  const t = useTranslations("PepperMascots");
  return (
  <svg
    className={`mascot ${className}`.trim()}
    viewBox="0 0 300 220"
    width={76}
    height={56}
    role="img"
    aria-label={t("workingAriaLabel")}
  >
    <defs>
      <linearGradient
        id="work-g"
        gradientUnits="userSpaceOnUse"
        x1="62"
        y1="76"
        x2="238"
        y2="186"
      >
        <stop offset="0" stopColor="#D9F24C" />
        <stop offset="0.4" stopColor="#8DE854" />
        <stop offset="0.75" stopColor="#45B25E" />
        <stop offset="1" stopColor="#2A9A64" />
      </linearGradient>
      <filter id="work-goo" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b" />
        <feColorMatrix
          in="b"
          mode="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"
          result="g"
        />
        <feComposite in="SourceGraphic" in2="g" operator="atop" />
      </filter>
    </defs>
    <g className="body">
      <g filter="url(#work-goo)" fill="url(#work-g)">
        <circle className="lobeL" cx="95" cy="131" r="52" />
        <circle className="lobeR" cx="188" cy="126" r="58" />
      </g>
      <g className="eyes" fill="#023828">
        <rect x="128" y="112" width="9" height="20" rx="4.5" />
        <rect x="150" y="112" width="9" height="20" rx="4.5" />
      </g>
    </g>
    <svg
      className="ast"
      x="238"
      y="36"
      width="44"
      height="44"
      viewBox="0 0 1000 1000"
    >
      <path fill="#82e657" d={ASTERISK_PATH} />
    </svg>
    <style jsx>{`
      .body,
      .lobeL,
      .lobeR,
      .eyes,
      .ast {
        transform-box: fill-box;
        transform-origin: center;
      }
      .body {
        animation: workBody 0.9s cubic-bezier(0.5, 0, 0.3, 1) infinite;
      }
      .lobeL {
        animation: workLobeL 0.9s ease-in-out infinite;
      }
      .lobeR {
        animation: workLobeR 0.9s ease-in-out infinite;
      }
      .eyes {
        animation: workShake 0.9s ease-in-out infinite;
      }
      .ast {
        animation: workSpin 1.8s steps(6, end) infinite;
      }
      @keyframes workBody {
        0% {
          transform: translateY(0) scale(1, 1);
        }
        20% {
          transform: translateY(5px) scale(1.08, 0.9);
        }
        45% {
          transform: translateY(-9px) scale(0.93, 1.09);
        }
        70% {
          transform: translateY(3px) scale(1.05, 0.95);
        }
        100% {
          transform: translateY(0) scale(1, 1);
        }
      }
      @keyframes workLobeL {
        0%,
        100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.09);
        }
      }
      @keyframes workLobeR {
        0%,
        100% {
          transform: scale(1.06);
        }
        50% {
          transform: scale(0.94);
        }
      }
      @keyframes workShake {
        0% {
          transform: translateX(0);
        }
        25% {
          transform: translateX(-1.8px);
        }
        75% {
          transform: translateX(1.8px);
        }
        100% {
          transform: translateX(0);
        }
      }
      @keyframes workSpin {
        to {
          transform: rotate(360deg);
        }
      }
    `}</style>
  </svg>
  );
};

// Pepper aprobando (justo al terminar de responder)
export const TwinPebbleApproved = ({
  className = "",
}: {
  className?: string;
}) => {
  const t = useTranslations("PepperMascots");
  return (
  <svg
    className={`mascot ${className}`.trim()}
    viewBox="0 0 300 220"
    width={76}
    height={56}
    role="img"
    aria-label={t("approvedAriaLabel")}
  >
    <defs>
      <linearGradient
        id="approved-g"
        gradientUnits="userSpaceOnUse"
        x1="62"
        y1="76"
        x2="238"
        y2="186"
      >
        <stop offset="0" stopColor="#D9F24C" />
        <stop offset="0.4" stopColor="#8DE854" />
        <stop offset="0.75" stopColor="#45B25E" />
        <stop offset="1" stopColor="#2A9A64" />
      </linearGradient>
      <filter id="approved-goo" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b" />
        <feColorMatrix
          in="b"
          mode="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"
          result="g"
        />
        <feComposite in="SourceGraphic" in2="g" operator="atop" />
      </filter>
    </defs>
    <g className="body">
      <g filter="url(#approved-goo)" fill="url(#approved-g)">
        <circle cx="95" cy="131" r="52" />
        <circle cx="188" cy="126" r="58" />
      </g>
      <g fill="none" stroke="#023828" strokeWidth={6} strokeLinecap="round">
        <path d="M113,125 Q123,111 133,125" />
        <path d="M153,125 Q163,111 173,125" />
      </g>
    </g>
    <g className="badge">
      <circle cx="256" cy="170" r="20" fill="#023828" />
      <path
        className="tick"
        d="M247,171 L253,178 L266,161"
        fill="none"
        stroke="#82e657"
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
    <svg
      className="s1"
      x="60"
      y="46"
      width="26"
      height="26"
      viewBox="0 0 1000 1000"
    >
      <path fill="#82e657" d={ASTERISK_PATH} />
    </svg>
    <svg
      className="s2"
      x="216"
      y="70"
      width="20"
      height="20"
      viewBox="0 0 1000 1000"
    >
      <path fill="#82e657" d={ASTERISK_PATH} />
    </svg>
    <style jsx>{`
      .body,
      .badge,
      .s1,
      .s2 {
        transform-box: fill-box;
        transform-origin: center;
      }
      .tick {
        stroke-dasharray: 32;
        stroke-dashoffset: 32;
      }
      .body {
        animation: apprHappy 1.7s cubic-bezier(0.34, 1.4, 0.5, 1) infinite;
      }
      .badge {
        animation: apprPop 1.7s cubic-bezier(0.34, 1.56, 0.5, 1) infinite;
      }
      .tick {
        animation: apprDraw 1.7s ease-out infinite;
      }
      .s1 {
        animation: apprSpark 1.7s ease-out infinite;
        animation-delay: 0.2s;
        opacity: 0;
      }
      .s2 {
        animation: apprSpark 1.7s ease-out infinite;
        animation-delay: 0.55s;
        opacity: 0;
      }
      @keyframes apprHappy {
        0% {
          transform: translateY(0) scale(1, 1);
        }
        14% {
          transform: translateY(-13px) scale(0.95, 1.07);
        }
        30% {
          transform: translateY(0) scale(1.06, 0.94);
        }
        44% {
          transform: translateY(-6px) scale(0.98, 1.03);
        }
        58% {
          transform: translateY(0) scale(1.02, 0.98);
        }
        68% {
          transform: translateY(0) scale(1, 1);
        }
        100% {
          transform: translateY(0) scale(1, 1);
        }
      }
      @keyframes apprPop {
        0% {
          transform: scale(0);
        }
        12% {
          transform: scale(1.22);
        }
        24% {
          transform: scale(1);
        }
        100% {
          transform: scale(1);
        }
      }
      @keyframes apprDraw {
        0%,
        6% {
          stroke-dashoffset: 32;
        }
        26% {
          stroke-dashoffset: 0;
        }
        100% {
          stroke-dashoffset: 0;
        }
      }
      @keyframes apprSpark {
        0% {
          transform: scale(0) rotate(0deg);
          opacity: 0;
        }
        35% {
          transform: scale(1) rotate(60deg);
          opacity: 1;
        }
        55% {
          transform: scale(1) rotate(90deg);
          opacity: 1;
        }
        100% {
          transform: scale(0) rotate(150deg);
          opacity: 0;
        }
      }
    `}</style>
  </svg>
  );
};

export const PepperStatusAvatar = ({
  status,
  className,
}: {
  status: ChatStatus;
  className?: string;
}) => {
  if (status === "thinking")
    return <TwinPebbleThinking className={className} />;
  if (status === "working") return <TwinPebbleWorking className={className} />;
  if (status === "approved")
    return <TwinPebbleApproved className={className} />;
  return <TwinPebbleIdle className={className} />;
};
