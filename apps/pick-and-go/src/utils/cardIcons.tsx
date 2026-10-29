import { JSX } from "react";
import {
  Mastercard,
  Visa,
  Amex,
  Discover,
} from "react-payment-logos/dist/logo";
import { CreditCard } from "lucide-react";

export function getCardTypeIcon(
  cardType: string,
  size: "small" | "medium" = "medium",
  customWidth?: number,
  customHeight?: number,
): JSX.Element {
  const type = cardType.toLowerCase() || "unknown";

  // Define size presets
  const sizes = {
    small: { width: "40px", height: "25px" },
    medium: { width: "56px", height: "35px" },
  };

  const dimensions =
    customWidth && customHeight
      ? { width: `${customWidth}px`, height: `${customHeight}px` }
      : sizes[size];

  switch (type) {
    case "visa":
      return <Visa style={dimensions} />;
    case "mastercard":
      return <Mastercard style={dimensions} />;
    case "amex":
      return <Amex style={dimensions} />;
    case "discover":
      return <Discover style={dimensions} />;
    case "apple":
      return (
        <svg
          viewBox="0 0 56 35"
          style={{ width: dimensions.width, height: dimensions.height }}
          aria-label="Apple Pay"
        >
          <rect width="56" height="35" rx="4" fill="#000" />
          <path
            d="M18.5 12.4c.5-.6.8-1.4.7-2.2-.7 0-1.6.5-2.1 1.1-.5.5-.8 1.3-.7 2.1.8 0 1.6-.4 2.1-1zm.7 1.1c-1.2-.1-2.2.7-2.7.7-.6 0-1.4-.6-2.3-.6-1.2 0-2.3.7-2.9 1.8-1.2 2.1-.3 5.3.9 7 .6.9 1.3 1.8 2.2 1.8.9 0 1.2-.6 2.3-.6 1.1 0 1.4.6 2.3.6.9 0 1.6-.9 2.1-1.8.4-.6.6-1.2.8-1.9-2-.8-2.3-3.7-.7-5zm9.3-3.5h-3.6v9.4h1.4v-3.2h2.2c2 0 3.4-1.1 3.4-3.1s-1.4-3.1-3.4-3.1zm-.1 4.9h-2.1v-3.6h2.1c1.3 0 2 .6 2 1.8s-.7 1.8-2 1.8zm7.5-.4c-1.9 0-3.2 1.3-3.2 3.3s1.3 3.3 3.2 3.3c1.9 0 3.2-1.3 3.2-3.3s-1.3-3.3-3.2-3.3zm0 5.4c-1.1 0-1.8-.9-1.8-2.1s.7-2.1 1.8-2.1 1.8.9 1.8 2.1-.7 2.1-1.8 2.1zm7.5-5.3-1.3 4.7-1.4-4.7h-1.3l2 5.9-.1.3c-.2.7-.5.9-1 .9h-.7v1.1h.8c1.2 0 1.8-.5 2.3-1.9l2.1-6.3h-1.4z"
            fill="#fff"
          />
        </svg>
      );
    case "google":
      return (
        <svg
          viewBox="0 0 56 35"
          style={{ width: dimensions.width, height: dimensions.height }}
          aria-label="Google Pay"
        >
          <rect
            width="56"
            height="35"
            rx="4"
            fill="#fff"
            stroke="#e5e7eb"
            strokeWidth="1"
          />
          <path
            d="M19.4 17.5c0-.6-.1-1.2-.2-1.8h-5.3v3.4h3.1c-.1.8-.6 1.4-1.2 1.9v1.5h2c1.1-1 1.6-2.5 1.6-5z"
            fill="#4285F4"
          />
          <path
            d="M13.9 22.5c1.5 0 2.8-.5 3.8-1.4l-2-1.5c-.5.4-1.1.6-1.8.6-1.4 0-2.6-.9-3-2.2h-2v1.5c1 2 3 3 5 3z"
            fill="#34A853"
          />
          <path
            d="M10.9 18c-.1-.4-.2-.8-.2-1.2s.1-.8.2-1.2v-1.5h-2c-.4.8-.6 1.7-.6 2.7s.2 1.9.6 2.7l2-1.5z"
            fill="#FBBC05"
          />
          <path
            d="M13.9 14.2c.8 0 1.5.3 2 .8l1.5-1.5c-1-.9-2.2-1.5-3.5-1.5-2 0-4 1.1-5 3l2 1.5c.4-1.3 1.6-2.3 3-2.3z"
            fill="#EA4335"
          />
          <text
            x="22"
            y="22"
            fontFamily="-apple-system, sans-serif"
            fontSize="10"
            fontWeight="500"
            fill="#3c4043"
          >
            Pay
          </text>
        </svg>
      );
    default:
      // For small size, return lucide icon; for medium, return gradient div
      if (size === "small") {
        return <CreditCard className="w-5 h-5 text-gray-700" />;
      }
      return (
        <div
          style={{
            width: dimensions.width,
            height: dimensions.height,
            background: "linear-gradient(to right, #3b82f6, #a855f7)",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: "10px",
            fontWeight: "bold",
          }}
        >
          💳
        </div>
      );
  }
}
