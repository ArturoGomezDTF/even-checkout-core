# Comisiones por servicio

Even cobra una tarifa plana del **4 %** sobre consumo + propina (más 16 % de IVA sobre la comisión). Lo que cambia por servicio es **quién la paga**.

| Servicio | `service` | Restaurante | Cliente | ¿El cliente ve comisión? |
|---|---|---|---|---|
| Pick & Go | `pick-and-go` | 2 % | 2 % | Sí, como línea aparte ("Comisión de servicio") |
| Room Service | `room-service` | 2 % | 2 % | Sí, como línea aparte |
| Tap Order & Pay | `tap-order-and-pay` | 4 % | 0 % | No |
| FlexBill | `flex-bill` | 4 % | 0 % | No |
| Tap & Pay | `tap-and-pay` | 4 % | 0 % | No |

Un servicio que no está en la tabla (o sin `service`) usa el reparto por defecto 2 % / 2 %.

## Dónde vive la lógica

- **even-backend es la autoridad**: `src/utils/commissionCalculator.js` (`SERVICE_COMMISSION_RATES`). Recalcula todo desde el carrito/orden al cobrar.
- **`@even/payments`** (`packages/payments/src/commissions.ts`) es el espejo para *preview* en pantalla: `SERVICE_COMMISSION_RATES`, `getCommissionRates(amount, service)` y `calculateCommissions(base, tip, service)`. Acepta los mismos alias que el backend (`tap-order-pay`, `flexbill`, `tap_pay`...).
- **Cada app** fija su servicio en `commissionCalculator.ts` (`COMMISSION_SERVICE`) y re-exporta `getCommissionRates` y `calculateCommissions` ya ligados a él, así que los callers no pasan `service`. Las funciones por ítem (`getItemCommissionRate`, `getItemDisplayPrice`, etc.) derivan su tarifa de esa misma tabla.

| App | Archivo |
|---|---|
| Pick & Go | `apps/pick-and-go/src/utils/commissionCalculator.ts` |
| Room Service | `apps/room-service/src/utils/commissionCalculator.ts` |
| Tap Order & Pay | `apps/tap-order-pay/src/utils/commissionCalculator.ts` |
| Tap & Pay | `apps/tap-and-pay/src/app/utils/commissionCalculator.ts` |
| FlexBill | `apps/flexbill/app/utils/commissionCalculator.ts` |

## Cómo se calcula

```
subtotal          = base + propina
comisión cliente  = subtotal × clientPays%        IVA = × 16 %
comisión restaur. = subtotal × restaurantPays%    IVA = × 16 %
total cobrado     = base + propina + (comisión cliente + IVA)   // redondeo solo al final
```

Ejemplo, consumo $100 + propina $10:

| Servicio | Cliente paga | Restaurante paga |
|---|---|---|
| Pick & Go / Room Service | $112.55 (comisión $2.20 + IVA $0.35) | $2.55 |
| Tap Order & Pay / FlexBill / Tap & Pay | $110.00 | $5.10 (4 % + IVA) |

## Reglas que no deben romperse

1. El `price` real de platillos y carrito **nunca se infla** ni se manda inflado al backend. Con 0 % cliente, `getItemDisplayPrice` devuelve el precio real.
2. Al backend viaja `baseAmount` y `tipAmount` reales; la comisión se calcula aparte. Mandar un monto inflado contaría la comisión dos veces.
3. Al POS (PoloTab y demás) viaja base + propina, nunca la comisión.
4. Subtotal + propina mostrados deben sumar siempre el total.
5. Las llamadas de pago que lo admiten (`service` en `ProcessPaymentRequest` y en las órdenes de Apple/Google Pay) mandan el servicio para que el backend aplique la misma tarifa.
6. Cambiar una tarifa exige cambiarla **en el backend y en `SERVICE_COMMISSION_RATES`** en el mismo ciclo, con su test.

## Cambios respecto al esquema anterior

El monorepo tenía 2 % / 2 % para todos. Ahora Tap Order & Pay, FlexBill y Tap & Pay pasan a 0 % cliente / 4 % restaurante (ya vigente en even-backend desde #561 y #587); Pick & Go y Room Service se mantienen en 2 % / 2 %.
