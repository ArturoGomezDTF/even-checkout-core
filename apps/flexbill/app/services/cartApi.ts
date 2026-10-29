// ===============================================
// CART API SERVICE
// ===============================================

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface CartItem {
  id: string; // cart_item_id
  menu_item_id: number;
  name: string;
  description: string;
  images: string[];
  features: string[];
  quantity: number;
  price: number;
  discount: number;
  extraPrice: number;
  specialInstructions?: string | null;
  customFields: Array<{
    fieldId: string;
    fieldName: string;
    selectedOptions: Array<{
      optionId: string;
      optionName: string;
      price: number;
      quantity?: number;
    }>;
  }>;
  subtotal: number;
  isPromoItem?: boolean;
  promoActivationId?: string | null;
  promoDiscountPercentage?: number | null;
  userDiscountId?: string | null;
}

export interface Cart {
  cart_id: string | null;
  items: CartItem[];
  total_items: number;
  total_amount: number;
  order_notes?: string | null;
}

export interface CartTotals {
  cart_id: string | null;
  total_items: number;
  total_amount: number;
}

class CartApiService {
  private supabaseUserId: string | null = null;
  private restaurantId: number | null = null;
  private branchNumber: number | null = null;

  /**
   * Establecer el supabase_user_id manualmente (llamar desde el componente con useAuth)
   */
  public setSupabaseUserId(userId: string | null) {
    this.supabaseUserId = userId;
  }

  /**
   * Establecer el restaurant_id manualmente (llamar desde el componente)
   */
  public setRestaurantId(restaurantId: number | null) {
    this.restaurantId = restaurantId;
  }

  /**
   * Establecer el branch_number manualmente (llamar desde el componente)
   */
  public setBranchNumber(branchNumber: number | null) {
    this.branchNumber = branchNumber;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<ApiResponse<T>> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options?.headers as Record<string, string>),
      };

      // Add authentication headers (similar to main apiService)
      const authToken = this.getAuthToken();
      if (authToken) {
        // For authenticated users, use Bearer token
        headers["Authorization"] = `Bearer ${authToken}`;
      } else {
        // For guests, add guest identification headers
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

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "API request failed");
      }

      return data;
    } catch (error) {
      console.error("Cart API Error:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Obtener guest_id desde GuestContext/localStorage
   * Solo lee el guest_id existente - NO genera uno nuevo
   * La generación se maneja exclusivamente en GuestContext después de que auth cargue
   */
  private getGuestId(): string {
    if (typeof window === "undefined") return "";

    // Solo leer del localStorage - NO generar nuevo ID
    return localStorage.getItem("even-guest-id") || "";
  }

  /**
   * Obtener el token de autenticación desde localStorage
   */
  private getAuthToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("even_access_token");
  }

  /**
   * Obtener número de mesa desde localStorage
   */
  private getTableNumber(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("even-table-number");
  }

  /**
   * Obtener identificador de usuario (user_id o guest_id)
   * Prioriza user_id si existe
   */
  private getUserIdentifier(): { user_id?: string; guest_id?: string } {
    // Primero intentar usar el supabaseUserId establecido manualmente
    if (this.supabaseUserId) {
      return { user_id: this.supabaseUserId };
    }

    // Si no hay usuario autenticado, usar guest_id
    return { guest_id: this.getGuestId() };
  }

  /**
   * Agregar item al carrito
   */
  async addToCart(
    menuItemId: number,
    quantity: number = 1,
    customFields: CartItem["customFields"] = [],
    extraPrice: number = 0,
    price?: number,
    specialInstructions?: string | null,
    userDiscountId?: string | null,
  ): Promise<ApiResponse<{ cart_item_id: string }>> {
    const userId = this.getUserIdentifier();

    return this.request<{ cart_item_id: string }>("/cart", {
      method: "POST",
      body: JSON.stringify({
        ...userId,
        menu_item_id: menuItemId,
        quantity,
        custom_fields: customFields,
        extra_price: extraPrice,
        price: price,
        special_instructions: specialInstructions || null,
        restaurant_id: this.restaurantId,
        branch_number: this.branchNumber,
        // Descuento de producto de main-portal — el backend valida
        // que sea del usuario/platillo y calcula el precio final él mismo.
        ...(userDiscountId ? { user_discount_id: userDiscountId } : {}),
      }),
    });
  }

  // Editar opciones, notas y cantidad de un item
  async updateCartItem(
    cartItemId: string,
    menuItemId: number,
    quantity: number,
    customFields: CartItem["customFields"] = [],
    extraPrice: number = 0,
    price: number,
    specialInstructions?: string | null,
  ): Promise<ApiResponse<{ cart_item_id: string }>> {
    return this.request<{ cart_item_id: string }>(
      `/cart/items/${cartItemId}`,
      {
        method: "PUT",
        body: JSON.stringify({
          ...this.getUserIdentifier(),
          menu_item_id: menuItemId,
          quantity,
          custom_fields: customFields,
          extra_price: extraPrice,
          price,
          restaurant_id: this.restaurantId,
          branch_number: this.branchNumber,
          special_instructions: specialInstructions || null,
        }),
      },
    );
  }

  async updateOrderNotes(
    orderNotes: string | null,
  ): Promise<ApiResponse<{ message: string }>> {
    const userId = this.getUserIdentifier();

    return this.request<{ message: string }>("/cart/notes", {
      method: "PATCH",
      body: JSON.stringify({
        ...userId,
        order_notes: orderNotes || null,
        restaurant_id: this.restaurantId,
        branch_number: this.branchNumber,
      }),
    });
  }

  /**
   * Obtener carrito completo
   */
  async getCart(): Promise<ApiResponse<Cart>> {
    const userId = this.getUserIdentifier();
    const params = new URLSearchParams(userId as Record<string, string>);

    if (this.restaurantId) {
      params.append("restaurant_id", this.restaurantId.toString());
    }

    if (this.branchNumber) {
      params.append("branch_number", this.branchNumber.toString());
    }

    return this.request<Cart>(`/cart?${params.toString()}`);
  }

  /**
   * Obtener solo totales del carrito (más rápido)
   */
  async getCartTotals(): Promise<ApiResponse<CartTotals>> {
    const userId = this.getUserIdentifier();
    const params = new URLSearchParams(userId as Record<string, string>);

    if (this.restaurantId) {
      params.append("restaurant_id", this.restaurantId.toString());
    }

    if (this.branchNumber) {
      params.append("branch_number", this.branchNumber.toString());
    }

    return this.request<CartTotals>(`/cart/totals?${params.toString()}`);
  }

  /**
   * Actualizar cantidad de un item
   */
  async updateCartItemQuantity(
    cartItemId: string,
    quantity: number,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/cart/items/${cartItemId}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    });
  }

  /**
   * Eliminar item del carrito
   */
  async removeFromCart(
    cartItemId: string,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/cart/items/${cartItemId}`, {
      method: "DELETE",
    });
  }

  /**
   * Limpiar todo el carrito
   */
  async clearCart(): Promise<ApiResponse<{ message: string }>> {
    const userId = this.getUserIdentifier();

    return this.request<{ message: string }>("/cart", {
      method: "DELETE",
      body: JSON.stringify({
        ...userId,
        restaurant_id: this.restaurantId,
        branch_number: this.branchNumber,
      }),
    });
  }

  /**
   * Obtener el guest_id actual
   */
  getGuestIdForUser(): string {
    return this.getGuestId();
  }
}

export const cartApi = new CartApiService();
