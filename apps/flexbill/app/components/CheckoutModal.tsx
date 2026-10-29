"use client";

import { useState } from "react";
import { useTable } from "../context/TableContext";

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  tipAmount: number;
  baseAmount: number;
  selectedUsers: string[];
  onSuccess: (paymentId: string) => void;
  onError: (error: string) => void;
}

export default function CheckoutModal({
  isOpen,
  onClose,
  amount,
  tipAmount,
  baseAmount,
  selectedUsers,
  onSuccess,
  onError,
}: CheckoutModalProps) {
  const { state } = useTable();
  const [isProcessing, setIsProcessing] = useState(false);

  // Form states
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expDate, setExpDate] = useState("");
  const [cvv, setCvv] = useState("");
  const [country, setCountry] = useState("Mexico");
  const [postalCode, setPostalCode] = useState("");

  // Load saved data if available
  useState(() => {
    if (typeof window !== "undefined") {
      const savedUserData = localStorage.getItem("even-guest-data");
      if (savedUserData) {
        try {
          const userData = JSON.parse(savedUserData);
          setFullName(`${userData.firstName} ${userData.lastName}`.trim());
          setEmail(userData.email || "");
        } catch (e) {
          console.error("Failed to load saved user data:", e);
        }
      }
    }
  });

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || "";
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length) {
      return parts.join(" ");
    } else {
      return v;
    }
  };

  const formatExpDate = (value: string) => {
    const v = value.replace(/\D/g, "");
    if (v.length >= 2) {
      return v.substring(0, 2) + "/" + v.substring(2, 4);
    }
    return v;
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value);
    setCardNumber(formatted);
  };

  const handleExpDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatExpDate(e.target.value);
    setExpDate(formatted);
  };

  const validateForm = () => {
    if (!fullName.trim()) return "Please enter your full name";
    if (!email.trim() || !email.includes("@"))
      return "Please enter a valid email address";
    if (!cardNumber.trim()) return "Please enter card number";
    if (!expDate.trim()) return "Please enter expiration date";
    if (!cvv.trim()) return "Please enter CVV";
    if (!postalCode.trim()) return "Please enter postal code";
    return null;
  };

  const handlePayment = async () => {
    const validationError = validateForm();
    if (validationError) {
      onError(validationError);
      return;
    }

    setIsProcessing(true);

    try {
      // Simulate payment processing with EcartPay-like behavior
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Save user data for future use
      const [firstName, ...lastNameParts] = fullName.trim().split(" ");
      const lastName = lastNameParts.join(" ") || "User";
      const userData = { firstName, lastName, email };
      localStorage.setItem("even-guest-data", JSON.stringify(userData));

      // Generate a mock payment ID
      const paymentId = `xqst_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store payment details
      localStorage.setItem(
        "even-completed-payment",
        JSON.stringify({
          paymentId,
          amount,
          tipAmount,
          baseAmount,
          selectedUsers,
          tableNumber: state.tableNumber,
          timestamp: Date.now(),
        }),
      );

      onSuccess(paymentId);
    } catch (error: any) {
      onError(error.message || "Payment processing failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const fillTestCard = () => {
    setFullName("Test User");
    setEmail("test@example.com");
    setCardNumber("4242 4242 4242 4242");
    setExpDate("12/25");
    setCvv("123");
    setCountry("Mexico");
    setPostalCode("76900");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-lg">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Complete Payment
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Payment Summary */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal:</span>
              <span className="text-gray-900">${baseAmount.toFixed(2)}</span>
            </div>
            {tipAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tip:</span>
                <span className="text-gray-900">${tipAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-base border-t border-gray-300 pt-2">
              <span className="text-gray-900">Total:</span>
              <span className="text-gray-900">${amount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 py-4">
          {/* Test Card Helper */}
          {process.env.NODE_ENV === "development" && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-800 font-medium text-sm">
                    Development Mode
                  </p>
                  <p className="text-blue-600 text-xs">Use test card data</p>
                </div>
                <button
                  onClick={fillTestCard}
                  className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                >
                  Fill Test
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {/* Name Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-even-grass focus:border-transparent"
              />
            </div>

            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-even-grass focus:border-transparent"
              />
            </div>

            {/* Card Number Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Card Number
              </label>
              <input
                type="text"
                value={cardNumber}
                onChange={handleCardNumberChange}
                placeholder="1234 5678 9012 3456"
                maxLength={19}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-even-grass focus:border-transparent"
              />
            </div>

            {/* Exp Date and CVV Row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Exp Date
                </label>
                <input
                  type="text"
                  value={expDate}
                  onChange={handleExpDateChange}
                  placeholder="MM/YY"
                  maxLength={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-even-grass focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CVV
                </label>
                <input
                  type="text"
                  value={cvv}
                  onChange={(e) =>
                    setCvv(e.target.value.replace(/\D/g, "").substring(0, 4))
                  }
                  placeholder="123"
                  maxLength={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-even-grass focus:border-transparent"
                />
              </div>
            </div>

            {/* Country and Postal Code Row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Country
                </label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-even-grass focus:border-transparent"
                >
                  <option value="Mexico">🇲🇽 Mexico</option>
                  <option value="USA">🇺🇸 USA</option>
                  <option value="Canada">🇨🇦 Canada</option>
                  <option value="UK">🇬🇧 UK</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Postal Code
                </label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="12345"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-even-grass focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 rounded-b-lg">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="flex-1 py-3 px-4 border border-gray-300 rounded-md text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handlePayment}
              disabled={isProcessing}
              className="flex-1 py-3 px-4 bg-even-grass text-even-evergreen rounded-md font-medium hover:bg-even-grass/80 transition-colors disabled:opacity-50"
            >
              {isProcessing ? "Processing..." : `Pay $${amount.toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
