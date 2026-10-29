# FlexBill

Dividir y pagar la cuenta de la mesa desde el celular. Migrada desde `LetsEven/even-flexbill`.

- Los pagos con tarjeta, Apple/Google Pay y el idempotency del cobro vienen de `@even/payments`;
  las peticiones, de `@even/api-client` (`app/services/request-helper.ts`).
- `app/services/payment.service.ts` conserva los endpoints de mesa propios de Flex Bill
  (`joinTable`, `payTableAmount`, `payDishOrder`, `recordPaymentTransaction`), que viajan con `x-table-session`.
- `app/components/CardScanner.tsx` sigue siendo el propio de FlexBill (captura el cuadro sin leer la tarjeta);
  el de `@even/payments/react` devuelve una tarjeta de prueba simulada y no se usa aquí.
- E2E: `npx turbo run e2e --filter=flexbill` (puerto 3104).
