const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface VerifyOTPResponse {
  success: boolean;
  message: string;
  data: {
    user: {
      id: string;
      phone: string;
      accountType: string;
    };
    profile: any;
    session: {
      access_token: string;
      refresh_token: string;
      expires_at: number;
    };
  };
  error?: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  /** HTTP status de la respuesta; ausente en errores de red */
  status?: number;
  data?: {
    user: {
      id: string;
      phone?: string;
      email?: string;
      accountType: string;
    };
    profile?: any;
    session: {
      access_token: string;
      refresh_token: string;
      expires_at: number;
    };
  };
  error?: string;
}

export interface ProfileData {
  firstName: string;
  lastName: string;
  birthDate?: string;
  gender?: "male" | "female" | "other";
  photoUrl?: string;
}

class AuthService {
  private isRefreshing = false;
  private refreshSubscribers: ((token: string) => void)[] = [];

  // Sucursal de registro. La inyecta RestaurantContext (igual que
  // cart.service.ts) para que `sendPhoneOTP` la mande.
  private restaurantId: number | null = null;
  private branchNumber: number | null = null;

  public setRestaurantId(restaurantId: number | null) {
    this.restaurantId = restaurantId;
  }

  public setBranchNumber(branchNumber: number | null) {
    this.branchNumber = branchNumber;
  }

  // Suscribir callbacks que se ejecutarán cuando el token se refresque
  private subscribeTokenRefresh(callback: (token: string) => void): void {
    this.refreshSubscribers.push(callback);
  }

  // Notificar a todos los suscriptores que el token fue refrescado
  private onRefreshed(token: string): void {
    this.refreshSubscribers.forEach((callback) => callback(token));
    this.refreshSubscribers = [];
  }

  // Manejar refresh del token cuando expira (llamado por servicios cuando reciben 401)
  async handleTokenRefresh(): Promise<string | null> {
    // Si ya hay un refresh en proceso, esperar a que termine
    if (this.isRefreshing) {
      return new Promise((resolve) => {
        this.subscribeTokenRefresh((token: string) => {
          resolve(token);
        });
      });
    }

    this.isRefreshing = true;

    try {
      const result = await this.refreshToken();

      if (result.success && result.data?.session?.access_token) {
        const newToken = result.data.session.access_token;
        this.onRefreshed(newToken);
        this.isRefreshing = false;
        return newToken;
      } else if (result.status === 401) {
        // El servidor rechazó el refresh token (inválido/revocado) — única
        // situación en la que se limpia la sesión local
        console.warn(
          "⚠️ Token refresh rejected by server, clearing local session",
        );
        this.isRefreshing = false;
        this.onRefreshed("");
        this.clearAuthToken();
        this.clearAllSessionData();
        return null;
      } else {
        // Error de red o del servidor (5xx) — los tokens pueden seguir siendo
        // válidos, conservar la sesión y reintentar más tarde
        console.warn(
          "⚠️ Transient refresh failure, keeping session:",
          result.error,
        );
        this.isRefreshing = false;
        this.onRefreshed("");
        return null;
      }
    } catch (error) {
      console.error("❌ Unexpected error in handleTokenRefresh:", error);
      this.isRefreshing = false;
      this.onRefreshed("");
      return null;
    }
  }

  // Enviar código OTP al teléfono
  async sendPhoneOTP(phone: string): Promise<AuthResponse> {
    try {
      // Va en el send-otp porque es donde Supabase crea el usuario: el
      // backend la guarda como sucursal de registro. Sin ella el OTP se
      // envía igual.
      const response = await fetch(`${API_URL}/auth/customer/send-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone,
          restaurantId: this.restaurantId,
          branchNumber: this.branchNumber,
        }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error sending OTP:", error);
      return {
        success: false,
        error: "Error al enviar el código OTP",
      };
    }
  }

  // Verificar código OTP y hacer login
  async verifyPhoneOTP(phone: string, token: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_URL}/auth/customer/verify-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone, token }),
      });

      const data = await response.json();

      // Guardar token en localStorage
      if (data.success && data.data?.session?.access_token) {
        localStorage.setItem(
          "even_access_token",
          data.data.session.access_token,
        );
        localStorage.setItem(
          "even_refresh_token",
          data.data.session.refresh_token,
        );
        if (data.data.session.expires_at) {
          localStorage.setItem(
            "even_expires_at",
            data.data.session.expires_at.toString(),
          );
        }
        localStorage.setItem("even_user", JSON.stringify(data.data.user));
      }

      return data;
    } catch (error) {
      console.error("Error verifying OTP:", error);
      return {
        success: false,
        error: "Error al verificar el código OTP",
      };
    }
  }

  // Crear o actualizar perfil del usuario
  async createOrUpdateProfile(profileData: ProfileData): Promise<AuthResponse> {
    try {
      const token = this.getAccessToken();

      if (!token) {
        return {
          success: false,
          error: "No estás autenticado",
        };
      }

      const response = await fetch(`${API_URL}/profiles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(profileData),
      });

      const data = await response.json();

      if (response.ok) {
        return {
          success: true,
          data: data,
        };
      } else {
        return {
          success: false,
          error:
            data.error?.message ||
            data.message ||
            "Error al crear/actualizar el perfil",
        };
      }
    } catch (error) {
      console.error("Error creating/updating profile:", error);
      return {
        success: false,
        error: "Error al crear/actualizar el perfil",
      };
    }
  }

  // Obtener perfil del usuario autenticado
  async getMyProfile(): Promise<AuthResponse> {
    try {
      const token = this.getAccessToken();

      if (!token) {
        return {
          success: false,
          error: "No estás autenticado",
        };
      }

      let response = await fetch(`${API_URL}/profiles/me`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      // Si recibimos 401, intentar refrescar el token
      if (response.status === 401) {
        console.log("🔄 Token expired in getMyProfile, refreshing...");
        const newToken = await this.handleTokenRefresh();

        if (newToken) {
          // Reintentar con el nuevo token
          response = await fetch(`${API_URL}/profiles/me`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${newToken}`,
            },
          });
        } else {
          // handleTokenRefresh borra los tokens solo cuando el servidor
          // rechaza el refresh (401). Si ya no hay token, la sesión murió de
          // verdad → el llamador debe desloguear. Si sigue, fue error de red
          // transitorio y no hay que cerrar la sesión.
          return {
            success: false,
            error: this.getAccessToken()
              ? "Error al renovar la sesión"
              : "Sesión expirada",
          };
        }
      }

      const data = await response.json();

      if (response.ok) {
        return {
          success: true,
          data: data,
        };
      } else {
        return {
          success: false,
          error:
            data.error?.message || data.message || "Error al obtener el perfil",
        };
      }
    } catch (error) {
      console.error("Error getting profile:", error);
      return {
        success: false,
        error: "Error al obtener el perfil",
      };
    }
  }

  // Actualizar perfil del usuario autenticado
  async updateMyProfile(updates: Partial<ProfileData>): Promise<AuthResponse> {
    try {
      const token = this.getAccessToken();

      if (!token) {
        return {
          success: false,
          error: "No estás autenticado",
        };
      }

      const response = await fetch(`${API_URL}/profiles/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (response.ok) {
        return {
          success: true,
          data: data,
        };
      } else {
        return {
          success: false,
          error:
            data.error?.message ||
            data.message ||
            "Error al actualizar el perfil",
        };
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      return {
        success: false,
        error: "Error al actualizar el perfil",
      };
    }
  }

  // Logout
  async logout(): Promise<void> {
    try {
      const token = localStorage.getItem("even_access_token");

      if (token) {
        await fetch(`${API_URL}/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }

      // Limpiar localStorage
      localStorage.removeItem("even_access_token");
      localStorage.removeItem("even_refresh_token");
      localStorage.removeItem("even_user");
    } catch (error) {
      console.error("Error logging out:", error);
      // Limpiar localStorage de todos modos
      localStorage.removeItem("even_access_token");
      localStorage.removeItem("even_refresh_token");
      localStorage.removeItem("even_user");
    }
  }

  /**
   * Verify SMS OTP code
   */
  async verifyOTPCode(
    phone: string,
    token: string,
  ): Promise<VerifyOTPResponse> {
    try {
      const response = await fetch(`${API_URL}/auth/customer/verify-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone, token }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Código incorrecto. Inténtalo de nuevo.");
      }

      return data;
    } catch (error) {
      console.error("❌ Error in verifyOTPCode:", error);
      throw error;
    }
  }

  // Obtener usuario actual del localStorage
  getCurrentUser(): any | null {
    const userStr = localStorage.getItem("even_user");
    const accessToken = localStorage.getItem("even_access_token");

    if (userStr) {
      const user = JSON.parse(userStr);
      return {
        ...user,
        token: accessToken, // Include token for ApiService
      };
    }

    return null;
  }

  // Refrescar el access token
  async refreshToken(): Promise<AuthResponse> {
    try {
      const refreshToken = localStorage.getItem("even_refresh_token");

      if (!refreshToken) {
        return {
          success: false,
          error: "No hay refresh token",
        };
      }

      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      const data = await response.json();

      if (data.success && data.data?.session?.access_token) {
        localStorage.setItem(
          "even_access_token",
          data.data.session.access_token,
        );
        localStorage.setItem(
          "even_refresh_token",
          data.data.session.refresh_token,
        );
        if (data.data.session.expires_at) {
          localStorage.setItem(
            "even_expires_at",
            data.data.session.expires_at.toString(),
          );
        }
      }

      return { ...data, status: response.status };
    } catch (error) {
      console.error("Error refreshing token:", error);
      return {
        success: false,
        error: "Error al refrescar el token",
      };
    }
  }

  // Store session data in localStorage
  storeSession(session: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  }): void {
    localStorage.setItem("even_access_token", session.access_token);
    localStorage.setItem("even_refresh_token", session.refresh_token);
    localStorage.setItem("even_expires_at", session.expires_at.toString());
  }

  // Get access token from localStorage
  getAccessToken(): string | null {
    return localStorage.getItem("even_access_token");
  }

  // Get refresh token from localStorage
  getRefreshToken(): string | null {
    return localStorage.getItem("even_refresh_token");
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    const token = this.getAccessToken();
    const expiresAt = localStorage.getItem("even_expires_at");

    if (!token || !expiresAt) {
      return false;
    }

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    const expiration = parseInt(expiresAt);

    return now < expiration;
  }

  // Clear session data
  clearSession(): void {
    localStorage.removeItem("even_access_token");
    localStorage.removeItem("even_refresh_token");
    localStorage.removeItem("even_expires_at");
  }

  // Set authentication token (used by AuthContext)
  setAuthToken(token: string): void {
    localStorage.setItem("even_access_token", token);
  }

  // Clear authentication token
  clearAuthToken(): void {
    localStorage.removeItem("even_access_token");
  }

  // Clear all session data including room context
  clearAllSessionData(): void {
    this.clearSession();
    // Clear session storage
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("pendingRoomRedirect");
      sessionStorage.removeItem("authFromPaymentFlow");
      sessionStorage.removeItem("authFromMenu");
      sessionStorage.removeItem("pendingRestaurantId");
      // Clear localStorage guest data
      localStorage.removeItem("even-guest-id");
      localStorage.removeItem("even-room-number");
      localStorage.removeItem("even-restaurant-id");
    }
  }
}

export const authService = new AuthService();
