import { JSX } from "react";
import {
  Mastercard,
  Visa,
  Amex,
  Discover,
} from "react-payment-logos/dist/logo";
import { CreditCard } from "lucide-react";

export function getCardTypeIcon(
  cardType: string | undefined | null,
  size: "small" | "medium" = "medium",
  customWidth?: number,
  customHeight?: number
): JSX.Element {
  const type = cardType?.toLowerCase() || "unknown";

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
