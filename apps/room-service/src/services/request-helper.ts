import { authService } from "./auth.service";

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
  code?: string;
  replayed?: boolean;
}

/**
 * Helper para hacer peticiones con manejo automático de refresh token
 * Cuando recibe un 401, intenta refrescar el token y reintentar la petición
 */
export async function requestWithAuth<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string>),
    };

    // Obtener token de autenticación
    const authToken = getAuthToken();
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    } else {
      // Si no hay token de auth, intentar con guest ID
      const guestId = getGuestId();
      if (guestId) {
        headers["x-guest-id"] = guestId;
      }
    }

    // Primera petición
    let response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // Si recibimos 401 y tenemos auth token, intentar refresh
    if (response.status === 401 && authToken) {
      const newToken = await authService.handleTokenRefresh();

      if (newToken) {
        // Actualizar header con nuevo token
        headers["Authorization"] = `Bearer ${newToken}`;

        // Reintentar petición con nuevo token
        response = await fetch(`${API_BASE_URL}${endpoint}`, {
          ...options,
          headers,
        });
      } else {
        // Refresh falló, retornar error
        return {
          success: false,
          error: {
            message: "Sesión expirada. Por favor inicia sesión nuevamente.",
          },
        };
      }
    }

    const data = await response.json();

    if (!response.ok) {
      const rawError = data?.error;
      const normalizedError =
        rawError && typeof rawError === "object"
          ? { code: data?.code, ...rawError }
          : {
              message: rawError ?? data?.message ?? "API request failed",
              code: data?.code,
            };

      return {
        success: false,
        error: normalizedError,
        code: data?.code,
        message: data?.message,
      } as ApiResponse<T>;
    }

    return data;
  } catch (error) {
    console.error("Request error:", error);
    return {
      success: false,
      error: {
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
    };
  }
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("even_access_token");
}

function getGuestId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("even-guest-id") || "";
}
