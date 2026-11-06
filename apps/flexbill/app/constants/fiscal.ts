// Constantes fiscales y de comisión — espejo de even-backend/src/config/fiscal.js.
//
// BACKEND = FUENTE DE VERDAD. Estos valores solo sirven para PREVIEW visual;
// el backend recalcula todo al crear la transacción. Si cambian en el backend
// (LetsEven/even-backend#335), actualízalos aquí también.

// IVA vigente en México (16%) como fracción.
export const IVA_RATE = 0.16;

// Factor para convertir comisión sin IVA a comisión con IVA (1 + IVA_RATE).
export const IVA_FACTOR = 1 + IVA_RATE;

// Tasa de comisión del restaurante usada como respaldo (4%) cuando no hay
// base sobre la cual calcular la tasa combinada.
export const DEFAULT_RESTAURANT_RATE = 0.04;

// El reparto cliente/restaurante vive en @even/payments (SERVICE_COMMISSION_RATES).
