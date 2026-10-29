import { createApiClient } from "@even/api-client";
import { authService } from "@/app/services/auth.service";

export type { ApiResponse } from "@even/api-client";

/**
 * Helper para hacer peticiones con manejo automático de refresh token.
 * Cuando recibe un 401, intenta refrescar el token y reintenta la petición.
 */
export const requestWithAuth = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL,
  refreshToken: () => authService.handleTokenRefresh(),
});
