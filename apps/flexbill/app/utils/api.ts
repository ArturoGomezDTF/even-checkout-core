// API configuration and helper functions for Even frontend

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export interface PaymentMethod {
  id: string;
  lastFourDigits: string;
  cardType: string;
  cardBrand: string;
  expiryMonth: number;
  expiryYear: number;
  cardholderName: string;
  isDefault: boolean;
  createdAt: string;
  isSystemCard?: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    type?: string;
    code?: string;
    message?: string;
    details?: any;
  };
  // Código semántico estable (p.ej. "payment_in_progress",
  // "intent_mismatch") que emite el manejador central de errores del
  // backend en su nivel raíz (even-backend/src/middleware/errorHandler.js).
  code?: string;
}

export interface AddPaymentMethodRequest {
  fullName: string;
  cardNumber: string;
  expDate: string;
  cvv: string;
}

class ApiService {
  private baseURL: string;
  private authToken?: string;
  private isHandlingAuthFailure: boolean = false;

  constructor() {
    this.baseURL = API_BASE_URL;
    // Restore auth token from localStorage on initialization
    this.restoreAuthToken();
  }

  // Restore auth token from localStorage
  private restoreAuthToken() {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("even_access_token");
      if (token) {
        this.authToken = token;
        // Mark that user was authenticated
        sessionStorage.setItem("was_authenticated", "true");
      }
    }
  }

  // Set authentication token for authenticated users
  setAuthToken(token: string) {
    this.authToken = token;
    // Persist token to localStorage to ensure it's available across page loads
    if (typeof window !== "undefined") {
      localStorage.setItem("even_access_token", token);
      // Mark that user was authenticated to handle session expiry properly
      sessionStorage.setItem("was_authenticated", "true");
    }
  }

  // Clear authentication token
  clearAuthToken() {
    this.authToken = undefined;
    // Remove token from localStorage
    if (typeof window !== "undefined") {
      localStorage.removeItem("even_access_token");
      sessionStorage.removeItem("was_authenticated");
    }
  }

  private async makeRequest<T = any>(
    endpoint: string,
    options: RequestInit = {},
    authToken?: string,
    isRetry: boolean = false,
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.baseURL}${endpoint}`;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
      };

      // Ensure auth token is loaded from localStorage if not already set
      if (!this.authToken && typeof window !== "undefined") {
        const storedToken = localStorage.getItem("even_access_token");
        if (storedToken) {
          this.authToken = storedToken;
          // Mark that user was authenticated
          sessionStorage.setItem("was_authenticated", "true");
        }
      }

      // Add authentication token for authenticated users
      const tokenToUse = authToken || this.authToken;

      if (tokenToUse) {
        // For registered users, use auth token and skip guest headers
        headers["Authorization"] = `Bearer ${tokenToUse}`;
      } else {
        // For guests only, add guest identification headers
        const guestId = this.getGuestId();
        if (guestId) {
          headers["x-guest-id"] = guestId;
        }

        // Add table number if available
        const tableNumber = this.getTableNumber();
        if (tableNumber) {
          headers["x-table-number"] = tableNumber;
        }
      }

      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      // Handle 401 Unauthorized - Token expired
      if (
        response.status === 401 &&
        !isRetry &&
        typeof window !== "undefined"
      ) {
        const refreshToken = localStorage.getItem("even_refresh_token");
        if (refreshToken) {
          try {
            // Attempt to refresh the token
            const refreshResponse = await fetch(
              `${this.baseURL}/auth/refresh`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ refresh_token: refreshToken }),
              },
            );

            const refreshData = await refreshResponse.json();

            if (
              refreshResponse.ok &&
              refreshData.success &&
              refreshData.data?.session?.access_token
            ) {
              // Store new tokens
              const newAccessToken = refreshData.data.session.access_token;
              const newRefreshToken = refreshData.data.session.refresh_token;

              localStorage.setItem("even_access_token", newAccessToken);
              localStorage.setItem("even_refresh_token", newRefreshToken);
              this.authToken = newAccessToken;

              // Retry the original request with the new token
              return this.makeRequest<T>(
                endpoint,
                options,
                newAccessToken,
                true,
              );
            } else {
              this.handleAuthFailure();
            }
          } catch (refreshError) {
            console.error("❌ Error refreshing token:", refreshError);
            this.handleAuthFailure();
          }
        } else {
          this.handleAuthFailure();
        }
      }

      if (!response.ok) {
        // El backend responde en dos formatos distintos según el sitio (ver
        // even-backend/src/middleware/errorHandler.js):
        //   - Rutas migradas a AppError: `data.error` es un STRING y el
        //     código semántico viaja aparte en `data.code`.
        //   - Rutas viejas sin migrar: `data.error` ya es un objeto
        //     `{type, message, ...}` con el código adentro de `type`.
        // Antes esto solo miraba `data.error?.message` (asumiendo el
        // segundo formato) y perdía `code` por completo.
        const rawError = data?.error;
        const message =
          (typeof rawError === "object" ? rawError?.message : rawError) ||
          data?.message ||
          `HTTP Error: ${response.status}`;

        return {
          success: false,
          error: {
            type: typeof rawError === "object" ? rawError?.type : "http_error",
            code: data?.code,
            message,
            details: data,
          },
          code: data?.code,
        };
      }

      return {
        success: true,
        data: data,
      };
    } catch (error) {
      console.error("API Request failed:", error);

      return {
        success: false,
        error: {
          type: "network_error",
          message:
            error instanceof Error ? error.message : "Network error occurred",
          details: error,
        },
      };
    }
  }

  // Handle authentication failure - clear tokens and reload
  private handleAuthFailure() {
    // Prevent multiple simultaneous auth failure handling
    if (this.isHandlingAuthFailure) {
      return;
    }

    if (typeof window !== "undefined") {
      this.isHandlingAuthFailure = true;

      // Clear all auth data
      localStorage.removeItem("even_access_token");
      localStorage.removeItem("even_refresh_token");
      localStorage.removeItem("even_user");
      localStorage.removeItem("even_expires_at");
      this.authToken = undefined;

      // Dispatch a custom event to notify AuthContext
      window.dispatchEvent(new CustomEvent("auth:session-expired"));

      // Only reload if we had auth tokens before (user was logged in)
      // This prevents infinite reload loops for unauthenticated users
      const wasAuthenticated =
        sessionStorage.getItem("was_authenticated") === "true";

      if (wasAuthenticated) {
        sessionStorage.removeItem("was_authenticated");
        window.location.reload();
      } else {
        this.isHandlingAuthFailure = false;
      }
    }
  }

  // Generic request method for external use
  async request<T = any>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(endpoint, options);
  }

  // Payment Methods API
  async addPaymentMethod(
    paymentData: AddPaymentMethodRequest,
  ): Promise<ApiResponse<{ paymentMethod: PaymentMethod }>> {
    return this.makeRequest("/payment-methods", {
      method: "POST",
      body: JSON.stringify(paymentData),
    });
  }

  async getPaymentMethods(): Promise<
    ApiResponse<{ paymentMethods: PaymentMethod[] }>
  > {
    return this.makeRequest("/payment-methods");
  }

  async deletePaymentMethod(
    paymentMethodId: string,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.makeRequest(`/payment-methods/${paymentMethodId}`, {
      method: "DELETE",
    });
  }

  async setDefaultPaymentMethod(
    paymentMethodId: string,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.makeRequest(`/payment-methods/${paymentMethodId}/default`, {
      method: "PUT",
    });
  }

  async migrateGuestPaymentMethods(
    guestId: string,
  ): Promise<ApiResponse<{ migratedCount: number }>> {
    return this.makeRequest("/payment-methods/migrate-from-guest", {
      method: "POST",
      body: JSON.stringify({ guestId }),
    });
  }

  // Payment Processing API
  async processPayment(paymentData: {
    paymentMethodId: string;
    amount: number;
    currency?: string;
    description?: string;
    orderId?: string;
    tableNumber?: string;
    restaurantId?: string;
    // Ticket #85/#96: idempotencia de cobro. Ambos opcionales — sin ellos,
    // /payments se comporta exactamente igual que antes.
    intentKey?: string;
    fingerprint?: string;
  }): Promise<ApiResponse<any>> {
    return this.makeRequest("/payments", {
      method: "POST",
      body: JSON.stringify(paymentData),
    });
  }

  // Consulta el estado de un intento de cobro — para el
  // polling de "Verificando tu pago…" en vez de reintentar /payments.
  // Respuesta plana (status/ecartpay_order_id/... al nivel raíz, no bajo
  // `data`), a diferencia del resto de este servicio.
  async getPaymentIntentStatus(intentKey: string): Promise<{
    success: boolean;
    status?: "charging" | "charged" | "failed" | "unknown" | "confirmed";
    ecartpay_order_id?: string | null;
    order_id?: string | null;
    amount?: number;
    currency?: string;
    updated_at?: string;
    code?: string;
  }> {
    return this.makeRequest(
      `/payments/intents/${encodeURIComponent(intentKey)}`,
    ) as unknown as Promise<{
      success: boolean;
      status?: "charging" | "charged" | "failed" | "unknown" | "confirmed";
      ecartpay_order_id?: string | null;
      order_id?: string | null;
      amount?: number;
      currency?: string;
      updated_at?: string;
      code?: string;
    }>;
  }

  async getPaymentHistory(): Promise<ApiResponse<any>> {
    return this.makeRequest("/payments/history");
  }

  // Payment Transaction Recording API
  async recordPaymentTransaction(transactionData: {
    payment_method_id: string | null;
    restaurant_id: number;
    id_table_order?: string | null;
    id_tap_orders_and_pay?: string | null;
    ecartpay_order_id?: string | null;
    payment_source?: string | null;
    // Usados por el backend para recalcular la comisión de Flex Bill desde
    // los dish_order reales — ver commissionCalculator.js.
    payment_type?: string;
    selected_item_ids?: string[];
    base_amount: number;
    tip_amount: number;
    iva_tip: number;
    even_commission_total: number;
    even_commission_client: number;
    even_commission_restaurant: number;
    iva_even_client: number;
    iva_even_restaurant: number;
    even_client_charge: number;
    even_restaurant_charge: number;
    even_rate_applied: number;
    total_amount_charged: number;
    subtotal_for_commission: number;
    currency?: string;
    transaction_by?: string;
  }): Promise<ApiResponse<any>> {
    return this.makeRequest("/payment-transactions", {
      method: "POST",
      body: JSON.stringify(transactionData),
    });
  }

  // Helper methods for guest identification
  private getGuestId(): string | null {
    // Only get existing guest ID from localStorage - DO NOT generate a new one
    // Guest ID generation is handled exclusively by GuestContext after auth loads
    if (typeof window !== "undefined") {
      return localStorage.getItem("even-guest-id");
    }
    return null;
  }

  private getTableNumber(): string | null {
    // Get table number from localStorage or context
    if (typeof window !== "undefined") {
      return localStorage.getItem("even-table-number");
    }
    return null;
  }

  private getRestaurantId(): string | null {
    // Get restaurant ID from localStorage
    if (typeof window !== "undefined") {
      return localStorage.getItem("even-restaurant-id");
    }
    return null;
  }

  // Method to explicitly set guest and table info (for better context integration)
  setGuestInfo(
    guestId?: string,
    tableNumber?: string,
    restaurantId?: string,
  ): void {
    if (typeof window !== "undefined") {
      if (guestId) {
        localStorage.setItem("even-guest-id", guestId);
      }
      if (tableNumber) {
        localStorage.setItem("even-table-number", tableNumber);
      }
      if (restaurantId) {
        localStorage.setItem("even-restaurant-id", restaurantId);
      }
    }
  }

  // Method to set table number (call this when user scans QR or selects table)
  setTableNumber(tableNumber: string): void {
    if (typeof window !== "undefined") {
      localStorage.setItem("even-table-number", tableNumber);
    }
  }

  // Method to set restaurant ID
  setRestaurantId(restaurantId: string): void {
    if (typeof window !== "undefined") {
      localStorage.setItem("even-restaurant-id", restaurantId);
    }
  }

  // Method to get current restaurant ID
  getCurrentRestaurantId(): string | null {
    return this.getRestaurantId();
  }

  // Method to clear guest session (guest-specific data only)
  clearGuestSession(): void {
    if (typeof window !== "undefined") {
      localStorage.removeItem("even-guest-id");
      // Note: Table number and restaurant ID are preserved for authenticated users
      // They are only cleared when user explicitly logs out
    }
  }

  // Method to clear all session data (for logout)
  clearAllSessionData(): void {
    if (typeof window !== "undefined") {
      localStorage.removeItem("even-guest-id");
      localStorage.removeItem("even-table-number");
      localStorage.removeItem("even-restaurant-id");
      localStorage.removeItem("even-guest-name");
    }
  }

  // ===============================================
  // TABLE API CALLS
  // ===============================================

  /**
   * Get table summary information
   */
  async getTableSummary(
    restaurantId: string,
    branchNumber: string,
    tableNumber: string,
  ): Promise<ApiResponse<any>> {
    return this.makeRequest(
      `/restaurants/${restaurantId}/branches/${branchNumber}/tables/${tableNumber}/summary`,
    );
  }

  /**
   * Get table orders
   */
  async getTableOrders(
    restaurantId: string,
    branchNumber: string,
    tableNumber: string,
  ): Promise<ApiResponse<any>> {
    return this.makeRequest(
      `/restaurants/${restaurantId}/branches/${branchNumber}/tables/${tableNumber}/orders`,
    );
  }

  /**
   * Get active users for a table
   */
  async getActiveUsers(
    restaurantId: string,
    branchNumber: string,
    tableNumber: string,
  ): Promise<ApiResponse<any>> {
    return this.makeRequest(
      `/restaurants/${restaurantId}/branches/${branchNumber}/tables/${tableNumber}/active-users`,
    );
  }

  /**
   * Get all tables for a restaurant
   */
  async getAllTables(restaurantId: string): Promise<ApiResponse<any>> {
    return this.makeRequest(`/restaurants/${restaurantId}/tables`);
  }

  /**
   * Check table availability
   */
  async checkTableAvailability(
    restaurantId: string,
    tableNumber: string,
  ): Promise<ApiResponse<any>> {
    return this.makeRequest(
      `/restaurants/${restaurantId}/tables/${tableNumber}/availability`,
    );
  }

  // ===============================================
  // ORDER API CALLS
  // ===============================================

  /**
   * Create a new dish order for a table
   */
  async createDishOrder(
    restaurantId: string,
    branchNumber: string,
    tableNumber: string,
    userId: string | null,
    guestName: string,
    item: string,
    quantity: number,
    price: number,
    guestId?: string | null,
    images: string[] = [],
    customFields?: Array<{
      fieldId: string;
      fieldName: string;
      selectedOptions: Array<{
        optionId: string;
        optionName: string;
        price: number;
      }>;
    }>,
    extraPrice?: number,
    menuItemId?: number | null,
  ): Promise<ApiResponse<any>> {
    return this.makeRequest(
      `/restaurants/${restaurantId}/branches/${branchNumber}/tables/${tableNumber}/dishes`,
      {
        method: "POST",
        body: JSON.stringify({
          userId,
          guestName,
          item,
          quantity,
          price,
          guestId,
          images,
          customFields,
          extraPrice,
          menuItemId,
        }),
      },
    );
  }

  /**
   * Update dish status (for kitchen)
   */
  async updateDishStatus(
    dishId: string,
    status: string,
  ): Promise<ApiResponse<any>> {
    return this.makeRequest(`/dishes/${dishId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
  }

  // ===============================================
  // PAYMENT API CALLS FOR TABLES
  // ===============================================

  /**
   * Pay for a specific dish order
   */
  async payDishOrder(
    dishId: string,
    paymentMethodId?: string | null,
  ): Promise<ApiResponse<any>> {
    return this.makeRequest(`/dishes/${dishId}/pay`, {
      method: "POST",
      body: JSON.stringify({ paymentMethodId }),
    });
  }

  /**
   * Pay a specific amount for a table
   */
  async payTableAmount(
    restaurantId: string,
    branchNumber: string,
    tableNumber: string,
    amount: number,
    userId?: string | null,
    guestName?: string | null,
    paymentMethodId?: string | null,
  ): Promise<ApiResponse<any>> {
    return this.makeRequest(
      `/restaurants/${restaurantId}/branches/${branchNumber}/tables/${tableNumber}/pay`,
      {
        method: "POST",
        body: JSON.stringify({
          amount,
          userId,
          guestName,
          paymentMethodId,
        }),
      },
    );
  }

  /**
   * Link guest orders to authenticated user
   */
  async linkGuestOrdersToUser(
    guestId: string,
    userId: string,
    tableNumber?: string,
    restaurantId?: string,
    userName?: string,
  ): Promise<ApiResponse<any>> {
    return this.makeRequest(`/orders/link-user`, {
      method: "PUT",
      body: JSON.stringify({
        guestId,
        userId,
        tableNumber,
        restaurantId,
        userName,
      }),
    });
  }

  /**
   * Get multiple users info (images, names, etc) from Clerk
   */
  async getUsersInfo(userIds: string[]): Promise<
    ApiResponse<
      Record<
        string,
        {
          imageUrl: string | null;
          firstName: string | null;
          lastName: string | null;
          fullName: string | null;
        }
      >
    >
  > {
    return this.makeRequest(`/users/info`, {
      method: "POST",
      body: JSON.stringify({
        userIds,
      }),
    });
  }

  /**
   * Historial de compras del usuario registrado. Va por `makeRequest` para
   * mandar `Authorization: Bearer <token de Supabase>` (even-backend#453 lo
   * exige y comprueba que el id del token sea `userId`) y para refrescar el
   * token si responde 401. `response.data` es el cuerpo completo del backend
   * (`{ success, data: [...] }`).
   */
  async getOrderHistory(
    userId: string,
  ): Promise<ApiResponse<{ success: boolean; data: any[] }>> {
    return this.makeRequest(`/users/${userId}/order-history`);
  }
}

export const apiService = new ApiService();

// Debug logging - check token after hydration
if (typeof window !== "undefined") {
  // Use setTimeout to ensure this runs after the constructor completes
  setTimeout(() => {}, 0);
}

// Utility functions for payment data validation
export const validateCardNumber = (cardNumber: string): boolean => {
  const cleaned = cardNumber.replace(/\s/g, "");

  // Basic Luhn algorithm validation
  let sum = 0;
  let shouldDouble = false;

  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned[i]);

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0 && cleaned.length >= 13 && cleaned.length <= 19;
};

export const getCardType = (cardNumber: string): string => {
  const cleaned = cardNumber.replace(/\s/g, "");

  const patterns = {
    visa: /^4[0-9]{12}(?:[0-9]{3})?$/,
    mastercard: /^5[1-5][0-9]{14}$/,
    amex: /^3[47][0-9]{13}$/,
    discover: /^6(?:011|5[0-9]{2})[0-9]{12}$/,
  };

  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(cleaned)) {
      return type;
    }
  }

  return "unknown";
};

export const formatCardNumber = (cardNumber: string): string => {
  const cleaned = cardNumber.replace(/\s/g, "");
  const groups = cleaned.match(/.{1,4}/g) || [];
  return groups.join(" ").substr(0, 19); // Max 16 digits + 3 spaces
};

export const formatExpiryDate = (value: string): string => {
  const cleaned = value.replace(/\D/g, "");
  if (cleaned.length >= 2) {
    return cleaned.substring(0, 2) + "/" + cleaned.substring(2, 4);
  }
  return cleaned;
};

export default apiService;
