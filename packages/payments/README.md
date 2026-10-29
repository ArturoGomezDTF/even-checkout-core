# @even/payments

Lógica de pago compartida, extraída de Tap Order & Pay y Room Service. TypeScript puro, sin React: el transporte HTTP y el storage se inyectan.

```ts
import { createApiClient } from "@even/api-client";
import { createPaymentService, chargeSavedCard, paymentIntentStore, pollConfirm } from "@even/payments";

const request = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL,
  refreshToken: () => authService.handleTokenRefresh(),
});
const paymentService = createPaymentService(request);

const outcome = await chargeSavedCard({
  service: paymentService,
  store: paymentIntentStore,
  fingerprintInput: { items, tipAmount, discountId, total },
  request: { paymentMethodId, amount, currency: "MXN", description, orderId, tableNumber, restaurantId },
  onVerifying: () => setVerifying(true),
});

if (outcome.status === "charged") {
  const confirmed = await pollConfirm(() => tapOrderService.confirmOrder({ ...body, ecartpay_order_id: outcome.ecartpayOrderId }));
}
// "retryable": no se cobró, se puede reintentar. "unconfirmed": NUNCA ofrecer recobrar.
```

| Módulo | Qué contiene |
| --- | --- |
| `payment-service.ts` | Endpoints de `/payment-methods` y `/payments` (tarjetas, cobro, MSI, Apple/Google Pay, estado de intent). |
| `idempotency.ts` | `intentKey` + fingerprint del carrito en sessionStorage (regla de oro: nunca recobrar el mismo carrito con otra clave). |
| `charge.ts` | `chargeSavedCard`: cobro con tarjeta guardada y clasificación de los códigos del backend. |
| `polling.ts` | `waitForChargedIntent` y `pollConfirm` (409 `confirm_in_progress`). |
| `wallet.ts` | `isDefinitiveWalletRejection` para ocultar Apple/Google Pay solo ante rechazos 4xx definitivos. |
| `ecartpay.ts` | Tipos del SDK de EcartPay, carga y normalización del resultado de `Pay.Checkout.create`. |

Pendiente (siguiente PR): hooks/componentes de React (`useEcartPay`, `PaymentContext`, `CardScanner`) y adoptar el paquete en las apps.
