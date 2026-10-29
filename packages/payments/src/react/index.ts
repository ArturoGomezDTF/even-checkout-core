// Hooks y componentes de React. Se importan desde "@even/payments/react" para
// que el núcleo ("@even/payments") siga sin depender de React.
export { useEcartPay } from "./useEcartPay";
export {
  GUEST_ID_STORAGE_KEY,
  PaymentProvider,
  extractPaymentMethods,
  useHasPaymentMethods,
  usePayment,
  type PaymentContextValue,
  type PaymentProviderProps,
} from "./PaymentContext";
export {
  CARD_SCANNER_MESSAGES,
  CardScanner,
  simulateCardScan,
  type CardScanFn,
  type CardScanResult,
  type CardScannerLabels,
  type CardScannerProps,
} from "./CardScanner";
