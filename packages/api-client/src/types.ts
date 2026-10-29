/** Forma común de las respuestas de even-backend. */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    type?: string;
    code?: string;
    message?: string;
    details?: unknown;
  };
  // Código semántico estable (p.ej. "payment_in_progress",
  // "intent_mismatch") que emite el manejador central de errores del
  // backend en su nivel raíz (`errorHandler.js`), NO adentro de `error`.
  // Se repite también en `error.code` para el código legado que ya lee
  // `error.type`/`error.message` como objeto.
  code?: string;
  // true cuando /payments devolvió el mismo cobro de un intento anterior en
  // vez de cobrar de nuevo.
  replayed?: boolean;
  // Estatus HTTP de la respuesta, solo cuando el backend respondió con error.
  // Permite distinguir un rechazo definitivo (4xx) de un fallo pasajero (5xx).
  status?: number;
}

/** Función de transporte que consumen los servicios (`@even/payments`, ...). */
export type Requester = <T>(
  endpoint: string,
  options?: RequestInit,
) => Promise<ApiResponse<T>>;
