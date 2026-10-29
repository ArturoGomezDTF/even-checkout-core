import type { ApiResponse, Requester } from "./types";

export const AUTH_TOKEN_STORAGE_KEY = "even_access_token";
export const GUEST_ID_STORAGE_KEY = "even-guest-id";

export interface ApiClientConfig {
  /** URL base de even-backend (normalmente `process.env.NEXT_PUBLIC_API_URL`). */
  baseUrl: string | undefined;
  getAuthToken?: () => string | null;
  getGuestId?: () => string | null;
  /**
   * Se llama al recibir un 401 con token. Devuelve el token nuevo o null si el
   * refresh falló. Cada app conecta aquí su `authService.handleTokenRefresh`.
   */
  refreshToken?: () => Promise<string | null>;
  fetch?: typeof fetch;
}

function readLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const readAuthTokenFromStorage = () =>
  readLocalStorage(AUTH_TOKEN_STORAGE_KEY);
export const readGuestIdFromStorage = () =>
  readLocalStorage(GUEST_ID_STORAGE_KEY);

/**
 * Crea el helper de peticiones contra even-backend con manejo automático de
 * refresh token: cuando recibe un 401, intenta refrescar el token y reintenta
 * la petición una vez.
 */
export function createApiClient(config: ApiClientConfig): Requester {
  const getAuthToken = config.getAuthToken ?? readAuthTokenFromStorage;
  const getGuestId = config.getGuestId ?? readGuestIdFromStorage;

  return async function request<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<ApiResponse<T>> {
    const doFetch = config.fetch ?? globalThis.fetch;
    const url = `${config.baseUrl}${endpoint}`;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options?.headers as Record<string, string>),
      };

      const authToken = getAuthToken();
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      } else {
        // Sin token de auth, se identifica al invitado.
        const guestId = getGuestId();
        if (guestId) {
          headers["x-guest-id"] = guestId;
        }
      }

      let response = await doFetch(url, { ...options, headers });

      if (response.status === 401 && authToken) {
        const newToken = config.refreshToken
          ? await config.refreshToken()
          : null;

        if (!newToken) {
          return {
            success: false,
            error: {
              message: "Sesión expirada. Por favor inicia sesión nuevamente.",
            },
          };
        }

        headers["Authorization"] = `Bearer ${newToken}`;
        response = await doFetch(url, { ...options, headers });
      }

      const data = await response.json();

      if (!response.ok) {
        // El backend responde en dos formatos distintos según el sitio:
        //   - Rutas migradas a AppError: `error` es un STRING y el código
        //     semántico viaja aparte en `code` (nivel raíz).
        //   - Rutas viejas sin migrar: `error` ya es un objeto
        //     `{type, message, ...}` con el código adentro de `type`.
        // Se normaliza a un solo objeto para que el caller siempre pueda leer
        // `.error?.message` y `.error?.code` sin importar el formato.
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
          status: response.status,
        };
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
  };
}
