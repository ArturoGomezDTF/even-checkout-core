import type { PaymentMethod } from "@even/payments";

export const visaCard: PaymentMethod = {
  id: "pm_visa_4242",
  lastFourDigits: "4242",
  cardBrand: "visa",
  cardType: "credit",
  expiryMonth: 12,
  expiryYear: 2030,
  cardholderName: "Ana López",
  isDefault: true,
  createdAt: "2026-01-15T18:00:00.000Z",
};

export const mastercardCard: PaymentMethod = {
  id: "pm_mc_5454",
  lastFourDigits: "5454",
  cardBrand: "mastercard",
  cardType: "debit",
  expiryMonth: 6,
  expiryYear: 2029,
  cardholderName: "Ana López",
  isDefault: false,
  createdAt: "2026-03-02T18:00:00.000Z",
};
